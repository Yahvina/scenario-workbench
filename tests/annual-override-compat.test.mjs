// P7-C2A 兼容原型专项验收：格式往返与负控。
// 原型代码在 docs/research/annual-override/compat.mjs，不在发布构建入口内。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  ARCHIVE_V2,
  BUNDLE_V2,
  CompatError,
  PROJECT_V1,
  PROJECT_V2,
  V2_COLLECTIONS,
  adoptionBlock,
  bindingUsable,
  buildArchiveV2,
  currentReading,
  externalFileWithForgedConfirmation,
  historyEntries,
  latestOverride,
  makeBinding,
  makeOverride,
  minimalArchiveV1,
  minimalArchiveV2,
  minimalBundleV1,
  minimalProjectV1,
  prepareRunThroughProjection,
  projectSnapshotV2,
  projectVersion,
  readSource,
  rejectionCases,
  restorePlanFromBundle,
  restoreRunFromBundle,
  solverProjection,
  snapshotToProjectV2,
  stateAdviceWithoutBinding,
  toProjectV1,
  toSnapshotV1,
  upgradeBundleV1,
  upgradeProjectV1,
  validateArchiveDispatch,
  validateArchiveV2,
  validateBundleDispatch,
  validateBundleV2,
  validateIndicatorBindings,
  validateProjectDispatch,
  validateProjectV2
} from '../docs/research/annual-override/compat.mjs';
import { validateProject } from '../src/core/contracts.mjs';
import { inspectInput } from '../src/modules/solver/engine.mjs';
import { DATA_KEYS } from '../src/core/contracts.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const clone = value => structuredClone(value);
const caught = run => {
  try { run(); return null; } catch (error) { assert.ok(error instanceof CompatError, '拒绝必须是 CompatError，实际：' + error); return error; }
};
const caughtAny = run => {
  try { run(); return null; } catch (error) { return error; }
};

/* ----------------------------------------------------------- 版本分派与投影 */

test('the prototype classifies project, archive and bundle versions independently', () => {
  const v1 = minimalProjectV1();
  const v2 = upgradeProjectV1(v1, { commit: true });
  assert.equal(projectVersion(v1), 'v1');
  assert.equal(projectVersion(v2), 'v2');
  assert.equal(projectVersion({ schemaVersion: 3, contractVersion: '1.2.0' }), 'unknown');
  assert.equal(projectVersion(null), 'unknown');
  assert.ok(validateProjectDispatch(v1));
  assert.ok(validateProjectDispatch(v2));
  assert.ok(validateArchiveDispatch(minimalArchiveV1()));
  assert.ok(validateArchiveDispatch(minimalArchiveV2()));
  assert.ok(validateBundleDispatch(minimalBundleV1()));
  assert.equal(minimalBundleV1().archiveVersion, 1);
  assert.equal(V2_COLLECTIONS.length, 2);
});

test('opening an old project keeps it untouched and the upgrade is an explicit copy', () => {
  const v1 = minimalProjectV1();
  const before = clone(v1);
  assert.equal(validateProjectDispatch(v1), true, '旧项目必须仍按原实现可读');
  assert.deepEqual(v1, before, '读取旧项目不得改写原对象');

  const preview = upgradeProjectV1(v1, { commit: false });
  assert.deepEqual(v1, before, '预览升级不得改写原对象');
  assert.deepEqual({ schemaVersion: preview.schemaVersion, contractVersion: preview.contractVersion }, PROJECT_V2);
  assert.equal(preview.revision, v1.revision, '预览升级不改修订号');

  const upgraded = upgradeProjectV1(v1, { commit: true });
  assert.deepEqual(v1, before, '真实升级不得改写原对象');
  assert.equal(upgraded.revision, v1.revision + 1, '真实采用升级后修订加一');
  assert.deepEqual(upgraded.data.indicatorBindings, []);
  assert.deepEqual(upgraded.data.annualOverrides, []);
  assert.equal(upgraded.id, v1.id);
  assert.deepEqual(upgraded.scope, v1.scope);
  assert.deepEqual(upgraded.selection, v1.selection);
  for (const key of DATA_KEYS) assert.deepEqual(upgraded.data[key], v1.data[key], '原集合必须保留：' + key);
  assert.equal(Object.keys(upgraded.data).length, DATA_KEYS.length + 2);
  assert.ok(validateProjectV2(upgraded));
  assert.ok(validateProject(toProjectV1(upgraded)), '投影必须能过原实现');
});

