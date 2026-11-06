import { el } from '../../core/ui.mjs';
import { interpolate } from './logic.mjs';
import { createOverridePreview } from './annual-override.mjs';
import { overridePreview } from './annual-override-panel.mjs';

// P7-A 只读年度详情：复用既有 interpolate，不新增数值语义。
// 这里只读已保存的路径；查看年份是纯展示状态，不进入项目、不改范围/锚点/修订号。
export const YEAR_DETAIL_NOTE = '按年查看只读取已保存的路径：切换查看年份不改研究范围、路径锚点或项目修订号。逐年参数覆盖与状态映射不在本包。';
export const YEAR_DETAIL_MULTI_NOTE = '多条路径分别显示；单位不同不合并、不相加。';
export const YEAR_DETAIL_NO_PATH_NOTE = '该因素没有时间路径，也没有状态：本区只报缺口，不生成数值。团队交流稿里带年份与原单位的条款摘要留在政策摘要中，不在这里换算成年度值。';
export const YEAR_DETAIL_NO_YEARS_NOTE = '当前没有可选的年份：研究年份为空，路径也没有原始节点。';
export const YEAR_DETAIL_DRAFT_NOTE = '有未保存的路径草稿：本区只读已保存的路径，不含草稿里的修改。';

export const EVIDENCE_KIND_TEXT = {
  policy: '政策原文',
  paper: '论文',
  'historical-data': '历史数据',
  expert: '专家判断',
  'user-assumption': '用户假设或草案',
  fixture: '机制样例'
};

const ORIGIN_TEXT = {source: '原始来源', 'user-assumption': '用户假设', interpolated: '派生插值'};
const KIND_LABELS = {
  anchor: '原始锚点',
  interpolated: '推算值',
  'anchor-missing': '原始锚点，数值缺失',
  'missing-breakpoint': '缺口：相邻锚点数值缺失',
  'out-of-range': '缺口：该年不在路径节点范围内',
  'no-interpolation': '缺口：该路径不插值',
  'no-points': '缺口：该路径没有节点'
};
const METHOD_TEXT = {linear: 'linear · 线性内插', step: 'step · 取左端值保持'};

export function yearOptions(project, descriptorId) {
  const years = new Set((project?.scope?.years || []).filter(Number.isInteger));
  for (const path of project?.data?.paths || []) {
    if (path.descriptorId !== descriptorId) continue;
    for (const point of path.points || []) if (Number.isInteger(point.year)) years.add(point.year);
  }
  return [...years].sort((a, b) => a - b);
}

export function defaultYear(project, descriptorId) {
  const study = (project?.scope?.years || []).filter(Number.isInteger).sort((a, b) => a - b);
  if (study.length) return study[0];
  return yearOptions(project, descriptorId)[0] ?? null;
}

export function parseYear(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return {ok: false, reason: 'empty'};
  if (!/^-?\d+$/.test(text)) return {ok: false, reason: 'not-integer'};
  const year = Number(text);
  if (!Number.isInteger(year) || year < 1900 || year > 2300) return {ok: false, reason: 'range'};
  return {ok: true, year};
}

function yearMessage(reason) {
  if (reason === 'empty') return '请填写查看年份（1900—2300 的整数）；未填写时不显示年度值。';
  if (reason === 'not-integer') return '查看年份须为1900—2300的整数。';
  return '查看年份须在1900—2300之间。';
}

export function formatNumber(value) {
  return String(Number(value.toPrecision(6)));
}

// 与 interpolate 的判定保持一致：先看它给出的结果，再看它为什么没有结果。
export function describeYear(path, year) {
  const points = Array.isArray(path?.points) ? path.points : [];
  const result = interpolate(path, year);
  if (result) {
    if (!result.derived) {
      if (result.value === null) return {kind: 'anchor-missing', value: null, point: points.find(point => point.year === year) || null, evidenceRefs: result.evidenceRefs || []};
      return {kind: 'anchor', value: result.value, point: points.find(point => point.year === year) || null, evidenceRefs: result.evidenceRefs || []};
    }
    const right = points.findIndex(point => point.year > year);
    return {kind: 'interpolated', value: result.value, from: points[right - 1], to: points[right], method: path.interpolation, evidenceRefs: result.evidenceRefs || []};
  }
  if (!points.length) return {kind: 'no-points', value: null, evidenceRefs: []};
  const first = points[0].year, last = points[points.length - 1].year;
  if (year < first || year > last) return {kind: 'out-of-range', value: null, first, last, evidenceRefs: []};
  if (path.interpolation === 'none') return {kind: 'no-interpolation', value: null, evidenceRefs: []};
  const right = points.findIndex(point => point.year > year);
  const from = points[right - 1], to = points[right];
  return {kind: 'missing-breakpoint', value: null, from, to, evidenceRefs: []};
}

