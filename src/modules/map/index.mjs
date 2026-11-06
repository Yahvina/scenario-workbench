import { el, infoTip } from '../../core/ui.mjs';
import { GEO_SOURCE, MAP_REGIONS, MAP_AREAS, CITY_SCOPE_AREAS, MAP_VIEW, MAP_BY_SCOPE, DEEPER_LEVELS, regionCoverage, coverageLabel, projectClauses, regionImpact, regionForScope } from './geo.mjs';
import { toolsFor, libraryMeta, ROW } from './library.mjs';

const NS = 'http://www.w3.org/2000/svg';
// 北京、天津的名字是地图底图的一部分，永远显示；市名只在悬停或选中时出现。
const PERMANENT_LABELS = new Set(['北京', '天津']);
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

  const svg = svgNode('svg', { viewBox: `${MAP_VIEW.x} ${MAP_VIEW.y} ${MAP_VIEW.width} ${MAP_VIEW.height}`, role: 'img', 'aria-label': '京津冀示意图：可选北京、天津与河北 11 个设区市' });

  // 一个范围可能对应多个图形（河北有底色和小标签两处），所以一个 id 存一组节点。
  const shapes = new Map();
  const register = (id, node) => {
    if (!shapes.has(id)) shapes.set(id, []);
    shapes.get(id).push(node);
  };
  // 地图色块与整块按钮分开点亮：地图只在选中单块时上色，按钮负责表示整块范围。
  const isButton = node => String(node.tagName).toLowerCase() === 'button';
  const markShapes = (id, on, kind = 'path') => {
    for (const node of shapes.get(id) || []) {
      if (isButton(node) === (kind === 'button')) node.classList.toggle('is-current', on);
    }
  };
  const names = new Map();

  // 河北设区市的分界只该出现在河北境内。北京、天津挖成孔：被剪掉的地方
  // 既不画线也不接鼠标，点京津不会被某个市的分区抢走。
  const clipId = 'geo-city-clip';
  const clip = svgNode('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
  clip.append(svgNode('path', {
    d: ['河北', '北京', '天津'].map(cut => MAP_REGIONS.find(item => item.id === cut)?.path).filter(Boolean).join(' '),
    'clip-rule': 'evenodd'
  }));
  const defs = svgNode('defs');
  defs.append(clip);
  svg.append(defs);

  // 三层，自下而上：省域底色 → 河北设区市分界 → 名称。名称在最上层，
  // 所以地图上的小标签不会被任何色块或市分区挡住。
  const regionLayer = svgNode('g', { class: 'geo-layer-region' });
  const cityLayer = svgNode('g', { class: 'geo-layer-city', 'clip-path': 'url(#' + clipId + ')' });
  const labelLayer = svgNode('g', { class: 'geo-layer-label' });
  svg.append(regionLayer, cityLayer, labelLayer);

  const bind = (id, node, caption) => {
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', caption);
    node.setAttribute('data-geo', id);
    node.addEventListener('mouseenter', () => { hovered = id; renderCard(); });
    node.addEventListener('mouseleave', () => { if (hovered === id) { hovered = null; renderCard(); } });
    node.addEventListener('focus', () => { hovered = id; renderCard(); });
    node.addEventListener('blur', () => { if (hovered === id) { hovered = null; renderCard(); } });
    node.addEventListener('click', () => pick(id));
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(id); }
      if (event.key === 'Escape') { pinned = null; renderCard(); }
    });
    register(id, node);
    return node;
  };

  // 省域：河北在最底、北京天津压在上面，京津的点选稳定命中京津自己。
  // 河北整块会被 11 个市完全盖住，所以它只当底色、不接鼠标。
  for (const region of [...MAP_REGIONS].reverse()) {
    if (!region.path) continue;
    const node = svgNode('path', { d: region.path, class: 'geo-shape' });
    regionLayer.append(node);
    if (region.id === '河北') { node.classList.add('is-backdrop'); register(region.id, node); continue; }
    bind(region.id, node, region.label + '（' + region.area + '）');
  }

  // 河北 11 个设区市：只描示意分界，默认透明，悬停或选中才上色。
  for (const city of CITY_SCOPE_AREAS) {
    const node = svgNode('path', { d: city.path, class: 'geo-city' });
    cityLayer.append(node);
    bind(city.id, node, city.scopeValue + '（地级市示意分区）');
  }

  // 名称：北京、天津常显；河北写在地图上；市名默认隐藏，悬停或选中才出现。
  for (const area of MAP_REGIONS) {
    if (area.id === '河北' || !area.labelAt) continue;
    const text = svgNode('text', { x: area.labelAt.x, y: area.labelAt.y, class: 'geo-label', 'data-label-for': area.id, 'aria-hidden': 'true' }, area.label);
    labelLayer.append(text);
    names.set(area.id, text);
  }
  labelLayer.append(svgNode('text', { x: 154, y: 258, class: 'geo-province-label', 'aria-hidden': 'true' }, '河北'));
  for (const city of CITY_SCOPE_AREAS) {
    if (!city.labelAt) continue;
    const text = svgNode('text', { x: city.labelAt.x, y: city.labelAt.y, class: 'geo-city-label', 'data-label-for': city.id, 'aria-hidden': 'true' }, city.label);
    labelLayer.append(text);
    names.set(city.id, text);
  }

  // 地图下方这排只放"整块"范围：京津冀是三地合计、河北被 11 个市盖住，两者都没有
  // 能直接点的整块形状；小块（京津与各市）在地图上点，整块的入口放在这里，两条路都通。
  const wholeRow = el('div', { class: 'geo-quick', role: 'group', 'aria-label': '整体范围' });
  wholeRow.append(
    el('span', { class: 'geo-quick-cap' }, '整体范围'),
    ...MAP_REGIONS
      .filter(region => region.id === '京津冀' || region.id === '河北')
      .map(region => {
        const button = el('button', { class: 'geo-quick-btn', type: 'button', 'data-geo': region.id }, region.label);
        bind(region.id, button, region.label + '（' + region.area + '）');
        return button;
      }));
  mapBox.append(svg, wholeRow);

  host.append(el('div', { class: 'geo-shell' }, mapBox, cardBox), status);

  function pick(id) {
    pinned = id;
    renderCard();
    cardBox.querySelector('[data-geo-apply]')?.focus();
  }

  function renderCard() {
    // 卡片默认收起，鼠标移到某个区域或点击固定后才出现，让地图占满主区。
    const showCard = Boolean(hovered || pinned);
    cardBox.hidden = !showCard;
    const scope = getScope();
    const current = MAP_BY_SCOPE.get(scope) || null;
    if (!showCard) {
      // 收起卡片时清掉悬停高亮；市名也收回，只留当前范围那一个。
      for (const id of shapes.keys()) markShapes(id, false, 'path');
      for (const [id, text] of names) {
        text.classList.toggle('is-active', false);
        if (!PERMANENT_LABELS.has(id)) text.classList.toggle('is-shown', id === current?.id);
      }
      return;
    }
    // 在合并后的区域表里查找：省与市共用同一条查找链，市级不会回落到「京津冀整体」。
    const shown = MAP_BY_SCOPE.get(MAP_AREAS.find(item => item.id === (pinned || hovered || current?.id || '京津冀'))?.scopeValue) || MAP_AREAS[0];
    for (const [id, text] of names) {
      text.classList.toggle('is-active', id === shown.id);
      if (!PERMANENT_LABELS.has(id)) text.classList.toggle('is-shown', id === shown.id || id === current?.id);
    }
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
      el('details', { class: 'geo-levels' }, el('summary', {}, '还能细到哪一级'),
        el('ul', {}, ...DEEPER_LEVELS.map(level => el('li', {}, el('strong', {}, level.label + '：' + level.status), ' ', level.reason))))];
    const facts = el('details', { class: 'geo-material' }, el('summary', {}, '查看政策资料'),
      ...materialChildren.slice(1).filter(Boolean));
    facts.prepend(materialChildren[0]);

    cardBox.replaceChildren(...[
      el('div', { class: 'geo-card-hd' }, el('h3', {}, shown.label), el('span', { class: 'geo-level' }, shown.level === 'region' ? '区域口径' : shown.level === 'city' ? '地级市' : '省级行政区')),
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
    syncCurrent();
    renderCard();
  }

  // 当前研究范围一眼看得出来：选哪块就点亮哪块。京津冀是三地合计，没有单独形状，
  // 所以点亮那枚整块按钮，地图保持浅色。
  function syncCurrent() {
    const scopeNow = getScope();
    const id = scopeNow === '京津冀' ? '京津冀' : (MAP_BY_SCOPE.get(scopeNow)?.id || null);
    for (const key of shapes.keys()) {
      markShapes(key, key === id && key !== '京津冀', 'path');
      markShapes(key, key === id, 'button');
    }
  }

  syncCurrent();
  renderCard();
  return {
    setActive() { syncCurrent(); renderCard(); },
    render() { syncCurrent(); renderCard(); },
    dispose() { host.replaceChildren(); }
  };
}

// 结果页的「情景地图」：只画本次真实冻结结果里的自洽组合，与上面的地理入口不是同一件事。
export { regionForScope, GEO_SOURCE, infoTip };
