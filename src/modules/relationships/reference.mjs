// 参考评分：把“规则/案例”翻译成本项目里可核对的判断草稿。
// 原则：只按因素身份匹配（id 或名称），不按位置硬套；只填参考明确支持的方向；
// 默认只填空白格，0 与已有分值一律不动；覆盖必须另行确认；来源写进依据记录。
import { REFERENCE_PACKS } from '../../fixtures/reference-scores.mjs';

const pairKey = (a, b) => a + '|' + b;

function labelOf(project, descriptorId) {
  return project.data.descriptors.find(d => d.id === descriptorId)?.label || descriptorId;
}
function statesOf(project, descriptorId) {
  const d = project.data.descriptors.find(item => item.id === descriptorId);
  return (d?.stateIds || []).map(id => project.data.states.find(s => s.id === id)).filter(Boolean);
}
function byLabel(project, label) {
  return project.data.descriptors.find(d => d.label === label) || null;
}

// 按钮旁的适用范围摘要：不写项目、不算格子分值，只回答“这份参考能覆盖几个方向”。
// 用户应该在点开预览之前就知道它有没有用；完全没有支持规则时返回 none，界面改出手动出路。
export function referenceCoverage(project) {
  const ids = project.selection.descriptorIds;
  const total = ids.length * Math.max(0, ids.length - 1);
  if (ids.length < 2) return { state: 'need-factors', pack: null, matched: 0, total };
  const { pack, matchedRules = [] } = pickReferencePack(project);
  if (!pack) return { state: 'none', pack: null, matched: 0, total };
  const matched = pack.level === 'cell'
    ? pack.directions.filter(dir => ids.includes(dir.from) && ids.includes(dir.to)).length
    : matchedRules.length;
  if (!matched) return { state: 'none', pack: null, matched: 0, total };
  return { state: 'ok', pack, matched, total };
}

// 选出能用于当前项目的参考包：机制示例包按 id 命中，旧平台规则按名称命中。
export function pickReferencePack(project) {
  const ids = project.selection.descriptorIds;
  const demo = REFERENCE_PACKS.find(pack => pack.id === 'mechanism-demo');
  if (ids.includes('descriptor-a') && ids.includes('descriptor-b')) return { pack: demo, reason: '' };
  const r35 = REFERENCE_PACKS.find(pack => pack.id === 'mechanism-r35');
  if (ids.includes('mech-a') && ids.includes('mech-b')) return { pack: r35, reason: '' };
  // 旧目录与 46 项目录各有一份按名称命中的规则；谁命中的方向多就用谁，不混用两套分值。
  const candidates = ['jjj-airt', 'd46-mapped']
    .map(id => REFERENCE_PACKS.find(pack => pack.id === id))
    .map(pack => ({ pack, hit: pack.rules.filter(rule => byLabel(project, rule.from) && byLabel(project, rule.to)
      && ids.includes(byLabel(project, rule.from).id) && ids.includes(byLabel(project, rule.to).id)) }))
    .filter(item => item.hit.length)
    .sort((a, b) => b.hit.length - a.hit.length);
  if (candidates.length) return { pack: candidates[0].pack, reason: '', matchedRules: candidates[0].hit };
  return { pack: null, reason: '当前因素不在任何参考来源里：机制演示包按示例变量命中；旧平台规则与 46 项映射包按描述符名称命中，名称不在表里就不填。' };
}

// 生成一份“将要填什么”的计划，不写项目。
export function referencePlan(project, { year }) {
  const { pack, reason, matchedRules } = pickReferencePack(project);
  if (!pack) return { pack: null, reason, matched: [], skipped: [], totalCells: 0, emptyCells: 0 };
  const region = project.scope.regionId || null;
  const plan = { pack, year, region, years: [...project.scope.years], matched: [], skipped: [], totalCells: 0, emptyCells: 0 };

  const pushDirection = (fromId, toId, score, why, confidence, cells) => {
    if (fromId === toId) return;
    const sources = statesOf(project, fromId), targets = statesOf(project, toId);
    if (!sources.length || !targets.length) {
      plan.skipped.push({ from: fromId, to: toId, reason: '缺少状态定义' });
      return;
    }
    const entries = cells || sources.flatMap(a => targets.map(b => ({ sourceStateId: a.id, targetStateId: b.id, score })));
    const existing = project.data.judgments.find(j => j.sourceDescriptorId === fromId && j.targetDescriptorId === toId
      && j.scope?.regionId === region && Array.isArray(j.validYears) && j.validYears.includes(year));
    const filled = new Map((existing?.entries || []).map(e => [pairKey(e.sourceStateId, e.targetStateId), e.score]));
    let empty = 0, kept = 0;
    for (const e of entries) {
      const has = filled.has(pairKey(e.sourceStateId, e.targetStateId)) && filled.get(pairKey(e.sourceStateId, e.targetStateId)) !== null;
      if (has) kept++; else empty++;
    }
    plan.totalCells += entries.length;
    plan.emptyCells += empty;
    plan.matched.push({
      from: fromId, to: toId, fromLabel: labelOf(project, fromId), toLabel: labelOf(project, toId),
      score, why: why || '', confidence: confidence || '', entries, empty, kept, hasRecord: !!existing
    });
  };

  if (pack.level === 'cell') {
    for (const dir of pack.directions) {
      const from = project.selection.descriptorIds.includes(dir.from) ? dir.from : null;
      const to = project.selection.descriptorIds.includes(dir.to) ? dir.to : null;
      if (!from || !to) { plan.skipped.push({ from: dir.from, to: dir.to, reason: '当前项目没有这两个因素' }); continue; }
      const cells = dir.entries.map(([a, b, score]) => ({ sourceStateId: a, targetStateId: b, score }));
      pushDirection(from, to, null, pack.source, '', cells);
    }
  } else {
    for (const rule of matchedRules) {
      const from = byLabel(project, rule.from), to = byLabel(project, rule.to);
      pushDirection(from.id, to.id, rule.score, rule.why, rule.confidence, null);
    }
  }
  return plan;
}

