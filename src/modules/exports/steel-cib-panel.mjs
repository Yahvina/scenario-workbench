import { el } from '../../core/ui.mjs';
import { readRunArchive, subscribeRunSummary } from '../solver/index.mjs';
import { createLibrary } from '../workspace/saved-work.mjs';
import { LIBRARY_EVENT } from '../workspace/saved-work-panel.mjs';
import { verifySteelCibBundle } from './steel-cib-link.mjs';

export function steelCibPanel(context, changed) {
  const root = el('details', { class: 'steel-cib-link', 'data-steel-cib-link': '' });
  let options = [], alive = true;
  const source = el('select', { 'aria-label': '关联的CIB冻结结果', onchange: () => { scenario.value = ''; factor.value = ''; populate(); changed(); } });
  const scenario = el('select', { 'aria-label': '关联的完整自洽组合', onchange: () => { describe(); changed(); } });
  const factor = el('select', { 'aria-label': '关联的输入型因素', onchange: () => { describe(); changed(); } });
  const assumption = el('textarea', { rows: '3', maxlength: '4000', 'aria-label': '人工参数设定说明', oninput: changed });
  const regionNote = el('textarea', { rows: '2', maxlength: '4000', 'aria-label': 'CIB与模型地区对应说明', oninput: changed });
  const summary = el('p', { 'data-steel-cib-selection': '' });
  const inventory = el('p', { 'data-steel-cib-inventory': '' });
  root.append(el('summary', {}, '关联CIB情景与人工设定（可选）'),
    el('p', {}, '不关联时仍是独立参数工程测试。关联时保留完整冻结组合；参数值由你明确设定，系统只复核所选组合，不审定参数依据。'),
    el('label', {}, '冻结检验来源', source), inventory,
    el('div', { class: 'steel-grid' }, el('label', {}, '选择一个完整自洽组合', scenario), el('label', {}, '这项参数对应的输入型因素', factor)), summary,
    el('label', {}, '人工参数设定说明（为何给这个状态采用该操作与数值；仅工程假设也须写明）', assumption),
    el('label', {}, '地区对应说明（CIB地区与模型编码不同时必填，按未经审定的人工对应记录）', regionNote),
    el('p', { class: 'steel-boundary' }, '关联留档包含完整冻结评分、所选完整情景、人工说明及参数。它追溯历史结果，不表示当前项目已复算；全空间解数不在这里重新认证。'));
  function selected() { return options.find(row => row.id === source.value); }
  function populate() {
    const archive = selected()?.archive;
    const configs = archive?.RunResult?.status === 'completed' ? archive.RunResult.scenarios : [];
    const oldScenario = scenario.value, oldFactor = factor.value;
    scenario.replaceChildren(el('option', { value: '' }, '请选择完整组合'), ...configs.map((config, i) => el('option', { value: String(i) }, '组合 ' + (i + 1) + ' · ' + archive.RunInput.activeDescriptorIds.map(id => {
      const d = archive.projectInputSnapshot.data.descriptors.find(row => row.id === id);
      const state = archive.RunInput.stateDefinitions.find(row => row.id === config[id]);
      return (d?.label || id) + '=' + (state?.label || config[id]);
    }).join('；'))));
    scenario.value = configs[Number(oldScenario)] && oldScenario !== '' ? oldScenario : '';
    const factors = archive?.projectInputSnapshot.data.descriptors.filter(row => row.role === 'input' && archive.RunInput?.activeDescriptorIds.includes(row.id)) || [];
    factor.replaceChildren(el('option', { value: '' }, '请选择输入型因素'), ...factors.map(row => el('option', { value: row.id }, row.label)));
    factor.value = factors.some(row => row.id === oldFactor) ? oldFactor : '';
    scenario.disabled = !configs.length; factor.disabled = !factors.length;
    describe();
  }
  function describe() {
    const archive = selected()?.archive, index = scenario.value === '' ? -1 : Number(scenario.value), config = archive?.RunResult?.scenarios[index];
    if (!archive) { summary.textContent = '当前不关联CIB结果。'; return; }
    if (archive.RunResult?.status !== 'completed' || !archive.RunResult.scenarios.length) { summary.textContent = '该记录未完成或没有保留自洽组合，不能关联。'; return; }
    const id = factor.value, state = archive.RunInput.stateDefinitions.find(row => row.id === config?.[id]);
    summary.textContent = `冻结年份 ${archive.RunInput.year}，地区 ${archive.RunInput.scope.regionId}；` + (config ? '已选完整组合 ' + (index + 1) : '尚未选组合') + (state ? '；所选因素状态：' + state.label : '；尚未选因素') + '。参数仍须另行说明。';
  }
  function refresh() {
    if (!alive) return;
    const previous = source.value, previousArchive = JSON.stringify(selected()?.archive);
    const session = readRunArchive(context.store);
    options = session ? [{ id: 'session', label: '本会话冻结检验（可追溯历史，不代表当前有效）', archive: session }] : [];
    let failure = '';
    try {
      const library = createLibrary(window.localStorage).load();
      if (!library.ok) failure = library.error;
      else for (const item of library.bundle.runs) options.push({ id: 'saved:' + item.id, label: '已保存的冻结记录：' + item.name, archive: item.archive });
    } catch (error) { failure = error.message; }
    source.replaceChildren(el('option', { value: '' }, '不关联CIB结果（独立工程测试）'), ...options.map(row => el('option', { value: row.id }, row.label)));
    source.value = options.some(row => row.id === previous) ? previous : '';
    if (JSON.stringify(selected()?.archive) !== previousArchive) { scenario.value = ''; factor.value = ''; }
    inventory.textContent = failure ? '历史库未采用：' + failure : options.length ? '可选择冻结结果；多解时须显式选一个完整组合。' : '尚无冻结结果；可以先到检验页运行，也可继续独立参数测试。';
    populate(); changed();
  }
  const offStore = context.store.subscribe(refresh), offRun = subscribeRunSummary(refresh);
  window.addEventListener(LIBRARY_EVENT, refresh);
  refresh();
  return {
    root,
    isLinked: () => source.value !== '',
    getDraft() {
      if (source.value === '') return null;
      const archive = selected()?.archive;
      const index = scenario.value === '' ? -1 : Number(scenario.value);
      if (!archive || !Number.isInteger(index) || !archive.RunResult?.scenarios[index]) throw new Error('请选择要关联的完整自洽组合。');
      return { archive: structuredClone(archive), configuration: structuredClone(archive.RunResult.scenarios[index]), descriptorId: factor.value, assumptionText: assumption.value, regionNote: regionNote.value };
    },
    dispose() { alive = false; offStore(); offRun(); window.removeEventListener(LIBRARY_EVENT, refresh); root.remove(); }
  };
}

