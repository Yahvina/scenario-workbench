import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectStore } from '../src/core/project-store.mjs';
import { validateProject } from '../src/core/contracts.mjs';
import { buildBaseline, baselineCounts, DESCRIPTOR_TREE, OUTCOME_DESCRIPTORS, BASELINE_LABELS } from '../src/fixtures/descriptors-46.mjs';
import { joinBaseline, baselinePresence, descriptorNodeId } from '../src/modules/elements/baseline.mjs';

const empty = () => createProjectStore('t-46').read();

test('图示基线：10 个领域、34 个细分领域、46 项具体描述符，结果指标另列 2 项', () => {
  const counts = baselineCounts();
  assert.equal(counts.domains, 10);
  assert.equal(counts.sections, 34);
  assert.equal(counts.leaves, 46);
  assert.equal(counts.outcomes, 2);
  assert.equal(DESCRIPTOR_TREE.length, 10);
  assert.equal(BASELINE_LABELS.length, 46);
  assert.equal(new Set(BASELINE_LABELS).size, 46, '46 个名称必须互不重复');
  assert.equal(OUTCOME_DESCRIPTORS.length, 2);
  assert.deepEqual(OUTCOME_DESCRIPTORS.map(d => d.label), ['一次能源结构', '终端电气化率']);
});

test('每个描述符恰好 3 个状态，状态归属正确，ID 唯一', () => {
  const b = buildBaseline();
  assert.equal(b.descriptors.length, 48);
  assert.equal(b.descriptors.filter(d => !d.outcome).length, 46);
  assert.equal(b.states.length, 48 * 3);
  assert.equal(new Set(b.descriptors.map(d => d.id)).size, 48);
  assert.equal(new Set(b.states.map(d => d.id)).size, 144);
  for (const d of b.descriptors) {
    assert.equal(d.stateIds.length, 3, d.label);
    for (const id of d.stateIds) assert.equal(b.states.find(s => s.id === id).descriptorId, d.id);
  }
});

test('分类节点不携带计算变量，只有末级节点指向描述符', () => {
  const b = buildBaseline();
  for (const node of b.taxonomy) {
    if (node.level === 1 || (node.level === 2 && node.kind === 'category')) {
      assert.deepEqual(node.descriptorIds, [], node.id + ' 分类节点不能直接当计算变量');
    }
  }
  const leaves = b.taxonomy.filter(n => n.kind === 'leaf');
  assert.equal(leaves.length, 48);
  for (const leaf of leaves) assert.equal(leaf.descriptorIds.length, 1);
});

test('父子关系对称，可被项目契约校验', () => {
  const b = buildBaseline();
  const byId = new Map(b.taxonomy.map(n => [n.id, n]));
  for (const node of b.taxonomy) {
    for (const parent of node.parentIds) assert.ok(byId.get(parent).childIds.includes(node.id), node.id);
    for (const child of node.childIds) assert.ok(byId.get(child).parentIds.includes(node.id), node.id);
  }
  const project = joinBaseline(empty()).project;
  assert.equal(validateProject(project), true);
  assert.equal(project.data.descriptors.filter(d => !d.id.startsWith('d46-out-')).length, 46);
  assert.equal(baselinePresence(project).complete, true);
});

test('加入目录是幂等的：重复加入不新增记录，也不改项目身份与选择', () => {
  const first = joinBaseline(empty());
  const second = joinBaseline(first.project);
  assert.equal(second.added, 0);
  assert.equal(second.project.data.taxonomy.length, first.project.data.taxonomy.length);
  assert.equal(second.project.id, first.project.id);
  assert.deepEqual(second.project.selection, first.project.selection);
});

test('加入目录不覆盖已有项目：评分与年度安排原样保留', () => {
  const base = joinBaseline(empty()).project;
  const withScore = structuredClone(base);
  withScore.data.judgments.push({
    id: 'j1', sourceDescriptorId: 'd46-20', targetDescriptorId: 'd46-23', scope: { regionId: '京津冀' },
    validYears: [2030], entries: [{ sourceStateId: 'd46-20-st1', targetStateId: 'd46-23-st1', score: 1 }],
    version: 1, provenance: { origin: 'user', sourceId: 't', locator: 't' }, evidenceRefs: []
  });
  const again = joinBaseline(withScore).project;
  assert.equal(again.data.judgments.length, 1);
  assert.equal(again.data.judgments[0].id, 'j1');
});

test('描述符能定位到唯一末级节点', () => {
  const project = joinBaseline(empty()).project;
  assert.equal(descriptorNodeId(project, 'd46-20'), 'd46-g04-s01-n01');
  assert.equal(descriptorNodeId(project, 'd46-out-01'), 'd46-node-outcome-1');
});
