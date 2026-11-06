// 抽屉回归：同时只开一个、Esc/关闭清理干净、切页自动关闭、焦点返回触发按钮。
// 需要本地服务：APP_URL（默认 http://127.0.0.1:4174）；playwright 用 PLAYWRIGHT_MODULE 指定。
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '..');
const url = process.env.APP_URL || 'http://127.0.0.1:4174';
// 用构建产物确认修复进入交付版
const offline = require('node:url').pathToFileURL(path.join(repo, 'dist/scenario-workbench.html')).href;

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'], executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const [mode, target] of [['source', url], ['offline', offline]]) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(target);
      await page.locator('[data-route="elements"]').click();
      // 载入机制示例，保证有地区与因素详情可开抽屉
      const openDemo = page.getByRole('button', { name: /机制示例|载入/ }).first();
      if (await openDemo.count()) { page.on('dialog', d => d.accept()); await openDemo.click().catch(() => {}); }
      await page.waitForTimeout(300);

      const openBtn = () => page.getByRole('button', { name: /查看政策资料/ }).first();
      assert.ok(await openBtn().count(), mode + ': 因素页应有「查看政策资料」入口');

      // 1) 打开→关闭按钮：面板、覆盖层、body overflow 全部还原，焦点回触发按钮
      await page.evaluate(() => document.querySelector('.region-material-btn')?.setAttribute('data-drawer-trigger', '1'));
      await page.locator('.region-material-btn').first().click();
      assert.ok(await page.locator('.app-drawer').count(), mode + ': 抽屉应打开');
      await page.locator('.app-drawer-hd button', { hasText: '关闭' }).click();
      assert.equal(await page.locator('.app-drawer, .app-drawer-overlay').count(), 0, mode + ': 关闭后无残留');
      assert.equal(await page.evaluate(() => document.body.style.overflow), '', mode + ': body 滚动还原');
      assert.ok(await page.evaluate(() => document.activeElement?.hasAttribute('data-drawer-trigger')), mode + ': 焦点返回触发按钮');

      // 2) 连续重开 3 次只允许 1 个面板（回归：旧 panel 残留）。
      // 开着时指针会被 overlay 挡住（对真实用户是合理的），这里用 JS 点击走重开代码路径。
      for (let i = 0; i < 3; i++) await page.evaluate(() => document.querySelector('.region-material-btn')?.click());
      assert.equal(await page.locator('.app-drawer').count(), 1, mode + ': 重开不残留旧面板');
      assert.equal(await page.locator('.app-drawer-overlay').count(), 1, mode + ': 重开不残留旧覆盖层');

      // 3) Esc 关闭
      await page.locator('.app-drawer').press('Escape');
      assert.equal(await page.locator('.app-drawer, .app-drawer-overlay').count(), 0, mode + ': Esc 关闭无残留');

      // 4) 抽屉开着切页：自动关闭，body overflow 还原（回归：切页残留）。
      // 抽屉未做焦点陷阱，键盘 Tab 可达背景并用 Enter 激活导航——用 JS 点击模拟这一路径。
      await openBtn().click();
      await page.evaluate(() => document.querySelector('nav button[data-route="relationships"]')?.click());
      assert.equal(await page.locator('.app-drawer, .app-drawer-overlay').count(), 0, mode + ': 切页后抽屉自动关闭');
      assert.equal(await page.evaluate(() => document.body.style.overflow), '', mode + ': 切页后滚动还原');

      assert.deepEqual(errors, [], mode + ': 无页面错误');
      await page.close();
    }
    console.log('drawer-browser: 6 组断言 × source/offline 全部通过');
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
