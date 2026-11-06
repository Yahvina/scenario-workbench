// 离线地理入口：京津冀整体与三地。边界是自绘示意轮廓，不是测绘成果，
// 不能用于测距、边界判定或空间分析；不依赖任何在线地图服务。
import { POLICY_PILOT_CLAUSES, POLICY_PILOT_SOURCE } from '../elements/policy-pilot.mjs';
import { libraryCoverage } from './library.mjs';

export const GEO_SOURCE = {
  label: '自绘离线示意边界',
  note: '按公开行政区划轮廓手工简化的示意图，不含精确坐标，不引用在线地图服务，不能用于测距或边界判定。',
  checkedAt: '2026-11-06'
};

// 只画三个省级单元，viewBox 按实际轮廓收边，避免四周大片空白。
export const MAP_VIEW = { x: 112, y: 76, width: 360, height: 362 };

export const MAP_REGIONS = [
  {
    id: '京津冀', label: '京津冀整体', scopeValue: '京津冀', short: '京津冀',
    level: 'region', area: '北京市 + 天津市 + 河北省', path: null, labelAt: null,
    note: '三地合计口径；项目现有评分的适用范围多为这一级。'
  },
  {
    id: '北京', label: '北京', scopeValue: '北京市', short: '北京', level: 'province',
    path: 'M 286 150 L 322 138 L 352 154 L 356 182 L 340 208 L 306 212 L 284 190 L 278 168 Z',
    labelAt: { x: 316, y: 178 }, area: '北京市全域（16 个区）', note: '省级行政区（直辖市），下辖 16 个区。'
  },
  {
    id: '天津', label: '天津', scopeValue: '天津市', short: '天津', level: 'province',
    path: 'M 366 200 L 396 196 L 408 218 L 402 248 L 376 260 L 358 240 L 358 218 Z',
    labelAt: { x: 382, y: 232 }, area: '天津市全域（16 个区）', note: '省级行政区（直辖市），下辖 16 个区。'
  },
  {
    id: '河北', label: '河北', scopeValue: '河北省', short: '河北', level: 'province',
    path: 'M 118 296 L 132 232 L 158 178 L 208 132 L 258 96 L 300 84 L 344 100 L 366 132 L 392 142 L 424 168 L 440 208 L 466 240 L 452 268 L 430 282 L 462 300 L 446 332 L 414 354 L 386 388 L 344 404 L 296 420 L 250 432 L 206 424 L 176 396 L 150 360 L 128 330 Z',
    labelAt: { x: 210, y: 330 }, area: '河北省全域（11 个设区市）', note: '省级行政区，下辖 11 个设区市。'
  }
];

export const MAP_BY_SCOPE = new Map(MAP_REGIONS.map(region => [region.scopeValue, region]));
export const MAP_BY_ID = new Map(MAP_REGIONS.map(region => [region.id, region]));

export function regionForScope(scopeValue) {
  return MAP_BY_SCOPE.get(scopeValue) || null;
}

// 更细层级（市/区县/园区）没有离线真实边界与数据，明确不开放，而不是放空按钮。
export const DEEPER_LEVELS = [
  { id: 'city', label: '市 / 区县', status: '未开放', reason: '缺少离线真实边界与逐区县政策数据；开放会变成虚构地图。' },
  { id: 'park', label: '园区', status: '未开放', reason: '园区不是行政区，且离线包没有任何园区边界或清单；自定义园区名称请到「园区或自定义」填写。' }
];

// 条款归属只认编号前缀，认不出的记为“未归属”，不猜。
export function clauseRegion(clause) {
  const id = String(clause?.clauseId || '');
  if (/^BJ/i.test(id)) return '北京市';
  if (/^TJ/i.test(id)) return '天津市';
  if (/^(HEB|HE)/i.test(id)) return '河北省';
  return null;
}

export function regionMatches(clause, scopeValue) {
  const owner = clauseRegion(clause);
  if (!owner) return false;
  if (scopeValue === '京津冀') return true;
  return owner === scopeValue;
}

export function projectClauses(project, scopeValue) {
  return (project.data.policies || []).filter(clause => regionMatches(clause, scopeValue));
}

// 离线样例库只含 3 条天津交流稿摘要；单独计数，不混进项目自己的条款。
export function libraryClauses(project, scopeValue) {
  const inProject = new Set((project.data.policies || []).map(item => item.clauseId));
  return POLICY_PILOT_CLAUSES
    .filter(clause => !inProject.has(clause.clauseId))
    .filter(clause => regionMatches(clause, scopeValue))
    .map(clause => ({ ...clause, source: POLICY_PILOT_SOURCE.locator }));
}

export function regionCoverage(project, scopeValue) {
  const own = projectClauses(project, scopeValue);
  const lib = libraryCoverage(scopeValue);
  const linked = new Set([...own.flatMap(clause => clause.descriptorIds || []), ...lib.descriptors]);
  const relevant = project.data.descriptors.filter(d => scopeValue === '京津冀' || d.id.startsWith('d46-'));
  const covered = relevant.filter(d => linked.has(d.id));
  return {
    own: own.length,
    library: lib.total,
    national: lib.national,
    docCount: lib.docCount,
    matched: lib.matched,
    pending: lib.pending,
    direct: lib.direct,
    partial: lib.partial,
    yearsUnknown: lib.yearsUnknown,
    parks: lib.parks,
    imported: lib.imported,
    covered: covered.length,
    total: relevant.length,
    hasMaterial: own.length + lib.total > 0
  };
}

export function coverageLabel(coverage) {
  if (!coverage.imported) return '未导入政策资料';
  if (coverage.library === 0) return '本地区 0 条（已导入库中没有该地区记录）';
  return coverage.own ? '有当地已录入条款' : '已导入政策库（逐条待核）';
}

// 应用地区前的影响说明：不删除、不覆盖、不迁移，只说哪些记录会因此不再适用。
export function regionImpact(project, nextScopeValue, { hasResults = false } = {}) {
  const current = project.scope.regionId || null;
  if (current === nextScopeValue) return { changed: false, lines: [] };
  const judgments = (project.data.judgments || []).filter(j => (j.scope?.regionId || null) !== nextScopeValue);
  const plans = (project.data.paths || []).filter(p => p.provenance?.locator === 'state-plan' && (p.scope?.regionId || null) !== nextScopeValue);
  const lines = [];
  if (current) lines.push('研究范围由「' + current + '」改为「' + nextScopeValue + '」。');
  else lines.push('研究范围设为「' + nextScopeValue + '」。');
  const totalJ = (project.data.judgments || []).length, totalP = (project.data.paths || []).length;
  lines.push('现有 ' + totalJ + ' 条关系评分、' + totalP + ' 条年度安排不会被删除；其中适用地区不匹配的 ' + judgments.length + ' 条评分与 ' + plans.length + ' 条安排不会参与新地区的检验，需回关系页与因素页逐条核对。');
  if (hasResults) lines.push('已完成的检验结果会标记为过期，历史不被改写。');
  return { changed: true, lines, judgments: judgments.length, plans: plans.length };
}