export function steelCibReopenPanel() {
  const root = el('details', { class: 'steel-cib-reopen', 'data-steel-cib-reopen': '' });
  const status = el('p', { role: 'status', 'aria-live': 'polite', 'data-steel-cib-reopen-status': '' }, '选择先前下载的关联留档，在本机核验并取回XML。');
  let token = 0, alive = true, verified = null;
  const download = el('button', { class: 'button', type: 'button', disabled: true, onclick: () => {
    if (!verified) return;
    const url = URL.createObjectURL(new Blob([verified.parameter.xml], { type: 'application/xml' }));
    el('a', { href: url, download: 'steel-overlay.linked.engineering.xml' }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } }, '取回留档中的XML');
  const file = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': '核验钢铁CIB关联留档', onchange: async () => {
    const version = ++token; verified = null; download.disabled = true; status.textContent = '正在核验关联留档…';
    try {
      const picked = file.files[0];
      if (!picked || picked.size > 8 * 1024 * 1024) throw new Error('文件缺失或超过8 MiB。');
      const candidate = await verifySteelCibBundle(JSON.parse(await picked.text()));
      if (!alive || token !== version) return;
      verified = candidate; download.disabled = false;
      status.textContent = `留档核验通过：${candidate.cib.year}年，${candidate.cib.factor.descriptorLabel}=${candidate.cib.factor.stateLabel}，系数写入${candidate.parameter.audit.writtenCoefficient}。已复核所选冻结组合；原模型源文件未重新读取，参数假设仍未经审定。`;
    } catch (error) { if (alive && token === version) status.textContent = '留档未采用：' + error.message; }
  } });
  root.append(el('summary', {}, '核验已下载的CIB关联留档'), file, status, download);
  return { root, dispose() { alive = false; token++; verified = null; root.remove(); } };
}
