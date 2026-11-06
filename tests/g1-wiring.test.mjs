import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCheckRecord, planCheckStaleReasons } from '../src/modules/solver/plan-check-store.mjs';
import { directionCoverage, nextUngjudgedDirection } from '../src/modules/relationships/logic.mjs';

const proj = (over = {}) => ({
  revision: 7,
  selection: { descriptorIds: ['a', 'b', 'c'] },
  data: {
    judgments: over.judgments || [
      { sourceDescriptorId: 'a', targetDescriptorId: 'b' },
      { sourceDescriptorId: 'a', targetDescriptorId: 'c' }
    ]
  }
});

test('directionCoverage counts A→B and B→A independently and lists missing in order', () => {
  const cov = directionCoverage(proj());
  assert.equal(cov.need, 6);
  assert.equal(cov.covered, 2);
  assert.deepEqual(cov.missing, [
    { source: 'b', target: 'a' },
    { source: 'b', target: 'c' },
    { source: 'c', target: 'a' },
    { source: 'c', target: 'b' }
  ]);
});

test('nextUngjudgedDirection returns first missing direction or null when covered', () => {
  assert.deepEqual(nextUngjudgedDirection(proj()), { source: 'b', target: 'a' });
  const full = { selection: { descriptorIds: ['a', 'b'] }, data: { judgments: [
    { sourceDescriptorId: 'a', targetDescriptorId: 'b' }, { sourceDescriptorId: 'b', targetDescriptorId: 'a' }] } };
  assert.equal(nextUngjudgedDirection(full), null);
  assert.equal(directionCoverage(full).covered, 2);
});

test('planCheckRecord stores facts only and staleness detects config and revision drift', () => {
  const plan = { config: { a: 'a-high', b: 'b-low' }, planVersion: 3 };
  const trace = { consistent: false, balances: [
    { consistent: true }, { consistent: false }, { consistent: true }] };
  const record = planCheckRecord({ project: proj(), year: 2030, plan, trace });
  assert.equal(record.year, 2030);
  assert.equal(record.projectRevision, 7);
  assert.equal(record.consistent, false);
  assert.equal(record.conflicts, 1);
  assert.equal(record.planVersion, 3);

  assert.deepEqual(planCheckStaleReasons(record, { project: proj(), plan }), [],
    'same config and revision -> still current');
  const byConfig = planCheckStaleReasons(record, { project: proj(), plan: { ...plan, config: { a: 'a-low', b: 'b-low' } } });
  assert.ok(byConfig.some(r => r.includes('状态选择变过')));
  const byRevision = planCheckStaleReasons(record, { project: { ...proj(), revision: 9 }, plan });
  assert.ok(byRevision.some(r => r.includes('修订号')));
  assert.equal(planCheckStaleReasons(null, { project: proj(), plan }).length, 1);
});

test('planCheckRecord clones config so later plan mutation cannot rewrite history', () => {
  const plan = { config: { a: 'a-high' }, planVersion: 1 };
  const trace = { consistent: true, balances: [] };
  const record = planCheckRecord({ project: proj(), year: 2035, plan, trace });
  plan.config.a = 'a-low';
  assert.equal(record.config.a, 'a-high');
});

test('planCheckRecord keeps the per-cell contributions used for the substituted formula', () => {
  const plan = { config: { a: 'a-high' }, planVersion: 1 };
  const trace = { consistent: false, balances: [{
    descriptorId: 'a', selectedStateId: 'a-high', selectedSupport: 1, maximum: 2, gap: 1,
    candidates: [
      { stateId: 'a-high', support: 1, contributions: [{ sourceDescriptorId: 'b', sourceStateId: 'b-low', score: 1, judgmentId: 'j1' }] },
      { stateId: 'a-low', support: 2, contributions: [] }]
  }] };
  const record = planCheckRecord({ project: proj(), year: 2030, plan, trace });
  const bal = record.trace.balances[0];
  assert.equal(bal.contributions.length, 1);
  assert.equal(bal.contributions[0].judgmentId, 'j1');
  assert.deepEqual(bal.candidates.map(c => c.stateId), ['a-high', 'a-low']);
  assert.equal(record.trace.consistent, false);
});
