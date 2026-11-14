import { solve, maxSpace } from './engine.mjs';

export function compareScore(input, entryIndex, nextScore) {
  const result = compareScores(input, [{ entryIndex, score: nextScore }]);
  return { ...result, change: result.changes[0] };
}

export function compareScores(input, changes) {
  if (!Array.isArray(changes) || !changes.length || new Set(changes.map(c => c?.entryIndex)).size !== changes.length) {
    throw new Error('请选择不同的评分格，每格只设置一个新评分。');
  }
  const validated = changes.map(change => {
    const original = input?.matrix?.entries?.[change?.entryIndex];
    if (!Number.isInteger(change?.entryIndex) || !original || !Number.isInteger(change?.score) ||
      Math.abs(change.score) > 3 || original.score === change.score) {
      throw new Error('请选择评分格，并改为另一个 −3 至 +3 的整数。');
    }
    return { ...original, entryIndex: change.entryIndex, previousScore: original.score, score: change.score };
  });
  const variantInput = structuredClone(input);
  for (const change of validated) variantInput.matrix.entries[change.entryIndex].score = change.score;
  const baseline = solve(input, { displayLimit: 0, keepLimit: maxSpace });
  const variant = solve(variantInput, { displayLimit: 0, keepLimit: maxSpace });
  if (baseline.status !== 'completed' || variant.status !== 'completed') {
    throw new Error('两次完整枚举均结束后才能比较。');
  }
  const key = config => JSON.stringify(input.activeDescriptorIds.map(id => config[id]));
  const before = new Map(baseline.all.map(config => [key(config), config]));
  const after = new Map(variant.all.map(config => [key(config), config]));
  return {
    version: 1, engineVersion: input.engineVersion,
    input: structuredClone(input), variantInput,
    method: validated.length > 1 ? 'joint-selected-cells' : 'single-selected-cell',
    changes: validated,
    baselineCount: baseline.count, variantCount: variant.count,
    checked: { baseline: baseline.checked, variant: variant.checked },
    kept: [...before].filter(([key]) => after.has(key)).map(([, config]) => config),
    added: [...after].filter(([key]) => !before.has(key)).map(([, config]) => config),
    removed: [...before].filter(([key]) => !after.has(key)).map(([, config]) => config)
  };
}