test('the V1 projection drops only the two new collections and keeps identity', () => {
  const v2 = upgradeProjectV1(minimalProjectV1(), { commit: true });
  v2.data.indicatorBindings = [makeBinding(v2)];
  v2.data.annualOverrides = [];
  const projection = toProjectV1(v2);
  assert.equal(Object.keys(projection.data).length, DATA_KEYS.length);
  assert.ok(!Object.hasOwn(projection.data, 'indicatorBindings'));
  assert.ok(!Object.hasOwn(projection.data, 'annualOverrides'));
  assert.equal(projection.id, v2.id);
  assert.equal(projection.revision, v2.revision);
  assert.deepEqual(projection.scope, v2.scope);
  assert.deepEqual(projection.selection, v2.selection);
  assert.equal(projection.schemaVersion, PROJECT_V1.schemaVersion);
  for (const key of DATA_KEYS) assert.deepEqual(projection.data[key], v2.data[key]);
});

test('the solver projection prepares a run that the current engine accepts', () => {
  const v2 = upgradeProjectV1(minimalProjectV1(), { commit: true });
  const projection = solverProjection(v2);
  assert.ok(!Object.hasOwn(projection.data, 'indicatorBindings'));
  const prepared = prepareRunThroughProjection(v2, {
    year: v2.scope.years[0],
    selectedJudgmentIds: v2.data.judgments.map(judgment => judgment.id),
    assumptionAcknowledgements: { currentAssumptions: true, unknownStateScope: true }
  });
  assert.ok(prepared.input, '投影必须能构造有效输入：' + JSON.stringify(prepared.diagnostics));
  assert.equal(prepared.input.projectId, v2.id);
  assert.equal(prepared.input.revision, v2.revision);
  assert.deepEqual(prepared.input.scope, v2.scope);
  assert.deepEqual(prepared.input.activeDescriptorIds, v2.selection.descriptorIds);
  assert.ok(inspectInput(prepared.input).space > 0n);
  // 覆盖与绑定都不进入求解输入：锁定状态与分数保持原样。
  assert.deepEqual(prepared.input.lockedStateIds, v2.selection.lockedStateIds);
});

/* --------------------------------------------------------------- 封套重验 */

test('the V2 envelope passes both the new snapshot check and the original envelope check', () => {
  const { archive, prepared } = buildArchiveV2(minimalProjectV1(), {
    year: 2030,
    selectedJudgmentIds: minimalProjectV1().data.judgments.map(judgment => judgment.id),
    assumptionAcknowledgements: { currentAssumptions: true, unknownStateScope: true }
  });
  assert.ok(prepared.input);
  assert.equal(archive.archiveVersion, ARCHIVE_V2);
  assert.equal(archive.projectInputSnapshot.schemaVersion, PROJECT_V2.schemaVersion);
  assert.ok(validateArchiveV2(archive));
  // 同一份 V1 投影走原验证器也通过（一条路径两块证据：新快照 + 旧规则）
  const probe = { ...archive, archiveVersion: 1, projectInputSnapshot: toSnapshotV1(toProjectV1(snapshotToProjectV2(archive.projectInputSnapshot))) };
  assert.ok(validateArchiveDispatch(probe), 'V2 快照投影后必须能过旧验证器');
});

test('the V1 envelope is still read by the original rules and the old archive is never rewritten', () => {
  const v1 = minimalBundleV1();
  const before = clone(v1);
  const run = v1.runs[0];
  // 原实现按原规则校验并返回深拷贝；这里断言内容逐字一致且原库未被改写。
  assert.deepEqual(validateBundleDispatch(v1), v1, '旧库仍按原规则校验且内容一致');
  const restored = restoreRunFromBundle(v1, run.id);
  assert.deepEqual(restored, run.archive, '旧归档必须原样取回');
  assert.equal(restored.archiveVersion, 1);
  assert.deepEqual(v1, before, '读取旧库不得改写原字节/对象');
  const plan = restorePlanFromBundle(v1, v1.plans[0].id);
  assert.equal(projectVersion(plan), 'v1', '旧方案保持旧版本，不隐式升级');
  assert.deepEqual(plan, v1.plans[0].project);
});

/* ----------------------------------------------------------------- 库适配 */

