// Shared adapters for the start page. Browser scripts drive the real controls
// (scale + range selection, collapsed secondary entries) rather than a hidden field.
//
// 2026-11-06 首页精简后的位置变化：
//   - 年份文本输入在首页「调整年份」折叠里
//   - 项目备份、恢复、示例载入搬到「保存与导出 → 导出、备份与恢复」
const YEARS_DETAILS = '.home-years-adjust';

async function openDetails(page, selector) {
  const details = page.locator(selector);
  if ((await details.count()) && !(await details.evaluate(node => node.open))) await details.locator('> summary').click();
}

async function openYears(page) {
  await openDetails(page, YEARS_DETAILS);
}

// 进入保存与导出页的第三个页签（导出、备份与恢复）
async function openBackupTab(page) {
  const tab = page.locator('.exports-switch [data-tab="advanced"]');
  if (!(await tab.count())) {
    await page.locator('nav [data-route="exports"]').first().click();
    await page.waitForTimeout(400);
  }
  const current = page.locator('.exports-switch [data-tab="advanced"]');
  if (await current.count()) { await current.click(); await page.waitForTimeout(300); }
}

async function setRegion(page, value) {
  const scale = page.locator('#region-scale');
  for (const scaleId of ['region', 'province', 'city', 'custom']) {
    await scale.selectOption(scaleId);
    if (scaleId === 'city') {
      const province = page.locator('#region-province');
      const count = await province.locator('option').count();
      for (let index = 0; index < count; index += 1) {
        await province.selectOption(await province.locator('option').nth(index).getAttribute('value'));
        if (await selectHas(page.locator('#project-region'), value)) { await page.locator('#project-region').selectOption(value); return; }
      }
      continue;
    }
    const control = page.locator('#project-region');
    if ((await control.evaluate(node => node.tagName)) === 'SELECT') {
      if (await selectHas(control, value)) { await control.selectOption(value); return; }
    } else { await control.fill(value); return; }
  }
  throw new Error('start page could not express region: ' + value);
}

async function selectHas(locator, value) {
  return await locator.locator('option').evaluateAll((options, wanted) => options.some(option => option.value === wanted), value);
}

async function setYears(page, text) {
  await openYears(page);
  await page.getByLabel('研究年份', { exact: true }).fill(text);
  const apply = page.getByRole('button', { name: '应用文本年份', exact: true });
  if (await apply.count()) { await apply.click(); await page.waitForTimeout(200); }
}

// 首页只有一个主动作：保存范围并进入因素页。
async function saveScope(page) {
  await page.locator('[data-home-primary]').first().click();
  await page.waitForTimeout(400);
}

async function snapshot(page) {
  await openBackupTab(page);
  await page.getByRole('button', { name: '记录未检验快照', exact: true }).click();
}

async function downloadBackup(page) {
  await openBackupTab(page);
  await page.getByRole('button', { name: '下载项目备份', exact: true }).click();
}

async function restore(page, value, name = 'backup.json') {
  await openBackupTab(page);
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
  await page.getByLabel('从 JSON 备份恢复').setInputFiles({ name, mimeType: 'application/json', buffer });
  await page.waitForTimeout(300);
}

async function loadDemo(page) {
  await openBackupTab(page);
  await page.getByRole('button', { name: '载入机制示例', exact: true }).click();
  await page.waitForTimeout(500);
}

module.exports = { openDetails, openYears, openBackupTab, setRegion, setYears, saveScope, snapshot, downloadBackup, restore, loadDemo };
