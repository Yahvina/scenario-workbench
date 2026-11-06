// P7-C2A 离线兼容原型（研究目录，不在发布构建入口内）。
//
// 目标：在不改动正式 Project 契约、项目存储与发布入口的前提下，验证
//   1. 版本分派：Project / 检算封套 / 方案库各自独立判定版本；
//   2. 旧项目显式转换：打开保持 V1，升级生成 V2 新副本；
//   3. V2 校验：原八集合交给原实现，新增两集合用本原型的规则；
//   4. V1 检算投影：只把原八集合与原字段交给现行 prepareRun；
//   5. V2 封套重验：先验 V2 快照，再用同一份投影走原封套校验；
//   6. 方案库 V1/V2 适配：外层版本独立，内嵌记录保持原版本。
//
// 复用纪律：Project 的八集合校验、检算封套校验、方案库外形/配额/记录元数据/
// 方案关注状态校验，全部调用原实现（src/ 下既有导出），本文件不复制这些规则。
// P7-C2B 负责原子写入与失败回退，本文件不做任何持久化。

import { DATA_KEYS, validateProject } from '../../../src/core/contracts.mjs';
import { MAX_ITEMS, emptyBundle, validateArchive, validateBundle } from '../../../src/modules/workspace/saved-work.mjs';
import { prepareRun, solve } from '../../../src/modules/solver/engine.mjs';
import {
  OVERRIDE_PENDING_BINDING,
  OVERRIDE_UNVERIFIED_BINDING,
  bindingNoteFor,
  classifyOverride,
  hasCarriedBinding
} from '../../../src/modules/timeline/annual-override.mjs';

export const PROJECT_V1 = { schemaVersion: 1, contractVersion: '1.0.0' };
export const PROJECT_V2 = { schemaVersion: 2, contractVersion: '1.1.0' };
export const V2_COLLECTIONS = ['indicatorBindings', 'annualOverrides'];
export const ARCHIVE_V2 = 2;
export const BUNDLE_V2 = 2;
export const OPERATIONS = ['set', 'revoke'];
export const VERDICT_STATUSES = ['within', 'baseline', 'out-of-range', 'multiple', 'gap', 'pending'];
export const BASELINE_METHODS = ['anchor', 'linear', 'step', 'none', 'missing'];
export const READ_SOURCES = ['local', 'external'];

