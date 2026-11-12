import { solve, maxSpace } from './engine.mjs';

export function compareScore(input, entryIndex, nextScore) {
  const original = input?.matrix?.entries?.[entryIndex];
  if (!original || !Number.isInteger(nextScore) || Math.abs(nextScore) > 3 || original.score === nextScore) {
    throw new Error('请选择一格评分，并改为另一个 −3 至 +3 的整数。');
  }
  const variantInput = structuredClone(input);
  variantInput.matrix.entries[entryIndex].score = nextScore;
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
    change: { ...original, previousScore: original.score, score: nextScore },
    baselineCount: baseline.count, variantCount: variant.count,
    checked: { baseline: baseline.checked, variant: variant.checked },
    kept: [...before].filter(([key]) => after.has(key)).map(([, config]) => config),
    added: [...after].filter(([key]) => !before.has(key)).map(([, config]) => config),
    removed: [...before].filter(([key]) => !after.has(key)).map(([, config]) => config)
  };
}

