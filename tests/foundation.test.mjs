import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProjectStore } from '../src/core/project-store.mjs';
import { createActions } from '../src/core/actions.mjs';
import { validateProject } from '../src/core/contracts.mjs';
import { validateModulePlan, resolveEnabledModules } from '../src/core/module-registry.mjs';
import { createDemoProject } from '../src/fixtures/demo.mjs';

const demoStore = () => createProjectStore('demo', createDemoProject());

test('perspective switching retains selected variables and current scientific snapshot', () => {
  const store = demoStore();
  const before = store.snapshot();
  store.setView({ perspective: 'expert', module: 'relationships', objectId: 'descriptor-a' });
  assert.deepEqual(store.snapshot(), before);
  assert.equal(store.isCurrent(before), true);
});

test('path edits invalidate old input while preserving original values and provenance', () => {
  const store = demoStore(), before = store.snapshot();
  const point = structuredClone(before.data.paths[0].points[0]);
  point.value = 30;
  const result = createActions(store).editPathPoint({ pathId: 'path-a', pointIndex: 0, point });
  assert.equal(result.ok, true);
  assert.equal(store.isCurrent(before), false);
  assert.equal(before.data.paths[0].points[0].value, 20);
  assert.equal(store.read().data.paths[0].version, 2);
});

test('invalid joint title/scope save is atomic and reports structured error', () => {
  const store = demoStore(), before = store.read();
  const result = createActions(store).updateProjectDetails({ title: 'must not save', scope: { regionId: null, years: [2030.5] } });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_PROJECT');
  assert.deepEqual(store.read(), before);
});

test('source and returned objects cannot mutate the store; title and no-op saves keep revision', () => {
  const input = createDemoProject(), store = createProjectStore('fixture', input);
  input.title = 'changed';
  store.read().data.descriptors[0].label = 'changed again';
  const before = store.snapshot();
  store.updateProjectDetails({ title: 'renamed', scope: store.read().scope });
  store.setSelection(store.read().selection);
  assert.equal(store.isCurrent(before), true);
  assert.equal(store.read().data.descriptors[0].label, '示例变量A');
});

test('imported same-id/revision with changed content cannot reuse old snapshot', () => {
  const store = demoStore(), before = store.snapshot();
  const replacement = store.read();
  replacement.scope.years = [2040];
  store.replaceProject(replacement);
  assert.equal(store.isCurrent(before), false);
  assert.equal(store.read().revision, before.revision + 1);
});

test('subscription receives isolated committed state and can unsubscribe', () => {
  const store = demoStore(), seen = [];
  const dispose = store.subscribe(project => { seen.push(project); project.title = 'listener mutation'; });
  store.setView({ perspective: 'expert' });
  dispose();
  store.setView({ perspective: 'public' });
  assert.equal(seen.length, 1);
  assert.notEqual(store.read().title, 'listener mutation');
});

test('fixtures have six levels plus independent branch and pass cross-reference validation', () => {
  const p = createDemoProject();
  assert.equal(validateProject(p), true);
  let count = 1, node = p.data.taxonomy[0];
  while (node.childIds[0]) { count++; node = p.data.taxonomy.find(item => item.id === node.childIds[0]); }
  assert.equal(count, 6);
  assert.equal(p.data.evidence[0].kind, 'fixture');
  assert.deepEqual(p.selection.descriptorIds, ['descriptor-a', 'descriptor-b']);
});

test('cyclic taxonomy is rejected even with symmetric links', () => {
  const p = createDemoProject();
  p.data.taxonomy[5].childIds.push('node-1');
  p.data.taxonomy[0].parentIds.push('node-6');
  assert.throws(() => validateProject(p), /循环/);
});

test('missing evidence and dangling mapped variables are rejected without partial write', () => {
  const store = demoStore(), before = store.read();
  assert.throws(() => store.setData('evidence', []));
  assert.throws(() => store.setSelection({ descriptorIds: ['missing'] }));
  assert.deepEqual(store.read(), before);
});

test('zero and unjudged scores are kept distinct; invalid strength is rejected', () => {
  const store = demoStore();
  const judgment = { id: 'a-b', version: 1, provenance: { origin: 'user' }, sourceDescriptorId: 'descriptor-a', targetDescriptorId: 'descriptor-b', entries: [{ sourceStateId: 'a-low', targetStateId: 'b-low', score: 0 }, { sourceStateId: 'a-low', targetStateId: 'b-high', score: null }], evidenceRefs: [] };
  store.setData('judgments', [judgment]);
  assert.deepEqual(store.read().data.judgments[0].entries.map(entry => entry.score), [0, null]);
  judgment.entries[0].score = 4;
  assert.throws(() => store.setData('judgments', [judgment]));
  judgment.entries[0].score = 0;
  judgment.entries[1].targetStateId = 'a-high';
  assert.throws(() => store.setData('judgments', [judgment]));
});

test('path years must be ordered and state must belong to the same descriptor', () => {
  const store = demoStore(), paths = store.read().data.paths;
  paths[0].points[1].year = 2026;
  assert.throws(() => store.setData('paths', paths));
  paths[0].points[1].year = 2035;
  paths[0].points[1].stateId = 'b-high';
  assert.throws(() => store.setData('paths', paths));
});

test('version mismatch and duplicate years cannot replace a valid project', () => {
  const store = demoStore(), original = store.read(), p = store.read();
  p.contractVersion = '2.0.0';
  assert.equal(createActions(store).replaceProject(p).ok, false);
  p.contractVersion = '1.0.0';
  p.scope.years = [2030, 2030];
  assert.equal(createActions(store).replaceProject(p).ok, false);
  assert.deepEqual(store.read(), original);
});

test('removed active descriptor cannot retain its locked state; coherent removal succeeds', () => {
  const store = demoStore();
  store.setSelection({ lockedStateIds: ['a-high'] });
  assert.throws(() => store.setSelection({ descriptorIds: ['descriptor-b'] }));
  store.setSelection({ nodeIds: ['node-peer'], descriptorIds: ['descriptor-b'], lockedStateIds: [] });
  assert.deepEqual(store.read().selection.descriptorIds, ['descriptor-b']);
});

test('registry rejects missing dependencies and cycles; closure includes required modules', async () => {
  const item = (id, requires) => ({ id, requires, status: 'planned', perspectives: ['expert'] });
  assert.throws(() => validateModulePlan([item('a', ['missing'])]));
  assert.throws(() => validateModulePlan([item('a', ['b']), item('b', ['a'])]));
  const modules = JSON.parse(await readFile(new URL('../modules.json', import.meta.url), 'utf8'));
  assert.equal(validateModulePlan(modules), true);
  const selected = resolveEnabledModules(modules, ['exports']);
  assert.ok(selected.some(item => item.id === 'solver'));
  assert.ok(selected.some(item => item.id === 'workspace'));
  assert.equal(modules.find(item => item.id === 'workspace').status, 'implemented');
});
