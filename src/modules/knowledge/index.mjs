// 知识库：一处检索 + 引用反查。只读，不抓取、不生成、不改项目。
import { el, infoTip, openDrawer } from '../../core/ui.mjs';
import { projectEntries, libraryEntries, counts, search, citationIndex } from './logic.mjs';
import { evidenceKindLabel } from '../review/logic.mjs';

const PAGE = 30;

export function mount(container, context) {
  const root = el('section', { class: 'knowledge-module', 'aria-labelledby': 'knowledge-title' });
  container.append(root);

  const project = context.store.read();
  // 默认只把"本项目依据 + 与当前项目相关的政策条款"排在前面；点「全部来源」或取消筛选即可看全库。
  const projectItems = projectEntries(project);
  const libraryItems = libraryEntries(project);
  const entries = [...projectItems, ...libraryItems.slice().sort((a, b) => Number(b.relevant) - Number(a.relevant))];
  const state = { query: '', kind: 'all', source: 'all', onlyRelevant: false, shown: PAGE };

  let host, listHost, countHost, kindBar;

  function render() {
    root.replaceChildren();
    root.append(el('div', { class: 'v5-head' },
      el('p', { class: 'eyebrow' }, 'Tool · Knowledge base'),
      el('h1', { id: 'knowledge-title' }, '知识库',
        infoTip('两类来源合在一处检索：本项目里已有依据记录，和同学提供的政策工具数据集。只读检索与引用反查，不抓取、不生成、不改项目。', '这一页是什么'))));

    host = el('div', { class: 'knowledge-toolbar' });
    kindBar = el('div', { class: 'knowledge-kinds', role: 'group', 'aria-label': '依据类型' });
    countHost = el('p', { class: 'knowledge-count', role: 'status' });
    listHost = el('div', { class: 'knowledge-list' });
    root.append(host, kindBar, countHost, listHost, citationCard(project));
    host.append(buildToolbar());
    paintTabs();
    paint();
  }

  function current() {
    return search(entries, state);
  }

  function paintTabs() {
    const c = counts(entries);
    const items = [['all', '全部', c.total]];
    for (const k of ['policy', 'paper', 'historical-data', 'expert']) {
      const n = c.byKind.get(k) || 0;
      if (n) items.push([k, evidenceKindLabel(k), n]);
    }
    kindBar.replaceChildren(...items.map(([value, label, n]) =>
      el('button', { type: 'button', class: 'knowledge-kind' + (state.kind === value ? ' is-active' : ''), onclick: () => { state.kind = value; state.shown = PAGE; paintTabs(); paint(); } },
        label, el('i', {}, String(n)))));
  }

  function paint() {
    const rows = current();
    countHost.textContent = '命中 ' + rows.length + ' 条' + (rows.length !== entries.length ? '（共 ' + entries.length + ' 条）' : '');
    listHost.replaceChildren();
    if (!rows.length) {
      listHost.append(el('div', { class: 'v5-empty' }, el('b', {}, '没有命中任何条目'), '换一个关键词或清空筛选。'));
      return;
    }
    const cards = el('div', { class: 'knowledge-cards' });
    for (const e of rows.slice(0, state.shown)) {
      const isPolicy = e.from === 'library';
      cards.append(el('article', { class: 'knowledge-card' + (e.relevant ? ' is-relevant' : '') },
        el('div', { class: 'knowledge-card-hd' },
          el('button', { class: 'knowledge-name', type: 'button', onclick: () => openDetail(e) }, isPolicy ? e.name : (e.sourceId || e.id)),
          e.kind === 'user-assumption' ? null : el('span', { class: 'knowledge-tag is-' + e.kind }, e.label),
          e.relevant ? el('span', { class: 'knowledge-tag is-relevant' }, '与当前项目相关') : null),
        el('p', { class: 'knowledge-meta' }, isPolicy
          ? [e.path, e.jurisdiction, e.startYear === null ? '生效年未知' : e.startYear + ' 年起', e.category].join(' · ')
          : [e.locator, e.citedBy ? '被 ' + e.citedBy + ' 条判断引用' : '还没有被引用', e.reviewStatus === 'reviewed' ? '已核' : '未核'].join(' · ')),
        isPolicy && e.descriptorLabels.length
          ? el('p', { class: 'knowledge-links' }, (e.linkLevel === 'direct' ? '直接对应：' : '部分对应：') + e.descriptorLabels.join('、'))
          : null));
    }
    listHost.append(cards);
    if (rows.length > state.shown) {
      listHost.append(el('button', { class: 'button', type: 'button', onclick: () => { state.shown += PAGE * 2; paint(); } }, '再显示 ' + Math.min(PAGE * 2, rows.length - state.shown) + ' 条'));
    }
  }

  function buildToolbar() {
    const input = el('input', { type: 'search', id: 'knowledge-search', placeholder: '搜索名称、路径、出处或文号', 'aria-label': '搜索知识库' });
    input.addEventListener('input', () => { state.query = input.value; state.shown = PAGE; paint(); });
    const source = el('select', { 'aria-label': '来源', onchange: e => { state.source = e.target.value; state.shown = PAGE; paint(); } },
      el('option', { value: 'all' }, '全部来源'),
      el('option', { value: 'project' }, '本项目依据'),
      el('option', { value: 'library' }, '政策工具数据集'));
    source.value = state.source;
    const rel = el('label', { class: 'knowledge-check' },
      el('input', { type: 'checkbox', onchange: e => { state.onlyRelevant = e.target.checked; state.shown = PAGE; paint(); } }), '只看与当前项目相关');
    return el('div', { class: 'knowledge-searchrow' }, input, el('label', { class: 'knowledge-select' }, '来源', source), rel);
  }

  const unsubscribe = context.store.subscribe(render);
  render();
  return { canLeave: () => true, dispose() { unsubscribe?.(); root.remove(); } };
}

