// 分析校核：单人自查。两件事——口径对不对得上、依据是什么性质。
// 只读项目，不写任何记录；发现问题只给去处，不替用户改。
import { el, infoTip, openDrawer } from '../../core/ui.mjs';
import { scopeChecks, checkSummary, libraryChecks, libraryTotals } from './logic.mjs';

export function mount(container, context) {
  const root = el('section', { class: 'review-module', 'aria-labelledby': 'review-title' });
  container.append(root);

  function render() {
    root.replaceChildren();
    const project = context.store.read();
    const year = preferredYear(project);

    root.append(el('div', { class: 'v5-head' },
      el('p', { class: 'eyebrow' }, 'Tool · Self check'),
      el('h1', { id: 'review-title' }, '分析校核',
        infoTip('自查两件事：每条判断的口径（范围、年份、直接性、格子数）是否对得上当前项目；每条判断引用的依据是什么性质。不聚合、不评价、不改项目。', '这一页做什么'))));

    if (!project.data.judgments.length) {
      root.append(el('div', { class: 'v5-empty' }, el('b', {}, '还没有判断记录可以核对'),
        el('button', { class: 'button', onclick: () => context.navigate('relationships') }, '去填关系评分')));
      return;
    }

    const rows = scopeChecks(project, year);
    const summary = checkSummary(rows);
    root.append(summaryCard(summary, year, project, context));
    root.append(scopeCard(rows));
    root.append(libraryCard(project));
  }

  const unsubscribe = context.store.subscribe(render);
  render();
  return { canLeave: () => true, dispose() { unsubscribe?.(); root.remove(); } };
}

// 与求解页同口径：默认落在已经有判断范围覆盖的年份上，否则取项目第一个年份。
function preferredYear(project) {
  const years = [...project.scope.years].sort((a, b) => a - b);
  return years.find(y => project.data.judgments.some(j => (j.validYears || []).includes(y))) ?? years[0] ?? null;
}

function summaryCard(summary, year, project, context) {
  const items = [
    ['判断记录', summary.total + ' 条'],
    ['范围对不上', summary.regionMismatch + ' 条'],
    ['没覆盖 ' + (year ?? '本年'), summary.yearMismatch + ' 条'],
    ['格子没填齐', summary.coverageGap + ' 条'],
    ['没有引用依据', summary.noEvidence + ' 条'],
    ['来源是演示参考/示例', summary.referenceOrigin + ' 条']
  ];
  return el('section', { class: 'v5-card review-card' },
    el('div', { class: 'hd' }, el('h3', {}, '核对结果'),
      el('button', { class: 'button text', type: 'button', onclick: () => context.navigate('relationships') }, '去关系页改'),
      el('span', { class: 'note' }, '当前项目 · ' + (project.scope.regionId || '未指定地区'))),
    el('div', { class: 'bd' },
      el('dl', { class: 'review-stats' }, ...items.map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, v))))));
}

function scopeCard(rows) {
  const card = el('section', { class: 'v5-card review-card' },
    el('div', { class: 'hd' }, el('h3', {}, '逐条口径'), el('span', { class: 'note' }, rows.length + ' 条判断')));
  const table = el('table', { class: 'v5-table review-table' },
    el('thead', {}, el('tr', {},
      el('th', { scope: 'col' }, '判断'),
      el('th', { scope: 'col' }, '适用地区'),
      el('th', { scope: 'col' }, '适用年份'),
      el('th', { scope: 'col' }, '直接性'),
      el('th', { scope: 'col', class: 'num' }, '格子'),
      el('th', { scope: 'col' }, '来源'))));
  const body = el('tbody');
  const DIRECT = { direct: '直接', indirect: '间接', unknown: '未说明' };
  for (const r of rows) {
    body.append(el('tr', {},
      el('td', {}, el('button', { class: 'review-name', type: 'button', onclick: () => {
        openDrawer(null, r.name, host => {
          host.append(el('p', { class: 'review-origin' }, r.origin.label, '：', r.origin.note));
          const dl = el('dl', { class: 'review-detail' });
          for (const [k, v] of [['适用地区', r.region.note], ['适用年份', r.years.note], ['直接性', DIRECT[r.directness] || r.directness], ['格子', r.coverage.filled + ' / ' + r.coverage.required], ['审核状态', r.reviewStatus], ['记录编号', r.id]]) {
            dl.append(el('div', {}, el('dt', {}, k), el('dd', {}, String(v))));
          }
          host.append(dl, el('h4', {}, '引用的依据（' + r.evidence.found.length + ' 条）'));
          host.append(r.evidence.found.length
            ? el('ul', { class: 'review-evidence' }, ...r.evidence.found.map(ev => el('li', {}, el('b', {}, ev.label), ' · ' + ev.sourceId, el('span', { class: 'review-evidence-loc' }, ev.locator))))
            : el('p', {}, '这条没有引用任何依据记录。'));
          if (r.evidence.missing.length) host.append(el('p', { class: 'review-warn' }, '有 ' + r.evidence.missing.length + ' 个引用找不到对应记录：' + r.evidence.missing.join('、')));
        });
      } }, r.name)),
      el('td', {}, badge(r.region.ok, r.region.note)),
      el('td', {}, badge(r.years.ok, r.years.note)),
      el('td', {}, DIRECT[r.directness] || r.directness),
      el('td', { class: 'num' }, r.coverage.filled + ' / ' + r.coverage.required),
      el('td', {}, el('span', { class: 'review-tag is-' + r.origin.kind }, r.origin.label))));
  }
  table.append(body);
  card.append(el('div', { class: 'bd' }, el('div', { class: 'v5-scroll' }, table)));
  return card;
}

function libraryCard(project) {
  const lib = libraryChecks(project);
  const totals = libraryTotals();
  const card = el('section', { class: 'v5-card review-card' },
    el('div', { class: 'hd' }, el('h3', {}, '与政策库对得上吗',
      infoTip('同学的数据集共 ' + totals.rows + ' 条工具记录（国家级 ' + totals.national + ' 条、地方 ' + totals.local + ' 条），已建立 ' + totals.paths + ' 条路径关联。', '数据从哪来')),
      el('span', { class: 'note' }, '已选 ' + lib.total + ' 个因素 · ' + lib.covered + ' 个在库里已有明确路径')));
  const body = el('div', { class: 'bd' });
  if (!lib.total) {
    body.append(el('p', { class: 'review-note' }, '当前项目还没选因素。'));
  } else {
    const list = el('ul', { class: 'review-library' });
    for (const row of lib.rows) {
      list.append(el('li', {},
        el('b', {}, row.label),
        row.links.length
          ? el('span', {}, row.links.map(l => l.path + (l.level === 'partial' ? '（部分对应）' : '（直接）')).join('；'))
          : el('span', { class: 'review-tag is-pending' }, '库里还没有明确关联的路径')));
    }
    body.append(list);
  }
  card.append(body);
  return card;
}

function badge(ok, text) {
  return el('span', { class: 'review-tag ' + (ok ? 'is-ok' : 'is-bad') }, text);
}

