// 公式目录：一个方法一张卡，中文含义、符号对应、本次真实代入、出处、代码位置。
// 规则：没有实现的方法写“未接入”，不给示例数字；能从当前项目算出来的才填代入值。
export const FORMULAS = [
  {
    id: 'space', group: '组合空间', title: '组合空间与检查进度',
    meaning: '把所有变量的状态数相乘，得到要检查的配置总数；锁定某个变量的状态只会缩小这个总数，不会让它免于与其他候选比较。',
    expr: 'N = ∏ᵢ mᵢ ；方向数 = n(n−1) ；状态对格数 = Σᵢ≠ⱼ mᵢmⱼ',
    symbols: [['mᵢ', '第 i 个变量的状态数'], ['n', '活动变量个数'], ['N', '配置总数']],
    source: 'Weimer-Jehle (2009) 交叉影响平衡；项目内实现见 engine.mjs dimensions()',
    code: 'src/modules/solver/engine.mjs · dimensions()',
    notFor: '组合空间不是“检查了多少对”，也不是模型运行次数。',
    substitute: ctx => {
      if (!ctx?.input?.activeDescriptorIds) return null;
      const ids = ctx.input.activeDescriptorIds, m = ids.map(id => ctx.input.matrix.stateIdsByDescriptor[id]?.length || 0);
      const n = ids.length, pairs = m.reduce((s, x) => s + x, 0);
      const cells = m.reduce((s, x, i) => s + x * (pairs - m[i]), 0);
      const locks = ctx.input.lockedStateIds?.length || 0;
      if(ctx.input.conditionedStateIds?.length){
        const fixed=new Set([...(ctx.input.lockedStateIds||[]),...ctx.input.conditionedStateIds].map(id=>ctx.input.stateDefinitions.find(s=>s.id===id)?.descriptorId));
        const candidates=ids.reduce((total,id,i)=>total*(fixed.has(id)?1:m[i]),1);
        return '无约束 N = '+m.reduce((a,b)=>a*b,1)+'；给定 '+ctx.input.conditionedStateIds.length+' 个因素；本次候选 '+candidates+' 个；本次实际需要 '+ctx.input.matrix.entries.length+' 格评分（不要求给定目标及未选来源行）。';
      }
      return 'm = [' + m.join(', ') + ']；N = ' + m.reduce((a, b) => a * b, 1) + '；方向数 = ' + n * (n - 1) + '；状态对格数 = ' + cells + (locks ? '；已锁定 ' + locks + ' 个状态' : '；未锁定');
    }
  },
  {
    id: 'support', group: '自洽判据', title: '影响支持分 I',
    meaning: '固定其他变量的状态，把每一行对“目标变量取某个状态”的分数加起来，就是这个状态得到的总支持。',
    expr: 'Iⱼ(l | s) = Σᵢ≠ⱼ Cᵢⱼ(sᵢ, l)',
    symbols: [['Cᵢⱼ(sᵢ, l)', '源变量 i 取 sᵢ 时对目标 j 取 l 的那一格原始分'], ['Iⱼ(l|s)', '在配置 s 下，j 取 l 得到的支持分']],
    source: 'Weimer-Jehle (2009) Eq.1；engine.mjs evaluateCompiled()',
    code: 'src/modules/solver/engine.mjs · evaluateCompiled()',
    notFor: '支持分是矩阵内的相对支持，不是发生概率，也不是绩效。',
    substitute: ctx => ctx?.sample ? '以 ' + ctx.sample.label + ' 为例：' + ctx.sample.text : null
  },
  {
    id: 'consistent', group: '自洽判据', title: '内部一致性判据',
    meaning: '一个配置自洽，指每个接受判定的变量所选状态的支持分，都不低于它任何替代状态的支持分。允许并列。给定条件自身免检，锁定状态仍接受判定。',
    expr: '∀j, l：Iⱼ(sⱼ | s) ≥ Iⱼ(l | s)',
    symbols: [['sⱼ', '配置里 j 实际取的状态'], ['l', 'j 的任意候选状态']],
    source: 'Weimer-Jehle (2009) Eq.8；engine.mjs consistent',
    code: 'src/modules/solver/engine.mjs · evaluateCompiled()',
    notFor: '自洽不等于现实会发生，也不等于最优；不自洽的配置可以保留并解释。',
    substitute: ctx => ctx?.run ? '最近一次完整检算：检查 ' + ctx.run.checked + ' 个配置，自洽 ' + (ctx.run.count ?? '未定') + ' 个' + (ctx.run.truncated ? '（展示列表截断）' : '') : null
  },
  {
    id: 'gap', group: '裕度', title: '当前冲突差距 g',
    meaning: '所选状态比最强的替代状态低多少。自洽时 g = 0，所以它只能说明“差多少”，不能说明“好多少”。',
    expr: 'gⱼ = maxₗ Iⱼ(l | s) − Iⱼ(sⱼ | s) ≥ 0',
    symbols: [['maxₗ', '包含所选状态在内的所有候选里取最大'], ['gⱼ', '该变量的冲突差距']],
    source: 'engine.mjs explain().gap；PPT 第 1 页“情景内部一致性筛选”',
    code: 'src/modules/solver/engine.mjs · evaluateCompiled()',
    notFor: 'g 永远非负；不能把 −g 当作裕度，也不能用 g 排序方案优劣。',
    substitute: ctx => ctx?.trace ? '本次配置：' + ctx.trace.balances.map(b => (ctx.name?.(b.descriptorId) || b.descriptorId) + ' g=' + b.gap).join('；') : null
  },
  {
    id: 'gamma', group: '裕度', title: '有符号裕度 γ 与总体裕度 Γ',
    meaning: '把所选状态排除后重新取最大值，再与所选相减。严格占优时为正，被压过时为负；单状态没有替代，不适用。',
    expr: 'γⱼ = Iⱼ(sⱼ|s) − maxₗ≠sⱼ Iⱼ(l|s) ；Γ = minⱼ γⱼ',
    symbols: [['maxₗ≠sⱼ', '排除所选状态后的最大支持'], ['Γ', '所有变量里最紧的那个裕度']],
    source: '任务书白箱表；本平台 2026-11-05 新增，未作为 CIB 判据使用',
    code: 'src/modules/solver/plan-check.mjs；src/core/analytics.mjs · gammaOf()',
    notFor: 'γ 是诊断量，不是论文原判据；不能用它改判自洽。',
    substitute: ctx => {
      if (!ctx?.trace) return null;
      const rows = ctx.trace.balances.map(b => {
        const alts = b.candidates.filter(c => c.stateId !== b.selectedStateId);
        if (!alts.length) return (ctx.name?.(b.descriptorId) || b.descriptorId) + ' γ=不适用';
        const best = alts.reduce((m, c) => c.support > m.support ? c : m, alts[0]);
        return (ctx.name?.(b.descriptorId) || b.descriptorId) + ' γ=' + (b.selectedSupport - best.support);
      });
      return '本次配置：' + rows.join('；');
    }
  },
  {
    id: 'tis', group: '诊断', title: '总影响诊断 TIS',
    meaning: '把选中配置里“谁影响谁”的那些格子直接相加，用来说明这个配置整体被推的方向，不解释成排放或概率。',
    expr: 'TIS(s) = Σᵢ≠ⱼ Cᵢⱼ(sᵢ, sⱼ)',
    symbols: [['Cᵢⱼ(sᵢ,sⱼ)', '配置实际取到的那一格']],
    source: '任务书白箱表（指定诊断量）',
    code: 'src/core/analytics.mjs · tisOf()',
    notFor: '数值更高不等于排放更低、概率更高或方案更优。',
    substitute: ctx => ctx?.tis == null ? null : '本次配置 TIS = ' + ctx.tis
  },
  {
    id: 'interp', group: '时间', title: '数值路径线性插值',
    meaning: '只有同单位、同口径的相邻数值节点之间才插值；定性状态不做插值，缺值不跨越、不外推。',
    expr: 'x(t) = x₀ + (x₁ − x₀)(t − t₀)/(t₁ − t₀)',
    symbols: [['x₀, x₁', '相邻两个非缺失数值节点'], ['t', '目标年份']],
    source: 'timeline/logic.mjs；阶梯与不插值另作说明',
    code: 'src/modules/timeline/logic.mjs',
    notFor: '定性状态排列不是数值曲线，不能代入本式。',
    substitute: ctx => ctx?.interpolationSample || null
  },
  {
    id: 'binding', group: '时间', title: '状态归属与正式绑定',
    meaning: '用阈值区间判断某个指标值落在哪个状态，并核对单位、地区、年份与绑定版本。',
    expr: 'min ≤ x ≤ max（端点是否包含由状态定义给出）',
    symbols: [['x', '指标值'], ['min,max', '状态区间']],
    source: 'timeline/annual-override.mjs 与 override-store.mjs',
    code: 'src/modules/timeline/annual-override.mjs',
    notFor: '0 是有效值；缺失、无匹配、多重匹配、过期绑定分别处理，不按排序强选。',
    substitute: ctx => ctx?.bindingSample || null
  },
  {
    id: 'aggregate', group: '专家', title: '专家判断聚合（候选规则）',
    meaning: '加权平均把多位专家的同一格合成一个数。结果是小数时必须显式处理，不能偷偷取整送进整数引擎。',
    expr: 'μ = Σᵣ wᵣcᵣ / Σᵣ wᵣ（另有简单平均、贝叶斯聚合）',
    symbols: [['cᵣ', '第 r 位专家对该格的原始分'], ['wᵣ', '专家权重']],
    source: '录音 P431 提到简单平均／加权平均／贝叶斯聚合；具体规则待方法核对',
    code: 'src/core/expert.mjs · aggregate()',
    notFor: '三种方法分开标注；没有权重来源时不假装有加权依据。',
    substitute: ctx => ctx?.aggregateSample || null
  },
  {
    id: 'ahp', group: '专家', title: 'AHP 权重与一致性',
    meaning: '对重要性做两两比较，求最大特征值对应的权重，并用 CI/CR 判断比较是否过于自相矛盾。',
    expr: 'Aw = λmax w ；CI = (λmax − n)/(n−1) ；CR = CI / RIₙ',
    symbols: [['A', '互反的两两比较矩阵'], ['λmax', '主特征值'], ['RIₙ', '随机一致性指标（需有出处）']],
    source: 'Saaty AHP；RI 表待补出处（当前内置表在 src/core/ahp.mjs 中标注为待核）',
    code: 'src/core/ahp.mjs',
    notFor: '重要性不是关系评分；AHP 的 CR 不能拿来当作 CIB 自洽的证明。',
    substitute: ctx => ctx?.ahpSample || null
  },
  {
    id: 'ahp-cib', group: '专家', title: 'AHP–CIB 加权（待核）',
    meaning: '把重要性权重作用到影响矩阵上的耦合方法。加权对象、方向、尺度与归一化必须以原论文为准。',
    expr: '按原论文定义；平台内当前只提供可切换的“按源变量加权”候选规则，并保留未加权基线',
    symbols: [['wᵢ', '源变量 i 的重要性权重'], ['C′ᵢⱼ', '加权后的分值（可能非整数）']],
    source: 'PPT 第 11–16 页；原论文未取得，规则未核实',
    code: 'src/core/weighted.mjs · weightedSupport()',
    notFor: '不能每格随意乘权重；不能宣称加权后结果更少就更好；未核验前不得写成“已按原论文实现”。',
    substitute: ctx => ctx?.weightedSample || null
  },
  {
    id: 'frequency', group: '结果', title: '情景状态频率',
    meaning: '在所有完成求解的自洽配置里，某个变量取某个状态的比例。分母必须是全量，不能是展示截断后的列表。',
    expr: 'fⱼ(l) = |{s ∈ S : sⱼ = l}| / |S|',
    symbols: [['S', '全量自洽配置集合'], ['|S|', '自洽配置数']],
    source: '任务书白箱表；engine 在枚举时累计全量计数',
    code: 'src/modules/solver/engine.mjs · stateCounts；src/core/analytics.mjs · distribution()',
    notFor: '频率不是发生概率；S 为空时无定义。',
    substitute: ctx => ctx?.distributionSample || null
  },
  {
    id: 'compare', group: '结果', title: '两次结果的集合差异',
    meaning: '同一套定义下，比较两次完整结果的保留、新增与消失；数量变化不能替代集合差异。',
    expr: '保留 = S₀ ∩ S₁ ；新增 = S₁ ∖ S₀ ；消失 = S₀ ∖ S₁',
    symbols: [['S₀', '基线全量自洽集合'], ['S₁', '扰动后全量自洽集合']],
    source: '任务书白箱表；compare.mjs 与 sensitivity 共用',
    code: 'src/core/analytics.mjs · diffSets()',
    notFor: '截断或未完成时不能说“交集为空”；定义变化要先对齐身份。',
    substitute: ctx => ctx?.diffSample || null
  },
  {
    id: 'prob', group: '接入', title: '概率与贝叶斯输出（未接入）',
    meaning: '需要明确的先验、观测与似然，才能给后验与不确定性；本平台当前没有概率模型。',
    expr: 'p(θ|D) ∝ p(D|θ)p(θ)',
    symbols: [['θ', '待估参数'], ['D', '观测']],
    source: 'PPT 第 2、24 页；10-21 四种输出要求',
    code: '未实现（依赖概率模型与先验数据）',
    notFor: '没有概率模型时，不能把 CIB 分数或情景频率写成发生概率。',
    substitute: () => null
  }
];

export function formulaById(id) {
  return FORMULAS.find(f => f.id === id) || null;
}
