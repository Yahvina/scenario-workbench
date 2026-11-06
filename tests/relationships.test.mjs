import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoProject} from '../src/fixtures/demo.mjs';
import {createProjectStore} from '../src/core/project-store.mjs';
import {createActions} from '../src/core/actions.mjs';
import {draftFor,buildJudgmentChange,buildMatrix,statesFor} from '../src/modules/relationships/logic.mjs';
function fixture(three=false) {
  const p=createDemoProject();
  if(three){const state=structuredClone(p.data.states.find(s=>s.id==='b-high'));state.id='b-mid';state.label='示例中档';p.data.states.push(state);p.data.descriptors[1].stateIds.push(state.id);}
  return p;
}
function judgment(p,id='ab',source='descriptor-a',target='descriptor-b') {
  return {id,sourceDescriptorId:source,targetDescriptorId:target,scope:{regionId:p.scope.regionId},validYears:[2030],directness:'direct',curveEncoding:null,entries:statesFor(p,source).flatMap(a=>statesFor(p,target).map(b=>({sourceStateId:a.id,targetStateId:b.id,score:null}))),alternatives:[],rationale:'软件测试用户假设',evidenceRefs:['fixture-source'],reviewStatus:'draft',version:1,provenance:{origin:'fixture'}};
}
const ids=()=>{let i=0;return()=>`relationships-test-${++i}`;};
const matrix=(p,year=2030,selectedJudgmentIds=[])=>buildMatrix(p,{year,selectedJudgmentIds});

