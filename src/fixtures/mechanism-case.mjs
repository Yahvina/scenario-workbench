// 机制演示案例（R35）：状态有差异的评分，用来展示“自洽”与“冲突”如何同时出现。
// 18 个状态对逐格取自《交叉影响评分规则与全状态对明细_V1.xlsx》的「全状态对评分明细」，
// 不是为演示效果编的分；只取两个因素，不代表地区政策结论。
export const R35_CASE = {
  id: 'mechanism-r35',
  label: '机制演示：状态有差异的评分（R35）',
  shortLabel: '机制演示（有冲突）',
  caseName: '工业节能改造强度 × 单位产品能耗限额强度',
  region: '示例地区（非真实政策）',
  years: [2030, 2035],
  source: '《交叉影响评分规则与全状态对明细_V1》全状态对评分明细（R35，2026-10-21 版）；每条状态对带原句依据。',
  note: '只取这两个因素做机制演示；9 个组合里 2 个自洽、7 个冲突，用来演示冲突从哪来。',
  descriptors: [
    { key: 'A', id: 'mech-a', label: '工业节能改造强度', states: ['深入推进', '按计划推进', '推进缓慢'], nodeId: 'mech-node-a' },
    { key: 'B', id: 'mech-b', label: '单位产品能耗限额强度', states: ['严格限额', '现行标准', '宽松执行'], nodeId: 'mech-node-b' }
  ],
  // 行＝源状态顺序，列＝目标状态顺序（与上面的 states 顺序一致）
  matrices: {
    'mech-a|mech-b': [[1, 0, -1], [0, 1, -1], [-1, 1, 0]],
    'mech-b|mech-a': [[2, 0, -2], [0, 1, -1], [-1, 0, 1]]
  },
  evidence: [
    {
      id: 'mech-ev-1', sourceId: 'EV-06d7b2654f639a4fe7fb', region: '河北',
      doc: '河北省加快推进钢铁产业高质量发展的若干措施（冀政办字〔2022〕28号）',
      quote: '实施节能降碳行动，引导未达到基准水平的钢铁企业……对照标杆水平实施改造升级，力争到 2025 年全省钢铁产业能效达到标杆水平。'
    },
    {
      id: 'mech-ev-2', sourceId: 'EV-14f5ec558ae0278d9af5', region: '河北',
      doc: 'DB13/T 2128-2023 冶金石灰单位产品能源消耗限额引导性指标',
      quote: '钢铁企业或独立冶金石灰生产企业应通过节能技术改造和加强节能管理，力争使其冶金石灰单位产品能耗达到或优于能耗限额引导性指标的 1 级要求。'
    },
    {
      id: 'mech-ev-3', sourceId: 'EV-156ba29f406b61baa474', region: '北京',
      doc: 'DB11/T 982-2022 液晶显示器件单位产品能源消耗限额',
      quote: '企业应根据单位产品综合能耗限额，建立能源管理和用能奖惩制度，将用能指标分解落实到基层部门和责任人，定期考核。'
    }
  ]
};

export function r35DirectionEntries(fromKey, toKey) {
  const from = R35_CASE.descriptors.find(d => d.key === fromKey);
  const to = R35_CASE.descriptors.find(d => d.key === toKey);
  const grid = R35_CASE.matrices[from.id + '|' + to.id];
  if (!grid) return [];
  return from.states.flatMap((_, i) => to.states.map((__, j) => [from.id + '-s' + (i + 1), to.id + '-s' + (j + 1), grid[i][j]]));
}
