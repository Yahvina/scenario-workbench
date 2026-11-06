import { createProjectStore } from './core/project-store.mjs';
import { createActions } from './core/actions.mjs';
import { CONTRACT_VERSION } from './core/contracts.mjs';
import { navigationFor, navigationItem } from './core/navigation.mjs';
import { el, closeActiveDrawer } from './core/ui.mjs';
import { createDemoProject } from './fixtures/demo.mjs';
import { createMechanismCaseProject } from './fixtures/mechanism-project.mjs';
import { createGuidedDemoProject } from './fixtures/guided-demo.mjs';
import { progressText } from './modules/shared/flow-progress.mjs';
import { mount as mountWorkspace } from './modules/workspace/index.mjs';
import { mount as mountElements } from './modules/elements/index.mjs';
import { mount as mountTimeline } from './modules/timeline/index.mjs';
import { mount as mountRelationships } from './modules/relationships/index.mjs';
import { mount as mountSolver, readRunSummary, subscribeRunSummary } from './modules/solver/index.mjs';
import { mountExports, mountAiDraft } from './modules/exports/index.mjs';
import { mount as mountChain } from './modules/chain/index.mjs';
import { mount as mountRobustness } from './modules/solver/robustness-panel.mjs';
import { sendMatrixHandoff } from './modules/relationships/handoff.mjs';

