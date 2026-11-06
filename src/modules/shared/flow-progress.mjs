// 流程进度摘要：按真实数据回答“现在有什么、还缺什么”。
// 纯函数，不做任何界面动作；app.mjs 用它渲染每页底部的进度条，测试直接断言文本。
import { planAtYear } from '../elements/state-plan.mjs';
import { statesFor, directionCoverage } from '../relationships/logic.mjs';

const nameOf = (project, id) => project.data.descriptors.find(d => d.id === id)?.label || id;

// 年度状态：每年是否选齐；未选齐时给出具体因素名（定位到因素与年份，不泛泛说“有阻断”）。
export function yearStateFacts(project) {
  const years = project.scope.years || [];
  return years.map(year => {
    const plan = planAtYear(project, year);
    return { year, complete: plan.complete, missing: plan.missing.map(id => nameOf(project, id)) };
  });
}

export function progressFacts(project) {
  const factorCount = project.selection.descriptorIds.length;
  const years = yearStateFacts(project);
  const noStates = project.selection.descriptorIds.filter(id => !statesFor(project, id).length).map(id => nameOf(project, id));
  const coverage = factorCount >= 2 ? directionCoverage(project) : { need: 0, covered: 0 };
  return {
    factorCount, years, noStates, coverage,
    region: project.scope.regionId || null,
    yearList: (project.scope.years || []).join(' / '),
    readyForJudgment: factorCount >= 2 && !noStates.length,
    missingYearStates: years.filter(y => !y.complete),
    allYearsComplete: factorCount > 0 && years.length > 0 && years.every(y => y.complete)
  };
}

// 进度条文本：每页一句，短、具体、按实际数据。
export function progressText(route, project, { runSummary, library } = {}) {
  const facts = progressFacts(project);
  const factorPart = !facts.factorCount ? '尚未选择研究因素'
    : '已选 ' + facts.factorCount + ' 项因素';
  // 零因素时 missing 恒为空，不能输出“2030 还缺的状态”这种不通的句子——直接说状态未开始。
  const yearPart = !facts.factorCount
    ? '；年度状态未开始（先选因素）'
    : facts.years.length
      ? '；' + facts.years.map(y => y.complete
          ? y.year + ' 状态已齐'
          : y.year + ' 还缺' + (y.missing.length ? '「' + y.missing.slice(0, 3).join('、') + (y.missing.length > 3 ? ' 等' : '') + '」' : '') + '的状态').join('；')
      : '';
  if (route === 'workspace') {
    const scope = (facts.region || '地区未设置') + ' · ' + (facts.yearList || '年份未设置');
    return { text: scope + ' · ' + factorPart + yearPart, hint: facts.factorCount ? '' : '下一步：在目录里勾选你关注的因素' };
  }
  if (route === 'elements') {
    const noState = facts.noStates.length ? '；' + facts.noStates.slice(0, 2).join('、') + (facts.noStates.length > 2 ? ' 等' : '') + ' 还没有状态定义' : '';
    return { text: factorPart + yearPart + noState, hint: facts.factorCount >= 2 ? '可以判断关系了' : '判断关系至少需要 2 个因素' };
  }
  if (route === 'timeline') return { text: factorPart + yearPart, hint: '' };
  if (route === 'relationships') {
    if (facts.factorCount < 2) return { text: factorPart, hint: '判断关系至少需要 2 个因素' };
    const cov = '已判 ' + facts.coverage.covered + ' / ' + facts.coverage.need + ' 个方向';
    return { text: factorPart + '；' + cov, hint: facts.coverage.covered >= facts.coverage.need ? '评分方向已齐，去核对并检验' : '还缺方向没有判断' };
  }
  if (route === 'solver') {
    const run = runSummary ? (runSummary.stale ? '上次检验已过期' : '已检验 ' + (runSummary.count ?? '—') + ' 个自洽组合（' + (runSummary.year ?? '—') + '）') : '尚未检验';
    return { text: factorPart + yearPart + '；' + run, hint: runSummary ? '下一步：保存与报告' : '下一步：开始检验' };
  }
  if (route === 'exports') {
    const lib = library || { plans: 0, runs: 0 };
    return { text: '命名方案已保存 ' + lib.plans + ' 份；检验记录已保存 ' + lib.runs + ' 份', hint: '本机自动保存不等于云同步；备份文件只在你点下载时生成' };
  }
  return { text: factorPart + yearPart, hint: '' };
}
