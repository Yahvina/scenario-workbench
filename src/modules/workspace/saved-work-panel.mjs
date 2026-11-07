import {el,infoTip} from '../../core/ui.mjs';
import {readRunArchive,readRunSummary} from '../solver/index.mjs';
import {statusLabel} from '../solver/presentation.mjs';
import {planAtYear} from '../elements/state-plan.mjs';
import {createLibrary,emptyBundle,namedPlan,savedRun,parseImport,mergeBundle,MAX_BYTES} from './saved-work.mjs';

// 本地库分两块用：首屏只放“保存当前方案”，列表与检验记录放在可切换区域。
// 校验、合并、恢复确认都沿用 saved-work.mjs，不在这里改数据语义。

function readLibrary() {
  let storage;
  try { storage = localStorage; } catch {}
  return createLibrary(storage || { getItem() { throw new Error('浏览器存储不可访问'); } });
}

function download(name, value, raw = false) {
  const url = URL.createObjectURL(new Blob([raw ? value : JSON.stringify(value)], { type: 'application/json' }));
  const a = el('a', { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 方案摘要三态：未选因素 / 已选但年度状态未选齐 / 状态齐全。
// 缺项数量为 0 不等于方案完整：没有因素就明说没有。
function planState(project) {
  if (!project.selection.descriptorIds.length) return 'empty';
  return (project.scope.years || []).every(y => planAtYear(project, y).complete) ? 'ready' : 'partial';
}
function planSummary(project) {
  const name = id => project.data.descriptors.find(d => d.id === id)?.label || id;
  if (planState(project) === 'empty') return [];
  return (project.scope.years || []).map(y => {
    const plan = planAtYear(project, y);
    if (!plan.complete) {
      const missing = plan.missing.map(d => name(d)).join('、');
      return y + '：已选 ' + project.selection.descriptorIds.length + ' 个因素，年度状态未选齐（缺 ' + missing + '）';
    }
    return y + '：' + plan.descriptors.map(d => name(d.descriptorId) + '=' + (d.stateId ? stateLabel(project, d.stateId) : '未选')).join('、');
  });
}
function stateLabel(project, id) {
  return project.data.states.find(s => s.id === id)?.label || id;
}

/* 首屏第一块：保存当前方案（不含检验结果） */
export function savePlanPanel(container, context) {
  const root = el('section', { class: 'exports-card save-task', 'data-save-plan': '' });
  const message = el('p', { class: 'save-msg', role: 'status', 'aria-live': 'polite' });
  const library = readLibrary();
  const name = el('input', { class: 'save-name', 'aria-label': '方案名称', maxlength: '120' });
  const summary = el('div', { class: 'save-summary' });
  const advanced = el('details', { class: 'save-advanced' }, el('summary', {}, '高级选项：方案关注状态'));
  const focusHost = el('div');
  let focusValues = Object.create(null);

  function defaultName() {
    const p = context.store.read();
    const state = library.load();
    const used = state.ok ? state.bundle.plans.map(x => x.name) : [];
    const base = (p.scope.regionId || '情景') + '情景方案';
    let i = 1;
    while (used.includes(base + ' ' + i)) i++;
    return base + ' ' + i;
  }

  function render() {
    const p = context.store.read();
    const years = planSummary(p);
    const empty = planState(p) === 'empty';
    summary.replaceChildren(...[
      el('p', {}, (p.scope.regionId || '地区未定') + ' · ' + ((p.scope.years || []).join('/') || '年份未定') + ' · ' + p.selection.descriptorIds.length + ' 个因素'),
      ...(empty ? [] : years.map(line => el('p', { class: 'save-summary-line' }, line))),
      ...(empty ? [el('button', { class: 'button text', type: 'button', onclick: () => context.navigate('elements') }, '去选择因素')] : [])]);
    save.textContent = empty ? '保存为草稿（还没有因素与评分）' : '保存这个方案';
    focusValues = Object.create(null);
    focusHost.replaceChildren();
    for (const id of p.selection.descriptorIds) {
      const d = p.data.descriptors.find(x => x.id === id);
      if (!d) continue;
      const select = el('select', { 'aria-label': '方案关注 ' + d.label },
        el('option', { value: '' }, '不设关注'),
        ...d.stateIds.map(sid => el('option', { value: sid }, stateLabel(p, sid))));
      select.addEventListener('change', () => { focusValues[id] = select.value; });
      focusHost.append(el('label', { class: 'save-focus' }, d.label, select));
    }
    if (!name.value.trim()) name.value = defaultName();
  }

  const save = el('button', { class: 'button primary-action', type: 'button' }, '保存这个方案');
  save.addEventListener('click', () => {
    try {
      const p = context.store.read();
      const value = name.value.trim();
      if (!value) throw new Error('请填写方案名称');
      const state = library.load();
      if (!state.ok) throw new Error('本地库无法读取，方案未保存：' + state.error);
      if (state.bundle.plans.some(x => x.name === value)) throw new Error('已有同名方案“' + value + '”，请换一个名称；不会覆盖原方案');
      const focus = Object.fromEntries(Object.entries(focusValues).filter(([, v]) => v));
      library.merge({ ...emptyBundle(), plans: [namedPlan(p, value, focus)] });
      message.textContent = '方案“' + value + '”已保存到本地库。检验结果尚未保存；需要时到「我的方案与历史」另存为检验记录。';
      window.dispatchEvent(new CustomEvent(LIBRARY_EVENT));
      name.value = defaultName();
    } catch (error) {
      message.textContent = '方案未保存：' + error.message;
    }
  });

  root.append(
        el('label', { class: 'save-field' }, '方案名称', name),
    summary,
    advanced, message,
    el('div', { class: 'save-actions' }, save));
  advanced.append(focusHost);
  render();
  const off = context.store.subscribe(render);
  container.append(root);
  return () => { off(); root.remove(); };
}

/* 首屏第二块：保存或导出检验结果（只在有结果时出现表单；无结果给空态+去检验） */
export function runSavePanel(container, context) {
  const root = el('section', { class: 'exports-card', 'data-run-save': '' });
  const message = el('p', { class: 'save-msg', role: 'status', 'aria-live': 'polite' });
  const library = readLibrary();
  const runName = el('input', { 'aria-label': '检验记录名称', maxlength: '120', class: 'save-name' });
  const body = el('div');

  function render() {
    const s = readRunSummary(context.store), archive = readRunArchive(context.store);
    if (!archive || !s) {
      // 空态不重复占版面：上面「导出结果」已经说明要先算一次。
      runName.remove();
      body.replaceChildren();
      message.textContent = '';
      root.hidden = true;
      return;
    }
    root.hidden = false;
    if (!runName.isConnected) root.insertBefore(el('label', { class: 'save-field' }, '检验记录名称', runName), message);
    if (!runName.value.trim()) runName.value = (context.store.read().scope.regionId || '情景') + (s.year ? s.year : '') + '检验记录';
    const done = s.status === 'completed';
    body.replaceChildren(
      el('p', {}, '本次检验：' + statusLabel(s.status) + ' · 年份 ' + (s.year ?? '无有效输入') + ' · 自洽组合 ' + (s.count === null ? '未定（不是 0）' : s.count) + (s.stale ? ' · 旧输入已过期' : '')),
      done ? null :       el('div', { class: 'save-actions' },
        el('button', { class: 'button primary-action', type: 'button', onclick: () => {
          try {
            const cur = library.load();
            if (!cur.ok) throw new Error('本地库无法读取：' + (cur.error || '未知错误'));
            const value = runName.value.trim();
            if (!value) throw new Error('请填写检验记录名称');
            if (cur.bundle.runs.some(x => x.name === value)) throw new Error('已有同名检验记录“' + value + '”，请换一个名称');
            const a = readRunArchive(context.store);
            library.merge({ ...emptyBundle(), runs: [savedRun(a, value)] });
            message.textContent = '已保存检验记录“' + value + '”（' + statusLabel(s.status) + '）。可在「我的方案与历史」查看或下载；历史记录不会在本次会话复算。';
            window.dispatchEvent(new CustomEvent(LIBRARY_EVENT));
          } catch (error) { message.textContent = '未保存：' + error.message; }
        } }, '保存为检验记录')));
  }
  root.append(el('h3', {}, '保存或导出检验结果'), body, message);
  render();
  const off = context.store.subscribe(render);
  container.append(root);
  return () => { off(); root.remove(); };
}

export const LIBRARY_EVENT = 'scenario-workbench:library-changed';

export function savedWorkPanel(container, context) {
  const root = el('section', { 'data-saved-work': '', class: 'library' });
  const message = el('p', { role: 'status', 'aria-live': 'polite', class: 'save-msg' });
  const list = el('div');
  const preview = el('div', { class: 'library-preview' });
  const library = readLibrary();
  let state = library.load();
  let pending = null;
  const button = (name, fn) => el('button', { class: 'button secondary', type: 'button', onclick: fn }, name);

  function attempt(fn) { try { fn(); } catch (error) { message.textContent = '未完成：' + error.message; } }
  function committed(bundle, text) { state = { ok: true, bundle, raw: JSON.stringify(bundle) }; pending = null; preview.replaceChildren(); renderList(); message.textContent = text; }

  // 检验记录的保存动作在首屏 runSavePanel；这里只负责历史列表与导入导出。
  const importFile = el('input', { type: 'file', class: 'save-file', accept: '.json,application/json', 'aria-label': '导入历史库或单条检验记录' });
  importFile.addEventListener('change', async () => {
    pending = null; preview.replaceChildren();
    try {
      const file = importFile.files[0]; if (!file) return;
      if (file.size > MAX_BYTES) throw new Error('文件超过 5MiB');
      state = library.load(); renderList();
      if (!state.ok) throw new Error('原库损坏或不可访问，请先保留原始数据并处理');
      const incoming = parseImport(await file.text(), state.bundle), merged = mergeBundle(state.bundle, incoming);
      pending = { incoming, raw: state.raw };
      preview.append(el('h4', {}, '恢复前预览'),
        el('p', {}, '文件包含方案：' + (incoming.plans.map(p => p.name).join('、') || '无') + '；检验记录：' + (incoming.runs.map(r => r.name).join('、') || '无')),
        el('p', {}, '合并后 ' + merged.plans.length + ' 条方案、' + merged.runs.length + ' 条检验记录。不会替换当前项目，也不会复算历史结果。'),
        button('确认合并历史库', () => attempt(() => {
          if (!pending) throw new Error('请重新选择文件');
          if (!confirm('确认合并预览中的历史库？当前项目不变，历史计数未复算。')) return;
          const current = library.load();
          if (!current.ok || current.raw !== pending.raw) throw new Error('历史库已变化，请重新预览');
          committed(library.merge(pending.incoming), '已合并历史库；其中记录仍是未复算的历史声明。');
        })));
      message.textContent = '文件校验完成，请核对预览后确认；尚未写入。';
    } catch (error) { message.textContent = '未导入：' + error.message; }
  });

  function renderList() {
    list.replaceChildren();
    if (!state.ok) {
      list.append(el('p', { role: 'alert' }, '历史库无法读取或已损坏，原内容未清空：' + state.error));
      if (state.raw !== null) list.append(button('下载损坏库原始数据', () => download('saved-work-damaged.json', state.raw, true)));
      list.append(button('确认后重建空历史库', () => attempt(() => {
        if (confirm('重建会替换损坏的历史库。请先下载原始数据；确认重建空库？')) committed(library.rebuild(), '已按明确确认重建空历史库。');
      })));
      return;
    }
    const plans = state.bundle.plans, runs = state.bundle.runs;
    list.append(el('h4', {}, '我的方案（' + plans.length + '）'));
    if (!plans.length) list.append();
    for (const plan of plans) {
      const p = plan.project;
      list.append(el('details', { class: 'library-row' }, el('summary', {}, plan.name),
        el('p', {}, (p.scope.regionId || '地区未知') + ' · ' + p.scope.years.join('/') + ' · ' + p.selection.descriptorIds.length + ' 个因素 · 科学修订 ' + p.revision),
        el('p', { class: 'v5-hint' }, '保存于 ' + plan.createdAt),
        el('div', { class: 'library-actions' },
          button('下载方案 ' + plan.name, () => download('named-plan-project.json', p)),
          button('预览恢复方案 ' + plan.name, () => {
            preview.replaceChildren(el('h4', {}, '将恢复：' + plan.name),
              el('p', {}, '完整替换当前项目：' + p.title + '；' + (p.scope.regionId || '未知地区') + '；' + p.scope.years.join('/') + '；' + p.selection.descriptorIds.length + ' 个活动因素。请先下载当前项目备份。'),
              button('确认替换当前项目为此方案', () => attempt(() => {
                if (!confirm('恢复命名方案将替换当前项目及未保存界面内容，请先下载现有备份。继续恢复吗？')) return;
                const result = context.actions.replaceProject(structuredClone(plan.project));
                if (!result.ok) throw new Error(result.error.message);
                context.refresh(); context.notify('方案已恢复；没有自动计算或采用历史结果。');
              })));
          }))));
    }
    list.append(el('h4', {}, '历史检验记录（' + runs.length + '）'));
    if (!runs.length) list.append();
    for (const run of runs) {
      const a = run.archive, r = a.RunResult, input = a.RunInput;
      list.append(el('details', { class: 'library-row' }, el('summary', {}, run.name),
        el('p', {}, '历史记录，未在本次会话复算。声明：' + statusLabel(r?.status || 'blocked') + ' · 成立数 ' + (r?.count === null || !r ? '未定' : r.count) + ' · 年份 ' + (input?.year ?? '无有效输入')),
        el('p', { class: 'v5-hint' }, '保存于 ' + run.createdAt + ' · 地区 ' + (a.projectInputSnapshot.scope.regionId || '未声明')),
        el('div', { class: 'library-actions' }, button('下载检验记录 ' + run.name, () => download('historical-cib-archive.json', a)))));
    }
  }

  root.append(el('h3', {}, '我的方案与历史'), list, preview, message,
    el('details', { class: 'library-io' }, el('summary', {}, '导入、导出与存储说明'),
      el('div', { class: 'library-actions' },
        button('重新读取历史库', () => { state = library.load(); pending = null; preview.replaceChildren(); renderList(); message.textContent = state.ok ? '已重新读取；历史仍未复算。' : '原库无法读取，未清空。'; }),
        button('导出完整历史库', () => attempt(() => { const current = library.load(); if (!current.ok) throw new Error(current.error); download('saved-work-bundle.json', current.bundle); }))),
      el('label', { class: 'save-field' }, '导入历史库或单条检验记录', importFile),
      ));
  renderList();
  const reload = () => { state = library.load(); pending = null; preview.replaceChildren(); renderList(); };
  window.addEventListener(LIBRARY_EVENT, reload);
  container.append(root);
  return () => { window.removeEventListener(LIBRARY_EVENT, reload); root.remove(); };
}
