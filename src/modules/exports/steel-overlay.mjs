export const STEEL_FORMAT = 'gcam-steel-coefficient-overlay';
export const STEEL_MAX_BYTES = 128 * 1024 * 1024;
export const STEEL_OPERATIONS = [
  { id: 'set-coefficient', label: '指定新的系数', formula: '新系数 = 填写值' },
  { id: 'coefficient-multiplier', label: '系数乘以指定倍率', formula: '新系数 = 原系数 × 倍率' },
  { id: 'coefficient-decrease-percent', label: '系数降低百分比', formula: '新系数 = 原系数 × (1 − 百分比/100)' },
  { id: 'reciprocal-efficiency-increase-percent', label: '倒数效率提高百分比', formula: '新系数 = 原系数 ÷ (1 + 百分比/100)，仅同一投入—产出基准' }
];

function requireValue(ok, message) { if (!ok) throw new Error(message); }
function finite(value) {
  requireValue(typeof value === 'number' && Number.isFinite(value), '数值必须为有限数字；空值、文字和布尔值不能参与计算。');
  return value;
}
function text(value) { requireValue(typeof value === 'string' && value.length > 0 && value.trim() === value, '名称或单位缺失，或含首尾空白。'); return value; }
function exactKeys(value, names) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...names].sort().join('|'), '请求字段不完整或含未知字段。');
}
const children = (node, tag) => [...node.children].filter(n => n.tagName === tag && !n.namespaceURI);
const matching = (node, tag, attrs = {}) => children(node, tag).filter(n => Object.entries(attrs).every(([key, value]) => n.getAttribute(key) === value));
function unique(node, tag, attrs = {}) {
  const found = matching(node, tag, attrs);
  requireValue(found.length === 1, `${tag} ${Object.values(attrs).join(' / ')} 节点应唯一，实际找到 ${found.length} 个。`);
  return found[0];
}
function childText(node, tag) { return text(unique(node, tag).textContent); }
function sourceSpec(spec, file) {
  requireValue(file && spec.path === file.name && /^[0-9a-f]{64}$/.test(spec.sha256) && spec.sha256 === file.sha256, '所选文件或文件版本与请求不符，请重新核对。');
}

export function calculateSteelCoefficient(baseline, operation) {
  finite(baseline);
  exactKeys(operation, ['kind', 'value']);
  const value = finite(operation.value);
  requireValue(baseline >= 0 && value >= 0, '原系数与操作数值均须非负。');
  requireValue(STEEL_OPERATIONS.some(row => row.id === operation.kind), '请选择明确的系数操作；成本和份额不是投入系数。');
  let result;
  if (operation.kind === 'set-coefficient') result = value;
  else if (operation.kind === 'coefficient-multiplier') result = baseline * value;
  else if (operation.kind === 'coefficient-decrease-percent') {
    requireValue(value <= 100, '系数降低百分比不能超过100。');
    result = baseline * (1 - value / 100);
  } else {
    requireValue(baseline > 0, '原系数为0时，倒数效率没有有限定义。');
    result = baseline / (1 + value / 100);
  }
  return finite(result);
}

export function steelOverlayXml(target, value) {
  finite(value);
  requireValue(value >= 0 && Number.isInteger(target.year) && target.year >= 1900 && target.year <= 2300, '写入值或年份无效。');
  requireValue(target.sector === 'iron and steel', '此组件只处理钢铁行业。');
  const escape = value => text(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll('\r', '&#13;').replaceAll('\n', '&#10;').replaceAll('\t', '&#9;');
  const chain = [['world', null], ['region', target.region], ['supplysector', target.sector], ['subsector', target.subsector], ['stub-technology', target.technology], ['period', String(target.year)], ['minicam-energy-input', target.input]];
  const lines = ["<?xml version='1.0' encoding='utf-8'?>", '<scenario>'];
  chain.forEach(([tag, name], i) => lines.push('  '.repeat(i + 1) + '<' + tag + (name === null ? '' : ` ${tag === 'period' ? 'year' : 'name'}="${escape(name)}"`) + '>'));
  lines.push('  '.repeat(8) + `<coefficient>${value}</coefficient>`);
  [...chain].reverse().forEach(([tag], i) => lines.push('  '.repeat(7 - i) + `</${tag}>`));
  lines.push('</scenario>');
  return lines.join('\n');
}

export async function steelSha256(bytes) {
  requireValue(globalThis.crypto?.subtle, '当前浏览器无法核对文件哈希，请使用支持本地文件核验的新版浏览器。');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
}

export async function readSteelXml(name, bytes) {
  text(name);
  const raw = new Uint8Array(bytes).slice();
  requireValue(raw.byteLength > 0 && raw.byteLength <= STEEL_MAX_BYTES, 'XML文件为空或超过128 MiB。');
  let decoded;
  try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { throw new Error('XML必须使用UTF-8编码。'); }
  requireValue(!/<!\s*(DOCTYPE|ENTITY)\b/i.test(decoded), '不支持带DTD或实体声明的XML。');
  const document = new DOMParser().parseFromString(decoded, 'application/xml');
  requireValue(!document.getElementsByTagName('parsererror').length && document.documentElement.tagName === 'scenario' && !document.documentElement.namespaceURI, 'XML无法解析，或根节点不是无命名空间的scenario。');
  unique(document.documentElement, 'world');
  return { name, sha256: await steelSha256(raw), document, bytes: raw.byteLength };
}

export function steelTargets(file) {
  const rows = [];
  const world = unique(file.document.documentElement, 'world');
  for (const region of children(world, 'region')) for (const sector of matching(region, 'supplysector', { name: 'iron and steel' }))
    for (const sub of children(sector, 'subsector')) for (const tech of children(sub, 'stub-technology'))
      for (const period of children(tech, 'period')) for (const input of children(period, 'minicam-energy-input'))
        rows.push({ region: region.getAttribute('name'), sector: 'iron and steel', subsector: sub.getAttribute('name'), technology: tech.getAttribute('name'), year: period.getAttribute('year'), input: input.getAttribute('name') });
  return rows;
}

export function describeSteelTarget(file, target) {
  for (const key of ['region', 'sector', 'subsector', 'technology', 'input']) text(target[key]);
  requireValue(target.sector === 'iron and steel' && Number.isInteger(target.year) && target.year >= 1900 && target.year <= 2300, '请选择钢铁节点和有效年份。');
  const world = unique(file.document.documentElement, 'world');
  const region = unique(world, 'region', { name: target.region });
  const sector = unique(region, 'supplysector', { name: target.sector });
  requireValue(childText(sector, 'output-unit') === 'Mt', '钢铁产出单位须明确为Mt。');
  const sub = unique(sector, 'subsector', { name: target.subsector });
  const tech = unique(sub, 'stub-technology', { name: target.technology });
  const period = unique(tech, 'period', { year: String(target.year) });
  const input = unique(period, 'minicam-energy-input', { name: target.input });
  requireValue(!children(input, 'efficiency').length, '此节点同时指定efficiency，需另行核查优先级。');
  const coefficient = unique(input, 'coefficient');
  requireValue(!coefficient.attributes.length && !coefficient.children.length, '不支持带属性或子节点的coefficient，需另行核查范围。');
  const raw = coefficient.textContent.trim();
  requireValue(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw), '原系数不是有效数字。');
  const baseline = finite(Number(raw));
  requireValue(baseline >= 0, '原系数须非负。');
  return { baseline, market: childText(input, 'market-name') };
}

