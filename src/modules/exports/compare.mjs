// P6 两份方案的对比：纯函数，只把两边已有的内容并排读出来。
// 为什么要单独写「0 与未判断不同」：项目里 0 表示「没关系」，未判断表示「还没有判断」。
// 两者在数值上都会被人看成零，意义却相反，所以本模块绝不把未判断折算成 0，
// 也不因为两边文本都写着 0 之外的空白就判为相同；判断依据是原始分数本身（含 null）。
// 对比同样不做任何检算：归档里的成立数是各自冻结时的历史声明，不是本次重算的结果。
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasText = value => typeof value === 'string' && value.trim() !== '';
const asArray = value => (Array.isArray(value) ? value : []);
const shown = (value, fallback) => (value === null || value === undefined || value === '' ? fallback : String(value));

const STATUS_TEXT = {completed: '已完成', blocked: '阻断', failed: '未完成'};
const ROLE_TEXT = {input: '投入', outcome: '产出', context: '背景'};
// 未判断统一写法；null 与「整条判断缺失」在项目里都读作未判断，所以两者视为同一状态。
const UNJUDGED = '未判断';

const descriptorOf = (data, id) => asArray(data?.descriptors).find(item => item?.id === id) || null;
const stateOf = (data, id) => asArray(data?.states).find(item => item?.id === id) || null;
const descriptorLabel = (data, id) => {
  const found = descriptorOf(data, id);
  return hasText(found?.label) ? found.label : '未命名因素';
};
const stateLabel = (data, id) => {
  const found = stateOf(data, id);
  return hasText(found?.label) ? found.label : '未命名状态';
};

function row(kind, label, leftText, rightText, ids = {}) {
  const same = kind === 'same';
  return {
    kind: same ? 'same' : 'changed', label, leftText, rightText, same,
    id: ids.id ?? null, leftId: ids.leftId ?? null, rightId: ids.rightId ?? null
  };
}

const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = list => [...list].sort();

function requireSide(side, kind, field) {
  if (!isObject(side)) throw new Error('缺少对比对象：' + kind + '两侧都必须是对象。');
  if (!isObject(side[field])) throw new Error('缺少' + (field === 'project' ? '方案项目' : '冻结归档') + '：无法对比' + kind + '。');
}

function pairKey(sourceStateId, targetStateId) {
  return JSON.stringify([sourceStateId ?? null, targetStateId ?? null]);
}

// 收集一份数据里所有状态对的原始分数。同一状态对可能出现多条记录：
// 冲突时并排列出，不取平均，也不替调用方选一条。
function pairScores(data) {
  const map = new Map();
  for (const judgment of asArray(data?.judgments)) {
    for (const entry of asArray(judgment?.entries)) {
      if (!isObject(entry)) continue;
      const key = pairKey(entry.sourceStateId, entry.targetStateId);
      if (!map.has(key)) map.set(key, {sourceStateId: entry.sourceStateId ?? null, targetStateId: entry.targetStateId ?? null, values: []});
      const bucket = map.get(key);
      bucket.values.push(entry.score === undefined ? null : entry.score);
      if (!hasText(bucket.sourceDescriptorId) && hasText(judgment?.sourceDescriptorId)) bucket.sourceDescriptorId = judgment.sourceDescriptorId;
      if (!hasText(bucket.targetDescriptorId) && hasText(judgment?.targetDescriptorId)) bucket.targetDescriptorId = judgment.targetDescriptorId;
    }
  }
  return map;
}

// 0 与未判断不同：这里只按原始值分档，null 与缺失都归入「未判断」，
// 但「未判断」与数字 0 永远不相等。
function scoreValues(bucket) {
  if (!bucket) return [UNJUDGED];
  return [...new Set(bucket.values.map(value => (value === null || value === undefined ? UNJUDGED : String(value))))].sort();
}

const scoreText = bucket => scoreValues(bucket).join('、');

const stateLabelOf = (data, id) => stateLabel(data, id);

