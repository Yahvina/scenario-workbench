import { el, infoTip } from '../../core/ui.mjs';
import { readRunArchive, readRunSummary } from './index.mjs';
import { compareScore } from './score-sensitivity.mjs';
import { explain } from './engine.mjs';
import { downloadJson } from '../exports/download.mjs';
import { planAtYear } from '../elements/state-plan.mjs';

export function mount(container, context) {
  const root = el('section', { class: 'robustness-module' });
  container.append(root);

  function render() {
    root.replaceChildren(el('div', { class: 'v5-head' },
      el('p', { class: 'eyebrow' }, 'Tool · Robustness'),
      el('h1', {}, '稳健性检验', infoTip('在冻结输入副本上改单格评分，再完整枚举。比较全部自洽组合的新增、移出与保留。', '怎么算'))));
    const project = context.store.read();
    const archive = readRunArchive(context.store);
    if (!archive?.RunInput || archive.RunResult?.status !== 'completed') {
      root.append(el('div', { class: 'v5-empty' }, el('b', {}, '还没有可用的基线'),
        el('button', { class: 'button', onclick: () => context.navigate('solver') }, '去检验与结果')));
      return;
    }
    const input = archive.RunInput;
    const stale = readRunSummary(context.store)?.stale;
    const snapshot = archive.projectInputSnapshot || project;
    const name = id => snapshot.data.descriptors.find(d => d.id === id)?.label || id;
    const stateName = id => snapshot.data.states.find(s => s.id === id)?.label || id;
    const stateDescriptor = id => input.stateDefinitions.find(s => s.id === id)?.descriptorId;
    const groups = [];
    input.matrix.entries.forEach((entry, index) => {
      const from = stateDescriptor(entry.sourceStateId), to = stateDescriptor(entry.targetStateId);
      let group = groups.find(g => g.from === from && g.to === to);
      if (!group) { group = { from, to, indices: [] }; groups.push(group); }
      group.indices.push(index);
    });
    const direction = el('select', { 'aria-label': '评分方向' },
      ...groups.map((g, i) => el('option', { value: i }, name(g.from) + ' → ' + name(g.to))));
    const cell = el('select', { 'aria-label': '要改的评分格' });
    const score = el('select', { 'aria-label': '新评分' });
    const message = el('p', { role: 'status' });
    const output = el('div', { class: 'robust-out', 'aria-live': 'polite' });
    let result = null;

    function resetScores() {
      const current = input.matrix.entries[Number(cell.value)].score;
      score.replaceChildren(...[-3, -2, -1, 0, 1, 2, 3].filter(n => n !== current)
        .map(n => el('option', { value: n }, String(n))));
      score.value = String(current > -3 ? current - 1 : current + 1);
      message.textContent = '原评分 ' + current;
      output.replaceChildren();
      result = null;
    }
    function resetCells() {
      cell.replaceChildren(...groups[Number(direction.value)].indices.map(i => {
        const entry = input.matrix.entries[i];
        return el('option', { value: i }, stateName(entry.sourceStateId) + ' → ' + stateName(entry.targetStateId));
      }));
      resetScores();
    }
    direction.addEventListener('change', resetCells);
    cell.addEventListener('change', resetScores);
    score.addEventListener('change', () => { output.replaceChildren(); result = null; });
    resetCells();

    function download() {
      downloadJson('稳健性比较_' + input.year + '.json', result);
    }
    function run() {
      try {
        result = compareScore(input, Number(cell.value), Number(score.value));
        const stats = [
          ['基线自洽组合', result.baselineCount], ['重算后', result.variantCount],
          ['保留', result.kept.length], ['新增', result.added.length], ['移出', result.removed.length]
        ];
        output.replaceChildren(el('div', { class: 'robust-stats' },
          ...stats.map(([label, value]) => el('div', {}, el('b', {}, String(value)), el('span', {}, label)))));
        const plan = planAtYear(project, input.year);
        if (plan.complete && !stale) {
          const before = explain(input, plan.config), after = explain(result.variantInput, plan.config);
          output.append(el('p', {}, '我的方案 ' + (before.consistent ? '自洽' : '有冲突') + ' → ' + (after.consistent ? '自洽' : '有冲突')));
        }
        const changed = [...result.added.map(config => ['新增', config]), ...result.removed.map(config => ['移出', config])];
        if (changed.length) {
          const table = el('table', { class: 'v5-table' }, el('thead', {}, el('tr', {},
            el('th', { scope: 'col' }, '变化'), ...input.activeDescriptorIds.map(id => el('th', { scope: 'col' }, name(id))))));
          table.append(el('tbody', {}, ...changed.slice(0, 20).map(([label, config]) => el('tr', {},
            el('td', {}, label), ...input.activeDescriptorIds.map(id => el('td', {}, stateName(config[id])))))));
          output.append(el('div', { class: 'v5-scroll' }, table));
          if (changed.length > 20) output.append(el('p', {}, '共 ' + changed.length + ' 条变化，表内展示前 20 条；导出含全部变化。'));
        } else output.append(el('p', {}, '本次评分改动后，自洽组合相同。'));
        output.append(el('button', { class: 'button', onclick: download }, '导出这次比较'));
        message.textContent = '评分 ' + result.change.previousScore + ' → ' + result.change.score +
          '，两次各检查 ' + result.checked.baseline + ' 个候选组合。';
      } catch (error) {
        output.replaceChildren();
        result = null;
        message.textContent = '未完成 ' + error.message;
      }
    }
    root.append(el('div', { class: 'v5-card' },
      el('div', { class: 'hd' }, el('h2', {}, '基线')),
      el('div', { class: 'bd' }, input.year + ' 年 · ' + input.activeDescriptorIds.map(name).join('、') +
        ' · ' + archive.RunResult.count + ' 个自洽组合' + (stale ? ' · 历史输入，当前设定已改变' : ''))),
      el('div', { class: 'v5-card' }, el('div', { class: 'hd' }, el('h2', {}, '改单格并重算')),
        el('div', { class: 'bd' },
          el('label', { class: 'robust-field' }, '方向', direction),
          el('label', { class: 'robust-field' }, '评分格', cell),
          el('label', { class: 'robust-field' }, '新评分', score),
          el('div', { class: 'robust-actions' }, el('button', { class: 'button primary-action', onclick: run }, '重算并比较')),
          message, output)));
  }
  const off = context.store.subscribe(render);
  render();
  return () => { off(); root.remove(); };
}

