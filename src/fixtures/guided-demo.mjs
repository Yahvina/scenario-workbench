import { createProjectStore } from '../core/project-store.mjs';
import { R35_CASE, r35DirectionEntries } from './mechanism-case.mjs';

// 完整流程示例：在 R35 机制演示基础上补齐“年度状态 + 两个方向完整评分”，
// 让“开始检验”一步就能真实算出结果（9 个组合、2 个自洽、7 个冲突）。
// 全部记录 origin=fixture：这是机制演示，不是真实政策，也不代表地区结论。
// 与 createMechanismCaseProject 不同：那个刻意不预填判断，用于演示“参考评分采用”环节；
// 本示例面向首页“用示例体验完整流程”入口，载入即具备全部输入。
export function createGuidedDemoProject() {
  const p = createProjectStore('fixture-guided-r35').read();
  const base = { version: 1, provenance: { origin: 'fixture', sourceId: R35_CASE.id, locator: 'src/fixtures/guided-demo.mjs' } };
  p.title = '完整流程示例（机制演示 R35）';
  p.scope = { regionId: R35_CASE.region, years: [...R35_CASE.years] };
  p.data.evidence = R35_CASE.evidence.map(item => ({
    ...base, id: item.id, kind: 'policy', sourceId: item.sourceId,
    locator: item.doc + '（' + item.region + '）', excerpt: item.quote, reviewStatus: 'draft'
  }));
  const evByDescriptor = { 'mech-a': ['mech-ev-1', 'mech-ev-2'], 'mech-b': ['mech-ev-2', 'mech-ev-3'] };
  p.data.taxonomy = [
    { ...base, id: 'mech-root', label: '完整流程示例（机制演示）', kind: 'category', parentIds: [], childIds: ['mech-sector'], descriptorIds: [], evidenceRefs: [] },
    { ...base, id: 'mech-sector', label: '工业', kind: 'category', parentIds: ['mech-root'], childIds: ['mech-node-a', 'mech-node-b'], descriptorIds: [], evidenceRefs: [] }
  ];
  for (const d of R35_CASE.descriptors) {
    const stateIds = d.states.map((_, i) => d.id + '-s' + (i + 1));
    p.data.taxonomy.push({ ...base, id: d.nodeId, label: d.label, kind: 'leaf', parentIds: ['mech-sector'], childIds: [], descriptorIds: [d.id], evidenceRefs: evByDescriptor[d.id] });
    p.data.descriptors.push({ ...base, id: d.id, label: d.label, role: 'input', stateIds, evidenceRefs: evByDescriptor[d.id] });
    d.states.forEach((label, i) => p.data.states.push({
      ...base, id: stateIds[i], descriptorId: d.id, label, range: null, unit: null,
      validYears: [...R35_CASE.years], scope: { regionId: R35_CASE.region }, evidenceRefs: evByDescriptor[d.id]
    }));
  }
  p.selection = { nodeIds: ['mech-node-a', 'mech-node-b'], descriptorIds: ['mech-a', 'mech-b'], stateIds: [], lockedStateIds: [] };
  // 两个方向 3×3 全 18 格：来自 R35_CASE.matrices，逐格可追溯。
  for (const [from, to] of [['mech-a', 'mech-b'], ['mech-b', 'mech-a']]) {
    p.data.judgments.push({
      ...base, id: 'guided-judgment-' + from + '-' + to, alternatives: [],
      sourceDescriptorId: from, targetDescriptorId: to,
      scope: { regionId: R35_CASE.region }, validYears: [...R35_CASE.years], directness: 'unknown', curveEncoding: null,
      entries: r35DirectionEntries(from === 'mech-a' ? 'A' : 'B', to === 'mech-a' ? 'A' : 'B')
        .map(([sourceStateId, targetStateId, score]) => ({ sourceStateId, targetStateId, score })),
      rationale: R35_CASE.source, evidenceRefs: [...evByDescriptor[from], ...evByDescriptor[to]].filter((v, i, a) => a.indexOf(v) === i),
      reviewStatus: 'draft', version: 1
    });
  }
  // 年度状态：2030 与 2035 各选一档，构成“我的方案”；这是示例设定，不是政策结论。
  const planChoice = { 'mech-a': { 2030: 'mech-a-s1', 2035: 'mech-a-s2' }, 'mech-b': { 2030: 'mech-b-s1', 2035: 'mech-b-s2' } };
  for (const d of R35_CASE.descriptors) {
    const pathId = 'guided-plan-' + d.id;
    p.data.paths.push({
      ...base, id: pathId, descriptorId: d.id, unit: null, scope: { regionId: R35_CASE.region },
      interpolation: 'none', version: 1,
      points: R35_CASE.years.map(year => ({ year, value: null, stateId: planChoice[d.id][year], origin: 'user-assumption', evidenceRefs: [...evByDescriptor[d.id]] })),
      evidenceRefs: [...evByDescriptor[d.id]],
      provenance: { origin: 'user', sourceId: pathId, locator: 'state-plan' }
    });
  }
  return p;
}
