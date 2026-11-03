import { createProjectStore } from './core/project-store.mjs';
import { createActions } from './core/actions.mjs';
import { CONTRACT_VERSION } from './core/contracts.mjs';
import { navigationFor, navigationItem } from './core/navigation.mjs';
import { el } from './core/ui.mjs';
import { createDemoProject } from './fixtures/demo.mjs';
import { mount as mountWorkspace, mountSaving } from './modules/workspace/index.mjs';
import { mount as mountElements } from './modules/elements/index.mjs';
import { mount as mountTimeline } from './modules/timeline/index.mjs';
import { mount as mountRelationships } from './modules/relationships/index.mjs';
import { mount as mountSolver, readRunSummary, subscribeRunSummary } from './modules/solver/index.mjs';

const STORAGE_KEY = 'scenario-workbench.project.v1';
const root = document.querySelector('#app');
let recoveryMessage = '', snapshot = null, mounted = null;
let persistence = { ok: true, error: null };
let store;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  store = saved ? createProjectStore('restored', JSON.parse(saved)) : createProjectStore(crypto.randomUUID());
} catch (error) {
  store = createProjectStore(crypto.randomUUID());
  recoveryMessage = '本地记录未能恢复：' + error.message + '。原记录未被自动覆盖；请恢复兼容备份或保存新项目。';
}
const actions = createActions(store);
const steps = [['workspace', '项目与研究范围'], ['elements', '描述符与状态'], ['timeline', '政策实施路径'], ['relationships', '关系与依据'], ['solver', '检验与解释']];
const routes = { workspace: mountWorkspace, elements: mountElements, timeline: mountTimeline, relationships: mountRelationships, solver: mountSolver, exports: mountSaving };
const header = el('header', { class: 'topbar' }, el('div', {}, el('span', { class: 'brand' }, '情景研判平台'), el('span', { class: 'version' }, '新版工作台 v0.2')));
const perspectiveSelect = el('select', { id: 'perspective-select' }, el('option', { value: 'public' }, '普通用户 · 简洁界面'), el('option', { value: 'expert' }, '专家用户 · 完整工作台'));
const viewSwitch = el('div', { class: 'view-dropdown' }, el('label', { for: 'perspective-select' }, '界面视角'), perspectiveSelect);
perspectiveSelect.addEventListener('change', () => {
  const before = store.read();
  if (!canLeave()) { perspectiveSelect.value = before.view.perspective; return; }
  const value = perspectiveSelect.value;
  const publicModules = navigationFor('public').flatMap(group => group.items).map(item => item.module);
  const fallback = value === 'public' && !publicModules.includes(before.view.module) && !['methods','timeline'].includes(before.view.module);
  store.setView({ perspective: value, ...(fallback ? { module: 'solver', objectId: null } : value === 'public' && before.view.module === 'relationships' ? { objectId: null } : {}) });
  renderRoute();
  if (fallback) notify('已切换到简洁界面；详细关系建模仍保留在专家工作台。');
});
header.append(viewSwitch);
const nav = el('nav', { 'aria-label': '情景工作流程' });
const sidebar = el('aside', { class: 'sidebar' }, el('p', { class: 'nav-label' }, '构建与检查方案'), nav,
  el('div', { class: 'nav-bottom' }, el('button', { class: 'nav-item', 'data-route': 'methods', onclick: () => navigate('methods') }, '方法与实现进度')),
  el('p', { class: 'sidebar-note' }, '选择、依据与计算分开记录。未判断的内容保持未判断。'));