// 记录的对应（锚点上写着的状态）与当前适用性分开说。
// 与既有检算口径一致：年份未声明、年份格式待核、地区未知都只算「适用范围待核」，
// 不当作不适用；只有年份或地区有明确依据且与项目范围对不上，才算明确不适用。
export function stateReading(project, descriptorId, point, year) {
  if (!point || point.stateId === null || point.stateId === undefined) return {kind: 'none', text: '记录状态：该锚点未关联任何状态。'};
  const state = project.data.states.find(item => item.id === point.stateId);
  if (!state) return {kind: 'missing-definition', text: '记录状态：' + point.stateId + '（当前项目里已找不到这条状态定义，不能当作现有对应）。'};
  if (state.descriptorId !== descriptorId) return {kind: 'other-variable', text: '记录状态：' + state.label + '（该状态属于其他变量，不能用于当前因素）。'};
  const pending = [], mismatch = [];
  const declared = state.validYears;
  if (!Array.isArray(declared) || !declared.length) pending.push('状态未声明适用年份，不代表永久有效');
  else if (new Set(declared).size !== declared.length || declared.some(y => !Number.isInteger(y) || y < 1900 || y > 2300)) pending.push('状态适用年份格式待核');
  else if (!declared.includes(year)) mismatch.push('状态在所选年不适用：状态定义的适用年份不含 ' + year);
  const stateRegion = state.scope?.regionId ?? null, projectRegion = project.scope?.regionId ?? null;
  if (!stateRegion) pending.push('状态地区范围未知');
  else if (!projectRegion) pending.push('项目范围未指定地区，无法与状态地区（' + stateRegion + '）比对');
  else if (stateRegion !== projectRegion) mismatch.push('状态地区与项目不符：状态定义的地区（' + stateRegion + '）与项目范围（' + projectRegion + '）不一致');
  if (mismatch.length) return {kind: 'not-applicable', text: '记录状态：' + state.label + '；当前不适用：' + mismatch.join('；') + '。'};
  if (pending.length) return {kind: 'unknown-scope', text: '记录状态：' + state.label + '；适用范围待核：' + pending.join('；') + '。'};
  return {kind: 'applicable', text: '记录状态：' + state.label + '；范围匹配：状态定义属于当前因素，适用年份含 ' + year + '，地区与项目范围一致。'};
}

function sourceLines(project, evidenceRefs, expert) {
  const ids = Array.isArray(evidenceRefs) ? evidenceRefs : [];
  if (!ids.length) return [el('p', {class: 'year-detail-source'}, '来源：未关联依据记录。')];
  return ids.map(id => {
    const record = project.data.evidence.find(item => item.id === id);
    if (!record) return el('p', {class: 'year-detail-source'}, '缺少依据记录 ' + id);
    return el('p', {class: 'year-detail-source'},
      '来源：' + (EVIDENCE_KIND_TEXT[record.kind] || record.kind) + ' · ' + record.sourceId + '｜' + record.locator + (expert ? '（依据ID：' + record.id + '）' : ''));
  });
}

function anchorText(point) {
  if (!point) return '未找到';
  return point.year + ' = ' + (point.value === null ? '缺失' : formatNumber(point.value));
}

