// 方案检验记录：把「检验我的方案」的结果落到 localStorage，刷新不丢，白箱链可读。
// 记事实（何时、哪年、哪份配置、什么结论、当时项目修订号）与当次支持的逐条贡献；
// 不复制整张矩阵，只看不写回。过期判定是纯函数，便于单测。
// 写入失败（隐私模式等）静默降级为会话内结果。
const KEY = 'scenario-workbench.plan-check.v1';

// 只留公式卡和反查要用的字段：每个因素所选状态的支持分、各候选支持、逐条贡献。
function compactTrace(trace) {
  return {
    consistent: !!trace.consistent,
    balances: trace.balances.map(b => {
      const candidates = b.candidates || [];
      const selected = candidates.find(c => c.stateId === b.selectedStateId);
      return {
        descriptorId: b.descriptorId,
        selectedStateId: b.selectedStateId,
        selectedSupport: b.selectedSupport,
        maximum: b.maximum,
        gap: b.gap,
        candidates: candidates.map(c => ({ stateId: c.stateId, support: c.support })),
        contributions: (selected?.contributions || []).map(x => ({ sourceDescriptorId: x.sourceDescriptorId, sourceStateId: x.sourceStateId, score: x.score, judgmentId: x.judgmentId }))
      };
    })
  };
}

export function planCheckRecord({ project, year, plan, trace }) {
  return {
    year,
    config: { ...plan.config },
    planVersion: plan.planVersion,
    at: new Date().toISOString(),
    projectRevision: project.revision,
    consistent: !!trace.consistent,
    conflicts: trace.balances.filter(b => !b.consistent).length,
    factors: trace.balances.length,
    trace: compactTrace(trace)
  };
}

// 过期原因：配置变过 / 项目修订号变过。返回原因数组；空数组＝仍代表当前输入。
export function planCheckStaleReasons(record, { project, plan }) {
  if (!record) return ['还没有检验记录'];
  const reasons = [];
  if (JSON.stringify(record.config) !== JSON.stringify(plan.config)) reasons.push('这一年的状态选择变过');
  if (record.projectRevision !== project.revision) reasons.push('项目输入修订号已从 r' + record.projectRevision + ' 变到 r' + project.revision);
  return reasons;
}

export function readPlanChecks(projectId) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    const mine = all[projectId];
    return mine && typeof mine === 'object' ? structuredClone(mine) : {};
  } catch { return {}; }
}

export function savePlanCheck(projectId, record) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    all[projectId] = { ...(all[projectId] || {}), [record.year]: record };
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch { return false; }
}