test('a V2 bundle keeps the old outer shape, quota and record metadata rules', () => {
  const v1 = minimalBundleV1();
  const before = clone(v1);
  const v2 = upgradeBundleV1(v1);
  assert.deepEqual(v1, before, '库升级不得改写原库');
  assert.equal(v2.archiveVersion, BUNDLE_V2);
  assert.deepEqual(v2.plans, v1.plans, '历史方案原样保留');
  assert.deepEqual(v2.runs, v1.runs, '历史运行字段与结果原样保留');
  assert.equal(projectVersion(restorePlanFromBundle(v2, v2.plans[0].id)), 'v1');
  assert.equal(restoreRunFromBundle(v2, v2.runs[0].id).archiveVersion, 1);
  assert.ok(validateBundleV2(v2));
  assert.ok(validateBundleDispatch(v2));
  assert.equal(Object.keys(v2).sort().join(','), 'archiveVersion,format,plans,runs');
});

test('a mixed V2 bundle restores both old and new plans and runs', () => {
  const v1 = minimalBundleV1();
  const upgraded = upgradeProjectV1(minimalProjectV1(), { commit: true });
  const binding = makeBinding(upgraded);
  upgraded.data.indicatorBindings = [binding];
  upgraded.data.annualOverrides = [makeOverride(upgraded, binding, { baseline: { reading: 50, method: 'linear', evidenceRefs: [] }, verdict: { status: 'within', detail: '仍在原状态范围', candidateStateIds: [] } })];
  const newArchive = minimalArchiveV2();
  const bundle = {
    format: 'scenario-workbench.saved-work',
    archiveVersion: BUNDLE_V2,
    plans: [...v1.plans, { id: 'plan-v2', name: '新命名方案', createdAt: '2026-11-04T12:00:00.000Z', project: upgraded }],
    runs: [...v1.runs, { id: 'run-v2', name: '新历史检算', createdAt: '2026-11-04T12:00:00.000Z', archive: newArchive }]
  };
  assert.ok(validateBundleV2(bundle));
  assert.equal(projectVersion(restorePlanFromBundle(bundle, 'plan-v1')), 'v1');
  assert.equal(projectVersion(restorePlanFromBundle(bundle, 'plan-v2')), 'v2');
  assert.equal(restoreRunFromBundle(bundle, 'run-v1').archiveVersion, 1);
  assert.equal(restoreRunFromBundle(bundle, 'run-v2').archiveVersion, ARCHIVE_V2);
  assert.equal(latestOverride(restorePlanFromBundle(bundle, 'plan-v2'), { regionId: upgraded.scope.regionId, pathId: 'compat-path-a', year: upgraded.scope.years[0] }).value, 75);
});

/* --------------------------------------------------------- 历史链与最新值 */

test('the append-only history chain accepts revoke and reports the latest value', () => {
  const project = upgradeProjectV1(minimalProjectV1(), { commit: true });
  const binding = makeBinding(project);
  const first = makeOverride(project, binding, { id: 'ov-1', seq: 1, value: 75 });
  const second = makeOverride(project, binding, { id: 'ov-2', seq: 2, previousId: 'ov-1', operation: 'set', value: 0 });
  const third = makeOverride(project, binding, { id: 'ov-3', seq: 3, previousId: 'ov-2', operation: 'revoke', value: null });
  project.data.annualOverrides = [first, second, third];
  assert.ok(validateProjectV2(project));
  const key = { regionId: project.scope.regionId, pathId: binding.pathId, year: binding.year };
  assert.equal(latestOverride(project, key).operation, 'baseline', '最新为撤销时回到基线');
  project.data.annualOverrides = [first, second];
  assert.equal(latestOverride(project, key).value, 0, '0 是有效采用值');
  // 同键重新采用后回到 set
  const fourth = makeOverride(project, binding, { id: 'ov-4', seq: 3, previousId: 'ov-2', value: 80 });
  project.data.annualOverrides = [first, second, third, { ...fourth, seq: 4, previousId: 'ov-3' }];
  assert.equal(latestOverride(project, key).value, 80);
});

/* ------------------------------------------------------- 外部文件与采用边界 */

