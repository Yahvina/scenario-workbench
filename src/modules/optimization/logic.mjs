// 政策组合优化（轻量版）：在已经算出的自洽组合里，找「离我的方案最近的几条」。
// 不做绩效优化、不引入成本/减排模型、不排名好坏；只按状态差异数给出可比配置。
// 全部读冻结的 RunInput / RunResult，不读当前项目替换历史。
import { distance } from '../../core/analytics.mjs';

// 与用户方案的距离：有几个变量取了不同状态（Hamming）。
// 锁定的变量不会出现在差异里（配置必须满足锁定值）。
export function rankAlternatives(input, run, current) {
  const ids = input.activeDescriptorIds || [];
  const pool = Array.isArray(run?.all) && run.all.length ? run.all : (run?.scenarios || []);
  const rows = pool.map(config => {
    const changes = ids
      .filter(id => config[id] !== current?.[id])
      .map(id => ({ descriptorId: id, from: current?.[id] ?? null, to: config[id] }));
    return { config, distance: distance(current || {}, config, ids), changes, sameAsPlan: changes.length === 0 };
  });
  rows.sort((a, b) => a.distance - b.distance);
  return {
    rows,
    sample: pool.length,
    total: Number.isInteger(run?.count) ? run.count : null,
    complete: Number.isInteger(run?.count) && pool.length >= run.count
  };
}

// 每个变量在候选里被改成了什么、出现过几次，用来看某个调整是不是常见做法。
export function changeFrequency(rows, ids) {
  const map = new Map(ids.map(id => [id, new Map()]));
  for (const row of rows) {
    for (const c of row.changes) {
      const bucket = map.get(c.descriptorId);
      if (bucket) bucket.set(c.to, (bucket.get(c.to) || 0) + 1);
    }
  }
  return map;
}
