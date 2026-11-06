import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReport, reportToMarkdown, REPORT_FILENAME} from '../src/modules/exports/report.mjs';

// 夹具按真实封套形状构造：projectInputSnapshot 是冻结项目副本，RunInput/RunResult 是求解输入与结果。
// 数值全部是夹具自造的机制示例，不代表任何真实政策或统计口径。
function fixtureProject(overrides = {}) {
  const project = {
    schemaVersion: 1, contractVersion: '1.0.0', id: 'proj-demo', title: '机制示例项目', revision: 7,
    view: {perspective: 'public', module: 'workspace', objectId: null},
    scope: {regionId: '示例地区（非真实政策）', years: [2030, 2035]},
    data: {
      descriptors: [
        {id: 'A', label: '示例投入', role: 'input', stateIds: ['A0', 'A1']},
        {id: 'B', label: '示例产出', role: 'outcome', stateIds: ['B0', 'B1']}
      ],
      states: [
        {id: 'A0', label: '低投入', descriptorId: 'A', range: {min: 0, max: 50, minInclusive: true, maxInclusive: false}, unit: '示例单位', scope: {regionId: '示例地区（非真实政策）'}, validYears: [2030, 2035]},
        {id: 'A1', label: '高投入', descriptorId: 'A', range: {min: 50, max: 100, minInclusive: true, maxInclusive: true}, unit: '示例单位', scope: {regionId: '示例地区（非真实政策）'}, validYears: [2030, 2035]},
        {id: 'B0', label: '低产出', descriptorId: 'B', range: {min: 0, max: 50, minInclusive: true, maxInclusive: false}, unit: '示例单位', scope: {regionId: '示例地区（非真实政策）'}, validYears: [2030, 2035]},
        {id: 'B1', label: '高产出', descriptorId: 'B', range: {min: 50, max: 100, minInclusive: true, maxInclusive: true}, unit: '示例单位', scope: {regionId: '示例地区（非真实政策）'}, validYears: [2030, 2035]}
      ],
      judgments: [{id: 'j-1', version: 2, sourceDescriptorId: 'A', targetDescriptorId: 'B', entries: [{sourceStateId: 'A0', targetStateId: 'B0', score: 1}], scope: {regionId: '示例地区（非真实政策）'}, validYears: [2030, 2035], directness: 'direct', reviewStatus: 'draft', rationale: '夹具', alternatives: [], evidenceRefs: [], curveEncoding: null}],
      paths: [], evidence: [], mappings: [], policies: [], taxonomy: []
    },
    selection: {nodeIds: [], descriptorIds: ['A', 'B'], stateIds: ['A1'], lockedStateIds: []}
  };
  return {...project, ...overrides};
}

// completed：真计数 2；coverage 完整（4 个有序状态对）。
function completedArchive({count = 2} = {}) {
  const snapshot = fixtureProject();
  return {
    archiveVersion: 1,
    RunInput: {
      projectId: 'proj-demo', revision: 7, year: 2030, scope: {regionId: '示例地区（非真实政策）', years: [2030, 2035]},
      activeDescriptorIds: ['A', 'B'], lockedStateIds: [],
      matrix: {descriptorIds: ['A', 'B'], stateIdsByDescriptor: {A: ['A0', 'A1'], B: ['B0', 'B1']}, scoresByPair: {}, coverage: {required: 4, judged: 4, missingPairs: []}},
      stateDefinitions: snapshot.data.states.map(s => ({id: s.id, label: s.label, descriptorId: s.descriptorId, version: 1, scope: s.scope, validYears: s.validYears})),
      engineVersion: 'fixture-1'
    },
    RunResult: {
      id: 'run-fixture', inputSnapshot: null, status: 'completed', checked: 4, count,
      scenarios: [{A: 'A1', B: 'B1'}, {A: 'A1', B: 'B0'}], truncated: false,
      diagnostics: []
    },
    projectInputSnapshot: snapshot,
    preflightDiagnostics: [{code: 'DRAFT_JUDGMENT', message: '采用的是草案判断，未经确认', classification: 'warning'}],
    assumptionAcknowledgements: {currentAssumptions: true, unknownStateScope: true},
    selectionOfJudgments: [{id: 'j-1', version: 2, evidenceRefs: []}]
  };
}

const allText = report => report.sections.flatMap(section => section.lines).join('\n')
  + '\n' + (report.sections.flatMap(section => section.table?.rows ?? []).map(row => row.join(' ')).join('\n'));

