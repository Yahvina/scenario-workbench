import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySteelFlowResult, steelFlowSummaryHtml, STEEL_FLOW_MAX_BYTES } from '../src/modules/exports/steel-flow-result.mjs';
import { syntheticCase, syntheticReport, pack, sha } from './steel-flow-fixtures.mjs';

test('independent result recomputes eight rows without certifying native execution or current project', async () => {
  const bundle = await pack(syntheticReport()), before = structuredClone(bundle), result = await verifySteelFlowResult(bundle);
  assert.deepEqual(bundle, before); assert.equal(result.rows.length, 8); assert.equal(result.cibCase, null);
  assert.deepEqual(result.validation, { internalConsistency: true, nativeRerun: false, nativeBinaryAuthenticated: false, currentProjectConsistencyEvaluated: false, fullGCAMChina: false, policyEffectEvaluated: false });
  const find = (family, year) => result.rows.find(r => r.family === family && r.region === 'HE' && r.year === year);
  assert.ok(Math.abs(find('replacement', 2030).aggregateEnergyReduction - .05) < 1e-12);
  assert.equal(find('replacement', 2035).aggregateEnergyReduction, 0);
  assert.ok(Math.abs(find('coexistence', 2035).aggregateEnergyReduction - .025) < 1e-12);
  result.report.target.region = 'changed'; assert.equal(JSON.parse(bundle.reportJson).target.region, 'HE');
});

test('linked result rechecks full frozen CIB case and preserves exact BOM/Unicode case bytes', async () => {
  const cibCase = await syntheticCase(), caseJson = '\uFEFF' + JSON.stringify(cibCase, null, 2), bundle = await pack(syntheticReport(cibCase), caseJson);
  const result = await verifySteelFlowResult(bundle);
  assert.deepEqual(result.cibCase, cibCase); assert.equal(result.bundle.caseJson, caseJson);
  assert.deepEqual(result.cibCase.cib.configuration, { A: 'A0', B: 'B0' });
  assert.equal(result.report.linkedCaseSHA256, await sha(caseJson));
});

test('zero changed coefficient is valid and never treated as missing', async () => {
  const cibCase = await syntheticCase(0), result = await verifySteelFlowResult(await pack(syntheticReport(cibCase), JSON.stringify(cibCase)));
  assert.equal(result.rows[0].changedEnergyEJ, 0); assert.equal(result.rows[0].aggregateEnergyReduction, 1);
  assert.equal(result.rows.find(r => r.family === 'coexistence' && r.region === 'HE').aggregateEnergyReduction, .5);
});

test('changed raw text and unsupported or oversized envelopes reject', async () => {
  const good = await pack(syntheticReport());
  for (const patch of [{ reportJson: good.reportJson + ' ' }, { format: 'different' }, { version: 2 }, { testOnly: false }, { extra: true }, { caseSha256: '1'.repeat(64) }, { reportJson: 'x'.repeat(STEEL_FLOW_MAX_BYTES) }]) await assert.rejects(verifySteelFlowResult({ ...good, ...patch }));
});

test('passed alone cannot hide missing runs or scientific overclaims after rehashing', async () => {
  for (const mutate of [r => { r.status = 'running'; }, r => { r.fullGCAMChina = true; }, r => { r.policyEffectEvaluated = true; }, r => { r.researchMappingApproved = true; }, r => { r.nativeRuns = 7; }, r => { r.runs.pop(); }, r => { r.runs[0] = r.runs[1]; }, r => { r.runs[0].exitCode = 1; }, r => { r.target.year = 2035; }, r => { r.target.unit = 'Mt/Mt'; }, r => { r.changedCoefficient = true; }, r => { r.nativeVersionOutput = 'GCAM 9'; }]) {
    const report = syntheticReport(); mutate(report); await assert.rejects(verifySteelFlowResult(await pack(report)));
  }
});

test('pointwise identities, fixed demand, market totals and baseline scope are independently checked', async () => {
  for (const mutate of [s => { s.vintages[0].energyInputEJ += 1; }, s => { s.marketEnergyDemandEJ += 1; }, s => { s.marketMaterialDemandMt += 1; }, s => { s.fixedSteelDemandMt += 1; }, s => { s.vintages[0].energyCoefficientEJperMt = 1.9; }, s => { s.outputMt = 0; }, s => { s.vintages.push(s.vintages[0]); }, s => { s.vintages[0].vintage = 2035; }, s => { s.materialInputMt = null; }, s => { s.outputMt = '1'; }]) {
    const report = syntheticReport(); mutate(report.runs[0].snapshots[0]); await assert.rejects(verifySteelFlowResult(await pack(report)));
  }
});

test('control effects, wrong batch retirement, forged totals and mismatched overlay hashes reject', async () => {
  for (const mutate of [r => { r.runs[3].snapshots[0].vintages[0].energyCoefficientEJperMt = 1.9; }, r => { r.runs[0].snapshots[1].vintages[0].vintage = 2030; }, r => { r.summaries[0].aggregateEnergyReduction = .99; }, r => { r.summaries[0] = r.summaries[1]; }, r => { r.runs[0].overlaySHA256 = 'd'.repeat(64); }, r => { r.runs[0].snapshots[0].year = 2035; }]) {
    const report = syntheticReport(); mutate(report); await assert.rejects(verifySteelFlowResult(await pack(report)));
  }
});

test('linked case coefficient, XML, scenario summary and raw hash must match', async () => {
  const cibCase = await syntheticCase(), caseJson = JSON.stringify(cibCase);
  for (const mutate of [r => { r.caseCheck.parameterValue = 1; }, r => { r.caseCheck.configuration = { A: 'A1', B: 'B1' }; }, r => { r.caseCheck.fullModelExecuted = true; }, r => { r.target.input = 'other-input'; }, r => { r.changedCoefficient = 1; }, r => { for (const run of r.runs.filter(v => v.variant === 'changed')) run.overlaySHA256 = 'd'.repeat(64); }]) {
    const report = syntheticReport(cibCase); mutate(report); await assert.rejects(verifySteelFlowResult(await pack(report, caseJson)));
  }
  const broken = structuredClone(cibCase); broken.cib.configuration = { A: 'A1', B: 'B1' };
  await assert.rejects(verifySteelFlowResult(await pack(syntheticReport(cibCase), JSON.stringify(broken))));
  const bundle = await pack(syntheticReport(cibCase), caseJson); bundle.caseJson += ' '; await assert.rejects(verifySteelFlowResult(bundle));
});

test('summary export escapes user text and retains engineering and provenance limitations', async () => {
  const cibCase = await syntheticCase(), result = await verifySteelFlowResult(await pack(syntheticReport(cibCase), JSON.stringify(cibCase)));
  const html = steelFlowSummaryHtml(result);
  assert.ok(html.includes('&lt;script&gt;throw 1&lt;/script&gt;')); assert.ok(!html.includes('<script>'));
  for (const text of ['未重新运行GCAM', '不是数字签名', '不代表完整GCAM-China', '2035年CIB已检验', 'EJ×1000=PJ', '2.5%', '1900']) assert.ok(html.includes(text), text);
});
