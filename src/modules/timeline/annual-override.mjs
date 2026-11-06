// P7-B 单年覆盖预览：纯函数判定，不写入任何状态。
// 依据 docs/proposals/annual-override-state-rules.md。这里只回答「如果这一年改成 X 会怎样」，
// 不产生保存、导出、批量重算或状态绑定；比较用保存精度，显示用的四舍五入不参与判档。
// P7-C1：可核验绑定只能由调用方通过显式入参传入。本模块不认识任何全局开关，也不读路径上
// 携带的 reviewBinding 内容；正式入口从不安装供应者，因此正式源码与默认离线产物恒为「未绑定」，
// 项目、备份与恢复数据里携带的绑定只在界面上报「未经核验」。供应者的安装代码不在源码树里，
// 数值判定本身由纯函数测试与独立测试入口验证。

export const OVERRIDE_NOTE = '只改这一年：预览不改任何已保存内容，也不进入已有检算。基线、拟采用值和原选状态分开显示，清空即恢复基线。';
export const OVERRIDE_PENDING_BINDING = '生产项目缺少显式指标绑定：状态对应待核。';
// 项目、备份与恢复数据里携带的 reviewBinding 一律按未核验处理：只报这条提示，不读它的内容。
export const OVERRIDE_UNVERIFIED_BINDING = '项目数据里携带的指标绑定未经核验：状态对应待核。';
export const OVERRIDE_NO_BASELINE = '该年没有基线值（路径缺失或未覆盖此年）：只能核对拟采用值，基线为缺失。';
export const OVERRIDE_NO_STATE = '未选择对照状态：请显式选一个状态用于本次核对，不从邻年复制。';
export const OVERRIDE_NO_RANGE = '对照状态没有有效数值区间：状态对应待核。';
export const OVERRIDE_ONLY_VALUES = '预览不写入：拟采用值未进入任何已有检算，原矩阵分数仍只解释原来的离散状态。';
export const OVERRIDE_SUGGEST = '建议复核为';

// 五档结果（对应规则文档的结果表）。
export const VERDICT_TEXT = {
  within: '仍在原状态范围',
  baseline: '清空覆盖，读基线值',
  'out-of-range': '已超出原状态范围',
  multiple: '同时符合多个状态',
  gap: '未落入已定义状态',
  pending: '状态对应待核'
};

// 绑定必须逐项核对：用途、地区、年份、指标、单位、分母、基准年。
const BINDING_FIELDS = [
  ['purpose', '用途'], ['region', '地区'], ['year', '年份'], ['indicator', '指标'],
  ['unit', '单位'], ['denominator', '分母'], ['baseYear', '基准年']
];

export function bindingGaps(binding, {missing = OVERRIDE_PENDING_BINDING} = {}) {
  if (!binding || typeof binding !== 'object') return [missing];
  if (binding.verified !== true) return [OVERRIDE_UNVERIFIED_BINDING];
  return BINDING_FIELDS
    .filter(([key]) => binding[key] === null || binding[key] === undefined || binding[key] === '')
    .map(([key, label]) => '绑定缺少' + label + '：状态对应待核。');
}

// 路径记录上携带的绑定字段：正式项目、备份、恢复数据里都可能出现（旧备份、他人项目或手工编辑）。
// P7-C1：这里只回答「字段在不在」，不把它的内容交给任何计算通路。
export function hasCarriedBinding(path) {
  const binding = path?.reviewBinding;
  return Boolean(binding && typeof binding === 'object');
}

// 正式渲染时，项目数据自己带了绑定字段就报「未经核验」，而不是笼统的「缺少绑定」。
export function bindingNoteFor(path) {
  return hasCarriedBinding(path) ? OVERRIDE_UNVERIFIED_BINDING : OVERRIDE_PENDING_BINDING;
}

// 显示用：与年度详情同一口径（6 位有效数字）。
export function displayValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? String(Number(n.toPrecision(6))) : null;
}

export function rangeEdges(range) {
  if (!range || typeof range !== 'object') return null;
  const {min = null, max = null, minInclusive = false, maxInclusive = false} = range;
  if (typeof min !== 'number' && typeof max !== 'number') return null;
  return {min, max, minInclusive: Boolean(minInclusive), maxInclusive: Boolean(maxInclusive)};
}

