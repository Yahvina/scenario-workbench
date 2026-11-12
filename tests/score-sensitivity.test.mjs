import test from 'node:test';
import assert from 'node:assert/strict';
import fixtures from './solver-browser-fixtures.cjs';
import { prepareRun } from '../src/modules/solver/engine.mjs';
import { compareScore } from '../src/modules/solver/score-sensitivity.mjs';

function input(sizes, mode) {
  const project = fixtures.fixture({ sizes, mode });
  const prepared = prepareRun(project, { year: 2030, selectedJudgmentIds: project.data.judgments.map(j => j.id),
    assumptionAcknowledgements: { currentAssumptions: true, unknownStateScope: true } });
  assert.ok(prepared.input);
  return prepared.input;
}
test('single-cell comparison reads the full solution set beyond the old display cap', () => {
  const baseline = input(Array(7).fill(2), 'zero');
  const original = structuredClone(baseline);
  const result = compareScore(baseline, 0, 1);
  assert.equal(result.baselineCount, 128);
  assert.equal(result.variantCount, 96);
  assert.deepEqual([result.kept.length, result.added.length, result.removed.length], [96, 0, 32]);
  assert.equal(result.checked.baseline, 128);
  assert.deepEqual(baseline, original);
});
test('invalid, unchanged and unknown cell changes are rejected', () => {
  const baseline = input([2, 2], 'copy');
  assert.throws(() => compareScore(baseline, 0, baseline.matrix.entries[0].score));
  assert.throws(() => compareScore(baseline, -1, 0));
  assert.throws(() => compareScore(baseline, 0, 4));
});

