import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
if(process.argv.length<5)throw new Error('Usage: node replay-complete-studies.mjs historical-core current-core output-directory');
const [old,core,out]=process.argv.slice(2).map(p=>path.resolve(p));fs.mkdirSync(out,{recursive:true});
const {runCib}=await import(pathToFileURL(path.join(core,'index.mjs')));
const {generator,matrix}=await import(pathToFileURL(path.join(old,'tests/reference.mjs')));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const canonical=xs=>xs.map(x=>JSON.stringify(Object.fromEntries(Object.entries(x).sort()))).sort();
const paired=read(path.join(old,'paired-policy-results.json')),sensitivity=read(path.join(old,'sensitivity-results.json'));
const datasets=paired.datasets.map(d=>({...d,id:'seed-'+d.seed,input:matrix(d.sizes,generator(d.seed))}));
const paper=read(path.join(old,'examples/oil-price.json'));let offset=0;const descriptors=paper.descriptors.map(([id,states])=>({id,states})),blocks=[];
for(const source of descriptors){let b=0;for(const target of descriptors){if(source===target)continue;blocks.push([source.id,target.id,paper.rows.slice(offset,offset+source.states.length).map(r=>r[b])]);b++;}offset+=source.states.length;}
datasets.push({id:'oil',input:{descriptors,blocks}});
const setCache=new Map(),baselines=[],rows=[];let solverCalls=0;
function run(input,fixed){const r=runCib(input,{fixed});assert.equal(r.status,'completed');solverCalls++;return r.scenarios.map(x=>x.configuration);}
function diff(before,after){const a=new Set(canonical(before)),b=new Set(canonical(after)),kept=[...a].filter(x=>b.has(x)).length;return {baseline:a.size,after:b.size,kept,added:b.size-kept,removed:a.size-kept,changed:a.size+b.size-2*kept>0,sameCountDifferentSets:a.size===b.size&&a.size+b.size-2*kept>0};}
for(const d of datasets){
 for(const condition of d.id==='oil'?['none']:['S0','S1']){
  const fixed=condition==='none'?{}:{D0:condition},configs=run(d.input,fixed);setCache.set(d.id+condition,configs);baselines.push({dataset:d.id,condition,fixed,configurations:configs});
 }
}
function changedInput(input,row){const x=structuredClone(input),[a,b]=[x.descriptors.find(d=>d.id===row.source),x.descriptors.find(d=>d.id===row.target)],block=x.blocks.find(([a,b])=>a===row.source&&b===row.target);const i=a.states.indexOf(row.sourceState),j=b.states.indexOf(row.targetState);assert.equal(block[2][i][j],row.previousScore);block[2][i][j]=row.score;return x;}
for(const [index,row]of paired.rows.entries()){
 const d=datasets.find(d=>d.seed===row.seed),input=changedInput(d.input,row),results={};
 for(const condition of ['S0','S1']){
  const configurations=run(input,{D0:condition}),metrics=diff(setCache.get(d.id+condition),configurations);assert.deepEqual(metrics,row[condition],`paired row ${index} ${condition}`);results[condition]={...metrics,configurations};
 }
 rows.push({index,dataset:d.id,change:Object.fromEntries(['source','sourceState','target','targetState','previousScore','score'].map(k=>[k,row[k]])),...results});
 if((index+1)%2000===0)console.log('Recomputed paired rows '+(index+1));
}
const oil=datasets.at(-1),oilRows=[];
for(const [index,row]of sensitivity.publishedOilPrice.rows.entries()){
 const configurations=run(changedInput(oil.input,row),{}),m=diff(setCache.get('oilnone'),configurations),union=m.kept+m.added+m.removed;
 for(const k of ['after','kept','added','removed'])assert.equal(m[k],row[k],`oil ${index} ${k}`);
 assert.equal(m.baseline,row.before);assert.equal(union?m.kept/union:1,row.jaccard);
 oilRows.push({index,change:Object.fromEntries(['source','sourceState','target','targetState','previousScore','score'].map(k=>[k,row[k]])),...m,configurations});
}
assert.equal(rows.length,8452);assert.equal(oilRows.length,404);
const summary={date:'2026-11-16',packageVersion:'0.1.0',pairedMatrices:80,pairedRows:rows.length,pairedOnlyS0:rows.filter(r=>r.S0.changed&&!r.S1.changed).length,pairedOnlyS1:rows.filter(r=>!r.S0.changed&&r.S1.changed).length,pairedBoth:rows.filter(r=>r.S0.changed&&r.S1.changed).length,pairedNeither:rows.filter(r=>!r.S0.changed&&!r.S1.changed).length,oilRows:oilRows.length,oilChanged:oilRows.filter(r=>r.changed).length,oilSameCountDifferent:oilRows.filter(r=>r.sameCountDifferentSets).length,baselineRuns:baselines.length,variantRuns:rows.length*2+oilRows.length,solverCalls,allStoredMetricsMatch:true,sourceHashes:Object.fromEntries(['paired-policy-results.json','sensitivity-results.json','examples/oil-price.json','tests/reference.mjs','index.mjs'].map(n=>[n,hash(path.join(old,n))])),currentCoreHash:hash(path.join(core,'index.mjs')),note:'Stored historical rows contain summary metrics, not all configuration identities. Full sets recomputed here and separately enumerated in Python; historical full-set identity cannot be inferred from old summary rows alone. No new independent policy samples.'};
fs.writeFileSync(path.join(out,'历史实验完整复算.json'),JSON.stringify({summary,datasets,baselines,pairedRows:rows,oilRows},null,2));
console.log(JSON.stringify(summary,null,2));
