import { steelSha256 } from './steel-overlay.mjs';
import { verifySteelCibBundle } from './steel-cib-link.mjs';

export const STEEL_FLOW_FORMAT = 'scenario-workbench.steel-input-flow-result';
export const STEEL_FLOW_MAX_BYTES = 16 * 1024 * 1024;
const need = (value, message) => { if (!value) throw new Error(message); };
const bytes = value => new TextEncoder().encode(value);
const digest = value => steelSha256(bytes(value));
const families = ['replacement', 'coexistence'], variants = ['baseline', 'changed'];
const years = [1975, 1990, 2005, 2010, 2015, 2021, 2025, 2030, 2035];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, names) { need(object(value) && Object.keys(value).sort().join('|') === [...names].sort().join('|'), '结果字段缺失或含未知字段。'); }
function text(value) { need(typeof value === 'string' && value.trim().length > 0 && value.length <= 4000, '结果标识缺失或过长。'); }
function sha(value) { need(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), '缺少有效的SHA256记录。'); }
function number(value) { need(typeof value === 'number' && Number.isFinite(value) && value >= 0, '投入、产出或系数必须是非负有限数值。'); }
function near(a, b) { need(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(1e-10, 5e-6 * Math.max(Math.abs(a), Math.abs(b))), '分批次数据、市场需求或汇总数值不能对应。'); }
const key = (...parts) => JSON.stringify(parts);

function inspectSnapshot(snap, run, report) {
  keys(snap, ['year', 'region', 'outputMt', 'energyInputEJ', 'materialInputMt', 'fixedSteelDemandMt', 'marketEnergyDemandEJ', 'marketMaterialDemandMt', 'vintages']);
  need(snap.region === run.region && [2030, 2035].includes(snap.year), '快照地区或年份不对应。');
  for (const field of ['outputMt', 'energyInputEJ', 'materialInputMt', 'fixedSteelDemandMt', 'marketEnergyDemandEJ', 'marketMaterialDemandMt']) number(snap[field]);
  need(snap.outputMt > 0 && Array.isArray(snap.vintages) && snap.vintages.length > 0 && snap.vintages.length <= years.length, '需要正产出及完整的技术批次记录。');
  const seen = new Set(); let output = 0, energy = 0, material = 0;
  for (const row of snap.vintages) {
    keys(row, ['vintage', 'outputMt', 'energyInputEJ', 'energyCoefficientEJperMt', 'materialInputMt']);
    need(years.includes(row.vintage) && row.vintage <= snap.year && !seen.has(row.vintage), '技术批次重复或年份无效。'); seen.add(row.vintage);
    for (const field of ['outputMt', 'energyInputEJ', 'energyCoefficientEJperMt', 'materialInputMt']) number(row[field]);
    const changed = run.variant === 'changed' && run.region === report.target.region && row.vintage === 2030;
    near(row.energyCoefficientEJperMt, changed ? report.changedCoefficient : report.baselineCoefficient);
    near(row.energyInputEJ, row.outputMt * row.energyCoefficientEJperMt); near(row.materialInputMt, row.outputMt * 3);
    output += row.outputMt; energy += row.energyInputEJ; material += row.materialInputMt;
  }
  near(output, snap.outputMt); near(energy, snap.energyInputEJ); near(material, snap.materialInputMt);
  near(output, snap.fixedSteelDemandMt); near(energy, snap.marketEnergyDemandEJ); near(material, snap.marketMaterialDemandMt);
  near(output, run.family === 'replacement' ? 1 : 2);
}

