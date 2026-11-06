// 政策库：把同学的数据集接进地图与 46 项目录。
// 规则：只用数据表里已有的字段；N/A 保持 null（未知），不补 0、不向前填充年份；
// 描述符关联只走 PATH_LINKS 里明确的路径，其余一律“待匹配”，不硬分配。
import { POLICY_ROWS, POLICY_LIBRARY_SOURCE, JURISDICTION_PROVINCE, PARK_JURISDICTIONS, PATH_LINKS } from '../../fixtures/policy-library.mjs';

export const ROW = { id: 0, path: 1, name: 2, jurisdiction: 3, level: 4, start: 5, end: 6, category: 7, group: 8, parent: 9, match: 10, doc: 11 };
const PARKS = new Set(PARK_JURISDICTIONS);

export function libraryMeta() {
  return {
    imported: POLICY_ROWS.length > 0,
    rows: POLICY_ROWS.length,
    source: POLICY_LIBRARY_SOURCE,
    linkedPaths: Object.keys(PATH_LINKS).length
  };
}

function provinceOf(row) {
  if (row[ROW.level] === '国家级') return null;
  return JURISDICTION_PROVINCE[row[ROW.jurisdiction]] ?? null;
}

export function toolsFor(scopeValue, { includeNational = false } = {}) {
  return POLICY_ROWS.filter(row => {
    const province = provinceOf(row);
    if (!province) return includeNational;
    if (scopeValue === '京津冀') return true;
    // 省级口径：该省下的记录都算（含区县与功能区）。
    if (province === scopeValue) return true;
    // 市级口径：只认管辖地正好是这个市的记录；省级记录不摊到市里。
    return row[ROW.jurisdiction] === scopeValue;
  });
}

export function libraryCoverage(scopeValue) {
  const rows = toolsFor(scopeValue);
  const national = toolsFor(scopeValue, { includeNational: true }).filter(row => !provinceOf(row)).length;
  const linked = new Set();
  let matched = 0, yearsUnknown = 0, parks = 0, direct = 0, partial = 0;
  const docs = new Set();
  const byPath = new Map();
  for (const row of rows) {
    const link = PATH_LINKS[row[ROW.path]];
    if (link) {
      matched++;
      link.level === 'direct' ? direct++ : partial++;
      for (const id of link.ids) linked.add(id);
    }
    if (row[ROW.start] === null) yearsUnknown++;
    if (row[ROW.doc]) docs.add(row[ROW.doc]);
    if (PARKS.has(row[ROW.jurisdiction])) parks++;
    const entry = byPath.get(row[ROW.path]) || { path: row[ROW.path], count: 0, linked: !!link };
    entry.count++;
    byPath.set(row[ROW.path], entry);
  }
  return {
    imported: POLICY_ROWS.length > 0,
    total: rows.length,
    national,
    matched, pending: rows.length - matched, direct, partial,
    yearsUnknown, parks,
    docCount: docs.size,
    descriptors: [...linked],
    paths: [...byPath.values()].sort((a, b) => b.count - a.count)
  };
}

export function pathLink(path) {
  return PATH_LINKS[path] || null;
}

// 某个描述符在本地区有哪些政策条款（只返回已建立关联的；待匹配的不冒充）。
export function toolsForDescriptor(scopeValue, descriptorId) {
  return toolsFor(scopeValue).filter(row => (PATH_LINKS[row[ROW.path]]?.ids || []).includes(descriptorId));
}