export function comparePlans({left = null, right = null} = {}) {
  requireSide(left, '方案', 'project');
  requireSide(right, '方案', 'project');
  const leftProject = left.project, rightProject = right.project;
  const leftData = isObject(leftProject.data) ? leftProject.data : {};
  const rightData = isObject(rightProject.data) ? rightProject.data : {};
  const rows = [];

  // 标题、范围、修订：最外层身份，先列。
  const leftTitle = hasText(leftProject.title) ? leftProject.title : '未命名项目';
  const rightTitle = hasText(rightProject.title) ? rightProject.title : '未命名项目';
  rows.push(row(leftTitle === rightTitle ? 'same' : 'changed', '项目标题', leftTitle, rightTitle));

  const leftRegion = isObject(leftProject.scope) ? leftProject.scope.regionId : null;
  const rightRegion = isObject(rightProject.scope) ? rightProject.scope.regionId : null;
  rows.push(row(
    leftRegion === rightRegion ? 'same' : 'changed', '研究地区',
    hasText(leftRegion) ? leftRegion : '未声明地区', hasText(rightRegion) ? rightRegion : '未声明地区'
  ));

  const leftYears = asArray(isObject(leftProject.scope) ? leftProject.scope.years : null);
  const rightYears = asArray(isObject(rightProject.scope) ? rightProject.scope.years : null);
  rows.push(row(
    sameList(sorted(leftYears.map(Number)), sorted(rightYears.map(Number))) ? 'same' : 'changed', '研究年份',
    leftYears.length ? leftYears.join('、') : '未声明年份',
    rightYears.length ? rightYears.join('、') : '未声明年份',
    {leftId: leftYears.join(','), rightId: rightYears.join(',')}
  ));

  rows.push(row(
    Number(leftProject.revision) === Number(rightProject.revision) ? 'same' : 'changed', '修订号',
    shown(leftProject.revision, '未定'), shown(rightProject.revision, '未定'),
    {leftId: leftProject.revision ?? null, rightId: rightProject.revision ?? null}
  ));

  // 活动因素：按稳定 ID 比较集合，显示用标签，原始 ID 留在 leftId/rightId。
  const leftSelected = asArray(leftProject.selection?.descriptorIds).filter(hasText);
  const rightSelected = asArray(rightProject.selection?.descriptorIds).filter(hasText);
  const descriptorNames = id => {
    const leftLabel = leftSelected.includes(id) ? descriptorLabel(leftData, id) : null;
    const rightLabel = rightSelected.includes(id) ? descriptorLabel(rightData, id) : null;
    return {leftLabel: leftLabel ?? '未选', rightLabel: rightLabel ?? '未选'};
  };
  rows.push(row(
    sameList(sorted(leftSelected), sorted(rightSelected)) ? 'same' : 'changed', '活动因素',
    leftSelected.length ? leftSelected.map(id => descriptorNames(id).leftLabel).join('、') : '未选',
    rightSelected.length ? rightSelected.map(id => descriptorNames(id).rightLabel).join('、') : '未选',
    {leftId: leftSelected.join(','), rightId: rightSelected.join(',')}
  ));

  // 每个活动因素的关注状态：按因素分别成行，显示状态标签。
  // 因素名称本身也参与比较：名称不同说明两边说的不是同一件事，不能只看 ID。
  const activeUnion = [...new Set([...leftSelected, ...rightSelected])];
  for (const id of activeUnion) {
    const pick = (project, data) => asArray(project.selection?.stateIds)
      .filter(stateId => stateOf(data, stateId)?.descriptorId === id);
    const leftPicked = pick(leftProject, leftData);
    const rightPicked = pick(rightProject, rightData);
    const fold = (picked, data) => (picked.length ? picked.map(stateId => stateLabel(data, stateId)).join('、') : '未选');
    const leftName = leftSelected.includes(id) ? descriptorLabel(leftData, id) : '未选';
    const rightName = rightSelected.includes(id) ? descriptorLabel(rightData, id) : '未选';
    rows.push(row(leftName === rightName ? 'same' : 'changed', '因素名称（' + id + '）', leftName, rightName, {id, leftId: id, rightId: id}));
    rows.push(row(
      sameList(sorted(leftPicked), sorted(rightPicked)) ? 'same' : 'changed',
      '关注状态·' + (leftSelected.includes(id) ? leftName : rightName),
      fold(leftPicked, leftData), fold(rightPicked, rightData),
      {id, leftId: leftPicked.join(','), rightId: rightPicked.join(',')}
    ));
    // 状态定义标签：状态 ID 相同但名称被改过，也是一处真实差异。
    const leftStates = asArray(leftData.states).filter(state => state?.descriptorId === id);
    const rightStates = asArray(rightData.states).filter(state => state?.descriptorId === id);
    const namesOf = states => states.map(state => (hasText(state?.label) ? state.label : '未命名状态'));
    rows.push(row(
      sameList(namesOf(leftStates), namesOf(rightStates)) ? 'same' : 'changed',
      '状态定义·' + (leftSelected.includes(id) ? leftName : rightName),
      namesOf(leftStates).length ? namesOf(leftStates).join('、') : '无状态定义',
      namesOf(rightStates).length ? namesOf(rightStates).join('、') : '无状态定义',
      {id, leftId: leftStates.map(state => state.id).join(','), rightId: rightStates.map(state => state.id).join(',')}
    ));
  }

  // 锁定状态：显示标签；锁定与「关注」是两回事，单独一行。
  const leftLocks = asArray(leftProject.selection?.lockedStateIds).filter(hasText);
  const rightLocks = asArray(rightProject.selection?.lockedStateIds).filter(hasText);
  const lockText = (locks, data) => (locks.length ? locks.map(stateId => stateLabel(data, stateId)).join('、') : '无锁定');
  rows.push(row(
    sameList(sorted(leftLocks), sorted(rightLocks)) ? 'same' : 'changed', '锁定状态',
    lockText(leftLocks, leftData), lockText(rightLocks, rightData),
    {leftId: leftLocks.join(','), rightId: rightLocks.join(',')}
  ));

  // 逐状态对评分：这是本模块的核心规则所在（0 与未判断不同）。
  const leftPairs = pairScores(leftData), rightPairs = pairScores(rightData);
  const pairKeys = [...new Set([...leftPairs.keys(), ...rightPairs.keys()])];
  const pairLabel = key => {
    const sample = leftPairs.get(key) || rightPairs.get(key);
    const data = leftPairs.has(key) ? leftData : rightData;
    const sourceName = descriptorLabel(data, sample.sourceDescriptorId);
    const targetName = descriptorLabel(data, sample.targetDescriptorId);
    return '判断 ' + sourceName + '·' + stateLabelOf(data, sample.sourceStateId) + ' → ' + targetName + '·' + stateLabelOf(data, sample.targetStateId);
  };
  for (const key of pairKeys) {
    const leftBucket = leftPairs.get(key) || null, rightBucket = rightPairs.get(key) || null;
    const leftValues = scoreValues(leftBucket), rightValues = scoreValues(rightBucket);
    rows.push(row(
      sameList(leftValues, rightValues) ? 'same' : 'changed', pairLabel(key),
      scoreText(leftBucket), scoreText(rightBucket),
      {
        id: key,
        leftId: leftBucket ? pairKey(leftBucket.sourceStateId, leftBucket.targetStateId) : null,
        rightId: rightBucket ? pairKey(rightBucket.sourceStateId, rightBucket.targetStateId) : null
      }
    ));
  }

  const sameCount = rows.filter(item => item.same).length;
  const judgmentCount = pairKeys.length;
  const notes = [];
  if (judgmentCount) notes.push('逐状态对评分按原始分数比较：0 表示没关系，未判断单独记为「未判断」，两者不同。');
  if (judgmentCount) notes.push('同一状态对存在多条判断时并排列出，不取平均、不代选。');
  notes.push('本对比只读两份方案的当前内容，不检算、不改分。');
  return {
    rows, sameCount, changedCount: rows.length - sameCount,
    summary: '对比 ' + rows.length + ' 行：相同 ' + sameCount + ' 行、不同 ' + (rows.length - sameCount) + ' 行（左：'
      + (hasText(left.name) ? left.name : '未命名方案') + '；右：' + (hasText(right.name) ? right.name : '未命名方案') + '）。',
    notes
  };
}