test('one forged external file is readable as history, pending as current and blocked for adoption', () => {
  const file = externalFileWithForgedConfirmation();
  const binding = file.data.indicatorBindings[0];
  assert.equal(binding.verified, true, '文件自称已核验');
  assert.equal(binding.confirmation.declaredBy, '外部文件自称已核验');

  // 1. 历史查看：始终可读
  const history = historyEntries(file);
  assert.equal(history.bindings.length, 1);
  assert.equal(history.bindings[0].indicatorId, 'compat-indicator');
  assert.deepEqual(history.bindings[0].frozenStates, ['compat-a-1@v1', 'compat-a-2@v1']);
  assert.equal(history.overrides.length, 1);
  assert.equal(history.overrides[0].frozenVerdict.status, 'within');
  assert.deepEqual(history.overrides[0].key, [file.scope.regionId, binding.pathId, binding.year]);

  // 2. 待核：来源必须由调用方显式传入，文件内的声明无效
  assert.throws(() => readSource({}), /必须由调用方显式传入读取来源/);
  const external = currentReading(file, binding, { source: 'external' });
  assert.equal(external.usable, false);
  assert.equal(external.status, 'pending');
  const local = currentReading(file, binding, { source: 'local' });
  assert.equal(local.usable, true, '本地已提交记录走恢复入口');
  assert.equal(local.status, 'current');
  const blocked = adoptionBlock(file, binding, { source: 'external' });
  assert.equal(blocked.blocked, true, '外部文件不能直接采用');
  assert.match(blocked.reason, /外部导入的绑定或覆盖不能代替当前采用确认/);

  // 3. 没有当前有效绑定时，状态建议继续待核
  const advice = stateAdviceWithoutBinding(file, { descriptorId: 'compat-a', pathId: binding.pathId, year: binding.year, override: 75, referenceStateId: 'compat-a-2' });
  assert.equal(advice.verdict, 'pending');
  assert.deepEqual(advice.candidates, []);
  assert.match(advice.reasons.join('；'), /未经核验|缺少显式指标绑定/);

  // 项目自带的 reviewBinding 只能保留作原始字段
  const carried = clone(file);
  carried.data.paths[0].reviewBinding = { verified: true, unit: '示例单位' };
  const carriedAdvice = stateAdviceWithoutBinding(carried, { descriptorId: 'compat-a', pathId: binding.pathId, year: binding.year, override: 75, referenceStateId: 'compat-a-2' });
  assert.equal(carriedAdvice.verdict, 'pending', 'V1 的 path.reviewBinding 不能开启数值判定');
});

test('stale and forged current bindings are downgraded to pending, never adopted', () => {
  const project = upgradeProjectV1(minimalProjectV1(), { commit: true });
  const binding = makeBinding(project);
  assert.equal(bindingUsable(project, binding).status, 'current');

  const stalePath = clone(project);
  stalePath.data.paths[0].version = binding.pathVersion + 1;
  const staleReading = bindingUsable(stalePath, binding);
  assert.equal(staleReading.usable, false);
  assert.equal(staleReading.status, 'pending');
  assert.match(staleReading.problems.join('；'), /路径版本已变化/);

  const staleState = clone(project);
  staleState.data.states[0].version = binding.stateDefinitions[0].version + 1;
  assert.match(bindingUsable(staleState, binding).problems.join('；'), /状态定义版本已变化/);

  const wrongRegion = clone(project);
  wrongRegion.scope.regionId = '另一地区';
  assert.match(bindingUsable(wrongRegion, binding).problems.join('；'), /绑定地区与当前项目范围不一致/);

  const outOfScopeYear = clone(project);
  outOfScopeYear.scope.years = [2035];
  assert.match(bindingUsable(outOfScopeYear, binding).problems.join('；'), /绑定年份不在当前研究范围/);

  const wrongUnit = clone(project);
  wrongUnit.data.paths[0].unit = '另一单位';
  assert.match(bindingUsable(wrongUnit, binding).problems.join('；'), /绑定单位与当前路径不一致/);

  const removed = clone(project);
  removed.data.descriptors = removed.data.descriptors.filter(descriptor => descriptor.id !== binding.descriptorId);
  removed.data.states = removed.data.states.filter(state => state.descriptorId !== binding.descriptorId);
  removed.data.paths = removed.data.paths.filter(path => path.descriptorId !== binding.descriptorId);
  removed.selection.descriptorIds = removed.selection.descriptorIds.filter(id => id !== binding.descriptorId);
  removed.selection.stateIds = removed.selection.stateIds.filter(id => !binding.stateDefinitions.some(state => state.id === id));
  removed.data.judgments = removed.data.judgments.filter(judgment => judgment.sourceDescriptorId !== binding.descriptorId && judgment.targetDescriptorId !== binding.descriptorId);
  assert.ok(validateProjectV2(removed), '删除因素后夹具本身仍必须合法');
  assert.match(bindingUsable(removed, binding).problems.join('；'), /引用的因素已不存在/);
});

