import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatrix, priorityVector, consistency, riFor, rankedWeights, SAATY_VALUES } from '../src/modules/importance/logic.mjs';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, a + ' vs ' + b);

test('Sa：已知一致矩阵的权重就是原始比例', () => {
  // w = (0.5, 0.3, 0.2)：任意两行比等于权重比，矩阵一致，λmax 应为 3
  const ids = ['a', 'b', 'c'];
  const pairs = { 'a|b': 0.5 / 0.3, 'a|c': 0.5 / 0.2, 'b|c': 0.3 / 0.2 };
  const { A, complete } = buildMatrix(ids, pairs);
  assert.equal(complete, true);
  const { weights, lambdaMax } = priorityVector(A);
  close(weights[0], 0.5, 1e-9); close(weights[1], 0.3, 1e-9); close(weights[2], 0.2, 1e-9);
  close(lambdaMax, 3, 1e-9);
  const c = consistency(A, weights);
  assert.equal(c.applies, true);
  close(c.ci, 0, 1e-9);
  close(c.cr, 0, 1e-9);
  assert.equal(c.acceptable, true);
});

test('矛盾矩阵的 CR 超过 0.1，判为需要重看比较', () => {
  // 经典不一致例：a 比 b 好得多、b 比 c 好得多，但 c 又比 a 好
  const A = [
    [1, 3, 1 / 2],
    [1 / 3, 1, 4],
    [2, 1 / 4, 1]
  ];
  const { weights } = priorityVector(A);
  const c = consistency(A, weights);
  assert.ok(c.cr > 0.1, 'CR 应超过 0.1，实际 ' + c.cr);
  assert.equal(c.acceptable, false);
});

test('n=2 时不给 CR，也不说“矛盾”', () => {
  const { A } = buildMatrix(['a', 'b'], { 'a|b': 3 });
  const c = consistency(A);
  assert.equal(c.applies, false);
  assert.equal(c.cr, null);
  assert.equal(c.acceptable, true);
});

test('缺失比较如实列出，不补 1', () => {
  const { A, missing, complete } = buildMatrix(['a', 'b', 'c'], { 'a|b': 2 });
  assert.equal(complete, false);
  assert.deepEqual(missing.map(m => m.a + '|' + m.b).sort(), ['a|c', 'b|c']);
  assert.equal(A[0][2], null);
});

test('非法标度（0、负数、空）不算已填', () => {
  const { missing } = buildMatrix(['a', 'b', 'c'], { 'a|b': 0, 'a|c': -3, 'b|c': '' });
  assert.equal(missing.length, 3);
});

test('RI 表：越界返回 null，n≤2 为 0', () => {
  assert.equal(riFor(1), 0);
  assert.equal(riFor(2), 0);
  close(riFor(3), 0.58);
  assert.equal(riFor(99), null);
  assert.equal(riFor(0), null);
});

test('权重排序：和接近 1，排序按权重降序，标度方向不被读反', () => {
  // a 比 b 重要 5 倍；a 比 c 重要 3 倍；b 只抵 c 的一半 ⇒ a > c > b
  const { A } = buildMatrix(['a', 'b', 'c'], { 'a|b': 5, 'a|c': 3, 'b|c': 1 / 2 });
  const { weights } = priorityVector(A);
  close(weights.reduce((x, y) => x + y, 0), 1, 1e-9);
  const ranked = rankedWeights(['a', 'b', 'c'], { a: '甲', b: '乙', c: '丙' }, weights);
  assert.deepEqual(ranked.map(r => r.id), ['a', 'c', 'b']);
  assert.equal(ranked[0].label, '甲');
  assert.ok(weights[0] > weights[2] && weights[2] > weights[1], '权重顺序 a > c > b');
});

test('标度表只含正数与 1–9 及倒数的取值', () => {
  const values = SAATY_VALUES.map(([, v]) => v);
  assert.ok(values.every(v => v > 0));
  assert.ok(values.includes(1));
  assert.ok(values.includes(9));
  close(values[0], 1 / 9);
});

test('权重不受索引顺序影响：交换两个变量后权重跟着换位', () => {
  const ids = ['a', 'b', 'c'];
  const pairs = { 'a|b': 3, 'a|c': 6, 'b|c': 2 };
  const { A } = buildMatrix(ids, pairs);
  const first = priorityVector(A).weights;
  const swapped = buildMatrix(['b', 'a', 'c'], { 'b|a': 1 / 3, 'b|c': 2, 'a|c': 6 }).A;
  const second = priorityVector(swapped).weights;
  close(first[0], second[1], 1e-9);
  close(first[1], second[0], 1e-9);
  close(first[2], second[2], 1e-9);
});
