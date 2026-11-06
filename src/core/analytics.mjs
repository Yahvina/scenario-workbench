// 结果分析核心：全部从冻结的 RunInput / RunResult 计算，不读当前项目替换历史。
const pairKey = (a, b) => JSON.stringify([a, b]);

export function configKey(config, ids) { return ids.map(id => config[id]).join('|'); }

export function tisOf(input, config) {
  // config 以变量 ID 为键；先把“本次选中的状态集合”取出来，再配对矩阵格子。
  const chosen = new Set(Object.values(config || {}));
  let sum = 0, cells = 0;
  for (const e of input.matrix.entries) {
    if (e.sourceStateId === e.targetStateId) continue;
    if (chosen.has(e.sourceStateId) && chosen.has(e.targetStateId)) { sum += e.score; cells++; }
  }
  return { sum, cells };
}

// γ 排除所选状态后重新取最大值；单状态不适用，返回 null。
export function gammaOf(trace) {
  const rows = trace.balances.map(b => {
    const alts = b.candidates.filter(c => c.stateId !== b.selectedStateId);
    if (!alts.length) return { descriptorId: b.descriptorId, gamma: null, applies: false };
    const best = alts.reduce((m, c) => c.support > m.support ? c : m, alts[0]);
    return { descriptorId: b.descriptorId, gamma: b.selectedSupport - best.support, bestAlternative: best.stateId, applies: true };
  });
  const valued = rows.filter(r => r.applies);
  return { rows, gamma: valued.length ? Math.min(...valued.map(r => r.gamma)) : null, applies: valued.length > 0 };
}

export function distribution(run, input) {
  const ids = input.activeDescriptorIds, total = run?.count;
  return ids.map(descriptorId => {
    const counts = run?.stateCounts?.[descriptorId] || {};
    const states = input.matrix.stateIdsByDescriptor[descriptorId] || [];
    return {
      descriptorId, total,
      rows: states.map(stateId => ({ stateId, count: counts[stateId] ?? 0, freq: total ? (counts[stateId] ?? 0) / total : null }))
    };
  });
}

export function topStates(run, input, limit = 2) {
  return distribution(run, input).map(d => ({
    descriptorId: d.descriptorId,
    rows: [...d.rows].sort((a, b) => b.count - a.count).slice(0, limit)
  }));
}

export function diffSets(baseAll, nextAll, ids) {
  const key = c => configKey(c, ids);
  const base = new Map((baseAll || []).map(c => [key(c), c]));
  const next = new Map((nextAll || []).map(c => [key(c), c]));
  const kept = [...base.keys()].filter(k => next.has(k)).map(k => next.get(k));
  const added = [...next.keys()].filter(k => !base.has(k)).map(k => next.get(k));
  const removed = [...base.keys()].filter(k => !next.has(k)).map(k => base.get(k));
  return { kept, added, removed, baseSize: base.size, nextSize: next.size };
}

// Hamming 距离：两个配置里有几个变量取的状态不同。
export function distance(a, b, ids) {
  let d = 0;
  for (const id of ids) if (a[id] !== b[id]) d++;
  return d;
}

// 确定性 k-medoids：初始中心按枚举顺序“最远优先”挑，结果只取决于输入顺序与 k。
export function clusters(scenarios, ids, k = 4) {
  if (!scenarios?.length) return { k: 0, clusters: [], method: 'k-medoids / Hamming', limited: false };
  const kk = Math.max(1, Math.min(k, scenarios.length));
  const medoids = [scenarios[0]];
  while (medoids.length < kk) {
    let best = null, bestD = -1;
    for (const s of scenarios) {
      const d = Math.min(...medoids.map(m => distance(m, s, ids)));
      if (d > bestD) { bestD = d; best = s; }
    }
    if (!best) break;
    medoids.push(best);
  }
  const assign = scenarios.map(s => {
    let bi = 0, bd = Infinity;
    medoids.forEach((m, i) => { const d = distance(m, s, ids); if (d < bd) { bd = d; bi = i; } });
    return { index: bi, d: bd };
  });
  const groups = medoids.map((m, i) => {
    const members = scenarios.filter((_, si) => assign[si].index === i);
    const spread = members.length ? members.reduce((s, c) => s + distance(m, c, ids), 0) / members.length : 0;
    return { index: i, medoid: m, members, size: members.length, avgDistance: spread };
  }).filter(g => g.size > 0);
  return { k: groups.length, clusters: groups, method: 'k-medoids / Hamming', limited: scenarios.length < (scenarios.count ?? scenarios.length) };
}

// 有向网络：只画矩阵里真实存在的格子；0 分不画成“无影响”，而是单独计数。
export function network(input) {
  const nodes = [];
  for (const id of input.activeDescriptorIds) for (const s of input.matrix.stateIdsByDescriptor[id]) nodes.push({ id: s, descriptorId: id });
  const edges = [], zeros = [];
  for (const e of input.matrix.entries) {
    if (e.sourceStateId === e.targetStateId) continue;
    const edge = { source: e.sourceStateId, target: e.targetStateId, score: e.score, judgmentId: e.judgmentId };
    if (e.score === 0) zeros.push(edge); else edges.push(edge);
  }
  return { nodes, edges, zeroEdges: zeros.length };
}

export function degrees(input) {
  const map = new Map(input.activeDescriptorIds.map(id => [id, { out: 0, in: 0, positive: 0, negative: 0 }]));
  for (const e of input.matrix.entries) {
    const a = stateOwner(input, e.sourceStateId), b = stateOwner(input, e.targetStateId);
    if (!a || !b || a === b) continue;
    map.get(a).out++; map.get(b).in++;
    if (e.score > 0) map.get(a).positive++; if (e.score < 0) map.get(a).negative++;
  }
  return map;
}
function stateOwner(input, stateId) {
  for (const id of input.activeDescriptorIds) if ((input.matrix.stateIdsByDescriptor[id] || []).includes(stateId)) return id;
  return null;
}

export function stateProfile(input, run, config) {
  const rows = input.activeDescriptorIds.map(descriptorId => {
    const stateId = config[descriptorId];
    const bucket = run?.stateCounts?.[descriptorId] || {};
    const total = run?.count ?? null;
    return { descriptorId, stateId, count: bucket[stateId] ?? 0, freq: total ? (bucket[stateId] ?? 0) / total : null };
  });
  return { rows, total: run?.count ?? null };
}
