// 年度覆盖原子台账（slot-based ledger）。
//
// 为什么要有这个文件：项目契约（src/core/contracts.mjs 的 DATA_KEYS）是冻结的，逐年覆盖不能塞进
// project.data。因此覆盖单独占用一个按项目 ID 归属的存储槽位，项目对象本身一个字节都不改。
// 做法沿用已经通过 14 项验收的研究原型 docs/research/annual-override/atomic-write.mjs，但原型是
// 研究代码、明确不进发布构建，所以这里按同样的规则重写为可发布的独立实现：
// 不 import 原型，也不 import 原型里那份版本兼容文件。
//
// 【单写入者，仅此而已】本台账只覆盖「单一活动项目 + 单一写入者 + 顺序提交」。
// 跨标签页 / 跨进程同时写入没有被设计、没有被实现、没有被验证：命令里冻结的 slotRaw（槽位字节）
// 只能发现「槽位已经被别人改过」，不能阻止两个写入者各自读到旧字节后同时写入。
// 需要真正的并发写入时必须另行设计（锁、版本向量或提交日志），不能靠这里。
//
// 【顺序纪律，规则 1】commit 的步骤固定为：在副本上生成下一条记录 → 整份写入槽位 →
// **只有写入真的成功** 才替换内存记录、publishCount +1、notify 一次。写入失败时不存在
// 「先通知、后回滚」的路径：内存、计数、槽位字节与 reading() 全都保持提交前的样子。
//
// 槽位字节形状（这份 JSON 就是 slotRaw()）：
//   {format:'scenario-workbench.annual-overrides', slotVersion:1, projectId, records:[...]}
// load 只在 payload.projectId === project.id 时采用其中的 records；别的项目（或坏字节）一律
// 当作空台账起步，绝不抛错打断调用方。同一个槽名只承载一个项目的台账，因此一个项目一个槽名；
// key 参数就是留给「同机多项目」时各自用独立槽名的。
//
// notify 的载荷：{projectId, record, historyCount}。record 是刚发布的那一条。
//
// 复用纪律：判定与展示一律用 src/modules/timeline/annual-override.mjs 的
// classifyOverride / displayValue / bindingNoteFor；matchesRange / boundaryReason / rangeText
// 通过 classifyOverride 间接生效，本文件不复制它们的规则。

import { interpolate } from './logic.mjs';
import { bindingNoteFor, classifyOverride, displayValue } from './annual-override.mjs';

export const OVERRIDE_SLOT_KEY = 'scenario-workbench.annual-overrides.v1';
export const OVERRIDE_SLOT_FORMAT = 'scenario-workbench.annual-overrides';
export const OVERRIDE_SLOT_VERSION = 1;

// 有效内容字段：只有这些字段不同才算「换了决定」。确认人、时间、理由、id / seq / previousId
// 只是记录本身，改理由重提同一条不算新决定，因此不参与判等。
// 清单与研究原型的 MATERIAL_FIELDS 逐项对齐（operation, value, unit, bindingId, referenceStateId,
// pathVersion, regionId, year, baseline, verdict）——这里如实保留 unit 与 bindingId，是因为本台账确实
// 会写 unit（取自路径），而 bindingId 恒为 null：本台账没有绑定槽位，保留它是为了字段口径可逐项核对，
// 不要据此以为本台账做过绑定核验。verdict 在本台账里是「状态对应待核」，不是数值判档结论。
export const OVERRIDE_MATERIAL_FIELDS = [
  'operation', 'value', 'unit', 'bindingId', 'referenceStateId',
  'pathVersion', 'regionId', 'year', 'baseline', 'verdict'
];

const MATERIAL_FIELDS = OVERRIDE_MATERIAL_FIELDS;
const SOURCES = ['local', 'external'];

export class OverrideError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OverrideError';
    this.code = code;
  }
}

const clone = value => structuredClone(value);
const obj = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const nowIso = () => new Date().toISOString();

