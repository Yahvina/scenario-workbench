// 社会描述符框架：译自导师提供的两份工作簿（Dimensions & Variants matrix.xlsx、Lauer et al 2025.xlsx）。
// 只保留原文列出的维度与变体，中文为译文，英文原词随记录保留；不补造原文没有的变体，
// 也不给这些变体编造阈值、年份或地区适用性——它们要进入求解，必须由使用者显式确认假设。
export const SOCIAL_SOURCE = {
  workbook: 'Lauer et al 2025.xlsx / Dimensions & Variants matrix.xlsx',
  locator: 'output/meeting_20261102/',
  note: '工作簿为导师提供的讨论稿（FST5 / FST6 两套情景的维度与变体），不是最终分类体系；变体是否穷尽、能否互相穷举尚未核实。'
};

const D = [
  { id: 'political-subjects', en: 'Political subjects', zh: '政治主体', zone: 'socio', variants: [['State with centralized power (top-down)', '国家集中权力（自上而下）'], ['State but local-level decision making (bottom-up)', '国家为主、地方决策（自下而上）'], ['Post-State', '后国家形态']] },
  { id: 'international-system', en: 'International system', zh: '国际体系', zone: 'socio', variants: [['Planetary Confederation (top-down coordination, control, enforcement)', '行星邦联（自上而下协调、控制与执行）'], ['Deep green alliance (mutual support)', '深绿联盟（相互支持）'], ['Post-States and combination of States and non-States', '后国家与国家和非国家混合']] },
  { id: 'economic-objectives', en: 'Economic objectives', zh: '经济目标', zone: 'socio', variants: [['Human needs', '满足人类需要'], ['Self-sufficiency', '自给自足']] },
  { id: 'economic-scale', en: 'Scale of the economy', zh: '经济尺度', zone: 'socio', variants: [['Global', '全球'], ['National', '国家'], ['Local', '本地']] },
  { id: 'ecological-ceiling', en: 'Ecological ceiling', zh: '生态上限', zone: 'constraint', variants: [['Planetary boundaries (environmental policies)', '行星边界（环境政策）'], ['Integrity of the bioregion ecosystems (mutualism with nature)', '生物区域生态系统完整性（与自然共生）']] },
  { id: 'social-floor', en: 'Social floor', zh: '社会下限', zone: 'socio', variants: [['Universal decent living standards through global redistribution', '通过全球再分配实现普遍体面生活'], ['Egalitarian local communities', '平等的本地社区']] },
  { id: 'property', en: 'Property of means of production', zh: '生产资料所有制', zone: 'socio', variants: [['Socialization, Nationalization, community owned', '社会化、国有、社区所有'], ['Socialization (Commons)', '社会化（公地）'], ['Private property', '私有产权']] },
  { id: 'provision-system', en: 'System of provision', zh: '供给体系', zone: 'socio', variants: [['Public provision of basic goods', '基本品公共供给'], ['Self-organized local economies (commons)', '自组织的本地经济（公地）']] },
  { id: 'technology-social', en: 'Technology', zh: '技术取向', zone: 'tech', variants: [['Labour-intensive industries, global R&D for reducing social metabolism', '劳动密集型产业、以全球研发降低社会代谢'], ['Low tech, convivial, manual, local R&D', '低技术、宜人、手工、本地研发']] },
  { id: 'economic-planning', en: 'Economic planning', zh: '经济计划', zone: 'socio', variants: [['Centralized in State, coordinated globally', '国家集中、全球协调'], ['No planning. Self-sufficiency', '无计划、自给自足'], ['Free market with non-profit oriented companies and perfect competition', '非营利企业加完全竞争的自由市场']] },
  { id: 'trade', en: 'Trade', zh: '贸易', zone: 'socio', variants: [['Limited and internationally coordinated', '有限且国际协调'], ['Collapse of global trade and internet infrastructure', '全球贸易与互联网基础设施崩溃'], ['Limited but not coordinated', '有限但不协调']] },
  { id: 'work', en: 'Work', zh: '劳动', zone: 'socio', variants: [['Fewer working hours and redistribution of work', '更短工时与劳动再分配'], ['Informal work, autoproduction', '非正式劳动、自产']] },
  { id: 'health', en: 'Health', zh: '健康', zone: 'socio', variants: [['Increase in life expectancy', '预期寿命提高'], ['Potential decrease depending on the region', '视地区可能下降']] },
  { id: 'population-social', en: 'Population', zh: '人口（社会维度）', zone: 'socio', variants: [['Limited population growth; limited and globally coordinated migration', '人口有限增长、有限且全球协调的迁移'], ['Shrunk considerably, not coordinated migration', '大幅缩减、迁移不协调'], ['Increase or stabilize', '增长或稳定']] },
  { id: 'urban', en: 'Urban', zh: '聚落形态', zone: 'regional', variants: [['Cities', '城市'], ['Small self-sufficient communities, rural', '小型自给社区、乡村']] },
  { id: 'relation-nature', en: 'Relation with nature', zh: '与自然的关系', zone: 'regional', variants: [['Anthropocentric', '人类中心'], ['Post-anthropocentric', '后人类中心']] },
  { id: 'priorities', en: 'Priorities', zh: '优先次序', zone: 'socio', variants: [['Social > Environment > Economy', '社会 ＞ 环境 ＞ 经济'], ['Environment > Social > Economy', '环境 ＞ 社会 ＞ 经济']] },
  { id: 'ethics-beliefs', en: 'Ethics, beliefs', zh: '伦理与信念', zone: 'socio', variants: [['Local orientation', '本地取向'], ['Global orientation', '全球取向'], ['Nature for culture', '自然为文化服务'], ['Nature for society', '自然为社会服务'], ['Nature for nature', '自然为其自身']] },
  { id: 'provision-purpose', en: 'Purpose and organisation of provisioning', zh: '供给的目的与组织', zone: 'socio', variants: [['Full state provisioning', '完全国家供给'], ['State provisioning of essential goods', '国家供给必需品'], ['Mix of state and collective provisioning', '国家与集体混合供给'], ['Collective provisioning (alternative economies)', '集体供给（替代经济）']] },
  { id: 'technology-use', en: 'Technology use and development', zh: '技术使用与发展', zone: 'tech', variants: [['High reliance and moderate tech regulation', '高度依赖、中等技术监管'], ['Moderate reliance and high tech regulation', '中等依赖、高度技术监管'], ['Low-impact convivial technology', '低影响宜人技术']] }
];

