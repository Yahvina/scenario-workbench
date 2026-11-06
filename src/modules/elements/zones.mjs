// 五类业务分区：这是**视图**，不是数据分类的重写。
// 分区依据顶层的框架分组标签映射；没有映射的节点归入「其他（待归类）」，不硬塞。
export const ZONES = [
  { id: 'goal', label: '政策目标', hint: '研究要达成什么' },
  { id: 'tech', label: '技术选项', hint: '可选的技术与装备路径' },
  { id: 'constraint', label: '约束条件', hint: '资源、环境等硬约束' },
  { id: 'socio', label: '经济社会', hint: '人口、经济、社会条件' },
  { id: 'regional', label: '区域特征', hint: '空间与终端结构差异' },
  { id: 'other', label: '其他（待归类）', hint: '当前框架没有明确归属' }
];

// 京津冀旧框架的映射（按分组 / 二级小节标签）。旧框架没有分区字段，只能按标签判。
const LABEL_MAP = {
  '政策与治理': 'goal', '区域协同': 'regional', '政策工具': 'goal',
  '产业与技术': 'tech', '工业工艺': 'tech', '减排技术': 'tech', '能源供给': 'tech',
  '资源与环境': 'constraint', '水资源': 'constraint',
  '经济与人口': 'socio', '经济规模': 'socio', '人口': 'socio', '产业结构': 'socio', '能源需求': 'socio',
  '终端部门': 'regional', '建筑用能': 'regional', '交通用能': 'regional'
};

export function zoneIndex(project) {
  const nodes = new Map(project.data.taxonomy.map(n => [n.id, n]));
  const memo = new Map();
  const visit = (id, guard = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    const n = nodes.get(id);
    if (!n || guard.has(id)) return 'other';
    let zone = n.zone || LABEL_MAP[n.label] || null;
    if (!zone) {
      const parent = n.parentIds[0] ? visit(n.parentIds[0], new Set([...guard, id])) : null;
      zone = parent || 'other';
    }
    memo.set(id, zone);
    return zone;
  };
  for (const n of nodes.values()) visit(n.id);
  return memo;
}

export function taxonomyForZone(project, zoneId) {
  if (!zoneId || zoneId === 'all') return project.data.taxonomy;
  const index = zoneIndex(project), nodes = new Map(project.data.taxonomy.map(n => [n.id, n]));
  const allowed = new Set();
  const addWithAncestors = id => {
    if (allowed.has(id)) return;
    allowed.add(id);
    nodes.get(id)?.parentIds.forEach(addWithAncestors);
  };
  for (const [id, zone] of index) if (zone === zoneId) addWithAncestors(id);
  // 只保留挂得住的子树：父节点不在集合里的节点不能当根随便出现。
  return project.data.taxonomy.filter(n => allowed.has(n.id));
}

export function zoneCounts(project) {
  const index = zoneIndex(project);
  const counts = Object.fromEntries(ZONES.map(z => [z.id, 0]));
  for (const node of project.data.taxonomy) if (node.descriptorIds?.length) counts[index.get(node.id) || 'other'] += node.descriptorIds.length;
  return counts;
}
