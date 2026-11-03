import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoProject } from '../src/fixtures/demo.mjs';
import { createProjectStore } from '../src/core/project-store.mjs';
import { createActions } from '../src/core/actions.mjs';
import { resolveSelection, visibleRows } from '../src/modules/elements/selection.mjs';

test('six then seven levels; expansion and search independent of scientific input', () => {
  const p = createDemoProject(), store = createProjectStore(p.id, p);
  const snapshot = store.snapshot(), expanded = new Set();
  assert.equal(visibleRows(p.data.taxonomy, expanded).length, 1);
  for (let i = 1; i <= 6; i++) expanded.add('node-' + i);
  assert.equal(Math.max(...visibleRows(p.data.taxonomy, expanded).map(row => row.depth)), 6);
  const seventh = structuredClone(p.data.taxonomy[5]);
  seventh.id = 'node-7'; seventh.parentIds = ['node-6']; seventh.label = '很长的中文分类名称'.repeat(20);
  p.data.taxonomy[5].childIds = ['node-7']; p.data.taxonomy.push(seventh);
  assert.equal(Math.max(...visibleRows(p.data.taxonomy, expanded).map(row => row.depth)), 7);
  assert.equal(visibleRows(p.data.taxonomy, new Set(), seventh.label).length, 7);
  assert.equal(visibleRows(p.data.taxonomy, expanded, '不存在').length, 0);
  assert.equal(store.isCurrent(snapshot), true);
});
test('coarse unmapped selection and mixed-depth direct mappings', () => {
  const p = createDemoProject();
  assert.deepEqual(resolveSelection(p, ['node-1']).descriptorIds, []);
  assert.deepEqual(resolveSelection(p, ['node-6', 'node-peer']).descriptorIds, ['descriptor-a', 'descriptor-b']);
  p.data.taxonomy[0].descriptorIds = ['descriptor-a'];
  assert.deepEqual(resolveSelection(p, ['node-1', 'node-6', 'node-6']).descriptorIds, ['descriptor-a']);
  assert.deepEqual(resolveSelection(p, ['node-1', 'node-6']).nodeIds, ['node-1', 'node-6']);
});
test('removal atomically cleans states and locks; snapshot expires, views preserve input', () => {
  const p = createDemoProject();
  p.selection.stateIds = ['a-low', 'b-low']; p.selection.lockedStateIds = ['a-high', 'b-high'];
  const store = createProjectStore(p.id, p), actions = createActions(store), snapshot = store.snapshot();
  const selection = resolveSelection(store.read(), ['node-peer']);
  assert.equal(actions.selectElements(selection).ok, true);
  assert.deepEqual(store.read().selection, { nodeIds: ['node-peer'], descriptorIds: ['descriptor-b'], stateIds: ['b-low'], lockedStateIds: ['b-high'] });
  assert.equal(store.isCurrent(snapshot), false);
  const revision = store.read().revision;
  store.setView({ perspective: 'expert' });
  assert.equal(store.read().revision, revision);
  assert.deepEqual(store.read().selection, selection);
  actions.selectElements(resolveSelection(store.read(), []));
  assert.deepEqual(store.read().selection, { nodeIds: [], descriptorIds: [], stateIds: [], lockedStateIds: [] });
});
test('DAG shared node appears via both parents, selection stays unique', () => {
  const p = createDemoProject();
  p.data.taxonomy[6].childIds.push('node-6'); p.data.taxonomy[5].parentIds.push('node-peer');
  const store = createProjectStore(p.id, p);
  const rows = visibleRows(p.data.taxonomy, new Set(p.data.taxonomy.map(n => n.id)));
  assert.equal(rows.filter(row => row.node.id === 'node-6').length, 2);
  assert.equal(new Set(rows.map(row => row.key)).size, rows.length);
  assert.deepEqual(resolveSelection(store.read(), ['node-6', 'node-6']).descriptorIds, ['descriptor-a']);
});
test('empty and missing-state data remain honest; invalid graphs rejected atomically', () => {
  assert.deepEqual(visibleRows([], new Set()), []);
  const p = createDemoProject(); p.data.descriptors[0].stateIds = []; p.data.states = p.data.states.filter(s => s.descriptorId !== 'descriptor-a'); p.data.paths = [];
  const store = createProjectStore(p.id, p), actions = createActions(store), before = store.read();
  assert.deepEqual(resolveSelection(before, ['node-6']).descriptorIds, ['descriptor-a']);
  for (const cyclic of [false, true]) {
    const invalid = structuredClone(before);
    if (cyclic) { invalid.data.taxonomy[5].childIds.push('node-1'); invalid.data.taxonomy[0].parentIds.push('node-6'); }
    else invalid.data.taxonomy[0].childIds = [];
    assert.equal(actions.replaceProject(invalid).ok, false);
    assert.deepEqual(store.read(), before);
  }
});

test('DAG focus paths stay distinct when stable IDs themselves contain slashes', () => {
  const taxonomy = [
    { id: 'a/b', label: 'root 1', parentIds: [], childIds: ['c'] },
    { id: 'c', label: 'child 1', parentIds: ['a/b'], childIds: [] },
    { id: 'a', label: 'root 2', parentIds: [], childIds: ['b/c'] },
    { id: 'b/c', label: 'child 2', parentIds: ['a'], childIds: [] }
  ];
  const rows = visibleRows(taxonomy, new Set(['a/b', 'a']));
  assert.equal(new Set(rows.map(row => row.key)).size, 4);
  assert.deepEqual(JSON.parse(rows[1].key), ['a/b', 'c']);
});
