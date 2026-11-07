// 业务分区 = 当前目录的顶层领域本身，直接从 taxonomy 派生。
// 这样分区永远和目录一致：46 项就是 10 个领域，旧项目/自定义目录也按自己的顶层走，
// 不会出现"其他（待归类）"这种兜底桶。
export function zonesOf(project) {
  return (project.data.taxonomy || [])
    .filter(node => !(node.parentIds || []).length)
    .map(node => ({ id: node.id, label: node.label, hint: '按目录顶层领域筛选' }));
}

// 某个顶层领域下的整棵子树（含它自己）。
export function taxonomyForZone(project, zoneId) {
  if (!zoneId || zoneId === 'all') return project.data.taxonomy;
  const nodes = new Map(project.data.taxonomy.map(n => [n.id, n]));
  if (!nodes.has(zoneId)) return project.data.taxonomy;
  const allowed = new Set();
  const add = id => {
    if (allowed.has(id)) return;
    allowed.add(id);
    (nodes.get(id)?.childIds || []).forEach(add);
  };
  add(zoneId);
  return project.data.taxonomy.filter(n => allowed.has(n.id));
}

// 每个顶层领域下有多少个具体描述符；用于分区条上的计数。
export function zoneCounts(project) {
  const counts = Object.fromEntries(zonesOf(project).map(z => [z.id, 0]));
  const nodes = new Map(project.data.taxonomy.map(n => [n.id, n]));
  for (const node of project.data.taxonomy) {
    if (!node.descriptorIds?.length) continue;
    let cur = node, guard = new Set();
    while (cur && (cur.parentIds || []).length && !guard.has(cur.id)) {
      guard.add(cur.id);
      cur = nodes.get(cur.parentIds[0]);
    }
    if (cur && counts[cur.id] !== undefined) counts[cur.id] += node.descriptorIds.length;
  }
  return counts;
}