test('usage re-check covers path region, the full state set, each state year and region, and same-version content', () => {
  const project = upgradeProjectV1(minimalProjectV1(), { commit: true });
  const binding = makeBinding(project);

  // 正例：路径地区、状态集合、各状态年份与地区、冻结内容全部对得上 → 可用
  const matched = bindingUsable(project, binding);
  assert.equal(matched.usable, true, matched.problems.join('；'));
  assert.equal(matched.status, 'current');
  assert.equal(matched.refusal, false);

  // 反例一：路径地区被改成另一地区 → 明确不符，拒绝采用
  const wrongPathRegion = clone(project);
  wrongPathRegion.data.paths[0].scope.regionId = '另一地区';
  const pathRegionReading = bindingUsable(wrongPathRegion, binding);
  assert.equal(pathRegionReading.usable, false);
  assert.equal(pathRegionReading.refusal, true);
  assert.match(pathRegionReading.problems.join('；'), /路径地区（另一地区）与绑定地区（示例地区（非真实政策））不一致/);
  assert.equal(adoptionBlock(wrongPathRegion, binding, { source: 'local' }).refusal, true);

  // 反例二：状态适用年份被清空 → 未知范围，待核而不是当作匹配
  const emptyYears = clone(project);
  emptyYears.data.states[0].validYears = [];
  assert.ok(validateProjectV2(emptyYears), '清空适用年份后夹具本身仍必须合法');
  const yearsReading = bindingUsable(emptyYears, binding);
  assert.equal(yearsReading.usable, false);
  assert.equal(yearsReading.refusal, false, '未知年份范围应是待核，不是明确不符');
  assert.match(yearsReading.problems.join('；'), /状态未声明适用年份，无法确认绑定年份是否适用：compat-a-1/);
  const yearsBlock = adoptionBlock(emptyYears, binding, { source: 'local' });
  assert.equal(yearsBlock.blocked, true);
  assert.equal(yearsBlock.refusal, false);
  assert.match(yearsBlock.reason, /状态未声明适用年份/);

  // 路径地区未声明 → 同样只能待核
  const unknownPathRegion = clone(project);
  unknownPathRegion.data.paths[0].scope.regionId = null;
  const unknownPathReading = bindingUsable(unknownPathRegion, binding);
  assert.equal(unknownPathReading.refusal, false);
  assert.match(unknownPathReading.problems.join('；'), /路径未声明适用地区/);

  // 状态集合缺项：冻结集合少一条
  const shortFrozen = { ...binding, stateDefinitions: binding.stateDefinitions.slice(1) };
  const shortReading = bindingUsable(project, shortFrozen);
  assert.equal(shortReading.usable, false);
  assert.equal(shortReading.refusal, true);
  assert.match(shortReading.problems.join('；'), /当前因素的状态未冻结在绑定里：compat-a-1/);

  // 状态集合缺项：当前项目少一条（连同路径节点与判断条目里的引用一起清掉，项目本身仍合法）
  const removedLive = clone(project);
  const missingStateId = binding.stateDefinitions[0].id;
  removedLive.data.states = removedLive.data.states.filter(state => state.id !== missingStateId);
  removedLive.data.descriptors = removedLive.data.descriptors.map(descriptor => descriptor.id === binding.descriptorId
    ? { ...descriptor, stateIds: descriptor.stateIds.filter(id => id !== missingStateId) }
    : descriptor);
  removedLive.data.paths = removedLive.data.paths.map(path => ({
    ...path,
    points: path.points.map(point => (point.stateId === missingStateId ? { ...point, stateId: null } : point))
  }));
  removedLive.data.judgments = removedLive.data.judgments.map(judgment => ({
    ...judgment,
    entries: judgment.entries.filter(entry => entry.sourceStateId !== missingStateId && entry.targetStateId !== missingStateId)
  }));
  removedLive.selection.stateIds = removedLive.selection.stateIds.filter(id => id !== missingStateId);
  removedLive.selection.lockedStateIds = removedLive.selection.lockedStateIds.filter(id => id !== missingStateId);
  assert.ok(validateProjectV2(removedLive), '删掉一个状态并清掉引用后夹具本身仍必须合法');
  const removedReading = bindingUsable(removedLive, binding);
  assert.equal(removedReading.refusal, true);
  assert.match(removedReading.problems.join('；'), /状态定义已删除或已不属于该因素：compat-a-1/);

  // 同版本但实际定义内容不一致 → 拦住
  const tamperedRange = clone(project);
  tamperedRange.data.states[0].range = { min: 0, max: 70, minInclusive: true, maxInclusive: false };
  const rangeReading = bindingUsable(tamperedRange, binding);
  assert.equal(rangeReading.refusal, true);
  assert.match(rangeReading.problems.join('；'), /状态定义内容与冻结定义不一致（同版本 v1）：compat-a-1/);

  const tamperedLabel = clone(project);
  tamperedLabel.data.states[0].label = '被改写的档位名';
  assert.match(bindingUsable(tamperedLabel, binding).problems.join('；'), /状态定义内容与冻结定义不一致/);

  // 同版本但适用年份被扩写 → 也算内容不一致
  const yearDrift = clone(project);
  yearDrift.data.states[0].validYears = [2030, 2035, 2040];
  const yearDriftReading = bindingUsable(yearDrift, binding);
  assert.equal(yearDriftReading.refusal, true);
  assert.match(yearDriftReading.problems.join('；'), /状态适用年份与冻结定义不一致（同版本 v1）：compat-a-1/);

  // 状态地区与绑定地区明确不符 → 拒绝；地区未声明 → 待核
  const stateRegionDrift = clone(project);
  stateRegionDrift.data.states[0].scope.regionId = '另一地区';
  const stateRegionReading = bindingUsable(stateRegionDrift, binding);
  assert.equal(stateRegionReading.refusal, true);
  assert.match(stateRegionReading.problems.join('；'), /状态地区与绑定地区不一致：compat-a-1/);

  const unknownStateRegion = clone(project);
  unknownStateRegion.data.states[0].scope.regionId = null;
  const unknownStateReading = bindingUsable(unknownStateRegion, binding);
  assert.equal(unknownStateReading.refusal, false);
  assert.match(unknownStateReading.problems.join('；'), /状态未声明地区范围/);

  // 陈旧历史始终可读：这些改动都不影响历史索引
  const stale = clone(project);
  stale.data.paths[0].version = binding.pathVersion + 1;
  stale.data.indicatorBindings = [binding];
  assert.ok(validateIndicatorBindings(stale.data.indicatorBindings));
  const staleReading = bindingUsable(stale, binding);
  assert.equal(staleReading.usable, false);
  assert.equal(historyEntries(stale).bindings[0].id, binding.id, '陈旧历史仍可读');
});

