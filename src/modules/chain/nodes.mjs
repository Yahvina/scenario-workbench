import { planAtYear } from '../elements/state-plan.mjs';
import { buildMatrix } from '../relationships/logic.mjs';
import { explain } from '../solver/engine.mjs';
import { planCheckStaleReasons } from '../solver/plan-check-store.mjs';
import { gammaOf, tisOf } from '../../core/analytics.mjs';

const KINDS = { policy: '政策原文', paper: '文献', 'historical-data': '历史数据', expert: '专家判断', 'user-assumption': '用户假设/草案', fixture: '机制示例' };

// 白箱链：每个节点都要能回答“这次真实输入是什么、做了什么、输出了什么、依据在哪、哪里还缺”。
// 没有发生的步骤写“未开始”，已过期的写“已过期”，绝不点亮成完成。
export function buildChain({ project, archive, fresh, planChecks = {} }) {
  const p = project;
  const name = id => p.data.descriptors.find(d => d.id === id)?.label || id;
  const stateName = id => p.data.states.find(s => s.id === id)?.label || id;
  const years = p.scope.years || [];
  const ids = p.selection.descriptorIds;
  const n = ids.length;
  const nodes = [];
  const add = node => nodes.push(node);

  // 1 范围
  const scopeGaps = [];
  if (!p.scope.regionId) scopeGaps.push('项目没有研究地区，未知范围不能当通用。');
  if (!years.length) scopeGaps.push('项目没有研究年份。');
  add({
    id: 'scope', no: 1, title: '研究范围', module: 'workspace',
    status: scopeGaps.length ? 'gap' : 'ok',
    input: [['地区', p.scope.regionId || '未指定'], ['年份', years.join(' / ') || '未指定'], ['项目', p.title], ['修订', 'r' + p.revision]],
    did: '读取项目范围，后续所有适用性检查都以这里为边界。',
    output: ['适用性判定基准：' + (p.scope.regionId || '无') + ' · ' + (years.join('/') || '无年份')],
    source: '项目记录（浏览器本地）',
    gaps: scopeGaps
  });

  // 2 资料与条款
  const evByKind = {};
  for (const e of p.data.evidence) evByKind[e.kind] = (evByKind[e.kind] || 0) + 1;
  const paperish = (evByKind.paper || 0) + (evByKind['historical-data'] || 0);
  const gap2 = [];
  if (!p.data.evidence.length) gap2.push('还没有任何依据记录。');
  if (!paperish) gap2.push('没有任何论文或历史数据依据：关系方向与强度暂时只能算用户假设。');
  if (p.data.evidence.some(e => e.kind === 'fixture')) gap2.push('含机制示例记录，只能用来验证软件，不能当真实政策。');
  add({
    id: 'evidence', no: 2, title: '资料与条款', module: 'policy',
    status: !p.data.evidence.length ? 'empty' : gap2.length ? 'gap' : 'ok',
    input: [['依据记录', p.data.evidence.length + ' 条'], ...Object.entries(evByKind).map(([k, v]) => [KINDS[k] || k, v + ' 条'])],
    did: '按类型清点依据；政策原文只说明政策事实，不能单独证明描述符之间的影响规律。',
    output: ['可用于关系规律的依据：' + paperish + ' 条'],
    source: 'evidence 集合',
    gaps: gap2
  });

  // 3 因素
  const noStates = ids.filter(id => !(p.data.descriptors.find(d => d.id === id)?.stateIds || []).length);
  add({
    id: 'factors', no: 3, title: '因素与状态定义', module: 'elements',
    status: !n ? 'empty' : noStates.length ? 'gap' : 'ok',
    input: [['活动变量', n + ' 个']],
    did: '把所选分类映射到真正参与计算的因素，并取出每个因素的状态集合。',
    output: ids.map(id => name(id) + '（' + (p.data.descriptors.find(d => d.id === id)?.stateIds || []).length + ' 档）'),
    source: 'descriptors / states 集合',
    gaps: noStates.length ? ['缺状态定义：' + noStates.map(name).join('、')] : []
  });

  // 4 年份状态
  const plans = years.map(y => ({ year: y, plan: planAtYear(p, y) }));
  const incomplete = plans.filter(x => !x.plan.complete);
  const planCheckLines = plans.map(x => {
    const record = planChecks[x.year];
    if (!record) return null;
    const reasons = planCheckStaleReasons(record, { project: p, plan: x.plan });
    const verdict = record.consistent ? '自洽' : record.conflicts + ' 个因素被压过';
    return reasons.length ? x.year + ' 检验已过期（' + reasons.join('；') + '）' : x.year + ' 已检验（r' + record.projectRevision + ' 时）：' + verdict;
  }).filter(Boolean);
  const unchecked = plans.filter(x => x.plan.complete && (!planChecks[x.year] || planCheckStaleReasons(planChecks[x.year], { project: p, plan: x.plan }).length));
  add({
    id: 'plan', no: 4, title: '逐年状态安排', module: 'elements',
    status: !years.length ? 'empty' : incomplete.length ? 'gap' : 'ok',
    input: [['年份', years.join(' / ') || '无'], ['方式', '因素旁就地选状态'], ['方案检验', planCheckLines.length ? planCheckLines.length + ' 个年份有结论' : '尚无记录']],
    did: '读取每年每个因素选中的状态；没有选的不回填默认值。完成的选择可在检验页按“检验我的方案”逐份核对。',
    output: [
      ...plans.map(x => x.year + '：' + (x.plan.complete ? Object.entries(x.plan.config).map(([d, s]) => name(d) + '=' + stateName(s)).join('，') : '缺 ' + x.plan.missing.length + ' 个因素')),
      ...planCheckLines
    ],
    source: 'state-plan 路径记录 · 版本取各因素路径最大版本（当前 v' + Math.max(0, ...plans.map(x => x.plan.planVersion)) + '）；检验结论来自 plan-check 记录（含时间与当时修订号）',
    gaps: [
      ...incomplete.length ? incomplete.map(x => x.year + ' 年缺：' + x.plan.missing.map(name).join('、')) : [],
      ...unchecked.length ? [unchecked.map(x => x.year).join('、') + ' 年的方案还没有有效检验（到检验页点“按这个方案检验”）'] : []
    ]
  });

  // 5 关系依据
  const directions = new Set(p.data.judgments.map(j => j.sourceDescriptorId + '>' + j.targetDescriptorId));
  const need = n * (n - 1);
  const noPaper = p.data.judgments.filter(j => !(j.evidenceRefs || []).some(id => {
    const e = p.data.evidence.find(x => x.id === id);
    return e && (e.kind === 'paper' || e.kind === 'historical-data');
  }));
  add({
    id: 'relations', no: 5, title: '关系与依据', module: 'relationships',
    status: !p.data.judgments.length ? 'empty' : directions.size < need ? 'gap' : 'ok',
    input: [['判断记录', p.data.judgments.length + ' 条'], ['已覆盖方向', directions.size + ' / ' + need]],
    did: '按方向整理状态对评分；A→B 与 B→A 分开记录，不互相推断。',
    output: p.data.judgments.length ? ['覆盖 ' + directions.size + ' 个方向，' + p.data.judgments.reduce((s, j) => s + (j.entries?.length || 0), 0) + ' 个状态对格子'] : ['还没有任何判断'],
    source: 'judgments 集合；每条判断带版本与证据引用',
    gaps: [
      ...(directions.size < need ? ['还有 ' + (need - directions.size) + ' 个方向没有判断'] : []),
      ...(noPaper.length ? [noPaper.length + ' 条判断没有论文或历史数据依据（政策文本不能替代）'] : [])
    ]
  });

  // 6 采用矩阵
  const year = archive?.RunInput?.year ?? (years[0] ?? null);
  let matrixNode;
  if (archive?.RunInput?.matrix) {
    const cov = archive.RunInput.matrix.coverage;
    matrixNode = {
      input: [['年份', archive.RunInput.year], ['矩阵版本', 'v' + archive.RunInput.matrix.version], ['选用记录', archive.selectionOfJudgments.length + ' 条']],
      did: '把该年选用的判断拼成完整矩阵；得分缺失处不补 0。',
      output: ['应判 ' + cov.required + ' 格；已判 ' + cov.judged + '；未判断 ' + cov.missingPairs.length],
      source: '冻结输入 RunInput.matrix · ' + archive.selectionOfJudgments.map(j => j.id + '@v' + j.version).join('、'),
      gaps: cov.missingPairs.length ? ['矩阵有 ' + cov.missingPairs.length + ' 格未判断，不能求解'] : [],
      status: cov.missingPairs.length ? 'gap' : (fresh ? 'ok' : 'stale')
    };
  } else {
    const { snapshot, diagnostics } = year ? buildMatrix(p, { year, selectedJudgmentIds: [] }) : { snapshot: null, diagnostics: [] };
    matrixNode = {
      input: [['年份', year ?? '未选'], ['选用记录', '尚未明确选用']],
      did: '只准备矩阵形状与覆盖，不代替你选择记录。',
      output: snapshot ? ['应判 ' + snapshot.coverage.required + ' 格；已判 ' + snapshot.coverage.judged] : ['尚不能准备矩阵'],
      source: '当前项目（未冻结）',
      gaps: ['还没有冻结的采用矩阵：到关系页逐方向选用判断，再发送到检验页。', ...diagnostics.slice(0, 3).map(d => d.message)],
      status: 'empty'
    };
  }
  add({ id: 'matrix', no: 6, title: '采用的矩阵', module: 'relationships', ...matrixNode });

  // 7 求解
  const run = archive?.RunResult;
  add({
    id: 'solve', no: 7, title: 'CIB 检验', module: 'solver',
    status: !archive ? 'empty' : run?.status === 'completed' ? (fresh ? 'ok' : 'stale') : run?.status === 'blocked' ? 'gap' : 'gap',
    input: [['年份', archive?.RunInput?.year ?? '未开始'], ['枚举上限', archive?.RunInput?.solverConfig?.limit ?? '—'], ['锁定', (archive?.RunInput?.lockedStateIds || []).length + ' 个']],
    did: '逐个枚举配置，对每个变量比较“所选状态”和“任何替代状态”的支持分。',
    output: !run ? ['还没有检算归档'] : [run.status === 'completed' ? '完成：检查 ' + run.checked + ' 个，自洽 ' + run.count + ' 个' : run.status === 'failed' ? '未完成：已检查 ' + run.checked + '，不能报全空间结论' : '阻断：未开始，成立数未定'],
    source: 'RunResult · ' + (archive?.RunInput?.engineVersion || '引擎版本未知') + (archive ? ' · ' + run?.id : ''),
    gaps: !run ? ['尚未运行 CIB'] : run.truncated ? ['展示列表截断：计数完整，但逐条分析只覆盖前 ' + run.scenarios.length + ' 个'] : []
  });

  // 8 解释与对比
  let explainNode = {
    input: [['配置', '未开始'], ['指标', '未计算']], did: '对一份具体配置逐因素解释支持、差距与裕度。',
    output: ['尚无解释'], source: '—', gaps: ['还没有可解释的配置'], status: 'empty'
  };
  if (archive?.RunInput && years.length) {
    const plan = planAtYear(p, archive.RunInput.year);
    if (plan.complete) {
      try {
        const trace = explain(archive.RunInput, plan.config);
        const g = gammaOf(trace);
        const tis = tisOf(archive.RunInput, plan.config);
        explainNode = {
          input: [['配置', Object.entries(plan.config).map(([d, s]) => name(d) + '=' + stateName(s)).join('，')], ['来源', '该年就地选择的状态']],
          did: '逐因素相加支持分，比较所选与替代，并计算有符号裕度与总影响。',
          output: [trace.consistent ? '该配置自洽' : '该配置有 ' + trace.conflicts.length + ' 个冲突：' + trace.conflicts.map(name).join('、'),
            'Γ = ' + (g.applies ? g.gamma : '不适用（存在单状态变量）'), 'TIS = ' + tis.sum + '（' + tis.cells + ' 格）'],
          source: '冻结输入 + plan-check 同一算法',
          gaps: trace.consistent ? [] : ['冲突来自矩阵里的具体格子，可回关系页核对'],
          status: fresh ? 'ok' : 'stale'
        };
      } catch (error) {
        explainNode.gaps = ['无法解释：' + error.message];
      }
    } else explainNode.gaps = [archive.RunInput.year + ' 年方案缺 ' + plan.missing.length + ' 个因素，无法解释'];
  }
  add({ id: 'explain', no: 8, title: '解释与指标', module: 'solver', ...explainNode });

  // 9 模型映射与导出
  const maps = p.data.mappings || [];
  add({
    id: 'export', no: 9, title: '模型映射与导出', module: 'exports',
    status: !maps.length ? 'empty' : 'ok',
    input: [['参数映射', maps.length + ' 条'], ['报告', '中文报告 / 对比 / 模型输入']],
    did: '把状态与参数对应到目标模型字段，并生成可核对的导出物。',
    output: ['已实现：结构化参数表、中文报告、模型输入样例、AI 草案；PDF/PPT 未接入'],
    source: 'exports 模块',
    gaps: ['真实 GCAM/CHEER 运行需要模型与许可，当前只有生成样例'],
    status: maps.length ? 'ok' : 'empty'
  });
  return nodes;
}

export const CHAIN_STATUS = { ok: ['已接通', 'ok'], gap: ['有缺口', 'warn'], stale: ['已过期', 'warn'], empty: ['未开始', 'bad'] };
