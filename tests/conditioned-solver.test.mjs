import test from 'node:test';
import assert from 'node:assert/strict';
import fixtures from './solver-browser-fixtures.cjs';
import { prepareRun, solve, explain, conditionedEngineVersion, inspectInput } from '../src/modules/solver/engine.mjs';
import { scanSensitivity } from '../src/modules/solver/batch-sensitivity.mjs';
import { buildReport } from '../src/modules/exports/report.mjs';
import { compareRuns } from '../src/modules/exports/compare.mjs';
import { validateArchive } from '../src/modules/workspace/saved-work.mjs';
const prepare=(project,conditionedStateIds=[])=>prepareRun(project,{year:2030,conditionedStateIds,
 selectedJudgmentIds:project.data.judgments.map(j=>j.id),assumptionAcknowledgements:{currentAssumptions:true,unknownStateScope:true}});
test('given condition keeps its outward influence but is exempt; a lock still has to balance',()=>{
 const p=fixtures.fixture({mode:'opposite'}),snapshot=structuredClone(p);
 p.selection.lockedStateIds=['A0'];
 assert.equal(solve(prepare(p).input).count,0);
 const conditioned=prepare(p,['A0']);assert.ok(conditioned.input);
 assert.equal(conditioned.input.engineVersion,conditionedEngineVersion);
 assert.equal(conditioned.input.matrix.entries.length,2);
 const result=solve(conditioned.input);
 assert.equal(result.checked,2);assert.equal(result.count,1);
 assert.deepEqual(result.scenarios,[{A:'A0',B:'B0'}]);
 assert.equal(result.balanceTrace[0].balances.length,1);
 assert.deepEqual(explain(conditioned.input,{A:'A1',B:'B0'}).violatesConditions,['A']);
 p.selection.lockedStateIds=[];assert.deepEqual(p,snapshot);
});
test('unused incoming scores and unused policy rows are unnecessary; required blanks remain blocking',()=>{
 const p=fixtures.fixture({sizes:[3,3],mode:'zero'});
 p.data.judgments=p.data.judgments.filter(j=>j.sourceDescriptorId==='A');
 p.data.judgments[0].entries=p.data.judgments[0].entries.filter(e=>e.sourceStateId==='A0');
 const ready=prepare(p,['A0']);assert.ok(ready.input,JSON.stringify(ready.diagnostics));
 assert.equal(ready.input.matrix.coverage.required,3);assert.equal(solve(ready.input).count,3);
 assert.equal(prepare(p).input,null);
 p.data.judgments[0].entries[0].score=null;
 assert.equal(prepare(p,['A0']).input,null);
});
test('invalid, conflicting, duplicated and all-given conditions fail rather than defaulting',()=>{
 const p=fixtures.fixture();
 for(const ids of [['missing'],['A0','A1'],['A0','A0'],['A0','B0'],null])assert.equal(prepare(p,ids).input,null);
 p.selection.lockedStateIds=['A1'];assert.equal(prepare(p,['A0']).input,null);
 const raw=structuredClone(prepare(fixtures.fixture(),['A0']).input);
 raw.engineVersion='cib-exact-1.0.0';assert.throws(()=>inspectInput(raw),/专用方法版本/);
});
test('conditioned batch scans only used cells and matches full explanation counts',async()=>{
 const p=fixtures.fixture({mode:'zero'}),input=prepare(p,['A0']).input;
 const result=await scanSensitivity(input,{yieldControl:async()=>{}});
 assert.equal(result.status,'completed');assert.equal(result.totalTrials,4);assert.equal(result.baselineCount,2);
 for(const row of result.rows){assert.equal(row.sourceStateId,'A0');assert.equal(row.variantCount,1);}
});
test('frozen reports and run comparisons identify the changed condition',()=>{
 const p=fixtures.fixture({mode:'zero'});
 const archive=state=>{const RunInput=prepare(p,[state]).input;return {projectInputSnapshot:structuredClone(p),RunInput,RunResult:solve(RunInput)};};
 const left=archive('A0'),right=archive('A1');
 assert.match(JSON.stringify(buildReport({archive:left})),/给定条件/);
 assert.match(JSON.stringify(buildReport({archive:left})),/不表示全矩阵已填齐/);
 const compared=compareRuns({left:{name:'A0',archive:left},right:{name:'A1',archive:right}});
 const row=compared.rows.find(r=>r.label.startsWith('给定条件'));
 assert.ok(row);assert.equal(row.kind,'changed');
});
test('100 synthetic matrices match an independent direct-sum conditional enumerator',()=>{
 let seed=20261113;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<100;i++){
  const p=fixtures.fixture({sizes:[2,3,2],mode:'zero'});
  for(const j of p.data.judgments)for(const e of j.entries)e.score=Math.floor(random()*7)-3;
  const state=i%2?'A1':'A0',input=prepare(p,[state]).input,expected=[];
  for(const B of ['B0','B1','B2'])for(const C of ['C0','C1']){
   const configuration={A:state,B,C};
   if(['B','C'].every(target=>{
    const scores=p.data.descriptors.find(d=>d.id===target).stateIds.map(s=>p.data.judgments.filter(j=>j.targetDescriptorId===target).reduce((sum,j)=>sum+j.entries.find(e=>e.sourceStateId===configuration[j.sourceDescriptorId]&&e.targetStateId===s).score,0));
    const chosen=p.data.descriptors.find(d=>d.id===target).stateIds.indexOf(configuration[target]);
    return scores[chosen]===Math.max(...scores);
   }))expected.push(configuration);
  }
  assert.deepEqual(solve(input).scenarios,expected);
 }
});
test('conditional archive validates against the frozen project and rejects altered conditions',()=>{
 const p=fixtures.fixture({mode:'opposite'}),pre=prepare(p,['A0']);
 const archive={archiveVersion:1,RunInput:pre.input,RunResult:solve(pre.input),
  projectInputSnapshot:{schemaVersion:1,contractVersion:p.contractVersion,projectId:p.id,revision:p.revision,
   scope:p.scope,data:p.data,selection:p.selection},preflightDiagnostics:pre.diagnostics,
  assumptionAcknowledgements:{currentAssumptions:true,unknownStateScope:true},
  selectionOfJudgments:p.data.judgments.map(j=>({id:j.id,version:j.version,evidenceRefs:j.evidenceRefs}))};
 assert.ok(validateArchive(archive));
 const altered=structuredClone(archive);altered.RunInput.conditionedStateIds=['A1'];
 altered.RunResult.inputSnapshot=structuredClone(altered.RunInput);
 assert.throws(()=>validateArchive(altered));
});
test('multiple given factors combine with an ordinary lock without exempting the locked target',()=>{
 const p=fixtures.fixture({sizes:[2,2,2,2],mode:'zero'});p.selection.lockedStateIds=['C1'];
 const input=prepare(p,['A0','B1']).input,result=solve(input);
 assert.equal(result.checked,2);assert.equal(result.count,2);
 assert.deepEqual(result.scenarios,[{A:'A0',B:'B1',C:'C1',D:'D0'},{A:'A0',B:'B1',C:'C1',D:'D1'}]);
 assert.deepEqual(result.balanceTrace[0].balances.map(b=>b.descriptorId),['C','D']);
});
