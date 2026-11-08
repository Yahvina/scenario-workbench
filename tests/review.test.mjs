import test from 'node:test';
import assert from 'node:assert/strict';
import fixtures from './solver-browser-fixtures.cjs';
import { scopeChecks, checkSummary, evidenceLedger, libraryChecks, originOf, evidenceOf, evidenceKindLabel } from '../src/modules/review/logic.mjs';

const project = () => fixtures.fixture();

test('口径核对：范围与年份对不上时如实标出，不替用户改成一致', () => {
  const p = project();
  p.scope.regionId = '天津市';
  p.scope.years = [2030];
  p.data.judgments[0].scope = { regionId: '北京市' };
  p.data.judgments[0].validYears = [2035];
  const rows = scopeChecks(p, 2030);
  const first = rows.find(r => r.id === p.data.judgments[0].id);
  assert.equal(first.region.ok, false);
  assert.match(first.region.note, /北京市/);
  assert.equal(first.years.ok, false);
  assert.match(first.years.note, /2035/);
});

test('口径核对：格子没填齐时按实际数量报告，不补 0', () => {
  const p = project();
  p.data.judgments[0].entries[0].score = null;
  const rows = scopeChecks(p, 2030);
  const row = rows.find(r => r.id === p.data.judgments[0].id);
  assert.equal(row.coverage.ok, false);
  assert.equal(row.coverage.filled, row.coverage.required - 1);
});

test('来源判定：参考填入标演示参考，普通填写标自行填写', () => {
  const p = project();
  p.data.judgments[0].provenance = { origin: 'user', sourceId: 'reference:jjj-airt' };
  assert.equal(originOf(p.data.judgments[0], p).kind, 'reference');
  p.data.judgments[1].provenance = { origin: 'user', sourceId: p.data.judgments[1].id };
  p.data.judgments[1].evidenceRefs = [];
  assert.equal(originOf(p.data.judgments[1], p).kind, 'user');
});

test('依据核对：引用找不到的记录单独列出，不假装存在', () => {
  const p = project();
  p.data.judgments[0].evidenceRefs = [...p.data.judgments[0].evidenceRefs, 'no-such-evidence'];
  const detail = evidenceOf(p.data.judgments[0], p);
  assert.equal(detail.missing.length, 1);
  assert.equal(detail.missing[0], 'no-such-evidence');
});

test('依据清单：统计每条依据被引用次数，并列出无人引用的', () => {
  const p = project();
  p.data.evidence.push({ id: 'ev-1', kind: 'paper', sourceId: 'doi:10.1/x', locator: 'paper#p3', excerpt: '方法来源', reviewStatus: 'draft', version: 1, provenance: { origin: 'import' } });
  p.data.evidence.push({ id: 'ev-2', kind: 'policy', sourceId: 'doc-9', locator: 'doc-9#c1', excerpt: '政策原文', reviewStatus: 'draft', version: 1, provenance: { origin: 'import' } });
  p.data.judgments[0].evidenceRefs = ['ev-1'];
  const ledger = evidenceLedger(p);
  assert.equal(ledger.used.find(e => e.id === 'ev-1').used, 1);
  const unused = ledger.used.filter(e => !e.used).map(e => e.id);
  assert.ok(unused.includes('ev-2'), '没人引用的依据要能看出来');
  assert.ok(ledger.used.length > 0);
  assert.equal(ledger.dangling.length, 0);
  assert.ok(ledger.used.every(e => Number.isInteger(e.used)));
});

test('汇总计数与逐条结果一致', () => {
  const p = project();
  p.scope.regionId = '天津市';
  p.data.judgments[0].scope = { regionId: '北京市' };
  const rows = scopeChecks(p, 2030);
  const s = checkSummary(rows);
  assert.equal(s.total, p.data.judgments.length);
  assert.equal(s.regionMismatch, rows.filter(r => !r.region.ok).length);
  assert.equal(s.coverageGap, rows.filter(r => !r.coverage.ok).length);
});

test('政策库关联：没有明确路径的因素不硬分配', () => {
  const p = project();
  p.selection.descriptorIds = ['d46-20', 'not-in-library'];
  const lib = libraryChecks(p);
  const known = lib.rows.find(r => r.descriptorId === 'd46-20');
  const unknown = lib.rows.find(r => r.descriptorId === 'not-in-library');
  assert.ok(known.links.length > 0);
  assert.equal(unknown.links.length, 0);
  assert.equal(lib.covered, 1);
});

test('台账口径：依据性质有中文标签，不显示原始英文键', () => {
  assert.equal(evidenceKindLabel('paper'), '论文/方法');
  assert.equal(evidenceKindLabel('fixture'), '机制示例');
  assert.equal(evidenceKindLabel(undefined), '未标注');
});