export function findSteelCommodity(files, target, market) {
  const matches = [];
  const seen = new Set();
  for (const file of files.filter(Boolean)) {
    if (seen.has(file.sha256)) continue;
    seen.add(file.sha256);
    const world = unique(file.document.documentElement, 'world');
    for (const region of matching(world, 'region', { name: market })) for (const kind of ['supplysector', 'unlimited-resource'])
      for (const supplier of matching(region, kind, { name: target.input })) matches.push({ file, kind, unit: childText(supplier, 'output-unit') });
  }
  requireValue(matches.length === 1, matches.length ? '找到多个商品单位定义，请移除多余的单位证明文件后再核对。' : `缺少 ${market} / ${target.input} 的商品单位定义，请选择包含此节点的单位证明XML。`);
  requireValue(['EJ', 'Mt'].includes(matches[0].unit), '商品输出单位目前只支持EJ或Mt。');
  return matches[0];
}

export async function verifySteelRequest(request, source, commodity) {
  exactKeys(request, ['format', 'version', 'testOnly', 'source', 'target', 'commodity', 'operation']);
  requireValue(request.format === STEEL_FORMAT && request.version === 1 && request.testOnly === true, '只接受v1工程测试请求，不代表研究映射已审定。');
  exactKeys(request.source, ['path', 'sha256']);
  exactKeys(request.target, ['region', 'sector', 'subsector', 'technology', 'year', 'input', 'expectedBaseline', 'unit']);
  exactKeys(request.commodity, ['path', 'sha256', 'region', 'kind', 'name']);
  sourceSpec(request.source, source); sourceSpec(request.commodity, commodity);
  requireValue(source.name !== commodity.name || source.sha256 === commodity.sha256, '两个文件同名但内容不同，请先重命名再选择。');
  const target = request.target, info = describeSteelTarget(source, target);
  requireValue(finite(target.expectedBaseline) === info.baseline, '原系数与预期原值不符，不自动改基准。');
  const proof = request.commodity;
  requireValue(proof.name === target.input && proof.region === info.market && ['supplysector', 'unlimited-resource'].includes(proof.kind), '商品证明与投入项、市场不一致。');
  const world = unique(commodity.document.documentElement, 'world');
  const region = unique(world, 'region', { name: proof.region });
  const supplier = unique(region, proof.kind, { name: proof.name });
  const unit = childText(supplier, 'output-unit');
  requireValue(['EJ', 'Mt'].includes(unit) && target.unit === unit + '/Mt', '请求单位与源文件的商品/产出单位不一致。');
  const written = calculateSteelCoefficient(info.baseline, request.operation);
  const xml = steelOverlayXml(target, written);
  const audit = {
    format: STEEL_FORMAT + '-audit', version: 1, testOnly: true,
    researchMappingApproved: false, cibConsistencyEvaluated: false, nativeModelRun: 'not-performed-by-this-adapter',
    sourceSha256: source.sha256, target: { ...target }, commodityUnit: unit, coefficientUnit: target.unit, market: info.market,
    operation: { ...request.operation }, writtenCoefficient: written, overlaySha256: await steelSha256(new TextEncoder().encode(xml)),
    leafChanges: 1, scope: 'One explicit coefficient of one new vintage; not a whole-industry energy or technology-share target',
    sameVintageMayOperateInLaterYears: true,
    loading: 'Append after all components that modify this node. This adapter does not validate the complete configuration or later overwrites.',
    sources: [{ role: 'steel', sha256: source.sha256 }, { role: 'commodity', sha256: commodity.sha256 }]
  };
  return { xml, audit, request: structuredClone(request) };
}