export class CompatError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CompatError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new CompatError(code, message); };
const need = (ok, code, message) => { if (!ok) fail(code, message); };
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const posInt = v => Number.isSafeInteger(v) && v > 0;
const finite = v => typeof v === 'number' && Number.isFinite(v);
const clone = v => structuredClone(v);
const idList = v => Array.isArray(v) && v.every(text) && new Set(v).size === v.length;
const yearValue = v => Number.isInteger(v) && v >= 1900 && v <= 2300;
function canonical(v) {
  return Array.isArray(v) ? v.map(canonical)
    : obj(v) ? Object.fromEntries(Object.keys(v).sort().map(key => [key, canonical(v[key])]))
      : v;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

// 与 saved-work.mjs 内联的日期校验同口径（该助手未导出，这里只做记录元数据校验）。
const DATE = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?(Z|[+-]\d\d:\d\d)$/;
function dateText(v) {
  if (typeof v !== 'string') return false;
  const m = DATE.exec(v);
  if (!m || !Number.isFinite(Date.parse(v))) return false;
  const [y, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] && hour < 24 && minute < 60 && second < 60;
}

/* ---------------------------------------------------------------- 版本分派 */

export function projectVersion(value) {
  if (!obj(value)) return 'unknown';
  if (value.schemaVersion === PROJECT_V1.schemaVersion && value.contractVersion === PROJECT_V1.contractVersion) return 'v1';
  if (value.schemaVersion === PROJECT_V2.schemaVersion && value.contractVersion === PROJECT_V2.contractVersion) return 'v2';
  return 'unknown';
}

export function validateProjectDispatch(value) {
  const kind = projectVersion(value);
  if (kind === 'v1') return validateProject(value);
  if (kind === 'v2') return validateProjectV2(value);
  return fail('UNSUPPORTED_VERSION', '未知项目版本：只支持 1/1.0.0 与 2/1.1.0');
}

/* ------------------------------------------------------------ V2 项目校验 */

export function validateProjectV2(p) {
  need(projectVersion(p) === 'v2', 'UNSUPPORTED_VERSION', '未知项目版本：只支持 1/1.0.0 与 2/1.1.0');
  const keys = obj(p.data) ? Object.keys(p.data) : [];
  need(keys.length === DATA_KEYS.length + V2_COLLECTIONS.length && DATA_KEYS.every(key => keys.includes(key)) && V2_COLLECTIONS.every(key => keys.includes(key)),
    'DATA_KEYS_MISMATCH', 'V2 项目必须恰好包含原八集合与 ' + V2_COLLECTIONS.join('、'));
  validateProject(toProjectV1(p)); // 原实现校验八集合、身份、范围、选择
  validateIndicatorBindings(p.data.indicatorBindings);
  validateAnnualOverrides(p.data.annualOverrides);
  return p;
}

/* --------------------------------------------------------------- 投影与快照 */

export function toProjectV1(p) {
  const data = {};
  for (const key of DATA_KEYS) data[key] = clone(p.data[key]);
  return {
    schemaVersion: PROJECT_V1.schemaVersion,
    contractVersion: PROJECT_V1.contractVersion,
    id: p.id,
    title: p.title,
    revision: p.revision,
    view: clone(p.view),
    scope: clone(p.scope),
    data,
    selection: clone(p.selection)
  };
}

export function toSnapshotV1(project) {
  return {
    schemaVersion: PROJECT_V1.schemaVersion,
    contractVersion: PROJECT_V1.contractVersion,
    projectId: project.id,
    revision: project.revision,
    scope: clone(project.scope),
    data: clone(project.data),
    selection: clone(project.selection)
  };
}

export function projectSnapshotV2(project) {
  validateProjectV2(project);
  return {
    schemaVersion: PROJECT_V2.schemaVersion,
    contractVersion: PROJECT_V2.contractVersion,
    projectId: project.id,
    revision: project.revision,
    scope: clone(project.scope),
    data: clone(project.data),
    selection: clone(project.selection)
  };
}

export function snapshotToProjectV2(snapshot) {
  need(obj(snapshot) && snapshot.schemaVersion === PROJECT_V2.schemaVersion && snapshot.contractVersion === PROJECT_V2.contractVersion && text(snapshot.projectId) && Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0,
    'INVALID_SNAPSHOT', 'V2 科学快照无效：版本、项目ID 或修订号不合格');
  return {
    schemaVersion: PROJECT_V2.schemaVersion,
    contractVersion: PROJECT_V2.contractVersion,
    id: snapshot.projectId,
    title: '历史科学快照',
    revision: snapshot.revision,
    view: { perspective: 'public', module: 'workspace', objectId: null },
    scope: clone(snapshot.scope),
    data: clone(snapshot.data),
    selection: clone(snapshot.selection)
  };
}

// 检算投影：V2 项目只看原八集合与原字段；V1 项目原样通过。
export function solverProjection(project) {
  const kind = projectVersion(project);
  need(kind !== 'unknown', 'UNSUPPORTED_VERSION', '未知项目版本：无法构造检算投影');
  const v1 = kind === 'v1' ? clone(project) : toProjectV1(project);
  validateProject(v1);
  return v1;
}

export function prepareRunThroughProjection(project, options) {
  return prepareRun(solverProjection(project), options);
}

/* ----------------------------------------------------------- 旧项目显式转换 */

// 打开旧项目保持旧格式；显式升级生成新副本，原对象一律不变。
// commit:true 表示真实采用，修订加一；commit:false 表示预览副本，修订不变。
export function upgradeProjectV1(source, { commit = true } = {}) {
  validateProject(source);
  const before = clone(source);
  const next = clone(source);
  next.schemaVersion = PROJECT_V2.schemaVersion;
  next.contractVersion = PROJECT_V2.contractVersion;
  next.data.indicatorBindings = [];
  next.data.annualOverrides = [];
  if (commit) next.revision = source.revision + 1;
  validateProjectV2(next);
  need(same(source, before), 'SOURCE_MUTATED', '显式转换不得修改原项目对象');
  return next;
}

/* ----------------------------------------------------------- V2 集合校验 */

function stateRange(range, owner) {
  if (range === null) return;
  need(obj(range) && ['min', 'max'].every(key => range[key] === null || finite(range[key]))
    && typeof range.minInclusive === 'boolean' && typeof range.maxInclusive === 'boolean'
    && (range.min === null || range.max === null || range.min < range.max || (range.min === range.max && range.minInclusive && range.maxInclusive)),
    'INVALID_STATE_RANGE', '冻结状态区间不合法：' + owner);
}

function frozenStateDefinition(state, owner) {
  need(obj(state) && text(state.id) && posInt(state.version) && text(state.label),
    'INVALID_STATE_DEFINITION', '冻结状态定义缺少 ID、正整数版本或名称：' + owner);
  stateRange(state.range, owner);
  need(state.unit === null || typeof state.unit === 'string', 'INVALID_STATE_UNIT', '冻结状态单位无效：' + owner);
  need(Array.isArray(state.validYears) && state.validYears.every(yearValue) && new Set(state.validYears).size === state.validYears.length,
    'INVALID_STATE_YEARS', '冻结状态适用年份须为 1900—2300 不重复整数：' + owner);
  need(idList(state.evidenceRefs ?? []), 'INVALID_STATE_DEFINITION', '冻结状态依据ID无效：' + owner);
}

function quantity(value, label) {
  need(obj(value), 'INVALID_QUANTITY', label + '必须为 {kind:"specified",value} 或 {kind:"not-applicable",reason}');
  if (value.kind === 'specified') need(finite(value.value), 'NON_FINITE_VALUE', label + '的 value 必须是有限数');
  else if (value.kind === 'not-applicable') need(text(value.reason), 'INVALID_QUANTITY', label + '不适用时必须写明理由');
  else fail('INVALID_QUANTITY', label + '的 kind 只能是 specified 或 not-applicable');
}

function confirmationOf(value, label) {
  need(obj(value) && text(value.declaredBy) && dateText(value.at) && text(value.reason),
    'INVALID_CONFIRMATION', label + '需要使用者声明、时间和理由');
}

function seqAndIds(list, label) {
  need(Array.isArray(list), 'INVALID_COLLECTION', label + '必须是数组');
  list.forEach((record, index) => {
    need(obj(record) && text(record.id), 'INVALID_COLLECTION', label + '记录缺少稳定 ID');
    need(record.seq === index + 1, 'SEQ_NOT_CONTIGUOUS', label + '的 seq 必须是从 1 开始的连续整数：' + record.id);
  });
  need(new Set(list.map(record => record.id)).size === list.length, 'DUPLICATE_RECORD_ID', label + '记录 ID 重复');
}

// previousId 必须指向同键紧邻上一条，或为 null；同键为 (regionId, pathId, year)。
export function historyChain(list, label) {
  const byKey = new Map();
  for (const record of list) {
    const key = JSON.stringify([record.regionId ?? null, record.pathId ?? null, record.year ?? null]);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(record);
  }
  for (const group of byKey.values()) {
    group.sort((a, b) => a.seq - b.seq);
    group.forEach((record, index) => {
      const expected = index === 0 ? null : group[index - 1].id;
      need(record.previousId === expected, 'BROKEN_HISTORY_CHAIN',
        label + '历史链断裂：' + record.id + ' 的 previousId 应为 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(record.previousId));
    });
  }
  return list;
}

export function validateIndicatorBindings(list) {
  seqAndIds(list, '指标绑定');
  for (const binding of list) {
    need(text(binding.descriptorId) && posInt(binding.descriptorVersion) && text(binding.pathId) && posInt(binding.pathVersion),
      'INVALID_BINDING', '指标绑定缺少因素或路径的 ID/版本：' + binding.id);
    need(binding.regionId === null || text(binding.regionId) || binding.regionId === undefined, 'INVALID_BINDING', '地区字段无效：' + binding.id);
    need(yearValue(binding.year), 'INVALID_YEAR', '指标绑定的年份必须是 1900—2300 的整数：' + binding.id);
    need(text(binding.indicatorId), 'INVALID_BINDING', '指标绑定缺少指标 ID：' + binding.id);
    need(binding.unit === null || typeof binding.unit === 'string', 'INVALID_BINDING', '指标绑定单位无效：' + binding.id);
    need(binding.population === null || typeof binding.population === 'string', 'INVALID_BINDING', '统计对象字段无效：' + binding.id);
    quantity(binding.denominator, '指标绑定的分母：' + binding.id);
    quantity(binding.baseYear, '指标绑定的基准年：' + binding.id);
    need(Array.isArray(binding.stateDefinitions) && binding.stateDefinitions.length > 0, 'INVALID_BINDING', '指标绑定必须冻结完整状态定义：' + binding.id);
    binding.stateDefinitions.forEach(state => frozenStateDefinition(state, binding.id));
    need(obj(binding.sourceRefs) && idList(binding.sourceRefs.caliber ?? []) && idList(binding.sourceRefs.thresholds ?? []),
      'INVALID_BINDING', '指标绑定必须分开列出口径与阈值依据：' + binding.id);
    confirmationOf(binding.confirmation, '指标绑定确认：' + binding.id);
  }
  return historyChain(list, '指标绑定');
}

export function validateAnnualOverrides(list) {
  seqAndIds(list, '年度覆盖');
  for (const override of list) {
    need(['set', 'revoke'].includes(override.operation), 'INVALID_OPERATION', '年度覆盖 operation 只能是 set 或 revoke：' + override.id);
    need(text(override.pathId) && posInt(override.pathVersion), 'INVALID_OVERRIDE', '年度覆盖缺少路径 ID 或版本：' + override.id);
    need(yearValue(override.year), 'INVALID_YEAR', '年度覆盖的年份必须是 1900—2300 的整数：' + override.id);
    if (override.operation === 'set') {
      need(finite(override.value), 'NON_FINITE_VALUE', 'set 覆盖必须是有限数（0 是有效值）：' + override.id);
    } else {
      need(override.value === null, 'INVALID_OVERRIDE', 'revoke 覆盖的 value 必须为 null：' + override.id);
    }
    need(override.unit === null || typeof override.unit === 'string', 'INVALID_OVERRIDE', '年度覆盖单位无效：' + override.id);
    need(override.bindingId === null || text(override.bindingId), 'INVALID_OVERRIDE', 'bindingId 只能是 null 或非空字符串：' + override.id);
    need(override.referenceStateId === null || text(override.referenceStateId), 'INVALID_OVERRIDE', 'referenceStateId 只能是 null 或非空字符串：' + override.id);
    need(obj(override.baseline) && (override.baseline.reading === null || finite(override.baseline.reading))
      && BASELINE_METHODS.includes(override.baseline.method) && idList(override.baseline.evidenceRefs ?? []),
      'INVALID_BASELINE', '冻结基线必须写明读数、方法与来源：' + override.id);
    need(obj(override.verdict) && VERDICT_STATUSES.includes(override.verdict.status) && text(override.verdict.detail) && idList(override.verdict.candidateStateIds ?? []),
      'INVALID_VERDICT', '判定摘要状态无效：' + override.id);
    confirmationOf(override.confirmation, '年度覆盖确认：' + override.id);
  }
  return historyChain(list, '年度覆盖');
}

// 同键最新一条为 revoke（或没有记录）时，当前值回到基线。
export function latestOverride(project, { regionId, pathId, year }) {
  validateProjectV2(project);
  const key = JSON.stringify([regionId ?? null, pathId, year]);
  const group = project.data.annualOverrides
    .filter(record => JSON.stringify([record.regionId ?? null, record.pathId, record.year]) === key)
    .sort((a, b) => a.seq - b.seq);
  const last = group[group.length - 1] ?? null;
  if (!last || last.operation === 'revoke') return { operation: 'baseline', value: null, recordId: last?.id ?? null };
  return { operation: 'set', value: last.value, recordId: last.id };
}

/* ------------------------------------------------------------- 封套重验 */

export function buildArchiveV2(project, { year, selectedJudgmentIds = [], assumptionAcknowledgements = {} } = {}) {
  const kind = projectVersion(project);
  need(kind !== 'unknown', 'UNSUPPORTED_VERSION', '未知项目版本：无法构造 V2 封套');
  const v2 = kind === 'v2' ? project : upgradeProjectV1(project, { commit: false });
  validateProjectV2(v2);
  const prepared = prepareRun(toProjectV1(v2), { year, selectedJudgmentIds, assumptionAcknowledgements });
  const archive = {
    archiveVersion: ARCHIVE_V2,
    RunInput: prepared.input ? clone(prepared.input) : null,
    RunResult: prepared.input ? solve(prepared.input) : null,
    projectInputSnapshot: projectSnapshotV2(v2),
    preflightDiagnostics: clone(prepared.diagnostics),
    assumptionAcknowledgements: clone(assumptionAcknowledgements),
    selectionOfJudgments: v2.data.judgments
      .filter(judgment => selectedJudgmentIds.includes(judgment.id))
      .map(judgment => ({ id: judgment.id, version: judgment.version, evidenceRefs: clone(judgment.evidenceRefs ?? []) }))
  };
  return { archive, project: v2, prepared };
}

// 先验 V2 快照，再用同一份 V1 投影走原封套校验；不允许 V2 快照进入旧验证器。
export function validateArchiveV2(archive) {
  need(obj(archive) && archive.archiveVersion === ARCHIVE_V2 && Object.hasOwn(archive, 'RunInput') && Object.hasOwn(archive, 'RunResult'),
    'UNSUPPORTED_ARCHIVE_VERSION', '不支持的检算封套版本或缺少输入/结果');
  const snapshot = archive.projectInputSnapshot;
  need(obj(snapshot) && snapshot.schemaVersion === PROJECT_V2.schemaVersion && snapshot.contractVersion === PROJECT_V2.contractVersion,
    'SNAPSHOT_VERSION_MISMATCH', 'V2 封套必须冻结 V2 项目快照；V1 快照不能冒充 V2');
  const asProject = snapshotToProjectV2(snapshot);
  validateProjectV2(asProject);
  const probe = {
    archiveVersion: 1,
    RunInput: archive.RunInput,
    RunResult: archive.RunResult,
    projectInputSnapshot: toSnapshotV1(toProjectV1(asProject)),
    preflightDiagnostics: archive.preflightDiagnostics,
    assumptionAcknowledgements: archive.assumptionAcknowledgements,
    selectionOfJudgments: archive.selectionOfJudgments
  };
  if (archive.partialFound !== undefined) probe.partialFound = archive.partialFound;
  if (archive.inspection !== undefined) probe.inspection = archive.inspection;
  validateArchive(probe); // 原实现：格式、冻结输入一致性、空间/覆盖、逐项解释
  return archive;
}

export function validateArchiveDispatch(archive) {
  need(obj(archive), 'UNSUPPORTED_ARCHIVE_VERSION', '检算封套必须是对象');
  if (archive.archiveVersion === ARCHIVE_V2) return validateArchiveV2(archive);
  if (archive.archiveVersion === 1) {
    need(archive.projectInputSnapshot?.schemaVersion === PROJECT_V1.schemaVersion,
      'SNAPSHOT_VERSION_MISMATCH', 'V1 封套只能携带 V1 快照：禁止把 V2 快照伪装成 V1 进入旧验证器');
    return validateArchive(archive);
  }
  return fail('UNSUPPORTED_ARCHIVE_VERSION', '未知检算封套版本：只支持 1 与 2');
}

/* ------------------------------------------------------------- 方案库适配 */

function projectPlanItem(project, name, id, createdAt) {
  return { id, name, createdAt, project: clone(project) };
}

export function planItem(project, name, id, createdAt = '2026-11-04T12:00:00.000Z') {
  validateProjectDispatch(project);
  return projectPlanItem(project, name, id, createdAt);
}

export function runItem(archive, name, id, createdAt = '2026-11-04T12:00:00.000Z') {
  validateArchiveDispatch(archive);
  return { id, name, createdAt, archive: clone(archive) };
}

function minimalArchiveProbe() {
  return minimalArchiveV1();
}

// 库 V2 沿用原外形与限额；方案可以是 Project V1 或 V2，运行可以是封套 V1 或 V2。
export function validateBundleV2(bundle) {
  need(obj(bundle) && Object.keys(bundle).sort().join(',') === 'archiveVersion,format,plans,runs' && bundle.format === 'scenario-workbench.saved-work'
    && bundle.archiveVersion === BUNDLE_V2 && Array.isArray(bundle.plans) && Array.isArray(bundle.runs),
    'UNSUPPORTED_BUNDLE_VERSION', '未知保存格式或版本/扩展字段');
  need(bundle.plans.length <= MAX_ITEMS && bundle.runs.length <= MAX_ITEMS, 'BUNDLE_QUOTA', '最多20条方案和20条归档');
  const all = [...bundle.plans, ...bundle.runs];
  need(new Set(all.map(record => record.id)).size === all.length, 'DUPLICATE_RECORD_ID', '方案与归档 ID 重复');
  for (const plan of bundle.plans) {
    need(obj(plan) && Object.hasOwn(plan, 'project'), 'INVALID_PLAN', '方案缺少 project');
    validateProjectDispatch(plan.project);
  }
  for (const run of bundle.runs) {
    need(obj(run) && Object.hasOwn(run, 'archive'), 'INVALID_RUN', '归档缺少 archive');
    validateArchiveDispatch(run.archive);
  }
  // 复用原实现校验记录元数据、日期、配额与方案关注状态（内部使用 V1 投影）。
  const probe = {
    format: bundle.format,
    archiveVersion: 1,
    plans: bundle.plans.map(plan => projectPlanItem(solverProjection(plan.project), plan.name, plan.id, plan.createdAt)),
    runs: bundle.runs.map(run => ({ id: run.id, name: run.name, createdAt: run.createdAt, archive: minimalArchiveProbe() }))
  };
  validateBundle(probe);
  return bundle;
}

export function validateBundleDispatch(bundle) {
  need(obj(bundle) && Object.hasOwn(bundle, 'format') && Object.hasOwn(bundle, 'archiveVersion'), 'UNSUPPORTED_BUNDLE_VERSION', '未知保存格式');
  if (bundle.archiveVersion === BUNDLE_V2) return validateBundleV2(bundle);
  if (bundle.archiveVersion === 1) return validateBundle(bundle);
  return fail('UNSUPPORTED_BUNDLE_VERSION', '未知库版本：只支持 1 与 2');
}

// 转换成 V2 只更新库外层；历史方案与运行原样保留；原对象不变。
export function upgradeBundleV1(source) {
  validateBundle(source);
  const before = clone(source);
  const next = clone(source);
  next.archiveVersion = BUNDLE_V2;
  validateBundleV2(next);
  need(same(source, before), 'SOURCE_MUTATED', '库升级不得修改原库对象');
  need(same(next.plans, before.plans) && same(next.runs, before.runs), 'HISTORY_REWRITTEN', '库升级只更新外层版本，历史方案与运行必须原样保留');
  return next;
}

export function restorePlanFromBundle(bundle, id) {
  validateBundleDispatch(bundle);
  const plan = bundle.plans.find(item => item.id === id);
  need(plan !== undefined, 'MISSING_RECORD', '库中找不到方案：' + id);
  validateProjectDispatch(plan.project);
  return clone(plan.project); // 保持原版本，不隐式升级
}

export function restoreRunFromBundle(bundle, id) {
  validateBundleDispatch(bundle);
  const run = bundle.runs.find(item => item.id === id);
  need(run !== undefined, 'MISSING_RECORD', '库中找不到归档：' + id);
  validateArchiveDispatch(run.archive);
  return clone(run.archive); // 旧归档不重写
}

/* ------------------------------------------------------------- 采用时校验 */

// 同版本内容比较只覆盖确有定值的字段；年份与地区另有「未知 / 明确不符」的分别处理。
const FROZEN_STATE_FIELDS = ['label', 'range', 'unit', 'evidenceRefs'];
function frozenShape(state) {
  const out = {};
  for (const key of FROZEN_STATE_FIELDS) if (state?.[key] !== undefined) out[key] = clone(state[key]);
  return out;
}

// 声明的适用年份：空数组、缺字段都算「未声明」，不能当作匹配。
function declaredYears(holder) {
  const years = holder?.validYears;
  return Array.isArray(years) && years.length > 0 ? [...years].sort((a, b) => a - b) : null;
}

// 地区未声明（缺字段、null、空串）一律算「未知」，不能当作匹配。
function declaredRegion(holder) {
  const region = holder?.scope?.regionId;
  if (region === undefined || region === null) return null;
  return typeof region === 'string' && region.trim() !== '' ? region : null;
}

// 采用时重验：引用完整、归属正确、版本匹配、地区与年份各自对得上、冻结状态集合完整且内容一致。
// 明确不符 → refusal=true（拒绝采用）；未声明或无法比对 → refusal=false（待核）。两者都不可用。
export function bindingUsable(project, binding) {
  validateProjectV2(project);
  const mismatch = [];
  const unknown = [];

  const descriptor = project.data.descriptors.find(item => item.id === binding.descriptorId);
  if (!descriptor) mismatch.push('指标绑定引用的因素已不存在：' + binding.descriptorId);
  else if (descriptor.version !== binding.descriptorVersion) mismatch.push('因素版本已变化：绑定 v' + binding.descriptorVersion + '，当前 v' + descriptor.version);

  const path = project.data.paths.find(item => item.id === binding.pathId);
  if (!path) mismatch.push('指标绑定引用的路径已不存在：' + binding.pathId);
  else if (path.descriptorId !== binding.descriptorId) mismatch.push('路径已不属于该因素：' + binding.pathId + '（当前属于 ' + path.descriptorId + '）');
  else if (path.version !== binding.pathVersion) mismatch.push('路径版本已变化：绑定 v' + binding.pathVersion + '，当前 v' + path.version);

  const bindingRegion = binding.regionId ?? null;
  const projectRegion = project.scope?.regionId ?? null;

  // 路径自身的地区：未声明 → 待核；已声明且与绑定不同 → 拒绝采用。
  if (path) {
    const pathRegion = declaredRegion(path);
    if (pathRegion === null) unknown.push('路径未声明适用地区，无法与绑定地区（' + (bindingRegion ?? '未声明') + '）比对：' + path.id);
    else if (bindingRegion === null) unknown.push('绑定未声明地区，无法与路径地区（' + pathRegion + '）比对');
    else if (pathRegion !== bindingRegion) mismatch.push('路径地区（' + pathRegion + '）与绑定地区（' + bindingRegion + '）不一致');
  }

  if (bindingRegion === null) unknown.push('绑定未声明地区，采用前必须明确地区范围');
  else if (projectRegion === null) unknown.push('项目范围未指定地区，无法与绑定地区（' + bindingRegion + '）比对');
  else if (bindingRegion !== projectRegion) mismatch.push('绑定地区与当前项目范围不一致（绑定 ' + bindingRegion + '，项目 ' + projectRegion + '）');

  if (!project.scope?.years?.includes(binding.year)) mismatch.push('绑定年份不在当前研究范围：' + binding.year);
  if (path && (binding.unit ?? null) !== (path.unit ?? null)) mismatch.push('绑定单位与当前路径不一致');

  // 完整状态集合与归属：当前因素的状态必须全部冻结在绑定里，冻结的也必须仍属于该因素。
  const liveStates = project.data.states.filter(state => state.descriptorId === binding.descriptorId);
  const frozenStates = binding.stateDefinitions ?? [];
  const live = new Map(liveStates.map(state => [state.id, state]));
  const frozenIds = new Set(frozenStates.map(state => state.id));
  for (const state of liveStates) if (!frozenIds.has(state.id)) mismatch.push('当前因素的状态未冻结在绑定里：' + state.id);

  for (const frozen of frozenStates) {
    const current = live.get(frozen.id);
    if (!current) { mismatch.push('状态定义已删除或已不属于该因素：' + frozen.id); continue; }
    if (current.version !== frozen.version) {
      mismatch.push('状态定义版本已变化：' + frozen.id + '（绑定 v' + frozen.version + '，当前 v' + current.version + '）');
    } else if (!same(frozenShape(current), frozenShape(frozen))) {
      mismatch.push('状态定义内容与冻结定义不一致（同版本 v' + frozen.version + '）：' + frozen.id);
    }

    // 各状态的年份与地区逐项核对：未声明 → 待核；已声明却对不上 → 拒绝采用。
    const liveYears = declaredYears(current);
    const frozenYears = declaredYears(frozen);
    if (liveYears === null) unknown.push('状态未声明适用年份，无法确认绑定年份是否适用：' + frozen.id);
    else {
      if (!liveYears.includes(binding.year)) mismatch.push('状态适用年份不含绑定年份：' + frozen.id + '（绑定年份 ' + binding.year + '）');
      if (frozenYears !== null && !same(liveYears, frozenYears)) mismatch.push('状态适用年份与冻结定义不一致（同版本 v' + frozen.version + '）：' + frozen.id);
    }
    const stateRegion = declaredRegion(current);
    const frozenRegion = declaredRegion(frozen);
    if (stateRegion === null) unknown.push('状态未声明地区范围，无法确认是否适用于当前地区：' + frozen.id);
    else {
      if (bindingRegion !== null && stateRegion !== bindingRegion) mismatch.push('状态地区与绑定地区不一致：' + frozen.id + '（状态 ' + stateRegion + '，绑定 ' + bindingRegion + '）');
      if (frozenRegion !== null && frozenRegion !== stateRegion) mismatch.push('状态地区与冻结定义不一致（同版本 v' + frozen.version + '）：' + frozen.id);
    }
  }

  const problems = [...mismatch, ...unknown];
  return {
    usable: problems.length === 0,
    status: problems.length === 0 ? 'current' : 'pending',
    refusal: mismatch.length > 0,
    problems
  };
}

// 读取来源必须由调用方显式传入；文件内的 verified、confirmation 或来源声明不能自行选择入口。
export function readSource({ source } = {}) {
  need(READ_SOURCES.includes(source), 'READ_SOURCE_REQUIRED',
    '必须由调用方显式传入读取来源（local 或 external）；文件内的 verified、confirmation 或来源声明不能自行选择入口');
  return source;
}

export function currentReading(project, record, { source } = {}) {
  const from = readSource({ source });
  if (from === 'external') {
    return {
      usable: false,
      status: 'pending',
      refusal: false,
      problems: ['外部导入的绑定或覆盖不能代替当前采用确认：请先从当前冻结内容重验并显式确认。']
    };
  }
  return bindingUsable(project, record);
}

// 采用阻断：明确不符（refusal）与未知范围（待核）都不可采用，但原因要分开呈现。
export function adoptionBlock(project, binding, { source } = {}) {
  const reading = currentReading(project, binding, { source });
  return {
    blocked: !reading.usable,
    refusal: reading.usable ? false : reading.refusal === true,
    source,
    reason: reading.usable ? null : reading.problems[0],
    problems: reading.usable ? [] : [...reading.problems]
  };
}

// 历史查看：冻结记录始终可读，与当前是否可用无关。
export function historyEntries(project) {
  validateProjectV2(project);
  return {
    bindings: project.data.indicatorBindings.map(binding => ({
      id: binding.id,
      seq: binding.seq,
      key: [binding.regionId ?? null, binding.pathId, binding.year],
      indicatorId: binding.indicatorId,
      declaredBy: binding.confirmation.declaredBy,
      at: binding.confirmation.at,
      reason: binding.confirmation.reason,
      frozenStates: binding.stateDefinitions.map(state => state.id + '@v' + state.version)
    })),
    overrides: project.data.annualOverrides.map(override => ({
      id: override.id,
      seq: override.seq,
      key: [override.regionId ?? null, override.pathId, override.year],
      operation: override.operation,
      value: override.value,
      frozenBaseline: clone(override.baseline),
      frozenVerdict: clone(override.verdict)
    }))
  };
}

// 没有当前有效绑定时状态建议继续待核：复用 P7-B 的判定函数与未核验文案。
export function stateAdviceWithoutBinding(project, { descriptorId, pathId, year, override, referenceStateId = null }) {
  const path = project.data.paths.find(item => item.id === pathId);
  need(path !== undefined, 'MISSING_RECORD', '找不到路径：' + pathId);
  const states = project.data.states.filter(state => state.descriptorId === descriptorId);
  return classifyOverride({
    baseline: null,
    override,
    states,
    referenceStateId,
    binding: null, // 正式页面永远拿到 null；项目自带的 reviewBinding 不进入计算
    year,
    region: project.scope?.regionId ?? null,
    missingBindingNote: bindingNoteFor(path)
  });
}

/* --------------------------------------------------------------- 最小夹具 */

export function minimalProjectV1() {
  const base = { version: 1, provenance: { origin: 'fixture', sourceId: 'compat-prototype', locator: 'docs/research/annual-override/compat.mjs' } };
  const project = {
    schemaVersion: PROJECT_V1.schemaVersion,
    contractVersion: PROJECT_V1.contractVersion,
    id: 'compat-fixture-v1',
    title: '兼容原型最小夹具（非真实政策）',
    revision: 2,
    view: { perspective: 'public', module: 'solver', objectId: null },
    scope: { regionId: '示例地区（非真实政策）', years: [2030, 2035] },
    selection: { nodeIds: [], descriptorIds: ['compat-a', 'compat-b'], stateIds: [], lockedStateIds: [] },
    data: { policies: [], taxonomy: [], descriptors: [], states: [], paths: [], judgments: [], evidence: [], mappings: [] }
  };
  project.data.descriptors = ['compat-a', 'compat-b'].map(id => ({ ...base, id, label: id, role: 'input', stateIds: [id + '-1', id + '-2'], evidenceRefs: [] }));
  project.data.states = project.data.descriptors.flatMap(descriptor => descriptor.stateIds.map((id, index) => ({
    ...base,
    id,
    label: id,
    descriptorId: descriptor.id,
    range: descriptor.id === 'compat-a'
      ? (index === 0 ? { min: 0, max: 60, minInclusive: true, maxInclusive: false } : { min: 60, max: 100, minInclusive: true, maxInclusive: true })
      : null,
    unit: descriptor.id === 'compat-a' ? '示例单位' : null,
    scope: { regionId: project.scope.regionId },
    validYears: [2030, 2035],
    evidenceRefs: []
  })));
  project.data.paths = [{
    ...base,
    id: 'compat-path-a',
    descriptorId: 'compat-a',
    unit: '示例单位',
    scope: { regionId: project.scope.regionId },
    interpolation: 'linear',
    points: [
      { year: 2030, value: 50, stateId: 'compat-a-1', origin: 'user-assumption', evidenceRefs: [] },
      { year: 2035, value: 100, stateId: 'compat-a-2', origin: 'user-assumption', evidenceRefs: [] }
    ],
    evidenceRefs: []
  }];
  for (const source of project.data.descriptors) {
    for (const target of project.data.descriptors) {
      if (source.id === target.id) continue;
      project.data.judgments.push({
        ...base,
        id: source.id + '->' + target.id,
        sourceDescriptorId: source.id,
        targetDescriptorId: target.id,
        scope: { regionId: project.scope.regionId },
        validYears: [2030, 2035],
        directness: 'direct',
        curveEncoding: null,
        alternatives: [],
        rationale: '仅测试假设',
        evidenceRefs: [],
        reviewStatus: 'draft',
        entries: source.stateIds.flatMap((sourceStateId, i) => target.stateIds.map((targetStateId, j) => ({ sourceStateId, targetStateId, score: i === j ? 1 : -1 })))
      });
    }
  }
  validateProject(project);
  return project;
}

function archiveFromProject(project, version) {
  const acknowledgements = { currentAssumptions: true, unknownStateScope: true };
  // 检算输入一律走 V1 投影，绝不让 V2 项目对象进入现行 prepareRun。
  const prepared = prepareRun(solverProjection(project), { year: project.scope.years[0], selectedJudgmentIds: project.data.judgments.map(j => j.id), assumptionAcknowledgements: acknowledgements });
  return {
    archiveVersion: version,
    RunInput: prepared.input ? clone(prepared.input) : null,
    RunResult: prepared.input ? solve(prepared.input) : null,
    projectInputSnapshot: version === ARCHIVE_V2 ? projectSnapshotV2(project) : toSnapshotV1(project),
    preflightDiagnostics: clone(prepared.diagnostics),
    assumptionAcknowledgements: acknowledgements,
    selectionOfJudgments: project.data.judgments.map(j => ({ id: j.id, version: j.version, evidenceRefs: clone(j.evidenceRefs ?? []) }))
  };
}

export function minimalArchiveV1() {
  return archiveFromProject(minimalProjectV1(), 1);
}

export function minimalArchiveV2() {
  return archiveFromProject(upgradeProjectV1(minimalProjectV1(), { commit: false }), ARCHIVE_V2);
}

export function minimalBundleV1() {
  const project = minimalProjectV1();
  return {
    ...emptyBundle(),
    plans: [planItem(project, '旧命名方案', 'plan-v1')],
    runs: [runItem(minimalArchiveV1(), '旧历史检算', 'run-v1')]
  };
}

export function makeBinding(project, overrides = {}) {
  const pathId = overrides.pathId ?? 'compat-path-a';
  const path = project.data.paths.find(item => item.id === pathId);
  need(path !== undefined, 'MISSING_RECORD', '夹具找不到路径：' + pathId);
  const descriptor = project.data.descriptors.find(item => item.id === path.descriptorId);
  return {
    id: 'compat-binding-1',
    seq: 1,
    previousId: null,
    descriptorId: path.descriptorId,
    descriptorVersion: descriptor.version,
    pathId: path.id,
    pathVersion: path.version,
    regionId: project.scope.regionId,
    year: project.scope.years[0],
    indicatorId: 'compat-indicator',
    unit: path.unit,
    population: '示例统计对象',
    denominator: { kind: 'specified', value: 100 },
    baseYear: { kind: 'specified', value: 2025 },
    stateDefinitions: project.data.states.filter(state => state.descriptorId === path.descriptorId).map(state => ({
      id: state.id,
      version: state.version,
      label: state.label,
      range: clone(state.range),
      unit: state.unit,
      validYears: clone(state.validYears),
      scope: clone(state.scope),
      evidenceRefs: clone(state.evidenceRefs ?? [])
    })),
    sourceRefs: { caliber: [], thresholds: [] },
    confirmation: { declaredBy: '原型夹具', at: '2026-11-04T12:00:00.000Z', reason: '仅用于兼容原型' },
    ...overrides
  };
}

export function makeOverride(project, binding, overrides = {}) {
  return {
    id: 'compat-override-1',
    seq: 1,
    previousId: null,
    regionId: project.scope.regionId,
    pathId: binding.pathId,
    pathVersion: binding.pathVersion,
    year: binding.year,
    operation: 'set',
    value: 75,
    unit: binding.unit,
    bindingId: binding.id,
    referenceStateId: 'compat-a-2',
    baseline: { reading: 50, method: 'linear', evidenceRefs: [] },
    verdict: { status: 'within', detail: '仍在原状态范围', candidateStateIds: [] },
    confirmation: { declaredBy: '原型夹具', at: '2026-11-04T12:00:00.000Z', reason: '仅用于兼容原型' },
    ...overrides
  };
}

// 同一个带伪造确认的外部文件：历史可读、当前待核、采用被阻断。
export function externalFileWithForgedConfirmation() {
  const project = upgradeProjectV1(minimalProjectV1(), { commit: true });
  const binding = makeBinding(project);
  const override = makeOverride(project, binding);
  binding.confirmation = { declaredBy: '外部文件自称已核验', at: '2026-11-04T12:00:00.000Z', reason: '文件内 verified=true，未经当前确认' };
  binding.verified = true;
  override.confirmation = { declaredBy: '外部文件自称已采用', at: '2026-11-04T12:00:00.000Z', reason: '文件内 source=local，未经当前确认' };
  override.source = 'local';
  project.source = 'local';
  project.data.indicatorBindings = [binding];
  project.data.annualOverrides = [override];
  validateProjectV2(project);
  return project;
}

/* ------------------------------------------------------------- 拒绝用例表 */

// 每个用例从最小合法夹具出发，做一次改动并给出稳定拒绝码。
export function rejectionCases() {
  const v1 = minimalProjectV1();
  const v2 = upgradeProjectV1(v1, { commit: true });
  const binding = makeBinding(v2);
  const override = makeOverride(v2, binding);
  const withCollections = (bindings, overrides) => {
    const copy = clone(v2);
    copy.data.indicatorBindings = bindings;
    copy.data.annualOverrides = overrides;
    return copy;
  };
  const bundle = { ...minimalBundleV1(), archiveVersion: BUNDLE_V2 };
  return [
    {
      name: '未知项目版本 3/1.2.0',
      code: 'UNSUPPORTED_VERSION',
      run: () => { const bad = clone(v2); bad.schemaVersion = 3; bad.contractVersion = '1.2.0'; validateProjectDispatch(bad); }
    },
    {
      name: 'V2 项目缺少新增集合',
      code: 'DATA_KEYS_MISMATCH',
      run: () => { const bad = clone(v2); delete bad.data.annualOverrides; validateProjectV2(bad); }
    },
    {
      name: '未知检算封套版本 3',
      code: 'UNSUPPORTED_ARCHIVE_VERSION',
      run: () => validateArchiveDispatch({ archiveVersion: 3 })
    },
    {
      name: 'V2 快照伪装成 V1 封套',
      code: 'SNAPSHOT_VERSION_MISMATCH',
      run: () => validateArchiveDispatch({ ...minimalArchiveV2(), archiveVersion: 1 })
    },
    {
      name: 'V1 快照冒充 V2 封套',
      code: 'SNAPSHOT_VERSION_MISMATCH',
      run: () => { const bad = minimalArchiveV2(); bad.projectInputSnapshot = minimalArchiveV1().projectInputSnapshot; validateArchiveV2(bad); }
    },
    {
      name: 'seq 不连续',
      code: 'SEQ_NOT_CONTIGUOUS',
      run: () => validateIndicatorBindings([binding, { ...makeBinding(v2, { id: 'compat-binding-2', previousId: 'compat-binding-1' }) }])
    },
    {
      name: '历史链断裂：previousId 指错记录',
      code: 'BROKEN_HISTORY_CHAIN',
      run: () => validateIndicatorBindings([
        binding,
        makeBinding(v2, { id: 'compat-binding-2', seq: 2, previousId: 'compat-binding-9' })
      ])
    },
    {
      name: '历史链断裂：跨键续接',
      code: 'BROKEN_HISTORY_CHAIN',
      run: () => validateIndicatorBindings([
        binding,
        makeBinding(v2, { id: 'compat-binding-2', seq: 2, previousId: binding.id, year: 2035 })
      ])
    },
    {
      name: '非法年份 1899',
      code: 'INVALID_YEAR',
      run: () => validateIndicatorBindings([makeBinding(v2, { year: 1899 })])
    },
    {
      name: '非法年份 2301',
      code: 'INVALID_YEAR',
      run: () => validateAnnualOverrides([makeOverride(v2, binding, { year: 2301 })])
    },
    {
      name: '非有限覆盖值 NaN',
      code: 'NON_FINITE_VALUE',
      run: () => validateAnnualOverrides([makeOverride(v2, binding, { value: Number.NaN })])
    },
    {
      name: '非有限覆盖值 Infinity',
      code: 'NON_FINITE_VALUE',
      run: () => validateAnnualOverrides([makeOverride(v2, binding, { value: Number.POSITIVE_INFINITY })])
    },
    {
      name: '非有限分母',
      code: 'NON_FINITE_VALUE',
      run: () => validateIndicatorBindings([makeBinding(v2, { denominator: { kind: 'specified', value: Number.POSITIVE_INFINITY } })])
    },
    {
      name: 'revoke 覆盖带数值',
      code: 'INVALID_OVERRIDE',
      run: () => validateAnnualOverrides([makeOverride(v2, binding, { operation: 'revoke', value: 0 })])
    },
    {
      name: '未知覆盖操作',
      code: 'INVALID_OPERATION',
      run: () => validateAnnualOverrides([makeOverride(v2, binding, { operation: 'add' })])
    },
    {
      name: '未知判定状态',
      code: 'INVALID_VERDICT',
      run: () => validateAnnualOverrides([makeOverride(v2, binding, { verdict: { status: 'looks-fine', detail: '文件自称通过', candidateStateIds: [] } })])
    },
    {
      name: '缺少使用者确认',
      code: 'INVALID_CONFIRMATION',
      run: () => validateIndicatorBindings([makeBinding(v2, { confirmation: { declaredBy: '', at: '2026-11-04T12:00:00.000Z', reason: '无' } })])
    },
    {
      name: '冻结状态缺版本',
      code: 'INVALID_STATE_DEFINITION',
      run: () => validateIndicatorBindings([makeBinding(v2, { stateDefinitions: [{ id: 'compat-a-1', label: 'a1', range: null, unit: null, validYears: [2030], scope: { regionId: null }, evidenceRefs: [] }] })])
    },
    {
      name: '未知库版本 3',
      code: 'UNSUPPORTED_BUNDLE_VERSION',
      run: () => validateBundleDispatch({ ...minimalBundleV1(), archiveVersion: 3 })
    },
    {
      name: '库外层扩展字段',
      code: 'UNSUPPORTED_BUNDLE_VERSION',
      run: () => validateBundleV2({ ...bundle, extra: true })
    },
    {
      name: '库内方案与归档 ID 冲突',
      code: 'DUPLICATE_RECORD_ID',
      run: () => validateBundleV2({ ...bundle, runs: [{ ...bundle.runs[0], id: bundle.plans[0].id }] })
    },
    {
      name: 'V2 封套改了冻结状态',
      code: undefined,
      run: () => { const bad = minimalArchiveV2(); bad.projectInputSnapshot.data.states[0].label = '被改写的状态'; validateArchiveV2(bad); }
    },
    {
      name: 'V2 封套改了矩阵',
      code: undefined,
      run: () => { const bad = minimalArchiveV2(); bad.RunInput.matrix.entries[0].score = 3; validateArchiveV2(bad); }
    },
    {
      name: 'V2 封套改了身份',
      code: undefined,
      run: () => { const bad = minimalArchiveV2(); bad.projectInputSnapshot.projectId = 'other-project'; validateArchiveV2(bad); }
    },
    {
      name: 'V2 封套改了修订',
      code: undefined,
      run: () => { const bad = minimalArchiveV2(); bad.projectInputSnapshot.revision = bad.projectInputSnapshot.revision + 1; validateArchiveV2(bad); }
    }
  ];
}
