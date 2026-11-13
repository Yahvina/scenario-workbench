import { inspectInput, solve, maxSpace } from './engine.mjs';

export function planSensitivity(input, maxEvaluations = 2000000) {
  const prepared = inspectInput(input);
  const trials = input.matrix.entries.flatMap((entry, entryIndex) => [-1, 1]
    .filter(delta => Math.abs(entry.score + delta) <= 3)
    .map(delta => ({ entryIndex, score: entry.score + delta })));
  const evaluations = prepared.space * BigInt(trials.length + 1);
  if (prepared.space > BigInt(prepared.limit) || prepared.space > BigInt(maxSpace)) throw new Error('单次枚举超过当前规模限制。');
  if (!Number.isSafeInteger(maxEvaluations) || maxEvaluations < 1 || evaluations > BigInt(maxEvaluations)) {
    throw new Error('本次批量需要检查 ' + evaluations + ' 个候选，超过交互预算；请缩小活动变量或状态范围。');
  }
  return { trials, evaluations: Number(evaluations), candidates: Number(prepared.space) };
}

export async function scanSensitivity(input, { signal, onProgress = () => {},
  yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)), maxEvaluations } = {}) {
  const frozen = structuredClone(input);
  const plan = planSensitivity(frozen, maxEvaluations);
  const output = { version: 1, method: 'single-cell-plus-minus-one', status: 'running',
    input: frozen, totalTrials: plan.trials.length, completedTrials: 0,
    candidatesPerRun: plan.candidates, plannedEvaluations: plan.evaluations, rows: [] };
  if (signal?.aborted) return { ...output, status: 'cancelled' };
  const baseline = solve(frozen, { displayLimit: 0, keepLimit: maxSpace });
  if (baseline.status !== 'completed') throw new Error('基线未完成完整枚举。');
  output.baselineCount = baseline.count;
  const key = config => JSON.stringify(frozen.activeDescriptorIds.map(id => config[id]));
  const before = new Set(baseline.all.map(key));
  for (const trial of plan.trials) {
    await yieldControl();
    if (signal?.aborted) break;
    const variant = structuredClone(frozen);
    const entry = variant.matrix.entries[trial.entryIndex];
    const previousScore = entry.score;
    entry.score = trial.score;
    const result = solve(variant, { displayLimit: 0, keepLimit: maxSpace });
    if (result.status !== 'completed') throw new Error('扰动未完成完整枚举。');
    const after = new Set(result.all.map(key));
    const kept = [...before].filter(id => after.has(id)).length;
    const added = after.size - kept, removed = before.size - kept;
    output.rows.push({ entryIndex: trial.entryIndex, sourceStateId: entry.sourceStateId,
      targetStateId: entry.targetStateId, judgmentId: entry.judgmentId, previousScore, score: trial.score,
      baselineCount: baseline.count, variantCount: result.count, kept, added, removed,
      changed: added + removed > 0, sameCountDifferentSets: baseline.count === result.count && added + removed > 0,
      jaccard: before.size + after.size - kept ? kept / (before.size + after.size - kept) : 1 });
    output.completedTrials++;
    onProgress({ completed: output.completedTrials, total: output.totalTrials });
  }
  output.status = output.completedTrials === output.totalTrials ? 'completed' : 'cancelled';
  return output;
}