// 落实计划：默认只填空白；overwrite=true 才覆盖已有分值（调用方必须先确认）。
export function applyReference(project, plan, { overwrite = false, newId } = {}) {
  if (!plan?.pack || !plan.matched.length) throw new Error('没有可填入的参考方向');
  const next = structuredClone(project);
  const evidenceId = newId();
  const stamp = new Date().toISOString();
  // 参考规则本身不分年份（描述符级/状态对级都只讲“谁影响谁”），
  // 所以按项目研究年份登记，而不是只写当年——否则换到 2035 就整批“范围不符”。
  const scopeYears = (plan.years && plan.years.length ? plan.years : [plan.year]).slice().sort((a, b) => a - b);
  let filled = 0, created = 0, preserved = 0;
  const ids = [];

  for (const item of plan.matched) {
    let record = next.data.judgments.find(j => j.sourceDescriptorId === item.from && j.targetDescriptorId === item.to
      && j.scope?.regionId === plan.region && Array.isArray(j.validYears) && j.validYears.includes(plan.year)) || null;
    const entries = new Map((record?.entries || []).map(e => [pairKey(e.sourceStateId, e.targetStateId), e.score]));
    let changed = 0;
    for (const cell of item.entries) {
      const key = pairKey(cell.sourceStateId, cell.targetStateId);
      const current = entries.has(key) ? entries.get(key) : null;
      if (current !== null && !overwrite) { preserved++; continue; }
      if (current !== null && overwrite && current === cell.score) continue;
      entries.set(key, cell.score); changed++;
    }
    if (!changed) continue;
    if (!record) {
      record = {
        id: newId(), sourceDescriptorId: item.from, targetDescriptorId: item.to, alternatives: [],
        scope: { regionId: plan.region }, validYears: [...scopeYears], directness: 'unknown', curveEncoding: null,
        entries: [], rationale: '', evidenceRefs: [], reviewStatus: 'draft', version: 1,
        provenance: { origin: 'user', sourceId: plan.pack.id, locator: 'reference:' + plan.pack.id }
      };
      next.data.judgments.push(record);
      created++;
    }
    const sources = statesOf(project, item.from), targets = statesOf(project, item.to);
    record.entries = sources.flatMap(a => targets.map(b => ({
      sourceStateId: a.id, targetStateId: b.id,
      score: entries.has(pairKey(a.id, b.id)) ? entries.get(pairKey(a.id, b.id)) : null
    })));
    record.validYears = [...new Set([...(record.validYears || []), ...scopeYears])].sort((a, b) => a - b);
    record.scope = { ...(record.scope || {}), regionId: record.scope?.regionId || plan.region };
    record.version = record.version + 1;
    record.reviewStatus = 'draft';
    record.rationale = (record.rationale ? record.rationale + '；' : '') + '参考填入（' + plan.pack.label + '）：' + (item.why || plan.pack.source);
    record.evidenceRefs = [...new Set([...(record.evidenceRefs || []), evidenceId])];
    record.provenance = { origin: 'user', sourceId: plan.pack.id, locator: 'reference:' + plan.pack.id };
    filled += changed;
    ids.push(record.id);
  }

  next.data.evidence.push({
    id: evidenceId,
    kind: plan.pack.id === 'mechanism-demo' ? 'fixture' : 'user-assumption',
    sourceId: 'reference:' + plan.pack.id,
    locator: 'reference:' + plan.pack.id + '@' + stamp,
    excerpt: JSON.stringify({
      explanation: '演示参考，可修改，非实时AI生成；采用前须核对，不代表政策结论。',
      pack: plan.pack.label, caseName: plan.pack.caseName, source: plan.pack.source, level: plan.pack.level,
      year: plan.year, region: plan.region,
      directions: plan.matched.map(item => ({ from: item.fromLabel, to: item.toLabel, score: item.score, why: item.why }))
    }),
    reviewStatus: 'draft', version: 1,
    provenance: { origin: 'user', sourceId: plan.pack.id }
  });
  return { next, filled, created, preserved, evidenceId, ids: [...new Set(ids)], years: scopeYears };
}
