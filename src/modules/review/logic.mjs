// 分析校核（单人自查版）：只读项目，列出「口径」与「依据」两类可核对项。
// 口径 = 这条记录怎么写范围/年份/直接性；依据 = 这条记录引用了哪些证据、属于什么性质。
// 只报告事实与缺口，不替用户打分、不改项目、不生成结论。
import { POLICY_ROWS, PATH_LINKS } from '../../fixtures/policy-library.mjs';
import { PARK_JURISDICTIONS } from '../../fixtures/policy-library.mjs';

const REFERENCE_PREFIX = 'reference:';

export function evidenceKindLabel(kind) {
  return ({
    policy: '政策文件',
    paper: '论文/方法',
    'historical-data': '历史数据',
    expert: '专家意见',
    'user-assumption': '用户假设',
    fixture: '机制示例'
  })[kind] || kind || '未标注';
}

// 记录是不是参考填入的（参考包把 sourceId 写成 reference:xxx，且留了一条同源证据）。
export function originOf(record, project) {
  const sid = String(record?.provenance?.sourceId || '');
  const isReference = sid.startsWith(REFERENCE_PREFIX) || (record?.evidenceRefs || []).some(id => {
    const ev = project.data.evidence.find(e => e.id === id);
    return ev && String(ev.sourceId || '').startsWith(REFERENCE_PREFIX);
  });
  if (isReference) return { kind: 'reference', label: '演示参考', note: '这条是参考填入，可修改，非实时 AI 生成；用于演示不等于政策结论。' };
  if ((record?.evidenceRefs || []).some(id => project.data.evidence.find(e => e.id === id)?.kind === 'fixture')) {
    return { kind: 'fixture', label: '机制示例', note: '依据里含机制示例记录，只能验证软件机制。' };
  }
  return { kind: 'user', label: '自行填写', note: '没有参考包痕迹；依据仍以引用的记录为准。' };
}

// 一条判断记录的引用依据明细；引用不到的证据单独列出，不假装存在。
export function evidenceOf(record, project) {
  const refs = record?.evidenceRefs || [];
  const found = [], missing = [];
  for (const id of refs) {
    const ev = project.data.evidence.find(e => e.id === id);
    (ev ? found : missing).push(ev || id);
  }
  return { refs, found: found.map(summarizeEvidence), missing };
}

function summarizeEvidence(ev) {
  return { id: ev.id, kind: ev.kind, label: evidenceKindLabel(ev.kind), sourceId: ev.sourceId, locator: ev.locator, reviewStatus: ev.reviewStatus || 'draft', excerpt: ev.excerpt };
}

// 口径核对：范围/年份/直接性/状态覆盖四项，逐条给出事实与是否对得上当前项目。
export function scopeChecks(project, year) {
  const region = project.scope.regionId || null;
  const label = id => project.data.descriptors.find(d => d.id === id)?.label || id;
  return project.data.judgments.map(j => {
    const from = label(j.sourceDescriptorId), to = label(j.targetDescriptorId);
    const recRegion = j.scope?.regionId ?? null;
    const recYears = Array.isArray(j.validYears) ? [...j.validYears].sort((a, b) => a - b) : [];
    const srcStates = project.data.descriptors.find(d => d.id === j.sourceDescriptorId)?.stateIds.length || 0;
    const tgtStates = project.data.descriptors.find(d => d.id === j.targetDescriptorId)?.stateIds.length || 0;
    const required = srcStates * tgtStates;
    const filled = (j.entries || []).filter(e => Number.isInteger(e.score)).length;
    return {
      id: j.id, name: from + ' → ' + to, origin: originOf(j, project), evidence: evidenceOf(j, project),
      region: {
        value: recRegion, ok: !!region && recRegion === region,
        note: !recRegion ? '记录没写适用地区' : (recRegion === region ? '与项目一致' : '记录写的是「' + recRegion + '」')
      },
      years: {
        value: recYears, ok: recYears.length > 0 && Number.isInteger(year) && recYears.includes(year),
        note: !recYears.length ? '记录没写适用年份'
          : (Number.isInteger(year) && recYears.includes(year) ? '覆盖本次 ' + year : '写的是 ' + recYears.join('/'))
      },
      directness: j.directness || 'unknown',
      coverage: { filled, required, ok: required > 0 && filled === required },
      reviewStatus: j.reviewStatus || 'draft'
    };
  });
}

// 校核汇总：每类问题各有多少条，便于一眼看还剩什么。
export function checkSummary(rows) {
  const count = test => rows.filter(test).length;
  return {
    total: rows.length,
    regionMismatch: count(r => !r.region.ok),
    yearMismatch: count(r => !r.years.ok),
    coverageGap: count(r => !r.coverage.ok),
    noEvidence: count(r => r.evidence.refs.length === 0),
    referenceOrigin: count(r => r.origin.kind !== 'user'),
    missingEvidence: count(r => r.evidence.missing.length > 0),
    notReviewed: count(r => r.reviewStatus !== 'reviewed')
  };
}

// 依据清单：项目里所有证据记录，标出被多少条判断引用、属于什么性质。
export function evidenceLedger(project) {
  const use = new Map();
  for (const j of project.data.judgments) for (const id of j.evidenceRefs || []) use.set(id, (use.get(id) || 0) + 1);
  const byId = new Map(project.data.evidence.map(e => [e.id, e]));
  const used = project.data.evidence.map(ev => ({ ...summarizeEvidence(ev), used: use.get(ev.id) || 0 }))
    .sort((a, b) => b.used - a.used || String(a.kind).localeCompare(String(b.kind)));
  const dangling = [...use.keys()].filter(id => !byId.has(id));
  return { used, dangling, unused: used.filter(e => !e.used).length };
}

// 政策库关联核对：当前项目选中的描述符里，哪些在同学数据集里已有明确路径、哪些还没有。
export function libraryChecks(project) {
  const linksByDescriptor = new Map();
  for (const [path, link] of Object.entries(PATH_LINKS)) {
    for (const id of link.ids) {
      if (!linksByDescriptor.has(id)) linksByDescriptor.set(id, []);
      linksByDescriptor.get(id).push({ path, level: link.level, note: link.note });
    }
  }
  const rows = project.selection.descriptorIds.map(id => ({
    descriptorId: id,
    label: project.data.descriptors.find(d => d.id === id)?.label || id,
    links: linksByDescriptor.get(id) || []
  }));
  return { rows, covered: rows.filter(r => r.links.length).length, total: rows.length };
}

export function libraryTotals() {
  const national = POLICY_ROWS.filter(r => r[4] === '国家级').length;
  return { rows: POLICY_ROWS.length, national, local: POLICY_ROWS.length - national, paths: Object.keys(PATH_LINKS).length };
}

export function parkJurisdictions() { return [...PARK_JURISDICTIONS]; }
