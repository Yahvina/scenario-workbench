'use strict';
// 周五演示 P5–P9 的共享夹具：一个示例项目 + 一个本地历史库（两份方案、两份归档）。
// 只用真实的契约校验与真实的求解引擎构造，封套字段一律由 saved-work/引擎产出，不手写；
// 任何一处不合契约都必须在这里当场抛错，而不是等到浏览器里才表现为一屏空白。
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

const REGION = '示例地区（非真实政策）';
const base = { version: 1, provenance: { origin: 'fixture', sourceId: 'demo-p5p9', locator: 'tests/demo-paths-browser.cjs' } };
const rng = (min, max, minInclusive = true, maxInclusive = true) => min === null ? null : { min, max, minInclusive, maxInclusive };
const STATE_IDS = { A: ['A-0', 'A-1'], B: ['B-0', 'B-1'], D01: ['D01-0', 'D01-1'] };
const statesOf = descriptorId => STATE_IDS[descriptorId];

const descriptor = (id, label) => ({ ...base, id, label, role: 'input', stateIds: statesOf(id), evidenceRefs: [] });
const state = (id, label, range) => ({
  ...base, id, descriptorId: id.replace(/-\d+$/, ''), label, range,
  unit: '示例单位', scope: { regionId: REGION }, validYears: [2030, 2035], evidenceRefs: []
});

// 两个方向各一条判断，分数表按「行=源状态、列=目标状态」铺开。
function judgment(id, sourceDescriptorId, targetDescriptorId, scores) {
  const entries = statesOf(sourceDescriptorId).flatMap((sourceStateId, i) =>
    statesOf(targetDescriptorId).map((targetStateId, k) => ({ sourceStateId, targetStateId, score: scores[i * 2 + k] })));
  return {
    ...base, id, sourceDescriptorId, targetDescriptorId, entries,
    scope: { regionId: REGION }, validYears: [2030, 2035], directness: 'direct',
    curveEncoding: null, alternatives: [], rationale: '演示用假设，非真实政策依据',
    reviewStatus: 'draft', evidenceRefs: []
  };
}

const pathRecord = {
  ...base, id: 'path-a', descriptorId: 'A', unit: '示例指数', scope: { regionId: REGION },
  interpolation: 'linear',
  // 2030 没有锚点，基线由 2026=20 与 2035=70 线性插值得到 46.6667。
  points: [
    { year: 2026, value: 20, stateId: 'A-0', origin: 'user-assumption', evidenceRefs: [] },
    { year: 2035, value: 70, stateId: 'A-1', origin: 'user-assumption', evidenceRefs: [] }
  ],
  evidenceRefs: []
};

function buildProject(contractVersion) {
  return {
    schemaVersion: 1,
    contractVersion,
    id: 'demo-p5p9',
    title: '周五演示示例项目（非真实政策）',
    revision: 0,
    view: { perspective: 'public', module: 'workspace', objectId: null },
    scope: { regionId: REGION, years: [2026, 2030, 2035] },
    selection: { nodeIds: [], descriptorIds: ['A', 'B'], stateIds: [], lockedStateIds: [] },
    data: {
      policies: [],
      taxonomy: [],
      // D01 是 P9 模型输入面板要求的编号/名称对；它不在活动变量里，也不参与检算。
      descriptors: [descriptor('A', '示例变量A'), descriptor('B', '示例变量B'), descriptor('D01', '经济增长速度')],
      states: [
        state('A-0', '示例低档', rng(0, 60, true, false)),
        state('A-1', '示例高档', rng(60, 100, true, true)),
        state('B-0', '示例低档', rng(0, 60, true, false)),
        state('B-1', '示例高档', rng(60, 100, true, true)),
        state('D01-0', '高速', null),
        state('D01-1', '中速', null)
      ],
      paths: [pathRecord],
      judgments: [judgment('A->B', 'A', 'B', [1, -1, -1, 1]), judgment('B->A', 'B', 'A', [1, -1, -1, 1])],
      evidence: [],
      mappings: []
    }
  };
}

