import { el } from '../../core/ui.mjs';
import {readRunSummary} from '../solver/index.mjs';
import {REGION_SCALES,PROVINCES,TARGET_YEARS,YEAR_MIN,YEAR_MAX,optionsForScale,provinceForRegion,scaleForRegion} from './regions.mjs';
import {DEFAULT_NAME,DEFAULT_TITLE,addYears,checkYear,displayTitle,parseYearList,rangePreview,rangeSummary,removeYear,suggestTitle} from './start-range.mjs';
import {newScenarioProject} from './new-project.mjs';
import {mountMap} from '../map/index.mjs';
import {regionImpact} from '../map/geo.mjs';

// The start page only chooses where and when to study, then hands over to the factors
// step. The stored scope contract is unchanged: scope.regionId remains the single
// stable value, and a stored value outside the offline list is preserved as-is.
export function mount(container, context) {
  const project = context.store.read();
  let dirty = false;
  // A new scenario is drafted in front of the user first and only replaces the active
  // project when it is submitted; until then the stored project is untouched.
  let pendingNew = false;
  let scale, provinceId, regionId, years, storedUnknownRegion, defaultYears = false;

  const status = el('p', { class: 'message', role: 'status', 'aria-live': 'polite' });
  const setStatus = (text, kind = '') => { status.textContent = text; status.className = 'message' + (kind ? ' ' + kind : ''); };
  let geo = null;
  const markDirty = () => { dirty = true; setStatus('有未保存的修改', 'dirty'); geo?.setActive(); };
  const field = (label, input, extra = null, wide = false) => el('div', { class: 'field' + (wide ? ' wide' : '') }, el('label', { for: input.id }, label), input, extra);

  // 首页不再让用户手填项目名称：范围定完自动命名，之后可在「保存与导出」里改方案名。
  const title = el('input', { id: 'project-title', type: 'hidden', value: displayTitle(project.title) });

  // 新情景草稿的名字随研究范围自动生成；已有项目一律保持原名，绝不自动改写。
  // 用户想改名字，到「保存与导出 → 导出、备份与恢复」里改。
  function syncDraftName() {
    if (!pendingNew) return;
    title.value = suggestTitle(regionId, years) || DEFAULT_NAME;
  }

  const regionBlock = el('div', { class: 'form-grid' });
  function renderRegion() {
    const scaleSelect = el('select', { id: 'region-scale' }, ...REGION_SCALES.map(item => el('option', { value: item.id }, item.label)));
    scaleSelect.value = scale;
    scaleSelect.addEventListener('change', () => {
      scale = scaleSelect.value;
      if (scale === 'city') { const known = provinceForRegion(regionId); if (known) provinceId = known; if (!optionsForScale('city', provinceId).includes(regionId)) regionId = ''; }
      else if (!optionsForScale(scale, provinceId).includes(regionId)) regionId = '';
      renderRegion(); markDirty();
    });
    const hint = REGION_SCALES.find(item => item.id === scale)?.hint || '';
    const nodes = [field('地区尺度', scaleSelect)];
    if (scale === 'city') {
      const provinceSelect = el('select', { id: 'region-province' }, ...PROVINCES.map(item => el('option', { value: item }, item)));
      provinceSelect.value = provinceId;
      provinceSelect.addEventListener('change', () => { provinceId = provinceSelect.value; regionId = ''; renderRegion(); markDirty(); });
      nodes.push(field('所属省 / 直辖市', provinceSelect));
    }
    if (scale === 'custom') {
      const input = el('input', { id: 'project-region', maxlength: 120, value: regionId, placeholder: '例如：某某产业园区（清单未收录）' });
      input.addEventListener('input', () => { regionId = input.value; markDirty(); });
      const kept = storedUnknownRegion;
      nodes.push(field('研究地区', input, el('small', {}, (kept ? '原地区值不在离线清单中：保留原值，未做迁移或改写；' : '') + '自定义名称不会自动获得行政归属或数据可用性认证；清单只收录京津冀口径，不预置任何园区。'), true));
    } else {
      const options = optionsForScale(scale, provinceId);
      const select = el('select', { id: 'project-region' }, el('option', { value: '' }, '请选择范围'), ...options.map(value => el('option', { value }, value)));
      if (options.includes(regionId)) select.value = regionId;
      select.addEventListener('change', () => { regionId = select.value; markDirty(); });
      nodes.push(field('研究地区', select));
    }
    regionBlock.replaceChildren(...nodes);
    syncDraftName();
    geo?.setActive();
  }

  const yearsBlock = el('div', { class: 'years-block' });
  const yearsText = el('input', { id: 'project-years', placeholder: '例如：2026, 2030, 2035', 'aria-describedby': 'years-help' });
  // The text shortcut is authoritative only while the user is actually editing it;
  // otherwise a stale draft there would silently block the one primary action.
  // It applies on the explicit button only: re-rendering on blur would move the
  // controls under the pointer between mousedown and mouseup and swallow the click.
  let textEdited = false;
  const applyText = () => {
    const parsed = parseYearList(yearsText.value);
    if (!parsed.ok) { yearsText.setAttribute('aria-invalid', 'true'); setStatus(parsed.message, 'error'); return false; }
    yearsText.removeAttribute('aria-invalid');
    textEdited = false;
    years = parsed.years; renderYears(); markDirty();
    setStatus('已将文本年份应用到研究年份：' + (years.join(' / ') || '尚未选择年份'), '');
    return true;
  };
  yearsText.addEventListener('input', () => { textEdited = true; });

  function renderYears() {
    const target = el('select', { id: 'target-year' }, el('option', { value: '' }, '请选择目标年'), ...TARGET_YEARS.map(year => el('option', { value: String(year) }, String(year))));
    target.addEventListener('change', () => {
      if (!target.value) return;
      if (years.includes(Number(target.value))) { setStatus('年份不重复：' + target.value + ' 已在研究年份中。', 'error'); return; }
      years = addYears(years, [target.value]); renderYears(); markDirty();
    });
    const other = el('input', { id: 'other-year', maxlength: 4, placeholder: YEAR_MIN + '—' + YEAR_MAX });
    other.addEventListener('input', markDirty);
    const add = el('button', { class: 'button secondary', type: 'button', onclick: () => {
      const check = checkYear(other.value);
      if (!check.ok) { other.setAttribute('aria-invalid', 'true'); setStatus(check.message, 'error'); return; }
      other.removeAttribute('aria-invalid');
      if (years.includes(check.year)) { setStatus('年份不重复：' + check.year + ' 已在研究年份中。', 'error'); return; }
      years = addYears(years, [check.year]); renderYears(); markDirty();
    } }, '添加年份');
    const chips = el('div', { class: 'chips' }, ...(years.length ? years.map(year => el('button', { class: 'chip', type: 'button', 'aria-label': '移除年份 ' + year, onclick: () => { years = removeYear(years, year); renderYears(); markDirty(); } }, String(year), el('span', { 'aria-hidden': 'true' }, ' ×'))) : [el('span', { class: 'muted' }, '尚未选择年份')]));
    // 首屏只留年份 chip；目标年、其他年份与多时点都收进「调整年份」。
    // 年份文本快捷输入也移进「调整年份」：首页只留 chip 与一个折叠入口。
    const adjust = el('details', { class: 'home-years-adjust' }, el('summary', {}, '调整年份'),
      el('div', { class: 'form-grid' }, field('目标年', target), field('其他年份', other)),
      el('div', { class: 'actions' }, add),
      el('div', { class: 'form-grid' }, field('研究年份', yearsText)),
      el('div', { class: 'actions' }, el('button', { class: 'button secondary', type: 'button', onclick: applyText }, '应用文本年份')),
      rangeDetails);
    yearsBlock.replaceChildren(
      el('div', { class: 'years-row' },
        el('span', { class: 'years-cap' }, '研究年份'), chips,
        defaultYears ? el('span', { class: 'muted' }, '默认 2030 / 2035') : null),
      adjust);
    if (document.activeElement !== yearsText && !textEdited) { yearsText.value = years.join(', '); yearsText.removeAttribute('aria-invalid'); }
    syncDraftName();
  }

  // Load the draft from a stored project. Used at mount and whenever a new-scenario
  // draft is abandoned, so "go back to the stored project" never needs a reload.
  function applyDraft(current, { render = true } = {}) {
    scale = scaleForRegion(current.scope.regionId);
    provinceId = provinceForRegion(current.scope.regionId) || (PROVINCES.includes(current.scope.regionId) ? current.scope.regionId : PROVINCES[2]);
    regionId = current.scope.regionId || '';
    defaultYears = current.scope.years.length === 0;
    years = current.scope.years.length ? [...current.scope.years] : [2030, 2035];
    // A stored region that the offline list cannot express is preserved verbatim and
    // reported as unmigrated, instead of being silently rewritten or dropped.
    storedUnknownRegion = Boolean(current.scope.regionId) && scale === 'custom';
    textEdited = false;
    pendingNew = false;
    dirty = false;
    title.value = displayTitle(current.title);
    yearsText.value = years.join(', ');
    yearsText.removeAttribute('aria-invalid');
    if (render) { renderRegion(); renderYears(); }
  }

  const startYear = el('input', { id: 'range-start', maxlength: 4, placeholder: '起始年' });
  const endYear = el('input', { id: 'range-end', maxlength: 4, placeholder: '结束年' });
  const stepYear = el('input', { id: 'range-step', maxlength: 2, placeholder: '间隔' });
  const previewText = el('p', { class: 'muted' });
  const rangeDetails = el('details', { id: 'home-years-range' }, el('summary', {}, '多时点：按起止年与间隔添加'),
    el('div', { class: 'form-grid' }, field('起始年', startYear), field('结束年', endYear), field('间隔（年）', stepYear)),
    el('div', { class: 'actions' }, el('button', { class: 'button secondary', type: 'button', onclick: () => {
      const preview = rangePreview(startYear.value, endYear.value, stepYear.value);
      if (!preview.ok) { previewText.textContent = preview.message; previewText.className = 'muted error-text'; return; }
      const added = preview.years.filter(year => !years.includes(year));
      years = addYears(years, preview.years); renderYears(); markDirty();
      previewText.className = 'muted';
      previewText.textContent = '预览 ' + preview.years.join(' / ') + '；本次新增 ' + added.length + ' 个年份，不重复、不超出 ' + YEAR_MIN + '—' + YEAR_MAX + '。';
    } }, '预览并添加所选年份')), previewText);

  // Shared save used by the one primary action and by the expert text shortcut, so
  // both report the same validation and the same browser-persistence state. While a
  // new scenario is being drafted this is the moment it becomes an independent
  // project: a new id with empty factors, scores and selections, replacing the single
  // active project slot only after the write succeeded.
  function saveScope() {
    const raw = textEdited ? yearsText.value.trim() : '';
    let nextYears = years;
    if (raw) {
      const parsed = parseYearList(raw);
      if (!parsed.ok) { yearsText.setAttribute('aria-invalid', 'true'); setStatus(parsed.message, 'error'); return false; }
      yearsText.removeAttribute('aria-invalid');
      nextYears = parsed.years;
    }
    const nextRegion = (regionId || '').trim() || null;
    // 首页不再改名：项目名保持原值，改名入口在「保存与导出」。
    const nextTitle = pendingNew
      ? (suggestTitle(nextRegion, nextYears) || title.value.trim() || DEFAULT_NAME)
      : (title.value.trim() || current.title);
    if (pendingNew) return commitNewScenario({ title: nextTitle, scope: { regionId: nextRegion, years: nextYears } });
    const result = context.actions.updateProjectDetails({ title: nextTitle, scope: { regionId: nextRegion, years: nextYears } });
    if (!result.ok) { setStatus(result.error.message, 'error'); return false; }
    const persisted = context.persistenceState();
    context.notify(persisted.ok ? '项目范围已保存到浏览器' : '范围已更新，但尚未保存到浏览器');
    if (!persisted.ok) { setStatus('范围已更新到当前页面；浏览器保存失败，请下载备份。', 'error'); return false; }
    years = nextYears; regionId = nextRegion || ''; dirty = false; textEdited = false;
    setStatus('项目范围已保存到浏览器。', '');
    return true;
  }

  // Replace the active project with the drafted new one. The stored project is only
  // swapped after the new value passed the contract; if the browser cannot persist it
  // the original project is put back, so a failed save never costs the user their
  // project or the draft they were filling in.
  function commitNewScenario(draft) {
    const previous = context.store.read();
    const next = newScenarioProject({ id: crypto.randomUUID(), title: draft.title, scope: draft.scope, perspective: previous.view.perspective });
    const result = context.actions.replaceProject(next);
    if (!result.ok) { setStatus('新情景未建立：' + result.error.message, 'error'); return false; }
    if (!context.persistenceState().ok) {
      context.actions.replaceProject(previous);
      setStatus('新情景未能保存到浏览器，已恢复原项目；请先下载项目备份再重试。', 'error');
      return false;
    }
    years = draft.scope.years; regionId = draft.scope.regionId || ''; dirty = false; textEdited = false; pendingNew = false;
    renderNewState();
    // The notification states only what happened: the new scenario now is the project.
    // It deliberately claims nothing about the replaced project still being around.
    context.notify('已建立新情景项目。');
    setStatus('已建立独立的新情景项目（项目ID ' + next.id + '）：请继续选择关注因素。', '');
    return true;
  }

  const leaveDraft = () => !dirty || confirm('有未保存的范围修改。离开并放弃这些修改吗？');

  // Whether the stored project already holds something worth keeping. Used only to
  // decide what "continue" means and whether starting over needs a confirmation.
  function hasSavedWork() {
    const current = context.store.read();
    return Boolean(current.scope.regionId) || current.scope.years.length > 0 || current.data.taxonomy.length > 0 || current.title !== DEFAULT_TITLE;
  }

  // Starting over drafts a new scenario in front of the user: the stored project is
  // not touched until the draft is submitted. Cancelling the confirmation must leave
  // both the draft and the project exactly as they were, so nothing is touched before
  // the confirmation resolves.
  function startNewScenario() {
    if (pendingNew) { setStatus('已经在填写新情景；选择地区与年份后用主动作提交，或点「放弃新情景」。', ''); return false; }
    if ((dirty || hasSavedWork()) && !confirm('开始一个新情景会先在当前页面填写一个空白草稿。提交会替换当前的活动项目：本项目只保留一个活动项目槽位，被替换的项目不会自动留在任何地方。如需以后恢复当前项目，请先保存为命名方案或下载备份。提交之前，当前项目与草稿都不会被改动。继续吗？')) return false;
    dirty = false; textEdited = false; pendingNew = true;
    years = [2030,2035]; regionId = '京津冀'; scale = 'region'; provinceId = PROVINCES[2]; storedUnknownRegion = false;
    yearsText.value = ''; yearsText.removeAttribute('aria-invalid');
    renderRegion(); renderYears(); renderNewState();
    setStatus('正在填写新情景草稿。选好地区与年份后点主动作提交；提交前当前项目不会被改动。', '');
    return true;
  }

  // Abandon the drafted new scenario and put the stored project back in front of the
  // user, without a reload and without having ever changed the stored project.
  function discardNewScenario() {
    applyDraft(context.store.read());
    renderNewState();
    setStatus('已放弃新情景草稿；当前项目与已保存方案保持原样。', '');
  }

  // Continue means the stored project when there is one, and the saved-plan library
  // when there is not; neither path invents a result or skips a prerequisite.
  function continueExisting() {
    if (pendingNew) { discardNewScenario(); return; }
    if (!hasSavedWork()) { context.navigate('exports'); return; }
    if (leaveDraft()) context.navigate('elements');
  }

  // 地图应用地区：只改范围，不删评分、不改路径、不迁移数据；影响先讲清楚再写。
  function applyRegionToProject(scopeValue) {
    const current = context.store.read();
    const impact = regionImpact(current, scopeValue, { hasResults: Boolean(readRunSummary(context.store)) });
    if (!impact.changed) return { ok: true };
    if (pendingNew) {
      regionId = scopeValue; scale = scaleForRegion(scopeValue); storedUnknownRegion = false;
      const known = provinceForRegion(scopeValue); if (known) provinceId = known;
      renderRegion(); renderYears(); markDirty();
      return { ok: true };
    }
    if (!confirm(impact.lines.join('\n') + '\n\n不会删除任何记录；已完成的检验结果会标记为过期。继续应用吗？')) {
      return { ok: false, message: '已取消，研究地区保持「' + (current.scope.regionId || '未设置') + '」。' };
    }
    const nextYears = current.scope.years.length ? current.scope.years : [2030, 2035];
    const nextTitle = title.value.trim() || current.title;
    const result = context.actions.updateProjectDetails({ title: nextTitle, scope: { regionId: scopeValue, years: nextYears } });
    if (!result.ok) return { ok: false, message: '地区未应用：' + result.error.message };
    regionId = scopeValue; scale = scaleForRegion(scopeValue); storedUnknownRegion = false;
    const known = provinceForRegion(scopeValue); if (known) provinceId = known;
    years = [...nextYears]; textEdited = false; dirty = false;
    title.value = nextTitle; yearsText.value = years.join(', ');
    renderRegion(); renderYears(); renderNewState();
    setStatus('研究地区已设为「' + scopeValue + '」，年份 ' + (years.join(' / ') || '待设置') + '。下一步进入因素与年度方案。', '');
    const persisted = context.persistenceState();
    if (!persisted.ok) setStatus('地区已更新到当前页面，但浏览器保存失败，请下载项目备份。', 'error');
    return { ok: true };
  }

  // 首屏两条明确路径：自己的研究走 46 项目录由用户做主；示例体验是机制演示，载入前先讲清替换范围。
  const pathHost = el('div', { class: 'home-paths', 'aria-label': '开始方式' });
  function renderPaths() {
    const current = context.store.read();
    const startOwn = () => {
      if (pendingNew) { document.querySelector('#home-start-form')?.scrollIntoView({ block: 'center' }); return; }
      if (hasSavedWork()) { startNewScenario(); return; }
      const regionSelect = document.querySelector('#project-region');
      regionSelect?.focus();
      setStatus('先定研究地区与年份，然后点「继续：选择因素」；目录默认已是 46 项体系，勾选与评分都由你决定。', '');
    };
    const startDemo = () => {
      if (!leaveDraft()) return;
      const dialog = el('dialog', { class: 'reference-dialog home-demo-dialog', 'aria-label': '用示例体验完整流程' });
      const close = () => dialog.close();
      const hasWork = current.data.judgments.length > 0 || current.selection.descriptorIds.length > 0 || current.data.paths.length > 0;
      dialog.append(
        el('div', { class: 'reference-hd' }, el('h3', {}, '用示例体验完整流程'), el('button', { class: 'button text', type: 'button', onclick: close }, '关闭')),
        el('div', { class: 'reference-body' },
          el('p', { class: 'reference-tag' }, '机制演示：全部数据是软件机制示例，不代表真实政策。'),
          el('dl', { class: 'reference-meta' },
            el('div', {}, el('dt', {}, '示例包含'), el('dd', {}, '2 个因素（工业节能改造强度 × 单位产品能耗限额强度）、2030 / 2035 两个年度状态、两个方向共 18 格完整评分，评分已随示例采用；进入检验页确认一次检验假设、点「开始检验」，即可算出 9 个组合（2 个自洽、7 个冲突）并逐项解释。')),
            el('div', {}, el('dt', {}, '会替换什么'), el('dd', {}, '当前项目的名称、地区、年份、因素、状态与评分——本项目只有一个活动项目槽位，被替换的内容不会自动保留。')),
            el('div', {}, el('dt', {}, '如何保住当前项目'), el('dd', {}, '先下载项目备份，或到「保存与导出」存为命名方案。'))),
          hasWork ? null : el('p', { class: 'reference-note' }, '当前项目还是空的，直接载入不会丢失任何内容。'),
          el('div', { class: 'reference-actions' },
            el('button', { class: 'button', type: 'button', onclick: context.exportProject }, '先下载当前项目备份'),
            el('button', { class: 'button primary-action', type: 'button', onclick: () => { close(); if (context.loadGuidedDemo()) { context.navigate('solver'); } } }, '载入示例并去检验'),
            el('button', { class: 'button text', type: 'button', onclick: close }, '取消'))));
      document.body.append(dialog);
      dialog.addEventListener('close', () => dialog.remove());
      dialog.showModal();
    };
    pathHost.replaceChildren(
      el('button', { class: 'home-path', type: 'button', onclick: startOwn },
        el('strong', {}, '开始自己的研究'),
        ),
      el('span', { class: 'home-path-or', 'aria-hidden': 'true' }, '或'),
      el('button', { class: 'home-path', type: 'button', onclick: startDemo },
        el('strong', {}, '用示例体验完整流程'),
        el('span', { class: 'home-path-badge' }, '机制演示'),
        ));
  }
  // Start-new and continue stay visible with no disclosure: the first screen must say
  // what happens to the existing project before anything is replaced. Kept to one
  // compact row so the single primary action still fits the 1280x800 first screen.
  const choiceHost = el('div', { class: 'home-choice' });
  // The replacement consequence and the way to keep the original project must be on
  // screen before the new scenario is submitted, not only inside the confirmation.
  const newDraftBlock = el('div', { id: 'home-new-draft', class: 'notice', hidden: true });
  const primaryButton = el('button', { class: 'button primary-action', type: 'submit', 'data-home-primary': '' }, '继续：选择因素');
  function renderNewState() {
    const current = context.store.read();
    choiceHost.replaceChildren(
      el('button', { class: 'button secondary', type: 'button', onclick: startNewScenario }, pendingNew ? '重新开始填写新情景' : '开始一个新情景'),
      el('button', { class: 'button secondary', type: 'button', onclick: continueExisting }, pendingNew ? '放弃新情景，继续已有方案' : '继续已有方案'),
      el('small', { class: 'muted' }, pendingNew
        ? '新情景草稿'
        : displayTitle(current.title) + '（' + rangeSummary(current.scope.regionId, current.scope.years) + '）'));
    primaryButton.textContent = pendingNew ? '建立新情景并继续：选择因素' : '继续：选择因素';
    // While a new scenario is being drafted the decorative progress strip yields its
    // space to the replacement notice, so the one primary action stays on screen.
    container.classList.toggle('home-pending', pendingNew);
    newDraftBlock.hidden = !pendingNew;
    if (!pendingNew) { newDraftBlock.replaceChildren(); return; }
    newDraftBlock.replaceChildren(
      el('p', {}, '提交会替换当前的活动项目「' + displayTitle(current.title) + '」：本项目只保留一个活动项目槽位。新情景是新的项目ID，因素、评分与选择为空；被替换的项目不会自动留在任何地方，如需以后恢复，请先保存为命名方案或下载备份。提交之前，当前项目与草稿都不会被改动。'),
      el('div', { class: 'actions' },
        el('button', { class: 'button secondary', type: 'button', onclick: context.exportProject }, '下载原项目备份'),
        el('button', { class: 'button secondary', type: 'button', onclick: () => context.navigate('exports') }, '打开我的方案与历史（先保存原方案）'),
        el('button', { class: 'button text', type: 'button', onclick: discardNewScenario }, '放弃新情景草稿')));
  }
  const choiceBlock = choiceHost;

  // Where and when come first so the one primary action stays inside the 1280x800
  // first screen; the name is editable but secondary, and the provenance of the
  // offline region list is stated on screen with its full detail one click away.
  const form = el('form', { id: 'home-start-form' },
    regionBlock, yearsBlock,
    el('div', { class: 'actions' }, primaryButton), status);

  const geoSection = el('section', { class: 'geo-panel', 'aria-labelledby': 'geo-title' },
    el('h3', { id: 'geo-title' }, '在地图上选地区'),
    );
  geo = mountMap(geoSection, context, {
    getScope: () => regionId || null,
    hasResults: Boolean(readRunSummary(context.store)),
    onApply: applyRegionToProject
  });
  // 首屏只做一件事：定哪里、哪一年。地图占主区，范围表单在右侧窄栏。
  container.append(
    pathHost,
    choiceBlock,
    newDraftBlock,
    el('div', { class: 'home-start-grid' }, geoSection, form),
    title);

  applyDraft(project); renderNewState(); renderPaths();

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!saveScope()) return;
    context.navigate('elements');
  });

  const unload = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', unload);
  return { dispose: () => {window.removeEventListener('beforeunload', unload);}, canLeave: () => !dirty || confirm('有未保存的范围修改。离开并放弃这些修改吗？') };
}
