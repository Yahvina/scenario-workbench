import { el } from '../../core/ui.mjs';
import { STEEL_FORMAT, STEEL_MAX_BYTES, STEEL_OPERATIONS, readSteelXml, steelTargets, describeSteelTarget, findSteelCommodity, verifySteelRequest } from './steel-overlay.mjs';

export function steelOverlayPanel(container) {
  let alive = true, revision = 0, result = null, rows = [];
  const files = { steel: null, unit: null }, tokens = { steel: 0, unit: 0 }, loading = { steel: false, unit: false };
  const root = el('details', { class: 'exports-card steel-overlay', 'data-steel-overlay': '' });
  const status = el('p', { role: 'status', 'aria-live': 'polite', 'data-steel-status': '' }, '请选择钢铁工艺输入XML。');
  const sourceNote = el('p', { class: 'steel-file-note', 'data-steel-source': '' });
  const unitNote = el('p', { class: 'steel-file-note', 'data-steel-unit-source': '' });
  const targetNote = el('p', { 'data-steel-target': '' }, '选齐目标节点后显示原值与单位。');
  const valueNote = el('p', { 'data-steel-written': '' });
  const xmlPreview = el('pre', { 'data-steel-xml': '' });
  const auditPreview = el('pre', { 'data-steel-audit': '' });
  const fields = [['region', '模型地区'], ['subsector', '工艺类别'], ['technology', '工艺名称'], ['year', '新增技术年份'], ['input', '投入项']];
  const selects = {};
  const grid = el('div', { class: 'steel-grid' });
  for (const [key, label] of fields) {
    const select = el('select', { 'aria-label': '钢铁覆盖' + label, onchange: () => {
      const index = fields.findIndex(row => row[0] === key);
      for (const [downstream] of fields.slice(index + 1)) selects[downstream].value = '';
      populate(); invalidate('目标已变更，请重新核验。', true); describe();
    } });
    selects[key] = select;
    grid.append(el('label', {}, label, select));
  }
  const operation = el('select', { 'aria-label': '钢铁系数操作', onchange: () => {
    formula.textContent = STEEL_OPERATIONS.find(row => row.id === operation.value)?.formula || '请选择明确的数值含义。';
    invalidate('操作已变更，请重新核验。');
  } }, el('option', { value: '' }, '请选择操作含义'), ...STEEL_OPERATIONS.map(row => el('option', { value: row.id }, row.label)));
  const value = el('input', { type: 'number', step: 'any', min: '0', 'aria-label': '钢铁系数操作数值', oninput: () => invalidate('数值已变更，请重新核验。') });
  const formula = el('p', { class: 'steel-formula' }, '请选择明确的数值含义。');
  const confirm = el('input', { type: 'checkbox', onchange: () => invalidate('请核验当前选择。') });
  const verify = el('button', { type: 'button', class: 'button primary-action', disabled: true, onclick: generate }, '核验并预览覆盖文件');
  const downloads = [
    ['下载覆盖XML（工程测试）', 'steel-overlay.engineering.xml', 'application/xml', () => result.xml],
    ['下载核验记录', 'steel-overlay.audit.json', 'application/json', () => JSON.stringify(result.audit, null, 2)],
    ['下载组件请求JSON', 'steel-overlay.request.json', 'application/json', () => JSON.stringify(result.request, null, 2)]
  ].map(([label, name, mime, content]) => el('button', { type: 'button', class: 'button', disabled: true, onclick: () => {
    if (!result || loading.steel || loading.unit || !alive) return;
    const url = URL.createObjectURL(new Blob([content()], { type: mime }));
    const link = el('a', { href: url, download: name }); link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } }, label));
  const sourceInput = fileInput('steel', '钢铁工艺输入XML');
  const unitInput = fileInput('unit', '投入商品单位证明XML');
  root.append(
    el('summary', {}, '钢铁系数覆盖（工程测试）'),
    el('p', {}, '在本机核对XML并生成单项覆盖文件。不自动把CIB状态换算为参数，也不运行GCAM；研究映射仍未经审定。'),
    el('div', { class: 'steel-grid' },
      el('label', {}, '1. 钢铁工艺输入XML', sourceInput),
      el('label', {}, '单位证明XML（原文件含相应商品单位时可不选）', unitInput)),
    sourceNote, unitNote,
    el('button', { class: 'button', type: 'button', onclick: () => {
      tokens.unit++; files.unit = null; loading.unit = false; unitInput.value = ''; unitNote.textContent = '';
      invalidate('已移除额外单位证明，请重新核验。', true); describe();
    } }, '移除额外单位证明'),
    el('h3', {}, '2. 选择要覆盖的一个节点'), grid, targetNote,
    el('h3', {}, '3. 指定操作与数值'),
    el('div', { class: 'steel-grid' }, el('label', {}, '操作含义', operation), el('label', {}, '数值（百分比填5表示5%；倍率填0.95表示乘以0.95）', value)),
    formula,
    el('label', { class: 'steel-confirm' }, confirm, '我已核对所选目标和显示的原系数，仅用于工程测试'),
    verify, status, valueNote,
    el('div', { class: 'steel-downloads' }, ...downloads),
    el('details', { class: 'steel-preview' }, el('summary', {}, '查看覆盖XML与核验记录'), xmlPreview, auditPreview),
    el('p', { class: 'steel-boundary' }, '所选年份指该年新增的那批技术；这批技术后续继续运行时，修改可能延续。单项投入不等于全行业综合能耗，权重不等于工艺占比。覆盖文件需在所有修改同一节点的基础组件之后加载。'),
    el('p', { class: 'steel-boundary' }, '文件仅用于当前页面的本地核验，不上传、不写入项目备份。切换页面后需重新选择；可下载核验记录和组件请求留档。独立组件复跑时，请求JSON须与对应输入XML放在同一目录。')
  );
  container.append(root);
  populate();

  function invalidate(message, resetConfirmation = false) {
    revision++; result = null;
    if (resetConfirmation) confirm.checked = false;
    xmlPreview.textContent = ''; auditPreview.textContent = ''; valueNote.textContent = '';
    for (const button of downloads) button.disabled = true;
    verify.disabled = !files.steel || loading.steel || loading.unit;
    status.textContent = message;
  }
  function target() {
    return { sector: 'iron and steel', ...Object.fromEntries(fields.map(([key]) => [key, key === 'year' ? Number(selects[key].value) : selects[key].value])) };
  }
  function populate() {
    let candidates = rows;
    for (const [key, label] of fields) {
      const select = selects[key], previous = select.value;
      const values = [...new Set(candidates.map(row => row[key]))].filter(v => typeof v === 'string' && v.length);
      values.sort(key === 'year' ? (a, b) => Number(a) - Number(b) : undefined);
      select.replaceChildren(el('option', { value: '' }, '请选择' + label), ...values.map(v => el('option', { value: v }, v)));
      select.value = values.includes(previous) ? previous : values.length === 1 ? values[0] : '';
      select.disabled = !values.length;
      candidates = candidates.filter(row => row[key] === select.value);
    }
  }
  function selectionInfo() {
    if (fields.some(([key]) => !selects[key].value)) throw new Error('请先选齐地区、工艺、年份和投入项。');
    const selected = target(), info = describeSteelTarget(files.steel, selected);
    const proof = findSteelCommodity([files.steel, files.unit], selected, info.market);
    return { selected, info, proof };
  }
  function describe() {
    try {
      const { selected, info, proof } = selectionInfo();
      targetNote.textContent = `${selected.region} / ${selected.subsector} / ${selected.technology} / ${selected.year} / ${selected.input}：原系数 ${info.baseline} ${proof.unit}/Mt；单位证明来自 ${proof.file.name}，投入市场 ${info.market}。`;
    } catch (error) { targetNote.textContent = error.message; }
  }
  function fileInput(role, label) {
    const input = el('input', { type: 'file', accept: '.xml,application/xml,text/xml', 'aria-label': label, onchange: async () => {
      const token = ++tokens[role]; files[role] = null;
      if (role === 'steel') { rows = []; populate(); }
      const note = role === 'steel' ? sourceNote : unitNote;
      note.textContent = ''; loading[role] = true;
      invalidate('正在读取并核对文件…', true); describe();
      try {
        const file = input.files[0];
        if (!file) throw new Error('尚未选择文件。');
        if (file.size > STEEL_MAX_BYTES) throw new Error('XML文件超过128 MiB。');
        const parsed = await readSteelXml(file.name, await file.arrayBuffer());
        if (!alive || token !== tokens[role]) return;
        if (role === 'steel') {
          const nextRows = steelTargets(parsed);
          if (!nextRows.length) throw new Error('文件中没有钢铁stub-technology投入节点。');
          rows = nextRows;
        }
        files[role] = parsed;
        note.textContent = `${parsed.name} · ${parsed.bytes.toLocaleString()}字节 · SHA256 ${parsed.sha256}`;
        if (role === 'steel') populate();
        loading[role] = false;
        invalidate('文件已读取，请选择目标并核验。', true); describe();
      } catch (error) {
        if (!alive || token !== tokens[role]) return;
        loading[role] = false;
        invalidate('文件未采用：' + error.message, true); describe();
      }
    } });
    return input;
  }
  async function generate() {
    invalidate('正在核验当前选择…');
    const token = revision;
    try {
      if (loading.steel || loading.unit || !files.steel) throw new Error('请等待文件读取完成。');
      if (!confirm.checked) throw new Error('请先核对目标和原系数，并勾选工程测试确认。');
      const { selected, info, proof } = selectionInfo();
      if (value.value.trim() === '') throw new Error('操作数值尚未填写，空值不当作0。');
      const source = files.steel, commodity = proof.file;
      const request = {
        format: STEEL_FORMAT, version: 1, testOnly: true,
        source: { path: source.name, sha256: source.sha256 },
        target: { ...selected, expectedBaseline: info.baseline, unit: proof.unit + '/Mt' },
        commodity: { path: commodity.name, sha256: commodity.sha256, region: info.market, kind: proof.kind, name: selected.input },
        operation: { kind: operation.value, value: Number(value.value) }
      };
      const candidate = await verifySteelRequest(request, source, commodity);
      if (!alive || token !== revision) return;
      result = candidate;
      xmlPreview.textContent = result.xml; auditPreview.textContent = JSON.stringify(result.audit, null, 2);
      valueNote.textContent = `核验结果：${info.baseline} → ${result.audit.writtenCoefficient} ${result.audit.coefficientUnit}，仅写入所选新增技术的一个投入系数。`;
      status.textContent = '工程核验通过，可以下载。研究映射未经审定，尚未运行GCAM。';
      for (const button of downloads) button.disabled = false;
    } catch (error) {
      if (alive && token === revision) status.textContent = '未生成：' + error.message;
    }
  }
  return () => {
    alive = false; revision++; tokens.steel++; tokens.unit++;
    files.steel = null; files.unit = null; rows = []; result = null; root.remove();
  };
}
