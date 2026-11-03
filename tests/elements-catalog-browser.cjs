const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  try {
    for (const [mode, url] of [['source', process.env.APP_URL || 'http://127.0.0.1:4173'], ['offline', pathToFileURL(path.join(root, 'dist/scenario-workbench.html')).href]]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      await page.locator('[data-route="elements"]').click();
      assert.match(await page.locator('.elements-catalog').innerText(), /经济增长速度/);
      await page.screenshot({ path: path.join(root, 'artifacts/elements-catalog-' + mode + '.png'), fullPage: true });
      const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('scenario-workbench.project.v1')));
      await page.getByRole('button', { name: '向当前项目加入京津冀框架', exact: true }).click();
      await page.getByLabel('经济增长速度', { exact: true }).check();
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('scenario-workbench.project.v1')));
      assert.equal(saved.id,before.id);assert.equal(saved.title,before.title);assert.deepEqual(saved.scope,before.scope);
      assert.equal(saved.data.descriptors.length, 24);
      assert.equal(saved.data.judgments.length, 0);
      assert.deepEqual(saved.selection.descriptorIds, ['jjj-d1']);
      assert.equal(saved.data.states.every(state => state.range === null && state.validYears.length === 0), true);
      await page.locator('.elements-summary details summary').first().click();
      assert.match(await page.locator('.elements-summary').innerText(), /未重新核验/);
      assert.equal(await page.locator('.elements-row.is-selected .elements-level').innerText(), '3级');
      await page.screenshot({ path: path.join(root, 'artifacts/elements-jjj-' + mode + '-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(root, 'artifacts/elements-jjj-' + mode + '-mobile.png'), fullPage: true });
      await page.reload();
      assert.match(await page.locator('.elements-dataset').innerText(), /24 项描述符/);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(mode + ': catalog preview, 24 existing draft descriptors, direct selection, persistence and mobile passed');
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
