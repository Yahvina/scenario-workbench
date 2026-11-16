import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
if(!process.argv[2]||!process.argv[3])throw new Error('Usage: node check-cib-package-scope.mjs core-directory output-directory');
const core=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
await fs.mkdir(out,{recursive:true});
const {runCib}=await import(pathToFileURL(path.join(core,'index.mjs')));
const {runPruned}=await import(pathToFileURL(path.join(core,'pruned.mjs')));
const {reference,matrix,generator}=await import(pathToFileURL(path.join(core,'tests/reference.mjs')));
const canonical=xs=>JSON.stringify(xs.map(x=>JSON.stringify(Object.entries(x).sort())).sort());
const random=generator(20261116),requests=[],records=[];
for(const sizes of [[2,2,2],[2,3,4],[3,3,3,3],[2,3,2,4,2],[2,2,2,2,2,2],[3,3,3,3,3,3]]){
 for(let sample=0;sample<12;sample++){
  const input=matrix(sizes,random);
  for(const mode of ['conditioned','locked'])for(const nfixed of [0,1,2]){
   if(nfixed===0&&mode==='locked')continue;
   const fixed=Object.fromEntries(input.descriptors.slice(0,nfixed).map((d,i)=>[d.id,d.states[(sample+i)%d.states.length]]));
   const options={mode,fixed},before=JSON.stringify(input),t=performance.now(),result=runCib(input,options),elapsed=performance.now()-t;
   const pruned=runPruned(input,options),expected=reference(input,fixed,mode);
   assert.equal(result.status,'completed');assert.equal(canonical(result.scenarios.map(x=>x.configuration)),canonical(expected));assert.equal(canonical(pruned.scenarios.map(x=>x.configuration)),canonical(expected));assert.equal(JSON.stringify(input),before);
   const id=`${sizes.join('x')}-${sample}-${mode}-${nfixed}`;
   requests.push({id,input,options,expectedConfigurations:expected});records.push({id,candidates:Number(result.candidateCount),count:result.count,coreMs:elapsed,completeSetsMatchReference:true,prunedMatches:true});
  }
 }
}
const boundaries=[];
function boundary(name,fn){fn();boundaries.push({name,passed:true});}
const base=matrix([2,3,2],random);
boundary('relevant-null-blocks',()=>{const x=structuredClone(base);x.blocks[0][2][0][0]=null;assert.equal(runCib(x).status,'missing-scores');});
boundary('given-incoming-null-exempt',()=>{const x=structuredClone(base);for(const [a,b,scores]of x.blocks)if(b==='D0')scores.forEach(r=>r.fill(null));assert.equal(runCib(x,{fixed:{D0:'S0'}}).status,'completed');assert.equal(runCib(x,{fixed:{D0:'S0'},mode:'locked'}).status,'missing-scores');});
boundary('non-selected-source-rows-irrelevant',()=>{const x=structuredClone(base);for(const [a,b,scores]of x.blocks)if(a==='D0')scores[1].fill(null);assert.equal(runCib(x,{fixed:{D0:'S0'}}).status,'completed');});
boundary('all-given-rejected',()=>assert.throws(()=>runCib(base,{fixed:{D0:'S0',D1:'S0',D2:'S0'}})));
boundary('ties-all-members',()=>{const x=matrix([2,3,4],random);x.blocks.forEach(b=>b[2].forEach(r=>r.fill(0)));assert.equal(runCib(x).count,24);});
boundary('exact-limit-100000-accepted',()=>{const x=matrix([10,10,10,10,10],random);assert.equal(runCib(x).status,'completed');assert.equal(runCib(x).checked,100000);});
boundary('fixed-state-reduces-overlimit-space',()=>{const x=matrix(Array(17).fill(2),random);assert.equal(runCib(x,{fixed:{D0:'S0'}}).checked,65536);});
const stress=[];
for(const size of [8,12,16,17]){
 const x=matrix(Array(size).fill(2),random),t=performance.now(),m0=process.memoryUsage();const result=runCib(x);const elapsed=performance.now()-t,m1=process.memoryUsage();
 assert.equal(result.status,size===17?'space-limit':'completed');
 stress.push({descriptors:size,statesEach:2,candidates:result.candidateCount,status:result.status,checked:result.checked,count:result.count,elapsedMs:elapsed,rssBefore:m0.rss,rssAfter:m1.rss,heapUsedBefore:m0.heapUsed,heapUsedAfter:m1.heapUsed});
}
await fs.writeFile(path.join(out,'扩展矩阵输入与期望.json'),JSON.stringify({seed:20261116,requests},null,2));
await fs.writeFile(path.join(out,'独立包扩展验证.json'),JSON.stringify({date:'2026-11-16',seed:20261116,node:process.version,groups:6,randomMatrices:72,comparisons:records.length,records,boundaries,stress,scope:'Synthetic seeded samples, not exhaustive above two descriptors. Timings single-process single runs include explanation objects; RSS snapshots are not peak memory or minimum hardware requirements. Pruned entry remains research-only. Platform generalized parity not tested by this script.'},null,2));
console.log(`PASS ${records.length} core/pruned/reference full-set comparisons, ${boundaries.length} boundaries, ${stress.length} resource/limit probes`);
