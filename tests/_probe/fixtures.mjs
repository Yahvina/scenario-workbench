// 机制样例项目：只验证软件接线（年度状态→检验），不代表任何真实政策关系。
// 三个因素 × 三档，六方向完整矩阵，两条按年状态安排。
export function mechanismProject(overrides = {}) {
  const ev = [
    { id: 'ev-paper', kind: 'paper', sourceId: '10.0000/mechanism', locator: '机制样例', excerpt: '机制样例依据，不是真实文献。', version: 1, provenance: { origin: 'fixture', sourceId: 'mechanism' }, evidenceRefs: [] },
    { id: 'ev-plan', kind: 'user-assumption', sourceId: 'plan', locator: 'plan@v1', excerpt: '按年选择的状态安排。', version: 1, provenance: { origin: 'user', sourceId: 'plan' }, evidenceRefs: [] }
  ];
  const desc = ['甲', '乙', '丙'].map((label, i) => ({ id: 'd' + i, label: '机制因素' + label, role: 'input', stateIds: [0, 1, 2].map(s => 's' + i + s), evidenceRefs: ['ev-paper'], version: 1, provenance: { origin: 'fixture', sourceId: 'mechanism' } }));
  const states = [];
  for (let i = 0; i < 3; i++) for (let s = 0; s < 3; s++) states.push({ id: 's' + i + s, descriptorId: 'd' + i, label: ['低', '中', '高'][s], range: null, unit: null, validYears: [2030, 2035], scope: { regionId: '京津冀' }, evidenceRefs: [], version: 1, provenance: { origin: 'fixture', sourceId: 'mechanism' } });
  const judgments = [];
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    if (a === b) continue;
    const entries = [];
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) entries.push({ sourceStateId: 's' + a + x, targetStateId: 's' + b + y, score: x === y ? (a < b ? 1 : -1) : (y > x ? 1 : -1) });
    judgments.push({ id: 'j' + a + b, sourceDescriptorId: 'd' + a, targetDescriptorId: 'd' + b, entries, scope: { regionId: '京津冀' }, validYears: [2030, 2035], directness: 'direct', reviewStatus: 'reviewed', evidenceRefs: ['ev-paper'], rationale: '机制样例', alternatives: [], version: 1, provenance: { origin: 'fixture', sourceId: 'mechanism' } });
  }
  const plan = {
    id: 'plan-d0', descriptorId: 'd0', unit: null, scope: { regionId: '京津冀' }, interpolation: 'none',
    points: [{ year: 2030, value: null, stateId: 's02', origin: 'user-assumption', evidenceRefs: ['ev-plan'] }, { year: 2035, value: null, stateId: 's01', origin: 'user-assumption', evidenceRefs: ['ev-plan'] }],
    version: 1, provenance: { origin: 'user', sourceId: 'plan-d0', locator: 'state-plan' }, evidenceRefs: ['ev-plan']
  };
  const plan1 = JSON.parse(JSON.stringify(plan));
  Object.assign(plan1, { id: 'plan-d1', descriptorId: 'd1', points: plan1.points.map(p => ({ ...p, stateId: p.year === 2030 ? 's11' : 's12' })) });
  return {
    schemaVersion: 1, contractVersion: '1.0.0', id: 'probe-plan-bridge', title: '机制样例：年度方案接线', revision: 0,
    view: { perspective: 'public', module: 'workspace', objectId: null },
    scope: { regionId: '京津冀', years: [2030, 2035] },
    data: { policies: [], taxonomy: [], descriptors: desc, states, paths: [plan, plan1], judgments, evidence: ev, mappings: [] },
    selection: { nodeIds: [], descriptorIds: ['d0', 'd1', 'd2'], stateIds: [], lockedStateIds: [] },
    ...overrides
  };
}
