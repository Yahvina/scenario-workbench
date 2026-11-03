import { el } from '../../core/ui.mjs';
import { variableColor } from '../../core/object-colors.mjs';
import { interpolate, draftOf, parseDraft, buildChange, chartDomain } from './logic.mjs';

const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, text = '') {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  node.textContent = text;
  return node;
}
export function mount(container, context) {
  const root = el('section', { class: 'timeline-module' });
  const message = el('p', { class: 'timeline-message', role: 'status', 'aria-live': 'polite' });
  const left = el('div', { class: 'timeline-variables', 'aria-label': '活动描述符' });
  const right = el('div', { class: 'timeline-editor' });
  root.append(el('h2', {}, '日历年实施路径'), el('p', {}, '设置所选变量随日历年份变化的路径，不表示因素间因果响应或动态预测。'), message, el('div', { class: 'timeline-layout' }, left, right));
  container.append(root);
  let descriptorId = null, pathId = null, original = null, draft = null, baseline = null, clean = '', drag = null, svg = null, disposed = false, saving = false;
  const dirty = () => !!draft && JSON.stringify(draft) !== clean;
  function canLeave() {
    if (dirty() || drag) { message.textContent = '有未保存修改，请先保存或取消，再切换变量、路径、页面或视角。'; return false; }
    return true;
  }
  function choose(id, path = null) {
    if (!canLeave()) return;
    descriptorId = id; pathId = path; load(); render();
  }
  function load() {
    const p = context.store.read();
    if (!p.selection.descriptorIds.includes(descriptorId)) descriptorId = p.selection.descriptorIds[0] || null;
    const paths = p.data.paths.filter(path => path.descriptorId === descriptorId);
    if (!paths.some(path => path.id === pathId)) pathId = paths.length === 1 ? paths[0].id : null;
    original = paths.find(path => path.id === pathId) || null;
    draft = original ? draftOf(original) : null;
    baseline = context.store.snapshot(); clean = JSON.stringify(draft);
  }
  function create() {
    if (!canLeave()) return;
    const p = context.store.read();
    original = null; pathId = null;
    draft = { unit: '', interpolation: 'none', points: [...p.scope.years].sort((a,b) => a-b).map(year => ({ year: String(year), value: '', stateId: null, origin: 'user-assumption', evidenceRefs: [] })) };
    clean = ''; baseline = context.store.snapshot(); render();
  }
  function save() {
    if (drag) return;
    try {
      if ([...right.querySelectorAll('input')].some(input => input.validity.badInput)) throw new Error('数值输入不完整或不是有限数字，空白才表示缺失');
      if (!context.store.isCurrent(baseline)) throw new Error('已保存输入已在其他操作中改变；请取消草稿并重新载入，避免覆盖');
      const next = buildChange(context.store.read(), original, draft, descriptorId, () => crypto.randomUUID());
      const savedId = original?.id || next.data.paths.at(-1)?.id;
      saving = true;
      const result = context.actions.replaceProject(next);
      saving = false;
      if (!result.ok) throw new Error(result.error.message + '；' + result.error.recoveryAction);
      pathId = savedId; load(); render();
      message.textContent = context.persistenceState().ok ? '路径已保存；修改记录可在来源中追踪。' : '路径已更新到当前页面，但浏览器保存失败；请到项目页下载备份，刷新会丢失本次修改。';
    } catch (error) { saving = false; message.textContent = '保存失败：' + error.message; }
  }
  function cancel() { stopDrag(true); load(); render(); message.textContent = '已取消未保存修改。'; }
  function edited(point, field, value) {
    point[field] = value;
    if (field === 'value' || field === 'year') { point.stateId = null; point.origin = 'user-assumption'; }
    message.textContent = '草稿未保存；数值/年份修改后的状态待核。';
    draw();
  }
  function sources(path, p) {
    const ids = [...new Set([...path.evidenceRefs, ...path.points.flatMap(point => point.evidenceRefs)])];
    return el('details', { class: 'timeline-sources' }, el('summary', {}, '路径来源与修改记录'),
      el('p', {}, '路径来源：' + path.provenance.origin + '；记录版本 ' + path.version),
      ...ids.map(id => {
        const e = p.data.evidence.find(item => item.id === id);
                if (!e) return el('p', {}, '缺少依据 ' + id);
        let record = null;
        if (e.kind === 'user-assumption') { try { record = JSON.parse(e.excerpt); } catch {} }
        const describe = path => path ? path.points.map(point => point.year + '=' + (point.value ?? '缺失') + '（' + point.origin + '）').join('；') || '无节点' : '新建路径';
        return el('article', {}, el('strong', {}, e.kind + ' · ' + e.sourceId), el('p', {}, e.locator),
          p.view.perspective === 'expert' ? el('p', { class: 'muted' }, '依据ID：' + e.id) : null,
          record?.after ? el('p', {}, '修改前：' + describe(record.before) + ' → 修改后：' + describe(record.after)) : el('p', {}, e.excerpt),
          record?.after ? el('details', {}, el('summary', {}, '完整修改记录（含原始出处）'), el('pre', {}, e.excerpt)) : null);
      }), !ids.length ? el('p', {}, '未关联依据。用户假设不等于已验证政策目标。') : null);
  }
  function render() {
    if (disposed) return;
    const p = context.store.read();
    left.replaceChildren(el('h3', {}, '已选描述符'));
    for (const id of p.selection.descriptorIds) {
      const d = p.data.descriptors.find(item => item.id === id);
      const button = el('button', { class: 'button timeline-variable', 'aria-pressed': id === descriptorId, 'data-descriptor': id, onclick: () => choose(id) },
        el('span', { class: 'variable-mark', style: '--variable-color:' + variableColor(id) }), d.label);
      left.append(button);
    }
    right.replaceChildren(); svg = null;
    if (!descriptorId) {
      right.append(el('p', {}, p.selection.nodeIds.length ? '已选分类尚无计算变量映射，请先配置描述符。' : '尚未选择计算变量。'), el('button', { class: 'button', onclick: () => context.navigate('elements') }, '返回描述符选择'));
      return;
    }
    const d = p.data.descriptors.find(item => item.id === descriptorId);
    right.append(el('h3', {}, d.label));
    if (!p.scope.years.length) {
      right.append(el('p', {}, '尚未指定研究年份，不创建假起止年份。'), el('button', { class: 'button', onclick: () => context.navigate('workspace') }, '返回项目范围设置'));
      return;
    }
    const paths = p.data.paths.filter(path => path.descriptorId === descriptorId);
    const picker = el('select', { id: 'timeline-path', onchange: e => {
      if (!canLeave()) { e.target.value = pathId || ''; return; }
      pathId = e.target.value || null; load(); render();
    } }, el('option', { value: '' }, paths.length > 1 ? '请选择路径（不自动指定权威路径）' : '选择已有路径'), ...paths.map(path => el('option', { value: path.id }, path.id + ' · v' + path.version)));
    picker.value = pathId || '';
    right.append(el('label', { for: 'timeline-path' }, '路径选择'), picker,
      el('button', { class: 'button', onclick: create }, '新建用户假设路径'));
    if (original && original.points.some(point => point.year < Math.min(...p.scope.years) || point.year > Math.max(...p.scope.years))) right.append(el('p', { class: 'warning-text' }, '包含研究年份范围外的原始节点，图表完整保留，不静默裁切。'));
    if (original && original.scope.regionId !== p.scope.regionId) right.append(el('p', { class: 'warning-text' }, '路径地区与项目范围不同，请核对适用性；未自动换算。'));
    if (!draft) { right.append(el('p', {}, paths.length ? '请选择一条路径查看；多条路径不自动合并。' : '该变量暂无路径，可创建用户假设。')); return; }
    const unit = el('input', { id: 'timeline-unit', 'aria-label': '单位', value: draft.unit, placeholder: '未指定', oninput: e => { draft.unit = e.target.value; draw(); } });
    const mode = el('select', { id: 'timeline-interpolation', 'aria-label': '插值方式', onchange: e => { draft.interpolation = e.target.value; draw(); } },
      el('option', { value: 'none' }, 'none · 仅锚点'), el('option', { value: 'linear' }, 'linear · 线性插值'), el('option', { value: 'step' }, 'step · 左端值保持'));
    mode.value = draft.interpolation;
    right.append(el('div', { class: 'timeline-settings' }, el('label', {}, '单位', unit), el('label', {}, '插值方式', mode)),
      el('p', { class: 'muted' }, '单位空白为未指定。空值不等于0；不外推，不跨缺失点插值，不自动推断定性状态。纵向拖动仅改草稿，点击保存后提交。窄屏图表可横向滚动查看全部年份。'));
    svg = svgEl('svg', { viewBox: '0 0 640 300', class: 'timeline-chart', tabindex: '0', role: 'img', 'aria-label': '日历年路径图，精确编辑请使用下方节点表' });
    svg.addEventListener('pointerdown', pointerDown);
    svg.addEventListener('pointermove', pointerMove);
    svg.addEventListener('pointerup', () => stopDrag(false));
    svg.addEventListener('pointercancel', () => stopDrag(true));
    svg.addEventListener('lostpointercapture', () => { if (drag) stopDrag(true); });
    right.append(el('div', { class: 'timeline-chart-frame', tabindex: '0', 'aria-label': '路径图区域，窄屏可横向滚动查看日历年份' }, svg));
    const table = el('table', { class: 'timeline-table' }, el('thead', {}, el('tr', {}, ...['年份', '数值', '状态 / 来源', '操作'].map(text => el('th', { scope: 'col' }, text)))));
    const tbody = el('tbody');
    draft.points.forEach((point, index) => {
      const year = el('input', { type: 'number', step: '1', min: '1900', max: '2300', value: point.year, 'aria-label': '节点' + (index + 1) + '年份', oninput: e => edited(point, 'year', e.target.value) });
      const value = el('input', { type: 'number', step: 'any', value: point.value, 'data-value-index': index, 'aria-label': '节点' + (index + 1) + '数值', oninput: e => { edited(point, 'value', e.target.value); stateText.textContent = '状态待核 · 用户假设'; } });
      const state = p.data.states.find(s => s.id === point.stateId);
      const stateText = el('span', {}, (state?.label || '状态待核') + ' · ' + ({ source: '原始锚点', 'user-assumption': '用户假设', interpolated: '派生插值' }[point.origin] || point.origin));
      year.addEventListener('input', () => { stateText.textContent = '状态待核 · 用户假设'; });
      tbody.append(el('tr', {}, el('td', { 'data-label': '年份' }, year), el('td', { 'data-label': '数值' }, value), el('td', { 'data-label': '状态/来源', 'data-state-index': index }, stateText), el('td', {}, el('button', { class: 'button', onclick: () => { draft.points.splice(index, 1); render(); } }, '删除节点' + (index + 1)))));
    });
    table.append(tbody); right.append(table,
      el('button', { class: 'button', onclick: () => { draft.points.push({ year: '', value: '', stateId: null, origin: 'user-assumption', evidenceRefs: [] }); render(); } }, '添加节点'),
      el('div', { class: 'timeline-save' }, el('button', { class: 'button', onclick: cancel }, '取消修改'), el('button', { class: 'button primary-action', onclick: save }, '保存路径')));
    if (original) {
      right.append(sources(original, p));
      if (p.view.perspective === 'expert') right.append(el('p', { class: 'muted' }, '变量ID：' + descriptorId + '；路径ID：' + original.id + '；版本：' + original.version));
    }
    draw();
  }
  function drawing() {
    const p = context.store.read(), parsed = parseDraft(draft, descriptorId, p.data.states);
    return { parsed, domain: chartDomain(p.scope.years, parsed.points) };
  }
  function draw() {
    if (!svg || !draft) return;
    svg.replaceChildren();
    right.querySelector('.timeline-preview')?.remove();
    try {
      const drawingState = drawing(), parsed = drawingState.parsed, a = drag?.domain || drawingState.domain;
      const x = y => 64 + (y - a.minX) / (a.maxX - a.minX) * 552;
      const y = v => 244 - (v - a.minY) / (a.maxY - a.minY) * 218;
      svg.append(svgEl('title', {}, '日历年路径，单位：' + (parsed.unit || '未指定')),
        svgEl('path', { d: 'M64 26V244H616', fill: 'none', stroke: 'var(--line)' }));
      const ticks = [...new Set([...context.store.read().scope.years, ...parsed.points.map(p => p.year)])].sort((a,b) => a-b);
      const labels = ticks.length <= 8 ? ticks : ticks.filter((_, i) => i === 0 || i === ticks.length-1 || i % Math.ceil(ticks.length/6) === 0);
      labels.forEach(year => svg.append(svgEl('text', { x: x(year), y: 268, 'text-anchor': 'middle' }, String(year))));
      svg.append(svgEl('text', { x: 616, y: 292, 'text-anchor': 'end' }, '日历年份'), svgEl('text', { x: 64, y: 16 }, parsed.unit || '单位未指定'));
      if (!a.hasValues) svg.append(svgEl('text', { x: 320, y: 130, 'text-anchor': 'middle' }, '暂无数值节点；空值不作0绘制'));
      else for (const v of [a.minY, (a.minY+a.maxY)/2, a.maxY]) svg.append(svgEl('text', { x: 58, y: y(v)+4, 'text-anchor': 'end' }, Number(v.toPrecision(4)).toString()));
      const color = variableColor(descriptorId);
      if (parsed.interpolation !== 'none') for (let i=1; i<parsed.points.length; i++) {
        const from=parsed.points[i-1], to=parsed.points[i];
        if (from.value === null || to.value === null) continue;
        const line = parsed.interpolation === 'step' ? `M${x(from.year)} ${y(from.value)}H${x(to.year)}V${y(to.value)}` : `M${x(from.year)} ${y(from.value)}L${x(to.year)} ${y(to.value)}`;
        svg.append(svgEl('path', { d: line, stroke: color, fill: 'none', 'stroke-width': 2, 'stroke-dasharray': '5 3', class: 'timeline-derived' }));
      }
      draft.points.forEach((point, index) => {
        if (String(point.value).trim() === '') return;
        svg.append(svgEl('circle', { cx: x(Number(point.year)), cy: y(Number(point.value)), r: 7, fill: 'var(--panel)', stroke: color, 'stroke-width': 3, 'data-point-index': index, class: 'timeline-point' }));
      });
      const old = right.querySelector('.timeline-preview'); old?.remove();
      const values = context.store.read().scope.years.map(year => {
        const result = interpolate(parsed, year);
        return year + '：' + (result?.value === null || !result ? '未定义' : Number(result.value.toPrecision(6))) + (result?.derived ? '（插值，状态未推断）' : result ? '（锚点）' : '');
      });
      svg.after(el('p', { class: 'timeline-preview muted' }, '研究年份预览 · ' + values.join('；')));
    } catch (error) { svg.append(svgEl('text', { x: 20, y: 100 }, '草稿无效：' + error.message)); }
  }
  function pointerDown(event) {
    const index = event.target.dataset.pointIndex;
    if (index === undefined || event.button !== 0) return;
    event.preventDefault();
    svg.focus();
    const { domain } = drawing();
    drag = { index: Number(index), before: structuredClone(draft.points[Number(index)]), domain, pointerId: event.pointerId };
    svg.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = svg.getBoundingClientRect();
    const pixelY = Math.min(244, Math.max(26, (event.clientY - rect.top) / rect.height * 300));
    const a = drag.domain, point = draft.points[drag.index];
    point.value = String(Number((a.minY + (244-pixelY)/218*(a.maxY-a.minY)).toPrecision(8)));
    point.stateId = null; point.origin = 'user-assumption';
    right.querySelector('[data-value-index="' + drag.index + '"]').value = point.value;
    right.querySelector('[data-state-index="' + drag.index + '"]').textContent = '状态待核 · 用户假设';
    message.textContent = '拖动草稿未保存；点击保存路径提交，取消修改可还原。';
    draw();
  }
  function stopDrag(restore) {
    if (!drag) return;
    const active = drag; drag = null;
    if (restore) draft.points[active.index] = active.before;
    if (svg?.hasPointerCapture(active.pointerId)) svg.releasePointerCapture(active.pointerId);
    if (restore && !disposed) render();
  }
  function beforeUnload(event) { if (dirty()) { event.preventDefault(); event.returnValue = ''; } }
  function keydown(event) { if (event.key === 'Escape' && drag) { event.preventDefault(); stopDrag(true); } }
  root.addEventListener('keydown', keydown);
  window.addEventListener('beforeunload', beforeUnload);
  const unsubscribe = context.store.subscribe(() => {
    if (saving || disposed) return;
    if (dirty()) { message.textContent = '项目输入已变化；草稿保留，请取消后重载再保存。'; return; }
    load(); render();
  });
  load(); render();
  return { canLeave, dispose() { disposed = true; stopDrag(true); unsubscribe(); window.removeEventListener('beforeunload', beforeUnload); root.remove(); } };
}