function citationCard(project) {
  const index = citationIndex(project);
  const card = el('section', { class: 'v5-card knowledge-card-block' },
    el('div', { class: 'hd' }, el('h3', {}, '引用反查'),
      el('span', { class: 'note' }, index.bare.length ? index.bare.length + ' 条判断还没有依据' : '每条判断都有依据')));
  const body = el('div', { class: 'bd' });
  if (index.bare.length) {
    body.append(el('p', { class: 'knowledge-meta' }, '这些判断还没挂任何依据，来源只能算用户假设：'));
    body.append(el('ul', { class: 'knowledge-bare' }, ...index.bare.map(j => el('li', {}, j.label))));
  } else if (!project.data.judgments.length) {
    body.append(el('p', { class: 'knowledge-meta' }, '还没有判断记录。'));
  } else {
    body.append(el('p', { class: 'knowledge-meta' }, '所有判断都已挂上至少一条依据。点开上面任一条依据可见具体被谁引用。'));
  }
  if (index.dangling.length) body.append(el('p', { class: 'knowledge-warn' }, '有 ' + index.dangling.length + ' 个引用找不到对应依据记录。'));
  card.append(body);
  return card;
}

function openDetail(entry) {
  openDrawer(null, entry.from === 'library' ? entry.name : (entry.sourceId || entry.id), body => {
    const dl = el('dl', { class: 'knowledge-detail' });
    const rows = entry.from === 'library'
      ? [['路径', entry.path], ['管辖地', entry.jurisdiction], ['层级', entry.level],
         ['生效年', entry.startYear === null ? '未知' : String(entry.startYear)],
         ['终止年', entry.endYear === null ? '未知' : String(entry.endYear)],
         ['类别', entry.category], ['组别', entry.group],
         ['描述符关联', entry.descriptorLabels.length ? (entry.linkLevel === 'direct' ? '直接对应：' : '部分对应：') + entry.descriptorLabels.join('、') : '待匹配（未建立关联）'],
         ['法律文件', entry.document], ['记录编号', entry.id]]
      : [['性质', entry.label], ['出处', entry.sourceId], ['定位', entry.locator],
         ['摘要', entry.excerpt], ['被引用', entry.citedBy ? entry.citedBy + ' 条判断' : '还没有被引用'],
         ['审核状态', entry.reviewStatus === 'reviewed' ? '已核' : '未核'], ['记录编号', entry.id]];
    for (const [k, v] of rows) dl.append(el('div', {}, el('dt', {}, k), el('dd', {}, String(v))));
    body.append(dl);
  });
}
