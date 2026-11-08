import test from 'node:test';
import assert from 'node:assert/strict';
import fixtures from './solver-browser-fixtures.cjs';
import { projectEntries, libraryEntries, counts, search, citationIndex, normalize } from '../src/modules/knowledge/logic.mjs';

const project = () => fixtures.fixture();

test('项目依据：标出被多少条判断引用，没人引用的也为 0', () => {
  const p = project();
  p.data.evidence.push({ id: 'ev-a', kind: 'paper', sourceId: 'doi:10.1/a', locator: 'p1', excerpt: 'x', reviewStatus: 'draft', version: 1, provenance: { origin: 'import' } });
  p.data.evidence.push({ id: 'ev-b', kind: 'policy', sourceId: 'doc-b', locator: 'c2', excerpt: 'y', reviewStatus: 'draft', version: 1, provenance: { origin: 'import' } });
  p.data.judgments[0].evidenceRefs = ['ev-a'];
  const entries = projectEntries(p);
  assert.equal(entries.find(e => e.id === 'ev-a').citedBy, 1);
  assert.equal(entries.find(e => e.id === 'ev-b').citedBy, 0);
});

test('政策库条目：只有已建立路径才算与当前项目相关', () => {
  const p = project();
  p.selection.descriptorIds = ['d46-20'];
  const lib = libraryEntries(p);
  const meps = lib.find(e => e.path === '建筑最低能源绩效标准（MEPS）');
  assert.equal(meps.relevant, true);
  assert.equal(meps.linkLevel, 'direct');
  const unrelated = lib.find(e => !e.descriptorIds.length);
  assert.equal(unrelated.relevant, false);
});

test('五类计数：未收录的类型归到其他，不丢条目', () => {
  const c = counts([{ kind: 'policy' }, { kind: 'policy' }, { kind: 'mystery' }]);
  assert.equal(c.total, 3);
  assert.equal(c.byKind.get('policy'), 2);
  assert.equal(c.byKind.get('other'), 1);
});

test('检索：类型与来源可叠加，关键词忽略大小写与空白', () => {
  const entries = [
    { from: 'project', kind: 'paper', sourceId: 'DOI:10.1/A', locator: 'p1', excerpt: '' },
    { from: 'library', kind: 'policy', name: 'Clean Air', path: 'x', jurisdiction: 'y', document: '', category: '', group: '' }
  ];
  assert.equal(search(entries, { kind: 'paper' }).length, 1);
  assert.equal(search(entries, { source: 'library' }).length, 1);
  assert.equal(search(entries, { query: 'cleanair' }).length, 1);
  assert.equal(search(entries, { query: 'doi 10.1/a' }).length, 1);
  assert.equal(search(entries, { kind: 'paper', source: 'library' }).length, 0);
});

test('只看相关：只保留标了 relevant 的条目', () => {
  const entries = [{ relevant: true }, { relevant: false }, {}];
  assert.equal(search(entries, { onlyRelevant: true }).length, 1);
});

test('引用反查：没有依据的判断能列出来，悬空引用单独标记', () => {
  const p = project();
  p.data.evidence = [{ id: 'ev-1', kind: 'paper', sourceId: 's', locator: 'l', excerpt: 'e', version: 1, provenance: { origin: 'import' } }];
  p.data.judgments[0].evidenceRefs = ['ev-1'];
  p.data.judgments[1].evidenceRefs = ['ev-1', 'ghost'];
  const index = citationIndex(p);
  assert.equal(index.byEvidence.get('ev-1').length, 2);
  assert.equal(index.bare.length, 0);
  assert.deepEqual(index.dangling, ['ghost']);
});

test('正常化：空值不炸', () => {
  assert.equal(normalize(null), '');
  assert.equal(normalize(undefined), '');
});
