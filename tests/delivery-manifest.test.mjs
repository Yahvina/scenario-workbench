import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyDelivery } from '../scripts/check-delivery.mjs';

const digest = data => createHash('sha256').update(data).digest('hex');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'cib-delivery-'));
  t.after(() => { assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('cib-delivery-')); return rm(root, { recursive: true, force: true }); });
  await mkdir(join(root, 'cib-core'));
  const contents = { '平台.html': '<!doctype html><title>合成文件</title>', 'cib-core/index.mjs': 'export const testOnly=true;\n' };
  for (const [name, content] of Object.entries(contents)) await writeFile(join(root, name), content);
  const manifest = { format: 'scenario-workbench.delivery-candidate', version: 1, candidateId: 'synthetic-rc1', status: 'technical-candidate', applicationVersion: '0.2.0', applicationSourceCommit: 'a'.repeat(40), applicationSha256: digest(contents['平台.html']), coreVersion: '0.1.0', coreEntrySha256: digest(contents['cib-core/index.mjs']), realUserTrialCompleted: false, researchMappingApproved: false, files: Object.entries(contents).map(([path, content]) => ({ path, bytes: Buffer.byteLength(content), sha256: digest(content) })) };
  const save = () => writeFile(join(root, 'release-manifest.json'), JSON.stringify(manifest)); await save(); return { root, manifest, save };
}
test('delivery checks exact Unicode files and keeps technical validation distinct from real use', async t => {
  const { root } = await fixture(t), result = await verifyDelivery(root);
  assert.equal(result.filesVerified, 2); assert.equal(result.realUserTrialCompleted, false); assert.equal(result.signatureAuthenticated, false);
});
test('same-size tampering rejects without changing any delivered content', async t => {
  const { root } = await fixture(t), file = join(root, 'cib-core/index.mjs');
  const changed = (await readFile(file, 'utf8')).replace('true', 'null'); await writeFile(file, changed);
  await assert.rejects(verifyDelivery(root), /哈希/); assert.equal(await readFile(file, 'utf8'), changed);
});
test('missing files and unexpected additions reject', async t => {
  const { root } = await fixture(t); await writeFile(join(root, 'extra.json'), '{}'); await assert.rejects(verifyDelivery(root), /清单外/);
  await rm(join(root, 'extra.json')); await rm(join(root, '平台.html')); await assert.rejects(verifyDelivery(root), /缺失/);
});
test('traversal, absolute paths, Windows separators and duplicates reject before reading entries', async t => {
  const { root, manifest, save } = await fixture(t), original = structuredClone(manifest.files);
  for (const path of ['../outside', '/outside', 'C:/outside', 'cib-core\\index.mjs', 'a/./b', 'a//b', 'a./b']) {
    manifest.files = structuredClone(original); manifest.files[0].path = path; await save(); await assert.rejects(verifyDelivery(root));
  }
  manifest.files = [...original, original[0]]; await save(); await assert.rejects(verifyDelivery(root), /重复/);
});
test('overclaims, unknown fields, excessive sizes and metadata mismatch reject', async t => {
  const { root, manifest, save } = await fixture(t), original = structuredClone(manifest);
  for (const change of [m => { m.realUserTrialCompleted = true; }, m => { m.researchMappingApproved = true; }, m => { m.extra = 1; }, m => { m.files[0].bytes = true; }, m => { m.files[0].bytes = 64 * 1024 * 1024 + 1; }, m => { m.applicationSha256 = 'b'.repeat(64); }, m => { m.files[0].extra = true; }]) {
    for (const key of Object.keys(manifest)) delete manifest[key]; Object.assign(manifest, structuredClone(original)); change(manifest); await save(); await assert.rejects(verifyDelivery(root));
  }
});
