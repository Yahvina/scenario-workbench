import {createProjectStore} from '../../core/project-store.mjs';
import {validateProject} from '../../core/contracts.mjs';

// E1 目录小样：只供浏览与「向当前项目加入」使用的独立样例数据。
// 三条摘要来自《描述符分级与时间轴 团队交流版》第 3 节摘录，属团队交流稿条目摘要，
// 不是政策原件。条款编号原样保留；原件、精确适用范围、累计淘汰率分母与基准年一律待核。
const base = {
  version: 1,
  provenance: {origin: 'fixture', sourceId: 'policy-catalog-pilot', locator: 'src/modules/elements/policy-pilot.mjs'}
};

export const POLICY_PILOT_SOURCE = {
  ...base,
  id: 'pilot-source-team-draft',
  kind: 'user-assumption',
  sourceId: 'descriptor-taxonomy-team-draft',
  locator: '《描述符分级与时间轴 团队交流版》第 3 节：能源生产与供应 → 燃煤发电与供热 → 数量与比例约束 → 燃煤设施限制与退出强度',
  excerpt: '团队交流稿条目摘要，不是政策原件；条款编号原样保留，原件、精确适用范围、累计淘汰率分母与基准年待核。',
  reviewStatus: 'draft'
};

export const POLICY_PILOT_PATH = ['能源生产与供应', '燃煤发电与供热', '数量与比例约束', '燃煤设施限制与退出强度'];
export const POLICY_PILOT_LEAF_ID = 'pilot-node-coal-restriction';
export const POLICY_PILOT_DESCRIPTOR_ID = 'pilot-descriptor-coal-restriction';

// 三条摘要逐字沿用任务单；2027 年与 130 万千瓦只存在于摘要文本里，不进入状态、单位或路径。
export const POLICY_PILOT_CLAUSES = [
  {clauseId: 'TJ-P3-010', excerpt: '禁止新建燃煤自备机组', note: '禁建措施与适用对象可展示；覆盖比例待核。'},
  {clauseId: 'TJ-P3-011', excerpt: '禁止新建燃煤锅炉', note: '另一类适用对象，指向同一候选因素。'},
  {clauseId: 'TJ-P33-007', excerpt: '2027 年煤电机组关停替代 130 万千瓦', note: '年份照原文保留；130 万千瓦的关停替代容量的统计口径待核，累计淘汰率需另有分母和基准年。'}
];

export const POLICY_PILOT_GAPS = [
  '状态定义：候选因素尚未定义任何状态，不能参与计算。',
  '参数与单位：累计淘汰率缺分母与基准年；130 万千瓦的关停替代容量的统计口径待核。',
  '原件：三条均为团队交流稿摘要，条款原文、发布机构、文号与精确适用范围待核。'
];

export function policyPilotTemplate() {
  const ids = ['pilot-node-domain', 'pilot-node-sector', 'pilot-node-measure', POLICY_PILOT_LEAF_ID];
  const node = (id, label, parentIds, childIds, descriptorIds = []) => ({
    ...base, id, label, kind: 'category', parentIds, childIds, descriptorIds,
    evidenceRefs: descriptorIds.length ? [POLICY_PILOT_SOURCE.id] : []
  });
  return {
    taxonomy: [
      node(ids[0], POLICY_PILOT_PATH[0], [], [ids[1]]),
      node(ids[1], POLICY_PILOT_PATH[1], [ids[0]], [ids[2]]),
      node(ids[2], POLICY_PILOT_PATH[2], [ids[1]], [ids[3]]),
      node(ids[3], POLICY_PILOT_PATH[3], [ids[2]], [], [POLICY_PILOT_DESCRIPTOR_ID])
    ],
    descriptors: [{
      ...base, id: POLICY_PILOT_DESCRIPTOR_ID, label: POLICY_PILOT_PATH[3], role: 'context', stateIds: [],
      evidenceRefs: [POLICY_PILOT_SOURCE.id]
    }]
  };
}

// 一条摘要记录的完整形状：编号、内容、说明、**关联因素**与依据都属于同一条记录。
// 三条摘要严格绑定燃煤候选因素：descriptorIds 只含 POLICY_PILOT_DESCRIPTOR_ID。
const clauseRecord = clause => ({
  ...base, id: 'pilot-policy-' + clause.clauseId, clauseId: clause.clauseId, excerpt: clause.excerpt, note: clause.note,
  descriptorIds: [POLICY_PILOT_DESCRIPTOR_ID], reviewStatus: 'draft', evidenceRefs: [POLICY_PILOT_SOURCE.id]
});

