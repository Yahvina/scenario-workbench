// 结果可视化的纯计算部分：不碰 DOM，便于单测。
// 口径：全部读冻结的 RunInput / RunResult，不预测、不给绩效结论。

// 状态分布：run.stateCounts 记的是"全量自洽配置里这个状态出现了几次"，
// 分母是 run.count（自洽总数），不是展示出来的前几条。
export function stateDistribution(input, run) {
  const ids = input?.activeDescriptorIds || [];
  const total = Number.isInteger(run?.count) ? run.count : null;
  return {
    total,
    rows: ids.map(descriptorId => {
      const counts = run?.stateCounts?.[descriptorId] || {};
      const states = input?.matrix?.stateIdsByDescriptor?.[descriptorId] || [];
      return {
        descriptorId,
        states: states.map(stateId => ({ stateId, count: counts[stateId] ?? 0 })),
        max: Math.max(0, ...states.map(stateId => counts[stateId] ?? 0))
      };
    })
  };
}

// 状态搭配约束：逐对因素统计实际出现的状态搭配数。
// 可能搭配全部出现 = 这一对没有被自洽性额外约束；只出现少数 = 被绑在一起。
// 只用能逐条比较的那些组合（run.all 有上限），complete=false 时界面要写明样本范围。
export function pairingConstraints(input, run, all = []) {
  const ids = input?.activeDescriptorIds || [];
  const list = Array.isArray(all) && all.length ? all : (run?.scenarios || []);
  const sample = list.length;
  const total = Number.isInteger(run?.count) ? run.count : null;
  const pairs = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i], b = ids[j];
      const statesA = input?.matrix?.stateIdsByDescriptor?.[a] || [];
      const statesB = input?.matrix?.stateIdsByDescriptor?.[b] || [];
      const possible = statesA.length * statesB.length;
      const observed = new Map();
      for (const config of list) {
        if (!config || config[a] === undefined || config[b] === undefined) continue;
        const key = config[a] + '\u0000' + config[b];
        const hit = observed.get(key);
        if (hit) hit.count += 1; else observed.set(key, { a: config[a], b: config[b], count: 1 });
      }
      const combos = [...observed.values()].sort((x, y) => y.count - x.count || String(x.a).localeCompare(String(y.a)));
      pairs.push({ a, b, possible, used: observed.size, combos, coverage: possible ? observed.size / possible : 1 });
    }
  }
  return { pairs, sample, total, complete: total !== null && sample >= total };
}
