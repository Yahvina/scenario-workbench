// 知识库：把项目里已经存在的依据、判断与政策库记录放在一处检索。
// 五类：政策 / 文献 / 历史数据 / 专家意见 / 用户假设（依据记录的 kind 原样使用，不新增类别）。
// 同时给一份「引用反查」：从一条依据回到引用它的判断；没有依据的判断也列出来。
// 这一页不抓取、不生成、不改项目。
import { POLICY_ROWS, PATH_LINKS } from '../../fixtures/policy-library.mjs';
import { evidenceKindLabel } from '../review/logic.mjs';

const KINDS = ['policy', 'paper', 'historical-data', 'expert', 'user-assumption'];

// 检索用的归一化：小写，去掉空白与常见分隔符（: / -），
// 让用户随手打的 "doi 10.1/a" 也能对上记录里的 "DOI:10.1/A"。
export function normalize(text) {
  return String(text ?? '').toLowerCase().replace(/[\s:\/\-_.]+/g, '');
}

// 项目内的依据记录 → 检索条目。
export function projectEntries(project) {
  const use = new Map();
  for (const j of project.data.judgments) for (const id of j.evidenceRefs || []) use.set(id, (use.get(id) || 0) + 1);
  return project.data.evidence.map(ev => ({
    id: ev.id,
    kind: ev.kind,
    label: evidenceKindLabel(ev.kind),
    sourceId: ev.sourceId,
    locator: ev.locator,
    excerpt: ev.excerpt,
    reviewStatus: ev.reviewStatus || 'draft',
    citedBy: use.get(ev.id) || 0,
    from: 'project'
  }));
}

// 同学数据集 → 检索条目。只按已建立的路径标出与当前项目相关的部分，不重写内容。
export function libraryEntries(project) {
  const label = id => project.data.descriptors.find(d => d.id === id)?.label || id;
  const wanted = new Set(project.selection.descriptorIds);
  return POLICY_ROWS.map(row => {
    const link = PATH_LINKS[row[1]] || null;
    return {
      id: row[0], kind: 'policy', label: '政策工具',
      name: row[2], path: row[1], jurisdiction: row[3], level: row[4],
      startYear: row[5], endYear: row[6], category: row[7], group: row[8], document: row[11],
      descriptorIds: link?.ids || [],
      descriptorLabels: (link?.ids || []).map(label),
      linkLevel: link?.level || null,
      from: 'library',
      relevant: !!link && link.ids.some(id => wanted.has(id))
    };
  });
}

// 五类 + 其他；计数按传入条目算，不虚报。
export function counts(entries) {
  const byKind = new Map(KINDS.map(k => [k, 0]));
  for (const e of entries) {
    const key = KINDS.includes(e.kind) ? e.kind : 'other';
    byKind.set(key, (byKind.get(key) || 0) + 1);
  }
  return { total: entries.length, byKind };
}

export function search(entries, { query = '', kind = 'all', onlyRelevant = false, source = 'all' } = {}) {
  const q = normalize(query);
  return entries.filter(e => {
    if (source !== 'all' && e.from !== source) return false;
    if (kind !== 'all' && e.kind !== kind) return false;
    if (onlyRelevant && !e.relevant) return false;
    if (q && !normalize([e.name, e.path, e.jurisdiction, e.document, e.sourceId, e.locator, e.excerpt, e.group, e.category].join(' ')).includes(q)) return false;
    return true;
  });
}

// 引用反查：从一条依据回到引用它的判断；反过来也列出没有依据的判断。
export function citationIndex(project) {
  const name = id => project.data.descriptors.find(d => d.id === id)?.label || id;
  const byEvidence = new Map();
  for (const j of project.data.judgments) {
    const label = name(j.sourceDescriptorId) + ' → ' + name(j.targetDescriptorId);
    for (const id of j.evidenceRefs || []) {
      if (!byEvidence.has(id)) byEvidence.set(id, []);
      byEvidence.get(id).push({ judgmentId: j.id, label });
    }
  }
  const bare = project.data.judgments
    .filter(j => !(j.evidenceRefs || []).length)
    .map(j => ({ judgmentId: j.id, label: name(j.sourceDescriptorId) + ' → ' + name(j.targetDescriptorId) }));
  const dangling = [...byEvidence.keys()].filter(id => !project.data.evidence.some(e => e.id === id));
  return { byEvidence, bare, dangling };
}
