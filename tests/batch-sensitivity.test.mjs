import test from 'node:test';
import assert from 'node:assert/strict';
import fixtures from './solver-browser-fixtures.cjs';
import { prepareRun } from '../src/modules/solver/engine.mjs';
import { compareScore } from '../src/modules/solver/score-sensitivity.mjs';
import { scanSensitivity, planSensitivity } from '../src/modules/solver/batch-sensitivity.mjs';
function input(sizes=[2,2],mode='zero') {
 const project=fixtures.fixture({sizes,mode});
 return prepareRun(project,{year:2030,selectedJudgmentIds:project.data.judgments.map(j=>j.id),
  assumptionAcknowledgements:{currentAssumptions:true,unknownStateScope:true}}).input;
}
test('batch summaries match full single-cell sets and preserve frozen source',async()=>{
 const source=input(),snapshot=structuredClone(source);
 const result=await scanSensitivity(source,{yieldControl:async()=>{}});
 assert.equal(result.status,'completed');assert.equal(result.totalTrials,16);
 assert.equal(result.plannedEvaluations,68);
 for(const row of result.rows){
  const exact=compareScore(source,row.entryIndex,row.score);
  assert.deepEqual([row.kept,row.added,row.removed],[exact.kept.length,exact.added.length,exact.removed.length]);
  assert.equal(row.baselineCount,4);assert.equal(row.variantCount,3);assert.equal(row.jaccard,.75);
 }
 assert.deepEqual(source,snapshot);
});
test('cancellation is explicit and retains only completed trials',async()=>{
 const controller=new AbortController();
 const result=await scanSensitivity(input(),{signal:controller.signal,yieldControl:async()=>{},
  onProgress:({completed})=>{if(completed===2)controller.abort();}});
 assert.equal(result.status,'cancelled');assert.equal(result.rows.length,2);assert.equal(result.completedTrials,2);
 controller.abort();
 const empty=await scanSensitivity(input(),{signal:controller.signal});assert.equal(empty.rows.length,0);
});
test('batch budget rejects excessive work and score endpoints generate only legal changes',()=>{
 const source=structuredClone(input());source.matrix.entries[0].score=3;
 const plan=planSensitivity(source);assert.equal(plan.trials.length,15);
 assert.deepEqual(plan.trials.filter(t=>t.entryIndex===0),[{entryIndex:0,score:2}]);
 assert.throws(()=>planSensitivity(source,63),/超过交互预算/);
 assert.throws(()=>planSensitivity(input(Array(8).fill(3))),/超过交互预算/);
});
