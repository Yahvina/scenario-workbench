// P7-C2B 年度覆盖原子提交原型：先持久化，写入成功后才发布一次新的内存快照。
// 依据 docs/tasks/annual-override-atomic-write.md 与 docs/proposals/annual-override-compatibility.md
// 的「P7-C2B 原子提交约束」。只模拟单一活动项目槽位；跨标签同时写入不在首版范围内。
// 本文件不在 src/ 下，也没被 index.html 或构建脚本引用：正式页面接线、持久化接入与模型导出
// 留给后续工作包。这里的存储对象由调用方注入，不接触真实 localStorage。

import { interpolate } from '../../../src/modules/timeline/logic.mjs';
import { boundaryReason, displayValue, matchesRange, rangeText } from '../../../src/modules/timeline/annual-override.mjs';
import {
  PROJECT_V2,
  bindingUsable,
  buildArchiveV2,
  historyEntries,
  latestOverride,
  makeBinding,
  minimalProjectV1,
  projectSnapshotV2,
  readSource,
  toSnapshotV1,
  upgradeProjectV1,
  validateProjectV2
} from './compat.mjs';

export const ATOMIC_SLOT_KEY = 'scenario-workbench.project.v2.atomic';
export const ATOMIC_REGION = '示例地区（非真实政策）';
export const ATOMIC_PATH_ID = 'compat-path-a';
export const ATOMIC_BINDING_ID = 'c2b-binding-1';

export const ATOMIC_NOTES = {
  order: '顺序固定：核对活动项目与预览 → 在副本上追加记录并完整验证 → 同内容原样返回 → 写入唯一活动槽位 → 写入成功后才发布一次新的内存快照。',
  noRollback: '写入失败、旧预览、路径或绑定变化、验证失败都不发布新快照；这里不存在「先通知、后回滚」的路径。',
  currency: '旧运行是否仍当前按完整项目快照核对，不只看修订号，也不用检算投影是否相等代替。',
  externalOnly: '外部导入只能查看：重新采用必须由本地显式确认命令发起，文件里的 verified/confirmation/source 不构成授权。',
  singleWriter: '首版只验证单写入者与陈旧预览拒绝；跨标签同时写入需要单独设计与验证。'
};

export class AtomicError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AtomicError';
    this.code = code;
  }
}

