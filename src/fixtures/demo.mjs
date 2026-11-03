import { createProjectStore } from '../core/project-store.mjs';

export function createDemoProject() {
  const p = createProjectStore('fixture-six-level').read();
  const base = { version: 1, provenance: { origin: 'fixture', sourceId: 'fixture-six-level', locator: 'src/fixtures/demo.mjs' } };
  const evidenceRefs = ['fixture-source'];
  p.title = '六层选择机制示例';
  p.scope = { regionId: '示例地区（非真实政策）', years: [2026, 2030, 2035] };
  p.data.evidence = [{ ...base, id: 'fixture-source', kind: 'fixture', sourceId: 'fixture-six-level', locator: '六层分类与混合深度验收样例', excerpt: '仅验证软件机制，不代表真实行业分类、政策规律或评分依据。', reviewStatus: 'illustrative' }];
  const labels = ['示例领域', '示例部门', '示例行业', '示例技术路径', '示例政策工具', '示例实施方式'];
  p.data.taxonomy = labels.map((label, i) => ({ ...base, id: 'node-' + (i + 1), label, kind: 'category', parentIds: i ? ['node-' + i] : [], childIds: i < 5 ? ['node-' + (i + 2)] : [], descriptorIds: i === 5 ? ['descriptor-a'] : [], evidenceRefs }));
  p.data.taxonomy[1].childIds.push('node-peer');
  p.data.taxonomy.push({ ...base, id: 'node-peer', label: '示例同层变量', kind: 'category', parentIds: ['node-2'], childIds: [], descriptorIds: ['descriptor-b'], evidenceRefs });
  p.data.descriptors = ['a', 'b'].map(letter => ({ ...base, id: 'descriptor-' + letter, label: '示例变量' + letter.toUpperCase(), role: 'input', stateIds: [letter + '-low', letter + '-high'], evidenceRefs }));
  p.data.states = ['a', 'b'].flatMap(letter => ['low', 'high'].map(level => ({ ...base, id: letter + '-' + level, descriptorId: 'descriptor-' + letter, label: level === 'low' ? '示例低档' : '示例高档', range: null, unit: null, validYears: [2026, 2030, 2035], scope: { regionId: p.scope.regionId }, evidenceRefs })));
  p.data.paths = [{ ...base, id: 'path-a', descriptorId: 'descriptor-a', unit: '示例指数', scope: { regionId: p.scope.regionId }, interpolation: 'none', points: [{ year: 2026, value: 20, stateId: 'a-low', origin: 'user-assumption', evidenceRefs }, { year: 2035, value: 70, stateId: 'a-high', origin: 'user-assumption', evidenceRefs }], evidenceRefs }];
  p.selection = { nodeIds: ['node-6', 'node-peer'], descriptorIds: ['descriptor-a', 'descriptor-b'], stateIds: [], lockedStateIds: [] };
  return p;
}