test('a stale-version history entry stays readable but cannot become the current binding', () => {
  const project = upgradeProjectV1(minimalProjectV1(), { commit: true });
  const binding = makeBinding(project);
  project.data.indicatorBindings = [binding];
  project.data.paths[0].version = binding.pathVersion + 1;

  // 历史仍可读：结构校验只要求附录链完整、字段类型正确
  assert.ok(validateIndicatorBindings(project.data.indicatorBindings));
  const history = historyEntries(project);
  assert.equal(history.bindings[0].id, binding.id);

  // 当前不可用：不能作为当前绑定，也不能用于采用
  const reading = bindingUsable(project, binding);
  assert.equal(reading.usable, false);
  assert.match(reading.problems.join('；'), /路径版本已变化/);
  assert.equal(adoptionBlock(project, binding, { source: 'local' }).blocked, true);
});

/* ------------------------------------------------------------------- 负控 */

test('every rejection case fails with its stable code', () => {
  const cases = rejectionCases();
  assert.ok(cases.length >= 24, '负控用例数不足：' + cases.length);
  for (const item of cases) {
    const error = caughtAny(item.run);
    assert.ok(error, '必须拒绝：' + item.name);
    if (item.code !== undefined) {
      assert.ok(error instanceof CompatError, item.name + ' 应抛 CompatError，实际：' + error);
      assert.equal(error.code, item.code, item.name + ' 拒绝码不符');
    }
  }
});

