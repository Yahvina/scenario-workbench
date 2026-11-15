const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const { pathToFileURL } = require('node:url'), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const repo = path.resolve(__dirname, '..'), out = path.join(repo, 'artifacts/steel-flow'); await fs.mkdir(out, { recursive: true });
  const { syntheticCase, syntheticReport, pack } = await import('./steel-flow-fixtures.mjs');
  const example = await syntheticCase();
  const raw = process.env.STEEL_FLOW_BUNDLE ? await fs.readFile(process.env.STEEL_FLOW_BUNDLE, 'utf8') : JSON.stringify(await pack(syntheticReport(example), JSON.stringify(example)));
  const standalone = process.env.STEEL_FLOW_DEFAULT ? await fs.readFile(process.env.STEEL_FLOW_DEFAULT, 'utf8') : JSON.stringify(await pack(syntheticReport()));
  const bundle = JSON.parse(raw), report = JSON.parse(bundle.reportJson), expectedCase = bundle.caseJson;
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true }), reports = [];
  try {
    for (const [mode, url] of [['source', process.env.APP_URL || 'http://127.0.0.1:4197'], ['offline', pathToFileURL(path.join(repo, 'dist/scenario-workbench.html')).href]]) {
      const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } }), page = await ctx.newPage(), errors = [], external = [];
      if (mode === 'source' && !process.env.APP_URL) await ctx.route('http://127.0.0.1:4197/**', async route => {
        const pathname = decodeURIComponent(new URL(route.request().url()).pathname), file = path.resolve(repo, '.' + (pathname === '/' ? '/index.html' : pathname)); assert.ok(file.startsWith(repo + path.sep));
        try { await route.fulfill({ status: 200, body: await fs.readFile(file), contentType: { '.html': 'text/html;charset=utf-8', '.mjs': 'application/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream' }); }
        catch (error) { if (error.code !== 'ENOENT') throw error; await route.fulfill({ status: 404, body: 'Not found' }); }
      });
      await ctx.addInitScript(() => { const read = File.prototype.text; File.prototype.text = async function () { if (this.name === 'slow-flow.json') await new Promise(r => setTimeout(r, 180)); return read.call(this); }; });
      page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:')) external.push(r.url()); }); await page.goto(url);
      async function go() { await page.locator('nav [data-route=exports]').first().click(); await page.locator('.exports-switch [data-tab=advanced]').click(); const panel = page.locator('[data-steel-flow]'); await panel.locator(':scope > summary').click(); return panel; }
      let panel = await go(); const before = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))));
      const upload = (name, content) => panel.getByLabel('导入投入传递结果包', { exact: true }).setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(content) });
      async function passed() { await page.waitForFunction(() => document.querySelector('[data-steel-flow-status]')?.textContent.startsWith('包内一致性核验通过')); }
      async function rejected() { await page.waitForFunction(() => document.querySelector('[data-steel-flow-status]')?.textContent.startsWith('结果包未采用')); assert.equal(await panel.locator('[data-steel-flow-result] tbody tr').count(), 0); assert.equal(await panel.getByRole('button', { name: '下载核验摘要HTML', exact: true }).isDisabled(), true); }
      async function download(label, name) { const event = page.waitForEvent('download'); await panel.getByRole('button', { name: label, exact: true }).click(); const file = await event, data = await fs.readFile(await file.path()); await fs.writeFile(path.join(out, mode + '-' + name), data); return data; }
      await upload('linked-result.json', raw); await passed();
      assert.equal(await panel.locator('tbody tr').count(), 8); assert.match(await panel.locator('[data-steel-flow-status]').textContent(), /未重新运行GCAM，未检验当前项目/);
      assert.ok((await panel.locator('[data-steel-flow-result]').textContent()).includes(report.target.input));
      if (expectedCase !== null) assert.equal((await download('取回关联CIB留档', 'case.json')).toString('utf8'), expectedCase);
      const html = (await download('下载核验摘要HTML', 'summary.html')).toString('utf8'); assert.ok(html.includes('2.5%')); assert.ok(html.includes('2035年CIB已检验')); assert.ok(!html.includes('<script>'));
      assert.deepEqual(JSON.parse((await download('取回结果包JSON', 'result.json')).toString('utf8')), bundle);
      await panel.screenshot({ path: path.join(out, mode + '-desktop.png') });
      await page.setViewportSize({ width: 390, height: 900 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); await panel.screenshot({ path: path.join(out, mode + '-mobile.png') });
      await upload('default-result.json', standalone); await passed(); assert.equal(await panel.getByRole('button', { name: '取回关联CIB留档', exact: true }).isDisabled(), true); assert.match(await panel.locator('[data-steel-flow-result]').textContent(), /未关联CIB情景/);
      const bad = structuredClone(bundle), changed = JSON.parse(bad.reportJson); changed.summaries[0].aggregateEnergyReduction = .99; bad.reportJson = JSON.stringify(changed); bad.reportSha256 = crypto.createHash('sha256').update(bad.reportJson).digest('hex');
      await upload('forged-summary.json', JSON.stringify(bad)); await rejected();
      await upload('linked-result.json', raw); await passed(); await upload('malformed.json', '{broken'); await rejected();
      await upload('slow-flow.json', raw); await upload('invalid.json', '{}'); await page.waitForTimeout(260); await rejected();
      await upload('oversize.json', ' '.repeat(16 * 1024 * 1024 + 1)); await rejected(); assert.match(await panel.locator('[data-steel-flow-status]').textContent(), /超过16 MiB/);
      await upload('slow-flow.json', raw); await page.locator('nav [data-route=workspace]').first().click(); await page.waitForTimeout(260); panel = await go(); assert.equal(await panel.locator('tbody tr').count(), 0); assert.equal(await panel.getByRole('button', { name: '取回结果包JSON', exact: true }).isDisabled(), true);
      assert.equal(await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))), before);
      assert.deepEqual(errors, []); assert.deepEqual(external, []); await ctx.close();
      reports.push({ mode, nativeProducerBundle: !!process.env.STEEL_FLOW_BUNDLE, linkedAndIndependentImport: true, eightRowsRecomputed: true, actualDownloadsMatch: true, invalidSummaryMalformedOversizeAndRaceReject: true, unmountClearsResult: true, projectAndHistoryUnchanged: true, noExternalRequests: true, mobile390Overflow: false, httpServerTested: mode === 'source' && !!process.env.APP_URL }); console.log('PASS ' + mode + ' engineering result import');
    }
    await fs.writeFile(path.join(out, 'browser-results.json'), JSON.stringify(reports, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
