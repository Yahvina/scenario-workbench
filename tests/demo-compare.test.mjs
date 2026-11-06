import test from 'node:test';
import assert from 'node:assert/strict';
import {comparePlans, compareRuns} from '../src/modules/exports/compare.mjs';

// 夹具按真实形状构造；分数 0 是「没关系」，null 是「未判断」，两者在本文件里必须分开。
function project(overrides = {}) {
  const base = {
    schemaVersion: 1, contractVersion: '1.0.0', id: 'proj-demo', title: '机制示例项目', revision: 7,
    scope: {regionId: '示例地区（非真实政策）', years: [2030, 2035]},
    data: {
      descriptors: [{id: 'A', label: '示例投入', role: 'input'}, {id: 'B', label: '示例产出', role: 'outcome'}],
      states: [
        {id: 'A0', label: '低投入', descriptorId: 'A'},
        {id: 'A1', label: '高投入', descriptorId: 'A'},
        {id: 'B0', label: '低产出', descriptorId: 'B'},
        {id: 'B1', label: '高产出', descriptorId: 'B'}
      ],
      judgments: [{
        id: 'j-1', version: 2, sourceDescriptorId: 'A', targetDescriptorId: 'B',
        entries: [{sourceStateId: 'A1', targetStateId: 'B1', score: 2}]
      }],
      evidence: [], paths: [], mappings: []
    },
    selection: {descriptorIds: ['A', 'B'], stateIds: ['A1'], lockedStateIds: [], nodeIds: []}
  };
  return {...base, ...overrides};
}

const plan = (name, projectValue) => ({name, project: projectValue});

function archive({revision = 7, year = 2030, judged = 4, required = 4, missing = [], status = 'completed', count = 2, selection = [{id: 'j-1', version: 2, evidenceRefs: []}]} = {}) {
  return {
    archiveVersion: 1,
    RunInput: {
      projectId: 'proj-demo', revision, year, scope: {regionId: '示例地区（非真实政策）'},
      activeDescriptorIds: ['A', 'B'], lockedStateIds: [],
      matrix: {descriptorIds: ['A', 'B'], stateIdsByDescriptor: {A: ['A0', 'A1'], B: ['B0', 'B1']}, coverage: {required, judged, missingPairs: missing}},
      stateDefinitions: [], engineVersion: 'fixture-1'
    },
    RunResult: status === null ? null : {id: 'run-fixture', status, checked: judged, count, scenarios: [], truncated: false, diagnostics: []},
    projectInputSnapshot: {schemaVersion: 1, contractVersion: '1.0.0', id: 'proj-demo', title: '机制示例项目', revision, view: {}, scope: {regionId: '示例地区（非真实政策）', years: [2030, 2035]}, data: {descriptors: [], states: [], judgments: [], evidence: [], paths: [], mappings: []}, selection: {descriptorIds: ['A', 'B'], stateIds: ['A1'], lockedStateIds: [], nodeIds: []}},
    preflightDiagnostics: [],
    assumptionAcknowledgements: {currentAssumptions: true, unknownStateScope: true},
    selectionOfJudgments: selection
  };
}

const run = (name, archiveValue) => ({name, archive: archiveValue});

test('two plans differing in one judgment score produce a changed row labelled in Chinese', () => {
  const leftProject = project();
  const rightProject = project();
  rightProject.data.judgments[0].entries[0].score = -1;
  const result = comparePlans({left: plan('方案甲', leftProject), right: plan('方案乙', rightProject)});
  const changed = result.rows.filter(row => !row.same);
  const scoreRow = result.rows.find(row => row.label.includes('示例投入·高投入 → 示例产出·高产出'));
  assert.ok(scoreRow, result.rows.map(row => row.label).join('\n'));
  assert.equal(scoreRow.same, false);
  assert.equal(scoreRow.leftText, '2');
  assert.equal(scoreRow.rightText, '-1');
  assert.ok(result.rows.some(row => row.label === '项目标题' && row.same));
  assert.ok(result.summary.includes('不同'));
  assert.ok(changed.length >= 1);
});

test('score 0 and an absent judgment are not the same', () => {
  const zeroProject = project();
  zeroProject.data.judgments[0].entries = [{sourceStateId: 'A1', targetStateId: 'B1', score: 0}];
  const absentProject = project();
  absentProject.data.judgments = [];
  const result = comparePlans({left: plan('零分方案', zeroProject), right: plan('未判断方案', absentProject)});
  const isPairRow = item => item.label.includes('高投入') && item.label.includes('高产出');
  const row = result.rows.find(isPairRow);
  assert.ok(row, result.rows.map(item => item.label).join('\n'));
  assert.equal(row.same, false);
  assert.equal(row.leftText, '0');
  assert.equal(row.rightText, '未判断');
  // null 与「整条判断缺失」都读作未判断，彼此相同。
  const nullProject = project();
  nullProject.data.judgments[0].entries = [{sourceStateId: 'A1', targetStateId: 'B1', score: null}];
  const nullVsAbsent = comparePlans({left: plan('空分方案', nullProject), right: plan('未判断方案', absentProject)});
  const nullRow = nullVsAbsent.rows.find(isPairRow);
  assert.equal(nullRow.same, true);
  assert.equal(nullRow.leftText, '未判断');
  assert.equal(nullRow.rightText, '未判断');
});

