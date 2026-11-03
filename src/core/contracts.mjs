export const CONTRACT_VERSION = '1.0.0';
export const DATA_KEYS = ['policies', 'taxonomy', 'descriptors', 'states', 'paths', 'judgments', 'evidence', 'mappings'];
export const SELECTION_KEYS = ['nodeIds', 'descriptorIds', 'stateIds', 'lockedStateIds'];
export const VIEW_MODULES = ['workspace', 'policy', 'elements', 'timeline', 'ai-draft', 'relationships', 'importance', 'review', 'solver', 'explanation', 'analysis', 'optimization', 'knowledge', 'exports', 'collaboration', 'methods'];

export class ContractError extends Error {
  constructor(code, message, recordIds = [], recoveryAction = '修正输入后重试') {
    super(message);
    this.name = 'ContractError';
    this.code = code;
    this.recordIds = recordIds;
    this.recoveryAction = recoveryAction;
  }
}

const fail = (message, ids = []) => { throw new ContractError('INVALID_PROJECT', message, ids); };
const id = value => typeof value === 'string' && value.trim().length > 0;
const hasId = (list, value) => list.some(record => record.id === value);
const ids = value => Array.isArray(value) && value.every(id) && new Set(value).size === value.length;

export function validateProject(p) {
  if (!p || p.schemaVersion !== 1 || p.contractVersion !== CONTRACT_VERSION) fail('项目契约版本不兼容');
  if (!id(p.id) || !id(p.title) || !Number.isSafeInteger(p.revision) || p.revision < 0) fail('项目标识、名称或修订号无效');
  if (!['public', 'expert'].includes(p.view?.perspective) || !VIEW_MODULES.includes(p.view?.module) || !(p.view.objectId === null || id(p.view.objectId))) fail('界面视角或模块无效');
  if (!p.scope || !(p.scope.regionId === null || id(p.scope.regionId)) || !Array.isArray(p.scope.years) || p.scope.years.some(y => !Number.isInteger(y) || y < 1900 || y > 2300) || new Set(p.scope.years).size !== p.scope.years.length) fail('年份必须是1900至2300之间且不重复的整数');
  if (!p.data || Object.keys(p.data).length !== DATA_KEYS.length) fail('项目数据集合不完整');
  for (const key of DATA_KEYS) if (!Array.isArray(p.data[key]) || !ids(p.data[key].map(r => r?.id))) fail('数据ID必须为唯一非空字符串：' + key);
  if (!p.selection || Object.keys(p.selection).length !== SELECTION_KEYS.length || SELECTION_KEYS.some(key => !ids(p.selection[key]))) fail('选择必须为不重复ID数组');
  const d = p.data;
  for (const node of d.taxonomy) {
    if (!id(node.label) || !ids(node.parentIds) || !ids(node.childIds) || !ids(node.descriptorIds) || !ids(node.evidenceRefs)) fail('分类节点字段不完整', [node.id]);
    for (const parent of node.parentIds) if (!hasId(d.taxonomy, parent) || !d.taxonomy.find(r => r.id === parent).childIds.includes(node.id)) fail('分类父子关系不对称', [node.id]);
    for (const child of node.childIds) if (!hasId(d.taxonomy, child) || !d.taxonomy.find(r => r.id === child).parentIds.includes(node.id)) fail('分类父子关系不对称', [node.id]);
    if (node.descriptorIds.some(value => !hasId(d.descriptors, value))) fail('分类引用不存在的计算变量', [node.id]);
  }
  const visiting = new Set(), done = new Set();
  function visit(nodeId) {
    if (visiting.has(nodeId)) fail('分类存在循环', [nodeId]);
    if (done.has(nodeId)) return;
    visiting.add(nodeId);
    d.taxonomy.find(r => r.id === nodeId).childIds.forEach(visit);
    visiting.delete(nodeId);
    done.add(nodeId);
  }
  d.taxonomy.forEach(node => visit(node.id));
  for (const descriptor of d.descriptors) {
    if (!id(descriptor.label) || !ids(descriptor.stateIds) || !ids(descriptor.evidenceRefs)) fail('描述符字段不完整', [descriptor.id]);
    for (const stateId of descriptor.stateIds) if (d.states.find(s => s.id === stateId)?.descriptorId !== descriptor.id) fail('描述符状态归属错误', [descriptor.id, stateId]);
  }
  for (const state of d.states) if (!id(state.label) || !ids(state.evidenceRefs) || !hasId(d.descriptors, state.descriptorId) || !d.descriptors.find(r => r.id === state.descriptorId).stateIds.includes(state.id)) fail('状态定义或归属错误', [state.id]);
  for (const record of Object.values(d).flat()) {
    if (!Number.isSafeInteger(record.version) || record.version < 1 || !record.provenance || !['fixture', 'user', 'import', 'ai'].includes(record.provenance.origin)) fail('记录缺版本或来源', [record.id]);
    if (record.evidenceRefs?.some(value => !hasId(d.evidence, value))) fail('证据引用不存在', [record.id]);
  }
  for (const evidence of d.evidence) if (!['policy', 'paper', 'historical-data', 'expert', 'user-assumption', 'fixture'].includes(evidence.kind) || !id(evidence.sourceId) || !id(evidence.locator) || !id(evidence.excerpt)) fail('证据记录不完整', [evidence.id]);
  for (const path of d.paths) {
    if (!hasId(d.descriptors, path.descriptorId) || !['none', 'linear', 'step'].includes(path.interpolation) || !Array.isArray(path.points)) fail('时间路径无效', [path.id]);
    let last = -Infinity;
    for (const point of path.points) {
      if (!Number.isInteger(point.year) || point.year < 1900 || point.year > 2300 || point.year <= last || !(point.value === null || typeof point.value === 'number' && Number.isFinite(point.value)) || !['source', 'user-assumption', 'interpolated'].includes(point.origin) || !ids(point.evidenceRefs) || point.evidenceRefs.some(value => !hasId(d.evidence, value))) fail('路径节点年份、数值或来源无效', [path.id]);
      if (!(point.stateId === null || d.states.some(s => s.id === point.stateId && s.descriptorId === path.descriptorId))) fail('路径引用其他变量的状态', [path.id]);
      last = point.year;
    }
  }
  for (const judgment of d.judgments) {
    if (!hasId(d.descriptors, judgment.sourceDescriptorId) || !hasId(d.descriptors, judgment.targetDescriptorId) || judgment.sourceDescriptorId === judgment.targetDescriptorId || !Array.isArray(judgment.entries)) fail('影响判断变量引用错误', [judgment.id]);
    const pairs = new Set();
    for (const entry of judgment.entries) {
      const pair = entry.sourceStateId + '/' + entry.targetStateId;
      if (pairs.has(pair) || !d.states.some(s => s.id === entry.sourceStateId && s.descriptorId === judgment.sourceDescriptorId) || !d.states.some(s => s.id === entry.targetStateId && s.descriptorId === judgment.targetDescriptorId) || !(entry.score === null || Number.isInteger(entry.score) && Math.abs(entry.score) <= 3)) fail('状态对或分数无效；缺失用null', [judgment.id]);
      pairs.add(pair);
    }
  }
  const refs = { nodeIds: d.taxonomy, descriptorIds: d.descriptors, stateIds: d.states, lockedStateIds: d.states };
  for (const key of SELECTION_KEYS) if (p.selection[key].some(value => !hasId(refs[key], value))) fail('选择引用不存在：' + key);
  for (const stateId of [...p.selection.stateIds, ...p.selection.lockedStateIds]) if (!p.selection.descriptorIds.includes(d.states.find(s => s.id === stateId).descriptorId)) fail('所选状态必须属于活动变量', [stateId]);
  const locked = p.selection.lockedStateIds.map(value => d.states.find(s => s.id === value).descriptorId);
  if (new Set(locked).size !== locked.length) fail('同一变量不能锁定多个状态');
  return true;
}

export function scientificKey(p) {
  return JSON.stringify({ scope: p.scope, data: p.data, selection: p.selection });
}
