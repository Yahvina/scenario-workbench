import test from 'node:test';
import assert from 'node:assert/strict';
import { interpolate, draftOf, parseDraft, buildChange, chartDomain } from '../src/modules/timeline/logic.mjs';
import { createDemoProject } from '../src/fixtures/demo.mjs';
import { createProjectStore } from '../src/core/project-store.mjs';
import { createActions } from '../src/core/actions.mjs';
const fixture = () => createDemoProject();
const idGenerator = () => { let n=0; return () => 'timeline-test-' + (++n); };

test('independent expected none/linear/left step values and no extrapolation', () => {
  const path = fixture().data.paths[0];
  path.interpolation = 'linear';
  assert.ok(Math.abs(interpolate(path, 2030).value - (20+50*4/9)) < 1e-10);
  assert.equal(interpolate(path, 2030).stateId, null);
  assert.equal(interpolate(path, 2030).origin, 'interpolated');
  assert.equal(interpolate(path, 2026).value, 20);
  assert.equal(interpolate(path, 2035).value, 70);
  assert.equal(interpolate(path, 2025), null); assert.equal(interpolate(path, 2036), null);
  path.interpolation = 'step'; assert.equal(interpolate(path, 2030).value, 20);
  path.interpolation = 'none'; assert.equal(interpolate(path, 2030), null);
});
test('null breaks interpolation, zero remains numeric; single/empty points and domains', () => {
  const path = fixture().data.paths[0]; path.interpolation='linear'; path.points[0].value=null;
  assert.equal(interpolate(path, 2030), null); assert.equal(interpolate(path,2026).value,null);
  path.points[0].value=0; assert.equal(interpolate(path,2026).value,0);
  path.points = [path.points[0]]; assert.equal(interpolate(path,2030),null);
  assert.equal(chartDomain([],[]),null);
  assert.equal(chartDomain([2030],[{year:2020,value:null}]).hasValues,false);
  assert.ok(chartDomain([2030],[{year:2020,value:0}]).minX <= 2020);
  assert.ok(chartDomain([2030],[{year:2030,value:0}]).maxY > 0);
  path.points=[]; assert.equal(interpolate(path,2030),null);
});
test('draft validation preserves blank/null, rejects duplicates, invalid years, infinity, cross-variable state', () => {
  const p=fixture(), d=draftOf(p.data.paths[0]);
  d.points[0].value=''; assert.equal(parseDraft(d,'descriptor-a',p.data.states).points[0].value,null);
  for (const value of ['NaN','Infinity','-Infinity']) { d.points[0].value=value; assert.throws(()=>parseDraft(d,'descriptor-a',p.data.states),/有限/); }
  d.points[0].value='0'; d.points[0].year='2035'; assert.throws(()=>parseDraft(d,'descriptor-a',p.data.states),/重复/);
  for (const year of ['','2030.5','1899','2301']) { d.points[0].year=year; assert.throws(()=>parseDraft(d,'descriptor-a',p.data.states),/年份/); }
  d.points[0].year='2026'; d.points[0].stateId='b-low'; assert.throws(()=>parseDraft(d,'descriptor-a',p.data.states),/当前变量/);
});
test('source edit preserves originals and evidence through serialized restore; atomic save expires snapshot', () => {
  const p=fixture(), path=p.data.paths[0]; path.points[0].origin='source';
  const store=createProjectStore(p.id,p), actions=createActions(store), snapshot=store.snapshot();
  const draft=draftOf(path); draft.points[0].value='25';
  const next=buildChange(store.read(),path,draft,'descriptor-a',idGenerator());
  assert.equal(store.read().data.paths[0].points[0].value,20);
  assert.equal(actions.replaceProject(next).ok,true); assert.equal(store.read().revision,1); assert.equal(store.isCurrent(snapshot),false);
  const saved=store.read().data.paths[0];
  assert.equal(saved.points[0].value,25); assert.equal(saved.points[0].stateId,null); assert.equal(saved.points[0].origin,'user-assumption');
  assert.ok(saved.points[0].evidenceRefs.includes('fixture-source')); assert.equal(saved.version,2);
  const restored=createProjectStore('restored',JSON.parse(JSON.stringify(store.read()))).read();
  const evidence=restored.data.evidence.find(e=>e.kind==='user-assumption'); const record=JSON.parse(evidence.excerpt);
  assert.equal(record.before.points[0].value,20); assert.equal(record.before.points[0].origin,'source');
  assert.deepEqual(record.before.points[0].evidenceRefs,['fixture-source']); assert.equal(record.after.points[0].value,25);
  assert.deepEqual(record.after,saved); assert.equal(record.after.version,2);
  assert.equal(record.before.version,1); assert.equal(evidence.locator,'path-a@v1');
});
test('no-op, add/delete/reorder, unit/interpolation edits, new path and inactive history', () => {
  const p=fixture(), path=p.data.paths[0], draft=draftOf(path), gen=idGenerator();
  assert.deepEqual(buildChange(p,path,draft,'descriptor-a',gen),p);
  draft.points.reverse(); assert.deepEqual(parseDraft(draft,'descriptor-a',p.data.states).points.map(p=>p.year),[2026,2035]);
  draft.points.splice(0,1); draft.unit='index'; draft.interpolation='step';
  const changed=buildChange(p,path,draft,'descriptor-a',gen);
  assert.equal(changed.data.paths[0].points.length,1); assert.equal(JSON.parse(changed.data.evidence.at(-1).excerpt).before.points.length,2);
  const created=buildChange(p,null,{unit:'',interpolation:'none',points:[{year:'2030',value:'',stateId:null,origin:'user-assumption',evidenceRefs:[]}]},'descriptor-b',gen);
  assert.equal(created.data.paths.length,2); assert.equal(created.data.paths[1].unit,null); assert.equal(created.data.paths[1].points[0].value,null);
  const store=createProjectStore(p.id,created), actions=createActions(store);
  assert.equal(actions.selectElements({descriptorIds:['descriptor-b'],nodeIds:['node-peer']}).ok,true);
  assert.equal(store.read().data.paths.length,2);
  assert.throws(()=>buildChange(store.read(),path,draft,'descriptor-a',gen),/不在当前选择/);
});
test('bad draft cannot partially save or add evidence', () => {
  const p=fixture(), store=createProjectStore(p.id,p), draft=draftOf(p.data.paths[0]); draft.points[0].year='2035';
  assert.throws(()=>buildChange(store.read(),p.data.paths[0],draft,'descriptor-a',idGenerator()),/重复/);
  assert.deepEqual(store.read(),p);
});
