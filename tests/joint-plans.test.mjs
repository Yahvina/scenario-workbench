import test from 'node:test';
import assert from 'node:assert/strict';
import fixtures from './solver-browser-fixtures.cjs';
import { prepareRun, solve } from '../src/modules/solver/engine.mjs';
import { jointPlanKey, saveJointPlan, readJointPlans, loadJointPlan, compareJointPlans, deleteJointPlan } from '../src/modules/solver/joint-plans.mjs';
function setup() {
  const p = fixtures.fixture({ mode: 'zero' });
  const input = prepareRun(p, { year: 2030, selectedJudgmentIds: p.data.judgments.map(j => j.id),
    assumptionAcknowledgements: { currentAssumptions: true, unknownStateScope: true } }).input;
  const values = new Map(); const storage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) };
  const save = (id, sign) => saveJointPlan(storage, { id, name: id, input, createdAt: '2026-11-14',
    changes: [{ entryIndex: 0, score: sign }, { entryIndex: 1, score: -sign }] });
  return { input, storage, save, values };
}
test('saved plans round trip, compare equal counts but different identities and replay exports', () => {
  const { input, storage, save } = setup(); const frozen = structuredClone(input);
  const left = save('left',1), right = save('right',-1);
  const loaded = readJointPlans(storage);
  assert.deepEqual(loaded,[left,right]); assert.equal(loadJointPlan(input,loaded[0]).length,2);
  const compared = compareJointPlans(input,...loaded);
  assert.deepEqual(compared.plans.map(p => p.result.variantCount),[3,3]);
  assert.deepEqual(Object.values(compared.between).map(r => r.length),[2,1,1]);
  for (const p of JSON.parse(JSON.stringify(compared)).plans) assert.equal(solve(p.result.variantInput).count,3);
  loaded[0].changes[0].score = 3; assert.equal(readJointPlans(storage)[0].changes[0].score,1);
  assert.deepEqual(input,frozen); deleteJointPlan(storage,left.id); assert.equal(readJointPlans(storage).length,1);
});
test('different year, score, condition and engine baseline cannot load or compare saved edits', () => {
  const { input, save } = setup(); const record = save('original',1);
  for (const edit of [i => i.year=2035, i => i.matrix.entries[2].score=1,
    i => i.conditionedStateIds=['A0'], i => i.engineVersion='different']) {
    const changed=structuredClone(input);edit(changed);assert.throws(()=>loadJointPlan(changed,record),/另一冻结基线/);
  }
  assert.throws(()=>compareJointPlans(input,record,record),/不同/);
});
test('bad edits, duplicate ids, corrupt storage and quota errors do not overwrite prior records', () => {
  const { input, storage, save, values } = setup(); const record=save('valid',1), before=storage.getItem(jointPlanKey);
  assert.throws(()=>save('valid',1)); assert.equal(storage.getItem(jointPlanKey),before);
  assert.throws(()=>saveJointPlan(storage,{...record,id:'new-id'}),/同名/);assert.equal(storage.getItem(jointPlanKey),before);
  assert.throws(()=>saveJointPlan(storage,{...record,id:'bad',changes:[{entryIndex:0,score:1}]}));
  assert.equal(storage.getItem(jointPlanKey),before);
  const full={...storage,setItem:()=>{throw new Error('quota');}};
  assert.throws(()=>saveJointPlan(full,{...record,id:'new'}),/原记录未覆盖/);assert.equal(storage.getItem(jointPlanKey),before);
  values.set(jointPlanKey,'broken');assert.throws(()=>readJointPlans(storage),/损坏/);
  assert.throws(()=>saveJointPlan(storage,{...record,id:'new'}));assert.equal(values.get(jointPlanKey),'broken');
});
