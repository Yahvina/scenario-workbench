import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
if(process.argv.length<6)throw new Error('Usage: node check-platform-extended.mjs platform-repo core-directory requests-file output-directory');
const [repo,core,inputPath,out]=process.argv.slice(2).map(p=>path.resolve(p));fs.mkdirSync(out,{recursive:true});
const {default:fixtures}=await import(pathToFileURL(path.join(repo,'tests/solver-browser-fixtures.cjs')));
const {prepareRun,solve}=await import(pathToFileURL(path.join(repo,'src/modules/solver/engine.mjs')));
const {validateProject}=await import(pathToFileURL(path.join(repo,'src/core/contracts.mjs')));
const {runCib}=await import(pathToFileURL(path.join(core,'index.mjs')));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const canonical=xs=>xs.map(x=>JSON.stringify(Object.entries(x).sort())).sort();
function projectOf(input,id){
 const p=fixtures.fixture();p.id=id;p.title='合成验证 '+id;p.revision=0;p.scope.regionId='research-fixture';
 const base={version:1,provenance:{origin:'fixture'}},sid=(d,s)=>d+'::'+s;
 p.data.descriptors=input.descriptors.map(d=>({...base,id:d.id,label:d.id,role:'input',stateIds:d.states.map(s=>sid(d.id,s)),evidenceRefs:[]}));
 p.data.states=input.descriptors.flatMap(d=>d.states.map(s=>({...base,id:sid(d.id,s),label:s,descriptorId:d.id,range:null,unit:null,scope:{regionId:p.scope.regionId},validYears:[2030,2035],evidenceRefs:[]})));
 p.data.judgments=input.blocks.map(([a,b,scores],i)=>({...base,id:'j'+i,sourceDescriptorId:a,targetDescriptorId:b,scope:{regionId:p.scope.regionId},validYears:[2030,2035],directness:'direct',curveEncoding:null,alternatives:[],rationale:'合成方法验证，不是关系实证依据',evidenceRefs:[],reviewStatus:'draft',entries:scores.flatMap((row,i)=>row.map((score,j)=>({sourceStateId:sid(a,input.descriptors.find(d=>d.id===a).states[i]),targetStateId:sid(b,input.descriptors.find(d=>d.id===b).states[j]),score})))}));
 p.selection={nodeIds:[],descriptorIds:input.descriptors.map(d=>d.id),stateIds:[],lockedStateIds:[]};validateProject(p);return p;
}
function prepared(input,options,id){const p=projectOf(input,id),fixed=Object.entries(options.fixed||{}).map(([d,s])=>d+'::'+s);if(options.mode==='locked')p.selection.lockedStateIds=fixed;const before=JSON.stringify(p);const result=prepareRun(p,{year:2030,selectedJudgmentIds:p.data.judgments.map(j=>j.id),assumptionAcknowledgements:{currentAssumptions:true,unknownStateScope:true},conditionedStateIds:options.mode==='locked'?[]:fixed,limit:options.limit??100000});assert.equal(JSON.stringify(p),before);return {p,result};}
const data=JSON.parse(fs.readFileSync(inputPath,'utf8')),rows=[];
for(const request of data.requests){const {result}=prepared(request.input,request.options,request.id);assert(result.input,JSON.stringify(result.diagnostics));const solved=solve(result.input,{displayLimit:0,keepLimit:100000});assert.equal(solved.status,'completed');const configurations=solved.all.map(c=>Object.fromEntries(Object.entries(c).map(([d,s])=>[d,s.slice(d.length+2)])));assert.deepEqual(canonical(configurations),canonical(request.expectedConfigurations),request.id);assert.equal(solved.count,configurations.length);rows.push({id:request.id,count:solved.count,checked:solved.checked,fullConfigurationsMatch:true,projectInputUnchanged:true,configurations});}
const base=data.requests[0].input,boundaries=[];
function check(name,run){run();boundaries.push({name,passed:true});}
check('relevant-null-blocked',()=>{const x=structuredClone(base);x.blocks[0][2][0][0]=null;assert.equal(prepared(x,{},'missing').result.input,null);});
check('given-target-null-exempt',()=>{const x=structuredClone(base);x.blocks.filter(b=>b[1]==='D0').forEach(b=>b[2].forEach(r=>r.fill(null)));assert(prepared(x,{fixed:{D0:'S0'}},'given-null').result.input);assert.equal(prepared(x,{fixed:{D0:'S0'},mode:'locked'},'locked-null').result.input,null);});
check('all-given-blocked',()=>assert.equal(prepared(base,{fixed:Object.fromEntries(base.descriptors.map(d=>[d.id,d.states[0]]))},'all-given').result.input,null));
check('ties-all-kept',()=>{const x=structuredClone(base);x.blocks.forEach(b=>b[2].forEach(r=>r.fill(0)));const r=solve(prepared(x,{},'ties').result.input,{displayLimit:0,keepLimit:100000});assert.equal(r.count,8);assert.equal(r.all.length,8);});
// Relevant source-row requirements differ between production prepareRun and core
// for ordinary locks; exercise this explicitly instead of silently dropping rows.
check('given-unselected-source-row-null-exempt',()=>{const x=structuredClone(base);x.blocks.filter(b=>b[0]==='D0').forEach(b=>b[2][1].fill(null));assert(prepared(x,{fixed:{D0:'S0'}},'given-source-null').result.input);});
check('ordinary-lock-missing-coverage-difference-explicit',()=>{const x=structuredClone(base);x.blocks.filter(b=>b[0]==='D0').forEach(b=>b[2][1].fill(null));const options={fixed:{D0:'S0'},mode:'locked'};assert.equal(runCib(x,options).status,'completed');assert.equal(prepared(x,options,'locked-source-null').result.input,null);});
check('declared-limit-blocks-before-solve',()=>{const p=prepared(base,{limit:7},'over-limit').result;assert.equal(p.input,null);assert(p.diagnostics.some(x=>x.code==='SPACE_LIMIT'));});
const samples=[];fs.mkdirSync(path.join(out,'浏览器代表项目'),{recursive:true});
for(let group=0;group<6;group++){const request=data.requests[group*60+(group%3===0?0:group%3===1?1:3)],{p}=prepared(request.input,request.options,'browser-'+group);const file='sample-'+group+'.json';fs.writeFileSync(path.join(out,'浏览器代表项目',file),JSON.stringify(p,null,2));samples.push({file,id:request.id,options:request.options,count:request.expectedConfigurations.length,configurations:request.expectedConfigurations.map(c=>Object.fromEntries(Object.entries(c).map(([d,s])=>[d,d+'::'+s])))});}
fs.writeFileSync(path.join(out,'浏览器代表项目/期望.json'),JSON.stringify(samples,null,2));
fs.writeFileSync(path.join(out,'平台360组完整对照.json'),JSON.stringify({date:'2026-11-16',inputs:rows.length,mismatches:0,inputSHA256:hash(inputPath),engineSHA256:hash(path.join(repo,'src/modules/solver/engine.mjs')),entry:'validateProject -> prepareRun -> solve (displayLimit=0, keepLimit=100000)',ui360ProjectsTested:false,boundaries,rows},null,2));
console.log('PASS platform '+rows.length+' complete sets and '+boundaries.length+' boundaries');
