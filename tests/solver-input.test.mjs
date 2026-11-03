import test from 'node:test';import assert from 'node:assert/strict';
import review from './solver-browser-input-fixtures.cjs';import fixtures from './solver-browser-fixtures.cjs';
import {solve,createEnumeration,explain,prepareRun} from '../src/modules/solver/engine.mjs';
function rejected(c){
 for(const r of [solve(c.input),createEnumeration(c.input).step(1).result]){assert.equal(r.status,'blocked',c.label);assert.equal(r.checked,0,c.label);assert.equal(r.count,null,c.label);assert.equal(r.coverage,null,c.label);assert.equal(r.diagnostics[0].code,c.code,c.label);assert.deepEqual(r.inputSnapshot,c.input);}
 assert.throws(()=>explain(c.input,{A:'A0',B:'B0'}),e=>e.code===c.code,c.label);
}
test('F1 independent solve/chunks/explain reject known year and region mismatch even with claimed confirmations',()=>{
 review.cases().filter(c=>c.label.startsWith('F1-')).forEach(rejected);
 for(const mutate of [s=>s.validYears=[2035],s=>s.scope.regionId='elsewhere']){const p=fixtures.fixture();mutate(p.data.states[0]);assert.equal(prepareRun(p,{year:2030,selectedJudgmentIds:['A->B','B->A'],assumptionAcknowledgements:{currentAssumptions:true,unknownStateScope:true}}).input,null);}
});
test('F2 independent entry points reject malformed metadata, applicability shapes and contradictory coverage',()=>{
 review.cases().filter(c=>!c.label.startsWith('F1-')).forEach(rejected);
});
test('valid independent and prepared unknown-scope archives still replay with verified eight-cell coverage',()=>{
 const x=review.input();const r=solve(x);assert.equal(r.count,2);assert.equal(r.checked,4);assert.deepEqual(r.scenarios,[{A:'A0',B:'B0'},{A:'A1',B:'B1'}]);assert.deepEqual(r.coverage,{required:8,judged:8,missingPairs:[]});assert.deepEqual(r.inputSnapshot,x);
 const zero=review.input();zero.matrix.entries.forEach(e=>e.score=0);assert.equal(solve(zero).count,4);
 x.lockedStateIds=['A0','B1'];assert.equal(solve(x).count,0);assert.equal(solve(x).checked,1);
 for(const omitted of [false,true]){
  const p=fixtures.fixture();if(omitted){delete p.data.states[0].validYears;delete p.data.states[0].scope;}else{p.data.states[0].validYears=[];p.data.states[0].scope.regionId=null;}
  const opts={year:2030,selectedJudgmentIds:['A->B','B->A'],assumptionAcknowledgements:{currentAssumptions:true}};assert.equal(prepareRun(p,opts).input,null);
  opts.assumptionAcknowledgements.unknownStateScope=true;const pre=prepareRun(p,opts);assert.ok(pre.input);
  const archive=JSON.parse(JSON.stringify({archiveVersion:1,RunInput:pre.input,preflightDiagnostics:pre.diagnostics,assumptionAcknowledgements:opts.assumptionAcknowledgements}));
  const replay=solve(archive.RunInput),job=createEnumeration(archive.RunInput);let output;do{output=job.step(1);}while(!output.done);
  for(const result of [replay,output.result]){assert.equal(result.count,2);assert.equal(result.checked,4);assert.deepEqual(result.coverage,{required:8,judged:8,missingPairs:[]});assert.ok(result.diagnostics.some(d=>d.code==='STATE_YEARS_UNKNOWN'));assert.ok(result.diagnostics.some(d=>d.code==='STATE_REGION_UNKNOWN'));}
  assert.equal(explain(archive.RunInput,{A:'A0',B:'B0'}).consistent,true);assert.equal(archive.assumptionAcknowledgements.unknownStateScope,true);
 }
});
