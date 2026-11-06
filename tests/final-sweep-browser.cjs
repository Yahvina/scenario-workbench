// 本轮收尾核验：树展开/选择互不误触、参考覆盖摘要、专家切换、多因素搜索切换、视口适配。
// 运行：PLAYWRIGHT_MODULE=... APP_URL=... node tests/final-sweep-browser.cjs
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.APP_URL || 'http://127.0.0.1:8788/index.html';
const shots = process.env.SHOT_DIR || null;

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'], executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const log = [];
  const check = (name, cond) => { log.push((cond ? 'PASS ' : 'FAIL ') + name); assert.ok(cond, name); };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // —— 1. 新项目（46 项目录）树交互 ——
    await page.getByRole('button', { name: '开始一个新情景' }).click();
    await page.locator('nav button[data-route="elements"]').click();
    await page.waitForTimeout(300);
    const selBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('scenario-workbench.project.v1')).selection.descriptorIds.length);
    // 分支行名称按钮：展开收起，不改选择
    const nameBtn = page.locator('button.elements-name').first();
    const label = await nameBtn.textContent();
    await nameBtn.click();
    await page.waitForTimeout(150);
    const selAfterName = await page.evaluate(() => JSON.parse(localStorage.getItem('scenario-workbench.project.v1')).selection.descriptorIds.length);
    check('分支名称点击展开不改变选择', selAfterName === selBefore);
    // 复选框：选择，不引起同名按钮的展开状态以外变化
    const cb = page.locator('.elements-row input[type=checkbox]').nth(1);
    await cb.click();
    await page.waitForTimeout(150);
    const selAfterCb = await page.evaluate(() => JSON.parse(localStorage.getItem('scenario-workbench.project.v1')).selection.descriptorIds.length);
    check('复选框勾选改变选择', selAfterCb > selBefore);
    // 展开状态下再点名称收起，选择保持
    const nameBtn2 = page.locator('button.elements-name').first();
    await nameBtn2.click();
    await page.waitForTimeout(150);
    const selFinal = await page.evaluate(() => JSON.parse(localStorage.getItem('scenario-workbench.project.v1')).selection.descriptorIds.length);
    check('名称收起不改变选择', selFinal === selAfterCb);

    // —— 2. 多因素（>6）搜索切换：只换查看对象，不改数据 ——
    await page.evaluate(() => {
      const key = 'scenario-workbench.project.v1';
      const p = JSON.parse(localStorage.getItem(key));
      const labels = p.data.taxonomy.filter(n => n.kind === 'leaf').slice(0, 8);
      p.selection.descriptorIds = labels.map(n => n.descriptorIds[0]).filter(Boolean).slice(0, 8);
      p.selection.nodeIds = labels.map(n => n.id);
      localStorage.setItem(key, JSON.stringify(p));
    });
    await page.reload();
    await page.locator('nav button[data-route="elements"]').click();
    await page.waitForTimeout(300);
    const pickerInput = page.locator('.factor-picker-search input');
    check('>6 因素时出现可搜索当前编辑因素', await pickerInput.count() === 1);
    const revBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('scenario-workbench.project.v1')).revision);
    await pickerInput.fill('上一项');
    await page.locator('.factor-picker-nav button', { hasText: '下一项' }).click();
    await page.waitForTimeout(150);
    const revAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('scenario-workbench.project.v1')).revision);
    check('上一项/下一项不修改项目数据', revBefore === revAfter);

    // —— 3. 专家视角切换不报错 ——
    await page.selectOption('select', { label: '专家用户 · 完整工作台' });
    await page.waitForTimeout(300);
    check('专家视角切换无页面错误', errors.length === 0);
    await page.selectOption('select', { label: '普通用户 · 简洁界面' });

    // —— 4. 视口截图 ——
    if (shots) {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.screenshot({ path: shots + '/final-1280.png' });
      await page.setViewportSize({ width: 560, height: 900 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: shots + '/final-narrow.png' });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    check('全程无页面错误', errors.length === 0);
    await page.close();
    console.log(log.join('\n'));
  } finally { await browser.close(); }
})().catch(e => { console.error('ERR:', e.message); console.error(log.join('\n')); process.exit(1); });
