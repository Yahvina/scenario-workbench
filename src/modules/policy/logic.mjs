// 政策库与来源：只读同学的《京津冀低碳政策工具数据集》，可搜可筛。
// 数据口径：N/A 保持 null（未知），不补 0、不向前填充年份；描述符关联只走 PATH_LINKS 已建立的路径，
// 其余一律标“待匹配”，不硬分配。这一页不写项目、不改选择、不生成评分。
import { POLICY_LIBRARY_SOURCE, POLICY_ROWS, PATH_LINKS, JURISDICTION_PROVINCE, PARK_JURISDICTIONS } from '../../fixtures/policy-library.mjs';
import { ROW, libraryMeta } from '../map/library.mjs';

export function normalize(text) {
  return String(text ?? '').toLowerCase().replace(/\s+/g, '');
}

// 一行记录 → 展示对象。年份缺失就是 null，不写“0”。
export function decorate(row, descriptorName = id => id) {
  const link = PATH_LINKS[row[ROW.path]] || null;
  const province = JURISDICTION_PROVINCE[row[ROW.jurisdiction]] ?? null;
  return {
    id: row[ROW.id],
    path: row[ROW.path],
    name: row[ROW.name],
    jurisdiction: row[ROW.jurisdiction],
    level: row[ROW.level],
    startYear: row[ROW.start],
    endYear: row[ROW.end],
    category: row[ROW.category],
    group: row[ROW.group],
    nationalParent: row[ROW.parent],
    localMatch: row[ROW.match],
    document: row[ROW.doc],
    province,
    isPark: PARK_JURISDICTIONS.includes(row[ROW.jurisdiction]),
    link: link ? { level: link.level, ids: link.ids, note: link.note, labels: link.ids.map(descriptorName) } : null
  };
}

// 筛选口径全部显式：省份 / 类别 / 层级 / 是否有描述符关联 / 关键词。
export function filterRows(items, { province = 'all', category = 'all', level = 'all', link = 'all', query = '' } = {}) {
  const q = normalize(query);
  return items.filter(item => {
    if (province !== 'all') {
      if (province === '国家') { if (item.province !== null) return false; }
      else if (item.province !== province) return false;
    }
    if (category !== 'all' && item.category !== category) return false;
    if (level !== 'all' && item.level !== level) return false;
    if (link === 'linked' && !item.link) return false;
    if (link === 'pending' && item.link) return false;
    if (q && !normalize([item.name, item.path, item.jurisdiction, item.document, item.group].join(' ')).includes(q)) return false;
    return true;
  });
}

export function summarize(items) {
  const years = items.map(i => i.startYear).filter(Number.isInteger);
  const linked = items.filter(i => i.link);
  return {
    total: items.length,
    linked: linked.length,
    direct: linked.filter(i => i.link.level === 'direct').length,
    partial: linked.filter(i => i.link.level === 'partial').length,
    unknownYear: items.filter(i => i.startYear === null).length,
    jurisdictions: new Set(items.map(i => i.jurisdiction)).size,
    earliest: years.length ? Math.min(...years) : null,
    latest: years.length ? Math.max(...years) : null
  };
}

// 按某个字段汇总，用于筛选下拉里的计数；计数来自当前筛选结果，不是全库。
export function groupCounts(items, field) {
  const map = new Map();
  for (const item of items) {
    const key = item[field] ?? '未标注';
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

export function datasetSummary(descriptorName = id => id) {
  const items = POLICY_ROWS.map(row => decorate(row, descriptorName));
  return { items, meta: libraryMeta(), source: POLICY_LIBRARY_SOURCE, summary: summarize(items) };
}
