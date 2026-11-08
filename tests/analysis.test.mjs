import test from 'node:test';
import assert from 'node:assert/strict';
import {stateDistribution, pairingConstraints} from '../src/modules/analysis/logic.mjs';

// 两个因素 × 三个状态，全 9 条组合；其中 (A1,B2) 与 (A2,B0) 从未自洽出现。
const input = {activeDescriptorIds:['A','B'],matrix:{stateIdsByDescriptor:{A:['A0','A1','A2'],B:['B0','B1','B2']}}};
const all = [];
for (const a of ['A0','A1','A2']) for (const b of ['B0','B1','B2']) if (!(a==='A1'&&b==='B2') && !(a==='A2'&&b==='B0')) all.push({A:a,B:b});
const run = {count:7, all, scenarios:all, stateCounts:{A:{A0:3,A1:2,A2:2},B:{B0:2,B1:3,B2:2}}};

test('被绑定的搭配：出现过的搭配数少于可能数，且按出现次数排序', () => {
  const data = pairingConstraints(input, run, run.all);
  const pair = data.pairs[0];
  assert.equal(pair.possible, 9);
  assert.equal(pair.used, 7);
  assert.ok(pair.coverage < 1, '应被判定为被绑定');
  assert.equal(pair.combos.length, 7);
  const top = pair.combos[0];
  assert.ok(top.count >= pair.combos.at(-1).count, '按出现次数降序');
  assert.equal(data.complete, true);
});

test('全部搭配都出现时 coverage=1，界面据此判断“没有被额外绑定”', () => {
  const every = [];
  for (const a of ['A0','A1','A2']) for (const b of ['B0','B1','B2']) every.push({A:a,B:b});
  const data = pairingConstraints(input, {...run, count:9}, every);
  assert.equal(data.pairs[0].used, 9);
  assert.equal(data.pairs[0].coverage, 1);
  assert.equal(data.pairs.filter(p=>p.coverage<1).length, 0);
});

test('组合里缺少某个因素的状态时不崩、也不虚增搭配', () => {
  const broken = [...all, {A:'A0'}];
  const trimmed = pairingConstraints(input, {...run, count:7}, broken);
  assert.equal(trimmed.sample, 8);
  assert.equal(trimmed.pairs[0].used, 7, '缺因素的行不虚增搭配');
  const truncated = pairingConstraints(input, {...run, count:20}, all);
  assert.equal(truncated.sample, 7);
  assert.equal(truncated.complete, false);
});

