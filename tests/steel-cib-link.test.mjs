import test from 'node:test';
import assert from 'node:assert/strict';
import fixtures from './saved-work-fixtures.cjs';
import { prepareRun, solve } from '../src/modules/solver/engine.mjs';
import { createLinkedSteelExport, verifySteelCibBundle, inspectSteelCibSelection } from '../src/modules/exports/steel-cib-link.mjs';
import { STEEL_FORMAT, steelOverlayXml, steelSha256 } from '../src/modules/exports/steel-overlay.mjs';

async function parameter() {
  const request = { format: STEEL_FORMAT, version: 1, testOnly: true,
    source: { path: 'synthetic-steel.xml', sha256: '1'.repeat(64) },
    target: { region: 'HE', sector: 'iron and steel', subsector: 'EAF with scrap', technology: 'EAF with scrap', year: 2030, input: 'elect_td_ind', expectedBaseline: 2, unit: 'EJ/Mt' },
    commodity: { path: 'synthetic-electricity.xml', sha256: '2'.repeat(64), region: 'HE', kind: 'supplysector', name: 'elect_td_ind' },
    operation: { kind: 'coefficient-decrease-percent', value: 5 } };
  const xml = steelOverlayXml(request.target, 1.9);
  const audit = { format: STEEL_FORMAT + '-audit', version: 1, testOnly: true, researchMappingApproved: false, cibConsistencyEvaluated: false, nativeModelRun: 'not-performed-by-this-adapter',
    sourceSha256: request.source.sha256, target: structuredClone(request.target), commodityUnit: 'EJ', coefficientUnit: 'EJ/Mt', market: 'HE', operation: structuredClone(request.operation), writtenCoefficient: 1.9,
    overlaySha256: await steelSha256(new TextEncoder().encode(xml)), leafChanges: 1, scope: 'One explicit coefficient of one new vintage; not a whole-industry energy or technology-share target', sameVintageMayOperateInLaterYears: true,
    loading: 'Append after all components that modify this node. This adapter does not validate the complete configuration or later overwrites.', sources: [{ role: 'steel', sha256: request.source.sha256 }, { role: 'commodity', sha256: request.commodity.sha256 }] };
  return { xml, audit, request };
}
async function setup() {
  const { archive } = await fixtures.archive();
  return { overlay: await parameter(), draft: { archive, configuration: structuredClone(archive.RunResult.scenarios[0]), descriptorId: 'A', assumptionText: '合成工程假设：状态A0关联到单项系数降低5%，没有真实研究依据。', regionNote: 'fixture-region与HE仅在合成工程演示中作人工对应。' } };
}
function canonical(v) { return Array.isArray(v) ? v.map(canonical) : v !== null && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v; }
async function rehash(bundle) { delete bundle.integrity.bundlePayloadSha256; bundle.integrity.bundlePayloadSha256 = await steelSha256(new TextEncoder().encode(JSON.stringify(canonical(bundle)))); }

test('linked export freezes the whole scenario, assumption and source hashes without mutating input', async () => {
  const data = await setup(), before = structuredClone(data), linked = await createLinkedSteelExport(data.overlay, data.draft);
  assert.deepEqual(data, before);
  assert.deepEqual(linked.cibBundle.cib.configuration, { A: 'A0', B: 'B0' });
  assert.equal(linked.cibBundle.cib.factor.stateId, 'A0');
  assert.equal(linked.cibBundle.cib.assumption.reviewStatus, 'unreviewed');
  assert.equal(linked.cibBundle.cib.validation.retainedScenarioRechecked, true);
  assert.equal(linked.cibBundle.cib.validation.enumerationCountIndependentlyRecomputed, false);
  assert.equal(linked.cibBundle.cib.validation.currentProjectConsistencyEvaluated, false);
  assert.equal(linked.audit.cibOrigin.runId, data.draft.archive.RunResult.id);
  assert.equal(linked.audit.cibConsistencyEvaluated, true);
  assert.match(linked.xml, /<!-- Engineering test only; CIB archive SHA256=/);
  assert.match(linked.xml, /<coefficient>1.9<\/coefficient>/);
  assert.equal(linked.audit.overlaySha256, await steelSha256(new TextEncoder().encode(linked.xml)));
});

test('downloaded case can be independently reopened and returned as a deep copy', async () => {
  const { overlay, draft } = await setup(), linked = await createLinkedSteelExport(overlay, draft);
  const restored = await verifySteelCibBundle(JSON.parse(JSON.stringify(linked.cibBundle)));
  assert.deepEqual(restored, linked.cibBundle);
  restored.cib.configuration.A = 'A1';
  assert.equal(linked.cibBundle.cib.configuration.A, 'A0');
});

test('a linked explicit zero remains zero in XML, audit and reopened case', async () => {
  const { overlay, draft } = await setup();
  overlay.request.operation = { kind: 'set-coefficient', value: 0 };
  overlay.xml = steelOverlayXml(overlay.request.target, 0);
  overlay.audit.operation = structuredClone(overlay.request.operation);
  overlay.audit.writtenCoefficient = 0;
  overlay.audit.overlaySha256 = await steelSha256(new TextEncoder().encode(overlay.xml));
  const { cibBundle } = await createLinkedSteelExport(overlay, draft);
  assert.match(cibBundle.parameter.xml, /<coefficient>0<\/coefficient>/);
  assert.equal((await verifySteelCibBundle(cibBundle)).parameter.audit.writtenCoefficient, 0);
});

