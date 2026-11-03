import { createProjectStore } from '../src/core/project-store.mjs';
import { createActions } from '../src/core/actions.mjs';
import { createJJJDraftProject } from '../src/fixtures/jjj-draft.mjs';
import { mount } from '../src/modules/elements/index.mjs';
import { el } from '../src/core/ui.mjs';
import { variableColor } from '../src/core/object-colors.mjs';

const KEY = 'scenario-workbench.neutral-sample.v1';
const initial = createJJJDraftProject();
initial.id = 'neutral-visual-sample';
initial.title = '描述符与时间路径 · 独立视觉样板';
initial.scope.years = [2026, 2030, 2035];
initial.view.module = 'elements';
initial.selection.nodeIds = ['jjj-node-d20'];
initial.selection.descriptorIds = ['jjj-d20'];
initial.data.paths = [{ id: 'visual-path', descriptorId: 'jjj-d20', scope: { regionId: '京津冀' }, unit: '演示指数', version: 1, provenance: { origin: 'fixture', sourceId: 'neutral-visual-sample' }, evidenceRefs: [], interpolation: 'linear', points: [2026, 2030, 2035].map((year, i) => ({ year, value: [20, 45, 70][i], stateId: null, origin: 'user-assumption', evidenceRefs: [] })) }];
let store;
try { store = createProjectStore(initial.id, JSON.parse(localStorage.getItem(KEY)) || initial); }
catch { store = createProjectStore(initial.id, initial); }
const actions = createActions(store);
let persistenceOk = true, dirty = false, disposeElements = null, selectedVariable = 'jjj-d20';
const root = document.querySelector('#sample-root');
const view = el('select', { id: 'sample-perspective' }, el('option', { value: 'public' }, '普通用户 · 简洁界面'), el('option', { value: 'expert' }, '专家用户 · 详细界面'));
view.value = store.read().view.perspective;
const topbar = el('header', { class: 'topbar' }, el('div', {}, el('span', { class: 'brand' }, '情景研判平台'), el('span', { class: 'version' }, '浅色视觉样板')), el('div', { class: 'view-dropdown' }, el('label', { for: 'sample-perspective' }, '界面视角'), view));
const sidebar = el('aside', { class: 'sidebar' }, el('nav', { 'aria-label': '样板页面导航' }, el('p', { class: 'nav-group-title' }, '情景构建'), el('a', { class: 'nav-item', href: '#descriptor-panel' }, '描述符选择'), el('a', { class: 'nav-item', href: '#path-panel', 'aria-current': 'page' }, '时间路径'), el('a', { class: 'nav-item', href: '#sample-matrix' }, '矩阵状态样式')), el('p', { class: 'sidebar-note' }, '样板中的路径与分数用于展示视觉状态，不构成政策判断。'));
const main = el('main', { class: 'sample-main', id: 'main' });
const flow = el('ol', { class: 'sample-flow', 'aria-label': '研究流程' }, el('li', {}, '选择描述符'), el('li', { 'aria-current': 'step' }, '设置时间路径'), el('li', {}, '补充关系依据'), el('li', {}, 'CIB检验'));
const descriptors = el('section', { id: 'descriptor-panel', class: 'surface' });
const pathPanel = el('section', { id: 'path-panel', class: 'surface', 'aria-label': '时间路径编辑' });
const pageStatus = el('p', { role: 'status', 'aria-live': 'polite', class: 'message', id: 'sample-page-status' });
main.append(el('div', { class: 'sample-heading' }, el('div', {}, el('h1', {}, '描述符选择与时间路径'), el('p', { class: 'subtitle' }, '白色工作区、灰阶操作控件；颜色只跟随变量和数据含义。')), el('span', { class: 'badge' }, '未检算 · 尚无CIB结果')), flow, el('div', { class: 'sample-grid' }, descriptors, pathPanel), pageStatus);
root.append(topbar, el('div', { class: 'sample-layout' }, sidebar, main));