const main = el('main', { id: 'main', class: 'workspace', tabindex: '-1' });
const headingTitle = el('h1');
const headingSubtitle = el('p', { class: 'subtitle' });
const runBadge = el('span', { class: 'badge', 'data-cib-status': '' }, '尚未运行CIB');
const heading = el('div', { class: 'page-heading' }, el('div', {}, headingTitle, headingSubtitle), runBadge);
const content = el('section', { class: 'surface', id: 'module-content' });
const contextPanel = el('aside', { class: 'surface context-panel', 'aria-label': '项目范围与来源' });
const globalMessage = el('p', { class: 'message', role: 'status', 'aria-live': 'polite', id: 'global-status' });
const storageMessage = el('p', { class: 'storage-status', role: 'alert', hidden: true });
main.append(heading, storageMessage, el('div', { class: 'content-grid' }, content, contextPanel), globalMessage, el('p', { class: 'footer' }, '描述符、时间路径、直接评分及受限二档图形编码已接入；精确CIB检验及逐项解释已接入，最多100000组合；三档编码不自动外推，结果刷新不恢复。'));
root.append(header, el('div', { class: 'layout' }, sidebar, main));
function notify(text) { globalMessage.textContent = text; }
function persist(project) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    persistence = { ok: true, error: null };
    storageMessage.hidden = true;
  } catch (error) {
    persistence = { ok: false, error: error.message };
    storageMessage.textContent = '浏览器保存失败。修改只保留在当前页面，请下载项目备份后再离开或刷新。';
    storageMessage.hidden = false;
  }
}
window.addEventListener('beforeunload', event => { if (!persistence.ok) { event.preventDefault(); event.returnValue = ''; } });
function canLeave() { return !mounted?.canLeave || mounted.canLeave(); }
function navigate(id, objectId = null) {
  if (!canLeave()) return;
  store.setView({ module: id, objectId });
  renderRoute();
  main.focus();
}
function saveFile(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = el('a', { href: url, download: name });
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function runStatusText(summary) {
  if (!summary) return '尚未运行CIB';
  const prefix = summary.stale ? '旧检算已过期 · ' : '';
  if (summary.status === 'running') return prefix + '检算中 · 已检查 ' + summary.checked;
  if (summary.status === 'completed') return prefix + '检算完成 · ' + summary.count + ' 个自洽配置';
  if (summary.status === 'blocked') return prefix + '检算阻断 · 未开始';
  return prefix + '检算未完成 · 成立数未定';
}
function renderContext() {
  const p = store.read();
  perspectiveSelect.value = p.view.perspective;
  const runSummary = readRunSummary(store), runText = runStatusText(runSummary);
  runBadge.textContent = runText;
  const signature = p.view.perspective;
  if (nav.dataset.perspective !== signature) {
    nav.dataset.perspective = signature;
    nav.replaceChildren(...navigationFor(signature).map(group => el('section', { class: 'nav-group' }, el('h2', { class: 'nav-group-title' }, group.title),
      ...group.items.map(item => el('button', { class: 'nav-item', 'data-route': item.module, 'data-object-id': item.objectId || '', onclick: () => navigate(item.module, item.objectId) }, item.title, item.ready ? null : el('span', { class: 'nav-note' }, '待实现'))))));
  }
  if(signature==='expert'&&!nav.querySelector('[data-planned]')){const more=el('details',{'data-planned':''},el('summary',{},'更多工具与开发计划'));nav.querySelectorAll('.nav-item').forEach(b=>{if(b.querySelector('.nav-note'))more.append(b);});nav.append(more);}
  sidebar.querySelectorAll('[data-route]').forEach(button => {
    if (button.dataset.route === p.view.module && (button.dataset.objectId || '') === (p.view.objectId || '')) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  const facts = el('dl', { class: 'facts' });
  for (const [label, value] of [['项目', p.title], ['地区', p.scope.regionId || '尚未指定'], ['年份', p.scope.years.join(' / ') || '尚未指定'], ['当前选择', p.selection.nodeIds.length + ' 个分类节点 · ' + p.selection.descriptorIds.length + ' 个计算变量']]) facts.append(el('div', {}, el('dt', {}, label), el('dd', {}, value)));
  const records = Object.values(p.data).flat();
  const fixtureCount = records.filter(record => record.provenance.origin === 'fixture' || record.kind === 'fixture').length;
  const sourceText = !records.length ? '还没有载入政策、分类或关系依据。' : fixtureCount === records.length ? '当前全部数据为软件机制示例，不代表真实政策。' : fixtureCount ? '当前包含机制示例及其他来源记录，请分别核对；证据尚未验证。' : '当前包含用户或导入记录；出处可追踪，但证据尚未验证。';
  const trace = el('section', { class: 'side-section' }, el('h2', {}, '这份方案来自哪里'), el('p', { class: 'muted' }, sourceText),
    el('ol', { class: 'trace' }, el('li', {}, '研究范围：当前项目中的设定'), el('li', {}, '已有数据：' + p.data.descriptors.length + ' 个变量，' + p.data.paths.length + ' 条路径'), el('li', {}, p.data.judgments.length ? '影响判断：' + p.data.judgments.length + ' 条；检验范围以选用记录及冻结归档为准' : '影响判断：尚未提供'), el('li', { 'data-cib-trace': '' }, 'CIB检验：' + runText)));
  if (p.view.perspective === 'expert') trace.append(el('p', { class: 'muted' }, '契约 ' + CONTRACT_VERSION + ' · 科学修订 ' + p.revision), el('p', { class: 'muted' }, '项目ID：' + p.id));
  if (snapshot) {
    const current = store.isCurrent(snapshot);
    const details = el('details', { class: 'snapshot', id: 'snapshot-details' }, el('summary', {}, current ? '基础快照：当前输入，未检验' : '基础快照：输入已改变，已过期'), el('p', {}, '这只是输入归档，不包含CIB求解结果。刷新后请重新记录。'));
    if (p.view.perspective === 'expert') details.append(el('pre', {}, JSON.stringify(snapshot, null, 2)));
    trace.append(details);
  }
  const extra=el('details',{},el('summary',{},'来源、版本与基础快照'),trace,el('p',{},'项目ID：'+p.id+'；科学修订 '+p.revision));contextPanel.replaceChildren(el('section', { class: 'side-section' }, el('h2', {}, '当前项目'), facts),extra);
}
function mountMethods(container) {
  container.append(el('h2', {}, '从输入到结论，每一步都保留依据'), el('p', { class: 'subtitle' }, '精确枚举给定矩阵的状态配置，并保留每项得分、输入和方法版本。'),
    el('table', { class: 'method-table' }, el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, '环节'), el('th', { scope: 'col' }, '需要明确的内容'), el('th', { scope: 'col' }, '当前状态'))),
      el('tbody', {}, ...[['项目范围', '地区、日历年份、输入版本', '可使用'], ['描述符选择', '所选分类与实际计算变量的直接映射；缺映射保留待配置', '可使用'], ['时间路径', '原始锚点、用户假设与插值', '可使用'], ['状态对影响', '直接评分、受限二档模板编码及按年份准备矩阵；来源与修订可查', '可使用'], ['CIB检验', '逐变量比较所有候选状态；精确枚举上限100000，锁定不免除比较', '可使用']].map(row => el('tr', {}, ...row.map(cell => el('td', {}, cell)))))),
    el('div', { class: 'formula' }, 'Iⱼ(l | s) = Σᵢ≠ⱼ Cᵢⱼ(sᵢ, l)；一致性条件：对每个 j，Iⱼ(sⱼ | s) ≥ Iⱼ(l | s)，对所有候选 l 成立。'),
    el('p', {}, '公式说明的是给定影响矩阵下的内部一致性，不是现实发生概率。逐年截面检验也不自动构成动态预测。'), el('p', { class: 'notice' }, '可保留不自洽配置并查看原因；JSON归档区分完成、阻断及取消。结果仅保留在本会话，长期保存请下载。'));
}
function renderRoute() {
  if (typeof mounted === 'function') mounted(); else mounted?.dispose?.();
  content.replaceChildren();
  const p = store.read(), route = p.view.module;
  const currentItem = navigationFor(p.view.perspective).flatMap(group => group.items).find(item => item.module === route && item.objectId === p.view.objectId);
  headingTitle.textContent = route === 'methods' ? '方法与实现进度' : currentItem?.title || navigationItem(route, p.view.objectId)?.title || steps.find(step => step[0] === route)?.[1] || '模块进度';
  headingSubtitle.textContent = p.view.perspective === 'expert' ? '查看数据结构、来源与输入版本，继续使用同一个项目。' : '先明确要研究什么，再逐步细化你的选择。';
  const context = { store, actions, navigate, notify, refresh: renderRoute, contractVersion: CONTRACT_VERSION, persistenceState: () => ({ ...persistence }),
    loadDemo: () => {
      const demo = createDemoProject();
      demo.view.perspective = store.read().view.perspective;
      const result = actions.replaceProject(demo);
      if (!result.ok) { notify(result.error.message); return; }
      renderRoute(); notify('机制示例已载入；当前数据不代表真实政策。');
    },
    exportProject: () => saveFile('scenario-project-unverified.json', store.read()),
    captureSnapshot: () => { snapshot = store.snapshot(); renderContext(); notify('已记录基础输入快照；这份快照本身不包含CIB结果。'); }
  };
  if (routes[route]) mounted = routes[route](content, context);
  else if (route === 'methods') { mountMethods(content); mounted = null; }
  else { content.append(el('div', { class: 'empty-state' }, el('h2', {}, headingTitle.textContent + '尚未接入'), el('p', {}, '本轮只建立项目外壳与接口。这个模块还没有提供可验收的计算或编辑功能。'), el('button', { class: 'button secondary', onclick: () => navigate('workspace') }, '返回项目设置'))); mounted = null; }
  renderContext();
}
store.subscribe(p => { persist(p); renderContext(); });
subscribeRunSummary(renderContext);
renderRoute();
if (recoveryMessage) notify(recoveryMessage);
