import test from 'node:test';
import assert from 'node:assert/strict';
import { mechanismProject } from './_probe/fixtures.mjs';
import { buildChain } from '../src/modules/chain/nodes.mjs';
import { prepareRun, solve } from '../src/modules/solver/engine.mjs';
import { changeYearState } from '../src/modules/elements/state-plan.mjs';

const ack = { currentAssumptions: true, unknownStateScope: true };
const byId = nodes => Object.fromEntries(nodes.map(n => [n.id, n]));

test('没有求解归档时，链不把后面的步骤点亮', () => {
  const p = mechanismProject();
  const nodes = byId(buildChain({ project: p, archive: null, fresh: false }));
  assert.equal(nodes.scope.status, 'ok');
  assert.equal(nodes.plan.status, 'gap');
  assert.equal(nodes.matrix.status, 'empty');
  assert.equal(nodes.solve.status, 'empty');
  assert.equal(nodes.explain.status, 'empty');
  assert.equal(nodes.export.status, 'empty');
});

test('冻结归档后求解、解释节点接通，数字来自该次输入', () => {
  let p = changeYearState(mechanismProject(), 'd2', 2030, 's22', () => 'x');
  const pre = prepareRun(p, { year: 2030, selectedJudgmentIds: p.data.judgments.map(j => j.id), assumptionAcknowledgements: ack });
  assert.ok(pre.input);
  const result = solve(pre.input, { displayLimit: 100 });
  const archive = { RunInput: pre.input, RunResult: result, selectionOfJudgments: p.data.judgments.map(j => ({ id: j.id, version: 1 })), projectInputSnapshot: p };
  const nodes = byId(buildChain({ project: p, archive, fresh: true }));
  assert.equal(nodes.matrix.status, 'ok');
  assert.equal(nodes.solve.status, 'ok');
  assert.equal(nodes.explain.status, 'ok');
  assert.match(nodes.solve.output[0], /检查 27 个，自洽 3 个/);
  assert.match(nodes.explain.output[1], /Γ = -2/);
});

test('输入改动过的归档标为过期，不冒充当前结论', () => {
  const p = mechanismProject();
  const pre = prepareRun(p, { year: 2030, selectedJudgmentIds: p.data.judgments.map(j => j.id), assumptionAcknowledgements: ack });
  const archive = { RunInput: pre.input, RunResult: solve(pre.input, { displayLimit: 10 }), selectionOfJudgments: [], projectInputSnapshot: p };
  const nodes = byId(buildChain({ project: p, archive, fresh: false }));
  assert.equal(nodes.matrix.status, 'stale');
  assert.equal(nodes.solve.status, 'stale');
});
