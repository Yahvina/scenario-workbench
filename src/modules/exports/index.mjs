// 保存与导出：首屏只回答两件事——怎么保存方案、能导出什么。
// 列表、比较、模型样例与 AI 草案各自放进可切换区域，不和保存表单堆在同一张长卡里。
import { el } from '../../core/ui.mjs';
import { savePlanPanel, savedWorkPanel, runSavePanel, LIBRARY_EVENT } from '../workspace/saved-work-panel.mjs';
import { createLibrary } from '../workspace/saved-work.mjs';
import { reportPanel } from './report-panel.mjs';
import { comparePanel } from './compare-panel.mjs';
import { modelInputPanel } from './model-input-panel.mjs';
import { aiDraftPanel } from './ai-draft-panel.mjs';
import { projectBackupPanel } from './project-backup-panel.mjs';

// 保存状态四态：本机自动保存 / 命名方案 / 检验记录 / 备份文件。
// 各说各的事实，不用一个“已保存”混在一起；只在真正写入后显示成功。
function saveStatusStrip(page, context) {
  const root = el('section', { class: 'save-status', 'aria-label': '保存状态' });
  function render() {
    let plans = 0, runs = 0, libraryOk = true;
    try {
      const storage = 'localStorage' in window ? localStorage : null;
      const state = storage ? createLibrary(storage).load() : null;
      if (state?.ok) { plans = state.bundle.plans.length; runs = state.bundle.runs.length; }
      else if (state && !state.ok) libraryOk = false;
    } catch { libraryOk = false; }
    const persisted = context.persistenceState();
    root.replaceChildren(
      el('div', { class: 'save-chip ' + (persisted.ok ? 'ok' : 'bad') },
        el('b', {}, persisted.ok ? '本机自动保存 · 正常' : '本机自动保存 · 失败')),
      el('div', { class: 'save-chip' + (plans ? ' ok' : '') },
        el('b', {}, '命名方案 ' + plans + ' 份')),
      el('div', { class: 'save-chip' + (runs ? ' ok' : '') },
        el('b', {}, '检验记录 ' + runs + ' 份')),
      el('div', { class: 'save-chip' },
        el('b', {}, '备份文件')));
  }
  render();
  const offStore = context.store.subscribe(render);
  const offLibrary = () => window.removeEventListener(LIBRARY_EVENT, render);
  window.addEventListener(LIBRARY_EVENT, render);
  page.insertBefore(root, page.querySelector('.exports-grid'));
  return () => { offStore(); offLibrary(); root.remove(); };
}

const VIEWS = [
  { id: 'history', label: '我的方案与历史' },
  { id: 'compare', label: '报告与比较' },
  { id: 'advanced', label: '导出、备份与恢复' }
];

export function mountExports(container, context) {
  const page = el('section', { class: 'exports-page' });
  container.append(page);

  const grid = el('div', { class: 'exports-grid' });
  const planHost = el('div', { class: 'host-plan' });
  const resultHost = el('div', { class: 'host-result' });
  grid.append(planHost, resultHost);
  page.append(
    el('div', { class: 'v5-head' },
      el('h1', {}, '保存与导出'),
      ),
    grid);

  const switchBar = el('div', { class: 'exports-switch', role: 'tablist', 'aria-label': '保存与导出分区' });
  const viewHosts = {};
  const viewWrap = el('div', { class: 'exports-views' });
  for (const view of VIEWS) {
    const host = el('div', { class: 'exports-view', 'data-view': view.id, role: 'tabpanel' });
    viewHosts[view.id] = host;
    viewWrap.append(host);
    const tab = el('button', { class: 'button', role: 'tab', 'aria-selected': 'false', onclick: () => select(view.id) }, view.label);
    tab.dataset.tab = view.id;
    switchBar.append(tab);
  }
  page.append(switchBar, viewWrap);

  function select(id) {
    for (const view of VIEWS) {
      viewHosts[view.id].hidden = view.id !== id;
      const tab = switchBar.querySelector('[data-tab="' + view.id + '"]');
      tab.setAttribute('aria-selected', String(view.id === id));
      tab.classList.toggle('is-current', view.id === id);
    }
  }

  const disposers = [
    saveStatusStrip(page, context),
    savePlanPanel(planHost, context),
    reportPanel(resultHost, context),
    runSavePanel(resultHost, context),
    savedWorkPanel(viewHosts.history, context),
    comparePanel(viewHosts.compare, context),
    modelInputPanel(viewHosts.advanced, context),
    aiDraftPanel(viewHosts.advanced, context),
    projectBackupPanel(viewHosts.advanced, context)
  ].filter(dispose => typeof dispose === 'function');

  select('history');
  return () => { for (const dispose of disposers) dispose(); };
}

// P8 单独占一个导航入口（专家视角的「AI草案」）。
export function mountAiDraft(container, context) {
  const dispose = aiDraftPanel(container, context);
  return typeof dispose === 'function' ? dispose : () => {};
}