test('plan comparison exposes raw ids separately from the displayed labels', () => {
  const leftProject = project();
  const rightProject = project({title: '另一个标题'});
  rightProject.selection.stateIds = [];
  const result = comparePlans({left: plan('甲', leftProject), right: plan('乙', rightProject)});
  const focus = result.rows.find(row => row.label.startsWith('关注状态·'));
  assert.ok(focus.leftText.includes('高投入'));
  assert.equal(focus.leftId, 'A1');
  assert.equal(focus.rightId, '');
  assert.equal(focus.rightText, '未选');
  const descriptors = result.rows.find(row => row.label === '活动因素');
  assert.equal(descriptors.leftId, 'A,B');
});

test('two runs with different counts are changed, and count 0 stays a real zero', () => {
  const result = compareRuns({left: run('归档甲', archive({count: 2})), right: run('归档乙', archive({count: 0}) )});
  const countRow = result.rows.find(row => row.label.startsWith('成立数'));
  assert.equal(countRow.leftText, '2');
  assert.equal(countRow.rightText, '0');
  assert.equal(countRow.same, false);
  assert.equal(result.historicallyNotRecomputed, true);
  assert.ok(result.summary.includes('历史声明'));
});

test('a run with count === null renders 未定 and never 0', () => {
  const blocked = archive({status: 'blocked', count: null, judged: 0, required: 4, missing: [{sourceStateId: 'A1', targetStateId: 'B1'}]});
  const result = compareRuns({left: run('已完成', archive({count: 2})), right: run('被阻断', blocked)});
  const countRow = result.rows.find(row => row.label.startsWith('成立数'));
  assert.equal(countRow.rightText, '未定（未完成，不是 0）');
  assert.notEqual(countRow.rightText, '0');
  const statusRow = result.rows.find(row => row.label.startsWith('检算状态'));
  assert.equal(statusRow.rightText, '阻断');
  const missingRow = result.rows.find(row => row.label.startsWith('未判断单元'));
  assert.equal(missingRow.rightText, '1');
});

test('a run with RunResult === null reads 未开始 and 未定', () => {
  const result = compareRuns({left: run('无结果', archive({status: null})), right: run('已完成', archive({count: 1}))});
  const statusRow = result.rows.find(row => row.label.startsWith('检算状态'));
  assert.equal(statusRow.leftText, '未开始（没有 RunResult）');
  const countRow = result.rows.find(row => row.label.startsWith('成立数'));
  assert.equal(countRow.leftText, '未定（未开始，不是 0）');
});

test('run comparison reports frozen revisions, year, coverage and selection versions separately', () => {
  const result = compareRuns({
    left: run('甲', archive({revision: 7, year: 2030, selection: [{id: 'j-1', version: 2, evidenceRefs: []}]})),
    right: run('乙', archive({revision: 8, year: 2035, selection: [{id: 'j-1', version: 3, evidenceRefs: []}]}))
  });
  assert.equal(result.rows.find(row => row.label.startsWith('冻结修订')).same, false);
  assert.equal(result.rows.find(row => row.label.startsWith('检算年份')).same, false);
  const selectionRow = result.rows.find(row => row.label === '选用判断 j-1');
  assert.equal(selectionRow.leftText, 'v2');
  assert.equal(selectionRow.rightText, 'v3');
  assert.equal(selectionRow.same, false);
});

test('structurally invalid input throws a Chinese error instead of guessing', () => {
  assert.throws(() => comparePlans({left: plan('甲', project())}), /缺少对比对象/);
  assert.throws(() => comparePlans({left: {name: '甲'}, right: plan('乙', project())}), /缺少方案项目/);
  assert.throws(() => compareRuns({left: run('甲', archive()), right: {name: '乙'}}), /缺少冻结归档/);
});

test('different shapes still return rows rather than throwing', () => {
  const odd = comparePlans({left: plan('甲', {title: '甲'}), right: plan('乙', project())});
  assert.ok(odd.rows.length > 0);
  const oddRuns = compareRuns({left: run('甲', {archiveVersion: 1, projectInputSnapshot: {}, RunResult: null}), right: run('乙', archive())});
  assert.ok(oddRuns.rows.length > 0);
  assert.ok(oddRuns.rows.every(row => typeof row.leftText === 'string' && typeof row.rightText === 'string'));
});
