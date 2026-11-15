import { el } from '../../core/ui.mjs';
import { downloadText, downloadJson } from './download.mjs';
import { STEEL_FLOW_MAX_BYTES, verifySteelFlowResult, steelFlowSummaryHtml, flowFamilyLabel, flowNumber, flowCibConfigurationLabel } from './steel-flow-result.mjs';

export function steelFlowResultPanel(container) {
  let alive = true, token = 0, verified = null;
  const root = el('details', { class: 'exports-card steel-flow', 'data-steel-flow': '' });
  const status = el('p', { role: 'status', 'aria-live': 'polite', 'data-steel-flow-status': '' }, '选择独立运行程序生成的result-bundle.json，在本机核对分批次投入与汇总。');
  const result = el('div', { 'data-steel-flow-result': '' });
  const summary = el('button', { class: 'button', type: 'button', disabled: true, onclick: () => { if (verified) downloadText('钢铁投入传递工程核验.html', steelFlowSummaryHtml(verified), 'text/html;charset=utf-8'); } }, '下载核验摘要HTML');
  const original = el('button', { class: 'button', type: 'button', disabled: true, onclick: () => { if (verified) downloadJson('steel-input-flow-result.engineering.json', verified.bundle); } }, '取回结果包JSON');
  const cib = el('button', { class: 'button', type: 'button', disabled: true, onclick: () => { if (verified?.cibCase) downloadText('steel-cib-case.engineering.json', verified.bundle.caseJson, 'application/json;charset=utf-8'); } }, '取回关联CIB留档');
  const file = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': '导入投入传递结果包', onchange: async () => {
    const version = ++token; verified = null; summary.disabled = original.disabled = cib.disabled = true; result.replaceChildren(); status.textContent = '正在核对结果包…';
    try {
      const picked = file.files[0];
      if (!picked || picked.size > STEEL_FLOW_MAX_BYTES) throw new Error('文件缺失或超过16 MiB。');
      const candidate = await verifySteelFlowResult(JSON.parse((await picked.text()).replace(/^\uFEFF/, '')));
      if (!alive || version !== token) return;
      verified = candidate; summary.disabled = original.disabled = false; cib.disabled = !candidate.cibCase;
      const { report, rows, cibCase } = candidate;
      const origin = cibCase ? `${cibCase.cib.year}年，完整冻结情景：${flowCibConfigurationLabel(cibCase)}。参数关联因素：${cibCase.cib.factor.descriptorLabel}=${cibCase.cib.factor.stateLabel}；人工说明：${cibCase.cib.assumption.text}` : '独立合成实验，未关联CIB情景。';
      const table = el('table', {}, el('thead', {}, el('tr', {}, ...['实验', '地区', '年份', '产出 Mt', '原投入 PJ', '改后投入 PJ', '投入降幅', '受影响产出占比'].map(value => el('th', { scope: 'col' }, value)))),
        el('tbody', {}, ...rows.map(row => el('tr', {}, ...[flowFamilyLabel(row.family), row.region, row.year, flowNumber(row.steelOutputMt), flowNumber(row.baselineEnergyEJ * 1000), flowNumber(row.changedEnergyEJ * 1000), flowNumber(row.aggregateEnergyReduction * 100) + '%', flowNumber(row.affectedVintageOutputShare * 100) + '%'].map(value => el('td', {}, String(value)))))));
      result.append(el('p', {}, `目标：${report.target.region} / ${report.target.subsector} / ${report.target.technology} / ${report.target.input}；2030批次系数 ${flowNumber(report.baselineCoefficient)} → ${flowNumber(report.changedCoefficient)} EJ/Mt。`), el('p', {}, origin),
        el('p', {}, '系数变化只作用于2030新增批次；总投入降幅还取决于该批次的产出占比。Mt为百万吨，PJ为拍焦耳；EJ×1000=PJ。'), el('div', { class: 'steel-flow-table', tabindex: '0', role: 'region', 'aria-label': '八次工程对照结果表' }, table),
        el('details', {}, el('summary', {}, '文件对应与程序声明'), el('p', {}, '结果文本SHA256：' + candidate.bundle.reportSha256), el('p', {}, '程序版本声明：' + report.nativeVersionOutput), el('p', {}, '程序SHA256声明：' + report.nativeExecutableSHA256), el('p', {}, '哈希用于对应文件，不是数字签名；本页不认证程序来源，也不读取运行路径。')));
      status.textContent = '包内一致性核验通过：已重算八行对照，核对分批次投入、固定需求及市场总量。' + (cibCase ? '关联的冻结CIB组合及覆盖XML哈希已对应。' : '') + '本页未重新运行GCAM，未检验当前项目。';
    } catch (error) { if (alive && version === token) status.textContent = '结果包未采用：' + error.message; }
  } });
  root.append(el('summary', {}, '原生投入传递结果（工程测试）'),
    el('p', {}, '导入离线程序生成的结果包，查看合成实验中改前改后的投入。本页只核对包内数据，不启动模型。'), file, status,
    el('p', { class: 'steel-boundary' }, '固定需求、固定价格、单一工艺的工程测试；不代表完整GCAM-China、实际省级能耗或政策成效。参数假设未经研究审定；2035年读数不表示2035年CIB已检验。'),
    result, el('div', { class: 'steel-flow-actions' }, summary, original, cib));
  container.append(root);
  return () => { alive = false; token++; verified = null; file.value = ''; root.remove(); };
}