test('2x2 expected coverage: directed full space8, exactly zero and +2 judged, six missing',()=>{
  const p=fixture(),ab=judgment(p);ab.entries[0].score=0;ab.entries[3].score=2;p.data.judgments.push(ab);
  const {snapshot}=matrix(p,2030,['ab']);
  assert.equal(snapshot.coverage.required,8);assert.equal(snapshot.coverage.judged,2);assert.equal(snapshot.coverage.missingPairs.length,6);
  assert.deepEqual(snapshot.entries.find(e=>e.sourceStateId==='a-low'&&e.targetStateId==='b-low'),{sourceStateId:'a-low',targetStateId:'b-low',score:0,judgmentId:'ab'});
  assert.ok(snapshot.entries.filter(e=>e.sourceStateId.startsWith('b-')).every(e=>e.score===null));
  // 未显式选用、但方向只有一条适用记录时，直接采用它，不再报“仍需明确选用”。
 assert.equal(matrix(p).snapshot.coverage.judged,2);assert.ok(!matrix(p).diagnostics.some(d=>/仍需明确选用/.test(d.message)));
});
test('heterogeneous2x3 gives6 per direction/12 total; no transpose or index coupling',()=>{
  const p=fixture(true),ab=judgment(p),ba=judgment(p,'ba','descriptor-b','descriptor-a');ab.entries[5].score=3;ba.entries[0].score=-2;p.data.judgments.push(ab,ba);
  const result=matrix(p,2030,['ab','ba']).snapshot;
  assert.equal(draftFor(p,'descriptor-a','descriptor-b').entries.length,6);assert.equal(result.coverage.required,12);assert.equal(result.coverage.judged,2);
  assert.equal(result.entries.find(e=>e.sourceStateId==='a-high'&&e.targetStateId==='b-mid').score,3);
  assert.equal(result.entries.find(e=>e.sourceStateId==='b-low'&&e.targetStateId==='a-low').score,-2);
  assert.equal(result.entries.find(e=>e.sourceStateId==='a-low'&&e.targetStateId==='b-low').score,null);
  p.data.descriptors[1].stateIds.reverse();assert.deepEqual(matrix(p,2030,['ab','ba']).snapshot.entries.find(e=>e.sourceStateId==='a-high'&&e.targetStateId==='b-mid').score,3);
});
test('year/region/unknown applicability/curve records never silently used',()=>{
  for(const [patch,code] of [[{validYears:[2035]},'JUDGMENT_YEAR_MISMATCH'],[{validYears:[]},'JUDGMENT_YEARS_UNKNOWN'],[{scope:{regionId:null}},'JUDGMENT_REGION_UNKNOWN'],[{scope:{regionId:'另一个地区'}},'JUDGMENT_REGION_MISMATCH'],[{validYears:[2030,2030]},'JUDGMENT_YEARS_INVALID'],[{curveEncoding:{method:'unverified'}},'CURVE_METHOD_UNVERIFIED']]){
    const p=fixture(),j=Object.assign(judgment(p),patch);j.entries[0].score=3;p.data.judgments.push(j);
    const result=matrix(p,2030,['ab']);assert.equal(result.snapshot.coverage.judged,0);assert.ok(result.diagnostics.some(d=>d.code===code));
  }
  const p=fixture();assert.equal(matrix(p,null).snapshot,null);p.scope.regionId=null;assert.equal(matrix(p).snapshot,null);
});
test('overlapping candidate records require explicit choice, no mean/default/last record',()=>{
  const p=fixture(),a=judgment(p),b=judgment(p,'ab-other');a.entries[0].score=3;b.entries[0].score=-3;p.data.judgments.push(a,b);
  const unresolved=matrix(p);assert.equal(unresolved.snapshot.coverage.judged,0);assert.ok(unresolved.diagnostics.some(d=>d.code==='CONFLICT'));
  assert.equal(matrix(p,2030,['ab-other']).snapshot.entries[0].score,-3);
  assert.equal(matrix(p,2030,['ab','ab-other']).snapshot.coverage.judged,0);
  assert.ok(matrix(p,2030,['not-found']).diagnostics.some(d=>d.code==='JUDGMENT_NOT_FOUND'));
});
test('state range diagnostics separate from fill count; stale refs ignored, new state remains missing',()=>{
  const p=fixture(),j=judgment(p);j.entries[0].score=0;p.data.judgments.push(j);
  p.data.states[0].validYears=[];p.data.states[1].scope.regionId=null;
  let r=matrix(p,2030,['ab']);assert.equal(r.snapshot.coverage.judged,1);assert.ok(r.diagnostics.some(d=>d.code==='STATE_YEARS_UNKNOWN'));assert.ok(r.diagnostics.some(d=>d.code==='STATE_REGION_UNKNOWN'));
  p.data.states=p.data.states.filter(s=>s.id!=='a-low');p.data.descriptors[0].stateIds=['a-high'];
  r=matrix(p,2030,['ab']);assert.equal(r.snapshot.coverage.required,4);assert.equal(r.snapshot.coverage.judged,0);assert.ok(r.diagnostics.some(d=>d.code==='STALE_STATE_REFERENCE'));
  p.selection.descriptorIds=['descriptor-a'];r=matrix(p,2030,['ab']);assert.equal(r.snapshot.coverage.required,0);assert.ok(r.diagnostics.some(d=>d.code==='INACTIVE_JUDGMENT'));
});
test('null drafts atomic save, before/after backup roundtrip, reviewed edits demoted and snapshots stale',()=>{
  const p=fixture(),j=judgment(p);j.reviewStatus='reviewed';j.entries[0].score=-1;p.data.judgments.push(j);
  const store=createProjectStore(p.id,p),actions=createActions(store),snapshot=store.snapshot();
  const draft=draftFor(p,'descriptor-a','descriptor-b',j);draft.entries[0].value='0';draft.rationale='用户修改理由';
  const next=buildJudgmentChange(store.read(),'descriptor-a','descriptor-b',j,draft,ids());
  assert.equal(actions.replaceProject(next).ok,true);assert.equal(store.read().revision,1);assert.equal(store.isCurrent(snapshot),false);
  const saved=store.read().data.judgments[0];assert.equal(saved.entries[0].score,0);assert.equal(saved.entries[1].score,null);assert.equal(saved.reviewStatus,'draft');assert.equal(saved.curveEncoding,null);assert.equal(saved.version,2);
  const restored=createProjectStore('restore',JSON.parse(JSON.stringify(store.read()))).read();
  const history=JSON.parse(restored.data.evidence.at(-1).excerpt);assert.equal(history.before.entries[0].score,-1);assert.deepEqual(history.before.evidenceRefs,['fixture-source']);assert.deepEqual(history.after,saved);
  const again=buildJudgmentChange(store.read(),'descriptor-a','descriptor-b',saved,draftFor(store.read(),'descriptor-a','descriptor-b',saved),ids());
  assert.deepEqual(again,store.read());actions.replaceProject(again);assert.equal(store.read().revision,1);
});
test('invalid score/years/self/cross-state drafts do not mutate store; unknown range stays unknown',()=>{
  const p=fixture(),store=createProjectStore(p.id,p),draft=draftFor(p,'descriptor-a','descriptor-b');
  for(const value of ['1.5','4','-4','NaN','Infinity']) {draft.entries[0].value=value;assert.throws(()=>buildJudgmentChange(store.read(),'descriptor-a','descriptor-b',null,draft,ids()),/整数/);assert.deepEqual(store.read(),p);}
  draft.entries[0].value='';draft.years='2030,2030';assert.throws(()=>buildJudgmentChange(p,'descriptor-a','descriptor-b',null,draft,ids()),/不重复/);
  draft.years='';draft.entries[0].sourceStateId='b-low';assert.throws(()=>buildJudgmentChange(p,'descriptor-a','descriptor-b',null,draft,ids()),/状态对/);
  const empty=buildJudgmentChange(p,'descriptor-a','descriptor-b',null,draftFor(p,'descriptor-a','descriptor-b'),ids());
  assert.equal(empty.data.judgments[0].scope.regionId,null);assert.deepEqual(empty.data.judgments[0].validYears,[]);assert.ok(empty.data.judgments[0].entries.every(e=>e.score===null));
  assert.equal(createActions(createProjectStore(p.id,p)).replaceProject(empty).ok,true);
  assert.throws(()=>buildJudgmentChange(p,'descriptor-a','descriptor-a',null,draft,ids()),/不同/);
});
test('duplicate/illegal imported cells stay null rather than taking last value',()=>{
  const p=fixture(),j=judgment(p);j.entries[0].score=1;j.entries.push({...j.entries[0],score:3});j.entries[1].score=5;p.data.judgments.push(j);
  const r=matrix(p,2030,['ab']);assert.equal(r.snapshot.coverage.judged,0);assert.ok(r.diagnostics.some(d=>d.code==='DUPLICATE_ENTRY'));assert.ok(r.diagnostics.some(d=>d.code==='INVALID_SCORE'));
});

