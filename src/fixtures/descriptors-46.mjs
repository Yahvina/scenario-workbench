// 《京津冀政策描述符体系》图示（2026-11-06 用户提供）的逐项转录。
// 三级：政策领域 → 细分领域 → 具体描述符；10 个领域、46 项末级描述符。
// 分类本身已确认；每个描述符下的三档状态**不是**图示内容，是平台为跑通机制给的参考档位，
// 阈值、单位、参数与模型映射均未核定，界面必须如实标注。
// 一次能源结构、终端电气化率按图示脚注单列为结果指标，不计入 46 项，默认不作为政策输入。

export const BASELINE_CATALOG_LABEL = '京津冀政策描述符体系';
export const BASELINE_SOURCE_ID = 'jjj-descriptor-system-2026-11';
export const BASELINE_STATE_SOURCE_ID = 'd46-reference-states';

export const BASELINE_SOURCE = {
  id: 'd46-source-catalog',
  kind: 'user-assumption',
  sourceId: BASELINE_SOURCE_ID,
  locator: '《京津冀政策描述符体系》图示：政策领域→细分领域→具体描述符（2026-11-06 提供）',
  excerpt: '分类已确认：10 个领域、46 项末级描述符；一次能源结构、终端电气化率按脚注单列为结果指标，不计入 46 项。依据与模型映射仍待逐项核对。',
  reviewStatus: 'draft',
  version: 1,
  provenance: { origin: 'import', sourceId: BASELINE_SOURCE_ID, locator: 'src/fixtures/descriptors-46.mjs' }
};

export const BASELINE_STATE_SOURCE = {
  id: 'd46-source-states',
  kind: 'user-assumption',
  sourceId: 'platform-reference-states',
  locator: 'src/fixtures/descriptors-46.mjs：每个描述符的三档参考状态',
  excerpt: '三档状态（强化/维持/放松 等）为平台参考设定，用于跑通年度方案与检验；阈值、单位、文献依据、模型变量映射均未核定，不代表真实政策取值。',
  reviewStatus: 'illustrative',
  version: 1,
  provenance: { origin: 'fixture', sourceId: 'platform-reference-states', locator: 'src/fixtures/descriptors-46.mjs' }
};

// 结果指标：图示脚注单列，编号 R1/R2，不参与 10×46 计数。
export const OUTCOME_DESCRIPTORS = [
  { key: 'R1', label: '一次能源结构', states: ['煤炭占比大幅下降', '煤炭占比稳步下降', '基本不变'], note: '结果指标，不计入 46 项；默认不作为政策输入' },
  { key: 'R2', label: '终端电气化率', states: ['快速提升', '稳步提升', '基本不变'], note: '结果指标，不计入 46 项；默认不作为政策输入' }
];

const L = (label, states) => ({ label, states });

