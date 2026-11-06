import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R35_CASE, r35DirectionEntries } from '../src/fixtures/mechanism-case.mjs';
import { createMechanismCaseProject } from '../src/fixtures/mechanism-project.mjs';
import { prepareRun, solve } from '../src/modules/solver/engine.mjs';
import { referencePlan, applyReference } from '../src/modules/relationships/reference.mjs';

const project = () => createMechanismCaseProject();

test('R35 机制演示：两个因素各 3 档，18 个状态对都有分值', () => {
  assert.equal(R35_CASE.descriptors.length, 2);
  for (const d of R35_CASE.descriptors) assert.equal(d.states.length, 3);
  const ab = r35DirectionEntries('A', 'B'), ba = r35DirectionEntries('B', 'A');
  assert.equal(ab.length, 9);
  assert.equal(ba.length, 9);
  for (const [, , score] of [...ab, ...ba]) assert.ok(Number.isInteger(score) && Math.abs(score) <= 3);
  assert.ok(new Set(ab.map(x => x[2])).size > 1, '状态不同分值必须不同，否则又变成状态无差异的案例');
});

test('R35：真实引擎算出 9 个组合里 2 个自洽、7 个冲突', () => {
  const p = project();
  // 用参考包写入两条判断（验证的是同一个数据源，不是另写一套）
  const plan = referencePlan(p, { year: 2030 });
  const applied = applyReference(p, plan, { newId: () => crypto.randomUUID() });
  const next = applied.next;
  const prepared = prepareRun(next, {
    year: 2030,
    selectedJudgmentIds: next.data.judgments.map(j => j.id),
    assumptionAcknowledgements: { currentAssumptions: true, unknownStateScope: true }
  });
  assert.ok(prepared.input, '输入应可计算');
  const result = solve(prepared.input);
  assert.equal(result.status, 'completed');
  assert.equal(result.checked, 9);
  assert.equal(result.count, 2, '真实结果是 2 / 9，不为演示效果改分');
});

test('R35 参考包覆盖两个方向共 18 格，写入时按项目年份登记', () => {
  const p = project();
  const plan = referencePlan(p, { year: 2030 });
  assert.equal(plan.matched.length, 2);
  assert.equal(plan.totalCells, 18);
  assert.equal(plan.emptyCells, 18);
  const applied = applyReference(p, plan, { newId: () => crypto.randomUUID() });
  assert.equal(applied.filled, 18);
  assert.equal(applied.next.data.judgments.length, 2);
  for (const j of applied.next.data.judgments) {
    assert.deepEqual(j.validYears, [2030, 2035]);
    assert.equal(j.scope.regionId, R35_CASE.region);
  }
});
