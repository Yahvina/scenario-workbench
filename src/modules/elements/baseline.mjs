import { buildBaseline, baselineCounts, BASELINE_CATALOG_LABEL } from '../../fixtures/descriptors-46.mjs';
import { validateProject } from '../../core/contracts.mjs';

const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;

export function baselinePresence(project) {
  const descriptors = project.data.descriptors.filter(d => d.id.startsWith('d46-') && !d.id.startsWith('d46-out-'));
  const outcomes = project.data.descriptors.filter(d => d.id.startsWith('d46-out-'));
  return {
    present: descriptors.length > 0,
    complete: descriptors.length === baselineCounts().leaves,
    descriptors: descriptors.length,
    outcomes: outcomes.length,
    counts: baselineCounts()
  };
}

// 与「加入京津冀旧框架」同一套原子语义：先校验、逐 ID 比对冲突、整体成功或整体拒绝。
// 不碰项目身份、范围、既有定义、评分与选择；内容一致时重复加入不新增记录。
export function joinBaseline(project) {
  validateProject(project);
  // 参考状态默认带上当前研究范围：用户不必逐条填适用范围，想改再改。
  const template = buildBaseline(project.scope);
  const next = structuredClone(project);
  const conflicts = [];
  for (const collection of ['taxonomy', 'descriptors', 'states', 'evidence']) {
    for (const record of template[collection]) {
      const existing = next.data[collection].find(item => item.id === record.id);
      if (existing && JSON.stringify(canonical(existing)) !== JSON.stringify(canonical(record))) {
        conflicts.push(collection + ' / ' + record.id + '：已有记录与 ' + BASELINE_CATALOG_LABEL + ' 不同');
      }
    }
  }
  if (conflicts.length) throw new Error('目录未加入，原项目保持不变：' + conflicts.slice(0, 3).join('；') + (conflicts.length > 3 ? ' 等 ' + conflicts.length + ' 处' : ''));
  let added = 0;
  for (const collection of ['evidence', 'taxonomy', 'descriptors', 'states']) {
    for (const record of template[collection]) {
      if (next.data[collection].some(item => item.id === record.id)) continue;
      next.data[collection].push(structuredClone(record));
      added += 1;
    }
  }
  validateProject(next);
  return { project: next, added, counts: baselineCounts() };
}

export function descriptorNodeId(project, descriptorId) {
  return project.data.taxonomy.find(node => node.descriptorIds.includes(descriptorId))?.id || null;
}

export function hasBaseline(project) {
  return project.data.taxonomy.some(node => node.id.startsWith('d46-g'));
}
