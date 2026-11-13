// P5 一页中文情景报告：纯函数，只从冻结归档读数。
// 为什么只认归档：报告要能被复核，就必须钉住当时那一份输入（scope、修订、因素状态、矩阵覆盖、
// 成立数）。当前项目只用来判断归档是否过期，一个数字都不从它那里取；
// 否则「报告」会随编辑悄悄变形，谁也说不清当初算的是什么。
// 未定与 0 严格分开：RunResult 缺失、count 为 null、状态非 completed 时只写「未定」，
// 绝不落到 0；矩阵里未判断的单元同样不补 0，只报个数。
export const REPORT_FILENAME = '情景报告.md';

const STATUS_TEXT = {completed: '已完成', blocked: '阻断', failed: '未完成'};
const ROLE_TEXT = {input: '投入', outcome: '产出', context: '背景'};
const CLASS_TEXT = {block: '阻断', warning: '提示', info: '说明', 'unknown-state': '范围未知'};
const STALE_FIELD_TEXT = {scope: '项目范围', data: '科学数据', selection: '当前选择'};

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasText = value => typeof value === 'string' && value.trim() !== '';
const isCount = value => Number.isInteger(value) && value >= 0;

// 稳定投影：键顺序、视图状态和归档丢掉的 title/id 都不参与过期判定，
// 只比修订号与 scope/data/selection 这三块科学输入。
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value === undefined ? null : value;
}

function staleness(project, snapshot) {
  if (!isObject(project)) return {stale: null, reasons: []};
  const reasons = [];
  if (Number(project.revision) !== Number(snapshot.revision)) {
    reasons.push('修订号 ' + display(project.revision) + ' 与快照 ' + display(snapshot.revision) + ' 不一致');
  }
  for (const key of ['scope', 'data', 'selection']) {
    if (JSON.stringify(canonical(project[key] ?? null)) !== JSON.stringify(canonical(snapshot[key] ?? null))) {
      reasons.push(STALE_FIELD_TEXT[key] + '已变化');
    }
  }
  return {stale: reasons.length > 0, reasons};
}

function display(value) {
  if (value === null || value === undefined || value === '') return '未定';
  return String(value);
}

function stamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  return hasText(value) ? value : null;
}

// 区间按年度详情同一口径书写；未定义区间不乱猜上下界。
function rangeText(range) {
  if (!isObject(range)) return '—（没有数值区间）';
  const {min = null, max = null, minInclusive = false, maxInclusive = false} = range;
  if (typeof min !== 'number' && typeof max !== 'number') return '—（没有数值区间）';
  const left = typeof min === 'number' ? (minInclusive ? '[' : '(') + display(min) : '(−∞';
  const right = typeof max === 'number' ? display(max) + (maxInclusive ? ']' : ')') : '+∞)';
  return left + ', ' + right;
}

const descriptorLabel = (data, id) => {
  const found = (data.descriptors || []).find(item => item?.id === id);
  return hasText(found?.label) ? found.label : '未命名因素';
};
const stateLabel = (data, id) => {
  const found = (data.states || []).find(item => item?.id === id);
  return hasText(found?.label) ? found.label : '未命名状态';
};
const marking = (label, id) => (hasText(id) ? label + '（' + id + '）' : label);