export function yearDetail({project = null, descriptorId = null, year = null, expert = false, bindingFor = null} = {}) {
  let current = project, currentDescriptor = descriptorId, currentExpert = expert;
  let shownYear = Number.isInteger(year) ? year : null, yearError = null, isDirty = false;
  // 覆盖预览只活在内存里：按项目与地区分组，键还含路径 ID、版本与年份。
  const overrides = createOverridePreview({projectId: project?.id ?? null, regionId: project?.scope?.regionId ?? null});

  const root = el('section', {class: 'year-detail', 'data-year-detail': '', 'aria-label': '按年查看时间路径（只读）'});
  const message = el('p', {class: 'year-detail-message muted', role: 'status', 'aria-live': 'polite'});
  const draftLine = el('p', {class: 'year-detail-draft warning-text'}, YEAR_DETAIL_DRAFT_NOTE);
  draftLine.hidden = true;
  const previewNote = el('p', {class: 'year-detail-preview-note muted', role: 'status', 'aria-live': 'polite'});
  const input = el('input', {type: 'number', id: 'year-detail-year', min: '1900', max: '2300', step: '1', 'aria-label': '查看年份', placeholder: '例如 2032'});
  const quick = el('div', {class: 'year-detail-quick', role: 'group', 'aria-label': '从研究年份与原始节点选择年份'});
  const body = el('div', {class: 'year-detail-body', 'data-year-detail-body': ''});
  input.addEventListener('input', () => refresh());
  root.append(el('h3', {}, '按年查看（只读）'),     el('div', {class: 'year-detail-controls'}, el('label', {}, '查看年份', input), quick), message, draftLine, previewNote, body);

  function paintQuick(options) {
    // 键盘用户按 Enter 选中后按钮会被重建；保留焦点，否则焦点会掉到页面上。
    const hadFocus = quick.contains(document.activeElement);
    const wanted = document.activeElement?.getAttribute?.('data-year-quick') ?? null;
    quick.replaceChildren(...options.map(value => el('button', {
      class: 'button year-detail-quick-year', type: 'button', 'data-year-quick': String(value), 'aria-pressed': String(value === shownYear), onclick: () => select(value)
    }, String(value))));
    if (hadFocus) {
      const target = quick.querySelector('[data-year-quick="' + (wanted ?? shownYear) + '"]') || quick.querySelector('[aria-pressed="true"]');
      target?.focus();
    }
  }

  function gap(kind, text) {
    return el('p', {class: 'year-detail-gap', 'data-year-gap': kind}, text);
  }

  function pathArticle(path, reading) {
    const unit = path.unit ? path.unit : '未指定';
    // 展示与 data 属性用同一个数字写法（沿用图表预览的 6 位有效数字），避免两处读数不一致。
    const shown = reading.value === null || reading.value === undefined ? '' : formatNumber(reading.value);
    const article = el('article', {
      class: 'year-detail-path', 'data-year-path': path.id, 'data-year-kind': reading.kind,
      'data-year-value': shown === '' ? 'none' : shown, 'data-year-unit': unit, 'data-year-state': 'none'
    });
    article.append(el('h4', {}, '路径 ' + path.id + ' · v' + path.version), el('p', {class: 'year-detail-unit'}, '单位：' + unit));
    article.append(el('p', {class: 'year-detail-value'}, KIND_LABELS[reading.kind] + '：' + (shown === '' ? '无值' : shown)));

    if (reading.kind === 'interpolated') {
      article.append(el('p', {class: 'year-detail-method'}, '推算方法：' + (METHOD_TEXT[reading.method] || reading.method) + '；所用锚点：' + anchorText(reading.from) + ' → ' + anchorText(reading.to) + '。推算值不继承端点状态。'));
      article.setAttribute('data-year-state', 'interpolated');
    }
    if (reading.kind === 'anchor' || reading.kind === 'anchor-missing') {
      const point = reading.point;
      article.append(el('p', {class: 'year-detail-origin'}, '记录类型：' + (ORIGIN_TEXT[point?.origin] || point?.origin || '未知') + (reading.kind === 'anchor-missing' ? '；该点数值为空，空值不等于 0。' : '')));
      const state = stateReading(current, currentDescriptor, point, shownYear);
      article.append(el('p', {class: 'year-detail-state'}, state.text));
      article.setAttribute('data-year-state', state.kind);
    }
    if (reading.kind === 'missing-breakpoint') article.append(el('p', {class: 'year-detail-anchors'}, '相邻锚点：' + anchorText(reading.from) + ' → ' + anchorText(reading.to) + '；按原规则不跨缺失点插值。'));
    if (reading.kind === 'out-of-range') article.append(el('p', {class: 'year-detail-anchors'}, '路径节点范围：' + reading.first + '—' + reading.last + '；按原规则不外推。'));
    if (reading.kind === 'no-interpolation') article.append(el('p', {class: 'year-detail-anchors'}, '该路径插值方式为 none（仅锚点），此年没有推算值。'));
    article.append(...sourceLines(current, reading.evidenceRefs, currentExpert));
    if ((path.scope?.regionId ?? null) !== (current.scope?.regionId ?? null)) {
      article.append(el('p', {class: 'warning-text'}, '路径地区「' + (path.scope?.regionId ?? '未知') + '」与项目范围「' + (current.scope?.regionId ?? '未知') + '」不同；按原规则不自动换算，也不推断政策适用性。'));
    }
    // P7-B：只读覆盖预览。它的输入留在本区（不属于 .timeline-editor），因此不会触发路径保存的未完成输入守卫。
    // P7-C1：bindingFor 默认 null，正式接线不传，因此正式页面永远只报「未经核验」。
    article.append(overridePreview({
      project: current, path, year: shownYear, reading,
      states: current.data.states.filter(state => state.descriptorId === currentDescriptor),
      store: overrides, binding: typeof bindingFor === 'function' ? bindingFor(path) : null,
      onChange: () => { previewNote.textContent = '预览已更新：只存在本页内存里，未写入项目或历史库。'; }
    }).root);
    return article;
  }

  function paintBody() {
    const rows = [];
    if (yearError) rows.push(gap('invalid-year', yearMessage(yearError)));
    else if (shownYear === null) {
      const options = yearOptions(current, currentDescriptor);
      rows.push(gap('no-year', options.length ? '尚未选择查看年份。' : YEAR_DETAIL_NO_YEARS_NOTE));
    } else if (!currentDescriptor) rows.push(gap('no-descriptor', '尚未选择计算变量。'));
    else {
      const paths = current.data.paths.filter(path => path.descriptorId === currentDescriptor);
      if (!paths.length) {
        const label = current.data.descriptors.find(item => item.id === currentDescriptor)?.label || currentDescriptor;
        rows.push(gap('no-path', '「' + label + '」' + YEAR_DETAIL_NO_PATH_NOTE));
      } else {
        if (paths.length > 1) rows.push();
        for (const path of paths) rows.push(pathArticle(path, describeYear(path, shownYear)));
      }
    }
    body.replaceChildren(...rows.filter(row => row !== null && row !== undefined));
  }

  function refresh() {
    const parsed = parseYear(input.value);
    if (parsed.ok) { shownYear = parsed.year; yearError = null; message.textContent = ''; }
    else { yearError = parsed.reason; message.textContent = yearMessage(parsed.reason); }
    paintQuick(yearOptions(current, currentDescriptor));
    paintBody();
    return parsed;
  }

  function select(value) {
    input.value = String(value);
    refresh();
  }

  function update(nextProject, nextDescriptor, nextExpert = false) {
    const identityChanged = (nextProject?.id ?? null) !== (current?.id ?? null)
      || (nextProject?.scope?.regionId ?? null) !== (current?.scope?.regionId ?? null);
    current = nextProject;
    if (typeof nextDescriptor === 'string' || nextDescriptor === null) currentDescriptor = nextDescriptor;
    currentExpert = nextExpert;
    if (identityChanged) {
      // 项目或地区变了：上一份预览不再属于这个项目，整组作废并说明。
      overrides.retarget({projectId: current?.id ?? null, regionId: current?.scope?.regionId ?? null});
      previewNote.textContent = '项目或地区已变更：上一份覆盖预览已作废，请重新确认。';
    }
    if (!Number.isInteger(shownYear) || input.value === '') {
      const fallback = defaultYear(current, currentDescriptor);
      input.value = fallback === null ? '' : String(fallback);
    }
    refresh();
  }

  function setDirty(flag) {
    isDirty = Boolean(flag);
    draftLine.hidden = !isDirty;
  }

  if (input.value === '') {
    const fallback = defaultYear(current, currentDescriptor);
    input.value = fallback === null ? '' : String(fallback);
    shownYear = fallback;
    refresh();
  }

  return {root, update, setDirty, select, get year() { return shownYear; }, get dirty() { return isDirty; }};
}
