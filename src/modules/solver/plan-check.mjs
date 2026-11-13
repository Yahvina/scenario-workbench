import { el } from '../../core/ui.mjs';
import { planAtYear, changeYearState, stateAtYear } from '../elements/state-plan.mjs';
import { explain } from './engine.mjs';
import { planCheckRecord, planCheckStaleReasons, readPlanChecks, savePlanCheck } from './plan-check-store.mjs';

// 年度方案检验：把“因素页按年份选的状态”读成一份配置，放回全空间里对照。
// 不锁定枚举——锁定会让“我的方案是否自洽”变成“只有我的方案被检查”，两件事不能混。
// 检验结论同时写入 localStorage（plan-check-store）：刷新后仍能读回，白箱链节点 4 可见；
// 记录只存事实，输入变化后由 planCheckStaleReasons 标“已过期”，绝不冒充当前结论。
export function planCheckSection({ project, prepared, session, context, lastArchive, onRender }) {
  const year = session.year === '' ? null : Number(session.year);
  const section = el('section', { class: 'plan-check', 'data-plan-check': '' });
  const message = el('p', { class: 'plan-check-msg', role: 'status' });
  if (year === null || !project.scope.years.includes(year)) {
    section.append(el('h3', {}, '检验我的方案'));
    return section;
  }
  const plan = planAtYear(project, year);
  const name = id => project.data.descriptors.find(d => d.id === id)?.label || id;
  const stateName = id => project.data.states.find(s => s.id === id)?.label || id;
  const conditioned=prepared?.input?.conditionedStateIds||[];
  const contextKey=JSON.stringify([project.revision,prepared?.input?.engineVersion,conditioned,[...session.selected].sort()]);

  section.append(el('div', { class: 'plan-check-hd' }, el('h3', {}, '你的 ' + year + ' 年方案'),
    el('span', { class: 'plan-check-src' }, plan.complete ? '读自因素页的按年选择' : '还有 ' + plan.missing.length + ' 个因素没选')));

  const rows = el('div', { class: 'plan-check-rows' });
  for (const item of plan.descriptors) {
    const states = project.data.descriptors.find(d => d.id === item.descriptorId)?.stateIds
      .map(id => project.data.states.find(s => s.id === id)).filter(Boolean) || [];
    const row = el('div', { class: 'plan-check-row' + (item.stateId ? '' : ' is-missing') },
      el('span', { class: 'nm' }, name(item.descriptorId)));
    if (item.stateId) {
      row.append(el('span', { class: 'st' }, item.label),
        el('span', { class: 'from' }, item.source + (item.pathVersion ? ' · v' + item.pathVersion : '')));
    } else {
      const select = el('select', { 'aria-label': '补选 ' + year + ' 年 ' + name(item.descriptorId), onchange: event => {
        const value = event.target.value;
        if (!value) return;
        try {
          const next = changeYearState(context.store.read(), item.descriptorId, year, value, () => crypto.randomUUID());
          const result = context.actions.replaceProject(next);
          if (!result.ok) throw new Error(result.error.message);
          message.textContent = '已把 ' + name(item.descriptorId) + ' 的 ' + year + ' 年状态补成“' + stateName(value) + '”。';
          onRender();
        } catch (error) { message.textContent = '未保存：' + error.message; }
      } }, el('option', { value: '' }, '就地补选'), ...states.map(s => el('option', { value: s.id }, s.label)));
      row.append(select);
    }
    rows.append(row);
  }
  section.append(rows);

  if (!plan.complete) {
    section.append(      el('button', { class: 'button secondary', onclick: () => context.navigate('elements') }, '回因素页按年份选择'), message);
    return section;
  }

  const canCheck = !!prepared?.input;
  // 展示层把同义“因素数量”诊断合并为一条可操作项；底层校验原文保留在完整诊断里。
  let mergedFactors = false;
  const blocks = [];
  for (const d of (prepared?.diagnostics || []).filter(x => x.classification === 'block')) {
    if (/至少需要两个活动变量|至少两个不重复的非空活动变量ID/.test(d.message)) {
      if (mergedFactors) continue;
      mergedFactors = true;
      blocks.push({ message: '请先选择至少 2 个研究因素（当前因素数不够，无法形成方向）' });
      continue;
    }
    blocks.push(d);
  }
  const check = el('div', { class: 'plan-check-actions' },
    el('button', { class: 'button primary-action', 'data-plan-check-run': '', disabled: !canCheck, onclick: () => {
      try {
        const trace = explain(prepared.input, plan.config);
        session.planCheck = { year, config: { ...plan.config }, trace, contextKey, planVersion: plan.planVersion, at: new Date().toISOString() };
        if(!conditioned.length)savePlanCheck(project.id, planCheckRecord({ project, year, plan, trace }));
        onRender();
      } catch (error) { message.textContent = '无法检验这个方案：' + error.message; }
    } }, '开始检验这份方案'),
    el('span', { class: 'hint' }, canCheck ? '只算这一份配置，不改变枚举范围；全空间结论仍由下面的基线检算给出。' : blocks.length ? '还不能检验：' + blocks.slice(0, 2).map(item => item.message).join('；') + '。处理入口在下面第 2 项里。' : '矩阵还有阻断项，先解决下面的输入问题。'));
  section.append(check);
  if (!canCheck && blocks.length) {
    section.append(el('ul', { class: 'plan-check-blocks' }, ...blocks.slice(0, 5).map(d => el('li', {}, d.message))));
    if (blocks.length > 5) section.append();
  }
  section.append(message);

  // 会话里刚检的优先；刷新后从持久记录读回，仅在配置与项目修订号都没变时按同一算法复核展示。
  const sameConfig = a => JSON.stringify(a) === JSON.stringify(plan.config);
  let check2 = session.planCheck && session.planCheck.year === year && sameConfig(session.planCheck.config) && session.planCheck.contextKey===contextKey ? session.planCheck : null;
  let fromRecord = false;
  if (!check2) {
    const record = readPlanChecks(project.id)[year];
    if (!conditioned.length && record && sameConfig(record.config) && record.projectRevision === project.revision && canCheck) {
      try {
        check2 = { year, config: { ...record.config }, trace: explain(prepared.input, plan.config), planVersion: record.planVersion, at: record.at };
        fromRecord = true;
      } catch { /* 矩阵与方案不再相容时不冒充旧结论 */ }
    }
  }
  if (!check2) {
    const stale = session.planCheck && session.planCheck.year === year;
    const record = readPlanChecks(project.id)[year];
    if (stale) section.append(el('p', { class: 'plan-check-stale' }, '方案、评分选用或给定条件有变化：重新点“开始检验这份方案”才代表当前选择。'));
    else if (record) section.append(el('p', { class: 'plan-check-stale' }, '上次检验（' + new Date(record.at).toLocaleString() + '）已过期：' + planCheckStaleReasons(record, { project, plan }).slice(1).join('；') + '。重新检验后才代表当前输入。'));
    return section;
  }
  if (fromRecord) section.append();

  const trace = check2.trace;
  if(conditioned.length)section.append(el('p',{},'本次按给定条件检验，仅在当前会话显示；请导出本次结果归档，不覆盖普通方案的历史检验记录。'));
  if(trace.violatesConditions?.length){section.append(el('p',{class:'plan-check-verdict'},'方案状态与给定条件不一致：'+trace.violatesConditions.map(name).join('、')+'。请调整方案或给定状态。'));return section;}
  const bad = trace.balances.filter(b => !b.consistent);
  // 还没有全空间结果时，摘要卡里没有“我的方案”结论，这里给一句；有结果后由顶部摘要统一说，避免重复。
  const runReady = lastArchive?.RunResult?.status === 'completed';
  if (!runReady) section.append(el('div', { class: 'plan-check-verdict ' + (trace.consistent ? 'ok' : 'warn') },
    el('strong', {}, trace.consistent ? '这个方案内部自洽' : '这个方案有 ' + bad.length + ' 个因素被其他状态压过'),
    el('span', {}, 'CIB 判的是每个因素在自己这一列里支持最高，不等于现实会发生，也不是最优解。')));

  const table = el('table', { class: 'plan-check-table' },
    el('caption', {}, year + ' 年方案逐因素支持分（Cᵢⱼ 为矩阵原值，未加权）'),
    el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, '因素'), el('th', { scope: 'col' }, '所选状态'),
      el('th', { scope: 'col' }, 'Iⱼ(所选|方案)'), el('th', { scope: 'col' }, '最大支持'), el('th', { scope: 'col' }, 'gⱼ'), el('th', { scope: 'col' }, 'γⱼ'), el('th', { scope: 'col' }, '判读'))));
  const body = el('tbody');
  for (const b of trace.balances) {
    const alternatives = b.candidates.filter(c => c.stateId !== b.selectedStateId);
    const bestAlt = alternatives.length ? alternatives.reduce((m, c) => c.support > m.support ? c : m, alternatives[0]) : null;
    // γⱼ 排除所选状态后重新取最大值；单状态没有替代，不适用（不能写 −gap）。
    const gamma = bestAlt ? b.selectedSupport - bestAlt.support : null;
    body.append(el('tr', { class: b.consistent ? '' : 'is-conflict' },
      el('td', {}, name(b.descriptorId)),
      el('td', {}, stateName(b.selectedStateId)),
      el('td', { class: 'num' }, String(b.selectedSupport)),
      el('td', { class: 'num' }, String(b.maximum)),
      el('td', { class: 'num' }, String(b.gap)),
      el('td', { class: 'num' }, gamma === null ? '不适用' : (gamma > 0 ? '+' : '') + gamma),
      el('td', {}, b.consistent ? (gamma === 0 ? '并列最高' : '严格最高') : '被“' + stateName(bestAlt.stateId) + '”压过 ' + b.gap)));
  }
  table.append(body);
  section.append(el('details', { class: 'plan-check-rows-detail' },
    el('summary', {}, '逐因素支持分（' + trace.balances.length + ' 个因素' + (bad.length ? '，' + bad.length + ' 个冲突' : '') + '）'), table));

  if (bad.length) {
    const detail = el('details', { class: 'plan-check-detail' }, el('summary', {}, '看每一分的来源：谁的哪一格把它压过去了'));
    for (const b of bad) {
      const bestAlt = b.candidates.reduce((m, c) => c.support > m.support ? c : m, b.candidates[0]);
      detail.append(el('h4', {}, name(b.descriptorId) + '：所选 ' + b.selectedSupport + '，替代“' + stateName(bestAlt.stateId) + '”' + bestAlt.support));
      detail.append(el('ul', {}, ...bestAlt.contributions.map(x => el('li', {}, name(x.sourceDescriptorId) + ' 的“' + stateName(x.sourceStateId) + '” × 对方状态“' + stateName(bestAlt.stateId) + '” = ' + x.score + '（判断 ' + x.judgmentId + '）'))));
      detail.append();
    }
    section.append(detail);
  }

  const run = lastArchive?.RunResult;
  const runYear = lastArchive?.RunInput?.year;
  if (!run) section.append(el('p', { class: 'plan-check-member' }, '方案在全体自洽配置里的位置：还没有完成的全空间检算，无法判断。'));
  else if (run.status !== 'completed') section.append(el('p', { class: 'plan-check-member' }, '方案在全体自洽配置里的位置：全空间检算' + (run.status === 'failed' ? '未完成' : '被阻断') + '，局部结果不能回答这个问题。'));
  else if (runYear !== year) section.append(el('p', { class: 'plan-check-member' }, '方案在全体自洽配置里的位置：最近一次完整检算是 ' + runYear + ' 年，与方案年份不同，不能混用。'));
  else if (JSON.stringify([...(lastArchive.RunInput?.conditionedStateIds||[])].sort())!==JSON.stringify([...conditioned].sort()))section.append(el('p',{class:'plan-check-member'},'最近结果的给定条件不同，不能混用其解集。'));
  else if (run.truncated) section.append(el('p', { class: 'plan-check-member' }, '方案在全体自洽配置里的位置：成立 ' + run.count + ' 个，但只保留了 ' + run.scenarios.length + ' 个，无法确认是否包含你的方案。'));
  else {
    const hit = run.scenarios.some(s => Object.keys(plan.config).every(k => s[k] === plan.config[k]));
    section.append(el('p', { class: 'plan-check-member' }, hit ? '这份方案属于 ' + run.count + ' 个自洽配置之一。' : '这份方案不在 ' + run.count + ' 个自洽配置里；冲突来自上表，不是检算没跑。'));
  }
  return section;
}