let demoProject = null;
let demoBundle = null;

const ready = (async () => {
  const V = await import(pathToFileURL(path.join(root, 'src/core/contracts.mjs')).href);
  const sw = await import(pathToFileURL(path.join(root, 'src/modules/workspace/saved-work.mjs')).href);
  const E = await import(pathToFileURL(path.join(root, 'src/modules/solver/engine.mjs')).href);

  const project = buildProject(V.CONTRACT_VERSION);
  V.validateProject(project);

  const acknowledgements = { currentAssumptions: true, unknownStateScope: true };
  const selectedJudgmentIds = project.data.judgments.map(j => j.id);
  const snapshot = () => ({
    // title 是 report.mjs:86-87 读的那个字段（快照标题），不带它时报告标题会退回项目标识；
    // 带上它，P5 下载到的 Markdown 才真的写出这个项目名。其余字段与引擎的 currentSnapshot 一致。
    schemaVersion: project.schemaVersion, contractVersion: project.contractVersion, projectId: project.id,
    title: project.title,
    revision: project.revision, scope: structuredClone(project.scope),
    data: structuredClone(project.data), selection: structuredClone(project.selection)
  });

  function archiveFor(year) {
    const pre = E.prepareRun(project, { year, selectedJudgmentIds, assumptionAcknowledgements: acknowledgements });
    if (!pre.input) throw new Error('夹具无法为 ' + year + ' 年构造有效输入：' + JSON.stringify(pre.diagnostics));
    return {
      archiveVersion: 1,
      RunInput: pre.input,
      RunResult: E.solve(pre.input),
      projectInputSnapshot: snapshot(),
      preflightDiagnostics: pre.diagnostics,
      assumptionAcknowledgements: structuredClone(acknowledgements),
      selectionOfJudgments: project.data.judgments.map(j => ({ id: j.id, version: j.version, evidenceRefs: structuredClone(j.evidenceRefs) }))
    };
  }

  // 方案乙：只把 A->B 的第 3 条状态对（示例高档 → 示例高档）由 1 改成 -1，
  // 于是方案比较恰好有两行不同（关注状态，和这一条评分）。
  const project2 = structuredClone(project);
  project2.data.judgments.find(j => j.id === 'A->B').entries[3].score = -1;

  const bundle = {
    format: 'scenario-workbench.saved-work',
    archiveVersion: 1,
    plans: [
      sw.namedPlan(project, '演示方案甲', { A: 'A-0' }, 'demo-plan-1'),
      sw.namedPlan(project2, '演示方案乙', {}, 'demo-plan-2')
    ],
    runs: [
      sw.savedRun(archiveFor(2030), '演示归档甲（2030）', 'demo-run-1'),
      sw.savedRun(archiveFor(2035), '演示归档乙（2035）', 'demo-run-2')
    ]
  };
  sw.validateBundle(bundle);

  demoProject = project;
  demoBundle = bundle;
  return { demoProject, demoBundle };
})();

function summary() {
  return {
    title: demoProject.title,
    region: demoProject.scope.regionId,
    years: demoProject.scope.years,
    plans: demoBundle.plans.map(p => p.id + ':' + p.name),
    runs: demoBundle.runs.map(r => r.id + ':' + r.name + ':' + r.archive.RunResult.status
      + ':' + r.archive.RunResult.count + '/' + r.archive.RunResult.checked)
  };
}

module.exports = {
  // 构建是异步的（真实模块按 ESM 动态导入）；等待 ready 之后再读这两个字段。
  get demoProject() { return demoProject; },
  get demoBundle() { return demoBundle; },
  ready,
  summary,
  build: async () => { await ready; return { demoProject, demoBundle }; }
};

if (require.main === module) {
  ready
    .then(() => { console.log('fixture ok: ' + JSON.stringify(summary())); })
    .catch(error => { console.error(error); process.exitCode = 1; });
}
