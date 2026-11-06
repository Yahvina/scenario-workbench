import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectStore } from '../src/core/project-store.mjs';
import { PROVINCES, REGIONS } from '../src/modules/workspace/regions.mjs';
import { MAP_REGIONS, MAP_BY_SCOPE, clauseRegion, regionMatches, regionCoverage, coverageLabel, regionImpact, DEEPER_LEVELS, GEO_SOURCE } from '../src/modules/map/geo.mjs';
import { POLICY_PILOT_CLAUSES } from '../src/modules/elements/policy-pilot.mjs';
import { toolsForDescriptor } from '../src/modules/map/library.mjs';
import { joinBaseline } from '../src/modules/elements/baseline.mjs';

const storeWithScore = () => {
  const project = joinBaseline(createProjectStore('t-map').read()).project;
  project.scope = { regionId: '京津冀', years: [2030, 2035] };
  project.data.judgments.push({
    id: 'j1', sourceDescriptorId: 'd46-20', targetDescriptorId: 'd46-23', scope: { regionId: '京津冀' },
    validYears: [2030], entries: [], version: 1, provenance: { origin: 'user', sourceId: 't', locator: 't' }, evidenceRefs: []
  });
  project.data.paths.push({
    id: 'p1', descriptorId: 'd46-20', scope: { regionId: '京津冀' }, interpolation: 'none',
    points: [{ year: 2030, value: null, stateId: 'd46-20-st1', origin: 'user-assumption', evidenceRefs: [] }],
    evidenceRefs: [], version: 1, provenance: { origin: 'user', sourceId: 't', locator: 'state-plan' }
  });
  return project;
};

test('地图只开放京津冀整体与三地，取值与地区清单一致', () => {
  assert.equal(MAP_REGIONS.length, 4);
  assert.deepEqual(MAP_REGIONS.map(r => r.label), ['京津冀整体', '北京', '天津', '河北']);
  for (const region of MAP_REGIONS) {
    const known = region.scopeValue === '京津冀' ? REGIONS.includes('京津冀') : PROVINCES.includes(region.scopeValue);
    assert.ok(known, region.scopeValue + ' 不在离线地区清单里');
  }
  assert.equal(MAP_BY_SCOPE.get('北京市').id, '北京');
  assert.equal(MAP_BY_SCOPE.get('天津市').id, '天津');
  assert.equal(MAP_BY_SCOPE.get('河北省').id, '河北');
});

test('市／区县与园区明确未开放，不放空按钮', () => {
  assert.equal(DEEPER_LEVELS.length, 2);
  for (const level of DEEPER_LEVELS) {
    assert.equal(level.status, '未开放');
    assert.ok(level.reason.length > 8);
  }
  assert.match(GEO_SOURCE.note, /不能用于测距|不引用在线地图/);
});

test('条款归属只认编号前缀，认不出的不硬塞', () => {
  assert.equal(clauseRegion({ clauseId: 'TJ-P3-010' }), '天津市');
  assert.equal(clauseRegion({ clauseId: 'BJ-01' }), '北京市');
  assert.equal(clauseRegion({ clauseId: 'HEB-2024-3' }), '河北省');
  assert.equal(clauseRegion({ clauseId: 'HE-02' }), '河北省');
  assert.equal(clauseRegion({ clauseId: 'XYZ-1' }), null);
  assert.equal(clauseRegion({}), null);
});

test('京津冀整体命中三地条款，单地只命中本地', () => {
  for (const clause of POLICY_PILOT_CLAUSES) {
    assert.equal(regionMatches(clause, '京津冀'), true);
    assert.equal(regionMatches(clause, '天津市'), true);
    assert.equal(regionMatches(clause, '北京市'), false);
    assert.equal(regionMatches(clause, '河北省'), false);
  }
});

test('政策库覆盖：三地都有真实条款，国家父工具单列，N/A 年份不当 0', () => {
  const project = createProjectStore('t-cov').read();
  const all = regionCoverage(project, '京津冀');
  const bj = regionCoverage(project, '北京市');
  const tj = regionCoverage(project, '天津市');
  const heb = regionCoverage(project, '河北省');
  assert.equal(all.library, 361, '三地本地工具合计');
  assert.equal(all.national, 281, '国家父工具不按地区计');
  assert.equal(bj.library, 206);
  assert.equal(tj.library, 83);
  assert.equal(heb.library, 72);
  assert.equal(all.matched + all.pending, all.library, '已关联 + 待匹配 = 总条数');
  assert.ok(all.pending > 0, '没有建立描述符关联的条款必须显式待匹配');
  assert.ok(all.yearsUnknown > 0, '原表 N/A 的年份记为未知，不是 0');
  assert.equal(all.imported, true);
  assert.equal(coverageLabel(all), '已导入政策库（逐条待核）');
  assert.equal(coverageLabel(regionCoverage(project, '上海市')).startsWith('本地区 0 条'), true, '库里没有的地区显示 0，且不冒充政策不存在');
});

test('政策库只按明确路径关联描述符，不硬分配', () => {
  const project = joinBaseline(createProjectStore('t-lib').read()).project;
  const all = regionCoverage(project, '京津冀');
  assert.ok(all.covered > 0 && all.covered < 46, '只覆盖部分 46 项');
  for (const id of ['d46-10', 'd46-11', 'd46-20', 'd46-24', 'd46-46']) {
    assert.ok(joinBaseline(project).project.data.descriptors.some(d => d.id === id));
  }
  const tools = toolsForDescriptor('天津市', 'd46-24');
  assert.ok(tools.length > 0, '清洁取暖补贴应关联到清洁取暖支持');
  assert.equal(toolsForDescriptor('天津市', 'd46-33').length, 0, '数据中心能效没有对应路径时返回空');
});

test('切换地区的影响说明：列出范围不匹配的评分与年度安排，且不改动项目', () => {
  const project = storeWithScore();
  const before = JSON.stringify(project);
  const impact = regionImpact(project, '天津市', { hasResults: true });
  assert.equal(impact.changed, true);
  assert.equal(impact.judgments, 1);
  assert.equal(impact.plans, 1);
  assert.match(impact.lines.join(' '), /不会被删除/);
  assert.match(impact.lines.join(' '), /标记为过期/);
  assert.equal(JSON.stringify(project), before, '影响说明不能修改项目');
  assert.equal(regionImpact(project, '京津冀', {}).changed, false);
});

test('应用地区后描述符与条款仍按地区可筛', () => {
  const project = storeWithScore();
  project.data.policies.push({
    id: 'pol-1', clauseId: 'TJ-P3-010', excerpt: '禁止新建燃煤自备机组', note: '',
    descriptorIds: ['d46-04'], evidenceRefs: [], version: 1,
    provenance: { origin: 'import', sourceId: 'pilot', locator: 'pilot' }
  });
  const tj = regionCoverage(project, '天津市');
  assert.equal(tj.own, 1);
  assert.ok(tj.library > 0, '项目自录条款不影响政策库计数');
  assert.ok(tj.covered >= 1);
  assert.equal(regionCoverage(project, '北京市').own, 0);
});
