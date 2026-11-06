import { el, infoTip } from '../../core/ui.mjs';
import { GEO_SOURCE, MAP_REGIONS, MAP_VIEW, MAP_BY_SCOPE, DEEPER_LEVELS, regionCoverage, coverageLabel, projectClauses, regionImpact, regionForScope } from './geo.mjs';
import { toolsFor, libraryMeta, ROW } from './library.mjs';

const NS = 'http://www.w3.org/2000/svg';
const svgNode = (tag, attrs = {}, text = '') => {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (text) node.textContent = text;
  return node;
};

// 地理入口只负责“研究哪里”。年度状态在因素页，自洽组合在结果页的情景图，三者不互相替代。
export function mountMap(host, context, options) {
  const { onApply, getScope, hasResults } = options;
  let hovered = null, pinned = null, applied = null;

  const mapBox = el('div', { class: 'geo-map', role: 'group', 'aria-label': '京津冀地区选择示意图' });
  const cardBox = el('div', { class: 'geo-card', 'aria-live': 'polite' });
  const status = el('p', { class: 'geo-status', role: 'status' });

  const svg = svgNode('svg', { viewBox: `${MAP_VIEW.x} ${MAP_VIEW.y} ${MAP_VIEW.width} ${MAP_VIEW.height}`, role: 'img', 'aria-label': '京津冀示意图：可选中京津冀整体、北京、天津、河北' });
  const shapes = new Map();
  // 河北最大、包住京津，先画它，北京与天津后画在上层，点击才不会被河北挡住。
  for (const region of [...MAP_REGIONS].reverse()) {
    if (!region.path) continue;
    const path = svgNode('path', {
      d: region.path, class: 'geo-shape', tabindex: '0', role: 'button',
      'aria-label': region.label + '（' + region.area + '）', 'data-geo': region.id
    });
    const focus = () => { hovered = region.id; renderCard(); };
    const blur = () => { if (hovered === region.id) { hovered = null; renderCard(); } };
    path.addEventListener('mouseenter', focus);
    path.addEventListener('mouseleave', blur);
    path.addEventListener('focus', focus);
    path.addEventListener('blur', blur);
    path.addEventListener('click', () => pick(region.id));
    path.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(region.id); }
      if (event.key === 'Escape') { pinned = null; renderCard(); }
    });
    shapes.set(region.id, path);
    svg.append(path);
    if (region.labelAt) svg.append(svgNode('text', { x: region.labelAt.x, y: region.labelAt.y, class: 'geo-label', 'aria-hidden': 'true' }, region.label));
  }
  mapBox.append(svg);
  host.append(el('div', { class: 'geo-shell' }, mapBox, cardBox),
    status);

  function pick(id) {
    pinned = id;
    renderCard();
    const button = cardBox.querySelector('[data-geo-apply]');
    button?.focus();
  }

  function renderCard() {
    // 卡片默认收起，鼠标移到某个区域或点击固定后才出现，让地图占满主区。
    const showCard = Boolean(hovered || pinned);
    cardBox.hidden = !showCard;
    // 收起卡片时只撤掉悬停高亮，保留“当前研究地区”的描边。
    if (!showCard) { shapes.forEach(path => path.classList.remove('is-active')); return; }
    const scope = getScope();
    const region = MAP_BY_SCOPE.get(scope) || null;
    const shown = MAP_BY_SCOPE.get(MAP_REGIONS.find(item => item.id === (pinned || hovered || region?.id || '京津冀'))?.scopeValue) || MAP_REGIONS[0];
    shapes.forEach((path, id) => {
      path.classList.toggle('is-active', id === shown.id);
      path.classList.toggle('is-current', region?.id === id);
    });
    // 卡片放到被看区域的反侧，避免压住用户正在看的形状。
    // 依据标注点相对 viewBox 中心的位置判断左上/右下；没有标注点的（京津冀整体）放左上。
    const at = shown.labelAt;
    const cx = MAP_VIEW.x + MAP_VIEW.width / 2, cy = MAP_VIEW.y + MAP_VIEW.height / 2;
    const side = !at ? 'left' : (at.x > cx ? 'left' : 'right');
    const vert = !at ? 'top' : (at.y > cy ? 'top' : 'bottom');
    cardBox.classList.remove('at-left', 'at-right', 'at-top', 'at-bottom');
    cardBox.classList.add('at-' + side, 'at-' + vert);
    const coverage = regionCoverage(context.store.read(), shown.scopeValue);
    const clauses = projectClauses(context.store.read(), shown.scopeValue);
    const tools = toolsFor(shown.scopeValue);
    const previewing = shown.scopeValue !== scope;
    const impact = previewing ? regionImpact(context.store.read(), shown.scopeValue, { hasResults }) : null;

    // 默认只显示：地区名、资料收录摘要、查看政策资料；完整统计与数据性质说明都在详情里。
    const materialChildren = [
      el('dl', { class: 'geo-facts' },
        el('div', {}, el('dt', {}, '政策库'), el('dd', {}, coverage.library + ' 条工具记录（覆盖 ' + coverage.docCount + ' 份政策文件）属于「' + shown.scopeValue + '」' + (coverage.national ? '；另有国家父工具 ' + coverage.national + ' 条，不按地区计' : ''))),
        el('div', {}, el('dt', {}, '关联'), el('dd', {}, coverage.matched + ' 条工具记录已关联描述符（直接 ' + coverage.direct + '／部分对应 ' + coverage.partial + '）；待匹配 ' + coverage.pending + ' 条')),
        el('div', {}, el('dt', {}, '年份'), el('dd', {}, '生效年份未知 ' + coverage.yearsUnknown + ' 条；已知不等于适用于 2030/2035，平台不做前向填充')),
        el('div', {}, el('dt', {}, '覆盖'), el('dd', {}, coverageLabel(coverage) + (coverage.total ? '；46 项中 ' + coverage.covered + ' 项有条款' : ''))),
        el('div', {}, el('dt', {}, '背景数据'), el('dd', {}, '暂无已核数据，不展示'))),
            el('details', { class: 'geo-clauses' }, el('summary', {}, '本地区条款（' + (tools.length + clauses.length) + ' 条，列前 8 条）'),
        (tools.length + clauses.length) ? el('div', {},
          ...clauses.map(clause => el('p', { class: 'geo-tool' }, el('b', {}, clause.clauseId), ' ', clause.excerpt, el('span', { class: 'geo-clause-note' }, '本项目录入'))),
          ...tools.slice(0, 8).map(row => el('p', { class: 'geo-tool' },
            el('b', {}, row[ROW.path]), ' · ', row[ROW.name] || row[ROW.doc],
            el('span', { class: 'geo-clause-note' }, (row[ROW.start] ? row[ROW.start] + ' 年' : '年份未知') + ' · ' + row[ROW.jurisdiction] + (row[ROW.id] ? ' · ' + row[ROW.id] : '')))))
          : el('p', { class: 'geo-gap' }, '本地区暂无条款。')),
      el('details', { class: 'geo-levels' }, el('summary', {}, '更细层级（市／区县、园区）'),
        el('ul', {}, ...DEEPER_LEVELS.map(level => el('li', {}, el('strong', {}, level.label + '：' + level.status), ' ', level.reason))))];
    const facts = el('details', { class: 'geo-material' }, el('summary', {}, '查看政策资料'),
      ...materialChildren.slice(1).filter(Boolean));
    facts.prepend(materialChildren[0]);

    cardBox.replaceChildren(...[
      el('div', { class: 'geo-card-hd' }, el('h3', {}, shown.label), el('span', { class: 'geo-level' }, shown.level === 'region' ? '区域口径' : '省级行政区')),
      previewing ? el('div', { class: 'geo-impact' }, el('p', { class: 'geo-preview-cap' }, '预览：尚未应用到项目。'), ...impact.lines.map(line => el('p', {}, line))) : null,
      previewing ? null : el('p', { class: 'geo-current-static' }, '✓ 当前研究地区'),
      previewing ? el('div', { class: 'geo-actions' },
        el('button', { class: 'button primary-action', type: 'button', 'data-geo-apply': '', onclick: () => apply(shown) }, '研究这个地区')) : null,
      facts].filter(Boolean));
  }

  function apply(region) {
    const result = onApply(region.scopeValue);
    if (!result?.ok) { status.textContent = result?.message || '地区未应用。'; return; }
    applied = region.id;
    // 保留卡片：用户刚做完选择，需要看到「当前研究地区」的确认。
    pinned = region.id; hovered = null;
    status.textContent = '已将研究地区设为「' + region.scopeValue + '」。';
    renderCard();
    // 应用后把当前地区描亮，用户知道刚才选的是哪一块。
    const path = shapes.get(region.id);
    path?.classList.add('is-current');
  }

  renderCard();
  // 打开页面时把已选地区描亮（卡片仍然收起，鼠标移上去才弹）。
  {
    const scopeNow = getScope();
    const regionNow = MAP_BY_SCOPE.get(scopeNow);
    if (regionNow) shapes.get(regionNow.id)?.classList.add('is-current');
  }
  return {
    setActive() { renderCard(); },
    render() { renderCard(); },
    dispose() { host.replaceChildren(); }
  };
}

// 结果页的「情景地图」：只画本次真实冻结结果里的自洽组合，与上面的地理入口不是同一件事。
export { regionForScope, GEO_SOURCE, infoTip };
