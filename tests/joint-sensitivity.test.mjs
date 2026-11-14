import test from 'node:test';
import assert from 'node:assert/strict';
import fixtures from './solver-browser-fixtures.cjs';
import { prepareRun, solve } from '../src/modules/solver/engine.mjs';
import { compareScore, compareScores } from '../src/modules/solver/score-sensitivity.mjs';
function input(conditioned = false) {
  const p = fixtures.fixture({ mode: 'zero' });
  return prepareRun(p, { year: 2030, selectedJudgmentIds: p.data.judgments.map(j => j.id),
    conditionedStateIds: conditioned ? ['A0'] : [],
    assumptionAcknowledgements: { currentAssumptions: true, unknownStateScope: true } }).input;
}
test('joint common-row shift cancels individual effects and preserves frozen input', () => {
  const baseline = input(), frozen = structuredClone(baseline);
  assert.equal(compareScore(baseline, 0, 1).variantCount, 3);
  assert.equal(compareScore(baseline, 1, 1).variantCount, 3);
  const result = compareScores(baseline, [{ entryIndex: 0, score: 1 }, { entryIndex: 1, score: 1 }]);
  assert.equal(result.baselineCount, 4); assert.equal(result.variantCount, 4);
  assert.equal(result.kept.length, 4); assert.deepEqual(result.added, []); assert.deepEqual(result.removed, []);
  assert.equal(result.changes.length, 2); assert.deepEqual(baseline, frozen);
  assert.equal(solve(JSON.parse(JSON.stringify(result)).variantInput).count, result.variantCount);
});
test('joint changes retain given condition and restrict modifications to actual entries', () => {
  const baseline = input(true);
  const result = compareScores(baseline, [{ entryIndex: 0, score: 1 }, { entryIndex: 1, score: 1 }]);
  assert.deepEqual(result.variantInput.conditionedStateIds, ['A0']);
  assert.equal(result.variantCount, 2);
  assert.ok(result.kept.every(c => c.A === 'A0'));
});
test('empty, duplicate, null, fractional, out-of-range, unknown and unchanged edits reject before solving', () => {
  const baseline = input();
  for (const edits of [[], [null], [{ entryIndex: 0, score: 1 }, { entryIndex: 0, score: 2 }],
    [{ entryIndex: .5, score: 1 }], [{ entryIndex: 0, score: 4 }], [{ entryIndex: 999, score: 1 }],
    [{ entryIndex: 0, score: 0 }]]) assert.throws(() => compareScores(baseline, edits));
});
