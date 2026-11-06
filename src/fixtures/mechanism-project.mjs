import { createProjectStore } from '../core/project-store.mjs';
import { R35_CASE } from './mechanism-case.mjs';

// 载入机制演示：两个因素、3 档状态、18 格真实分值；不预填任何判断，用户仍要自己采用参考评分。
export function createMechanismCaseProject() {
  const p = createProjectStore('fixture-mechanism-r35').read();
  const base = { version: 1, provenance: { origin: 'fixture', sourceId: R35_CASE.id, locator: 'src/fixtures/mechanism-case.mjs' } };
  p.title = '机制演示（R35）：状态有差异的评分';
  p.scope = { regionId: R35_CASE.region, years: [...R35_CASE.years] };
  p.data.evidence = R35_CASE.evidence.map(item => ({
    ...base, id: item.id, kind: 'policy', sourceId: item.sourceId,
    locator: item.doc + '（' + item.region + '）', excerpt: item.quote, reviewStatus: 'draft'
  }));
  const evByDescriptor = { 'mech-a': ['mech-ev-1', 'mech-ev-2'], 'mech-b': ['mech-ev-2', 'mech-ev-3'] };
  p.data.taxonomy = [
    { ...base, id: 'mech-root', label: '机制演示（R35）', kind: 'category', parentIds: [], childIds: ['mech-sector'], descriptorIds: [], evidenceRefs: [] },
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
  return p;
}