const STORAGE_KEY = 'scenario-workbench.project.v1';
const root = document.querySelector('#app');
let recoveryMessage = '', snapshot = null, mounted = null;
let persistence = { ok: true, error: null };
let store;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  store = saved ? createProjectStore('restored', JSON.parse(saved)) : createProjectStore(crypto.randomUUID());
  if(!saved)store.updateProjectDetails({title:'京津冀政策情景',scope:{regionId:'京津冀',years:[2030,2035]}});
} catch (error) {
  store = createProjectStore(crypto.randomUUID());
  recoveryMessage = '本地记录未能恢复：' + error.message + '。原记录未被自动覆盖；请恢复兼容备份或保存新项目。';
}
const actions = createActions(store);
const steps = [['workspace', '项目与研究范围'], ['elements', '描述符与状态'], ['timeline', '政策实施路径'], ['relationships', '关系与依据'], ['solver', '检验与解释']];
const routes = { workspace: mountWorkspace, elements: mountElements, timeline: mountTimeline, relationships: mountRelationships, solver: mountSolver, exports: mountExports, 'ai-draft': mountAiDraft, chain: mountChain, robustness: mountRobustness };
const header = el('header', { class: 'topbar' }, el('div', {}, el('span', { class: 'brand' }, '情景研判平台'), el('span', { class: 'version' }, '京津冀简明版 · 图册直显')));
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
main.append(heading, storageMessage, el('div', { class: 'content-grid' }, content), globalMessage, el('p', { class: 'footer' }, '描述符、时间路径、直接评分及受限二档图形编码已接入；精确CIB检验及逐项解释已接入，最多100000组合；三档编码不自动外推，结果刷新不恢复。'));
sidebar.append(el('details',{class:'side-context'},el('summary',{},'项目范围与来源'),contextPanel));
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
  for (const [label, value] of [['项目', p.title], ['地区', p.scope.regionId || '尚未指定'], ['年份', p.scope.years.join(' / ') || '尚未指定'], ['当前选择', p.view.perspective==='public'?'已选 '+p.selection.descriptorIds.length+' 个因素':p.selection.nodeIds.length + ' 个分类节点 · ' + p.selection.descriptorIds.length + ' 个计算变量']]) facts.append(el('div', {}, el('dt', {}, label), el('dd', {}, value)));
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
  const extra=el('details',{},el('summary',{},'查看项目来源和输入记录'),trace,el('p',{},'项目ID：'+p.id+'；科学修订 '+p.revision));contextPanel.replaceChildren(el('section', { class: 'side-section' }, el('h2', {}, '当前项目'), facts),extra);
}
function mountMethods(container, navigate) {
  container.append(
    el('h2', {}, '方法与帮助'),
    el('p', { class: 'subtitle' }, '这里回答“一般怎么算、符号什么意思、什么情况下不能用”；某一次具体怎么算，去「计算过程与依据」。'),
    el('table', { class: 'method-table' },
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, '环节'), el('th', { scope: 'col' }, '需要明确的内容'), el('th', { scope: 'col' }, '当前状态'))),
      el('tbody', {}, ...[
        ['项目范围', '地区、年份、输入版本；未知范围不当匹配', '可使用'],
        ['因素与状态', '所选分类到实际计算变量的直接映射；缺映射保留待配置', '可使用'],
        ['年度状态', '因素旁按年选状态；只表达你的方案，不锁定枚举', '可使用'],
        ['关系评分', '逐状态对直接评分；0＝没关系，空白＝未判断；参考评分需显式采用', '可使用'],
        ['CIB 检验', '逐变量比较所有候选状态；精确枚举上限 100000；锁定不免除比较', '可使用'],
        ['结果与导出', '冻结结果、自洽组合列表、报告预览与下载', '可使用'],
        ['多专家、稳健性、AHP', '专家原始意见与聚合、批量扰动、重要性权重', '部分：稳健性单点已接；其余未接']
      ].map(row => el('tr', {}, ...row.map(cell => el('td', {}, cell)))))),
    el('div', { class: 'formula' }, 'Iⱼ(l | s) = Σᵢ≠ⱼ Cᵢⱼ(sᵢ, l)；一致性条件：对每个 j，Iⱼ(sⱼ | s) ≥ Iⱼ(l | s)，对所有候选 l 成立。'),
    el('h3', {}, '符号与语义'),
    el('table', { class: 'method-table' }, el('tbody', {},
      el('tr', {}, el('td', {}, 'Cᵢⱼ(sᵢ, l)'), el('td', {}, '源因素 i 取 sᵢ 时，对目标因素 j 取 l 这一格的分值（−3…+3）')),
      el('tr', {}, el('td', {}, '0'), el('td', {}, '两者没有直接关系，是一个判断，不是“没把握”')),
      el('tr', {}, el('td', {}, '空白'), el('td', {}, '还没有判断，不参与计算，也不补 0')),
      el('tr', {}, el('td', {}, 'γ / g'), el('td', {}, 'γ 排除所选状态后比较，可为正；g 是相对所有候选的差距，自洽时为 0')),
      el('tr', {}, el('td', {}, '自洽'), el('td', {}, '矩阵内部一致，不等于现实会发生，也不是最优解')))),
    el('h3', {}, '适用范围'),
    el('p', {}, '逐年截面检验：每年单独算一次一致性，不构成跨期动力学预测；锁定只限制枚举范围，不改变判据；判断与依据缺一不可，政策文本能证明政策事实，不能单独证明因素之间的影响规律。'),
    el('h3', {}, '操作帮助'),
    el('ol', {},
      el('li', {}, '开始研究：选地区和年份。'),
      el('li', {}, '因素与年度方案：从目录勾选因素，在右侧按年份选状态。'),
      el('li', {}, '关系评分：逐方向评分；可用「一键填入参考评分」，但那是演示参考，需要你核对并采用。'),
      el('li', {}, '检验与结果：先看「我的方案」，再决定是否「寻找所有自洽组合」。'),
      el('li', {}, '保存与导出：方案与检验结果分开保存；报告先预览再下载。')),
    el('h3', {}, '文献依据'),
    el('ul', {},
      el('li', {}, 'Weimer-Jehle, W. (2009). Properties of Cross-Impact Balance Analysis. 交叉影响平衡的判据与性质。'),
      el('li', {}, 'Stankov et al. (2021), MethodsX 8: 101492. 关系图形与技术模板的来源（图册，仅趋势参考）。')),
    el('div', { class: 'method-links' },
      el('button', { class: 'button secondary', onclick: () => navigate('chain') }, '看本次结论的计算过程'),
      el('button', { class: 'button secondary', onclick: () => navigate('about') }, '关于平台／版本说明')));
}

