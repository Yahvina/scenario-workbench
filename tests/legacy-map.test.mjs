import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectStore } from '../src/core/project-store.mjs';
import { createJJJDraftProject } from '../src/fixtures/jjj-draft.mjs';
import { buildBaseline } from '../src/fixtures/descriptors-46.mjs';
import { LEGACY_MAP, mappingSummary, migrateSelection, MAPPING_CATEGORIES } from '../src/fixtures/legacy-map.mjs';
import { joinBaseline, descriptorNodeId } from '../src/modules/elements/baseline.mjs';

const ids = list => new Set(list.map(item => item.id));

test('旧目录 24 项逐条都有对照，不重不漏', () => {
  const legacy = createJJJDraftProject();
  const legacyIds = ids(legacy.data.descriptors);
  assert.equal(legacyIds.size, 24);
  assert.equal(LEGACY_MAP.length, 24);
  assert.equal(new Set(LEGACY_MAP.map(row => row.legacy)).size, 24);
  for (const row of LEGACY_MAP) assert.ok(legacyIds.has(row.legacy), '对照引用了不存在的旧描述符：' + row.legacy);
  const summary = mappingSummary();
  assert.equal(summary.total, 24);
  assert.equal(summary.same + summary.partial + summary.split + summary.merged + summary.unmatched, 24);
  assert.deepEqual(MAPPING_CATEGORIES.map(c => c.id), ['same', 'partial', 'split', 'merged', 'unmatched']);
});

test('对照关系分类：同义 2、部分对应 6、拆分 3、合并 5、未匹配 8（含 2 项转结果指标）', () => {
  const summary = mappingSummary();
  assert.equal(summary.same, 2);
  assert.equal(summary.partial, 6);
  assert.equal(summary.split, 3);
  assert.equal(summary.merged, 5);
  assert.equal(summary.unmatched, 8);
  assert.equal(summary.outcomes, 2);
  for (const row of LEGACY_MAP) {
    if (row.relation === 'split') assert.ok(row.targets.length >= 2, row.label + ' 拆分必须落到多个新项');
    if (row.relation === 'same' || row.relation === 'partial' || row.relation === 'merged') assert.equal(row.targets.length, 1, row.label);
    if (row.relation === 'unmatched') assert.equal(row.targets.length, 0, row.label);
  }
});

test('所有新体系目标都真实存在，结果指标单独标注', () => {
  const baseline = buildBaseline();
  const known = ids(baseline.descriptors);
  for (const row of LEGACY_MAP) {
    for (const target of row.targets) assert.ok(known.has(target), row.label + ' → ' + target + ' 不在 46 项体系里');
    if (row.outcome) assert.ok(known.has(row.outcome), row.label + ' 的结果指标目标不存在');
  }
  const outcomeRows = LEGACY_MAP.filter(row => row.outcome);
  assert.deepEqual(outcomeRows.map(row => row.outcome), ['d46-out-01', 'd46-out-02']);
});

function projectWithLegacySelection(legacyIds) {
  const legacy = createJJJDraftProject();
  const project = createProjectStore('t-legacy').read();
  const merged = structuredClone(project);
  for (const key of ['taxonomy', 'descriptors', 'states', 'evidence']) merged.data[key] = structuredClone(legacy.data[key]);
  merged.selection = { nodeIds: [], descriptorIds: legacyIds, stateIds: [], lockedStateIds: [] };
  const joined = joinBaseline(merged).project;
  // 旧项目可能已有旧评分：迁移不得把它复制到新描述符上。
  joined.data.judgments.push({
    id: 'old-j1', sourceDescriptorId: 'jjj-d20', targetDescriptorId: 'jjj-d21', scope: { regionId: '京津冀' },
    validYears: [2030], entries: [], version: 1, provenance: { origin: 'user', sourceId: 't', locator: 't' }, evidenceRefs: []
  });
  return joined;
}

test('迁移只改选择：拆分项不复制旧状态与旧评分', () => {
  const project = projectWithLegacySelection(['jjj-d20', 'jjj-d21']);
  const plan = migrateSelection(project, id => descriptorNodeId(project, id));
  assert.equal(plan.legacySelected, 2);
  assert.deepEqual([...plan.descriptorIds].sort(), ['d46-01', 'd46-02', 'd46-03']);
  assert.equal(plan.nodeIds.length, 3);
  assert.equal(plan.gaps.length, 0);
  assert.match(plan.notCarried, /没有迁移|均未迁移/);
  // 迁移结果里没有任何旧状态或旧评分字段
  assert.equal(Object.keys(plan).includes('states'), false);
  assert.equal(Object.keys(plan).includes('entries'), false);
  // 原项目未被修改
  assert.deepEqual(project.selection.descriptorIds, ['jjj-d20', 'jjj-d21']);
  assert.equal(project.data.judgments.length, 1);
  assert.equal(project.selection.stateIds.length, 0);
});

test('未匹配项明确列出缺口，不静默丢弃', () => {
  const project = projectWithLegacySelection(['jjj-d4', 'jjj-d7', 'jjj-d1']);
  const plan = migrateSelection(project, id => descriptorNodeId(project, id));
  assert.equal(plan.descriptorIds.length, 0);
  assert.equal(plan.gaps.length, 3);
  assert.match(plan.gaps.map(g => g.reason).join(' '), /结果指标/);
});

test('目录未加入时不迁移，说明缺什么', () => {
  const legacy = createJJJDraftProject();
  const project = structuredClone(legacy);
  project.selection.descriptorIds = ['jjj-d20'];
  const plan = migrateSelection(project, () => null);
  assert.equal(plan.descriptorIds.length, 0);
  assert.equal(plan.unresolved.length, 1);
  assert.match(plan.unresolved[0].reason, /46 项目录/);
});