// 排序对象键后再序列化：字段顺序不同的同一份内容必须得到同一个摘要。
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (obj(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

const digestOf = value => JSON.stringify(canonical(value));
const same = (a, b) => digestOf(a) === digestOf(b);
const pick = (source, fields) => Object.fromEntries(fields.map(field => [field, clone(source?.[field] ?? null)]));

// 同键定义：地区 + 路径 + 年份。链上的 previousId / 判等 / 读数都按这个键分组。
const keyOf = holder => JSON.stringify([holder.regionId ?? null, holder.pathId ?? null, holder.year ?? null]);

// 快照摘要用科学内容（scope / data / selection），不含 title 与 view：
// 标题或界面标签的变化不是科学内容变化，也不该让一份预览失效；data 里任何内容变化都要报 SNAPSHOT_CHANGED。
// revision 也在摘要里，但 recheck 会先比修订号，所以「修订号变了」永远报 STALE_PREVIEW。
function scientificSnapshot(project) {
  return {
    schemaVersion: project.schemaVersion ?? null,
    contractVersion: project.contractVersion ?? null,
    projectId: project.id ?? null,
    revision: project.revision ?? null,
    scope: project.scope ?? null,
    data: project.data ?? null,
    selection: project.selection ?? null
  };
}

function encodeLedger(projectId, records) {
  return JSON.stringify({
    format: OVERRIDE_SLOT_FORMAT,
    slotVersion: OVERRIDE_SLOT_VERSION,
    projectId,
    records
  });
}

// 坏字节、别的格式、别的版本、缺字段一律返回 null（当作空台账），绝不抛出去。
function decodeLedger(raw) {
  if (!text(raw)) return null;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj(payload) || payload.format !== OVERRIDE_SLOT_FORMAT || payload.slotVersion !== OVERRIDE_SLOT_VERSION) return null;
  if (!text(payload.projectId) || !Array.isArray(payload.records)) return null;
  return payload;
}

const wellFormedRecord = record => obj(record) && text(record.id) && Number.isSafeInteger(record.seq) && record.seq >= 1;

/* ------------------------------------------------------------ 注入式存储 */

// 测试替身：writes 在【每次尝试】前自增，因此被拒绝的那次也计数——这正是用来证明
// 「写入失败发生在落盘之前、且内存状态没被换掉」的证据。failOnWrite 打开时 setItem 直接抛错。
export function createMemoryStorage({ failOnWrite = false } = {}) {
  const entries = new Map();
  let writes = 0;
  let failing = failOnWrite;
  return {
    getItem: key => (entries.has(key) ? entries.get(key) : null),
    setItem(key, value) {
      writes += 1;
      if (failing) throw new OverrideError('WRITE_REJECTED', '模拟存储拒绝：本次写入未落盘');
      entries.set(key, String(value));
    },
    removeItem: key => entries.delete(key),
    get length() { return entries.size; },
    get writes() { return writes; },
    setFail(flag) { failing = Boolean(flag); }
  };
}

/* ------------------------------------------------------------------ 台账 */

export function createOverrideLedger({ storage, key = OVERRIDE_SLOT_KEY, notify = () => {} } = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new OverrideError('INVALID_STORAGE', '必须注入可读写的存储对象（至少要有 getItem 与 setItem）');
  }
  if (typeof notify !== 'function') throw new OverrideError('INVALID_NOTIFY', 'notify 必须是函数');

  let projectId = null;
  let records = [];
  let origin = 'local';
  let adoption = null;
  let publishCount = 0;
  let notifyCount = 0;

  // 槽位字节的实时读取。读失败按「没有内容」处理：坏存储不能让 load / preview 抛出去。
  function readRaw() {
    try {
      const raw = storage.getItem(key);
      return typeof raw === 'string' ? raw : null;
    } catch {
      return null;
    }
  }

  function refuse(code, message) {
    return { status: 'refused', code, message };
  }

  function load(project, options = {}) {
    if (!obj(project) || !text(project.id)) throw new OverrideError('INVALID_PROJECT', 'load 需要一个带非空 id 的项目对象');
    const nextOrigin = options.origin ?? 'local';
    if (!SOURCES.includes(nextOrigin)) throw new OverrideError('INVALID_COMMAND', '来源只能是 local 或 external');
    const payload = decodeLedger(readRaw());
    projectId = project.id;
    // 只采用同一个项目的台账；别的项目或坏字节都空起步。读入时按 seq 排序，保证「最旧在前」。
    records = payload && payload.projectId === project.id
      ? payload.records.filter(wellFormedRecord).map(clone).sort((a, b) => a.seq - b.seq)
      : [];
    origin = nextOrigin;
    adoption = null;
    publishCount = 0;
    notifyCount = 0;
    return { projectId, origin, records: records.map(clone) };
  }

  // 没 load 过就顺手按本地来源采用一次；项目 ID 不符则明确报错，绝不把两个项目的覆盖混在一起。
  function ensureLoaded(project) {
    if (!obj(project) || !text(project.id)) throw new OverrideError('INVALID_PROJECT', '需要一个带非空 id 的项目对象');
    if (projectId === null) { load(project); return; }
    if (projectId !== project.id) throw new OverrideError('PROJECT_MISMATCH', '当前台账属于另一个项目：' + projectId);
  }

  function requirePath(project, pathId) {
    const path = (project.data?.paths ?? []).find(item => item.id === pathId);
    if (!path) throw new OverrideError('PATH_MISSING', '目标路径不在当前项目里：' + pathId);
    return path;
  }

  function historyFor(regionId, pathId, year) {
    const wanted = keyOf({ regionId, pathId, year });
    return records.filter(record => keyOf(record) === wanted).sort((a, b) => a.seq - b.seq);
  }

  // 预览只产出命令数据，不写入任何东西。命令把「预览当时」的身份与版本全部冻结下来，
  // 提交时才能真正做到「按字节、按版本」复核，而不是拿当前状态重新解释一遍。
  // 空白 / null 一律是撤销（规则 4）：撤销永远不等于 0，0 是会被真的写下去的有效值。
  function preview(project, input = {}) {
    ensureLoaded(project);
    if (!Number.isInteger(input.year)) throw new OverrideError('INVALID_COMMAND', '预览必须指名年份（整数）');
    if (!text(input.pathId)) throw new OverrideError('INVALID_COMMAND', '预览必须指名路径');
    const path = requirePath(project, input.pathId);

    const raw = input.value;
    const cleared = raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
    let value = null;
    if (!cleared) {
      if (typeof raw !== 'number' && typeof raw !== 'string') {
        throw new OverrideError('INVALID_COMMAND', '拟采用值只能是数字或数字文本；空白表示撤销');
      }
      value = typeof raw === 'number' ? raw : Number(raw.trim());
      if (!Number.isFinite(value)) {
        throw new OverrideError('INVALID_COMMAND', '拟采用值须为有限数字；空白表示撤销（撤销不等于 0）');
      }
    }

    const baseline = interpolate(path, input.year);
    const regionId = input.regionId ?? project.scope?.regionId ?? null;
    return {
      kind: 'annual-override',
      previewId: 'override-preview-' + (records.length + 1),
      projectId: project.id,
      projectRevision: project.revision,
      snapshotDigest: digestOf(scientificSnapshot(project)),
      slotRaw: readRaw(), // 预览时的槽位字节：等价于单写入者的乐观锁
      regionId,
      pathId: input.pathId,
      pathVersion: path.version ?? null,
      pathDigest: digestOf(path),
      year: input.year,
      operation: cleared ? 'revoke' : 'set',
      value,
      unit: path.unit ?? null,
      bindingId: null,
      referenceStateId: input.referenceStateId ?? null,
      declaredBy: input.declaredBy ?? null,
      reason: input.reason ?? null,
      at: input.at ?? nowIso(),
      baselineReading: baseline ? baseline.value : null,
      baselineMethod: baseline ? (baseline.derived ? (path.interpolation === 'step' ? 'step' : 'linear') : 'anchor') : 'missing'
    };
  }

  // 记录是历史，写下就不再改写；这里只在追加时生成新的一条。
  // 撤销记录的 value 必须是 null —— 让「清空」与「采用 0」在字节层面就分得开（规则 4）。
  function buildRecord(project, command, latest, seq) {
    const path = requirePath(project, command.pathId);
    const baseline = interpolate(path, command.year);
    const cleared = command.operation === 'revoke';
    return {
      id: 'override-' + seq,
      seq,
      previousId: latest ? latest.id : null,
      projectId: project.id,
      regionId: command.regionId ?? null,
      pathId: command.pathId,
      pathVersion: path.version ?? null,
      year: command.year,
      operation: cleared ? 'revoke' : 'set',
      value: cleared ? null : command.value,
      unit: path.unit ?? null,
      bindingId: null,
      referenceStateId: command.referenceStateId ?? null,
      baseline: {
        reading: baseline ? baseline.value : null,
        method: baseline ? (baseline.derived ? (path.interpolation === 'step' ? 'step' : 'linear') : 'anchor') : 'missing',
        originYear: baseline ? baseline.year : null,
        evidenceRefs: []
      },
      verdict: verdictOf(project, path, command, baseline),
      confirmation: {
        declaredBy: command.declaredBy ?? null,
        at: command.at ?? nowIso(),
        reason: command.reason ?? null
      }
    };
  }

  // 判定复用 P7-B 的 classifyOverride：正式项目没有可核验绑定（binding 恒为 null），
  // 所以结论如实落在「状态对应待核」；本台账不伪造绑定字段去换一个数值结论。
  function verdictOf(project, path, command, baseline) {
    if (command.operation === 'revoke') {
      return {
        status: 'baseline',
        detail: '撤销覆盖：回到该年基线 ' + displayValue(baseline ? baseline.value : null) + '。',
        candidateStateIds: []
      };
    }
    const states = (project.data?.states ?? []).filter(state => state.descriptorId === path.descriptorId);
    const result = classifyOverride({
      baseline: baseline ? baseline.value : null,
      override: command.value,
      states,
      referenceStateId: command.referenceStateId ?? null,
      binding: null,
      year: command.year,
      region: command.regionId ?? null,
      missingBindingNote: bindingNoteFor(path)
    });
    return {
      status: result.verdict,
      detail: result.reasons[0] ?? '',
      candidateStateIds: result.candidates.map(item => item.id)
    };
  }

  // 逐项复核，顺序从最具体到最笼统：身份 → 路径 → 年份 → 修订号 → 完整快照 → 槽位字节。
  // 顺序本身就是规则 5 的一部分：路径变了要报 PATH_CHANGED，而不是被后面的「陈旧预览」吞掉；
  // 同修订号下的内容变化要报 SNAPSHOT_CHANGED，而不是笼统的过期。
  function recheck(project, command) {
    if (command.projectId !== project.id) {
      return { code: 'PROJECT_MISMATCH', message: '预览属于另一个项目：' + command.projectId };
    }
    const path = (project.data?.paths ?? []).find(item => item.id === command.pathId);
    if (!path) return { code: 'PATH_MISSING', message: '目标路径已不存在：' + command.pathId };
    if ((path.version ?? null) !== (command.pathVersion ?? null) || digestOf(path) !== command.pathDigest) {
      return { code: 'PATH_CHANGED', message: '目标路径已变化：预览为 v' + command.pathVersion + '，当前为 v' + (path.version ?? null) };
    }
    if (!(project.scope?.years ?? []).includes(command.year)) {
      return { code: 'YEAR_OUT_OF_SCOPE', message: '目标年份不在当前研究范围：' + command.year };
    }
    if (project.revision !== command.projectRevision) {
      return { code: 'STALE_PREVIEW', message: '预览已过期：预览时修订为 ' + command.projectRevision + '，当前为 ' + project.revision };
    }
    if (digestOf(scientificSnapshot(project)) !== command.snapshotDigest) {
      return { code: 'SNAPSHOT_CHANGED', message: '项目内容已变化（修订号相同）：预览时的完整项目快照与当前不一致' };
    }
    if (readRaw() !== (command.slotRaw ?? null)) {
      return { code: 'SLOT_CHANGED', message: '年度覆盖槽位已被其他写入者改动：请重载后重试' };
    }
    return null;
  }

  // 提交：先持久化，写入成功之后才发布内存状态。这是本模块最重要的一条顺序（规则 1）：
  // 写入被拒绝时，records / 计数 / 槽位字节 / reading() 都必须与提交前逐项相同，不留半成品。
  function commit(project, command, options = {}) {
    ensureLoaded(project);
    if (!obj(command) || command.kind !== 'annual-override') {
      return refuse('INVALID_COMMAND', '提交需要 preview() 或 revoke() 生成的年度覆盖命令');
    }

    // 读取来源：由调用方显式传入（缺省取打开项目时的来源），显式传入时必须与打开时一致。
    // 「只读」判定只看这一次调用，绝不读命令或槽位数据里的 verified / confirmation / source：
    // 文件里自称已核验不构成任何授权（规则 8）。
    const source = options.source ?? origin;
    if (!SOURCES.includes(source)) {
      return refuse('READ_SOURCE_REQUIRED', '必须由调用方显式传入读取来源（local 或 external）：文件里的 verified / confirmation / source 标记都不构成授权');
    }
    if (source !== origin) {
      return refuse('SOURCE_MISMATCH', '传入的读取来源（' + source + '）与打开项目时的来源（' + origin + '）不一致');
    }
    if (source === 'external') {
      return refuse('EXTERNAL_READ_ONLY', '外部导入只能查看；重新采用必须由本地显式确认命令（local-re-adoption）发起。');
    }
    if (options.adoption !== undefined && !same(options.adoption, adoption)) {
      return refuse('INVALID_COMMAND', '提交携带的重新采用命令与本地已签发的不一致');
    }

    const problem = recheck(project, command);
    if (problem) return refuse(problem.code, problem.message);

    const group = historyFor(command.regionId ?? null, command.pathId, command.year);
    const latest = group.length ? group[group.length - 1] : null;
    const record = buildRecord(project, command, latest, records.length + 1);

    // 有效内容与同键最新一条相同：原样返回，不写槽位、不通知、不加编号（规则 3）。
    if (latest && same(pick(latest, MATERIAL_FIELDS), pick(record, MATERIAL_FIELDS))) {
      return { status: 'unchanged', code: 'SAME_CONTENT', record: clone(latest) };
    }

    const nextRecords = [...records.map(clone), record];
    let encoded;
    try {
      encoded = encodeLedger(project.id, nextRecords);
    } catch (error) {
      return refuse('WRITE_REJECTED', '台账序列化失败，未发布：' + (error?.message ?? '未知错误'));
    }
    try {
      storage.setItem(key, encoded); // ← 先持久化
    } catch (error) {
      return refuse('WRITE_REJECTED', '写入被存储拒绝，未发布：' + (error?.message ?? '未知写入错误'));
    }

    // ← 只有写入真的成功，才动内存、计数并通知一次。
    records = nextRecords;
    publishCount += 1;
    notify({ projectId: project.id, record: clone(record), historyCount: nextRecords.length });
    notifyCount += 1;
    return { status: 'published', record: clone(record) };
  }

  // 撤销就是一条 operation='revoke' 的提交，走同一条持久化与复核路径：清空也必须真的落盘，
  // 不能只在内存里把值抹掉。
  function revoke(project, input = {}, options = {}) {
    return commit(project, preview(project, { ...input, value: null }), options);
  }

  // 记录的 pathVersion 或该年基线读数与当前路径对不上，这份覆盖就不再作为当前采用值（规则 7）。
  // 记录本身绝不改写、绝不删除：历史留在 history() 里，当前读数回到新基线，并说明变了什么。
  function currencyOf(path, record, current) {
    if (!record || record.operation !== 'set') {
      return {
        applicable: false,
        reason: null,
        frozenBaseline: obj(record?.baseline) ? (record.baseline.reading ?? null) : null,
        currentBaseline: current,
        pathVersion: path.version ?? null,
        recordPathVersion: record?.pathVersion ?? null
      };
    }
    const frozen = obj(record.baseline) ? (record.baseline.reading ?? null) : null;
    const problems = [];
    if ((record.pathVersion ?? null) !== (path.version ?? null)) {
      problems.push('覆盖记录停留在路径 v' + record.pathVersion + '，当前路径为 v' + (path.version ?? null));
    }
    const frozenMissing = frozen === null || frozen === undefined;
    const currentMissing = current === null || current === undefined;
    if (frozenMissing !== currentMissing || (!frozenMissing && !currentMissing && frozen !== current)) {
      problems.push('该年基线已从 ' + displayValue(frozen) + ' 变为 ' + displayValue(current));
    }
    return {
      applicable: problems.length === 0,
      reason: problems.length === 0 ? null : '基线已变，待重新采用：' + problems.join('；') + '。',
      frozenBaseline: frozen,
      currentBaseline: current,
      pathVersion: path.version ?? null,
      recordPathVersion: record.pathVersion ?? null
    };
  }

  // 当前读数。regionId 缺省取项目自己的地区（规则 9）：覆盖记录里存的就是项目地区，
  // 这里若默认成 null，一条写对了的覆盖会被读成「不存在」。年份与地区都从记录/项目来，
  // 不从任何硬编码默认值来。
  function reading(project, input = {}) {
    ensureLoaded(project);
    const path = requirePath(project, input.pathId);
    const regionId = input.regionId ?? project.scope?.regionId ?? null;
    const baseline = interpolate(path, input.year);
    const current = baseline ? baseline.value : null;
    const group = historyFor(regionId, input.pathId, input.year);
    const record = group.length ? group[group.length - 1] : null;
    const currency = currencyOf(path, record, current);
    // adopted 的确切含义：当前采用值由覆盖给出。没有覆盖时为 false，但 reason 也是 null；
    // 「没有覆盖」与「有覆盖却已失效」靠 reason 区分，后者一定有说明。
    const adopted = Boolean(record) && record.operation === 'set' && currency.applicable;
    return {
      year: input.year,
      pathId: input.pathId,
      regionId,
      baseline: current,
      adopted,
      value: adopted ? record.value : current,
      // 没有任何采用时必须返回 null，不能是 0：0 是一个真的被采用的数值，两者不可混同（规则 4）。
      adoptedValue: adopted ? record.value : null,
      reason: record && record.operation === 'set' && !currency.applicable ? currency.reason : null,
      frozenBaseline: currency.frozenBaseline,
      currentBaseline: currency.currentBaseline,
      pathVersion: currency.pathVersion,
      recordPathVersion: currency.recordPathVersion,
      // operation 是【同键最新一条记录】的操作；一条记录都没有时为 'baseline'。
      // 最新是 revoke 时 operation 为 'revoke'、adopted 为 false、value 回到基线。
      operation: record ? record.operation : 'baseline',
      recordId: record ? record.id : null,
      historyCount: group.length
    };
  }

  // 历史按同键返回，最旧在前。历史记录只读，永远不改写、不删除。
  function history(project, input = {}) {
    ensureLoaded(project);
    requirePath(project, input.pathId);
    const regionId = input.regionId ?? project.scope?.regionId ?? null;
    return historyFor(regionId, input.pathId, input.year).map(clone);
  }

  // 外部导入的重新采用：只能由本地显式确认命令发起。issuedBy 不是 'local-command' 一律拒绝，
  // 文件里的 verified / confirmation / source 都不参与这个判断（规则 8）。
  function reAdopt(command) {
    if (!obj(command) || command.kind !== 'local-re-adoption' || command.issuedBy !== 'local-command') {
      throw new OverrideError('INVALID_COMMAND', '重新采用必须由本地显式确认命令发起（kind: local-re-adoption，issuedBy: local-command）');
    }
    if (!text(command.bindingDigest) || !text(command.declaredBy) || !text(command.at) || !text(command.reason)) {
      throw new OverrideError('INVALID_COMMAND', '重新采用命令需要绑定指纹、本地声明、时间与理由，缺一不可');
    }
    adoption = clone(command);
    origin = 'local';
    return clone(adoption);
  }

  return {
    key,
    slotRaw: readRaw,
    publishCount: () => publishCount,
    notifyCount: () => notifyCount,
    load,
    preview,
    commit,
    revoke,
    reading,
    history,
    reAdopt,
    get projectId() { return projectId; },
    get origin() { return origin; },
    get readOnly() { return origin !== 'local'; },
    get adoption() { return adoption === null ? null : clone(adoption); }
  };
}
