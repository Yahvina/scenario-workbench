import { validateArchive } from '../workspace/saved-work.mjs';
import { explain } from '../solver/engine.mjs';
import { STEEL_FORMAT, calculateSteelCoefficient, steelOverlayXml, steelSha256 } from './steel-overlay.mjs';

export const STEEL_CIB_FORMAT = 'scenario-workbench.steel-cib-case';
const need = (value, message) => { if (!value) throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const hash = value => steelSha256(new TextEncoder().encode(JSON.stringify(canonical(value))));
function keys(value, names) { need(object(value) && Object.keys(value).sort().join('|') === [...names].sort().join('|'), '参数记录字段不完整或含未知字段。'); }
function note(value, label, required = true) {
  need(typeof value === 'string' && value.length <= 4000 && (!required || value.trim().length > 0), label + '须明确填写，最多4000字。');
  return value;
}

export function inspectSteelCibSelection({ archive, configuration, descriptorId, assumptionText, regionNote, target }) {
  validateArchive(archive);
  const input = archive.RunInput, result = archive.RunResult;
  need(result?.status === 'completed' && result.scenarios.length > 0, '只关联已完成且保留自洽组合的冻结结果；未完成或零解记录不能关联。');
  need(result.scenarios.some(row => same(row, configuration)), '所选完整组合不在该归档保留的自洽列表中，不能拼接其他组合的状态。');
  const trace = explain(input, configuration);
  need(trace.consistent && !trace.violatesLocks, '所选组合未通过冻结矩阵与条件复核。');
  need(input.year === target.year, 'CIB检验年份与新增技术年份不同，不能直接关联。');
  need(input.activeDescriptorIds.includes(descriptorId), '请选择该次检验中的因素。');
  const descriptor = archive.projectInputSnapshot.data.descriptors.find(row => row.id === descriptorId);
  need(descriptor?.role === 'input', '本入口只关联输入型因素；结果型或背景因素不能直接作为该参数输入。');
  const stateId = configuration[descriptorId];
  const state = input.stateDefinitions.find(row => row.id === stateId && row.descriptorId === descriptorId);
  need(state, '所选因素状态在冻结输入中缺失。');
  const region = input.scope.regionId;
  need(typeof region === 'string' && region.length > 0 && typeof target.region === 'string' && target.region.length > 0, 'CIB地区或模型地区缺失。');
  note(assumptionText, '人工参数设定说明');
  note(regionNote, '地区对应说明', region !== target.region);
  return {
    archive: structuredClone(archive), configuration: structuredClone(configuration), trace,
    factor: { descriptorId, descriptorLabel: descriptor.label, stateId, stateLabel: state.label, role: descriptor.role },
    year: input.year,
    regionCorrespondence: { cibRegion: region, modelRegion: target.region, kind: region === target.region ? 'literal-code-match' : 'user-assumed-correspondence', note: regionNote, reviewed: false },
    assumption: { kind: 'user-assumption', text: assumptionText, reviewStatus: 'unreviewed', researchMappingApproved: false },
    validation: { retainedScenarioRechecked: true, enumerationCountIndependentlyRecomputed: false, currentProjectConsistencyEvaluated: false, fullModelExecuted: false }
  };
}

async function assertParameterOutput(overlay) {
  need(object(overlay) && object(overlay.request) && object(overlay.audit), '缺少已核验的单项覆盖结果。');
  const request = overlay.request, audit = overlay.audit;
  keys(request, ['format', 'version', 'testOnly', 'source', 'target', 'commodity', 'operation']);
  keys(request.source, ['path', 'sha256']);
  keys(request.target, ['region', 'sector', 'subsector', 'technology', 'year', 'input', 'expectedBaseline', 'unit']);
  keys(request.commodity, ['path', 'sha256', 'region', 'kind', 'name']);
  for (const spec of [request.source, request.commodity]) need(typeof spec.path === 'string' && spec.path.trim().length > 0, '模型来源路径无效。');
  keys(audit, ['format', 'version', 'testOnly', 'researchMappingApproved', 'cibConsistencyEvaluated', 'nativeModelRun', 'sourceSha256', 'target', 'commodityUnit', 'coefficientUnit', 'market', 'operation', 'writtenCoefficient', 'overlaySha256', 'leafChanges', 'scope', 'sameVintageMayOperateInLaterYears', 'loading', 'sources']);
  need(request.format === STEEL_FORMAT && request.version === 1 && request.testOnly === true, '参数请求须为v1工程请求。');
  const expected = calculateSteelCoefficient(request.target.expectedBaseline, request.operation);
  need(overlay.xml === steelOverlayXml(request.target, expected), '参数XML与原值、操作或节点不一致。');
  need(audit.format === STEEL_FORMAT + '-audit' && audit.version === 1 && audit.testOnly === true && audit.researchMappingApproved === false && audit.cibConsistencyEvaluated === false && audit.nativeModelRun === 'not-performed-by-this-adapter', '参数核验记录的性质或版本无效。');
  need(same(audit.target, request.target) && same(audit.operation, request.operation) && audit.writtenCoefficient === expected, '参数审计与请求不一致。');
  need(audit.sourceSha256 === request.source.sha256 && /^[0-9a-f]{64}$/.test(request.source.sha256) && /^[0-9a-f]{64}$/.test(request.commodity.sha256), '模型来源哈希缺失或不一致。');
  need(audit.market === request.commodity.region && request.commodity.name === request.target.input && ['supplysector', 'unlimited-resource'].includes(request.commodity.kind), '商品证明与审计不一致。');
  need(['EJ', 'Mt'].includes(audit.commodityUnit) && audit.coefficientUnit === audit.commodityUnit + '/Mt' && request.target.unit === audit.coefficientUnit, '参数单位记录不一致。');
  need(same(audit.sources, [{ role: 'steel', sha256: request.source.sha256 }, { role: 'commodity', sha256: request.commodity.sha256 }]), '来源记录与请求不一致。');
  need(audit.overlaySha256 === await steelSha256(new TextEncoder().encode(overlay.xml)), '参数XML哈希不一致。');
  need(audit.leafChanges === 1 && audit.sameVintageMayOperateInLaterYears === true, '参数写入范围记录不一致。');
  need(audit.scope === 'One explicit coefficient of one new vintage; not a whole-industry energy or technology-share target' && audit.loading === 'Append after all components that modify this node. This adapter does not validate the complete configuration or later overwrites.', '参数作用范围或加载边界不能改写。');
}

export async function createLinkedSteelExport(overlay, draft) {
  await assertParameterOutput(overlay);
  const cib = inspectSteelCibSelection({ ...draft, target: overlay.request.target });
  const archiveSha256 = await hash(cib.archive), configurationSha256 = await hash(cib.configuration), assumptionSha256 = await hash({ assumption: cib.assumption, regionCorrespondence: cib.regionCorrespondence });
  const origin = { archiveSha256, configurationSha256, assumptionSha256, runId: cib.archive.RunResult.id, descriptorId: cib.factor.descriptorId, stateId: cib.factor.stateId, selectedScenarioRechecked: true, enumerationCountIndependentlyRecomputed: false, reviewStatus: 'unreviewed', caseFilename: 'steel-cib-case.engineering.json' };
  const comment = `<!-- Engineering test only; CIB archive SHA256=${archiveSha256}; configuration SHA256=${configurationSha256}; assumption SHA256=${assumptionSha256}; mapping unreviewed; see ${origin.caseFilename} -->`;
  const xml = overlay.xml.replace('\n', '\n' + comment + '\n');
  const audit = { ...structuredClone(overlay.audit), cibConsistencyEvaluated: true, overlaySha256: await steelSha256(new TextEncoder().encode(xml)), cibOrigin: origin };
  const bundle = {
    format: STEEL_CIB_FORMAT, version: 1, testOnly: true, researchMappingApproved: false,
    cib, parameter: { xml, audit, request: structuredClone(overlay.request) },
    integrity: { archiveSha256, configurationSha256, assumptionSha256, modelXmlSha256: audit.overlaySha256, requestSha256: await hash(overlay.request) },
    boundary: 'CIB supports only the frozen scores and conditions. Parameter values and region correspondence are unreviewed user assumptions; source model files are not embedded or reverified when reopening this case.'
  };
  bundle.integrity.bundlePayloadSha256 = await hash(bundle);
  need(new TextEncoder().encode(JSON.stringify(bundle)).length <= 8 * 1024 * 1024, '关联留档超过8 MiB，请减少归档体积后重试。');
  return { ...overlay, xml, audit, cibBundle: bundle };
}

export async function verifySteelCibBundle(bundle) {
  need(object(bundle) && bundle.format === STEEL_CIB_FORMAT && bundle.version === 1 && bundle.testOnly === true && bundle.researchMappingApproved === false, '不是受支持的工程关联留档。');
  need(new TextEncoder().encode(JSON.stringify(bundle)).length <= 8 * 1024 * 1024, '关联留档超过8 MiB。');
  const value = structuredClone(bundle), declared = value.integrity?.bundlePayloadSha256;
  need(typeof declared === 'string', '缺少关联留档完整性记录。');
  delete value.integrity.bundlePayloadSha256;
  need(await hash(value) === declared, '留档内容或完整性哈希不一致。');
  const parameter = bundle.parameter, request = parameter.request;
  const xml = steelOverlayXml(request.target, calculateSteelCoefficient(request.target.expectedBaseline, request.operation));
  const audit = { ...structuredClone(parameter.audit), cibConsistencyEvaluated: false, overlaySha256: await steelSha256(new TextEncoder().encode(xml)) };
  delete audit.cibOrigin;
  const regenerated = await createLinkedSteelExport({ xml, audit, request }, {
    archive: bundle.cib.archive, configuration: bundle.cib.configuration, descriptorId: bundle.cib.factor.descriptorId,
    assumptionText: bundle.cib.assumption.text, regionNote: bundle.cib.regionCorrespondence.note
  });
  need(same(bundle, regenerated.cibBundle), '关联留档的情景、人工设定、节点、审计或XML不能重新对应。');
  return structuredClone(bundle);
}
