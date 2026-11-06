// Shared adapters for the H1 start page. Old browser scripts use these so they keep
// driving the real new controls (scale + range selection, collapsed secondary
// entries) instead of a hidden field pretending the interaction was verified.
const MORE = '#home-more';

async function openMore(page) {
  const more = page.locator(MORE);
  if ((await more.count()) && !(await more.evaluate(node => node.open))) await more.locator('> summary').click();
}

async function openDetails(page, selector) {
  const details = page.locator(selector);
  if ((await details.count()) && !(await details.evaluate(node => node.open))) await details.locator('> summary').click();
}

// Choose the region through the real scale control: pick the scale that can express
// the requested value, then set the single 研究地区 control (select or custom input).
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
  await openMore(page);
  await page.getByLabel('研究年份', { exact: true }).fill(text);
}

async function saveScope(page) {
  await openMore(page);
  await page.getByRole('button', { name: '保存项目范围', exact: true }).click();
}

async function snapshot(page) {
  await openMore(page);
  await page.getByRole('button', { name: '记录未检验快照', exact: true }).click();
}

async function downloadBackup(page) {
  await openMore(page);
  await page.getByRole('button', { name: '下载项目备份', exact: true }).click();
}

async function restore(page, value, name = 'backup.json') {
  await openMore(page);
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
  await page.getByLabel('从JSON备份恢复').setInputFiles({ name, mimeType: 'application/json', buffer });
}

async function loadDemo(page) {
  await openMore(page);
  await page.getByRole('button', { name: '载入机制示例', exact: true }).click();
}

module.exports = { openMore, openDetails, setRegion, setYears, saveScope, snapshot, downloadBackup, restore, loadDemo };