// 同一编号、同一内容、同一说明、同一关联因素、同一依据才算同一条记录。
// 比较 provenance.sourceId（记录顶层没有 sourceId，早先版本这里比的是两个 undefined）。
const clauseMatches = (existing, clause) => {
  const expected = clauseRecord(clause);
  return existing.excerpt === expected.excerpt
    && existing.note === expected.note
    && existing.provenance?.sourceId === expected.provenance.sourceId
    && existing.reviewStatus === expected.reviewStatus
    && JSON.stringify(existing.descriptorIds || []) === JSON.stringify(expected.descriptorIds)
    && JSON.stringify(existing.evidenceRefs || []) === JSON.stringify(expected.evidenceRefs);
};

const clauseRecords = project => project.data.policies.filter(item => POLICY_PILOT_CLAUSES.some(clause => clause.clauseId === item.clauseId));

// 加入当前项目：与「向当前项目加入京津冀框架」同一套原子语义 —— 先校验、再克隆、
// 逐 ID 比对，冲突就整体拒绝并说明原因，成功则一次 replaceProject 写入。
// 项目 ID、名称、地区、年份、既有定义/评分/选择一概不动；相同内容重复加入为无变化。
export function joinPolicyPilot(project) {
  validateProject(project);
  const template = policyPilotTemplate();
  const carried = clauseRecords(project);
  const next = structuredClone(project), conflicts = [];
  for (const collection of ['taxonomy', 'descriptors', 'evidence']) {
    const incoming = collection === 'evidence' ? [POLICY_PILOT_SOURCE] : template[collection];
    for (const record of incoming) {
      const existing = next.data[collection].find(item => item.id === record.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(record)) {
        conflicts.push(collection + ' / ' + record.id + '：已有记录与目录小样不同');
      }
    }
  }
  // 先逐条核对编号、内容及关联，再决定报告「已加入」还是「冲突」；
  // 只看条数就当作已加入，会把一条被改写的摘要当成"内容一致"。
  for (const clause of POLICY_PILOT_CLAUSES) {
    const matches = carried.filter(item => item.clauseId === clause.clauseId);
    if (matches.length > 1) conflicts.push('policies / ' + clause.clauseId + '：同一编号存在多条记录');
    else if (matches.length === 1 && !clauseMatches(matches[0], clause)) {
      conflicts.push('policies / ' + clause.clauseId + '：同一编号的摘要、说明、关联因素或依据与目录小样不同');
    }
  }
  if (conflicts.length) throw new Error('目录小样未加入，原项目保持不变：' + conflicts.join('；'));

  const leafExists = next.data.taxonomy.some(item => item.id === POLICY_PILOT_LEAF_ID);
  if (leafExists && carried.length === POLICY_PILOT_CLAUSES.length) return {project: next, added: false, clauses: 0};

  if (!next.data.evidence.some(item => item.id === POLICY_PILOT_SOURCE.id)) next.data.evidence.push(structuredClone(POLICY_PILOT_SOURCE));
  let added = 0;
  for (const clause of POLICY_PILOT_CLAUSES) {
    if (carried.some(item => item.clauseId === clause.clauseId)) continue;
    next.data.policies.push(clauseRecord(clause));
    added += 1;
  }
  if (!leafExists) {
    next.data.taxonomy.push(...structuredClone(template.taxonomy));
    next.data.descriptors.push(...structuredClone(template.descriptors));
  }
  validateProject(next);
  return {project: next, added: true, clauses: added};
}

export function catalogPilotProject() {
  const project = createProjectStore('policy-catalog-pilot').read();
  project.title = '燃煤设施限制与退出强度 · 目录小样';
  return joinPolicyPilot(project).project;
}

// 供界面展示：只对燃煤候选因素返回三条摘要，并且要求记录本身绑定该因素。
// 同一页上其他已归类因素（哪怕与同一份交流稿有关）在这里一律返回空数组。
export function clausesFor(project, descriptorId) {
  if (descriptorId !== POLICY_PILOT_DESCRIPTOR_ID) return [];
  const node = project.data.taxonomy.find(item => item.descriptorIds.includes(descriptorId));
  if (!node || node.id !== POLICY_PILOT_LEAF_ID) return [];
  const order = new Map(POLICY_PILOT_CLAUSES.map((clause, index) => [clause.clauseId, index]));
  return clauseRecords(project)
    .filter(item => Array.isArray(item.descriptorIds) && item.descriptorIds.includes(POLICY_PILOT_DESCRIPTOR_ID))
    .filter(item => item.evidenceRefs.includes(POLICY_PILOT_SOURCE.id))
    .sort((a, b) => (order.get(a.clauseId) ?? 99) - (order.get(b.clauseId) ?? 99));
}
