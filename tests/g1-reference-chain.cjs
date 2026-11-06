// 参考评分操作链：部分覆盖 → 明确回执 → 逐个补缺 → 采用 → 真实检验。
// 这个用例对应“点了填入参考评分却仍提示缺评分、又没有入口”的缺陷，必须端到端跑通。
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');

const APP = pathToFileURL(path.resolve('dist/scenario-workbench.html')).href;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--disable-gpu', '--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await ctx.addInitScript(() => { window.confirm = () => true; });
  const page = await ctx.newPage();
  page.setDefaultTimeout(Number(process.env.G1_TIMEOUT_MS || 9000));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const results = [];
  const step = async (name, fn) => {
    try { await fn(); results.push(['PASS', name]); }
    catch (error) { results.push(['FAIL', name + ' :: ' + String(error.message).split('\n')[0]]); }
  };
  const project = () => page.evaluate(() => JSON.parse(localStorage.getItem('scenario-workbench.project.v1') || 'null'));
  const nav = async title => { await page.locator('nav >> text=' + title).first().click(); await page.waitForTimeout(400); };
  const text = async sel => (await page.locator(sel).innerText()).replace(/\s+/g, ' ');

  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.waitForTimeout(700);

  await nav('因素与年度方案');
  // 新项目默认已带 46 项目录；只有自动载入失败时才需要手动加入。
  const joinBtn = page.locator('[data-join-baseline]');
  if (await joinBtn.count()) await joinBtn.first().click();
  await page.waitForTimeout(800);
  const pick = async label => {
    const search = page.locator('.elements-module input[type=search]').first();
    await search.fill(label);
    await page.waitForTimeout(250);
    await page.locator('.elements-row').filter({ hasText: label }).last().locator('input[type=checkbox]').check();
    await page.waitForTimeout(400);
  };
  await pick('碳价');
  await pick('工业节能改造支持');
  await pick('工业单位产出能耗');
  await page.locator('.elements-module input[type=search]').first().fill('');
  await page.waitForTimeout(300);
  for (const label of ['碳价', '工业节能改造支持', '工业单位产出能耗']) {
    const tab = page.locator('.preview-switch button', { hasText: label });
    if (await tab.count()) { await tab.first().click(); await page.waitForTimeout(200); }
    await page.locator('select[aria-label="2030年状态"]').selectOption({ index: 1 });
    await page.locator('select[aria-label="2035年状态"]').selectOption({ index: 2 });
    await page.waitForTimeout(250);
  }

  await step('部分覆盖时，参考预览必须先讲清覆盖范围与写入年份', async () => {
    await nav('关系评分');
    await page.locator('.relationships-tabs button', { hasText: '检查评分完整性' }).click();
    await page.waitForTimeout(300);
    await page.locator('button', { hasText: '一键填入参考评分' }).first().click();
    await page.waitForTimeout(400);
    const dialog = await text('.reference-dialog');
    assert.match(dialog, /演示参考，可修改，非实时AI生成/);
    assert.match(dialog, /将填 27 格/);
    assert.match(dialog, /写入年份 2030、2035/);
    assert.match(dialog, /确认保存并使用/);
  });

  await step('确认保存并使用：一次完成保存与选用，并给出四类回执', async () => {
    await page.locator('.reference-dialog button', { hasText: '确认保存并使用' }).click();
    await page.waitForTimeout(900);
    const receipt = await text('[data-rev-refill]');
    assert.match(receipt, /已填入：?27 格，涉及 3 个方向；还缺 27 格/, '回执实际是：' + receipt.slice(0, 120));
    assert.match(receipt, /待保存 0（已写入项目）/);
    assert.match(receipt, /待选用 0/);
    assert.match(receipt, /没有参考规则 3 个方向/);
    const p = await project();
    assert.equal(p.data.judgments.length, 3);
    for (const j of p.data.judgments) assert.deepEqual(j.validYears, [2030, 2035], '写入年份按项目研究年份');
    assert.equal(p.data.judgments.every(j => j.entries.filter(e => e.score !== null).length === 9), true);
  });

  await step('没有参考规则的方向有直达入口，保存后自动回到完整性检查', async () => {
    const rows = page.locator('[data-rev-norule] .rev-norule-row');
    assert.equal(await rows.count(), 3);
    await page.locator('[data-rev-norule] button', { hasText: '填写这个方向' }).first().click();
    await page.waitForTimeout(500);
    assert.match(await text('[data-rel-return]'), /保存后自动回到「检查评分完整性」/);
    const cells = page.locator('.relationships-module input[type=number]');
    assert.equal(await cells.count(), 9);
    for (let i = 0; i < await cells.count(); i++) await cells.nth(i).fill('-1');
    await page.locator('button', { hasText: '保存这一对的评分' }).first().click();
    await page.waitForTimeout(800);
    assert.match(await text('.relationships-status'), /回到完整性检查/);
    assert.match(await text('.rev-stats'), /4 \/ 6/);
  });

  await step('逐方向补完：6/6 后主按钮可用，采用并进入检验', async () => {
    for (let round = 0; round < 3; round++) {
      const btn = page.locator('[data-rev-norule] button', { hasText: '填写这个方向' });
      if (!(await btn.count())) break;
      await btn.first().click();
      await page.waitForSelector('input[aria-label="判断适用地区"]', { state: 'visible' });
      await page.waitForTimeout(300);
      const cells = page.locator('.relationships-module input[type=number]');
      assert.equal(await cells.count(), 9, '每个方向 3×3 九格');
      for (let i = 0; i < 9; i++) await cells.nth(i).fill(String(i % 2 ? 1 : 0));
      await page.locator('button', { hasText: '保存这一对的评分' }).first().click();
      await page.waitForTimeout(900);
    }
    assert.match(await text('.rev-stats'), /6 \/ 6/);
    assert.match(await text('.rev-stats'), /0 .*还缺评分格/);
    const adopt = page.locator('button', { hasText: '使用这些评分，继续检验' });
    assert.ok(await adopt.count(), '应有“采用并继续”的入口');
    await adopt.first().click();
    await page.waitForTimeout(900);
    assert.ok(await page.locator('.solver-module').count());
  });

  await step('检验页：假设亲手确认后能算出真实结果', async () => {
    // 假设口径已默认接受，界面不再要求勾选；此处不再有对应控件。
    await page.locator('[data-plan-check-run]').click();
    await page.waitForTimeout(600);
    assert.match(await text('.plan-check'), /自洽|压过/);
    await page.locator('section.solver-fullspace button', { hasText: '开始检验' }).first().click();
    await page.waitForTimeout(1600);
    const summary = await text('[data-solver-summary]');
    assert.match(summary, /共找到 \d+ 种自洽组合/);
    assert.match(summary, /我的方案/);
  });

  await step('无脚本错误', async () => { assert.deepEqual(errors, []); });

  for (const [status, name] of results) console.log(status === 'PASS' ? '  ✓' : '✗', name);
  const fails = results.filter(r => r[0] === 'FAIL');
  console.log(fails.length ? '\n' + fails.length + ' 项失败' : '\n参考评分操作链全部通过');
  await Promise.race([browser.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 4000))]);
  process.exit(fails.length ? 1 : 0);
})();