export function buildReport({project = null, archive = null, generatedAt = null} = {}) {
  if (!isObject(archive)) throw new Error('缺少冻结归档：情景报告只能从归档构造。');
  const snapshot = archive.projectInputSnapshot;
  if (!isObject(snapshot)) throw new Error('归档缺少 projectInputSnapshot：无法确定报告范围。');
  if (!isObject(snapshot.data) || !Array.isArray(snapshot.data.descriptors) || !Array.isArray(snapshot.data.states)) {
    throw new Error('归档快照缺少 factors/states 科学数据：报告缺项无法定位。');
  }

  const data = snapshot.data;
  const scope = isObject(snapshot.scope) ? snapshot.scope : {};
  const years = Array.isArray(scope.years) ? scope.years : [];
  const {stale, reasons} = staleness(project, snapshot);
  const gaps = [];
  const sections = [];
  const at = stamp(generatedAt);

  const projectTitle = hasText(snapshot.title) ? snapshot.title : (hasText(snapshot.projectId) ? snapshot.projectId : '未命名项目');
  const title = projectTitle + ' 情景报告';

  // 1. 研究范围：地区、年份、冻结修订。
  const scopeLines = [
    '研究地区：' + (hasText(scope.regionId) ? scope.regionId : '未指定地区（归档未声明）'),
    '研究年份：' + (isObject(archive?.RunInput) && Number.isSafeInteger(archive.RunInput.year) ? archive.RunInput.year + '（本次检算年份）；项目范围年份 ' + (years.length ? years.join('、') : '未声明') : (years.length ? years.join('、') : '未声明年份')),
    '冻结修订：第 ' + display(snapshot.revision) + ' 版',
    '快照标题：' + (hasText(snapshot.title) ? snapshot.title : '归档未声明标题，标题按项目标识显示')
  ];
  if (!hasText(scope.regionId)) gaps.push('归档快照未声明研究地区：地区未知，不能当通用范围。');
  if (!years.length) gaps.push('归档快照未声明研究年份：年份未知。');
  if (!Number.isSafeInteger(snapshot.revision)) gaps.push('归档快照修订号缺失：无法与当前项目核对是否过期。');
  sections.push({
    id: 'scope', heading: '研究范围', lines: scopeLines,
    source: '冻结的项目范围记录（地区、项目年份、修订号、标题）'
  });

  // 2. 因素与状态定义清单（用标签，括号里保留稳定标识以便回查）。
  const rows = [];
  for (const descriptor of data.descriptors) {
    const states = data.states.filter(state => state?.descriptorId === descriptor?.id);
    const role = ROLE_TEXT[descriptor?.role] || '未声明角色';
    if (!states.length) rows.push([marking(descriptorLabel(data, descriptor?.id), descriptor?.id), '（无状态定义）', role, '—', '—']);
    for (const state of states) {
      rows.push([
        marking(descriptorLabel(data, descriptor?.id), descriptor?.id),
        marking(hasText(state?.label) ? state.label : '未命名状态', state?.id),
        role,
        rangeText(state?.range),
        hasText(state?.unit) ? state.unit : '—'
      ]);
    }
  }
  if (!rows.length) gaps.push('归档快照没有因素定义：定义清单为空。');
  sections.push({
    id: 'definitions', heading: '因素与状态定义', lines: ['定义来自冻结快照，不随当前项目编辑变化。'],
    table: {head: ['因素', '状态', '角色', '数值区间', '单位'], rows},
    source: '冻结的因素与状态定义'
  });

  // 3. 判断矩阵覆盖：未判断单元只报数，不补 0。
  const input = archive.RunInput;
  const coverage = isObject(input) && isObject(input.matrix) ? input.matrix.coverage : null;
  const coverageLines = [];
  if(Array.isArray(input?.conditionedStateIds)&&input.conditionedStateIds.length){
    coverageLines.push('给定条件（只提供影响，自身免于判定）：'+input.conditionedStateIds.map(id=>{const state=data.states.find(s=>s.id===id);return (data.descriptors.find(d=>d.id===state?.descriptorId)?.label||state?.descriptorId)+'='+(state?.label||id);}).join('、')+'。',
      '覆盖数只针对本次条件计算实际需要的评分，不表示全矩阵已填齐。');
  }
  if (!isObject(coverage)) {
    coverageLines.push('矩阵覆盖：未定（归档没有可读的 RunInput 矩阵）。', '未判断单元：未定；未定不等于没有未判断单元。');
    gaps.push('归档没有矩阵覆盖记录：未判断单元数量未定。');
  } else {
    const missing = Array.isArray(coverage.missingPairs) ? coverage.missingPairs.length : 0;
    coverageLines.push(
      '应有判断单元（有序状态对）：' + display(coverage.required),
      '已判断单元：' + display(coverage.judged),
      '未判断单元：' + missing + (missing > 0 ? '（未判断不补 0，也不进入检算）' : '（没有未判断单元）')
    );
    if (missing > 0) gaps.push('矩阵有 ' + missing + ' 个未判断单元：报告保留未判断，未以 0 填补。');
  }
  sections.push({
    id: 'coverage', heading: '判断矩阵覆盖', lines: coverageLines,
    source: '本次检算使用的判断矩阵（应判、已判、未判）'
  });

  // 4. 检算结果：count 只在 completed 且为整数时才是数字，其他一律未定。
  const result = archive.RunResult;
  const resultLines = [];
  if (!isObject(result)) {
    resultLines.push(
      '检算状态：未开始（前置阻断或尚未求解）。',
      '成立数：未定；未定不等于 0，本报告不给数字。'
    );
    gaps.push('归档没有 RunResult：成立数未定，不能读作 0。');
  } else {
    const status = hasText(result.status) ? result.status : '未知状态';
    const checked = isCount(result.checked) ? result.checked : null;
    resultLines.push('检算状态：' + (STATUS_TEXT[status] || '未知状态（' + status + '）'));
    if (status === 'completed' && isCount(result.count)) {
      resultLines.push(
        '成立数：' + result.count + '（已检查 ' + display(checked) + ' 个配置' + (result.truncated ? '；列表截断，计数完整' : '') + '）'
      );
    } else {
      const reason = status === 'blocked' ? '前置阻断，未开始枚举' : status === 'failed' ? '检算未完成' : isCount(result.count) === false && status === 'completed' ? '已完成但成立数记录为空' : '状态不是已完成';
      resultLines.push('成立数：未定（' + reason + '）；未定不等于 0，本报告不给数字。');
      gaps.push('RunResult 状态为「' + (STATUS_TEXT[status] || status) + '」且成立数未定：不能读作 0 解。');
    }
    if (result.truncated && status !== 'completed') resultLines.push('列表已截断：只展示局部情景，全空间未完成。');
    for (const diagnostic of (Array.isArray(result.diagnostics) ? result.diagnostics : [])) {
      resultLines.push('诊断：' + (hasText(diagnostic?.code) ? diagnostic.code : '未命名诊断') + '：' + (hasText(diagnostic?.message) ? diagnostic.message : '无说明'));
    }
  }
  sections.push({
    id: 'result', heading: '检算结果', lines: resultLines,
    source: '本次检算结果（状态、成立数、已检查数、是否截断、诊断）'
  });

  // 5. 成立情景：按冻结快照把稳定标识翻成中文标签。
  const scenarios = isObject(result) && Array.isArray(result.scenarios) ? result.scenarios : [];
  const activeIds = isObject(input) && Array.isArray(input.activeDescriptorIds) && input.activeDescriptorIds.length
    ? input.activeDescriptorIds
    : [...new Set(data.descriptors.map(descriptor => descriptor?.id).filter(hasText))];
  const scenarioLines = [];
  for (const [index, configuration] of scenarios.slice(0, 5).entries()) {
    const cells = activeIds.map(id => descriptorLabel(data, id) + '＝' + stateLabel(data, configuration?.[id]));
    scenarioLines.push('情景 ' + (index + 1) + '：' + (cells.length ? cells.join('、') : '未记录活动因素'));
  }
  if (!scenarios.length) {
    scenarioLines.push('归档未附带情景列表：只有成立数时，不补造情景。');
  } else if (scenarios.length > 5) {
    scenarioLines.push('本页只列前 5 条，共 ' + scenarios.length + ' 条已记录情景。');
  }
  sections.push({
    id: 'scenarios', heading: '成立情景（前若干条）', lines: scenarioLines,
    source: '本次检算列出的自洽配置与活动因素'
  });

  // 6. 前置诊断与假设确认：结论成立的前提必须写在报告里。
  const boundaryLines = [];
  const acknowledgements = isObject(archive.assumptionAcknowledgements) ? archive.assumptionAcknowledgements : null;
  if (!acknowledgements) {
    boundaryLines.push('原假设确认：未定（归档缺少 assumptionAcknowledgements）。');
    gaps.push('归档缺少假设确认记录：结论的前提未定。');
  } else {
    const current = acknowledgements.currentAssumptions === true;
    const unknown = acknowledgements.unknownStateScope === true;
    boundaryLines.push('按当前草案、依据不足及量表假设检算：' + (current ? '已确认' : '未确认'));
    boundaryLines.push('未声明的状态年份或地区作为当前截面假设：' + (unknown ? '已确认' : '未确认'));
    if (!current) gaps.push('「按当前草案、依据不足及量表假设检算」未确认：结论的前提不完整。');
    if (!unknown) gaps.push('「未声明的状态年份或地区作为当前截面假设」未确认：范围边界未定。');
  }
  const preflight = Array.isArray(archive.preflightDiagnostics) ? archive.preflightDiagnostics : [];
  if (!preflight.length) {
    boundaryLines.push('前置诊断：无记录（不代表没有未声明的范围）。');
  } else {
    const counts = {};
    for (const diagnostic of preflight) {
      const key = hasText(diagnostic?.classification) ? diagnostic.classification : '未分类';
      counts[key] = (counts[key] || 0) + 1;
    }
    boundaryLines.push('前置诊断：' + Object.entries(counts).map(([key, count]) => (CLASS_TEXT[key] || key) + ' ' + count + ' 项').join('、') + '。');
    for (const diagnostic of preflight) {
      boundaryLines.push('· ' + (hasText(diagnostic?.message) ? diagnostic.message : '无说明') + '（' + (hasText(diagnostic?.code) ? diagnostic.code : '未命名诊断') + '）');
    }
  }
  boundaryLines.push('报告生成时间：' + (at ?? '未记录（归档没有时间戳）'));
  sections.push({
    id: 'boundary', heading: '前置假设与边界确认', lines: boundaryLines,
    source: '本次检算确认过的假设与前置诊断'
  });

  // 7. 过期与缺项：第 6 条要求——过期必须说清楚，且不偷偷改读当前值。
  const gapLines = [];
  if (stale === true) gapLines.push('归档已过期：当前项目与冻结快照不一致（' + reasons.join('；') + '）。本报告只描述冻结快照，不代表当前项目。');
  else if (stale === null) gapLines.push('未提供当前项目：无法核对归档是否过期，本报告只描述冻结快照。');
  else gapLines.push('归档未过期：当前项目与冻结快照的科学输入一致。');
  gapLines.push('本报告不重新检算，也不读取当前项目的任何数值。');
  gapLines.push('0 与未判断全程区分：0 表示没关系，未判断一律写作「未判断」。');
  gapLines.push(...(gaps.length ? gaps : ['未发现缺项。']));
  sections.push({
    id: 'gaps', heading: '缺项与边界', lines: gapLines,
    source: '冻结结果与当前项目的修订号、范围、数据、选择（只判过期，不取数）'
  });

  const report = {
    title, stale, staleNote: gapLines[0], generatedAt: at,
    sections, gaps: [...gaps], markdown: ''
  };
  report.markdown = reportToMarkdown(report);
  return report;
}

