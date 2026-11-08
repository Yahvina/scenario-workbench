// 独立复核：用与引擎不同的写法重算一遍，防止两个功能都悄悄算错。
// 这组测试不调用 engine 内部函数，只按定义手写枚举与求和；AHP 用二分法求特征根，不走幂法。
import test from 'node:test';
import assert from 'node:assert/strict';
import fixtures from './solver-browser-fixtures.cjs';
import { prepareRun, solve } from '../src/modules/solver/engine.mjs';
import { priorityVector, consistency } from '../src/modules/importance/logic.mjs';

function combosOf(ids, states) {
  const out = [];
  const walk = (i, acc) => {
    if (i === ids.length) { out.push({ ...acc }); return; }
    for (const s of states[ids[i]]) walk(i + 1, { ...acc, [ids[i]]: s });
  };
  walk(0, {});
  return out;
}

test('CIB：按定义重新枚举，自洽数与引擎逐条一致', () => {
  const p = fixtures.fixture();
  const pre = prepareRun(p, {
    year: 2030,
    selectedJudgmentIds: p.data.judgments.map(j => j.id),
    assumptionAcknowledgements: { currentAssumptions: true, unknownStateScope: true }
  });
  const run = solve(pre.input);
  const ids = pre.input.activeDescriptorIds;
  const states = pre.input.matrix.stateIdsByDescriptor;
  const cell = new Map(pre.input.matrix.entries.map(e => [e.sourceStateId + '|' + e.targetStateId, e.score]));

  // 定义：目标变量所选状态的支持分，不低于它的任何一个候选状态。
  const support = (config, target, candidate) => ids
    .filter(source => source !== target)
    .reduce((sum, source) => sum + cell.get(config[source] + '|' + candidate), 0);

  const consistent = combosOf(ids, states).filter(config => ids.every(target => {
    const chosen = support(config, target, config[target]);
    return states[target].every(alt => chosen >= support(config, target, alt));
  }));

  assert.equal(consistent.length, run.count, '自洽总数');
  assert.equal(run.checked, combosOf(ids, states).length, '检查过的组合总数');
  for (const id of ids) {
    for (const state of states[id]) {
      assert.equal(run.stateCounts[id][state] ?? 0,
        consistent.filter(c => c[id] === state).length,
        id + ' / ' + state + ' 的出现次数');
    }
  }
});

test('AHP：幂法结果与二分法求特征根一致', () => {
  const A = [
    [1, 1 / 9, 1 / 5],
    [9, 1, 4],
    [5, 1 / 4, 1]
  ];
  const { weights, lambdaMax } = priorityVector(A);

  // 直接展开 3×3 行列式，找 det(A − λI) = 0 的最大根
  const det = l => {
    const M = [[1 - l, A[0][1], A[0][2]], [A[1][0], 1 - l, A[1][2]], [A[2][0], A[2][1], 1 - l]];
    return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1])
      - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
      + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  };
  let lo = 3, hi = 3.5;
  for (let i = 0; i < 200; i += 1) { const mid = (lo + hi) / 2; if (det(lo) * det(mid) <= 0) hi = mid; else lo = mid; }

  assert.ok(Math.abs((lo + hi) / 2 - lambdaMax) < 1e-9, 'λmax 与特征根一致');
  assert.ok(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 1e-9, '权重归一');
  // Aw = λmax·w：逐行验证权重确实是主特征向量
  A.forEach((row, i) => {
    const lhs = row.reduce((sum, v, j) => sum + v * weights[j], 0);
    assert.ok(Math.abs(lhs - lambdaMax * weights[i]) < 1e-9, '第 ' + (i + 1) + ' 行 Aw = λmax·w');
  });
  const c = consistency(A, weights);
  assert.ok(Math.abs(c.ci - (lambdaMax - 3) / 2) < 1e-12, 'CI 公式');
  assert.ok(Math.abs(c.cr - c.ci / 0.58) < 1e-12, 'CR 公式');
});

test('AHP：完全一致的矩阵 CR 必须精确为 0', () => {
  const w = [0.5, 0.3, 0.2];
  const A = w.map(a => w.map(b => a / b));
  const { weights, lambdaMax } = priorityVector(A);
  assert.ok(Math.abs(lambdaMax - 3) < 1e-9, 'λmax 应为 n');
  w.forEach((expect, i) => assert.ok(Math.abs(weights[i] - expect) < 1e-9, '权重还原为原始比例'));
  const c = consistency(A, weights);
  assert.ok(Math.abs(c.cr) < 1e-9, 'CR 应为 0');
});
