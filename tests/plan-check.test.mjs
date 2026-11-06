import test from 'node:test';
import assert from 'node:assert/strict';
import { mechanismProject } from './_probe/fixtures.mjs';
import { planAtYear, changeYearState } from '../src/modules/elements/state-plan.mjs';
import { prepareRun, explain, solve } from '../src/modules/solver/engine.mjs';

const ack = { currentAssumptions: true, unknownStateScope: true };
const prepared = p => prepareRun(p, { year: 2030, selectedJudgmentIds: p.data.judgments.map(j => j.id), assumptionAcknowledgements: ack });

test('年度方案读出按年状态，缺的不回填', () => {
  const p = mechanismProject();
  const plan = planAtYear(p, 2030);
  assert.equal(plan.descriptors.length, 3);
  assert.deepEqual(plan.config, { d0: 's02', d1: 's11' });
  assert.deepEqual(plan.missing, ['d2']);
  assert.equal(plan.complete, false);
  assert.equal(plan.descriptors[0].source, '就地选择');
  assert.equal(plan.descriptors[2].source, null);
});

test('2030 与 2035 读到不同配置', () => {
  const p = mechanismProject();
  assert.notDeepEqual(planAtYear(p, 2030).config, planAtYear(p, 2035).config);
});

test('就地补选后方案完整，且不改动枚举空间', () => {
  const p = mechanismProject();
  const next = changeYearState(p, 'd2', 2030, 's22', () => 'new-id');
  const plan = planAtYear(next, 2030);
  assert.equal(plan.complete, true);
  assert.equal(plan.config.d2, 's22');
  assert.deepEqual(next.selection.lockedStateIds, [], '补选不能顺手锁定');
  const run = prepared(next);
  assert.equal(run.input.lockedStateIds.length, 0);
  assert.equal(run.space.constrained, '27');
});

test('方案检验给出逐因素支持、差距与有符号裕度', () => {
  const p = mechanismProject();
  const full = changeYearState(p, 'd2', 2030, 's22', () => 'x');
  const { input } = prepared(full);
  const trace = explain(input, planAtYear(full, 2030).config);
  const by = Object.fromEntries(trace.balances.map(b => [b.descriptorId, b]));
  assert.equal(by.d0.selectedSupport, 0);
  assert.equal(by.d0.maximum, 0);
  assert.equal(by.d0.gap, 0);
  assert.equal(by.d1.selectedSupport, -2);
  assert.equal(by.d1.maximum, 0);
  assert.equal(by.d1.gap, 2);
  assert.equal(trace.consistent, false);
});

test('全空间计数与方案归属可核对', () => {
  const p = mechanismProject();
  const { input } = prepared(p);
  const result = solve(input, { displayLimit: 100 });
  assert.equal(result.status, 'completed');
  assert.equal(result.checked, 27);
  assert.equal(result.count, 3);
  assert.equal(result.truncated, false);
  const plan = planAtYear(p, 2030);
  const incomplete = result.scenarios.some(s => Object.keys(plan.config).every(k => s[k] === plan.config[k]));
  assert.equal(incomplete, false, '不完整方案不能被当成命中');
});
