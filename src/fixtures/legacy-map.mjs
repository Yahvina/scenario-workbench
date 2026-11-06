// 旧目录（24 项）→《京津冀政策描述符体系》46 项的逐条对照。
// 只做身份对照，不代表状态、阈值、评分与模型映射已经迁移：
// 同义=概念等同；拆分=旧一项在新体系分成多项；合并=旧多项在新体系合成一项；
// 未匹配=新体系没有对应项（含按脚注转入结果指标的两项）。
// 拆分/合并后的旧状态与旧评分一律不复制，必须重新定义与重新判断。

export const MAPPING_CATEGORIES = [
  { id: 'same', label: '同义', hint: '概念等同，仅名称或口径表述不同' },
  { id: 'partial', label: '部分对应', hint: '名称相近但不完全等同（如强度≠支持、结构≠强度），不能沿用旧状态与评分' },
  { id: 'split', label: '拆分', hint: '旧一项在新体系分成多项，旧状态与评分不能直接沿用' },
  { id: 'merged', label: '合并', hint: '旧多项在新体系合成一项，口径变宽，需重新核定' },
  { id: 'unmatched', label: '未匹配', hint: '新体系没有对应项；不等于该政策不存在' }
];

export const LEGACY_MAP = [
  { legacy: 'jjj-d1', label: '经济增长速度', relation: 'unmatched', targets: [], note: '新体系是政策领域分类，不含经济增速这类外部驱动；需要时请用自定义因素补充，不能硬塞进政策条目。' },
  { legacy: 'jjj-d3', label: '人口空间分布与收缩态势', relation: 'unmatched', targets: [], note: '人口属背景驱动，新体系未收录。' },
  { legacy: 'jjj-d2', label: '产业结构', relation: 'unmatched', targets: [], note: '新体系没有“产业结构”整体项；相关意图分散在工业工艺与原料替代、种植结构调整，未强行拆分。' },
  { legacy: 'jjj-d20', label: '可再生价格干预强度', relation: 'split', targets: ['d46-02', 'd46-03'], note: '拆成投资补贴与发电补贴两项；旧分值不能整条照搬。' },
  { legacy: 'jjj-d21', label: '可再生数量约束强度', relation: 'merged', targets: ['d46-01'], note: '与“本地可再生能源开发规模”合并为“可再生能源部署”，由约束口径改为部署口径。' },
  { legacy: 'jjj-d6', label: '本地可再生能源开发规模', relation: 'merged', targets: ['d46-01'], note: '同上，合并为“可再生能源部署”。' },
  { legacy: 'jjj-d4', label: '一次能源结构', relation: 'unmatched', targets: [], outcome: 'd46-out-01', note: '按图示脚注转为结果指标，不计入 46 项，默认不作为政策输入。' },
  { legacy: 'jjj-d7', label: '终端电气化率', relation: 'unmatched', targets: [], outcome: 'd46-out-02', note: '按图示脚注转为结果指标，不计入 46 项，默认不作为政策输入。' },
  { legacy: 'jjj-d5', label: '区域电力互济强度', relation: 'same', targets: ['d46-09'], note: '同义，名称简化为“区域电力互济”。' },
  { legacy: 'jjj-d8', label: '钢铁工艺路线', relation: 'merged', targets: ['d46-12'], note: '并入“工业工艺与原料替代”，覆盖面更宽；旧三档路线不能直接当新状态。' },
  { legacy: 'jjj-d13', label: '单位产品能耗限额强度', relation: 'merged', targets: ['d46-10'], note: '并入“工业单位产出能耗”，由限额口径改为强度口径。' },
  { legacy: 'jjj-d14', label: '工业节能改造强度', relation: 'partial', targets: ['d46-11'], note: '部分对应：旧项是改造推进强度（结果/实施口径），新项是节能改造支持（政策工具口径）；强度不等于支持力度，旧三档与旧评分不能直接沿用。' },
  { legacy: 'jjj-d9', label: '碳捕集利用与封存部署规模', relation: 'same', targets: ['d46-45'], note: '同义，名称简化为“碳捕集利用与封存”。' },
  { legacy: 'jjj-d10', label: '碳移除规模', relation: 'partial', targets: ['d46-39'], note: '部分对应：新项“生态碳汇与碳移除”把汇与移除合并，旧项只讲移除；口径更宽，需重新定状态。' },
  { legacy: 'jjj-d15', label: '建筑能效标准强度', relation: 'partial', targets: ['d46-20'], note: '部分对应：旧项强调标准限值强度，新项是“能效要求”（可含标准、标识、改造要求）；不能仅凭名称相近当同义。' },
  { legacy: 'jjj-d16', label: '清洁取暖替代强度', relation: 'split', targets: ['d46-23', 'd46-24'], note: '拆成替代本身与支持政策两项。' },
  { legacy: 'jjj-d22', label: '新能源车价格干预强度', relation: 'partial', targets: ['d46-19'], note: '部分对应：价格干预可含购置补贴、税费与限价，新项只对应“购置支持”；充电设施支持是新体系新增项，无旧对应。' },
  { legacy: 'jjj-d23', label: '新能源车数量约束强度', relation: 'unmatched', targets: [], note: '新体系未列数量约束类交通政策（如牌照总量），不能当 0 或当不存在。' },
  { legacy: 'jjj-d24', label: '新能源车信息引导强度', relation: 'unmatched', targets: [], note: '新体系未列信息引导类工具。' },
  { legacy: 'jjj-d17', label: '新能源汽车渗透强度', relation: 'merged', targets: ['d46-18'], note: '结果口径并入“交通工具清洁能源替代”（工具口径），含义不完全等同。' },
  { legacy: 'jjj-d11', label: '用水总量与结构', relation: 'partial', targets: ['d46-32'], note: '部分对应：新项是“总量与强度”，旧项是“总量与结构”；“结构”（用水部门构成）在新体系没有对应维度，不能当同义。' },
  { legacy: 'jjj-d12', label: '京津冀协同机制强度', relation: 'unmatched', targets: [], note: '新体系没有区域协同治理项；这是治理条件，不是部门政策工具。' },
  { legacy: 'jjj-d18', label: '研发与示范投入强度', relation: 'partial', targets: ['d46-46'], note: '部分对应：新项限定低碳与节水研发，旧项含更广的研发与示范；范围不同。' },
  { legacy: 'jjj-d19', label: '碳价水平与碳市场覆盖', relation: 'split', targets: ['d46-42', 'd46-43'], note: '拆成“碳价”与“碳市场覆盖范围”；另新增“碳排放配额约束”无旧对应。' }
];

