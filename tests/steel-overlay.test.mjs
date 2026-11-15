import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSteelCoefficient, steelOverlayXml, steelSha256, STEEL_OPERATIONS } from '../src/modules/exports/steel-overlay.mjs';

test('coefficient operations preserve distinct meanings and explicit zero', () => {
  assert.equal(calculateSteelCoefficient(2, { kind: 'coefficient-decrease-percent', value: 5 }), 1.9);
  assert.equal(calculateSteelCoefficient(2, { kind: 'reciprocal-efficiency-increase-percent', value: 5 }), 2 / 1.05);
  assert.equal(calculateSteelCoefficient(2, { kind: 'set-coefficient', value: 0 }), 0);
  assert.equal(calculateSteelCoefficient(2, { kind: 'coefficient-multiplier', value: 0 }), 0);
  assert.equal(calculateSteelCoefficient(2, { kind: 'coefficient-decrease-percent', value: 0 }), 2);
  assert.equal(calculateSteelCoefficient(2, { kind: 'coefficient-decrease-percent', value: 100 }), 0);
  assert.equal(STEEL_OPERATIONS.length, 4);
});

test('empty, nonfinite, boolean, negative, excess and unsupported operations reject', () => {
  for (const value of ['', null, false, true, NaN, Infinity, -1, '5', 101])
    assert.throws(() => calculateSteelCoefficient(2, { kind: 'coefficient-decrease-percent', value }));
  assert.throws(() => calculateSteelCoefficient(0, { kind: 'reciprocal-efficiency-increase-percent', value: 5 }));
  assert.throws(() => calculateSteelCoefficient(2, { kind: 'share-weight', value: 1 }));
  assert.throws(() => calculateSteelCoefficient(2, { kind: 'set-coefficient', value: 1, approved: true }));
  assert.throws(() => calculateSteelCoefficient(2, { kind: 'coefficient-multiplier', value: 1e308 }));
});

test('minimal overlay escapes names and never serializes unrelated fields', () => {
  const target = { region: 'R<&"', sector: 'iron and steel', subsector: 'A', technology: 'B', year: 2030, input: 'C', expectedBaseline: 2 };
  const xml = steelOverlayXml(target, 0);
  assert.match(xml, /name="R&lt;&amp;&quot;"/);
  assert.match(xml, /<period year="2030">/);
  assert.match(xml, /<coefficient>0<\/coefficient>/);
  assert.doesNotMatch(xml, /expectedBaseline|share-weight|input-cost|market-name/);
  assert.throws(() => steelOverlayXml({ ...target, year: true }, 1));
  assert.throws(() => steelOverlayXml({ ...target, sector: 'cement' }, 1));
});

test('browser file hash matches the standard SHA256 test vector', async () => {
  assert.equal(await steelSha256(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