// 逐边比较；单侧无界不检查该侧。区间两侧都不是数字时返回 null（视为无依据）。
export function matchesRange(range, value) {
  const edges = rangeEdges(range);
  if (!edges || value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const v = Number(value);
  if (typeof edges.min === 'number' && (edges.minInclusive ? v < edges.min : v <= edges.min)) return false;
  if (typeof edges.max === 'number' && (edges.maxInclusive ? v > edges.max : v >= edges.max)) return false;
  return true;
}

export function boundaryReason(range, value) {
  const edges = rangeEdges(range);
  if (!edges || !Number.isFinite(Number(value))) return null;
  const v = Number(value);
  if (typeof edges.min === 'number' && (edges.minInclusive ? v < edges.min : v <= edges.min)) {
    return '越出下界 ' + displayValue(edges.min) + '（' + (edges.minInclusive ? '含' : '不含') + '下界）';
  }
  if (typeof edges.max === 'number' && (edges.maxInclusive ? v > edges.max : v >= edges.max)) {
    return '越出上界 ' + displayValue(edges.max) + '（' + (edges.maxInclusive ? '含' : '不含') + '上界）';
  }
  return null;
}

export function rangeText(range, unit) {
  const edges = rangeEdges(range);
  if (!edges) return '区间未定义';
  const suffix = unit ? ' ' + unit : '';
  const left = typeof edges.min === 'number' ? (edges.minInclusive ? '[' : '(') + displayValue(edges.min) : '(−∞';
  const right = typeof edges.max === 'number' ? displayValue(edges.max) + (edges.maxInclusive ? ']' : ')') : '+∞)';
  return left + ', ' + right + suffix;
}

// 一个状态为什么不能比较：单位不一致、没有有效区间。
function uncomparableReasons(state, unit) {
  const reasons = [];
  if (typeof unit === 'string' && unit && typeof state.unit === 'string' && state.unit && state.unit !== unit) {
    reasons.push('单位不一致（状态 ' + state.unit + '，指标 ' + unit + '）');
  }
  if (!rangeEdges(state.range)) reasons.push('状态「' + state.label + '」没有有效数值区间');
  return reasons;
}

function judgeState(state, value, unit) {
  const reasons = uncomparableReasons(state, unit);
  if (reasons.length) return {state, status: 'uncomparable', range: state.range ?? null, reasons};
  const hit = matchesRange(state.range, value);
  return {
    state, status: hit ? 'hit' : 'miss', range: state.range,
    text: rangeText(state.range, typeof state.unit === 'string' && state.unit ? state.unit : unit),
    reason: hit ? null : boundaryReason(state.range, value)
  };
}

// 判定入口。入参全部显式传入，方便夹具覆盖同档、越界、重叠、缺口、范围未知、
// 单位或分母不匹配、定性与多参数待核等情况。
// binding 是调用方**已判定为可核验**的绑定：本函数不自己确认来源。
// 正式数据（项目、备份、恢复）里携带的绑定一律由调用方折算为 null，避免用项目字段开启数值判定；
// binding.verified !== true 或任一字段缺失即进入待核，不做数值判断。
// year / region 是当前查看的年份与项目地区：绑定对不上同样进入待核，不跨年跨地区套用。
export function classifyOverride({
  baseline = null, override = null, states = [], referenceStateId = null,
  binding = null, qualitative = false, multiParameter = false, year = null, region = null,
  missingBindingNote = OVERRIDE_PENDING_BINDING
} = {}) {
  const cleared = override === null || override === undefined || String(override).trim() === '';
  const raw = cleared ? baseline : Number(override);
  const reference = states.find(state => state.id === referenceStateId) || null;
  const unit = typeof binding?.unit === 'string' ? binding.unit : null;

  const result = {
    verdict: 'pending', cleared, states,
    baseline, override: cleared ? null : raw, value: raw,
    reference: null, candidates: [], reasons: []
  };

  const pending = [...bindingGaps(binding, {missing: missingBindingNote})];
  if (binding && binding.verified === true) {
    if (year !== null && year !== undefined && Number(binding.year) !== Number(year)) {
      pending.push('绑定年份（' + binding.year + '）与查看年份（' + year + '）不一致：状态对应待核。');
    }
    if (region !== null && region !== undefined && binding.region !== region) {
      pending.push('绑定地区（' + binding.region + '）与项目范围（' + region + '）不一致：状态对应待核。');
    }
  }
  if (qualitative) pending.push('状态为定性：没有数值边界可比较，状态对应待核。');
  if (multiParameter) pending.push('多参数状态缺少带版本的组合规则：改任意一项都不能据此保留或更换状态。');
  if (states.length && !reference) pending.push(OVERRIDE_NO_STATE);
  for (const state of states) {
    for (const reason of uncomparableReasons(state, unit)) if (!pending.includes(reason)) pending.push(reason);
  }

  const judged = states.map(state => judgeState(state, raw, unit));
  const referenceJudge = judged.find(item => item.state?.id === referenceStateId) || null;
  const hits = judged.filter(item => item.status === 'hit');
  result.candidates = hits.map(item => ({id: item.state.id, label: item.state.label, text: item.text}));
  result.reference = reference ? {
    id: reference.id, label: reference.label,
    status: referenceJudge?.status ?? 'uncomparable',
    range: reference.range ?? null,
    text: referenceJudge?.text ?? rangeText(reference.range, unit)
  } : null;

  // 清空覆盖：恢复读基线，不判档。
  if (cleared) {
    result.override = null;
    if (baseline === null || baseline === undefined) {
      result.reasons = [OVERRIDE_NO_BASELINE];
      return result;
    }
    result.verdict = 'baseline';
    result.reasons = ['覆盖已清空：回到该年基线 ' + displayValue(baseline) + '。清空与显式填 0 是两条不同的读法。'];
    return result;
  }
  if (!Number.isFinite(raw)) {
    result.reasons = ['拟采用值不是有限数字：只接受数字，空白表示清空覆盖。'];
    return result;
  }

  // 待核优先级最高：口径没核对完就不给数值结论，也不给建议；已知原状态越界时保留该结论。
  if (pending.length) {
    result.verdict = 'pending';
    result.reasons = [...new Set(pending)];
    result.candidates = [];
    if (referenceJudge?.status === 'miss') result.knownOutOfRange = true;
    return result;
  }

  if (!reference || referenceJudge?.status === 'uncomparable') {
    result.verdict = 'pending';
    result.reasons = referenceJudge?.reasons ?? [OVERRIDE_NO_STATE];
    result.candidates = [];
    return result;
  }

  if (referenceJudge.status === 'hit' && hits.length === 1) {
    result.verdict = 'within';
    result.reasons = [
      '采用值 ' + displayValue(raw) + ' 仍在原状态「' + reference.label + '」的区间 ' + referenceJudge.text + ' 内。',
      '这里证明的是落在该状态定义内；原矩阵分数仍只解释该离散状态，不自动改分。'
    ];
    return result;
  }

  if (hits.length > 1) {
    result.verdict = 'multiple';
    result.reasons = [
      '同时命中 ' + hits.length + ' 个状态：' + hits.map(item => '「' + item.state.label + '」' + item.text).join('；') + '。',
      '请核对定义，不按排序取第一档。' + (referenceJudge.status === 'hit' ? '原状态「' + reference.label + '」检查通过，但整体对应仍有歧义。' : '')
    ];
    return result;
  }

  if (hits.length === 1) {
    result.verdict = 'out-of-range';
    result.reasons = [
      '原状态「' + reference.label + '」区间 ' + referenceJudge.text + '：' + (referenceJudge.reason ?? '采用值越界') + '。',
      '其他适用状态均可排查，恰好一档命中「' + hits[0].state.label + '」' + hits[0].text + '。',
      OVERRIDE_SUGGEST + '「' + hits[0].state.label + '」；仅供核对，需你确认。'
    ];
    return result;
  }

  result.verdict = 'gap';
  result.reasons = [
    '原状态「' + reference.label + '」区间 ' + referenceJudge.text + '：' + (referenceJudge.reason ?? '采用值越界') + '。',
    '已排查的状态均未命中：' + judged.filter(item => item.status === 'miss').map(item => '「' + item.state.label + '」' + item.text).join('；') + '。',
    '未落入已定义状态：可以保留参数草稿，并进入定义复核。'
  ];
  return result;
}

// 覆盖只在同一项目、地区、路径 ID 与版本、年份内生效。
export function overrideKey({projectId, regionId, pathId, pathVersion, year} = {}) {
  return [projectId ?? '', regionId ?? '', pathId ?? '', pathVersion ?? '', year ?? ''].join('\u0000');
}

// 内存容器：作用域只有项目与地区；路径 ID、版本与年份进 key，
// 因此切年或换路径版本都读不回旧值（旧条目永远不会被再次读到），多路径并存也不互相覆盖。
export function createOverridePreview(initial = {}) {
  let scope = {projectId: null, regionId: null, ...initial};
  const values = new Map(), references = new Map();
  const retarget = next => {
    const invalidated = ['projectId', 'regionId'].some(key => key in next && next[key] !== scope[key]);
    scope = {...scope, ...next};
    if (invalidated) { values.clear(); references.clear(); }
    return invalidated;
  };
  const at = (year, target = {}) => overrideKey({
    projectId: scope.projectId, regionId: scope.regionId,
    pathId: target.pathId ?? null, pathVersion: target.pathVersion ?? null, year
  });
  return {
    get scope() { return {...scope}; },
    retarget,
    get(year, target) {
      const key = at(year, target);
      return values.has(key) ? values.get(key) : null;
    },
    set(year, target, raw) {
      const key = at(year, target);
      if (raw === null || raw === undefined || String(raw).trim() === '') values.delete(key);
      else values.set(key, raw);
    },
    clear(year, target) { values.delete(at(year, target)); },
    // 对照状态的本次选择同样按路径与年份隔离，切换年份不串用。
    getReference(year, target) {
      const key = at(year, target);
      return references.has(key) ? references.get(key) : null;
    },
    setReference(year, target, stateId) {
      const key = at(year, target);
      if (stateId === null || stateId === undefined || stateId === '') references.delete(key);
      else references.set(key, stateId);
    },
    size() { return values.size; },
    referenceSize() { return references.size; }
  };
}
