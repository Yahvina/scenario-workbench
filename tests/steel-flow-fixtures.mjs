import fixtures from './saved-work-fixtures.cjs';
import { createLinkedSteelExport } from '../src/modules/exports/steel-cib-link.mjs';
import { STEEL_FORMAT, steelOverlayXml, steelSha256 } from '../src/modules/exports/steel-overlay.mjs';
import { STEEL_FLOW_FORMAT } from '../src/modules/exports/steel-flow-result.mjs';

export const sha = text => steelSha256(new TextEncoder().encode(text));
export async function syntheticCase(value = 1.9) {
  const target = { region: 'HE', sector: 'iron and steel', subsector: 'synthetic-process', technology: 'synthetic-technology', year: 2030, input: 'synthetic-electricity', unit: 'EJ/Mt', expectedBaseline: 2 };
  const request = { format: STEEL_FORMAT, version: 1, testOnly: true, source: { path: 'synthetic.xml', sha256: '1'.repeat(64) }, target,
    commodity: { path: 'synthetic-input.xml', sha256: '2'.repeat(64), region: 'HE', kind: 'supplysector', name: target.input }, operation: { kind: 'set-coefficient', value } };
  const xml = steelOverlayXml(target, value), audit = { format: STEEL_FORMAT + '-audit', version: 1, testOnly: true, researchMappingApproved: false, cibConsistencyEvaluated: false, nativeModelRun: 'not-performed-by-this-adapter', sourceSha256: request.source.sha256, target, commodityUnit: 'EJ', coefficientUnit: 'EJ/Mt', market: 'HE', operation: request.operation, writtenCoefficient: value, overlaySha256: await sha(xml), leafChanges: 1,
    scope: 'One explicit coefficient of one new vintage; not a whole-industry energy or technology-share target', sameVintageMayOperateInLaterYears: true,
    loading: 'Append after all components that modify this node. This adapter does not validate the complete configuration or later overwrites.', sources: [{ role: 'steel', sha256: request.source.sha256 }, { role: 'commodity', sha256: request.commodity.sha256 }] };
  const { archive } = await fixtures.archive();
  return (await createLinkedSteelExport({ request, xml, audit }, { archive, configuration: archive.RunResult.scenarios[0], descriptorId: 'A', assumptionText: '仅合成工程假设；<script>throw 1</script>不得执行。', regionNote: '仅在合成夹具中人工对应地区。' })).cibBundle;
}

// Constructed records for validator tests; no native model execution is claimed.
export function syntheticReport(cibCase = null, changed = 1.9) {
  const target = cibCase ? structuredClone(cibCase.parameter.request.target) : { region: 'HE', sector: 'iron and steel', subsector: 'synthetic-process', technology: 'synthetic-technology', year: 2030, input: 'synthetic-electricity', unit: 'EJ/Mt' };
  if (cibCase) changed = cibCase.parameter.audit.writtenCoefficient;
  const caseCheck = cibCase ? { valid: true, testOnly: true, year: cibCase.cib.year, configuration: cibCase.cib.configuration, factor: cibCase.cib.factor, parameterValue: changed, parameterUnit: 'EJ/Mt', selectedScenarioRechecked: true, enumerationCountIndependentlyRecomputed: false, originalModelFilesReverified: false, researchMappingApproved: false, fullModelExecuted: false } : null;
  const report = { kind: 'synthetic-positive-output-steel-smoke', testOnly: true, status: 'passed', fullGCAMChina: false, policyEffectEvaluated: false, researchMappingApproved: false, nativeExecutableSHA256: 'a'.repeat(64), nativeVersionOutput: 'GCAM version 8.2 Revision: gcam-v8.2 (constructed test record)', caseCheck, target, baselineCoefficient: 2, changedCoefficient: changed, runs: [], summaries: [], nativeRuns: 8 };
  for (const family of ['replacement', 'coexistence']) for (const variant of ['baseline', 'changed']) for (const region of ['HE', 'CONTROL']) {
    const snapshots = [2030, 2035].map(year => {
      const vintages = (family === 'replacement' ? [year] : year === 2030 ? [2021, 2030] : [2030, 2035]).map(vintage => {
        const coefficient = variant === 'changed' && region === 'HE' && vintage === 2030 ? changed : 2;
        return { vintage, outputMt: 1, energyInputEJ: coefficient, energyCoefficientEJperMt: coefficient, materialInputMt: 3 };
      });
      const outputMt = vintages.length, energyInputEJ = vintages.reduce((sum, r) => sum + r.energyInputEJ, 0);
      return { year, region, outputMt, energyInputEJ, materialInputMt: outputMt * 3, fixedSteelDemandMt: outputMt, marketEnergyDemandEJ: energyInputEJ, marketMaterialDemandMt: outputMt * 3, vintages };
    });
    report.runs.push({ family, variant, region, exitCode: 0, workDirectory: 'constructed-fixture', overlaySHA256: variant === 'changed' ? cibCase?.integrity.modelXmlSha256 || 'c'.repeat(64) : 'b'.repeat(64), snapshots });
  }
  for (const family of ['replacement', 'coexistence']) for (const region of ['HE', 'CONTROL']) for (const year of [2030, 2035]) {
    const quantity = family === 'replacement' ? 1 : 2, share = region === 'CONTROL' ? 0 : family === 'coexistence' ? .5 : year === 2030 ? 1 : 0;
    report.summaries.push({ family, region, year, steelOutputMt: quantity, baselineEnergyEJ: quantity * 2, changedEnergyEJ: quantity * 2 + (changed - 2) * share * quantity, affectedVintageOutputShare: share, coefficientReduction: 1 - changed / 2, aggregateEnergyReduction: (1 - changed / 2) * share });
  }
  return report;
}

export async function pack(report, caseJson = null) {
  if (caseJson !== null) report.linkedCaseSHA256 = await sha(caseJson);
  const reportJson = JSON.stringify(report, null, 2);
  return { format: STEEL_FLOW_FORMAT, version: 1, testOnly: true, reportJson, reportSha256: await sha(reportJson), caseJson, caseSha256: caseJson === null ? null : await sha(caseJson) };
}
