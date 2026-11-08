// AHP 重要性判断：两两比较 → 权重 → 一致性。只做对照，不改关系评分、不覆盖 CIB。
import { el, infoTip } from '../../core/ui.mjs';
import { buildMatrix, priorityVector, consistency, rankedWeights, SCALE_LABELS, SAATY_VALUES, RI_TABLE } from './logic.mjs';

const MAX_FACTORS = 8;

export function mount(container, context) {
  const root = el('section', { class: 'importance-module', 'aria-labelledby': 'importance-title' });
  container.append(root);

  const project = context.store.read();
  const ids = [...project.selection.descriptorIds].slice(0, MAX_FACTORS);
  const labels = Object.fromEntries(project.data.descriptors.map(d => [d.id, d.label]));
  const pairs = {};
  let resultHost, statusHost, tableHost;

  function render() {
    root.replaceChildren();
    root.append(head(ids.length, project.selection.descriptorIds.length));
    if (ids.length < 2) {
      root.append(el('div', { class: 'v5-empty' }, el('b', {}, '至少要选两个因素才能做重要性比较'),
        '这页比较的是你已经选中的计算变量。',
        el('button', { class: 'button', onclick: () => context.navigate('elements') }, '去选因素')));
      return;
      return;
    }
    if (ids.length > MAX_FACTORS) {
      root.append(el('p', { class: 'importance-warn' }, '已选 ' + project.selection.descriptorIds.length + ' 个因素，超过 ' + MAX_FACTORS + ' 个时两两比较会让人填到麻木；这里只取前 ' + MAX_FACTORS + ' 个。'));
    }
    statusHost = el('p', { class: 'importance-status', role: 'status' });
    tableHost = el('div', { class: 'importance-pairs' });
    resultHost = el('section', { class: 'v5-card importance-result' });
    root.append(tableHost, resultHost, statusHost, footNote());
    buildPairs();
    update();
  }

  function buildPairs() {
    const table = el('table', { class: 'v5-table' }, el('thead', {}, el('tr', {},
      el('th', { scope: 'col' }, '比较（左边 ↔ 右边）'), el('th', { scope: 'col' }, '重要性（左边相对右边）'))));
    const tbody = el('tbody');
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = ids[i] + '|' + ids[j];
        const select = el('select', { 'aria-label': labels[ids[i]] + ' 相对 ' + labels[ids[j]], 'data-pair': key });
        select.append(el('option', { value: '' }, '未填'));
        for (const [text, value] of SAATY_VALUES) {
          select.append(el('option', { value: String(value) }, text + '（' + (SCALE_LABELS[text] || '') + '）'));
        }
        select.addEventListener('change', () => { pairs[key] = select.value; update(); });
        tbody.append(el('tr', {},
          el('td', {}, labels[ids[i]] + ' ↔ ' + labels[ids[j]]),
          el('td', {}, select)));
      }
    }
    table.append(tbody);
    tableHost.replaceChildren(el('div', { class: 'v5-scroll' }, table));
  }

  function update() {
    const { A, missing, complete } = buildMatrix(ids, pairs);
    const solved = complete ? priorityVector(A) : { weights: [], lambdaMax: null };
    const stats = complete ? consistency(A, solved.weights) : null;
    resultHost.replaceChildren(
      el('div', { class: 'hd' },
        el('h3', {}, '权重与一致性'),
        el('span', { class: 'note' }, complete ? '比较已填齐' : '还差 ' + missing.length + ' 项')),
      el('div', { class: 'bd' }, ...body(complete, solved, stats, missing)));
    statusHost.textContent = complete
      ? (stats?.applies && !stats.acceptable ? '一致性比率超过 0.10：这些比较里有互相矛盾的地方，建议回去看最强的那几条。' : '比较自洽，可以用来对照。')
      : '把每对比完再看得出的权重；缺的项会单独列出，不替你补 1。';
  }

  function body(complete, solved, stats, missing) {
    if (!complete) {
      return [el('p', { class: 'importance-note' }, '还缺这些比较：'),
        el('ul', { class: 'importance-missing' }, ...missing.map(m => el('li', {}, labels[m.a] + ' ↔ ' + labels[m.b])))];
    }
    const ranked = rankedWeights(ids, labels, solved.weights);
    const hands = el('div', { class: 'importance-hands' });
    for (const item of ranked) {
      hands.append(el('div', { class: 'importance-hand' },
        el('span', { class: 'importance-weight' }, (item.weight * 100).toFixed(1) + '%'),
        el('span', { class: 'importance-bar' }, el('i', { style: 'width:' + (item.weight * 100).toFixed(1) + '%' })),
        el('span', { class: 'importance-label' }, item.label)));
    }
    const facts = el('dl', { class: 'importance-facts' });
    const rows = [
      ['最大特征值 λmax', stats.lambdaMax.toFixed(4)],
      ['一致性指标 CI', stats.ci.toFixed(4)],
      ['随机指标 RI', stats.ri === null ? '不适用' : String(stats.ri)],
      ['一致性比率 CR', stats.cr === null ? 'n≤2 不适用' : stats.cr.toFixed(4)],
      ['判断', stats.cr === null ? '两两比较必然一致' : (stats.acceptable ? 'CR ≤ 0.10，可接受' : 'CR > 0.10，建议重看比较')]
    ];
    for (const [k, v] of rows) facts.append(el('div', {}, el('dt', {}, k), el('dd', {}, v)));
    return [hands, facts, el('p', { class: 'importance-note' }, '权重是这套比较的相对结果，不是重要性评分，也不改变 CIB 的关系矩阵；AHP–CIB 加权规则尚未核实，本页不作用到计算结果。')];
  }

  const unsubscribe = context.store.subscribe(render);
  render();
  return { canLeave: () => true, dispose() { unsubscribe?.(); root.remove(); } };
}

function head(used, total) {
  const lead = used < 2
    ? '先在因素页选至少两个因素，再回来做两两比较。'
    : '用 ' + used + ' 个因素做两两比较' + (total > used ? '（共选 ' + total + ' 个，这里取前 ' + used + '）' : '') + '，看权重和这些比较是否自相矛盾。';
  return el('div', { class: 'v5-head' },
    el('p', { class: 'eyebrow' }, 'Tool · AHP'),
    el('h1', { id: 'importance-title' }, 'AHP 重要性判断',
      infoTip('对已选因素做两两重要性比较，算相对权重与一致性比率 CR。' + RI_TABLE.source + '。这一页只做对照：不改关系评分，不把权重作用到 CIB 结果。', '这一页做什么')),
    el('p', { class: 'lead' }, lead));
}

function footNote() {
  return el('p', { class: 'importance-note' }, '标度用 Saaty 1–9 及其倒数：“左边比右边重要”选大于 1，“右边更重要”选小于 1。');
}
