// 结果可视化：全部从冻结的 RunInput / RunResult 读，不碰当前正在编辑的项目。
//   1. 状态分布 —— 每个因素的各状态在自洽组合里出现几次（分母是全量自洽数）；
//   2. 状态搭配约束 —— 一对因素在自洽组合里实际出现过哪些状态搭配。
//      可能搭配全部出现 = 这一对没有被约束；只出现少数 = 自洽性把两者绑在了一起。
import { el, infoTip } from '../../core/ui.mjs';
import { readRunArchive } from '../solver/index.mjs';
import { stateDistribution, pairingConstraints } from './logic.mjs';
export function mount(container, context) {
  const root = el('section', { class: 'analysis-module', 'aria-labelledby': 'analysis-title' });
  container.append(root);

  function render() {
    root.replaceChildren();
    const project = context.store.read();
    const archive = readRunArchive(context.store);
    const run = archive?.RunResult;
    const input = archive?.RunInput;

    root.append(el('div', { class: 'v5-head' },
      el('p', { class: 'eyebrow' }, 'Tool · Visual analysis'),
      el('h1', { id: 'analysis-title' }, '结果可视化',
        infoTip('这里只画本次已冻结的检验结果：自洽组合在各状态上的分布，以及哪些状态搭配被自洽性绑在了一起。不预测、不给绩效结论。', '这些图是什么')),
      el('p', { class: 'lead' }, '先看分布，再看搭配。图只描述这次算出来的自洽空间。')));

    if (!input || run?.status !== 'completed') {
      root.append(el('div', { class: 'v5-empty' }, el('b', {}, '还没有可用的检验结果'),
        el('button', { class: 'button', onclick: () => context.navigate('solver') }, '去检验与结果')));
      return;
    }

    const name = id => project.data.descriptors.find(d => d.id === id)?.label || id;
    const stateName = id => project.data.states.find(s => s.id === id)?.label || id;

    root.append(distributionCard({ dist: stateDistribution(input, run), name, stateName }));
    root.append(pairingCard({ data: pairingConstraints(input, run, run.all), input, name, stateName }));
  }

  const unsubscribe = context.store.subscribe(render);
  render();
  return { canLeave: () => true, dispose() { unsubscribe?.(); root.remove(); } };
}

// ── 状态分布 ────────────────────────────────────────────────
function distributionCard({ dist, name, stateName }) {
  const card = el('section', { class: 'v5-card analysis-card' },
    el('div', { class: 'hd' },
      el('h3', {}, '自洽组合里的状态分布'),
      el('span', { class: 'note' }, dist.total === null ? '未定' : '分母：' + dist.total + ' 个自洽组合')));
  const body = el('div', { class: 'bd' });
  if (!dist.total) {
    body.append(el('p', { class: 'analysis-empty' }, '这次没有自洽组合，因此没有分布可画。'));
  } else {
    for (const row of dist.rows) {
      const block = el('div', { class: 'analysis-block' }, el('h4', {}, name(row.descriptorId)));
      for (const s of row.states) {
        const pct = Math.round((s.count / dist.total) * 100);
        block.append(el('div', { class: 'analysis-bar-wrap' },
          el('span', { class: 'analysis-bar-label' }, stateName(s.stateId)),
          el('div', { class: 'analysis-bar' },
            el('div', { class: 'analysis-bar-fill', style: 'width:' + Math.max(0, Math.min(100, pct)) + '%' })),
          el('span', { class: 'analysis-bar-value' }, s.count + ' 次 · ' + pct + '%')));
      }
      body.append(block);
    }
  }
  card.append(body);
  return card;
}

// ── 状态搭配约束 ────────────────────────────────────────────
function pairingCard({ data, input, name, stateName }) {
  const card = el('section', { class: 'v5-card analysis-card' },
    el('div', { class: 'hd' },
      el('h3', {}, '被绑定的状态搭配'),
      el('span', { class: 'note' }, '样本：' + data.sample + ' 个自洽组合')));
  const body = el('div', { class: 'bd' }),
    bound = data.pairs.filter(p => p.coverage < 1).sort((x, y) => x.coverage - y.coverage || y.possible - x.possible);

  if (!data.sample) {
    body.append(el('p', { class: 'analysis-empty' }, '这次没有自洽组合，因此没有搭配可看。'));
  } else if (!bound.length) {
    body.append(el('p', { class: 'analysis-empty' }, '每个因素的两两状态搭配都出现过，这两者之间没有被自洽性额外绑定。'));
  } else {
    const shown = bound.slice(0, 12);
    const table = el('table', { class: 'analysis-pairs' },
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col' }, '因素对'),
        el('th', { scope: 'col' }, '自洽组合里实际出现'),
        el('th', { scope: 'col', class: 'num' }, '搭配数'))));
    for (const p of shown) {
      const shownCombos = p.combos.slice(0, 4);
      const chips = el('div', { class: 'analysis-chips' },
        ...shownCombos.map(c => el('span', { class: 'analysis-chip' },
          stateName(c.a) + ' × ' + stateName(c.b),
          el('i', {}, String(c.count)))),
        p.combos.length > shownCombos.length ? el('span', { class: 'analysis-chip is-more' }, '另 ' + (p.combos.length - shownCombos.length) + ' 种') : null);
      table.append(el('tbody', {}, el('tr', {},
        el('td', {}, el('b', {}, name(p.a) + ' × ' + name(p.b))),
        el('td', {}, chips),
        el('td', { class: 'num' }, p.used + ' / ' + p.possible))));
    }
    body.append(table);
    if (bound.length > shown.length) body.append(el('p', { class: 'analysis-note' }, '另外还有 ' + (bound.length - shown.length) + ' 对只在部分搭配上出现，未逐条列出。'));
  }

  if (data.complete) {
    body.append(el('p', { class: 'analysis-note' }, '「搭配数」是可能出现的状态搭配中、真正出现在自洽组合里的数量。数量越少，说明这一对在自洽解里被绑得越紧。'));
  } else {
    body.append(el('p', { class: 'analysis-note' }, '自洽组合共 ' + (data.total ?? '—') + ' 个，这里只能逐条比较前 ' + data.sample + ' 个，因此只能说明这几条的情况。'));
  }
  card.append(body);
  return card;
}


