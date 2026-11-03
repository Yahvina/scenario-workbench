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
      const view = page.getByRole('combobox', { name: '界面视角', exact: true });
      await page.getByLabel('项目名称', { exact: true }).fill('未保存的名字');
      page.once('dialog', dialog => dialog.dismiss());
      await view.selectOption('expert');
      assert.equal(await view.inputValue(), 'public');
      assert.equal(await page.getByLabel('项目名称', { exact: true }).inputValue(), '未保存的名字');
      page.once('dialog', dialog => dialog.accept());
      await page.locator('[data-route="elements"]').click();
      await page.getByRole('button', { name: '向当前项目加入京津冀框架' }).click();
      await page.getByLabel('经济增长速度', { exact: true }).check();
      const state = () => page.evaluate(() => { const p = JSON.parse(localStorage.getItem('scenario-workbench.project.v1')); return { data: p.data, selection: p.selection, revision: p.revision }; });
      const before = await state();
      assert.equal(await page.locator('nav .nav-item').count(), 6);
      await page.screenshot({ path: path.join(root, 'artifacts/perspective-' + mode + '-public.png'), fullPage: true });
      await view.selectOption('expert');
      const group = page.locator('.nav-group').filter({ has: page.getByRole('heading', { name: '政策关系建模', exact: true }) });
      assert.deepEqual(await group.locator('.nav-item').allTextContents(), ['政策要素设置', '专家关系输入', '关系矩阵生成', '分歧分析与校核待实现']);
      assert.deepEqual(await state(), before);
      await page.screenshot({ path: path.join(root, 'artifacts/perspective-' + mode + '-expert.png'), fullPage: true });
      await page.locator('[data-route="relationships"][data-object-id="matrix"]').click();
      assert.equal(await page.locator('h1').innerText(), '关系矩阵生成');
      assert.equal(await page.locator('[aria-current="page"]').count(), 1);
      assert.match(await page.locator('#module-content').innerText(), /至少需要两个/);
      await view.selectOption('public');
      assert.equal(await page.locator('.nav-item[aria-current="page"]').getAttribute('data-route'), 'relationships');
      assert.equal(await page.locator('.relationships-module').count(), 1);
      assert.deepEqual(await state(), before);
      assert.equal(await page.locator('nav .nav-item').count(), 6);
      await page.reload();
      assert.equal(await view.inputValue(), 'public');
      assert.deepEqual(await state(), before);
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await view.selectOption('expert');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(root, 'artifacts/perspective-' + mode + '-mobile.png'), fullPage: true });
      assert.deepEqual(errors, []);
      await context.close();
      console.log(mode + ': dropdown, dirty-form cancellation, simplified/full navigation, four mentor sections, shared scientific input and mobile passed');
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
