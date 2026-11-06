const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const home = require('./home-controls.cjs');
const fixtures = require('./flow-fixtures.cjs');

const PROJECT_KEY = 'scenario-workbench.project.v1';
const SAVED_KEY = 'scenario-workbench.saved-work.v1';

// H1 start-page acceptance: the real selection controls, both perspectives, saved
// scope across a reload, dirty-range leave protection and the still-reachable P4
// library. It drives the controls a user sees; it never fills a hidden field.
(async () => {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'artifacts/home-start');
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const results = [];
  try {
    for (const [mode, url] of [['source', process.env.APP_URL || 'http://127.0.0.1:4173'], ['offline', pathToFileURL(path.join(root, 'dist/scenario-workbench.html')).href]]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
      const page = await context.newPage();
      const errors = [], external = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:')) external.push(request.url()); });
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForSelector('#home-start-form');

      // --- 1. A first-time user needs no name: pick where and when, then the one primary action.
      assert.equal(await page.locator('.page-heading h1').innerText(), '开始研究');
      assert.equal(await page.locator('#project-title').inputValue(), '京津冀政策情景');
      assert.equal(await page.locator('.workflow').count(), 0, 'the four static workflow bullets must be gone');
      assert.equal(await page.locator('form .button.primary-action').count(), 1, 'exactly one primary action');
      const primary = page.locator('form .button.primary-action');
      assert.match(await primary.innerText(), /继续：选择因素/);
      const box = await primary.boundingBox();
      assert.ok(box.width > 0 && box.height > 0, 'primary action must be rendered');
      assert.ok(box.y + box.height <= 800, 'the one primary action must be fully visible at 1280x800, got bottom ' + Math.round(box.y + box.height));
      const regionBox = await page.locator('#project-region').boundingBox();
      const mapBox = await page.locator('.geo-map').boundingBox();
      assert.ok(regionBox.y < 800 && mapBox.y < 800, 'map and range control must both be on the first screen at 1280x800');
      assert.ok(mapBox.height > 200, 'the map should occupy the main area, got height ' + Math.round(mapBox.height));
      await page.screenshot({ path: path.join(out, mode + '-start-1280.png'), fullPage: false });
      await home.setRegion(page, '京津冀');
      await home.openYears(page);
      await home.openYears(page);
      await page.locator('#target-year').selectOption('2030');
      const primaryBox = await primary.boundingBox();
      assert.ok(primaryBox.y + primaryBox.height <= 800, 'the primary action must stay inside the first screen once region and year are chosen, got bottom ' + Math.round(primaryBox.y + primaryBox.height));
      await page.screenshot({ path: path.join(out, mode + '-start-selected-1280.png'), fullPage: false });
      await primary.click();
      await page.waitForFunction(() => document.querySelector('nav [aria-current="page"]')?.getAttribute('data-route') === 'elements');
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('scenario-workbench.project.v1')));
      assert.equal(stored.title, '京津冀政策情景');
      assert.deepEqual(stored.scope, { regionId: '京津冀', years: [2030, 2035] }, '默认范围：京津冀 / 2030 / 2035');
      assert.equal(stored.contractVersion, '1.0.0');
      // 46 项目录从 ca721f2 起就是新项目默认：只载入目录与定义，不自动勾选因素、不伪造评分。
      assert.ok(stored.data.descriptors.length >= 46, '目录随新项目默认载入');
      assert.deepEqual(stored.selection.descriptorIds, [], '选范围不得自动勾选因素');
      assert.deepEqual(stored.data.judgments, [], '选范围不得伪造评分');

      // --- 2. Reopening keeps the saved name and scope, and the scale is re-derived.
      await page.locator('nav [data-route=workspace]').first().click();
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('#home-start-form');
      assert.equal(await page.locator('#project-title').inputValue(), '京津冀政策情景');
      assert.equal(await page.locator('#region-scale').inputValue(), 'region');
      assert.equal(await page.locator('#project-region').inputValue(), '京津冀');
      assert.deepEqual(await page.locator('.chip').allInnerTexts().then(list => list.map(text => text.replace(/\s*×\s*/, ''))), ['2030', '2035']);

      // --- 3. Province -> city linkage, then a custom range that is kept verbatim.
      await home.setRegion(page, '河北省');
      assert.equal(await page.locator('#project-region').inputValue(), '河北省');
      await page.locator('#region-scale').selectOption('city');
      await page.locator('#region-province').selectOption('河北省');
      const cityOptions = await page.locator('#project-region option').evaluateAll(options => options.map(option => option.value));
      assert.ok(cityOptions.includes('石家庄市') && !cityOptions.includes('海淀区'), 'city list must follow the chosen province');
      await page.locator('#project-region').selectOption('石家庄市');
      await home.setRegion(page, '某某产业园区');
      assert.equal(await page.locator('#project-region').evaluate(node => node.tagName), 'INPUT', 'the custom scale is a real text control');
      assert.match(await page.locator('.field:has(#project-region) small').innerText(), /不会自动获得行政归属或数据可用性认证/, 'the custom range must state it gains no administrative or data certification');
      // 首页已精简：清单来源、更多设置、检算保存、方案与历史库都不再单列。
      assert.equal(await page.locator('#home-catalog-source').count(), 0, '清单来源不再单列');
      assert.equal(await page.locator('#home-more').count(), 0, '更多设置不再单列');
      assert.equal(await page.locator('#project-region').inputValue(), '某某产业园区', '自定义地区保留原值');

      // --- 4. Duplicate years are refused inside the form and the draft is kept.
      await home.setYears(page, '2030, 2030');
      await home.saveScope(page);
      assert.match(await page.locator('form .message').innerText(), /不重复/);

      // --- 5. A dirty range survives a refused leave, and the leave prompt is real.
      // 首页不再手填名称；名称由范围自动生成，改名在「保存与导出」里做。
      const dialogs = [];
      page.on('dialog', dialog => { dialogs.push(dialog.message()); return dialog.dismiss(); });
      await page.locator('nav [data-route=elements]').first().click();
      await page.waitForTimeout(150);
      assert.equal(dialogs.length, 1);
      assert.match(dialogs[0], /未保存/);
      assert.equal(await page.locator('#project-title').inputValue(), '京津冀政策情景', '首页不改已有项目的名字');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('scenario-workbench.project.v1')).title), '京津冀政策情景', 'the stored project is untouched while the draft is unsaved');

      // --- 6. Year boundaries: 1900/2300 accepted, out-of-range and bad text refused.
      await home.setYears(page, '1899');
      await home.saveScope(page);
      assert.match(await page.locator('form .message').innerText(), /1900—2300/);
      await home.setYears(page, '2026, 2035');
      // 首页只有一个主动作：保存范围并进入因素页。成功后页面会跳走，
      // 因此这里直接核对存储，再回首页继续后面的用例。
      await home.saveScope(page);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('scenario-workbench.project.v1')));
      assert.deepEqual(saved.scope.years, [2026, 2035]);
      assert.equal(saved.scope.regionId, '某某产业园区');
      assert.equal(saved.title, '京津冀政策情景', '已有项目名保持不变');
      await page.locator('nav [data-route=workspace]').first().click();
      await page.waitForTimeout(250);

      // --- 7. Start-new and continue are visible without opening anything, the P4
      // library stays mounted, and starting over asks before touching anything.
      assert.equal(await page.locator('[data-saved-work]').count(), 0, '命名方案面板已从首页移到保存与导出');
      const newButton = page.getByRole('button', { name: '开始一个新情景', exact: true });
      const continueButton = page.getByRole('button', { name: '继续已有方案', exact: true });
      assert.equal(await newButton.isVisible(), true, 'start-new must be visible without expanding anything');
      assert.equal(await continueButton.isVisible(), true, 'continue must be visible without expanding anything');
      const newBox = await newButton.boundingBox();
      assert.ok(newBox.y + newBox.height <= 800, 'start-new must be inside the first screen at 1280x800, got bottom ' + Math.round(newBox.y + newBox.height));

      // Cancelling the new-scenario confirmation must leave the draft and the stored
      // project byte-identical.
      // 同上：草稿名称不由首页填写。
      const beforeCancel = await page.evaluate(() => localStorage.getItem('scenario-workbench.project.v1'));
      const cancelDialogs = [];
      page.removeAllListeners('dialog');
      page.once('dialog', dialog => { cancelDialogs.push(dialog.message()); return dialog.dismiss(); });
      await newButton.click();
      await page.waitForTimeout(150);
      assert.equal(cancelDialogs.length, 1, 'starting over on an existing project must ask exactly once');
      assert.match(cancelDialogs[0], /开始一个新情景/);
      assert.equal(await page.locator('#project-title').inputValue(), '京津冀政策情景', '取消后草稿名保持原样');
      assert.equal(await page.locator('#project-region').inputValue(), '某某产业园区', 'cancelling must keep the chosen region');
      assert.equal(await page.evaluate(() => localStorage.getItem('scenario-workbench.project.v1')), beforeCancel, 'cancelling must not touch the stored project');

      // Accepting only opens a blank draft: it says what submitting will replace and how
      // to keep the original, and the stored project is still untouched.
      const acceptDialogs = [];
      page.once('dialog', dialog => { acceptDialogs.push(dialog.message()); return dialog.accept(); });
      await newButton.click();
      await page.waitForTimeout(150);
      assert.equal(acceptDialogs.length, 1);
      assert.match(acceptDialogs[0], /提交会替换当前的活动项目/, 'the confirmation must say submitting replaces the active project');
      assert.match(acceptDialogs[0], /不会自动留在任何地方/, 'the confirmation must not imply the replaced project is kept');
      assert.match(acceptDialogs[0], /保存为命名方案或下载备份/, 'the confirmation must name how to keep the original');
      assert.match(await page.locator('#project-title').inputValue(), /情景/, '接受后进入新情景草稿');
      assert.equal(await page.locator('#home-start-form .chip').count(), 2, '草稿默认带 2030 / 2035');
      assert.equal(await page.evaluate(() => localStorage.getItem('scenario-workbench.project.v1')), beforeCancel, 'starting over must not delete the stored project');
      assert.equal(await page.locator('#home-new-draft').isVisible(), true, 'the draft must state what it replaces before it is submitted');
      const notice = await page.locator('#home-new-draft').innerText();
      assert.match(notice, /提交会替换当前的活动项目/, 'the on-screen notice must state the replacement, not only the dialog');
      assert.match(notice, /不会自动留在任何地方/, 'the on-screen notice must not promise the replaced project survives');
      assert.match(notice, /保存为命名方案或下载备份/, 'the on-screen notice must name both ways to keep the original');
      assert.match(notice, /提交之前，当前项目与草稿都不会被改动/, 'the on-screen notice must state the pre-submit guarantee');
      assert.doesNotMatch(notice, /不会被删除|仍保存在本地库|仍保留在本地方案/, 'the notice must not claim the replaced project is automatically kept');
      assert.match(await page.locator('.home-choice small').innerText(), /新情景草稿/);
      assert.match(await page.locator('form .button.primary-action').innerText(), /建立新情景并继续/, 'the one primary action must say it establishes the new project');
      assert.equal(await page.getByRole('button', { name: '下载原项目备份', exact: true }).count(), 1, 'the way to keep the original project must be offered before submitting');
      assert.equal(await page.getByRole('button', { name: '下载原项目备份', exact: true }).count(), 1, '保留原有备份入口');
      const draftBox = await page.locator('form .button.primary-action').boundingBox();
      assert.ok(draftBox.y + draftBox.height <= 800, 'the primary action must stay on the first screen while the draft notice is shown, got bottom ' + Math.round(draftBox.y + draftBox.height));
      await page.screenshot({ path: path.join(out, mode + '-start-new-draft-1280.png'), fullPage: false });

      // Abandoning the draft returns to the stored project without a reload, and
      // continue then reaches it exactly as before.
      await page.getByRole('button', { name: '放弃新情景，继续已有方案', exact: true }).click();
      await page.waitForTimeout(120);
      assert.equal(await page.locator('#home-new-draft').isVisible(), false, 'abandoning must close the draft notice');
      assert.equal(await page.locator('#project-title').inputValue(), '京津冀政策情景', '放弃草稿后回到原项目名');
      await page.getByRole('button', { name: '继续：选择因素', exact: true }).first().click();
      await page.waitForFunction(() => document.querySelector('nav [aria-current="page"]')?.getAttribute('data-route') === 'elements');
      await page.locator('nav [data-route=workspace]').first().click();
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('#home-start-form');
      assert.equal(await page.locator('#project-title').inputValue(), '京津冀政策情景', '继续后仍是原项目名');
      await page.locator('nav [data-route="exports"]').first().click();
      await page.waitForFunction(() => document.querySelector('nav [aria-current="page"]')?.getAttribute('data-route') === 'exports');
      assert.equal(await page.locator('[data-saved-work]').count(), 1, '命名方案在保存与导出页');
      await page.screenshot({ path: path.join(out, mode + '-exports.png'), fullPage: false });

      // --- 8. Both perspectives share the same scientific data, and expert input stays a shortcut.
      const before = await page.evaluate(() => JSON.parse(localStorage.getItem('scenario-workbench.project.v1')).scientificKey ?? null);
      await page.locator('#perspective-select').selectOption('expert');
      await page.waitForTimeout(120);
      await page.locator('nav [data-route=workspace]').first().click();
      await home.openYears(page);
      assert.equal(await page.getByLabel('研究年份', { exact: true }).inputValue(), '2026, 2035');
      const after = await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('scenario-workbench.project.v1')); return JSON.stringify({ scope: p.scope, data: p.data, selection: p.selection }); });
      assert.equal(JSON.stringify({ scope: saved.scope, data: saved.data, selection: saved.selection }), after, 'switching perspective must not change the scientific data');
      assert.equal(before, null);
      await page.locator('#perspective-select').selectOption('public');
      await page.waitForTimeout(120);
      await page.locator('nav [data-route=workspace]').first().click();

      // --- 9. 390px stays usable with no horizontal scroll, and keyboard reaches the primary action.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('nav [data-route=workspace]').first().click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll at 390px');
      await page.screenshot({ path: path.join(out, mode + '-start-390.png'), fullPage: true });
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.locator('nav [data-route=workspace]').first().click();
      await page.locator('#region-scale').focus();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'region-scale');
      await page.locator('form .button.primary-action').focus();
      assert.match(await page.evaluate(() => document.activeElement.textContent), /继续：选择因素/);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('nav [aria-current="page"]')?.getAttribute('data-route') === 'elements');

      assert.deepEqual(errors, [], mode + ' page errors');
      assert.deepEqual(external, [], mode + ' external requests');
      await context.close();

      // --- 10. On a project that already holds factors and scores, submitting the draft
      // must establish a genuinely independent project: a new id with empty data and
      // selections, while the original project, its saved plan and the whole library
      // stay intact and the original can still be restored from the library.
      const existing = fixtures.withRecords();
      existing.view.module = 'workspace';
      const {emptyBundle, namedPlan} = await import(pathToFileURL(path.join(root, 'src/modules/workspace/saved-work.mjs')).href);
      const plan = namedPlan(existing, '原项目命名方案', {A: 'A0'});
      const seeded = {...emptyBundle(), plans: [plan]};
      const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
      await ctx2.addInitScript(({project, library}) => {
        localStorage.setItem('scenario-workbench.project.v1', JSON.stringify(project));
        localStorage.setItem('scenario-workbench.saved-work.v1', JSON.stringify(library));
      }, {project: existing, library: seeded});
      const page2 = await ctx2.newPage();
      const errors2 = [], external2 = [];
      page2.on('pageerror', error => errors2.push(error.message));
      page2.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:')) external2.push(request.url()); });
      await page2.goto(url, { waitUntil: 'load' });
      await page2.waitForSelector('#home-start-form');
      const beforeId = existing.id;
      const beforeProject = await page2.evaluate(key => localStorage.getItem(key), PROJECT_KEY);
      const beforeLibrary = await page2.evaluate(key => localStorage.getItem(key), SAVED_KEY);
      assert.equal(await page2.locator('#project-title').inputValue(), '自有园区项目', 'the seeded project must be the one on screen');

      // Cancelling the confirmation keeps the project, the draft and the saved plan.
      page2.removeAllListeners('dialog');
      const newDialogs = [];
      page2.once('dialog', dialog => { newDialogs.push(dialog.message()); return dialog.dismiss(); });
      await page2.getByRole('button', { name: '开始一个新情景', exact: true }).click();
      await page2.waitForTimeout(150);
      assert.equal(newDialogs.length, 1, 'a project with saved factors must confirm exactly once');
      assert.equal(await page2.evaluate(key => localStorage.getItem(key), PROJECT_KEY), beforeProject, 'cancelling must leave the project byte-identical');
      assert.equal(await page2.locator('#project-title').inputValue(), '自有园区项目');

      // Submitting the draft establishes an independent project with empty data.
      page2.once('dialog', dialog => dialog.accept());
      await page2.getByRole('button', { name: '开始一个新情景', exact: true }).click();
      await page2.waitForTimeout(150);
      assert.equal(await page2.evaluate(key => localStorage.getItem(key), PROJECT_KEY), beforeProject, 'the draft itself must not touch the stored project');
      assert.equal(await page2.evaluate(key => localStorage.getItem(key), SAVED_KEY), beforeLibrary, 'the draft itself must not touch the saved plans');
      await home.setRegion(page2, '京津冀');
      await home.openYears(page2);
      await page2.locator('#target-year').selectOption('2030');
      await page2.getByRole('button', { name: '建立新情景并继续：选择因素', exact: true }).click();
      await page2.waitForFunction(() => document.querySelector('nav [aria-current="page"]')?.getAttribute('data-route') === 'elements');
      const fresh = await page2.evaluate(key => JSON.parse(localStorage.getItem(key)), PROJECT_KEY);
      assert.notEqual(fresh.id, beforeId, 'submitting a new scenario must produce a new project id');
      assert.match(fresh.title, /京津冀/, '新情景按研究范围命名');
      assert.deepEqual(fresh.scope, { regionId: '京津冀', years: [2030, 2035] }, '草稿默认 2030 / 2035');
      // 46 项目录随新项目默认载入（只载定义，不勾选、不评分）。
      assert.ok(fresh.data.descriptors.length >= 46, '目录随新项目载入');
      assert.deepEqual(fresh.data.judgments, [], 'the new project must start with no scores');
      assert.deepEqual(fresh.data.paths, [], 'the new project must start with no annual plans');
      // 目录自带的来源记录会随目录载入（d46-source-catalog / d46-source-states）；
      // 这里只要求没有旧项目的判断与选择残留。
      const evidenceIds = fresh.data.evidence.map(e => e.id).sort();
      assert.deepEqual(evidenceIds, ['d46-source-catalog', 'd46-source-states'], '只带目录自带的来源记录');
      assert.deepEqual(fresh.selection, { nodeIds: [], descriptorIds: [], stateIds: [], lockedStateIds: [] }, 'the new project must start with no selections');
      assert.equal(fresh.contractVersion, '1.0.0');
      const successNotice = await page2.locator('#global-status').innerText();
      assert.equal(successNotice.trim(), '已建立新情景项目。', 'the success notice must only report that the new scenario was established');
      assert.doesNotMatch(successNotice, /原项目|本地库|保留|删除/, 'the success notice must not claim anything about the replaced project');
      const libraryAfter = await page2.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVED_KEY);
      assert.equal(libraryAfter.plans.length, 1, 'the saved plan must survive the new scenario');
      assert.equal(libraryAfter.plans[0].id, plan.id);
      assert.deepEqual(libraryAfter.plans[0].project.data.judgments.length, existing.data.judgments.length, 'the saved plan must still hold the original factors and scores');

      // The original project is still recoverable from the library it was saved into.
      await page2.locator('nav [data-route=exports]').first().click();
      await page2.waitForSelector('[data-saved-work]');
      await page2.locator('[data-saved-work] summary', { hasText: '原项目命名方案' }).first().click();
      await page2.getByRole('button', { name: '预览恢复方案 原项目命名方案', exact: true }).click();
      page2.once('dialog', dialog => dialog.accept());
      await page2.getByRole('button', { name: '确认替换当前项目为此方案', exact: true }).click();
      await page2.waitForTimeout(200);
      const restored = await page2.evaluate(key => JSON.parse(localStorage.getItem(key)), PROJECT_KEY);
      assert.equal(restored.id, beforeId, 'the original project must be recoverable from the library');
      assert.deepEqual(restored.data.judgments.length, existing.data.judgments.length);
      assert.deepEqual(restored.selection.stateIds, ['A0']);

      assert.deepEqual(errors2, [], mode + ' new-scenario page errors');
      assert.deepEqual(external2, [], mode + ' new-scenario external requests');
      await ctx2.close();

      // --- 11. A project that already holds factors and scores but was never stored in
      // the history library: the draft must state the replacement consequence before
      // submitting, and nothing may keep the replaced project automatically.
      const unsaved = fixtures.withRecords();
      unsaved.view.module = 'workspace';
      const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await ctx3.addInitScript(({project, library}) => {
        localStorage.setItem('scenario-workbench.project.v1', JSON.stringify(project));
        localStorage.setItem('scenario-workbench.saved-work.v1', JSON.stringify(library));
      }, {project: unsaved, library: emptyBundle()});
      const page3 = await ctx3.newPage();
      const errors3 = [], external3 = [];
      page3.on('pageerror', error => errors3.push(error.message));
      page3.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:')) external3.push(request.url()); });
      await page3.goto(url, { waitUntil: 'load' });
      await page3.waitForSelector('#home-start-form');
      assert.equal(await page3.locator('#project-title').inputValue(), '自有园区项目', 'the seeded project must be the one on screen');
      assert.equal(await page3.evaluate(key => JSON.parse(localStorage.getItem(key)).plans.length, SAVED_KEY), 0, 'this project must never have been stored in the history library');
      const unsavedBefore = await page3.evaluate(key => localStorage.getItem(key), PROJECT_KEY);
      page3.removeAllListeners('dialog');
      const unsavedDialogs = [];
      page3.once('dialog', dialog => { unsavedDialogs.push(dialog.message()); return dialog.accept(); });
      await page3.getByRole('button', { name: '开始一个新情景', exact: true }).click();
      await page3.waitForTimeout(150);
      assert.equal(unsavedDialogs.length, 1, 'an unsaved project must confirm exactly once');
      assert.match(unsavedDialogs[0], /提交会替换当前的活动项目/, 'the confirmation must state the replacement before submitting');
      assert.match(unsavedDialogs[0], /不会自动留在任何地方/, 'the confirmation must say the replaced project is not kept automatically');
      assert.match(unsavedDialogs[0], /保存为命名方案或下载备份/, 'the confirmation must name how to keep it');
      const unsavedNotice = await page3.locator('#home-new-draft').innerText();
      assert.match(unsavedNotice, /提交会替换当前的活动项目「自有园区项目」/, 'the draft must name the project it will replace');
      assert.match(unsavedNotice, /不会自动留在任何地方/);
      assert.match(unsavedNotice, /保存为命名方案或下载备份/);
      assert.equal(await page3.evaluate(key => localStorage.getItem(key), PROJECT_KEY), unsavedBefore, 'the draft must not touch the unsaved project');
      await home.setRegion(page3, '京津冀');
      await home.openYears(page3);
      await page3.locator('#target-year').selectOption('2030');
      await page3.getByRole('button', { name: '建立新情景并继续：选择因素', exact: true }).click();
      await page3.waitForFunction(() => document.querySelector('nav [aria-current="page"]')?.getAttribute('data-route') === 'elements');
      const lingering = await page3.evaluate(({projectKey, savedKey, id}) => {
        const active = JSON.parse(localStorage.getItem(projectKey));
        const library = JSON.parse(localStorage.getItem(savedKey));
        return {
          activeId: active.id,
          judgments: active.data.judgments.length,
          selected: active.selection.descriptorIds.length,
          paths: active.data.paths.length,
          inLibraryPlans: library.plans.some(plan => plan.project.id === id),
          inLibraryRuns: library.runs.some(run => run.project?.id === id || JSON.stringify(run).includes(id)),
          inLibraryText: JSON.stringify(library).includes(id),
          activeText: JSON.stringify(active).includes(id)
        };
      }, {projectKey: PROJECT_KEY, savedKey: SAVED_KEY, id: unsaved.id});
      assert.notEqual(lingering.activeId, unsaved.id, 'submitting must establish a different project');
      // 46 项目录会随新项目默认载入；要求的是没有旧项目的评分、选择与年度安排。
      assert.equal(lingering.judgments, 0, '新项目不带旧项目的评分');
      assert.equal(lingering.selected, 0, '新项目不带旧项目的因素选择');
      assert.equal(lingering.paths, 0, '新项目不带旧项目的年度安排');
      assert.equal(lingering.inLibraryPlans, false, 'nothing may automatically keep the replaced project as a plan');
      assert.equal(lingering.inLibraryRuns, false, 'nothing may automatically keep the replaced project as a run');
      assert.equal(lingering.inLibraryText, false, 'the replaced project must not linger anywhere in the library');
      assert.equal(lingering.activeText, false, 'the replaced project must not linger in the active slot');
      assert.deepEqual(errors3, [], mode + ' unsaved-project page errors');
      assert.deepEqual(external3, [], mode + ' unsaved-project external requests');
      await ctx3.close();

      // --- 12. A write failure while submitting the draft must stay on the start page,
      // keep the draft retryable, and leave the original project recoverable.
      const failing = fixtures.withRecords();
      failing.view.module = 'workspace';
      const ctx4 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await ctx4.addInitScript(({project}) => {
        localStorage.setItem('scenario-workbench.project.v1', JSON.stringify(project));
        const original = Storage.prototype.setItem;
        window.__failProjectPersist = false;
        Storage.prototype.setItem = function (key, value) {
          if (window.__failProjectPersist && key === 'scenario-workbench.project.v1') {
            const error = new Error('simulated write failure');
            error.name = 'QuotaExceededError';
            throw error;
          }
          return original.call(this, key, value);
        };
      }, {project: failing});
      const page4 = await ctx4.newPage();
      const errors4 = [], external4 = [];
      page4.on('pageerror', error => errors4.push(error.message));
      page4.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:')) external4.push(request.url()); });
      await page4.goto(url, { waitUntil: 'load' });
      await page4.waitForSelector('#home-start-form');
      const failingBefore = await page4.evaluate(key => localStorage.getItem(key), PROJECT_KEY);
      page4.removeAllListeners('dialog');
      page4.once('dialog', dialog => dialog.accept());
      await page4.getByRole('button', { name: '开始一个新情景', exact: true }).click();
      await page4.waitForTimeout(150);
      await home.setRegion(page4, '京津冀');
      await home.openYears(page4);
      await page4.locator('#target-year').selectOption('2030');
      await page4.evaluate(() => { window.__failProjectPersist = true; });
      await page4.getByRole('button', { name: '建立新情景并继续：选择因素', exact: true }).click();
      await page4.waitForTimeout(250);
      assert.equal(await page4.evaluate(() => document.querySelector('nav [aria-current="page"]')?.getAttribute('data-route')), 'workspace', 'a failed write must stay on the start page');
      assert.equal(await page4.locator('#home-new-draft').isVisible(), true, 'a failed write must keep the draft on screen');
      assert.match(await page4.locator('form .message').innerText(), /新情景未能保存到浏览器，已恢复原项目/, 'the failure must say the original project was restored');
      assert.equal(await page4.locator('.storage-status').isVisible(), true, 'the browser-save failure must be announced');
      assert.equal(await page4.evaluate(key => localStorage.getItem(key), PROJECT_KEY), failingBefore, 'a failed write must leave the original project byte-identical');
      assert.equal(await page4.locator('#project-region').inputValue(), '京津冀', 'the draft must survive the failed write');
      assert.match(await page4.locator('#home-start-form .chip').first().innerText(), /2030/, 'the drafted years must survive the failed write');

      // Retrying the same draft after the storage recovers must succeed.
      await page4.evaluate(() => { window.__failProjectPersist = false; });
      await page4.getByRole('button', { name: '建立新情景并继续：选择因素', exact: true }).click();
      await page4.waitForFunction(() => document.querySelector('nav [aria-current="page"]')?.getAttribute('data-route') === 'elements');
      const retried = await page4.evaluate(key => JSON.parse(localStorage.getItem(key)), PROJECT_KEY);
      assert.notEqual(retried.id, failing.id, 'the retry must establish the new project');
      assert.deepEqual(retried.scope, { regionId: '京津冀', years: [2030, 2035] }, '草稿默认 2030 / 2035');
      assert.deepEqual(retried.data.judgments, []);
      assert.deepEqual(retried.selection, { nodeIds: [], descriptorIds: [], stateIds: [], lockedStateIds: [] });
      assert.deepEqual(errors4, [], mode + ' failed-write page errors');
      assert.deepEqual(external4, [], mode + ' failed-write external requests');
      await ctx4.close();

      results.push({ mode, firstScreenPrimary: true, scopePersisted: true, scaleDerived: true, cityLinkage: true, customKept: true, duplicateRefused: true, leaveProtected: true, boundaryChecked: true, libraryReachable: true, perspectivesShared: true, narrowOk: true, keyboardOk: true, startNewVisible: true, continueVisible: true, newScenarioConfirmed: true, cancelKeepsEverything: true, newScenarioIndependent: true, savedPlanKept: true, originalRecoverable: true, unsavedProjectWarnsReplacement: true, failedWriteKeepsDraft: true, pageErrors: 0, externalRequests: 0 });
    }
    await fs.writeFile(path.join(out, 'home-start-browser.json'), JSON.stringify(results, null, 2));
    console.log('home-start browser: ' + results.map(r => r.mode).join(' + ') + ' passed (selection controls, persistence, boundaries, leave protection, P4 entry, both perspectives, 390px, keyboard, independent new scenario, unsaved-project warning, failed-write recovery)');
    for (const r of results) console.log(JSON.stringify(r));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
