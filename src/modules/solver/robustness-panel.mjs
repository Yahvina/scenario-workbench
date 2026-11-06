// 稳健性检验：在冻结输入的副本上真的改一格、真的重算，再比较集合差异。
// 不覆盖基线；不把“数量变了”当成稳健性结论；没有完整基线就明说不比。
import { el } from '../../core/ui.mjs';
import { readRunArchive } from './index.mjs';
import { createEnumeration, explain } from './engine.mjs';
import { planAtYear } from '../elements/state-plan.mjs';

const key = config => Object.entries(config).sort(([a], [b]) => a.localeCompare(b)).map(([d, s]) => d + '=' + s).join('|');

function solve(input) {
  const job = createEnumeration(input, { displayLimit: 100000, keepLimit: 100000 });
  let step = job.step(1000);
  while (!step.done) step = job.step(1000);
  return step.result;
}

export function mount(container, context) {
  const root = el('section', { class: 'robustness-module' });
  container.append(root);
  let result = null;

  function render() {
    const p = context.store.read();
    const archive = readRunArchive(context.store);
    root.replaceChildren(el('div', { class: 'v5-head' },
      el('div', { class: 'eyebrow' }, '工具 · 不覆盖基线'),
      el('h1', {}, '稳健性检验'),
      el('p', { class: 'lead' }, '在冻结输入的副本上改动一处评分或一条假设，真的重新枚举，再比较自洽组合的新增、消失与保留。基线结果保持不变。')));

    if (!archive?.RunInput || archive.RunResult?.status !== 'completed') {
      root.append(el('div', { class: 'v5-empty' }, el('b', {}, '还没有可用的基线'),
        el('p', {}, '稳健性检验需要一份完整算完的检验结果。先到「检验与结果」跑一次全空间，再回来。'),
        el('button', { class: 'button', onclick: () => context.navigate('solver') }, '去检验与结果')));
      return;
    }

    const input = archive.RunInput;
    const base = archive.RunResult;
    const ids = input.activeDescriptorIds;
    const name = id => p.data.descriptors.find(d => d.id === id)?.label || id;
    const stateName = id => p.data.states.find(s => s.id === id)?.label || id;

    // 可扰动的方向：按源→目标分组矩阵单元
    const stateDescriptor = id => p.data.states.find(s => s.id === id)?.descriptorId || id;
    const groups = [];
    for (const entry of input.matrix.entries) {
      const from = stateDescriptor(entry.sourceStateId), to = stateDescriptor(entry.targetStateId);
      const dir = from + '>' + to;
      let group = groups.find(g => g.id === dir);
      if (!group) { group = { id: dir, entries: [], from, to }; groups.push(group); }
      group.entries.push(entry);
    }

    const pick = el('select', { 'aria-label': '选择要扰动的方向' },
      ...groups.map(g => el('option', { value: g.id }, name(g.from) + ' → ' + name(g.to) + '（' + g.entries.length + ' 格）')));
    const delta = el('select', { 'aria-label': '扰动量' }, el('option', { value: '1' }, '每条 +1（上限 +3）'), el('option', { value: '-1' }, '每条 −1（下限 −3）'));
    const out = el('div', { class: 'robust-out' });
    const message = el('p', { class: 'robust-msg', role: 'status' });

    function run() {
      try {
        const group = groups.find(g => g.id === pick.value) || groups[0];
        const step = Number(delta.value);
        const clone = structuredClone(input);
        let changed = 0;
        for (const entry of clone.matrix.entries) {
          if (!group.entries.some(e => e.sourceStateId === entry.sourceStateId && e.targetStateId === entry.targetStateId)) continue;
          const next = Math.max(-3, Math.min(3, entry.score + step));
          if (next !== entry.score) { entry.score = next; changed++; }
        }
        if (!changed) throw new Error('这条方向的评分已经在边界上，无法再移动');
        const variant = solve(clone);
        if (variant.status !== 'completed') throw new Error('扰动后的重算没有完成，不能比较');
        const baseSet = new Set((base.all || base.scenarios).map(key));
        const nextSet = new Set((variant.all || variant.scenarios).map(key));
        const kept = [...baseSet].filter(k => nextSet.has(k)).length;
        const added = [...nextSet].filter(k => !baseSet.has(k)).length;
        const removed = [...baseSet].filter(k => !nextSet.has(k)).length;
        let planNote = '这一年的方案状态不全，无法比较我的方案结论。';
        const plan = planAtYear(p, input.year);
        if (plan.complete) {
          const before = explain(input, plan.config), after = explain(clone, plan.config);
          planNote = '我的方案：' + (before.consistent ? '自洽' : '有 ' + before.conflicts.length + ' 个因素冲突') + ' → '
            + (after.consistent ? '自洽' : '有 ' + after.conflicts.length + ' 个因素冲突');
        }
        result = { group, step, changed, base: base.count, variant: variant.count, kept, added, removed, planNote };
        out.replaceChildren(
          el('div', { class: 'robust-stats' },
            el('div', {}, el('b', {}, String(base.count)), el('span', {}, '基线自洽组合')),
            el('div', {}, el('b', {}, String(variant.count)), el('span', {}, '扰动后自洽组合')),
            el('div', {}, el('b', {}, String(kept)), el('span', {}, '保留')),
            el('div', {}, el('b', {}, '+ ' + added), el('span', {}, '新增')),
            el('div', {}, el('b', {}, '− ' + removed), el('span', {}, '消失'))),
          el('p', {}, planNote),
                    );
        message.textContent = '已重算完成；比较基于两次完整枚举。';
      } catch (error) {
        out.replaceChildren();
        message.textContent = '未完成：' + error.message;
      }
    }

    root.append(el('div', { class: 'v5-card' }, el('div', { class: 'hd' }, el('h2', {}, '基线'), el('span', { class: 'note' }, '冻结于 ' + (base.createdAt || '未记录'))),
      el('div', { class: 'bd' },
        el('p', {}, input.year + ' 年 · ' + name(ids[0]) + (ids[1] ? '、' + name(ids[1]) : '') + (ids.length > 2 ? ' 等 ' + ids.length + ' 个因素' : '') + ' · 已检查 ' + base.checked + ' 种组合 · 自洽 ' + base.count),
        el('p', { class: 'v5-hint' }, '基线来自「检验与结果」的本次结果；刷新后需重新计算。'))),
      el('div', { class: 'v5-card' }, el('div', { class: 'hd' }, el('h2', {}, '扰动一处并重算')),
        el('div', { class: 'bd' },
          el('label', { class: 'robust-field' }, '方向', pick),
          el('label', { class: 'robust-field' }, '扰动量', delta),
          el('div', { class: 'robust-actions' }, el('button', { class: 'button primary-action', onclick: run }, '重算并比较')),
          message, out)),
      );
  }

  const off = context.store.subscribe(render);
  render();
  return () => { off(); root.remove(); };
}
