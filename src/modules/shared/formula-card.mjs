import { el } from '../../core/ui.mjs';

const STATUS = { implemented: ['已实现', 'ok'], partial: ['部分实现', 'warn'], blocked: ['依赖未满足', 'warn'], pending: ['方法待核', 'warn'], missing: ['未接入', 'bad'] };

export function formulaStatus(f) {
  if (f.id === 'prob') return 'missing';
  if (f.id === 'ahp-cib') return 'pending';
  if (f.id === 'aggregate') return 'partial';
  return 'implemented';
}

export function formulaCard(f, ctx = {}, { open = false } = {}) {
  const status = formulaStatus(f);
  const [label, cls] = STATUS[status];
  const substituted = f.substitute(ctx);
  const box = el('details', { class: 'v5-formula', id: 'formula-' + f.id, open });
  box.append(el('summary', {}, el('span', { class: 'v5-formula-name' }, f.title),
    el('span', { class: 'v5-tag ' + cls }, label)));
  const body = el('div', { class: 'v5-formula-body' });
  body.append(el('p', { class: 'v5-hint' }, f.meaning));
  body.append(el('div', { class: 'v5-formula-expr' }, f.expr));
  if (f.symbols?.length) body.append(el('table', { class: 'v5-table v5-formula-sym' },
    el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, '符号'), el('th', { scope: 'col' }, '含义'))),
    el('tbody', {}, ...f.symbols.map(([sym, text]) => el('tr', {}, el('td', {}, el('code', {}, sym)), el('td', {}, text))))));
  if (substituted) body.append(el('div', { class: 'v5-formula-sub' }, el('span', { class: 'cap' }, '本次代入'), el('p', {}, substituted)));
  else body.append(el('div', { class: 'v5-formula-sub is-empty' }, el('span', { class: 'cap' }, '本次代入'),
    el('p', {}, status === 'missing' ? '没有概率模型与先验，这里不给示例数字。' : status === 'pending' ? '原论文公式尚未核实，这里不给代入结果。' : '当前还没有可代入的完整输入。')));
  body.append(el('dl', { class: 'v5-formula-meta' },
    el('div', {}, el('dt', {}, '出处'), el('dd', {}, f.source)),
    el('div', {}, el('dt', {}, '代码位置'), el('dd', {}, el('code', {}, f.code))),
    el('div', {}, el('dt', {}, '不能用来'), el('dd', {}, f.notFor))));
  box.append(body);
  return box;
}

export function formulaInline(f, ctx = {}) {
  const sub = f.substitute(ctx);
  const status = formulaStatus(f);
  const box = el('div', { class: 'v5-formula-inline' },
    el('div', { class: 'expr' }, f.expr),
    el('p', { class: 'v5-hint' }, f.meaning));
  if (sub) box.append(el('p', { class: 'sub' }, sub));
  else box.append(el('p', { class: 'v5-hint' }, status === 'missing' ? '未接入：没有概率模型与先验。' : '当前没有可代入的完整输入。'));
  return box;
}