test('completed archive prints the real count and its provenance, and reports no staleness', () => {
  const project = fixtureProject();
  const report = buildReport({project, archive: completedArchive({count: 2}), generatedAt: '2026-11-05T01:00:00Z'});
  assert.equal(report.title, '机制示例项目 情景报告');
  assert.equal(report.stale, false);
  const result = report.sections.find(section => section.id === 'result');
  assert.equal(result.source, '本次检算结果（状态、成立数、已检查数、是否截断、诊断）');
  assert.ok(result.lines.some(line => line.includes('成立数：2')), result.lines.join('\n'));
  assert.ok(!result.lines.some(line => line.includes('未定（')), result.lines.join('\n'));
  const scope = report.sections.find(section => section.id === 'scope');
  assert.ok(scope.lines.includes('研究地区：示例地区（非真实政策）'));
  assert.ok(scope.lines.some(line => line.startsWith('研究年份：') && line.includes('2030、2035')), scope.lines.join('\n'));
  assert.ok(scope.lines.includes('冻结修订：第 7 版'));
  const definitions = report.sections.find(section => section.id === 'definitions');
  assert.ok(definitions.table.rows.some(row => row[0].includes('示例投入') && row[1].includes('低投入')));
  const markdown = reportToMarkdown(report);
  assert.match(markdown, /^# 机制示例项目 情景报告/m);
  assert.match(markdown, /成立数：2/);
  assert.match(markdown, /来源：冻结的项目范围记录/);
  assert.equal(REPORT_FILENAME, '情景报告.md');
  assert.ok(markdown.endsWith('\n'));
});

test('count === null never renders 0 and lands in gaps', () => {
  const archive = completedArchive();
  archive.RunResult.status = 'failed';
  archive.RunResult.count = null;
  const report = buildReport({project: fixtureProject(), archive});
  const text = allText(report);
  assert.ok(text.includes('成立数：未定'), text);
  assert.ok(!text.includes('成立数：0'), text);
  assert.ok(report.gaps.some(gap => gap.includes('未定') && gap.includes('0 解')));
});

test('a blocked archive with RunResult === null reports 未开始/未定, never a number', () => {
  const archive = completedArchive();
  archive.RunInput = null;
  archive.RunResult = null;
  const report = buildReport({project: fixtureProject(), archive});
  const text = allText(report);
  assert.ok(text.includes('检算状态：未开始'));
  assert.ok(text.includes('未定不等于 0'));
  assert.ok(!text.includes('成立数：0'));
  assert.ok(report.gaps.some(gap => gap.includes('成立数未定')));
  assert.ok(report.gaps.some(gap => gap.includes('矩阵覆盖记录')));
});

test('a live project that drifted from the snapshot sets stale with an honest note', () => {
  const archive = completedArchive();
  const drifted = fixtureProject({revision: 8});
  drifted.data.states[0].label = '改过的低投入';
  const report = buildReport({project: drifted, archive, generatedAt: '2026-11-05T01:00:00Z'});
  assert.equal(report.stale, true);
  assert.ok(report.staleNote.includes('归档已过期'));
  assert.ok(report.staleNote.includes('修订号 8 与快照 7 不一致'));
  assert.ok(report.staleNote.includes('科学数据已变化'));
  // 报告正文仍读冻结快照的标签，不读当前项目被改过的标签。
  const definitions = report.sections.find(section => section.id === 'definitions');
  assert.ok(definitions.table.rows.some(row => row[1].includes('低投入')));
  assert.ok(!allText(report).includes('改过的低投入'));
});

test('missing pairs are reported as a count and never filled with 0', () => {
  const archive = completedArchive();
  archive.RunInput.matrix.coverage = {required: 4, judged: 3, missingPairs: [{sourceStateId: 'A1', targetStateId: 'B1'}]};
  const report = buildReport({project: fixtureProject(), archive});
  const coverage = report.sections.find(section => section.id === 'coverage');
  assert.ok(coverage.lines.includes('未判断单元：1（未判断不补 0，也不进入检算）'), coverage.lines.join('\n'));
  assert.ok(report.gaps.some(gap => gap.includes('1 个未判断单元')));
  assert.ok(!allText(report).includes('未判断单元：0'));
});

test('omitting the live project marks staleness as unknown rather than silently fresh', () => {
  const report = buildReport({archive: completedArchive()});
  assert.equal(report.stale, null);
  assert.ok(report.staleNote.includes('未提供当前项目'));
});

test('structurally invalid input throws a Chinese error', () => {
  assert.throws(() => buildReport({project: fixtureProject()}), /缺少冻结归档/);
  assert.throws(() => buildReport({archive: {}}), /缺少 projectInputSnapshot/);
  assert.throws(() => buildReport({archive: {projectInputSnapshot: {data: {}}}}), /缺少 factors\/states/);
});
