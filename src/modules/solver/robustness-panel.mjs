import { el, infoTip } from '../../core/ui.mjs';
import { readRunArchive, readRunSummary } from './index.mjs';
import { compareScore } from './score-sensitivity.mjs';
import { planSensitivity, scanSensitivity } from './batch-sensitivity.mjs';
import { explain } from './engine.mjs';
import { downloadJson } from '../exports/download.mjs';
import { planAtYear } from '../elements/state-plan.mjs';

export function mount(container, context) {
  const root = el('section', { class: 'robustness-module' });
  container.append(root);
  let batchController = null;

  function render() {
    batchController?.abort();
    batchController = null;
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
    const given=input.conditionedStateIds||[];
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
    if(given.length)root.append(el('p',{},'本次基线的给定条件：'+given.map(id=>name(stateDescriptor(id))+'='+stateName(id)).join('、')+'。扫描只包含本次条件计算实际使用的评分格。'));

    const batchStatus = el('p', { role: 'status', 'data-batch-status': '' });
    const batchOutput = el('div', { 'data-batch-output': '' });
    const cancel = el('button', { class: 'button', disabled: true, onclick: () => batchController?.abort() }, '停止扫描');
    const start = el('button', { class: 'button primary-action', onclick: runBatch }, '扫描全部评分格');
    let batchPlan;
    try {
      batchPlan = planSensitivity(input);
      batchStatus.textContent = '共 ' + batchPlan.trials.length + ' 次逐格 ±1 重算；每次从同一基线出发。';
    } catch (error) {
      start.disabled = true;
      batchStatus.textContent = error.message;
    }
    async function runBatch() {
      const controller = new AbortController();
      batchController = controller;
      start.disabled = true; cancel.disabled = false; batchOutput.replaceChildren();
      batchStatus.textContent = '扫描中 0 / ' + batchPlan.trials.length;
      try {
        const scanned = await scanSensitivity(input, { signal: controller.signal,
          onProgress: ({ completed, total }) => { batchStatus.textContent = '扫描中 ' + completed + ' / ' + total; } });
        if (!root.contains(batchOutput)) return;
        const changed = scanned.rows.filter(row => row.changed);
        const replaced = scanned.rows.filter(row => row.sameCountDifferentSets);
        batchStatus.textContent = (scanned.status === 'completed' ? '扫描完成' : '已停止，结果不完整') + ' · ' +
          scanned.completedTrials + ' / ' + scanned.totalTrials + ' 次 · ' + changed.length + ' 次解集改变 · ' +
          replaced.length + ' 次解数相同但组合替换';
        const ranked = [...scanned.rows].sort((a,b) => (b.added+b.removed)-(a.added+a.removed) || a.entryIndex-b.entryIndex || a.score-b.score);
        const table = el('table', { class: 'v5-table' }, el('thead', {}, el('tr', {},
          ...['评分格', '改分', '重算解数', '新增', '移出', '查看'].map(label => el('th', { scope: 'col' }, label)))));
        table.append(el('tbody', {}, ...ranked.slice(0,20).map(row => el('tr', {},
          el('td', {}, stateName(row.sourceStateId) + ' → ' + stateName(row.targetStateId)),
          el('td', {}, row.previousScore + ' → ' + row.score), el('td', {}, String(row.variantCount)),
          el('td', {}, String(row.added)), el('td', {}, String(row.removed)),
          el('td', {}, el('button', { class: 'button', onclick: () => {
            direction.value = String(groups.findIndex(group => group.indices.includes(row.entryIndex)));
            resetCells(); cell.value = String(row.entryIndex); resetScores(); score.value = String(row.score);
            run(); output.scrollIntoView({ block: 'nearest' });
          } }, '查看组合'))))));
        batchOutput.append(el('p', {}, '按新增与移出总数排序，展示前20次。它表示这套扰动下的变化，不能解释为现实发生概率。'),
          el('div', { class: 'v5-scroll' }, table),
          el('button', { class: 'button', onclick: () => downloadJson('批量评分扫描_' + input.year + '.json', scanned) }, '导出扫描记录'));
      } catch (error) {
        batchStatus.textContent = '扫描未完成：' + error.message;
      } finally {
        start.disabled = false; cancel.disabled = true;
        if (batchController === controller) batchController = null;
      }
    }
    root.append(el('div', { class: 'v5-card' }, el('div', { class: 'hd' }, el('h2', {}, '哪些评分值得优先核验')),
      el('div', { class: 'bd' }, el('p', {}, '逐一将每格评分减1或加1，保持在 −3…+3 内，比较完整解集。不会修改原项目。锁定状态仍接受原有自洽判定。'),
        el('div', { class: 'robust-actions' }, start, cancel), batchStatus, batchOutput)));
  }
  const off = context.store.subscribe(render);
  render();
  return () => { batchController?.abort(); off(); root.remove(); };
}