export function mappingSummary() {
  const count = id => LEGACY_MAP.filter(row => row.relation === id).length;
  return {
    total: LEGACY_MAP.length,
    same: count('same'), partial: count('partial'), split: count('split'), merged: count('merged'), unmatched: count('unmatched'),
    outcomes: LEGACY_MAP.filter(row => row.outcome).length
  };
}

export function mapFor(legacyId) {
  return LEGACY_MAP.find(row => row.legacy === legacyId) || null;
}

// 迁移“选择”，不迁移状态与评分：拆分/合并后旧档位与旧分值必须重新定义和重新判断。
export function migrateSelection(project, nodeIdOfDescriptor) {
  const selected = new Set(project.selection.descriptorIds);
  const rows = LEGACY_MAP.filter(row => selected.has(row.legacy));
  const addDescriptors = [], gaps = [], unresolved = [];
  for (const row of rows) {
    if (!row.targets.length) { gaps.push({ label: row.label, reason: row.outcome ? '已转为结果指标，不计入 46 项' : '新体系无对应项' }); continue; }
    const missing = row.targets.filter(id => !project.data.descriptors.some(d => d.id === id));
    if (missing.length) { unresolved.push({ label: row.label, reason: '当前项目还没有 46 项目录（缺 ' + missing.join('、') + '）' }); continue; }
    addDescriptors.push(...row.targets);
  }
  const nodeIds = [...new Set(addDescriptors.map(id => nodeIdOfDescriptor(id)).filter(Boolean))];
  return {
    legacySelected: rows.length,
    descriptorIds: [...new Set(addDescriptors)],
    nodeIds,
    gaps,
    unresolved,
    // 明示不迁移的内容，界面与导出直接引用这段文字。
    notCarried: '旧状态档位、按年安排、关系评分与依据均未迁移；拆分与合并项口径已变，需重新选择年度状态并重新判断关系。'
  };
}

export const MAPPING_SOURCE_NOTE = '对照依据：旧平台 24 项目录（src/fixtures/jjj-draft.mjs）与新体系图示逐项比对；只核身份，不核阈值与评分。';
