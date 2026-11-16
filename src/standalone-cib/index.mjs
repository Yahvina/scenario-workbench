const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const names = values => Array.isArray(values) && values.length > 0 &&
  Array.from(values).every(value => typeof value === 'string' && value.trim()) && new Set(values).size === values.length;
const blockKey = (source, target) => JSON.stringify([source, target]);

function requireInput(condition, message) {
  if (!condition) throw new TypeError(message);
}

export function runCib({ descriptors, blocks }, { mode = 'conditioned', fixed = {}, limit = 100000 } = {}) {
  requireInput(Array.isArray(descriptors) && descriptors.length >= 2 &&
    descriptors.every(d => isRecord(d) && names(d.states)) && names(descriptors.map(d => d.id)),
  '需要至少两个描述符，每个描述符需有唯一名称和状态。');
  requireInput(Array.isArray(blocks), '需要有向评分矩阵。');
  requireInput(mode === 'locked' || mode === 'conditioned', '模式须为 locked 或 conditioned。');
  requireInput(isRecord(fixed) && Object.entries(fixed).every(([id, state]) =>
    descriptors.find(d => d.id === id)?.states.includes(state)), '给定状态必须属于对应描述符。');
  requireInput(Number.isInteger(limit) && limit > 0 && limit <= 100000, '枚举上限须在 1 至 100000 之间。');

  const checkedDescriptors = descriptors.filter(d => mode === 'locked' || !Object.hasOwn(fixed, d.id));
  requireInput(checkedDescriptors.length > 0, '至少需要一个接受自洽判定的描述符。');
  const choices = descriptors.map(d => Object.hasOwn(fixed, d.id) ? [fixed[d.id]] : d.states);
  const candidateCount = choices.reduce((count, states) => count * BigInt(states.length), 1n);
  const blocksByDirection = new Map();
  for (const block of blocks) {
    requireInput(Array.isArray(block) && block.length === 3, '每个方向需要来源、目标和评分表。');
    const [source, target, scores] = block;
    const from = descriptors.find(d => d.id === source);
    const to = descriptors.find(d => d.id === target);
    const key = blockKey(source, target);
    requireInput(from && to && source !== target && !blocksByDirection.has(key), '评分方向重复、未知或指向自身。');
    requireInput(Array.isArray(scores) && scores.length === from.states.length &&
      Array.from(scores).every(row => Array.isArray(row) && row.length === to.states.length &&
        Array.from(row).every(score => score === null || (Number.isInteger(score) && Math.abs(score) <= 3))),
    '评分表尺寸须与状态数一致，评分须为 −3 至 +3 的整数或空值。');
    blocksByDirection.set(key, scores);
  }

  const missing = [];
  const contributionsByTarget = new Map();
  for (const target of checkedDescriptors) {
    const sources = [];
    for (const [index, source] of descriptors.entries()) {
      if (source.id === target.id) continue;
      const scores = blocksByDirection.get(blockKey(source.id, target.id));
      const rows = new Map();
      for (const state of choices[index]) {
        const row = scores?.[source.states.indexOf(state)];
        target.states.forEach((candidate, j) => {
          if (row?.[j] == null) missing.push({ source: source.id, state, target: target.id, candidate });
        });
        rows.set(state, row);
      }
      sources.push({ id: source.id, rows });
    }
    contributionsByTarget.set(target.id, sources);
  }

  const base = { mode, fixed, candidateCount: candidateCount.toString() };
  if (missing.length) return { ...base, status: 'missing-scores', checked: 0, count: null, scenarios: [], missing };
  if (candidateCount > BigInt(limit)) return { ...base, status: 'space-limit', checked: 0, count: null, scenarios: [], limit };

  const positions = choices.map(() => 0);
  const scenarios = [];
  let firstRejected = null;
  for (let checked = 0; checked < Number(candidateCount); checked++) {
    const configuration = Object.fromEntries(descriptors.map((d, i) => [d.id, choices[i][positions[i]]]));
    const balances = checkedDescriptors.map(target => {
      const candidates = target.states.map((state, j) => {
        const contributions = contributionsByTarget.get(target.id).map(source => ({
          descriptor: source.id, state: configuration[source.id], score: source.rows.get(configuration[source.id])[j]
        }));
        return { state, support: contributions.reduce((sum, entry) => sum + entry.score, 0), contributions };
      });
      const chosen = candidates.find(candidate => candidate.state === configuration[target.id]);
      const gap = candidates.reduce((max, candidate) => Math.max(max, candidate.support), -Infinity) - chosen.support;
      return { descriptor: target.id, chosen: chosen.state, gap, candidates };
    });
    const explanation = { configuration, balances };
    if (balances.every(balance => balance.gap === 0)) scenarios.push(explanation);
    else firstRejected ??= explanation;

    let i = positions.length - 1;
    while (i >= 0 && ++positions[i] === choices[i].length) positions[i--] = 0;
  }
  return { ...base, status: 'completed', checked: Number(candidateCount), count: scenarios.length, scenarios, firstRejected };
}

export function compareCib(input, change, options = {}) {
  const baseline = runCib(input, options);
  if (baseline.status !== 'completed') return { status: baseline.status, baseline };

  const { source, sourceState, target, targetState, score } = change;
  const from = input.descriptors.find(d => d.id === source);
  const to = input.descriptors.find(d => d.id === target);
  const row = from?.states.indexOf(sourceState);
  const column = to?.states.indexOf(targetState);
  const block = input.blocks.findIndex(([a, b]) => a === source && b === target);
  requireInput(block >= 0 && row >= 0 && column >= 0, '找不到要重算的评分格。');
  const { fixed, mode } = baseline;
  requireInput((!Object.hasOwn(fixed, source) || fixed[source] === sourceState) &&
    (mode !== 'conditioned' || !Object.hasOwn(fixed, target)), '该评分格未参与本次检验。');
  const previousScore = input.blocks[block][2][row][column];
  requireInput(Number.isInteger(previousScore) && Number.isInteger(score) &&
    Math.abs(score) <= 3 && score !== previousScore, '请选择与原分数不同的 −3 至 +3 整数。');

  const adjusted = structuredClone(input);
  adjusted.blocks[block][2][row][column] = score;
  const perturbed = runCib(adjusted, options);
  const before = new Map(baseline.scenarios.map(scenario => [JSON.stringify(scenario.configuration), scenario.configuration]));
  const after = new Map(perturbed.scenarios.map(scenario => [JSON.stringify(scenario.configuration), scenario.configuration]));
  return {
    status: 'completed',
    change: { source, sourceState, target, targetState, previousScore, score },
    baseline,
    perturbed,
    kept: [...before].filter(([key]) => after.has(key)).map(([, configuration]) => configuration),
    added: [...after].filter(([key]) => !before.has(key)).map(([, configuration]) => configuration),
    removed: [...before].filter(([key]) => !after.has(key)).map(([, configuration]) => configuration)
  };
}