const clone = value => structuredClone(value);
const obj = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const integer = value => Number.isSafeInteger(value) && value >= 0;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (obj(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const digestOf = value => JSON.stringify(canonical(value));

/* ------------------------------------------------------------ 注入式存储 */

// 单一活动项目槽位的测试替身。failOnWrite 打开时 setItem 直接抛错，用来模拟存储拒绝。
export function createMemoryStorage({ failOnWrite = false } = {}) {
  const entries = new Map();
  let writes = 0;
  let failing = failOnWrite;
  return {
    getItem: key => (entries.has(key) ? entries.get(key) : null),
    setItem(key, value) {
      writes += 1;
      if (failing) throw new AtomicError('WRITE_REJECTED', '模拟存储拒绝：本次写入未落盘');
      entries.set(key, String(value));
    },
    removeItem: key => entries.delete(key),
    get length() { return entries.size; },
    get writes() { return writes; },
    setFail(flag) { failing = Boolean(flag); }
  };
}

// 槽位读写用「原文比较」实现：写入前要求槽位字节与预期一致，等价于单写入者的乐观锁。
export function createProjectSlot(storage, { key = ATOMIC_SLOT_KEY } = {}) {
  const raw = () => storage.getItem(key);
  return {
    key,
    readRaw: raw,
    read() {
      const text0 = raw();
      return text0 === null ? { raw: null, project: null } : { raw: text0, project: JSON.parse(text0) };
    },
    seed(project) {
      validateProjectV2(project);
      const serialized = JSON.stringify(project);
      storage.setItem(key, serialized);
      return serialized;
    },
    write(project, expectedRaw) {
      validateProjectV2(project);
      const serialized = JSON.stringify(project);
      if (raw() !== expectedRaw) throw new AtomicError('SLOT_CHANGED', '活动项目槽位已被其他写入者改动：请重载后重试');
      storage.setItem(key, serialized);
      return serialized;
    }
  };
}

/* ------------------------------------------------------------- 快照与指纹 */

export function snapshotOf(project) {
  return projectSnapshotV2(project);
}

// 当前性按完整项目快照核对：V2 项目含两个新增集合，因此不能用 V1 投影是否相等代替。
export function snapshotIsCurrent(project, snapshot) {
  if (!obj(snapshot)) return false;
  if (snapshot.schemaVersion === PROJECT_V2.schemaVersion) return same(snapshotOf(project), snapshot);
  if (snapshot.schemaVersion === 1) return same(toSnapshotV1(project), snapshot);
  return false;
}

// 命令里带的「绑定版本」：冻结在绑定内的版本组合，加上整条绑定的内容指纹。
export function bindingVersionOf(binding) {
  return {
    id: binding.id,
    descriptorVersion: binding.descriptorVersion,
    pathVersion: binding.pathVersion,
    states: binding.stateDefinitions.map(state => state.id + '@v' + state.version)
  };
}

export const bindingDigestOf = binding => digestOf(binding);

/* ------------------------------------------------------------------ 夹具 */

// 手算主线夹具：路径 2026 = 50、2035 = 100 线性。
// 2030 基线 = 650/9 ≈ 72.2222，2031 基线 = 700/9 ≈ 77.7778。
// 状态区间沿用 C2A 最小夹具：compat-a-1 为 [0,60)、compat-a-2 为 [60,100]。
export function atomicFixtureV2() {
  const project = upgradeProjectV1(minimalProjectV1(), { commit: false });
  project.scope.years = [2030, 2031, 2035];
  project.title = '原子提交原型夹具（非真实政策）';
  const path = project.data.paths.find(item => item.id === ATOMIC_PATH_ID);
  path.points = [
    { year: 2026, value: 50, stateId: 'compat-a-1', origin: 'user-assumption', evidenceRefs: [] },
    { year: 2035, value: 100, stateId: 'compat-a-2', origin: 'user-assumption', evidenceRefs: [] }
  ];
  project.data.indicatorBindings = [makeBinding(project, { id: ATOMIC_BINDING_ID })];
  validateProjectV2(project);
  return project;
}

/* --------------------------------------------------------------- 判定摘要 */

// P7-B 的 classifyOverride 需要 purpose 等 C2A 绑定没有的字段，直接套用只会得出
// 「绑定缺少用途」的待核结论。这里只复用它的区间纯函数（matchesRange/boundaryReason/rangeText），
// 判定口径与 P7-B 一致，但不为 C2A 绑定伪造字段。
export function describeValue({ states, referenceStateId, value, unit, hasBinding }) {
  if (!hasBinding) {
    return { status: 'pending', detail: '缺少当前采用绑定：只保存人工参数，状态对应待核。', candidateStateIds: [] };
  }
  const reference = states.find(state => state.id === referenceStateId) ?? null;
  if (!reference) {
    return { status: 'pending', detail: '未选择对照状态：请显式选一个状态用于本次核对，不从邻年复制。', candidateStateIds: [] };
  }
  if (states.some(state => matchesRange(state.range, value) === null)) {
    return { status: 'pending', detail: '对照状态没有有效数值区间：状态对应待核。', candidateStateIds: [] };
  }
  const hits = states.filter(state => matchesRange(state.range, value) === true);
  const referenceHit = matchesRange(reference.range, value) === true;
  const referenceText = rangeText(reference.range, typeof reference.unit === 'string' && reference.unit ? reference.unit : unit);
  if (referenceHit && hits.length === 1) {
    return {
      status: 'within',
      detail: '采用值 ' + displayValue(value) + ' 仍在原状态「' + reference.label + '」的区间 ' + referenceText + ' 内。',
      candidateStateIds: [reference.id]
    };
  }
  if (hits.length > 1) {
    return {
      status: 'multiple',
      detail: '同时命中 ' + hits.length + ' 个状态：' + hits.map(state => '「' + state.label + '」').join('；') + '。',
      candidateStateIds: hits.map(state => state.id)
    };
  }
  if (hits.length === 1) {
    return {
      status: 'out-of-range',
      detail: '原状态「' + reference.label + '」区间 ' + referenceText + '：' + (boundaryReason(reference.range, value) ?? '采用值越界')
        + '。其他适用状态均可排查，恰好一档命中「' + hits[0].label + '」；建议复核仅供核对。',
      candidateStateIds: [hits[0].id]
    };
  }
  return {
    status: 'gap',
    detail: '原状态「' + reference.label + '」区间 ' + referenceText + '：' + (boundaryReason(reference.range, value) ?? '采用值越界')
      + '。已排查的状态均未命中：未落入已定义状态。',
    candidateStateIds: []
  };
}

/* ------------------------------------------------ 覆盖是否仍适用于当前路径 */

// 覆盖只对「写下它的那份路径定义」有效。路径定义一变（版本号前进，或该年基线读数被改），
// 旧记录就只能留在历史里：当前读数回到新基线，并给出「基线已变，待重新采用」的原因。
export function overrideCurrency(project, record, { pathId = ATOMIC_PATH_ID, year } = {}) {
  const path = project.data.paths.find(item => item.id === pathId);
  if (!path) throw new AtomicError('PATH_MISSING', '读取指向的路径不在当前项目里：' + pathId);
  const baseline = interpolate(path, year);
  const current = baseline ? baseline.value : null;
  const frozen = obj(record) && obj(record.baseline) ? (record.baseline.reading ?? null) : null;

  if (!obj(record)) {
    return {
      applicable: false,
      reason: '基线已变，待重新采用：当前采用记录不在项目数据里。',
      frozenBaseline: null,
      currentBaseline: current,
      recordPathVersion: null,
      pathVersion: path.version
    };
  }

  const problems = [];
  if (record.pathVersion !== path.version) {
    problems.push('覆盖记录停留在路径 v' + record.pathVersion + '，当前路径为 v' + path.version);
  }
  const frozenMissing = frozen === null;
  const currentMissing = current === null;
  if (frozenMissing !== currentMissing || (!frozenMissing && !currentMissing && frozen !== current)) {
    problems.push('该年基线已从 ' + displayValue(frozen) + ' 变为 ' + displayValue(current));
  }
  return {
    applicable: problems.length === 0,
    reason: problems.length === 0 ? null : '基线已变，待重新采用：' + problems.join('；') + '。',
    frozenBaseline: frozen,
    currentBaseline: current,
    recordPathVersion: record.pathVersion,
    pathVersion: path.version
  };
}

/* ------------------------------------------------------------ 原子写入者 */

const MATERIAL_FIELDS = ['operation', 'value', 'unit', 'bindingId', 'referenceStateId', 'pathVersion', 'regionId', 'year', 'baseline', 'verdict'];
const pick = (source, fields) => Object.fromEntries(fields.map(field => [field, clone(source[field] ?? null)]));

function refuse(code, message, project) {
  return { status: 'refused', code, message, project };
}

// 外部导入的重新采用只能由本地显式确认命令发起。这里生成的确认对象只带当前绑定指纹，
// 不读取、也不接受文件里的 verified / confirmation / source 字段。
export function createReAdoption(binding, { declaredBy, at, reason } = {}) {
  if (!obj(binding) || !text(binding.id)) throw new AtomicError('INVALID_COMMAND', '重新采用必须指名当前绑定');
  if (!text(declaredBy) || !text(reason) || !text(at)) throw new AtomicError('INVALID_COMMAND', '重新采用需要本地声明、时间与理由');
  return {
    kind: 'local-re-adoption',
    issuedBy: 'local-command',
    bindingId: binding.id,
    bindingDigest: bindingDigestOf(binding),
    declaredBy,
    at,
    reason
  };
}

export function createAtomicWriter({ storage, key = ATOMIC_SLOT_KEY, notify = () => {}, now = () => new Date().toISOString() } = {}) {
  if (!storage) throw new AtomicError('INVALID_COMMAND', '必须注入活动项目槽位的存储对象');
  const slot = createProjectSlot(storage, { key });
  let memory = null;
  let slotRaw = null;
  let origin = 'local';
  let adoption = null;
  let publishCount = 0;
  let notifyCount = 0;
  const published = [];

  function requireProject() {
    if (!memory) throw new AtomicError('NO_ACTIVE_PROJECT', '没有已打开的活动项目');
    validateProjectV2(memory);
    return memory;
  }

  function open(project, options = {}) {
    validateProjectV2(project);
    memory = clone(project);
    slotRaw = options.slotRaw ?? storage.getItem(key);
    origin = options.origin ?? 'local';
    if (origin !== 'local' && origin !== 'external') throw new AtomicError('INVALID_COMMAND', '来源只能是 local 或 external');
    adoption = null;
    publishCount = 0;
    notifyCount = 0;
    published.length = 0;
    return memory;
  }

  function restore() {
    const state = slot.read();
    if (!state.project) throw new AtomicError('NO_ACTIVE_PROJECT', '活动项目槽位为空');
    return open(state.project, { origin: 'local', slotRaw: state.raw });
  }

  // 外部导入的重新采用：必须由调用方显式发起，且确认对象要与当前绑定指纹一致。
  function reAdopt(command) {
    requireProject();
    if (!obj(command) || command.issuedBy !== 'local-command' || command.kind !== 'local-re-adoption') {
      throw new AtomicError('INVALID_COMMAND', '重新采用必须由本地显式确认命令发起');
    }
    const binding = memory.data.indicatorBindings.find(item => item.id === command.bindingId);
    if (!binding) throw new AtomicError('BINDING_MISSING', '重新采用指向的绑定不在当前项目里：' + command.bindingId);
    if (command.bindingDigest !== bindingDigestOf(binding)) throw new AtomicError('BINDING_CHANGED', '重新采用确认的绑定内容与当前不一致');
    adoption = clone(command);
    origin = 'local';
    return clone(adoption);
  }

  function previewCommand(input = {}) {
    const project = requireProject();
    const operation = input.operation ?? 'set';
    if (operation !== 'set' && operation !== 'revoke') throw new AtomicError('INVALID_COMMAND', 'operation 只能是 set 或 revoke');
    const year = input.year;
    if (!Number.isInteger(year)) throw new AtomicError('INVALID_COMMAND', '预览必须指名年份');
    const pathId = input.pathId ?? ATOMIC_PATH_ID;
    const regionId = input.regionId ?? project.scope.regionId ?? null;
    const path = project.data.paths.find(item => item.id === pathId);
    if (!path) throw new AtomicError('PATH_MISSING', '预览指向的路径不在当前项目里：' + pathId);
    const bindingId = input.bindingId ?? null;
    const binding = bindingId === null ? null : project.data.indicatorBindings.find(item => item.id === bindingId);
    if (bindingId !== null && !binding) throw new AtomicError('BINDING_MISSING', '预览指向的绑定不在当前项目里：' + bindingId);
    if (operation === 'revoke' && input.value !== undefined && input.value !== null) {
      throw new AtomicError('INVALID_COMMAND', 'revoke 不能带数值');
    }
    const baseline = interpolate(path, year);
    return {
      previewId: 'preview-' + (project.data.annualOverrides.length + 1),
      projectId: project.id,
      revision: project.revision,
      snapshotDigest: digestOf(snapshotOf(project)),
      slotRaw,
      regionId,
      pathId,
      pathVersion: path.version,
      pathDigest: digestOf(path),
      bindingId,
      bindingVersion: binding ? bindingVersionOf(binding) : null,
      bindingDigest: binding ? bindingDigestOf(binding) : null,
      year,
      operation,
      value: operation === 'revoke' ? null : input.value,
      referenceStateId: input.referenceStateId ?? null,
      declaredBy: input.declaredBy ?? '本地使用者',
      reason: input.reason ?? '原子提交原型：单年覆盖',
      at: input.at ?? now(),
      baselineReading: baseline ? baseline.value : null,
      baselineMethod: baseline ? (baseline.derived ? (path.interpolation === 'step' ? 'step' : 'linear') : 'anchor') : 'missing'
    };
  }

  // 写入前逐项复核：活动项目身份、目标路径、目标年份、绑定内容与完整绑定条件、
  // 修订号、完整项目快照、槽位字节。先给最具体的诊断，再退到「陈旧预览 / 快照变化 / 槽位变化」。
  function recheck(command) {
    const project = requireProject();
    if (command.projectId !== project.id) return { code: 'PROJECT_MISMATCH', message: '预览属于另一个项目：' + command.projectId };

    const path = project.data.paths.find(item => item.id === command.pathId);
    if (!path) return { code: 'PATH_MISSING', message: '目标路径已不存在：' + command.pathId };
    if (path.version !== command.pathVersion || digestOf(path) !== command.pathDigest) {
      return { code: 'PATH_CHANGED', message: '目标路径已变化：预览为 v' + command.pathVersion + '，当前为 v' + path.version };
    }
    if (!project.scope.years.includes(command.year)) {
      return { code: 'YEAR_OUT_OF_SCOPE', message: '目标年份不在当前研究范围：' + command.year };
    }
    if (command.bindingId !== null) {
      const binding = project.data.indicatorBindings.find(item => item.id === command.bindingId);
      if (!binding) return { code: 'BINDING_MISSING', message: '预览指向的绑定已不在当前项目里：' + command.bindingId };
      if (command.bindingDigest !== bindingDigestOf(binding)) {
        return { code: 'BINDING_CHANGED', message: '绑定内容已变化（版本组合可能相同）：' + command.bindingId };
      }
      const reading = bindingUsable(project, binding);
      if (!reading.usable) return { code: 'BINDING_NOT_USABLE', message: '完整绑定条件未通过：' + reading.problems[0], refusal: reading.refusal };
    }

    if (command.revision !== project.revision) {
      return { code: 'STALE_PREVIEW', message: '预览已过期：预览时修订为 ' + command.revision + '，当前为 ' + project.revision };
    }
    if (command.snapshotDigest !== digestOf(snapshotOf(project))) {
      return { code: 'SNAPSHOT_CHANGED', message: '项目内容已变化（修订号相同）：预览时的完整项目快照与当前不一致' };
    }
    if (command.slotRaw !== storage.getItem(key)) {
      return { code: 'SLOT_CHANGED', message: '活动项目槽位已被其他写入者改动：请重载后重试' };
    }
    return null;
  }

  // 模拟「预览之后活动项目又被改动」：其他写者、其他入口保存，或同一修订号下内容被改动。
  // 这不是提交路径：不追加覆盖记录、不发布快照、不通知。首版只用于单写入者的冲突验证。
  function mutate(change, { bumpRevision = true } = {}) {
    const project = requireProject();
    const next = clone(project);
    change(next);
    if (bumpRevision) next.revision = project.revision + 1;
    validateProjectV2(next);
    slot.write(next, slotRaw);
    memory = next;
    slotRaw = JSON.stringify(next);
    return clone(next);
  }

  function buildRecord(project, command) {
    const list = project.data.annualOverrides;
    const keyOf = record => JSON.stringify([record.regionId ?? null, record.pathId, record.year]);
    const mine = keyOf({ regionId: command.regionId, pathId: command.pathId, year: command.year });
    const group = list.filter(record => keyOf(record) === mine).sort((a, b) => a.seq - b.seq);
    const previous = group[group.length - 1] ?? null;
    const path = project.data.paths.find(item => item.id === command.pathId);
    const binding = command.bindingId === null ? null : project.data.indicatorBindings.find(item => item.id === command.bindingId);
    const baseline = interpolate(path, command.year);
    const states = project.data.states.filter(state => state.descriptorId === path.descriptorId);
    const seq = list.length + 1;
    const verdict = command.operation === 'revoke'
      ? {
        status: 'baseline',
        detail: '撤销覆盖：回到该年基线 ' + displayValue(baseline ? baseline.value : null) + '。',
        candidateStateIds: []
      }
      : describeValue({
        states,
        referenceStateId: command.referenceStateId,
        value: command.value,
        unit: binding ? binding.unit : path.unit,
        hasBinding: binding !== null
      });
    return {
      id: 'c2b-override-' + seq,
      seq,
      previousId: previous ? previous.id : null,
      regionId: command.regionId ?? null,
      pathId: command.pathId,
      pathVersion: path.version,
      year: command.year,
      operation: command.operation,
      value: command.operation === 'revoke' ? null : command.value,
      unit: binding ? binding.unit : path.unit,
      bindingId: command.bindingId,
      referenceStateId: command.referenceStateId ?? null,
      baseline: {
        reading: baseline ? baseline.value : null,
        method: baseline ? (baseline.derived ? (path.interpolation === 'step' ? 'step' : 'linear') : 'anchor') : 'missing',
        originYear: baseline ? baseline.year : null,
        evidenceRefs: []
      },
      verdict,
      confirmation: { declaredBy: command.declaredBy, at: command.at, reason: command.reason }
    };
  }

  function commit(command, options = {}) {
    const project = requireProject();

    // 读取来源：调用方不传时按打开项目时的来源；显式传入时必须与它一致。
    // 走外部导入入口的项目一律只读，重新采用要另走本地确认命令。
    const source = options.source ?? origin;
    try {
      readSource({ source });
    } catch (error) {
      return refuse('READ_SOURCE_REQUIRED', error.message, project);
    }
    if (source !== origin) {
      return refuse('SOURCE_MISMATCH', '传入的读取来源（' + source + '）与打开项目时的来源（' + origin + '）不一致', project);
    }
    if (source === 'external') {
      return refuse('EXTERNAL_READ_ONLY',
        '外部导入只能查看；重新采用须由本地显式确认命令发起（本地确认后 origin 才变为 local）。', project);
    }
    if (options.adoption !== undefined && !same(options.adoption, adoption)) {
      return refuse('INVALID_COMMAND', '采用的确认命令与本地已签发的确认不一致', project);
    }

    const problem = recheck(command);
    if (problem) return refuse(problem.code, problem.message, project);

    const next = clone(project);
    const record = buildRecord(next, command);
    const previous = next.data.annualOverrides.filter(item => item.id === record.previousId)[0] ?? null;
    if (previous && same(pick(previous, MATERIAL_FIELDS), pick(record, MATERIAL_FIELDS))) {
      return { status: 'unchanged', code: 'SAME_CONTENT', message: '有效内容与同键最新记录相同：原样返回，不写入、不通知', project: clone(memory), record: clone(previous) };
    }
    next.data.annualOverrides = [...next.data.annualOverrides, record];
    next.revision = project.revision + 1;

    try {
      validateProjectV2(next);
    } catch (error) {
      return refuse('VALIDATION_FAILED', '副本验证失败，未写入：' + error.message, project);
    }

    // 先持久化；只有写入成功之后才发布新的内存快照并通知一次。
    try {
      slot.write(next, command.slotRaw);
    } catch (error) {
      return refuse(error.code ?? 'WRITE_REJECTED', error.message, project);
    }
    memory = next;
    slotRaw = JSON.stringify(next);
    publishCount += 1;
    published.push(clone(next));
    notify(clone(next));
    notifyCount += 1;
    return { status: 'published', project: clone(next), record: clone(record) };
  }

  // 当前读数：覆盖只在它写下的那份路径定义上仍成立时才算数。
  // 路径版本或其基线读数变了，旧覆盖只留在历史里，当前读数回到新基线并说明原因。
  // applicable 专指「当前值由覆盖给出」：本来就没有覆盖时为 false，但 reason 为 null。
  function reading({ regionId = null, pathId = ATOMIC_PATH_ID, year } = {}) {
    const project = requireProject();
    const path = project.data.paths.find(item => item.id === pathId);
    if (!path) throw new AtomicError('PATH_MISSING', '读取指向的路径不在当前项目里：' + pathId);
    // 覆盖只在同一项目、地区、路径与年份内生效：默认读当前项目地区，不跨地区套用。
    const region = regionId ?? project.scope.regionId ?? null;
    const baseline = interpolate(path, year);
    const current = baseline ? baseline.value : null;
    const record = latestOverride(project, { regionId: region, pathId, year });
    const stored = record.recordId === null ? null : (project.data.annualOverrides.find(item => item.id === record.recordId) ?? null);
    const currency = overrideCurrency(project, stored, { pathId, year });
    const adopted = record.operation === 'set' && currency.applicable;
    return {
      year,
      regionId: region,
      baseline: current,
      override: record,
      value: adopted ? record.value : current,
      adoptedValue: adopted ? record.value : null,
      applicable: adopted,
      reason: record.operation === 'set' && !currency.applicable ? currency.reason : null,
      frozenBaseline: currency.frozenBaseline,
      currentBaseline: currency.currentBaseline,
      // 本次读数依据的路径版本，以及旧记录冻结的那个版本：两者不同即说明覆盖已陈旧。
      pathVersion: currency.pathVersion,
      recordPathVersion: currency.recordPathVersion
    };
  }

  return {
    key,
    slot,
    get project() { return memory === null ? null : clone(memory); },
    get revision() { return memory === null ? null : memory.revision; },
    get origin() { return origin; },
    get readOnly() { return origin !== 'local'; },
    get adoption() { return adoption === null ? null : clone(adoption); },
    get publishCount() { return publishCount; },
    get notifyCount() { return notifyCount; },
    get published() { return published.map(clone); },
    open,
    restore,
    reAdopt,
    preview: previewCommand,
    commit,
    mutate,
    reading,
    history: () => historyEntries(requireProject()),
    bindingVersion: bindingId => {
      const project = requireProject();
      const binding = project.data.indicatorBindings.find(item => item.id === bindingId);
      return binding ? bindingVersionOf(binding) : null;
    }
  };
}

export { bindingUsable, buildArchiveV2, historyEntries, interpolate, latestOverride, makeBinding, snapshotIsCurrent as isCurrent };