export const SOCIAL_DIMENSIONS = D;

export function createSocialFramework(project) {
  const base = { version: 1, provenance: { origin: 'import', sourceId: 'social-framework-lauer', locator: SOCIAL_SOURCE.workbook } };
  const rootId = 'social-root';
  const nodes = [{ ...base, id: rootId, label: '社会维度（译自 Lauer 工作簿）', kind: 'category', zone: 'socio', parentIds: [], childIds: [], descriptorIds: [], evidenceRefs: ['social-source'] }];
  const descriptors = [], states = [], evidence = [];
  evidence.push({ ...base, id: 'social-source', kind: 'paper', sourceId: 'lauer-2025-workbook', locator: SOCIAL_SOURCE.workbook, excerpt: SOCIAL_SOURCE.note, reviewStatus: 'draft', evidenceRefs: [] });
  for (const dim of D) {
    const sectionId = 'social-sec-' + dim.id, descriptorId = 'social-' + dim.id, leafId = 'social-node-' + dim.id, evidenceId = 'social-ev-' + dim.id;
    const stateIds = dim.variants.map((_, i) => descriptorId + '-v' + i);
    evidence.push({ ...base, id: evidenceId, kind: 'paper', sourceId: 'lauer-2025-workbook', locator: SOCIAL_SOURCE.workbook + ' · row ' + dim.en, excerpt: '原文维度：' + dim.en + '；英文变体：' + dim.variants.map(v => v[0]).join(' / '), reviewStatus: 'draft', evidenceRefs: [] });
    nodes[0].childIds.push(sectionId);
    nodes.push({ ...base, id: sectionId, label: dim.zh + '（' + dim.en + '）', kind: 'category', zone: dim.zone, parentIds: [rootId], childIds: [leafId], descriptorIds: [], evidenceRefs: [evidenceId] });
    nodes.push({ ...base, id: leafId, label: dim.zh, kind: 'category', zone: dim.zone, parentIds: [sectionId], childIds: [], descriptorIds: [descriptorId], evidenceRefs: [evidenceId] });
    descriptors.push({ ...base, id: descriptorId, label: dim.zh, en: dim.en, role: 'context', zone: dim.zone, stateIds, evidenceRefs: [evidenceId] });
    dim.variants.forEach(([en, zh], i) => states.push({
      ...base, id: stateIds[i], descriptorId, label: zh, original: en, range: null, unit: null,
      validYears: [], scope: { regionId: project?.scope?.regionId || null }, evidenceRefs: [evidenceId]
    }));
  }
  return { nodes, descriptors, states, evidence };
}

export function joinSocialFramework(project) {
  const { nodes, descriptors, states, evidence } = createSocialFramework(project);
  const next = structuredClone(project);
  const conflicts = [];
  for (const list of [['taxonomy', nodes], ['descriptors', descriptors], ['states', states], ['evidence', evidence]]) {
    const [key, records] = list;
    for (const record of records) {
      const existing = next.data[key].find(item => item.id === record.id);
      if (!existing) next.data[key].push(structuredClone(record));
      else if (JSON.stringify(existing) !== JSON.stringify(record)) conflicts.push(key + ' / ' + record.id);
    }
  }
  if (conflicts.length) throw new Error('社会框架未加入，原项目保持不变：' + conflicts.join('；'));
  return next;
}