test('a V2 snapshot can never be smuggled into the original V1 validator', () => {
  const archive = minimalArchiveV2();
  const disguised = { ...archive, archiveVersion: 1 };
  const error = caught(() => validateArchiveDispatch(disguised));
  assert.equal(error.code, 'SNAPSHOT_VERSION_MISMATCH');
  // 反过来：V1 快照冒充 V2 也被拒
  const v1ish = { ...archive, projectInputSnapshot: minimalArchiveV1().projectInputSnapshot };
  assert.equal(caught(() => validateArchiveV2(v1ish)).code, 'SNAPSHOT_VERSION_MISMATCH');
});

test('the forged envelope fields cannot rescue a tampered V2 snapshot', () => {
  const archive = minimalArchiveV2();
  archive.verified = true;
  archive.source = 'local';
  archive.confirmation = { declaredBy: '外部文件', at: '2026-11-04T12:00:00.000Z', reason: '自称通过' };
  const tampered = clone(archive);
  tampered.projectInputSnapshot.data.states[0].label = '被改写';
  assert.ok(caughtAny(() => validateArchiveV2(tampered)), '改了冻结状态必须拒绝');
  const matrix = clone(archive);
  matrix.RunInput.matrix.entries[0].score = 3;
  assert.ok(caughtAny(() => validateArchiveV2(matrix)), '改了矩阵必须拒绝');
  const identity = clone(archive);
  identity.projectInputSnapshot.projectId = 'other';
  assert.ok(caughtAny(() => validateArchiveV2(identity)), '改了身份必须拒绝');
  const revision = clone(archive);
  revision.projectInputSnapshot.revision += 1;
  assert.ok(caughtAny(() => validateArchiveV2(revision)), '改了修订必须拒绝');
  // 未改动的那一份仍然通过（证明上面失败源于篡改）
  assert.ok(validateArchiveV2(archive));
});

test('zero is a valid adopted value and revoke returns to the baseline', () => {
  const project = upgradeProjectV1(minimalProjectV1(), { commit: true });
  const binding = makeBinding(project);
  const key = { regionId: project.scope.regionId, pathId: binding.pathId, year: binding.year };
  const adopted = makeOverride(project, binding, { id: 'ov-1', seq: 1, value: 0, verdict: { status: 'within', detail: '仍在原状态范围', candidateStateIds: [] } });
  project.data.annualOverrides = [adopted];
  assert.ok(validateProjectV2(project), '0 是有效采用值');
  assert.equal(latestOverride(project, key).value, 0);
  const revoked = makeOverride(project, binding, { id: 'ov-2', seq: 2, previousId: 'ov-1', operation: 'revoke', value: null });
  project.data.annualOverrides = [adopted, revoked];
  assert.ok(validateProjectV2(project));
  assert.equal(latestOverride(project, key).operation, 'baseline', '撤销后回到基线');
  assert.equal(latestOverride(project, key).value, null);
});

test('the snapshot comparison covers the two new collections', () => {
  const project = upgradeProjectV1(minimalProjectV1(), { commit: true });
  const binding = makeBinding(project);
  const snapshotA = projectSnapshotV2(project);
  project.data.indicatorBindings = [binding];
  const snapshotB = projectSnapshotV2(project);
  assert.notDeepEqual(
    { bindings: snapshotA.data.indicatorBindings },
    { bindings: snapshotB.data.indicatorBindings },
    'V2 快照比较必须包含新增集合，不能用投影是否相等判断旧运行是否仍当前'
  );
  assert.deepEqual(toProjectV1(project).data.indicatorBindings, undefined);
});

/* ---------------------------------------------------------- 原型不出现在发布构建 */

test('no prototype path reaches the default build or the release entry', async () => {
  const html = await readFile(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  assert.match(html, /<script type="module" src="\.\/src\/app\.mjs"><\/script>/);
  assert.doesNotMatch(html, /compat|research|annual-override/);
  const buildScript = await readFile(fileURLToPath(new URL('../scripts/build.mjs', import.meta.url)), 'utf8');
  assert.doesNotMatch(buildScript, /compat|research/);
  try {
    const dist = await readFile(repoRoot + 'dist/scenario-workbench.html', 'utf8');
    assert.doesNotMatch(dist, /compat\.mjs|annual-override\/compat/);
    assert.match(dist, /__require\("src\/app\.mjs"\);/);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
});