test('configuration mixing, missing factors, wrong year and wrong descriptor reject', async () => {
  const { overlay, draft } = await setup();
  for (const patch of [{ configuration: { A: 'A0', B: 'B1' } }, { configuration: { A: 'A0' } }, { descriptorId: 'missing' }])
    assert.throws(() => inspectSteelCibSelection({ ...draft, ...patch, target: overlay.request.target }));
  assert.throws(() => inspectSteelCibSelection({ ...draft, target: { ...overlay.request.target, year: 2035 } }), /年份/);
});

test('failed, preflight blocked and zero-solution archives cannot supply a linked case', async () => {
  const { overlay, draft } = await setup();
  for (const kind of ['failed', 'preflight', 'zero']) {
    const { archive } = await fixtures.archive(kind);
    await assert.rejects(createLinkedSteelExport(overlay, { ...draft, archive }));
  }
});

test('assumptions must be explicit and different region codes need their own explanation', async () => {
  const { overlay, draft } = await setup();
  for (const text of ['', '   ', null, 'x'.repeat(4001)]) await assert.rejects(createLinkedSteelExport(overlay, { ...draft, assumptionText: text }));
  await assert.rejects(createLinkedSteelExport(overlay, { ...draft, regionNote: '' }), /地区对应/);
  const { project } = await fixtures.archive(); project.scope.regionId = 'HE';
  for (const collection of ['states', 'judgments']) for (const row of project.data[collection]) row.scope.regionId = 'HE';
  const acks = { currentAssumptions: true, unknownStateScope: true }, ids = project.data.judgments.map(j => j.id), ready = prepareRun(project, { year: 2030, selectedJudgmentIds: ids, assumptionAcknowledgements: acks });
  const archive = { archiveVersion: 1, RunInput: ready.input, RunResult: solve(ready.input), projectInputSnapshot: { ...structuredClone(draft.archive.projectInputSnapshot), scope: project.scope, data: project.data }, preflightDiagnostics: ready.diagnostics, assumptionAcknowledgements: acks, selectionOfJudgments: project.data.judgments.map(j => ({ id: j.id, version: j.version, evidenceRefs: j.evidenceRefs })) };
  const linked = await createLinkedSteelExport(overlay, { ...draft, archive, regionNote: '' });
  assert.equal(linked.cibBundle.cib.regionCorrespondence.kind, 'literal-code-match');
  assert.equal(linked.cibBundle.cib.regionCorrespondence.reviewed, false);
});

test('outcome factors cannot be silently used as parameter inputs', async () => {
  const { overlay, draft } = await setup(); draft.archive.projectInputSnapshot.data.descriptors[0].role = 'outcome';
  await assert.rejects(createLinkedSteelExport(overlay, draft), /输入型因素/);
});

test('given conditions are preserved and remain exempt from their own balance check', async () => {
  const { overlay, draft } = await setup(), { project } = await fixtures.archive();
  const acks = draft.archive.assumptionAcknowledgements, selectedJudgmentIds = project.data.judgments.map(j => j.id);
  const ready = prepareRun(project, { year: 2030, selectedJudgmentIds, assumptionAcknowledgements: acks, conditionedStateIds: ['A0'] });
  draft.archive.RunInput = ready.input; draft.archive.RunResult = solve(ready.input); draft.archive.preflightDiagnostics = ready.diagnostics;
  const linked = await createLinkedSteelExport(overlay, draft);
  assert.deepEqual(linked.cibBundle.cib.trace.conditionedStateIds, ['A0']);
  assert.deepEqual(linked.cibBundle.cib.trace.balances.map(row => row.descriptorId), ['B']);
  await verifySteelCibBundle(linked.cibBundle);
});

test('tampering rejects even after recomputing the outer content hash', async () => {
  const { overlay, draft } = await setup(), { cibBundle } = await createLinkedSteelExport(overlay, draft);
  for (const mutate of [
    b => b.parameter.xml = b.parameter.xml.replace('<coefficient>1.9', '<coefficient>99'),
    b => b.cib.factor.stateId = 'A1',
    b => b.cib.configuration.B = 'B1',
    b => b.cib.assumption.reviewStatus = 'reviewed',
    b => b.cib.validation.enumerationCountIndependentlyRecomputed = true,
    b => b.parameter.audit.cibOrigin.reviewStatus = 'reviewed'
  ]) {
    const bad = structuredClone(cibBundle); mutate(bad); await rehash(bad);
    await assert.rejects(verifySteelCibBundle(bad));
  }
  const bad = structuredClone(cibBundle); bad.cib.assumption.text = 'changed';
  await assert.rejects(verifySteelCibBundle(bad), /哈希/);
});

test('parameter mismatches, invalid declarations and extras are rejected before attaching CIB', async () => {
  const { overlay, draft } = await setup();
  for (const mutate of [o => o.xml += ' ', o => o.audit.writtenCoefficient = 9, o => o.audit.researchMappingApproved = true, o => o.audit.extra = true, o => o.request.testOnly = false, o => o.request.source.path = null, o => o.audit.scope = 'whole industry']) {
    const bad = structuredClone(overlay); mutate(bad); await assert.rejects(createLinkedSteelExport(bad, draft));
  }
});

test('retained-scenario validation does not certify an archived total count or the current project', async () => {
  const { overlay, draft } = await setup();
  draft.archive.RunResult.count = 1;
  draft.archive.RunResult.scenarios = draft.archive.RunResult.scenarios.slice(0, 1);
  draft.archive.RunResult.balanceTrace = draft.archive.RunResult.balanceTrace.slice(0, 1);
  const { cibBundle } = await createLinkedSteelExport(overlay, draft);
  assert.equal(cibBundle.cib.validation.enumerationCountIndependentlyRecomputed, false);
  assert.equal(cibBundle.cib.validation.currentProjectConsistencyEvaluated, false);
  await verifySteelCibBundle(cibBundle);
});
