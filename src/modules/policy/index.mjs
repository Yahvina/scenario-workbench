// 政策库与来源：同学数据集的只读检索页。可搜、可筛、可看一条记录的全部字段与关联。
// 这一页不写项目、不改选择、不生成评分；关联只显示 PATH_LINKS 已建立的部分。
import { el, infoTip, openDrawer } from '../../core/ui.mjs';
import { datasetSummary, filterRows, groupCounts, summarize } from './logic.mjs';

const PAGE = 40;
const LEVEL_LABEL = { '国家级': '国家级', '省级': '省级', '直辖市级': '直辖市级', '地级市级': '地级市级', '市级': '市级', '区级': '区级', '功能区级': '功能区级', '省直管县级市': '省直管县级市' };

export function mount(container, context) {
  const root = el('section', { class: 'policy-module', 'aria-labelledby': 'policy-title' });
  container.append(root);

  const project = context.store.read();
  const nameOf = id => project.data.descriptors.find(d => d.id === id)?.label || id;
  const { items, source, summary } = datasetSummary(nameOf);

  const state = { province: 'all', category: 'all', level: 'all', link: 'all', query: '', shown: PAGE, sort: 'year' };
  let listHost, countHost, statHost;

  function current() {
    const filtered = filterRows(items, state);
    const sorted = sortRows(filtered, state.sort);
    return { filtered, sorted };
  }

  function render() {
    root.replaceChildren();
    root.append(head(source, summary));
    root.append(toolbar());
    statHost = el('div', { class: 'policy-stats' });
    root.append(statHost);
    countHost = el('p', { class: 'policy-count', role: 'status' });
    listHost = el('div', { class: 'policy-list' });
    root.append(countHost, listHost);
    paint();
  }

  function paint() {
    const { filtered, sorted } = current();
    const stats = summarize(filtered);
    statHost.replaceChildren(...[
      ['记录', stats.total + ' 条'],
      ['已关联描述符', stats.linked + ' 条'],
      ['待匹配', (stats.total - stats.linked) + ' 条'],
      ['管辖地', stats.jurisdictions + ' 个'],
      ['生效年', stats.earliest === null ? '未知' : stats.earliest + '–' + stats.latest],
      ['缺生效年', stats.unknownYear + ' 条']
    ].map(([k, v]) => el('div', { class: 'policy-stat' }, el('dt', {}, k), el('dd', {}, v))));

    countHost.textContent = '当前显示 ' + Math.min(state.shown, sorted.length) + ' / ' + sorted.length + ' 条';

    listHost.replaceChildren();
    if (!sorted.length) {
      listHost.append(el('div', { class: 'v5-empty' }, el('b', {}, '没有符合当前条件的记录'), '换一个关键词或清空筛选。'));
      return;
    }
    const page = sorted.slice(0, state.shown);
    const table = el('table', { class: 'v5-table policy-table' },
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col' }, '工具名称'),
        el('th', { scope: 'col' }, '路径'),
        el('th', { scope: 'col' }, '管辖地'),
        el('th', { scope: 'col', class: 'num' }, '生效年'),
        el('th', { scope: 'col' }, '类别'),
        el('th', { scope: 'col' }, '描述符关联'))));
    const body = el('tbody');
    for (const item of page) {
      body.append(el('tr', { 'data-policy-row': item.id, onclick: () => openDetail(item, nameOf) },
        el('td', {}, el('button', { class: 'policy-name', type: 'button', onclick: () => openDetail(item, nameOf) }, item.name)),
        el('td', {}, item.path),
        el('td', {}, item.jurisdiction, item.isPark ? el('span', { class: 'policy-tag' }, '功能区') : null),
        el('td', { class: 'num' }, item.startYear === null ? '未知' : String(item.startYear)),
        el('td', {}, item.category),
        el('td', {}, item.link
          ? el('span', { class: 'policy-tag is-linked' }, item.link.level === 'direct' ? '对应：' : '部分对应：', item.link.labels.join('、'))
          : el('span', { class: 'policy-tag is-pending' }, '还没对应到因素'))));
    }
    table.append(body);
    listHost.append(el('div', { class: 'v5-scroll' }, table));
    if (sorted.length > state.shown) {
      listHost.append(el('button', { class: 'button', type: 'button', onclick: () => { state.shown += PAGE * 2; paint(); } },
        '再显示 ' + Math.min(PAGE * 2, sorted.length - state.shown) + ' 条'));
    }
  }

  function set(key, value) {
    state[key] = value;
    state.shown = PAGE;
    paint();
  }

  function toolbar() {
    const host = el('div', { class: 'policy-toolbar' });
    const search = el('input', { type: 'search', id: 'policy-search', placeholder: '搜索工具名称、路径、文号或管辖地', 'aria-label': '搜索政策工具' });
    search.addEventListener('input', () => set('query', search.value));
    host.append(el('div', { class: 'policy-searchrow' }, search));
    const selects = el('div', { class: 'policy-selects' },
      select('地区', 'province', [['all', '全部'], ['国家', '国家级'], ...['北京市', '天津市', '河北省'].map(p => [p, p])]),
      select('类别', 'category', [['all', '全部'], ...groupCounts(items, 'category').map(([k, n]) => [k, k + '（' + n + '）'])]),
      select('层级', 'level', [['all', '全部'], ...groupCounts(items, 'level').map(([k, n]) => [k, k + '（' + n + '）'])]),
      select('描述符关联', 'link', [['all', '全部'], ['linked', '已建立关联'], ['pending', '待匹配']]),
      select('排序', 'sort', [['year', '按生效年'], ['name', '按名称'], ['jurisdiction', '按管辖地']]));
    host.append(selects);
    return host;

    function select(label, key, options) {
      const node = el('select', { 'aria-label': label, onchange: e => set(key, e.target.value) },
        ...options.map(([value, text]) => el('option', { value }, text)));
      node.value = state[key];
      return el('label', { class: 'policy-select' }, label, node);
    }
  }

  render();
  const unsubscribe = context.store.subscribe(render);
  return { canLeave: () => true, dispose() { unsubscribe?.(); root.remove(); } };
}