function mountAbout(container, navigate) {
  container.append(
    el('h2', {}, '关于平台／版本说明'),
    el('p', { class: 'subtitle' }, '这一页只讲开发进度、版本变化和还没做的能力；一般怎么算在「方法与帮助」。'),
    el('table', { class: 'method-table' },
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, '能力'), el('th', { scope: 'col' }, '状态'), el('th', { scope: 'col' }, '说明'))),
      el('tbody', {}, ...[
        ['主线：选因素→年度状态→关系评分→检验→保存', '真实可用', '离线单文件，本轮在交付文件上跑通'],
        ['一键参考评分（机制案例 / 旧平台规则）', '仅参考示例可用', '演示参考，非实时 AI 生成；默认只填空白，需显式采用'],
        ['年度方案检验与全空间探索', '真实可用', '分开呈现；计数来自完整结果'],
        ['白箱链（计算过程与依据）', '真实可用', '九节点、公式代入、按记录反查；历史结果标注过期'],
        ['稳健性检验', '部分可用', '单方向 ±1 扰动并真实重算；多参数联合与随机轮次未接'],
        ['多专家评分、分歧与聚合', '尚未实现', '旧平台 v1.5 有 Ensemble 模式；新版未迁移，旧数据不能直接当专家记录'],
        ['情景地图（簇 + 热力图）', '尚未实现', '需要真实冻结结果与稳定聚类口径；不用随机点充数'],
        ['AHP、加权 CIB、知识库、模型真实运行', '尚未实现', '方法未核实或缺少外部资源（如 GAMS），不挂假按钮'],
        ['四种参数输出与模型映射', '部分可用', '报告与 JSON 可用；映射仍为平台推断，未经导师核对']
      ].map(row => el('tr', {}, ...row.map(cell => el('td', {}, cell)))))),
    el('h3', {}, '版本'),
    el('p', {}, '2026-11-06 · 本轮：新增一键参考评分（关系评分与矩阵核对两个入口）、参考采用后直通检验、稳健性单点重算、白箱链移入工具区并从结果直达。'),
    el('p', {}, '2026-11-05 · 上一轮：关系页改为检查评分完整性、检验页结果优先、保存与导出拆分任务。'),
    el('p', { class: 'notice' }, '旧平台已有但新版尚未迁移的能力不在此处标记为可用；具体缺口见随包的功能迁移对照表。'),
    el('div', { class: 'method-links' },
      el('button', { class: 'button secondary', onclick: () => navigate('methods') }, '方法与帮助'),
      el('button', { class: 'button secondary', onclick: () => navigate('chain') }, '计算过程与依据')));
}