export function reportToMarkdown(report) {
  if (!isObject(report)) throw new Error('缺少报告对象：无法输出 Markdown。');
  const lines = ['# ' + (hasText(report.title) ? report.title : '情景报告'), ''];
  const sections = Array.isArray(report.sections) ? report.sections : [];
  for (const section of sections) {
    lines.push('## ' + (hasText(section?.heading) ? section.heading : '未命名小节'), '');
    if (hasText(section?.source)) lines.push('来源：' + section.source, '');
    for (const line of (Array.isArray(section?.lines) ? section.lines : [])) lines.push('- ' + line);
    if (Array.isArray(section?.lines) && section.lines.length) lines.push('');
    const table = section?.table;
    if (Array.isArray(table?.head) && Array.isArray(table?.rows)) {
      lines.push('| ' + table.head.map(cell => cellText(cell)).join(' | ') + ' |');
      lines.push('| ' + table.head.map(() => '---').join(' | ') + ' |');
      for (const row of table.rows) lines.push('| ' + (Array.isArray(row) ? row : []).map(cell => cellText(cell)).join(' | ') + ' |');
      lines.push('');
    }
  }
  if (Array.isArray(report.gaps) && report.gaps.length && !sections.some(section => section?.id === 'gaps')) {
    lines.push('## 缺项与边界', '');
    for (const gap of report.gaps) lines.push('- ' + gap);
    lines.push('');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// 表格单元格：竖线与换行会破坏 Markdown 表格，转义而不是删字。
const cellText = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