function sortRows(rows, sort) {
  const copy = [...rows];
  if (sort === 'name') copy.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hans'));
  else if (sort === 'jurisdiction') copy.sort((a, b) => String(a.jurisdiction).localeCompare(String(b.jurisdiction), 'zh-Hans') || String(a.name).localeCompare(String(b.name), 'zh-Hans'));
  else copy.sort((a, b) => (a.startYear ?? -1) - (b.startYear ?? -1) || String(a.name).localeCompare(String(b.name), 'zh-Hans'));
  return copy;
}

function head(source, summary) {
  return el('div', { class: 'v5-head' },
    el('p', { class: 'eyebrow' }, 'Tool · Policy library'),
    el('h1', { id: 'policy-title' }, '政策库与来源',
      infoTip('同学提供的政策工具数据集只读检索页：' + source.rows + ' 条记录，来源表为「' + source.sheet + '」。按地区、类别、层级和关键词查，看每条记录写了什么、关联到哪些因素。缺失字段保持未知，不做推断。', '这一页是什么')));
}

// 一条记录的全部字段放进右侧抽屉，不改动列表状态。
function openDetail(item, nameOf) {
  openDrawer(null, item.name, body => {
    const dl = el('dl', { class: 'policy-detail' });
    const rows = [
      ['路径', item.path],
      ['管辖地', item.jurisdiction + (item.isPark ? '（功能区）' : '')],
      ['层级', item.level],
      ['生效年', item.startYear === null ? '未知' : String(item.startYear)],
      ['终止年', item.endYear === null ? '未知' : String(item.endYear)],
      ['类别', item.category],
      ['组别', item.group],
      ['国家父工具', item.nationalParent],
      ['地方匹配状态', item.localMatch],
      ['对应的因素', item.link ? (item.link.level === 'direct' ? '直接对应：' : '部分对应：') + item.link.labels.join('、') + '（' + item.link.note + '）' : '还没对应到因素'],
      ['法律文件', item.document]
    ];
    for (const [k, v] of rows) dl.append(el('div', {}, el('dt', {}, k), el('dd', {}, String(v))));
    body.append(dl, el('p', { class: 'policy-detail-id' }, '记录编号：' + item.id));
  });
}

