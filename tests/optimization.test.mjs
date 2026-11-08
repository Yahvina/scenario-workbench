import test from 'node:test';
import assert from 'node:assert/strict';
import { rankAlternatives, changeFrequency } from '../src/modules/optimization/logic.mjs';

const input = { activeDescriptorIds: ['A', 'B', 'C'], lockedStateIds: [] };
const current = { A: 'A0', B: 'B0', C: 'C0' };
const run = {
  count: 5,
  all: [
    { A: 'A0', B: 'B0', C: 'C0' }, // 距离 0
    { A: 'A0', B: 'B0', C: 'C1' }, // 距离 1
    { A: 'A1', B: 'B0', C: 'C0' }, // 距离 1
    { A: 'A1', B: 'B1', C: 'C1' }, // 距离 3
    { A: 'A1', B: 'B0', C: 'C1' }  // 距离 2
  ]
};

test('按差异数排序，完全相同的排第一并单独标出', () => {
  const ranked = rankAlternatives(input, run, current);
  assert.equal(ranked.rows[0].distance, 0);
  assert.equal(ranked.rows[0].sameAsPlan, true);
  assert.deepEqual(ranked.rows.map(r => r.distance), [0, 1, 1, 2, 3]);
  assert.equal(ranked.total, 5);
  assert.equal(ranked.complete, true);
});

test('每条候选列出具体改了哪个变量、从什么改成什么', () => {
  const ranked = rankAlternatives(input, run, current);
  const one = ranked.rows.find(r => r.distance === 2);
  assert.equal(one.changes.length, 2);
  assert.ok(one.changes.some(c => c.descriptorId === 'A' && c.from === 'A0' && c.to === 'A1'));
});

test('候选被截断时如实标记，不假装覆盖全部自洽组合', () => {
  const partial = { count: 99, all: run.all };
  const ranked = rankAlternatives(input, partial, current);
  assert.equal(ranked.sample, 5);
  assert.equal(ranked.total, 99);
  assert.equal(ranked.complete, false);
});

test('候选为空时不报错：如实返回 0 条，界面据此说“这次没有自洽组合”', () => {
  const ranked = rankAlternatives(input, { count: 0, all: [] }, current);
  assert.equal(ranked.rows.length, 0);
  assert.equal(ranked.sample, 0);
  assert.equal(ranked.total, 0);
});

test('改动频次统计到具体状态，便于看出常见调整', () => {
  const ranked = rankAlternatives(input, run, current);
  const freq = changeFrequency(ranked.rows, input.activeDescriptorIds);
  assert.equal(freq.get('C').get('C1'), 3);
  assert.equal(freq.get('A').get('A1'), 3);
  assert.equal(freq.get('B').get('B1'), 1);
});
