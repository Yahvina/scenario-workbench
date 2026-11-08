// AHP 重要性判断（对照用）：两两比较 → 权重 → 一致性比率 CR。
// 方法口径：Saaty 层次分析法（1–9 标度、正互反矩阵、主特征向量作权重、CI=(λmax−n)/(n−1)、CR=CI/RI）。
// 这一页只算权重与一致性，不改关系评分、不覆盖 CIB 基线；AHP–CIB 加权规则未核，不在这里做。

// 标度值：Saaty 1–9 及其倒数。只用这些值，避免出现没有依据的中间刻度。
export const SAATY_VALUES = [
  ['1/9', 1 / 9], ['1/8', 1 / 8], ['1/7', 1 / 7], ['1/6', 1 / 6], ['1/5', 1 / 5],
  ['1/4', 1 / 4], ['1/3', 1 / 3], ['1/2', 1 / 2],
  ['1', 1],
  ['2', 2], ['3', 3], ['4', 4], ['5', 5], ['6', 6], ['7', 7], ['8', 8], ['9', 9]
];

// 两两比较的语义：判断 i 相对 j 有多重要。
export const SCALE_LABELS = {
  '1/9': 'j 绝对更重要', '1/8': 'j 强烈更重要', '1/7': 'j 明显更重要', '1/6': 'j 较强更重要', '1/5': 'j 明显更重要',
  '1/4': 'j 较重要', '1/3': 'j 略重要', '1/2': 'j 稍重要',
  '1': '同等重要',
  '2': 'i 稍重要', '3': 'i 略重要', '4': 'i 较重要', '5': 'i 明显更重要', '6': 'i 较强更重要',
  '7': 'i 明显更重要', '8': 'i 强烈更重要', '9': 'i 绝对更重要'
};

// 随机一致性指标 RI。来源：Saaty (1980) 常用表，n=1..15；n≤2 时 CR 不适用（任何两两比较都完全一致）。
export const RI_TABLE = {
  source: 'Saaty (1980) The Analytic Hierarchy Process 常用 RI 表（n=1–15）',
  values: [0, 0, 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49, 1.51, 1.48, 1.56, 1.57, 1.59]
};

export function riFor(n) {
  if (!Number.isInteger(n) || n < 1 || n > RI_TABLE.values.length) return null;
  return RI_TABLE.values[n - 1];
}

// 把「只填上三角」的输入组成完整的正互反矩阵。
// pairs: { 'a|b': value }，a、b 是描述符 ID；缺项视为未填。
export function buildMatrix(ids, pairs) {
  const n = ids.length;
  const A = Array.from({ length: n }, () => Array(n).fill(null));
  const missing = [];
  for (let i = 0; i < n; i += 1) {
    A[i][i] = 1;
    for (let j = i + 1; j < n; j += 1) {
      const raw = pairs?.[ids[i] + '|' + ids[j]];
      const value = raw === '' || raw === null || raw === undefined ? null : Number(raw);
      if (value === null || !Number.isFinite(value) || value <= 0) { missing.push({ a: ids[i], b: ids[j] }); continue; }
      A[i][j] = value;
      A[j][i] = 1 / value;
    }
  }
  return { A, missing, complete: missing.length === 0 };
}

// 主特征向量：幂法迭代到收敛。返回归一化权重（和为 1）。
export function priorityVector(A, { maxIterations = 1000, tolerance = 1e-12 } = {}) {
  const n = A.length;
  if (!n) return { weights: [], lambdaMax: null, iterations: 0, converged: false };
  let w = Array(n).fill(1 / n);
  let lambdaMax = null, converged = false, iterations = 0;
  for (; iterations < maxIterations; iterations += 1) {
    const next = A.map(row => row.reduce((sum, value, j) => sum + value * w[j], 0));
    const total = next.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(total) || total <= 0) break;
    const scaled = next.map(v => v / total);
    const delta = scaled.reduce((m, v, i) => Math.max(m, Math.abs(v - w[i])), 0);
    lambdaMax = A.reduce((sum, row, i) => sum + (row.reduce((s, value, j) => s + value * scaled[j], 0)) / scaled[i], 0) / n;
    w = scaled;
    if (delta < tolerance) { converged = true; iterations += 1; break; }
  }
  return { weights: w, lambdaMax, iterations, converged };
}

// 一致性与比率。n≤2 时 CR 不适用。CR>0.10 按惯例视为比较过于矛盾。
export function consistency(A, weights = null) {
  const n = A.length;
  if (n < 3) return { n, lambdaMax: n, ci: 0, ri: riFor(n), cr: null, applies: false, acceptable: true };
  const solved = weights ? { weights, lambdaMax: null } : priorityVector(A);
  const lambdaMax = solved.lambdaMax ?? powerLambda(A, weights);
  const ci = (lambdaMax - n) / (n - 1);
  const ri = riFor(n);
  const cr = ri ? ci / ri : null;
  return { n, lambdaMax, ci, ri, cr, applies: cr !== null, acceptable: cr === null ? true : cr <= 0.1 };
}

// 给定权重时算 λmax：λmax = 平均((Aw)ᵢ / wᵢ)。
function powerLambda(A, weights) {
  const n = A.length;
  return A.reduce((sum, row, i) => sum + row.reduce((s, value, j) => s + value * weights[j], 0) / weights[i], 0) / n;
}

// 权重排序（只用于展示，不改权重）。
export function rankedWeights(ids, labels, weights) {
  return ids.map((id, i) => ({ id, label: labels[id] || id, weight: weights[i] }))
    .sort((a, b) => b.weight - a.weight);
}