function leaveDraft() { return !dirty || confirm('路径节点尚未保存。放弃本次输入吗？'); }
function mountElements() {
  if (disposeElements) disposeElements();
  descriptors.replaceChildren();
  disposeElements = mount(descriptors, { store, actions: { ...actions, selectElements(value) {
    if (!leaveDraft()) return { ok: false, error: { message: '路径有未保存输入', recoveryAction: '先保存或取消路径修改' } };
    dirty = false;
    return actions.selectElements(value);
  } }, persistenceState: () => ({ ok: persistenceOk }), navigate() { pageStatus.textContent = '此页为独立视觉样板；完整研究项目请在正式工作台继续。'; } });
}
view.addEventListener('change', () => {
  if (!leaveDraft()) { view.value = store.read().view.perspective; return; }
  dirty = false;
  store.setView({ perspective: view.value });
  mountElements();
});
function svgNode(tag, attrs, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function graph(path, color) {
  const svg = svgNode('svg', { class: 'sample-graph', viewBox: '0 0 640 250', role: 'img', 'aria-label': '日历年份上的演示指数路径；不是预测结果', style: '--variable-color:' + color });
  const points = path.points.filter(point => point.value !== null);
  const years = path.points.map(point => point.year);
  const yMin = Math.min(0, ...points.map(point => point.value));
  const yMax = Math.max(1, ...points.map(point => point.value)) * 1.15;
  const first = Math.min(...years), last = Math.max(...years);
  const x = year => 48 + (year - first) / Math.max(1, last - first) * 540;
  const y = value => 205 - (value - yMin) / (yMax - yMin) * 170;
  for (const value of [yMin, (yMax + yMin) / 2, yMax]) {
    svg.append(svgNode('line', { class: 'axis', x1: 48, y1: y(value), x2: 602, y2: y(value) }), svgNode('text', { x: 7, y: y(value) + 4 }, Math.round(value)));
  }
  if (path.interpolation === 'linear') {
    let segment = [];
    const flush = () => { if (segment.length) svg.append(svgNode('polyline', { class: 'curve', points: segment.join(' ') })); segment = []; };
    for (const point of path.points) { if (point.value === null) flush(); else segment.push(x(point.year) + ',' + y(point.value)); }
    flush();
  }
  path.points.forEach(point => {
    svg.append(svgNode('text', { x: x(point.year), y: 235, 'text-anchor': 'middle' }, point.year));
    if (point.value !== null) svg.append(svgNode('circle', { class: 'point', cx: x(point.year), cy: y(point.value), r: 5 }), svgNode('text', { x: x(point.year), y: y(point.value) - 13, 'text-anchor': 'middle' }, point.value));
  });
  return svg;
}
function renderPath() {
  const p = store.read();
  const active = p.data.descriptors.filter(item => p.selection.descriptorIds.includes(item.id));
  if (!active.some(item => item.id === selectedVariable)) selectedVariable = active[0]?.id || null;
  const descriptor = active.find(item => item.id === selectedVariable);
  const path = p.data.paths.find(item => item.descriptorId === selectedVariable);
  const selector = el('select', { id: 'sample-variable' }, ...active.map(item => el('option', { value: item.id }, item.label)));
  selector.value = selectedVariable || '';
  selector.addEventListener('change', () => { if (!leaveDraft()) { selector.value = selectedVariable; return; } dirty = false; selectedVariable = selector.value; renderPath(); });
  pathPanel.replaceChildren(el('h2', {}, '政策实施路径'), el('p', { class: 'muted' }, '日历年份是横轴。此页使用独立演示数据，输入不作为政策目标或现实预测。'), el('div', { class: 'sample-variable' }, el('label', { for: 'sample-variable' }, '当前变量'), selector));
  if (!descriptor || !path) {
    pathPanel.append(el('p', { class: 'notice' }, descriptor ? '该变量尚无演示路径。请选回可再生价格干预强度；不会自动套用其他变量的曲线。' : '先在左侧选择一个描述符。'));
    return;
  }
  const color = variableColor(descriptor.id);
  pathPanel.append(el('p', { style: '--variable-color:' + color }, el('span', { class: 'variable-mark', 'aria-hidden': 'true' }), descriptor.label + ' · ' + path.unit), graph(path, color));
  const inputs = [];
  const tbody = el('tbody');
  path.points.forEach((point, i) => {
    const year = el('input', { type: 'number', value: point.year, 'aria-label': '节点' + (i + 1) + '年份' });
    const value = el('input', { type: 'number', step: 'any', value: point.value === null ? '' : point.value, 'aria-label': '节点' + (i + 1) + '力度' });
    const error = el('span', { class: 'error-text', id: 'point-error-' + i });
    year.setAttribute('aria-describedby', error.id);
    inputs.push({ year, value, error });
    tbody.append(el('tr', {}, el('td', {}, year, error), el('td', {}, value), el('td', { class: 'muted' }, '演示假设')));
  });
  const status = el('p', { class: 'sample-state-status', role: 'status', 'aria-live': 'polite' }, '未检算。修改后请保存路径；数据颜色与左侧同一变量保持一致。');
  const interpolation = el('select', { id: 'sample-interpolation' }, el('option', { value: 'linear' }, '锚点间线性连接'), el('option', { value: 'none' }, '仅显示锚点'));
  interpolation.value = path.interpolation;
  const form = el('form', { novalidate: true }, el('table', { class: 'sample-point-table' }, el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, '年份'), el('th', { scope: 'col' }, '力度 · 演示指数'), el('th', { scope: 'col' }, '来源'))), tbody), el('div', { class: 'sample-variable' }, el('label', { for: 'sample-interpolation' }, '节点之间'), interpolation), el('div', { class: 'actions sample-actions' }, status, el('button', { type: 'button', class: 'button secondary', onclick: () => { dirty = false; renderPath(); } }, '取消修改'), el('button', { type: 'submit', class: 'button primary-action', id: 'save-sample-path' }, '保存路径')));
  form.addEventListener('input', () => { dirty = true; status.textContent = '有未保存的节点修改。'; });
  form.addEventListener('change', () => { dirty = true; status.textContent = '有未保存的设置修改。'; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    let invalid = null;
    const seen = new Set();
    const points = inputs.map(({ year, value, error }, i) => {
      year.removeAttribute('aria-invalid'); value.removeAttribute('aria-invalid'); error.textContent = '';
      const y = Number(year.value), v = value.value.trim() === '' ? null : Number(value.value);
      if (!year.value || !Number.isInteger(y) || y < 1900 || y > 2300 || seen.has(y)) {
        year.setAttribute('aria-invalid', 'true'); error.textContent = seen.has(y) ? '错误：年份重复，请修改。' : '错误：请输入1900—2300的整数年份。'; invalid ||= year;
      }
      if (v !== null && !Number.isFinite(v) || value.validity.badInput) { value.setAttribute('aria-invalid', 'true'); error.textContent = '错误：力度应为有限数字，空白表示未设定。'; invalid ||= value; }
      seen.add(y);
      return { ...path.points[i], year: y, value: v, origin: 'user-assumption' };
    });
    if (invalid) { status.textContent = '保存失败：请先修正标出的节点。原路径未改变。'; status.className = 'sample-state-status error-text'; invalid.focus(); return; }
    const paths = p.data.paths.map(item => item.id === path.id ? { ...item, points: points.sort((a, b) => a.year - b.year), interpolation: interpolation.value, version: item.version + 1 } : item);
    dirty = false;
    const result = actions.saveCollection({ key: 'paths', records: paths });
    pageStatus.textContent = result.ok ? (persistenceOk ? '演示路径已保存；输入已改变，仍未检算。' : '演示路径保留在页面；浏览器保存失败，请导出备份。') : result.error.message;
  });
  pathPanel.append(form, el('p', { class: 'sample-notice' }, '提示：空白不等于0；线性连接只在锚点之间显示，不外推，也不自动判断状态。'));
  if (p.view.perspective === 'expert') pathPanel.append(el('p', { class: 'muted' }, '变量ID：' + descriptor.id + ' · 路径版本 ' + path.version + ' · 科学修订 ' + p.revision));
}
const states = el('section', { class: 'surface', style: 'margin-top:22px' }, el('h2', {}, '控件状态与矩阵语义'), el('p', { class: 'muted' }, '下列控件用于对照默认、选中、悬停与错误外观；实际输入错误会在上方节点表中显示。'), el('div', { class: 'sample-states' }, ...[['默认', ''], ['选中', 'state-selected'], ['悬停样式', 'state-hover'], ['错误：请修正', 'state-error']].map(([name, cls]) => el('div', {}, el('span', {}, name), el('button', { type: 'button', class: 'button ' + cls, onclick: () => { pageStatus.textContent = '状态对照：' + name + '。上方保存路径可检查真实交互。'; } }, '操作控件')))));
states.append(el('div', { class: 'sample-bottom', id: 'sample-matrix' }, el('h3', {}, 'CIB矩阵：独立双极色阶'), el('p', { class: 'sample-matrix-caption' }, '以下是视觉语义示例，不是专家评分或算法输出。'), el('table', { class: 'matrix-example', 'aria-label': '矩阵语义示例' }, el('thead', {}, el('tr', {}, ...['抑制', '无关系', '促进', '缺失判断'].map(text => el('th', { scope: 'col' }, text)))), el('tbody', {}, el('tr', {}, el('td', { class: 'matrix-negative' }, '−3 · 抑制'), el('td', { class: 'matrix-zero' }, '0 · 无关系'), el('td', { class: 'matrix-positive' }, '+3 · 促进'), el('td', { class: 'matrix-missing' }, '未判断'))))), el('p', { class: 'warning-text', style: 'margin-top:12px' }, '警告：示例数值没有政策证据，不能用于研判。未判断的格子不会当作0。'));
main.append(states);
store.subscribe(p => {
  try { localStorage.setItem(KEY, JSON.stringify(p)); persistenceOk = true; }
  catch { persistenceOk = false; pageStatus.textContent = '浏览器保存失败：当前修改只保留在此页面。'; }
  renderPath();
});
window.addEventListener('beforeunload', event => { if (dirty || !persistenceOk) { event.preventDefault(); event.returnValue = ''; } });
mountElements();
renderPath();