function renderRoute() {
  if (typeof mounted === 'function') mounted(); else mounted?.dispose?.();
  closeActiveDrawer(); // 抽屉挂在 body 上，切页必须显式关闭，否则残留旧页面数据
  content.replaceChildren();
  const p = store.read(), route = p.view.module;
  const currentItem = navigationFor(p.view.perspective).flatMap(group => group.items).find(item => item.module === route && item.objectId === p.view.objectId);
  const staticTitles = { methods: '方法与帮助', about: '关于平台／版本说明' };
  headingTitle.textContent = staticTitles[route] || currentItem?.title || navigationItem(route, p.view.objectId)?.title || steps.find(step => step[0] === route)?.[1] || '模块进度';
  headingSubtitle.textContent = '';
  main.dataset.route=route;main.dataset.perspective=p.view.perspective;
  const context = { store, actions, navigate, notify, refresh: renderRoute, contractVersion: CONTRACT_VERSION, persistenceState: () => ({ ...persistence }),
    loadDemo: () => {
      const demo = createDemoProject();
      demo.view.perspective = store.read().view.perspective;
      const result = actions.replaceProject(demo);
      if (!result.ok) { notify(result.error.message); return; }
      renderRoute(); notify('机制示例已载入；当前数据不代表真实政策。');
    },
    loadMechanism: () => {
      const demo = createMechanismCaseProject();
      demo.view.perspective = store.read().view.perspective;
      const result = actions.replaceProject(demo);
      if (!result.ok) { notify(result.error.message); return; }
      renderRoute(); notify('机制演示（R35）已载入：18 格分值来自评分明细，不代表地区政策结论。');
    },
    loadGuidedDemo: () => {
      const demo = createGuidedDemoProject();
      demo.view.perspective = store.read().view.perspective;
      const result = actions.replaceProject(demo);
      if (!result.ok) { notify(result.error.message); return false; }
      // 示例自带采用记录：走与关系页“使用这份评分，继续检验”同一条交接通道，
      // 落在检验页时记录已明确选用；假设口径按页面默认接受记录。
      sendMatrixHandoff(demo, { year: 2030, selectedJudgmentIds: demo.data.judgments.map(j => j.id), adopted: true });
      renderRoute(); notify('完整流程示例已载入（机制演示）：因素、2030/2035 年度状态与两个方向 18 格评分已就绪；确认一次检验假设后点「开始检验」。不代表真实政策。');
      return true;
    },
    libraryCounts: () => {
      try {
        const raw = localStorage.getItem('scenario-workbench.saved-work.v1');
        if (!raw) return { plans: 0, runs: 0 };
        const bundle = JSON.parse(raw);
        return { plans: Array.isArray(bundle.plans) ? bundle.plans.length : 0, runs: Array.isArray(bundle.runs) ? bundle.runs.length : 0 };
      } catch { return { plans: 0, runs: 0 }; }
    },
    exportProject: () => saveFile('scenario-project-unverified.json', store.read()),
    captureSnapshot: () => { snapshot = store.snapshot(); renderContext(); notify('已记录基础输入快照；这份快照本身不包含CIB结果。'); }
  };
  if (routes[route]) {
    mounted = routes[route](content, context);
    heading.hidden = !!content.querySelector('.v5-head');
    appendFlowBar(route, context);
  }
  else if (route === 'methods') { mountMethods(content, navigate); mounted = null; }
  else if (route === 'about') { mountAbout(content, navigate); mounted = null; }
  else { content.append(el('div', { class: 'empty-state' }, el('h2', {}, headingTitle.textContent + '尚未接入'), el('p', {}, '本轮只建立项目外壳与接口。这个模块还没有提供可验收的计算或编辑功能。'), el('button', { class: 'button secondary', onclick: () => navigate('workspace') }, '返回项目设置'))); mounted = null; }
  renderContext();
}
// 底部流程条：左侧按真实数据说完成情况（缺项定位到因素/年份/方向），右侧一个主动作。
// 侧栏仍可自由跳页；这条线只回答“主线走到哪、下一步是什么”。
// 选择、状态与评分变化时流程条同步更新，不显示页面挂载时的旧数据。
let flowDispose = null;
function appendFlowBar(route, context) {
  flowDispose?.(); flowDispose = null;
  if (!['workspace', 'elements', 'timeline', 'relationships', 'solver', 'exports'].includes(route)) return;
  const bar = el('div', { class: 'flow-next flow-progress', 'data-flow-progress': '' });
  const paint = () => {
    const p = store.read();
    const info = progressText(route, p, { runSummary: readRunSummary(store), library: context.libraryCounts() });
    const factors = p.selection.descriptorIds.length;
    let action = null;
    if (route === 'workspace') action = { label: '继续：选择因素', run: () => navigate('elements') };
    else if (route === 'elements') action = factors >= 2
      ? { label: '继续：判断关系', run: () => navigate('relationships') }
      : { label: '去选择因素', run: () => { const input = content.querySelector('#elements-search'); input?.focus(); input?.scrollIntoView({ block: 'center' }); } };
    else if (route === 'timeline') action = { label: '继续：判断关系', run: () => navigate('relationships') };
    else if (route === 'relationships') action = factors >= 2
      ? { label: '继续：核对本次评分', run: () => content.querySelectorAll('.relationships-tabs button')[1]?.click() }
      : { label: '去选择因素', run: () => navigate('elements') };
    else if (route === 'solver') action = { label: '继续：保存与报告', run: () => navigate('exports') };
    else if (route === 'exports') action = { label: '下载项目备份', run: () => saveFile('scenario-project-unverified.json', store.read()) };
    bar.replaceChildren(
      el('div', { class: 'flow-progress-info' },
        el('span', { class: 'flow-progress-text' }, info.text),
        info.hint ? el('span', { class: 'flow-progress-hint' }, info.hint) : null),
      action ? el('button', { class: 'button primary-action', onclick: action.run }, action.label) : null);
  };
  paint();
  content.append(bar);
  const offStore = store.subscribe(paint);
  const offRun = subscribeRunSummary(paint);
  flowDispose = () => { offStore(); offRun(); };
}
store.subscribe(p => { persist(p); renderContext(); });
subscribeRunSummary(renderContext);
renderRoute();
if (recoveryMessage) notify(recoveryMessage);
