import { el } from '../../core/ui.mjs';
import { ambitionOf, setAmbition, moveInOrder, directionOf, DIRECTIONS } from './ambition.mjs';

// current 基准与政策雄心：基准年状态 + 档位顺序，都由使用者标注。
// 「降低能耗」也可能是更紧的雄心，所以方向绝不按数值大小自动推。
export function ambitionPanel(project, descriptorId, context, rerender) {
  const descriptor = project.data.descriptors.find(d => d.id === descriptorId);
  const states = (descriptor?.stateIds || []).map(id => project.data.states.find(s => s.id === id)).filter(Boolean);
  const box = el('section', { class: 'ambition-panel', 'aria-label': '基准与雄心档位' });
  const message = el('p', { class: 'ambition-msg', role: 'status' });
  if (!descriptor || states.length < 2) return box;
  const a = ambitionOf(descriptor);
  box.append(el('div', { class: 'ambition-hd' }, el('h3', {}, '基准与雄心'),
    el('span', { class: 'v5-tag ' + (a.baselineStateId ? 'ok' : 'warn') }, a.baselineStateId ? '已设基准' : '未设基准')));

  if (a.baselineStateId) {
    const base = states.find(s => s.id === a.baselineStateId);
    box.append(el('p', { class: 'ambition-line' },
      el('span', { class: 'k' }, 'current 基准'),
      el('strong', {}, (a.baseYear ? a.baseYear + ' 年 · ' : '') + base.label),
      el('span', { class: 'v5-hint' }, '（' + (a.source === 'user-assumption' ? '你标注的用户假设' : '来源未标注') + '）')));
    const byDir = { back: [], hold: [], more: [] };
    for (const s of states) { const d = directionOf(descriptor, s.id); if (d) byDir[d].push(s.label); }
    box.append(el('ul', { class: 'ambition-tiers' }, ...DIRECTIONS.map(d => el('li', { class: 'tier ' + d.id },
      el('span', { class: 'lab' }, d.label), el('span', { class: 'val' }, (byDir[d.id] || []).join('、') || '—'),
      el('span', { class: 'v5-hint' }, d.note)))));
    if (!a.explicit) box.append();
  } else {
    box.append();
  }

  const editor = el('details', { class: 'ambition-editor' }, el('summary', {}, a.baselineStateId ? '修改基准与档位顺序' : '设置基准与档位顺序'));
  const baseSelect = el('select', { 'aria-label': '基准状态' }, el('option', { value: '' }, '不设基准'), ...states.map(s => el('option', { value: s.id }, s.label)));
  baseSelect.value = a.baselineStateId || '';
  const yearInput = el('input', { type: 'number', min: '1900', max: '2300', 'aria-label': '基准年', placeholder: '基准年（可空）', value: a.baseYear ?? '' });
  let order = [...a.order];
  const list = el('ol', { class: 'ambition-order' });
  const paintOrder = () => {
    list.replaceChildren(...order.map((id, i) => {
      const s = states.find(x => x.id === id);
      return el('li', {}, el('span', { class: 'nm' }, s?.label || id),
        el('button', { class: 'button text', 'aria-label': '上移 ' + (s?.label || id), disabled: i === 0, onclick: () => { order = moveInOrder(order, i, -1); paintOrder(); } }, '↑'),
        el('button', { class: 'button text', 'aria-label': '下移 ' + (s?.label || id), disabled: i === order.length - 1, onclick: () => { order = moveInOrder(order, i, 1); paintOrder(); } }, '↓'));
    }));
  };
  paintOrder();
  editor.append(    el('label', {}, '基准状态 ', baseSelect), el('label', {}, '基准年 ', yearInput), list,
    el('button', { class: 'button', onclick: () => {
      try {
        const next = setAmbition(context.store.read(), descriptorId, { baselineStateId: baseSelect.value || null, baseYear: yearInput.value ? Number(yearInput.value) : null, order });
        const r = context.actions.replaceProject(next);
        if (!r.ok) throw new Error(r.error.message);
        message.textContent = '基准与档位已保存。';
        rerender();
      } catch (error) { message.textContent = '未保存：' + error.message; }
    } }, '保存基准与档位'));
  box.append(editor, message);
  return box;
}
