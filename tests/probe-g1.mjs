import pw from 'file:///C:/Users/guiqu/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const { chromium } = pw;
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.APP_URL || pathToFileURL(path.join(root, 'dist/scenario-workbench.html')).href;
const shot = name => path.join(root, 'artifacts/v5', name);

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--no-sandbox', '--disable-gpu']
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console:' + m.text()); });
page.on('dialog', d => d.accept());

await page.goto(url);
await page.getByRole('button', { name: '载入机制示例' }).click();
await page.waitForTimeout(300);

// 因素页：给两个变量按年选状态（演示项目 2026/2030/2035）
await page.locator('.nav-item', { hasText: '因素与方案' }).click();
await page.waitForTimeout(200);
const picks = page.locator('.state-year-options select');
const count = await picks.count();
console.log('year selects:', count);
if (count >= 2) {
  await picks.nth(0).selectOption({ index: 2 });
  await picks.nth(1).selectOption({ index: 2 });
  await picks.nth(2).selectOption({ index: 2 });
}
await page.waitForTimeout(300);

// 到求解页
await page.locator('.nav-item', { hasText: '检验与结果' }).click();
await page.waitForTimeout(300);
const plan = await page.locator('[data-plan-check]').innerText().catch(() => '(no plan section)');
console.log('--- PLAN SECTION ---\n' + plan.slice(0, 1200));
await page.screenshot({ path: shot('g1-solver-plan.png'), fullPage: true });

const btn = page.locator('[data-plan-check-run]');
console.log('plan button visible:', await btn.isVisible().catch(() => false), 'enabled:', await btn.isEnabled().catch(() => false));
if (await btn.isEnabled().catch(() => false)) {
  await btn.click();
  await page.waitForTimeout(300);
  console.log('--- AFTER CHECK ---\n' + (await page.locator('[data-plan-check]').innerText()).slice(0, 1600));
  await page.screenshot({ path: shot('g1-solver-plan-checked.png'), fullPage: true });
}
console.log('ERRORS:', errors);
await browser.close();
