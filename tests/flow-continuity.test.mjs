import test from 'node:test';import assert from 'node:assert/strict';
import fixtures from './flow-fixtures.cjs';import solverFixtures from './solver-browser-fixtures.cjs';
import {createProjectStore} from '../src/core/project-store.mjs';import {createActions} from '../src/core/actions.mjs';import {createJJJDraftProject} from '../src/fixtures/jjj-draft.mjs';import {createDemoProject} from '../src/fixtures/demo.mjs';
import {joinJJJFramework} from '../src/modules/elements/framework.mjs';import {resolveSelection,descendantChoices} from '../src/modules/elements/selection.mjs';
import {prepareMatrixHandoff,sendMatrixHandoff,readMatrixHandoff,verifyMatrixHandoff} from '../src/modules/relationships/handoff.mjs';import {prepareRun,solve} from '../src/modules/solver/engine.mjs';
const options={year:2030,selectedJudgmentIds:['A->B','B->A']};
test('framework joins atomically while preserving identity, scope, records and referenced selection; identical retry is a no-op',()=>{
 const p=fixtures.withRecords(),store=createProjectStore(p.id,p),actions=createActions(store);assert.equal(actions.replaceProject(joinJJJFramework(store.read())).ok,true);const after=store.read();
 for(const key of ['id','title','scope','view','selection'])assert.deepEqual(after[key],p[key]);for(const key of ['paths','judgments'])assert.deepEqual(after.data[key],p.data[key]);assert.deepEqual(after.data.evidence[0],p.data.evidence[0]);assert.equal(after.data.descriptors.length,26);assert.equal(after.data.states.filter(s=>s.id.startsWith('jjj-')).every(s=>s.range===null&&s.validYears.length===0),true);assert.equal(after.revision,1);
 actions.replaceProject(joinJJJFramework(store.read()));assert.equal(store.read().revision,1);
});
test('inconsistent template ID definitions refuse all changes with concrete reasons',()=>{
 const p=createJJJDraftProject();p.data.taxonomy=[];p.data.descriptors[0].label='conflicting existing definition';p.data.evidence[0].excerpt='Other source';const store=createProjectStore(p.id,p),before=store.read();let commits=0;store.subscribe(()=>commits++);
 assert.throws(()=>createActions(store).replaceProject(joinJJJFramework(store.read())),e=>e.message.includes('descriptors / jjj-d1')&&e.message.includes('evidence / jjj-source-d1'));assert.deepEqual(store.read(),before);assert.equal(commits,0);
});
test('coarse selection stays unmapped until explicit descendant selection and never makes an aggregate',()=>{
 const p=createDemoProject();p.selection={nodeIds:[],descriptorIds:[],stateIds:[],lockedStateIds:[]};assert.deepEqual(resolveSelection(p,['node-1']).descriptorIds,[]);
 const choices=descendantChoices(p,'node-1');assert.deepEqual(choices.nodeIds,['node-6','node-peer']);assert.deepEqual(choices.descriptorIds,['descriptor-a','descriptor-b']);assert.deepEqual(resolveSelection(p,['node-1',...choices.nodeIds]).descriptorIds,['descriptor-a','descriptor-b']);assert.deepEqual(descendantChoices(fixtures.unmapped(),'coarse').nodeIds,[]);
});
test('matrix candidate is private, copied, explicitly selected, complete and revalidated; no assumptions are adopted',()=>{
 const p=solverFixtures.fixture();p.id='flow-unit-candidate';const sent=sendMatrixHandoff(p,options);assert.equal(sent.matrix.coverage.judged,8);assert.ok(sent.diagnostics.some(d=>d.code==='ASSUMPTIONS_REQUIRED'));assert.equal(verifyMatrixHandoff(p,sent).ok,true);assert.equal(prepareRun(p,options).input,null);
 const r=solve(prepareRun(p,{...options,assumptionAcknowledgements:{currentAssumptions:true}}).input);assert.equal(r.count,2);
 sent.matrix.entries[0].score=3;assert.equal(readMatrixHandoff(p.id).matrix.entries[0].score,1);assert.equal(verifyMatrixHandoff(p,sent).ok,false);const read=readMatrixHandoff(p.id);read.projectInputSnapshot.data.states[0].label='mutated';assert.notEqual(readMatrixHandoff(p.id).projectInputSnapshot.data.states[0].label,'mutated');
 assert.throws(()=>prepareMatrixHandoff(p,{year:null,selectedJudgmentIds:options.selectedJudgmentIds}),/YEAR_REQUIRED/);assert.throws(()=>prepareMatrixHandoff(p,{year:2030,selectedJudgmentIds:[]}),/RECORD_NOT_SELECTED/);
 p.data.judgments[0].entries[0].score=null;assert.throws(()=>sendMatrixHandoff(p,options),/MISSING_SCORES/);
});
test('candidate rejects science drift, imported same ID/revision data, foreign projects and forged versions/matrix',()=>{
 const p=solverFixtures.fixture();p.id='flow-drift';const candidate=sendMatrixHandoff(p,options);
 for(const mutate of [x=>x.data.judgments[0].entries[0].score=0,x=>x.data.judgments[0].version++,x=>x.data.states[0].version++,x=>x.data.states[0].label='changed without version bump',x=>x.scope.regionId='elsewhere',x=>x.scope.years.push(2040),x=>x.selection.lockedStateIds=['A0'],x=>x.id='other-project',x=>x.revision++]){const changed=structuredClone(p);mutate(changed);assert.equal(verifyMatrixHandoff(changed,candidate).ok,false);}
 const viewOnly=structuredClone(p);viewOnly.title='Renamed';viewOnly.view.perspective='expert';assert.equal(verifyMatrixHandoff(viewOnly,candidate).ok,true);assert.equal(readMatrixHandoff('other-project'),null);
 const badVersion=structuredClone(candidate);badVersion.selectionOfJudgments[0].version++;assert.equal(verifyMatrixHandoff(p,badVersion).ok,false);
 const missing=structuredClone(candidate);missing.matrix.entries.pop();assert.equal(verifyMatrixHandoff(p,missing).ok,false);
});
test('unknown-state candidates retain required confirmation and stale/unconfirmed curves still fail original gate',()=>{
 const p=solverFixtures.fixture();p.id='flow-unknown';p.data.states[0].validYears=[];p.data.states[0].scope.regionId=null;const candidate=sendMatrixHandoff(p,options);assert.equal(verifyMatrixHandoff(p,candidate).ok,true);assert.ok(candidate.diagnostics.some(d=>d.code==='STATE_ASSUMPTIONS_REQUIRED'));assert.equal(prepareRun(p,{...options,assumptionAcknowledgements:{currentAssumptions:true}}).input,null);
 p.data.judgments[0].curveEncoding={};assert.throws(()=>prepareMatrixHandoff(p,options),/CURVE_METHOD_UNVERIFIED/);
});