export async function verifySteelFlowResult(bundle) {
  keys(bundle, ['format', 'version', 'testOnly', 'reportJson', 'reportSha256', 'caseJson', 'caseSha256']);
  need(bundle.format === STEEL_FLOW_FORMAT && bundle.version === 1 && bundle.testOnly === true, '不是受支持的投入传递工程结果包。');
  need(bytes(JSON.stringify(bundle)).length <= STEEL_FLOW_MAX_BYTES, '结果包超过16 MiB。');
  need(typeof bundle.reportJson === 'string', '缺少原始结果文本。'); sha(bundle.reportSha256);
  need(await digest(bundle.reportJson) === bundle.reportSha256, '结果文本与哈希不一致。');
  const report = JSON.parse(bundle.reportJson), linked = bundle.caseJson !== null;
  keys(report, ['kind', 'testOnly', 'status', 'fullGCAMChina', 'policyEffectEvaluated', 'researchMappingApproved', 'nativeExecutableSHA256', 'nativeVersionOutput', 'caseCheck', 'target', 'baselineCoefficient', 'changedCoefficient', 'runs', 'summaries', 'nativeRuns', ...(linked ? ['linkedCaseSHA256'] : [])]);
  need(report.kind === 'synthetic-positive-output-steel-smoke' && report.testOnly === true && report.status === 'passed' && report.nativeRuns === 8, '只接受已完成的八次合成工程对照结果。');
  for (const field of ['fullGCAMChina', 'policyEffectEvaluated', 'researchMappingApproved']) need(report[field] === false, '工程测试不能改写为全模型或政策成效证明。');
  sha(report.nativeExecutableSHA256); text(report.nativeVersionOutput);
  need(report.nativeVersionOutput.includes('version 8.2') && report.nativeVersionOutput.includes('gcam-v8.2'), '记录不是本入口支持的GCAM 8.2版本。');
  keys(report.target, ['region', 'sector', 'subsector', 'technology', 'year', 'input', 'unit', ...(linked ? ['expectedBaseline'] : [])]);
  for (const field of ['region', 'sector', 'subsector', 'technology', 'input', 'unit']) text(report.target[field]);
  need(report.target.sector === 'iron and steel' && report.target.year === 2030 && report.target.unit === 'EJ/Mt' && report.target.input !== 'synthetic-material', '仅支持2030年钢铁能源系数工程实验。');
  number(report.baselineCoefficient); number(report.changedCoefficient); need(report.baselineCoefficient > 0, '基准系数须大于0。');
  let cibCase = null;
  if (linked) {
    need(typeof bundle.caseJson === 'string' && bytes(bundle.caseJson).length <= 8 * 1024 * 1024, '关联留档缺失或超过8 MiB。'); sha(bundle.caseSha256);
    need(await digest(bundle.caseJson) === bundle.caseSha256 && report.linkedCaseSHA256 === bundle.caseSha256, '运行结果与CIB留档的文件哈希不能对应。');
    cibCase = await verifySteelCibBundle(JSON.parse(bundle.caseJson.replace(/^\uFEFF/, '')));
    const target = cibCase.parameter.request.target;
    for (const field of Object.keys(target)) need(report.target[field] === target[field], '运行目标与关联留档中的参数节点不一致。');
    need(report.baselineCoefficient === target.expectedBaseline && report.changedCoefficient === cibCase.parameter.audit.writtenCoefficient, '运行系数与关联留档不一致。');
    const check = report.caseCheck;
    keys(check, ['valid', 'testOnly', 'year', 'configuration', 'factor', 'parameterValue', 'parameterUnit', 'selectedScenarioRechecked', 'enumerationCountIndependentlyRecomputed', 'originalModelFilesReverified', 'researchMappingApproved', 'fullModelExecuted']);
    need(check.valid === true && check.testOnly === true && check.year === cibCase.cib.year && check.selectedScenarioRechecked === true, '关联复核摘要不一致。');
    for (const field of ['enumerationCountIndependentlyRecomputed', 'originalModelFilesReverified', 'researchMappingApproved', 'fullModelExecuted']) need(check[field] === false, '关联复核不能声称完成全模型或研究映射审定。');
    const same = (a, b) => object(a) && object(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => a[k] === b[k]);
    need(same(check.configuration, cibCase.cib.configuration) && same(check.factor, cibCase.cib.factor), '复核摘要中的完整情景或因素被替换。');
    need(check.parameterValue === report.changedCoefficient && check.parameterUnit === report.target.unit, '复核摘要中的系数不一致。');
  } else need(bundle.caseSha256 === null && report.caseCheck === null, '独立工程实验不能附带未核验的CIB对应关系。');
  need(Array.isArray(report.runs) && report.runs.length === 8, '原生运行记录必须完整保留八次。');
  const regions = [...new Set(report.runs.map(row => row?.region))];
  need(regions.length === 2 && regions.includes(report.target.region), '需要目标地区和一个不同的对照地区。'); regions.forEach(text);
  const control = regions.find(region => region !== report.target.region), runs = new Map(), overlays = { baseline: new Set(), changed: new Set() };
  for (const run of report.runs) {
    keys(run, ['family', 'variant', 'region', 'exitCode', 'workDirectory', 'overlaySHA256', 'snapshots']);
    need(families.includes(run.family) && variants.includes(run.variant) && run.exitCode === 0, '原生运行分类或退出状态无效。'); text(run.workDirectory); sha(run.overlaySHA256);
    const id = key(run.family, run.variant, run.region); need(!runs.has(id), '运行记录重复。'); runs.set(id, run); overlays[run.variant].add(run.overlaySHA256);
    need(Array.isArray(run.snapshots) && run.snapshots.length === 2 && run.snapshots[0]?.year === 2030 && run.snapshots[1]?.year === 2035, '需要2030和2035年的有序快照。');
    run.snapshots.forEach(snap => inspectSnapshot(snap, run, report));
  }
  need(overlays.baseline.size === 1 && overlays.changed.size === 1, '同一对照实验必须使用相同的覆盖XML。');
  if (cibCase) need(overlays.changed.has(cibCase.integrity.modelXmlSha256), '运行中使用的XML与关联留档不一致。');
  const rows = [];
  for (const family of families) for (const region of [report.target.region, control]) {
    const baseline = runs.get(key(family, 'baseline', region)), changed = runs.get(key(family, 'changed', region));
    need(baseline && changed, '缺少基准或改后对照。');
    for (let i = 0; i < 2; i++) {
      const left = baseline.snapshots[i], right = changed.snapshots[i]; near(left.outputMt, right.outputMt); near(left.materialInputMt, right.materialInputMt);
      need(left.vintages.length === right.vintages.length, '对照中的技术批次集合发生变化。');
      let affected = 0;
      for (const old of left.vintages) {
        const current = right.vintages.find(row => row.vintage === old.vintage); need(current, '对照中的技术批次缺失。'); near(current.outputMt, old.outputMt);
        if (region === report.target.region && current.vintage === 2030) affected += current.outputMt;
      }
      near(right.energyInputEJ, left.energyInputEJ + (report.changedCoefficient - report.baselineCoefficient) * affected);
      const share = affected / right.outputMt;
      near(share, region !== report.target.region ? 0 : family === 'coexistence' ? .5 : left.year === 2030 ? 1 : 0);
      need(left.energyInputEJ > 0, '基准能源投入须大于0。');
      rows.push({ family, region, year: left.year, steelOutputMt: right.outputMt, baselineEnergyEJ: left.energyInputEJ, changedEnergyEJ: right.energyInputEJ, affectedVintageOutputShare: share, coefficientReduction: 1 - report.changedCoefficient / report.baselineCoefficient, aggregateEnergyReduction: 1 - right.energyInputEJ / left.energyInputEJ });
    }
  }
  need(Array.isArray(report.summaries) && report.summaries.length === rows.length, '缺少完整的八行汇总。');
  const seen = new Set();
  for (const declared of report.summaries) {
    keys(declared, Object.keys(rows[0]));
    const id = key(declared.family, declared.region, declared.year), row = rows.find(r => key(r.family, r.region, r.year) === id);
    need(row && !seen.has(id), '汇总记录重复或分类错误。'); seen.add(id);
    for (const field of Object.keys(row).filter(k => !['family', 'region', 'year'].includes(k))) { need(typeof declared[field] === 'number', '汇总数值类型无效。'); near(declared[field], row[field]); }
  }
  return { bundle: structuredClone(bundle), report: structuredClone(report), cibCase, rows, validation: { internalConsistency: true, nativeRerun: false, nativeBinaryAuthenticated: false, currentProjectConsistencyEvaluated: false, fullGCAMChina: false, policyEffectEvaluated: false } };
}

