// 政策组合优化（轻量版）：在已经算出的自洽组合里，找「离我的方案最近的几条」。
// 不做绩效优化、不引入成本/减排模型、不排名好坏；只按状态差异数给出可比配置。
// 全部读冻结的 RunInput / RunResult，不读当前项目替换历史。
import { el, infoTip } from '../../core/ui.mjs';
import { readRunArchive } from '../solver/index.mjs';
import { readPlanChecks } from '../solver/plan-check-store.mjs';
import { rankAlternatives, changeFrequency } from './logic.mjs';

const SHOW = 12;

export function mount(container, context) {
  const root = el('section', { class: 'optimization-module', 'aria-labelledby': 'optimization-title' });
  container.append(root);
  let limit = SHOW;

  function render() {
    root.replaceChildren();
    const project = context.store.read();
    const archive = readRunArchive(context.store);
    const run = archive?.RunResult;
    const input = archive?.RunInput;

    root.append(el('div', { class: 'v5-head' },
      el('p', { class: 'eyebrow' }, 'Tool · Alternatives'),
      el('h1', { id: 'optimization-title' }, '政策组合优化',
        infoTip('在本次已经算出的自洽组合里，找离你的方案最近的几条，逐条列出改了哪几个因素。这一页不做绩效优化：没有成本、减排或效益模型时，不能声称哪条更优。', '这一页做什么'))));

    if (!input || run?.status !== 'completed') {
      root.append(el('div', { class: 'v5-empty' }, el('b', {}, '还没有可用的检验结果'),
        el('button', { class: 'button', onclick: () => context.navigate('solver') }, '去检验与结果')));
      return;
    }

    const name = id => project.data.descriptors.find(d => d.id === id)?.label || id;
    const stateName = id => project.data.states.find(s => s.id === id)?.label || id;
    const current = currentPlan(project, input.year);
    if (!current) {
      root.append(el('div', { class: 'v5-empty' }, el('b', {}, '这一年还没有检验过你的方案'),
        '「我的方案」就是因素页按年份选的那套状态；先在检验页跑一次方案检验，再回来看可比较的调整。',
        el('button', { class: 'button', onclick: () => context.navigate('solver') }, '去检验与结果')));
      return;
    }

    const ranked = rankAlternatives(input, run, current);
    if (!ranked.sample) {
      root.append(el('div', { class: 'v5-empty' }, el('b', {}, '这次没有自洽组合'), '全空间没有自洽配置，因此没有可比较的调整。'));
      return;
    }
    root.append(summaryCard(ranked, input, current, stateName));
    root.append(alternativesCard(ranked, { input, current, name, stateName, limit, onMore: () => { limit += SHOW * 2; render(); } }));
  }

  const unsubscribe = context.store.subscribe(render);
  render();
  return { canLeave: () => true, dispose() { unsubscribe?.(); root.remove(); } };
}

// 「我的方案」：用方案检验记录里那一刻的配置（同一份冻结年份的计划）。
function currentPlan(project, year) {
  const record = readPlanChecks(project.id)[year];
  return record?.config ? { ...record.config } : null;
}

function summaryCard(ranked, input, current, stateName) {
  const exact = ranked.rows.filter(r => r.sameAsPlan).length;
  const near = ranked.rows.filter(r => r.distance === 1).length;
  return el('section', { class: 'v5-card optimization-card' },
    el('div', { class: 'hd' }, el('h3', {}, '与你方案的差距',
      infoTip('差距按变量个数算：改一个因素的状态就是差一步。差距小只说明改动少，不代表更好。', '差距怎么算')),
      el('span', { class: 'note' }, ranked.complete ? '全部 ' + ranked.sample + ' 条自洽组合' : '逐条可比的前 ' + ranked.sample + ' 条（共 ' + (ranked.total ?? '—') + ' 条）')),
    el('div', { class: 'bd' },
      el('dl', { class: 'optimization-stats' },
        el('div', {}, el('dt', {}, '自洽组合'), el('dd', {}, String(ranked.total ?? '—'))),
        el('div', {}, el('dt', {}, '与方案一致'), el('dd', {}, exact ? exact + ' 条' : '不在可比列表里')),
        el('div', {}, el('dt', {}, '只差一步'), el('dd', {}, near + ' 条')),
        el('div', {}, el('dt', {}, '你的方案'), el('dd', {}, input.activeDescriptorIds.map(id => stateName(current[id])).join(' / '))))));
}

function alternativesCard(ranked, { input, current, name, stateName, limit, onMore }) {
  const card = el('section', { class: 'v5-card optimization-card' },
    el('div', { class: 'hd' }, el('h3', {}, '最近的可行调整'), el('span', { class: 'note' }, '按改动数量从少到多')));
  const body = el('div', { class: 'bd' });
  const shown = ranked.rows.slice(0, limit);
  const table = el('table', { class: 'v5-table optimization-table' },
    el('thead', {}, el('tr', {},
      el('th', { scope: 'col', class: 'num' }, '改动'),
      el('th', { scope: 'col' }, '相对你的方案改了哪些因素'))));
  const tbody = el('tbody');
  for (const row of shown) {
    const cells = row.changes.length
      ? row.changes.map(c => el('span', { class: 'optimization-change' }, name(c.descriptorId) + '：' + stateName(c.from) + ' → ' + stateName(c.to)))
      : [el('span', { class: 'optimization-same' }, '与你的方案相同')];
    tbody.append(el('tr', {},
      el('td', { class: 'num' }, row.distance === 0 ? '0' : String(row.distance)),
      el('td', {}, el('div', { class: 'optimization-changes' }, ...cells))));
  }
  table.append(tbody);
  body.append(el('div', { class: 'v5-scroll' }, table));
  const freq = changeFrequency(ranked.rows, input.activeDescriptorIds);
  const lines = [];
  for (const id of input.activeDescriptorIds) {
    const bucket = freq.get(id);
    if (!bucket || !bucket.size) continue;
    const parts = [...bucket.entries()].sort((a, b) => b[1] - a[1]).map(([stateId, n]) => stateName(stateId) + '（' + n + ' 次）');
    lines.push(el('li', {}, el('b', {}, name(id)), '：' + parts.join('、')));
  }
  if (lines.length) {
    body.append(el('h4', { class: 'optimization-h4' }, '这些调整里，各因素被改成什么'),
      el('ul', { class: 'optimization-freq' }, ...lines));
  }
  if (ranked.rows.length > shown.length) {
    body.append(el('button', { class: 'button', type: 'button', onclick: onMore }, '再看 ' + Math.min(SHOW * 2, ranked.rows.length - shown.length) + ' 条'));
  }
  card.append(body);
  return card;
}