test('legacy malformed metadata reports diagnostics; arbitrary stable IDs do not alter object prototype',()=>{
  const p=fixture(),j=judgment(p);j.validYears='2030';p.data.judgments.push(j);
  assert.equal(draftFor(p,'descriptor-a','descriptor-b',j).years,'');
  const invalid=matrix(p,2030,['ab']);assert.equal(invalid.snapshot.coverage.judged,0);assert.ok(invalid.diagnostics.some(d=>d.code==='JUDGMENT_YEARS_INVALID'));
  const oldId='descriptor-a',newId='__proto__';
  p.data.descriptors[0].id=newId;p.selection.descriptorIds[0]=newId;p.data.states.filter(s=>s.descriptorId===oldId).forEach(s=>s.descriptorId=newId);p.data.judgments=[];
  const snapshot=matrix(p).snapshot;
  assert.equal(Object.hasOwn(snapshot.stateIdsByDescriptor,newId),true);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)).stateIdsByDescriptor[newId],['a-low','a-high']);assert.equal(snapshot.coverage.required,8);
});

test('explicit inapplicable record cannot fall back to a valid alternate record',()=>{
  const p=fixture(),future=judgment(p,'future'),current=judgment(p,'current');future.validYears=[2035];future.entries[0].score=-3;current.entries[0].score=3;p.data.judgments.push(future,current);
  const r=matrix(p,2030,['future']);assert.equal(r.snapshot.coverage.judged,0);assert.ok(r.diagnostics.some(d=>d.code==='SELECTED_INAPPLICABLE'));
});