const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
export const flowFamilyLabel = value => value === 'replacement' ? '单批次替换' : '新旧批次并存';
export const flowNumber = value => Number(value.toPrecision(8)).toString();
export const flowCibConfigurationLabel = cibCase => cibCase.cib.archive.RunInput.activeDescriptorIds.map(id => {
  const descriptor = cibCase.cib.archive.projectInputSnapshot.data.descriptors.find(row => row.id === id);
  const state = cibCase.cib.archive.RunInput.stateDefinitions.find(row => row.id === cibCase.cib.configuration[id]);
  return `${descriptor?.label || id}=${state?.label || cibCase.cib.configuration[id]}`;
}).join('；');
export function steelFlowSummaryHtml(verified) {
  const { report, rows, cibCase } = verified;
  const origin = cibCase ? `${cibCase.cib.year}年，完整冻结情景：${flowCibConfigurationLabel(cibCase)}。参数关联因素：${cibCase.cib.factor.descriptorLabel}=${cibCase.cib.factor.stateLabel}；人工说明：${cibCase.cib.assumption.text}` : '独立合成实验，未关联CIB情景。';
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>钢铁投入传递工程核验</title><style>body{font:15px/1.7 sans-serif;max-width:1100px;margin:32px auto;padding:0 16px;color:#24313b}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd2d7;padding:8px;text-align:left}.table{overflow:auto}p{overflow-wrap:anywhere}</style><h1>钢铁投入传递工程核验</h1><p>包内一致性核验通过；本报告未重新运行GCAM，也未认证原生程序或文件来源。哈希用于对应文件，不是数字签名。</p><p>仅为固定需求、固定价格、单一工艺的合成工程测试；不代表完整GCAM-China、实际省级能耗或政策成效。参数假设未经研究审定，2035年读数不表示2035年CIB已检验。</p><p>目标：${escape(report.target.region)} / ${escape(report.target.subsector)} / ${escape(report.target.technology)} / ${escape(report.target.input)}；2030批次系数：${flowNumber(report.baselineCoefficient)} → ${flowNumber(report.changedCoefficient)} EJ/Mt。</p><p>${escape(origin)}</p><p>系数变化只作用于2030新增批次；能源投入变化还取决于该批次占总产出的比例。Mt为百万吨，PJ为拍焦耳；EJ×1000=PJ。</p><div class="table"><table><thead><tr><th>实验</th><th>地区</th><th>年份</th><th>产出 Mt</th><th>原投入 PJ</th><th>改后投入 PJ</th><th>投入降幅</th><th>受影响产出占比</th></tr></thead><tbody>${rows.map(r => `<tr><td>${flowFamilyLabel(r.family)}</td><td>${escape(r.region)}</td><td>${r.year}</td><td>${flowNumber(r.steelOutputMt)}</td><td>${flowNumber(r.baselineEnergyEJ * 1000)}</td><td>${flowNumber(r.changedEnergyEJ * 1000)}</td><td>${flowNumber(r.aggregateEnergyReduction * 100)}%</td><td>${flowNumber(r.affectedVintageOutputShare * 100)}%</td></tr>`).join('')}</tbody></table></div><p>结果文本SHA256：${escape(verified.bundle.reportSha256)}。声明的程序SHA256：${escape(report.nativeExecutableSHA256)}。</p></html>`;
}