export function compareRuns({left = null, right = null} = {}) {
  requireSide(left, '归档', 'archive');
  requireSide(right, '归档', 'archive');
  const leftArchive = left.archive, rightArchive = right.archive;
  const leftSnapshot = isObject(leftArchive.projectInputSnapshot) ? leftArchive.projectInputSnapshot : null;
  const rightSnapshot = isObject(rightArchive.projectInputSnapshot) ? rightArchive.projectInputSnapshot : null;
  const leftInput = isObject(leftArchive.RunInput) ? leftArchive.RunInput : null;
  const rightInput = isObject(rightArchive.RunInput) ? rightArchive.RunInput : null;
  const leftResult = isObject(leftArchive.RunResult) ? leftArchive.RunResult : null;
  const rightResult = isObject(rightArchive.RunResult) ? rightArchive.RunResult : null;
  const rows = [];

  // 冻结修订：两份归档各自冻结时的项目修订，不是当前项目。
  const leftRevision = leftSnapshot?.revision, rightRevision = rightSnapshot?.revision;
  rows.push(row(
    Number(leftRevision) === Number(rightRevision) ? 'same' : 'changed', '冻结修订（projectInputSnapshot.revision）',
    shown(leftRevision, '未定'), shown(rightRevision, '未定'),
    {leftId: leftRevision ?? null, rightId: rightRevision ?? null}
  ));

  // 检算年份：RunInput 缺失就是未记录，不猜。
  const leftYear = leftInput?.year, rightYear = rightInput?.year;
  rows.push(row(
    leftYear === rightYear ? 'same' : 'changed', '检算年份（RunInput.year）',
    shown(leftYear, '未记录'), shown(rightYear, '未记录'),
    {leftId: leftYear ?? null, rightId: rightYear ?? null}
  ));

  // 矩阵覆盖：未判断单元只报个数；要求/已判断缺失一律未定。
  const coverageRows = [
    ['应有单元（coverage.required）', coverage => coverage?.required],
    ['已判断单元（coverage.judged）', coverage => coverage?.judged],
    ['未判断单元（coverage.missingPairs）', coverage => (Array.isArray(coverage?.missingPairs) ? coverage.missingPairs.length : null)]
  ];
  const leftCoverage = isObject(leftInput?.matrix?.coverage) ? leftInput.matrix.coverage : null;
  const rightCoverage = isObject(rightInput?.matrix?.coverage) ? rightInput.matrix.coverage : null;
  for (const [label, read] of coverageRows) {
    const leftValue = leftCoverage ? read(leftCoverage) : null;
    const rightValue = rightCoverage ? read(rightCoverage) : null;
    const valueText = value => (Number.isInteger(value) ? String(value) : '未定（归档没有可读的矩阵覆盖）');
    rows.push(row(
      leftValue === rightValue ? 'same' : 'changed', label, valueText(leftValue), valueText(rightValue),
      {leftId: leftValue ?? null, rightId: rightValue ?? null}
    ));
  }

  // 结果状态与成立数。count 只在是整数时才是数字：0 是真实计数，null 是未定。
  const statusText = result => {
    if (!result) return '未开始（没有 RunResult）';
    return STATUS_TEXT[result.status] || '未知状态（' + shown(result.status, '空') + '）';
  };
  rows.push(row(
    statusText(leftResult) === statusText(rightResult) ? 'same' : 'changed', '检算状态（RunResult.status）',
    statusText(leftResult), statusText(rightResult),
    {leftId: leftResult?.status ?? null, rightId: rightResult?.status ?? null}
  ));

  const countText = result => {
    if (!result) return '未定（未开始，不是 0）';
    if (Number.isInteger(result.count)) return String(result.count);
    return '未定（未完成，不是 0）';
  };
  rows.push(row(
    countText(leftResult) === countText(rightResult) ? 'same' : 'changed', '成立数（RunResult.count）',
    countText(leftResult), countText(rightResult),
    {leftId: Number.isInteger(leftResult?.count) ? leftResult.count : null, rightId: Number.isInteger(rightResult?.count) ? rightResult.count : null}
  ));

  // 选用判断：按 id + version 对照，两个字段都进显示与原始字段。
  const selectionMap = archive => {
    const map = new Map();
    for (const item of asArray(archive?.selectionOfJudgments)) {
      if (!isObject(item) || !hasText(item.id)) continue;
      map.set(item.id, item);
    }
    return map;
  };
  const leftSelection = selectionMap(leftArchive), rightSelection = selectionMap(rightArchive);
  const selectionIds = [...new Set([...leftSelection.keys(), ...rightSelection.keys()])];
  for (const id of selectionIds) {
    const leftItem = leftSelection.get(id) || null, rightItem = rightSelection.get(id) || null;
    const describe = item => (item ? (Number.isSafeInteger(item.version) ? 'v' + item.version : '版本未定（v未记录）') : '未选用');
    rows.push(row(
      describe(leftItem) === describe(rightItem) ? 'same' : 'changed', '选用判断 ' + id,
      describe(leftItem), describe(rightItem),
      {id, leftId: leftItem?.version ?? null, rightId: rightItem?.version ?? null}
    ));
  }
  if (!selectionIds.length) {
    rows.push(row('same', '选用判断', '两边都没有选用记录', '两边都没有选用记录'));
  }

  const sameCount = rows.filter(item => item.same).length;
  const changedCount = rows.length - sameCount;
  return {
    rows, sameCount, changedCount, historicallyNotRecomputed: true,
    summary: '对比 ' + rows.length + ' 行：相同 ' + sameCount + ' 行、不同 ' + changedCount + ' 行（左：'
      + (hasText(left.name) ? left.name : '未命名归档') + '；右：' + (hasText(right.name) ? right.name : '未命名归档')
      + '）。这里的修订、年份、覆盖、状态与成立数都取自两份各自冻结的归档，是当时的历史声明；本次没有在任一项目上重新检算。',
    notes: [
      'historicallyNotRecomputed：两边的数字来自两份独立冻结的归档，不是同一次重算的两次读数。',
      '成立数为 null 或未完成时写作「未定」，不写成 0；成立数 0 是真实计数，照写 0。',
      '历史归档只能证明当时声明了什么，不能证明当前项目仍然如此。'
    ]
  };
}