export const DESCRIPTOR_TREE = [
  {
    id: 'd46-g01', label: '能源生产与供应', sections: [
      { label: '可再生能源', items: [L('可再生能源部署', ['加快部署', '稳步推进', '节奏放缓']), L('可再生能源投资补贴', ['扩大补贴', '维持补贴', '补贴退坡']), L('可再生能源发电补贴', ['提高补贴', '维持补贴', '取消补贴'])] },
      { label: '化石能源', items: [L('化石能源设施限制与退出', ['加严限制', '维持现状', '放宽限制'])] },
      { label: '发电与供热', items: [L('发电与供热效率', ['显著提升', '稳步提升', '基本不变'])] },
      { label: '能源价格', items: [L('用能价格调节', ['强化价格信号', '维持现状', '弱化价格信号'])] },
      { label: '氢能', items: [L('制氢能效', ['大幅提升', '稳步提升', '基本不变'])] },
      { label: '供热系统', items: [L('供热管网改造与能效', ['大规模改造', '局部改造', '暂缓改造'])] },
      { label: '区域电力', items: [L('区域电力互济', ['显著增强', '维持现状', '趋于减弱'])] }
    ]
  },
  {
    id: 'd46-g02', label: '工业生产', sections: [
      { label: '工业能效', items: [L('工业单位产出能耗', ['快速下降', '缓慢下降', '基本不变']), L('工业节能改造支持', ['扩大支持', '维持支持', '收缩支持'])] },
      { label: '工业生产结构', items: [L('工业工艺与原料替代', ['加速替代', '试点推进', '基本不变']), L('工业产能限制与退出', ['加严退出', '维持现状', '放宽退出'])] },
      { label: '工业能源使用', items: [L('工业能源替代', ['加速替代', '局部替代', '基本不变'])] },
      { label: '能源回收', items: [L('余热余压利用', ['大幅提升', '部分提升', '基本不变'])] }
    ]
  },
  {
    id: 'd46-g03', label: '交通运输', sections: [
      { label: '运输结构', items: [L('运输方式转移', ['明显转向铁路水运', '小幅转移', '基本不变'])] },
      { label: '充电设施', items: [L('充电设施支持', ['加快建设', '稳步建设', '建设放缓'])] },
      { label: '交通工具', items: [L('交通工具清洁能源替代', ['加速替代', '稳步替代', '基本不变']), L('新能源车辆购置支持', ['扩大支持', '维持支持', '支持退坡'])] }
    ]
  },
  {
    id: 'd46-g04', label: '建筑与公共设施', sections: [
      { label: '建筑能效', items: [L('建筑能效要求', ['提高要求', '维持现状', '放宽要求']), L('建筑节能改造规模', ['大规模改造', '部分改造', '暂缓改造']), L('建筑节能改造支持', ['扩大支持', '维持支持', '收缩支持'])] },
      { label: '清洁取暖', items: [L('清洁取暖替代', ['加速替代', '稳步替代', '替代放缓']), L('清洁取暖支持', ['扩大支持', '维持支持', '支持退坡'])] }
    ]
  },
  {
    id: 'd46-g05', label: '水资源', sections: [
      { label: '工业用水', items: [L('工业单位产出取水强度', ['快速下降', '缓慢下降', '基本不变']), L('工业水回用率', ['显著提高', '缓慢提高', '基本不变'])] },
      { label: '农业用水', items: [L('农业用水效率', ['显著提高', '缓慢提高', '基本不变'])] },
      { label: '水源替代', items: [L('非常规水源利用', ['大幅扩大', '试点扩大', '基本不变'])] },
      { label: '生活及公共机构用水', items: [L('生活及公共机构用水效率', ['显著提高', '缓慢提高', '基本不变'])] },
      { label: '发电供热与信息服务用水', items: [L('发电供热与数据中心用水效率', ['显著提高', '缓慢提高', '基本不变'])] },
      { label: '供水系统', items: [L('供水系统节水与降损', ['大幅降损', '局部改造', '基本不变'])] },
      { label: '区域用水', items: [L('区域用水总量与强度', ['严格压减', '稳定控制', '放宽控制'])] }
    ]
  },
  {
    id: 'd46-g06', label: '信息服务', sections: [
      { label: '数据中心', items: [L('数据中心能效', ['显著提升', '稳步提升', '基本不变']), L('数据中心清洁能源利用', ['大幅提高', '部分提高', '基本不变'])] },
      { label: '通信设施', items: [L('通信设施能效', ['显著提升', '稳步提升', '基本不变'])] }
    ]
  },
  {
    id: 'd46-g07', label: '农业、林业与土地利用', sections: [
      { label: '种植业', items: [L('种植结构调整', ['明显调整', '局部调整', '基本不变'])] },
      { label: '农业投入', items: [L('农业化肥投入', ['明显减量', '缓慢减量', '基本不变'])] },
      { label: '农业装备', items: [L('农业装备购置支持', ['扩大支持', '维持支持', '收缩支持'])] },
      { label: '生态碳汇', items: [L('生态碳汇与碳移除', ['大幅增强', '稳步增强', '基本不变'])] }
    ]
  },
  {
    id: 'd46-g08', label: '废弃物处理与资源化', sections: [
      { label: '废弃物利用', items: [L('废弃物资源化利用', ['大幅提升', '部分提升', '基本不变'])] },
      { label: '废弃物与污水处理', items: [L('废弃物与污水处理能效', ['显著提升', '稳步提升', '基本不变'])] }
    ]
  },
  {
    id: 'd46-g09', label: '碳管理', sections: [
      { label: '碳市场', items: [L('碳价', ['高位', '温和上行', '低位']), L('碳市场覆盖范围', ['扩大覆盖', '维持现状', '收窄覆盖']), L('碳排放配额约束', ['明显收紧', '温和收紧', '适度放宽'])] },
      { label: '碳捕集利用与封存', items: [L('碳捕集利用与封存', ['大规模部署', '试点部署', '基本不部署'])] }
    ]
  },
  {
    id: 'd46-g10', label: '跨领域', sections: [
      { label: '技术创新', items: [L('低碳与节水研发投入', ['大幅增加', '稳步增加', '基本不变'])] }
    ]
  }
];

const pad = value => String(value).padStart(2, '0');

