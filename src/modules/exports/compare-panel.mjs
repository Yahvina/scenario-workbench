// P6：比较两份已保存的方案，或两份已有的检算结果。
// 设计要点：
// 1. 只比较"已经存下来的"东西，不比较编辑中的草稿——否则比较对象会在你打字时漂移。
// 2. 方案比较与结果比较是两件事，不混在一张表里：方案比的是范围/选择/评分，
//    结果比的是当初冻结算出来的结论。
// 3. 历史归档不是当前已复算结果：比结果时必须带上这句提示，不能让人以为
//    平台把旧归档重新算过一遍。
import { el } from '../../core/ui.mjs';
import { createLibrary } from '../workspace/saved-work.mjs';
import { comparePlans, compareRuns } from './compare.mjs';

function readLibrary() {
  try {
    const state = createLibrary(window.localStorage).load();
    if (!state.ok) return { ok: false, error: state.error };
    return { ok: true, bundle: state.bundle };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function sideOptions(bundle, kind) {
  return kind === 'plan' ? bundle.plans : bundle.runs;
}

function labelOf(item, kind) {
  const prefix = kind === 'plan' ? '方案：' : '检算结果：';
  return prefix + item.name + '（' + item.createdAt + '）';
}

export function comparePanel(container, context) {
  const section = el('section', { class: 'exports-module', 'data-compare-panel': '' });
  const message = el('p', { class: 'exports-status', role: 'status', 'aria-live': 'polite', 'data-compare-status': '' });
  const body = el('div', { 'data-compare-body': '' });
  section.append(
    el('h2', {}, '比较两份已保存的方案或结果'),
    el('p', {}, '只比较已经保存下来的方案与归档。编辑中的草稿不参与比较，以免比较对象在输入时变化。'),
    body, message
  );

  function render() {
    const library = readLibrary();
    if (!library.ok) {
      body.replaceChildren(el('p', { class: 'exports-gaps' }, '本地历史库无法读取，未做任何改动：' + library.error));
      message.textContent = '';
      return;
    }
    const { bundle } = library;
    if (bundle.plans.length < 1 && bundle.runs.length < 1) {
      body.replaceChildren(el('p', { class: 'exports-gaps' },
        '本地库里还没有可比较的内容。先在下方「命名方案与本地历史库」保存两份方案或归档，再回到这里比较。'));
      message.textContent = '';
      return;
    }

    const kindSelect = el('select', { id: 'compare-kind', 'aria-label': '比较对象类型' },
      el('option', { value: 'plan' }, '比较两份已保存方案'),
      el('option', { value: 'run' }, '比较两份检算结果'));
    const leftSelect = el('select', { id: 'compare-left', 'aria-label': '左侧对象' });
    const rightSelect = el('select', { id: 'compare-right', 'aria-label': '右侧对象' });
    const output = el('div', { 'data-compare-output': '' });

    function fillSides() {
      const kind = kindSelect.value;
      const items = sideOptions(bundle, kind);
      const build = select => {
        select.replaceChildren(...items.map((item, index) => el('option', { value: item.id }, labelOf(item, kind))));
        if (items.length) select.value = items[Math.min(select === leftSelect ? 0 : 1, items.length - 1)].id;
      };
      build(leftSelect); build(rightSelect);
    }

    function run() {
      const kind = kindSelect.value;
      const items = sideOptions(bundle, kind);
      const left = items.find(item => item.id === leftSelect.value);
      const right = items.find(item => item.id === rightSelect.value);
      if (!left || !right) {
        output.replaceChildren(el('p', { class: 'exports-gaps' }, '需要两份可读的记录才能比较。'));
        return;
      }
      let result;
      try {
        result = kind === 'plan' ? comparePlans({ left, right }) : compareRuns({ left, right });
      } catch (error) {
        output.replaceChildren(el('p', { class: 'exports-gaps' }, '未能比较：' + error.message));
        return;
      }
      const blocks = [];
      blocks.push(el('p', { class: 'exports-note' }, result.summary));
      if (kind === 'run' && result.historicallyNotRecomputed) {
        blocks.push(el('p', { class: 'exports-gaps' },
          '注意：这里比的是两份历史归档当时算出的结论，不是平台用当前规则重新复算过的结果。旧归档不会被自动重算。'));
      }
      blocks.push(el('table', { class: 'exports-table' },
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, '项目'), el('th', { scope: 'col' }, '左侧'), el('th', { scope: 'col' }, '右侧'), el('th', { scope: 'col' }, '是否相同'))),
        el('tbody', {}, ...result.rows.map(item => el('tr', { 'data-compare-row': item.kind },
          el('td', {}, item.label),
          el('td', {}, item.leftText),
          el('td', {}, item.rightText),
          el('td', {}, item.same ? '相同' : '不同'))))));
      if (result.notes?.length) blocks.push(el('ul', { class: 'exports-gaps' }, ...result.notes.map(note => el('li', {}, note))));
      output.replaceChildren(...blocks);
      message.textContent = kind === 'plan'
        ? '方案比较完成：' + result.sameCount + ' 项相同、' + result.changedCount + ' 项不同。'
        : '结果比较完成：' + result.sameCount + ' 项相同、' + result.changedCount + ' 项不同；两份都是历史归档。';
    }

    kindSelect.addEventListener('change', () => { fillSides(); run(); });
    leftSelect.addEventListener('change', run);
    rightSelect.addEventListener('change', run);

    body.replaceChildren(
      el('div', { class: 'exports-row' },
        el('label', { for: 'compare-kind' }, '比较什么'), kindSelect,
        el('label', { for: 'compare-left' }, '左侧'), leftSelect,
        el('label', { for: 'compare-right' }, '右侧'), rightSelect),
      output);
    fillSides();
    run();
  }

  const off = context.store.subscribe(render);
  render();
  container.append(section);
  return () => off();
}
