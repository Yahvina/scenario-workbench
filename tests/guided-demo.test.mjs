import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuidedDemoProject } from '../src/fixtures/guided-demo.mjs';
import { createProjectStore } from '../src/core/project-store.mjs';
import { joinBaseline } from '../src/modules/elements/baseline.mjs';
import { prepareRun, solve } from '../src/modules/solver/engine.mjs';
import { planAtYear, changeYearState } from '../src/modules/elements/state-plan.mjs';
import { referenceCoverage } from '../src/modules/relationships/reference.mjs';
import { progressText, progressFacts } from '../src/modules/shared/flow-progress.mjs';
import { namedPlan, createLibrary, emptyBundle } from '../src/modules/workspace/saved-work.mjs';
import { validateProject } from '../src/core/contracts.mjs';

const demo = () => createGuidedDemoProject();

test('完整流程示例：契约可过、两年年度状态齐、两个方向 18 格全有分', () => {
  const p = demo();
  validateProject(p);
  assert.deepEqual(p.scope.years, [2030, 2035]);
  for (const year of [2030, 2035]) {
    const plan = planAtYear(p, year);
    assert.ok(plan.complete, year + ' 年方案必须完整');
  }
  assert.equal(p.data.judgments.length, 2);
  for (const j of p.data.judgments) {
    assert.equal(j.entries.length, 9);
    assert.ok(j.entries.every(e => Number.isInteger(e.score) && Math.abs(e.score) <= 3));
    assert.equal(j.scope.regionId, p.scope.regionId);
    assert.ok(j.validYears.includes(2030) && j.validYears.includes(2035));
  }
  // 机制演示口径：全部记录都是 fixture 来源，不冒充真实政策。
  assert.ok(p.data.judgments.every(j => j.provenance.origin === 'fixture'));
});

test('完整流程示例：真实引擎直接算出 9 个组合、2 个自洽', () => {
  const p = demo();
  const prepared = prepareRun(p, {
    year: 2030,
    selectedJudgmentIds: p.data.judgments.map(j => j.id),
    assumptionAcknowledgements: { currentAssumptions: true, unknownStateScope: true }
  });
  assert.ok(prepared.input, '示例必须能直接进入求解：' + JSON.stringify(prepared.diagnostics.filter(d => d.classification === 'block')));
  const result = solve(prepared.input);
  assert.equal(result.status, 'completed');
  assert.equal(result.checked, 9);
  assert.equal(result.count, 2);
});

test('完整流程示例：参考评分入口如实说“没有空白格可填”的量级（覆盖 2/2 方向）', () => {
  const p = demo();
  const cov = referenceCoverage(p);
  assert.equal(cov.state, 'ok');
  assert.equal(cov.matched, 2);
  assert.equal(cov.total, 2);
});

test('保存为新方案：在项目副本上落状态，当前项目年度安排一个不动', () => {
  const p = demo();
  const scenario = { 'mech-a': 'mech-a-s3', 'mech-b': 'mech-b-s3' };
  let clone = structuredClone(p);
  for (const [id, stateId] of Object.entries(scenario)) clone = changeYearState(clone, id, 2030, stateId, () => crypto.randomUUID());
  const plan = namedPlan(clone, '自洽组合 1 · 2030', scenario);
  validateProject(plan.project);
  // 原项目 2030 年状态未被改动
  assert.equal(planAtYear(p, 2030).config['mech-a'], 'mech-a-s1');
  assert.equal(planAtYear(p, 2030).config['mech-b'], 'mech-b-s1');
  // 副本里 2030 年已改为组合状态，2035 保持原样
  assert.equal(planAtYear(clone, 2030).config['mech-a'], 'mech-a-s3');
  assert.equal(planAtYear(clone, 2035).config['mech-a'], 'mech-a-s2');
  // 命名库真实写入（内存桩）
  const store = new Map([['scenario-workbench.saved-work.v1', null]]);
  const library = createLibrary({ getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) });
  library.merge({ ...emptyBundle(), plans: [plan] });
  const loaded = library.load();
  assert.ok(loaded.ok);
  assert.equal(loaded.bundle.plans.length, 1);
  assert.equal(loaded.bundle.plans[0].name, '自洽组合 1 · 2030');
});

test('参考覆盖：46 目录示例起点 2/2，无关因素 none，单因素 need-factors', () => {
  const empty = createProjectStore('t-cov').read();
  assert.equal(referenceCoverage(empty).state, 'need-factors');
  const base = joinBaseline(empty).project;
  base.selection = {
    nodeIds: [base.data.taxonomy.find(n => n.descriptorIds.includes('d46-20')).id, base.data.taxonomy.find(n => n.descriptorIds.includes('d46-23')).id],
    descriptorIds: ['d46-20', 'd46-23'], stateIds: [], lockedStateIds: []
  };
  const starter = referenceCoverage(base);
  assert.equal(starter.state, 'ok');
  assert.equal(starter.matched, 2);
  assert.equal(starter.total, 2);
  base.selection = { ...base.selection, descriptorIds: ['d46-01', 'd46-02'], nodeIds: [base.data.taxonomy.find(n => n.descriptorIds.includes('d46-01')).id, base.data.taxonomy.find(n => n.descriptorIds.includes('d46-02')).id] };
  assert.equal(referenceCoverage(base).state, 'none', '无规则因素必须如实说 none，不给无效按钮');
});

test('进度摘要：按真实数据定位缺项（因素/年份/方向），不输出矛盾反馈', () => {
  const empty = createProjectStore('t-flow').read();
  assert.match(progressText('elements', empty).text, /尚未选择研究因素/);
  // 零因素时不许输出“2030 还缺的状态”这类空缺项句子，也不许说状态已齐
  const emptySolver = progressText('solver', empty).text;
  assert.doesNotMatch(emptySolver, /还缺的状态/);
  assert.doesNotMatch(emptySolver, /状态已齐/);
  assert.match(emptySolver, /年度状态未开始/);
  const p = demo();
  p.selection.descriptorIds = ['mech-a', 'mech-b'];
  // 删掉 2035 年 mech-b 的状态 → 摘要必须点名因素与年份
  const b = structuredClone(p);
  const plan = b.data.paths.find(x => x.id === 'guided-plan-mech-b');
  plan.points = plan.points.filter(pt => pt.year !== 2035);
  const facts = progressFacts(b);
  assert.equal(facts.missingYearStates.length, 1);
  assert.equal(facts.missingYearStates[0].year, 2035);
  assert.ok(facts.missingYearStates[0].missing.includes('单位产品能耗限额强度'));
  const text = progressText('elements', b).text;
  assert.match(text, /2030 状态已齐/);
  assert.match(text, /2035 还缺「单位产品能耗限额强度」/);
  const rel = progressText('relationships', b);
  assert.match(rel.text, /已判 2 \/ 2 个方向/);
});