// 全部 ID 由位置推导：领域 d46-gNN，细分 d46-gNN-sNN，末级节点 d46-gNN-sNN-nNN，
// 描述符 d46-<序号>，状态 d46-<序号>-st<n>。序号按图示阅读顺序 1..46。
export function buildBaseline(scope = null) {
  const taxonomy = [], descriptors = [], states = [];
  // 参考状态默认带上当前研究范围：用户不用逐条填适用范围，想改再改。
  // 不传 scope 时保持原样（null / 空数组），供契约测试使用。
  const scopeRegion = scope && typeof scope.regionId === 'string' && scope.regionId.trim() ? scope.regionId.trim() : null;
  const scopeYears = scope && Array.isArray(scope.years) ? [...scope.years] : [];
  const common = { version: 1, provenance: { origin: 'import', sourceId: BASELINE_SOURCE_ID, locator: 'src/fixtures/descriptors-46.mjs' } };
  let leaf = 0;
  DESCRIPTOR_TREE.forEach((domain, di) => {
    const domainId = 'd46-g' + pad(di + 1);
    const sectionIds = domain.sections.map((_, si) => domainId + '-s' + pad(si + 1));
    taxonomy.push({ ...common, id: domainId, label: domain.label, kind: 'category', level: 1, parentIds: [], childIds: sectionIds, descriptorIds: [], evidenceRefs: [BASELINE_SOURCE.id] });
    domain.sections.forEach((section, si) => {
      const sectionId = sectionIds[si];
      const leafIds = section.items.map((_, li) => sectionId + '-n' + pad(li + 1));
      taxonomy.push({ ...common, id: sectionId, label: section.label, kind: 'category', level: 2, parentIds: [domainId], childIds: leafIds, descriptorIds: [], evidenceRefs: [BASELINE_SOURCE.id] });
      section.items.forEach((item, li) => {
        leaf += 1;
        const descriptorId = 'd46-' + pad(leaf);
        const nodeId = leafIds[li];
        const stateIds = item.states.map((_, st) => descriptorId + '-st' + (st + 1));
        taxonomy.push({ ...common, id: nodeId, label: item.label, kind: 'leaf', level: 3, parentIds: [sectionId], childIds: [], descriptorIds: [descriptorId], evidenceRefs: [BASELINE_SOURCE.id, BASELINE_STATE_SOURCE.id] });
        descriptors.push({ ...common, id: descriptorId, label: item.label, role: 'input', order: leaf, domainId, sectionId, taxonomyNodeId: nodeId, stateIds, evidenceRefs: [BASELINE_SOURCE.id, BASELINE_STATE_SOURCE.id] });
        item.states.forEach((label, st) => states.push({
          ...common, id: stateIds[st], descriptorId, label, range: null, unit: null, validYears: [...scopeYears],
          scope: { regionId: scopeRegion }, order: st + 1,
          evidenceRefs: [BASELINE_STATE_SOURCE.id]
        }));
      });
    });
  });
  // 结果指标：单独一棵顶层节点，明确不计入 46 项。
  const outcomeIds = OUTCOME_DESCRIPTORS.map((_, i) => 'd46-node-outcome-' + (i + 1));
  taxonomy.push({ ...common, id: 'd46-g-outcome', label: '结果指标（不计入 46 项）', kind: 'category', level: 1, parentIds: [], childIds: ['d46-node-outcome'], descriptorIds: [], evidenceRefs: [BASELINE_SOURCE.id] });
  OUTCOME_DESCRIPTORS.forEach((item, i) => {
    const descriptorId = 'd46-out-' + pad(i + 1);
    const stateIds = item.states.map((_, st) => descriptorId + '-st' + (st + 1));
    taxonomy.push({ ...common, id: outcomeIds[i], label: item.label, kind: 'leaf', level: 2, parentIds: ['d46-node-outcome'], childIds: [], descriptorIds: [descriptorId], evidenceRefs: [BASELINE_SOURCE.id, BASELINE_STATE_SOURCE.id] });
    descriptors.push({ ...common, id: descriptorId, label: item.label, role: 'outcome', outcome: true, note: item.note, stateIds, evidenceRefs: [BASELINE_SOURCE.id, BASELINE_STATE_SOURCE.id] });
    item.states.forEach((label, st) => states.push({ ...common, id: stateIds[st], descriptorId, label, range: null, unit: null, validYears: [...scopeYears], scope: { regionId: scopeRegion }, order: st + 1, evidenceRefs: [BASELINE_STATE_SOURCE.id] }));
  });
  taxonomy.push({ ...common, id: 'd46-node-outcome', label: '一次能源结构与终端电气化率', kind: 'category', level: 2, parentIds: ['d46-g-outcome'], childIds: outcomeIds, descriptorIds: [], evidenceRefs: [BASELINE_SOURCE.id] });
  return { taxonomy, descriptors, states, evidence: [BASELINE_SOURCE, BASELINE_STATE_SOURCE] };
}

export function baselineCounts() {
  const leafNodes = DESCRIPTOR_TREE.flatMap(domain => domain.sections.flatMap(section => section.items));
  return {
    domains: DESCRIPTOR_TREE.length,
    sections: DESCRIPTOR_TREE.reduce((sum, domain) => sum + domain.sections.length, 0),
    leaves: leafNodes.length,
    outcomes: OUTCOME_DESCRIPTORS.length
  };
}

export const BASELINE_LABELS = DESCRIPTOR_TREE.flatMap(domain => domain.sections.flatMap(section => section.items.map(item => item.label)));
