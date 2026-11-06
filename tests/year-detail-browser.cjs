const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const key = 'scenario-workbench.project.v1';

// P7-A: the annual detail is read-only. Every check below asserts either what it
// displays or what it must NOT change (scope, anchors, revision, saved paths).
(async () => {
  const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts', 'year-detail');
  await fs.mkdir(out, { recursive: true });
  const { createDemoProject } = await import(pathToFileURL(path.join(root, 'src/fixtures/demo.mjs')).href);
  const browser = await chromium.launch({args:['--no-sandbox','--disable-gpu'], executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const results = [];

  function fixture({ interpolation = 'none', points = null, stateId = 'a-low', validYears = null, stateRegion = undefined, second = false, noPath = false } = {}) {
    const p = createDemoProject();
    p.view.module = 'timeline';
    p.data.paths[0].interpolation = interpolation;
    if (points) p.data.paths[0].points = points;
    p.data.paths[0].points[0].stateId = stateId;
    if (validYears) p.data.states.find(s => s.id === 'a-low').validYears = validYears;
    if (stateRegion !== undefined) p.data.states.find(s => s.id === 'a-low').scope = { regionId: stateRegion };
    if (second) {
      const copy = structuredClone(p.data.paths[0]);
      copy.id = 'path-a-alt';
      copy.points = [{ year: 2026, value: 30, stateId: null, origin: 'user-assumption', evidenceRefs: ['fixture-source'] }];
      p.data.paths.push(copy);
    }
    if (noPath) p.data.paths = p.data.paths.filter(item => item.descriptorId !== 'descriptor-a');
    return p;
  }

  async function open(url, data, { expert = false, width = 1440, height = 1080 } = {}) {
    const project = structuredClone(data);
    project.view.perspective = expert ? 'expert' : 'public';
    const ctx = await browser.newContext({ viewport: { width, height } });
    await ctx.addInitScript(({ project, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(project)); }, { project, key });
    const page = await ctx.newPage(), errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:')) external.push(r.url()); });
    await page.goto(url);
    await page.locator('.year-detail').waitFor();
    return { ctx, page, errors, external };
  }

  const stored = page => page.evaluate(key => localStorage.getItem(key), key);
  const yearInput = page => page.getByLabel('查看年份', { exact: true });
  const pathCard = (page, id = 'path-a') => page.locator('[data-year-path="' + id + '"]');
  const setYear = async (page, value) => { await yearInput(page).fill(''); await yearInput(page).fill(String(value)); };
  const detail = page => page.locator('.year-detail');

  try {
    for (const [mode, url] of [['source', process.env.APP_URL || 'http://127.0.0.1:4180'], ['offline', pathToFileURL(path.join(root, 'dist/scenario-workbench.html')).href]]) {
      const checks = [];

      // 1. Reads the saved path: real anchor, unit, source and recorded state.
      {
        const { ctx, page, errors, external } = await open(url, fixture());
        assert.equal(await page.locator('.year-detail h3').innerText(), '按年查看（只读）');
        assert.equal(await yearInput(page).inputValue(), '2026', 'default year is the first研究年份');
        assert.equal(await pathCard(page).getAttribute('data-year-kind'), 'anchor');
        assert.equal(await pathCard(page).getAttribute('data-year-value'), '20');
        assert.equal(await pathCard(page).getAttribute('data-year-unit'), '示例指数');
        const text = await pathCard(page).innerText();
        assert.match(text, /原始锚点/); assert.match(text, /单位：示例指数/); assert.match(text, /路径 path-a · v1/);
        assert.match(text, /机制样例 · fixture-six-level｜六层分类与混合深度验收样例/);
        assert.match(text, /记录状态：示例低档；范围匹配/);
        assert.equal(await pathCard(page).getAttribute('data-year-state'), 'applicable');
        assert.match(await detail(page).innerText(), /切换查看年份不改研究范围、路径锚点或项目修订号/);
        await page.locator('[data-year-quick="2035"]').click();
        assert.equal(await pathCard(page).getAttribute('data-year-value'), '70');
        assert.equal(await pathCard(page).getAttribute('data-year-state'), 'applicable');
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        await page.screenshot({ path: path.join(out, mode + '-detail-1280.png'), fullPage: true });
        await ctx.close();
        checks.push('reads the saved anchor, unit, source and recorded state');
      }

      // 2. Switching the viewed year is display-only.
      {
        const { ctx, page, errors } = await open(url, fixture());
        const before = await stored(page), beforeRevision = JSON.parse(before).revision;
        await setYear(page, 2032);
        await page.locator('[data-year-quick="2035"]').click();
        await page.locator('[data-year-quick="2026"]').click();
        await setYear(page, 2028);
        assert.equal(await stored(page), before, 'viewing another year must not write the project');
        assert.equal(JSON.parse(await stored(page)).revision, beforeRevision);
        assert.equal(await page.getByLabel('节点1年份', { exact: true }).inputValue(), '2026');
        assert.equal(await page.getByLabel('节点1数值', { exact: true }).inputValue(), '20');
        assert.equal(await page.locator('.timeline-table tbody tr').count(), 2);
        assert.equal(await page.locator('.timeline-message').innerText(), '');
        assert.deepEqual(errors, []);
        await ctx.close();
        checks.push('viewing another year changes nothing but the readout');
      }

      // 3. Interpolation shows its method and the anchors it used.
      {
        const linear = await open(url, fixture({ interpolation: 'linear' }));
        await setYear(linear.page, 2032);
        assert.equal(await pathCard(linear.page).getAttribute('data-year-kind'), 'interpolated');
        assert.equal(await pathCard(linear.page).getAttribute('data-year-value'), '53.3333');
        const text = await pathCard(linear.page).innerText();
        assert.match(text, /推算值/); assert.match(text, /linear · 线性内插/); assert.match(text, /所用锚点：2026 = 20 → 2035 = 70/);
        assert.match(text, /推算值不继承端点状态/);
        assert.equal(await pathCard(linear.page).getAttribute('data-year-state'), 'interpolated');
        assert.deepEqual(linear.errors, []); await linear.ctx.close();

        const step = await open(url, fixture({ interpolation: 'step' }));
        await setYear(step.page, 2032);
        assert.equal(await pathCard(step.page).getAttribute('data-year-kind'), 'interpolated');
        assert.equal(await pathCard(step.page).getAttribute('data-year-value'), '20');
        assert.match(await pathCard(step.page).innerText(), /step · 取左端值保持/);
        assert.deepEqual(step.errors, []); await step.ctx.close();

        const none = await open(url, fixture({ interpolation: 'none' }));
        await setYear(none.page, 2032);
        assert.equal(await pathCard(none.page).getAttribute('data-year-kind'), 'no-interpolation');
        assert.match(await pathCard(none.page).innerText(), /插值方式为 none（仅锚点）/);
        assert.deepEqual(none.errors, []); await none.ctx.close();
        checks.push('linear, step and none are told apart with method and anchors');
      }

      // 4. A missing anchor is a gap, never a zero.
      {
        const { ctx, page, errors } = await open(url, fixture({ interpolation: 'linear', points: [{ year: 2026, value: 20, stateId: 'a-low', origin: 'source', evidenceRefs: ['fixture-source'] }, { year: 2030, value: null, stateId: null, origin: 'source', evidenceRefs: ['fixture-source'] }, { year: 2035, value: 70, stateId: 'a-high', origin: 'source', evidenceRefs: ['fixture-source'] }] }));
        await setYear(page, 2032);
        assert.equal(await pathCard(page).getAttribute('data-year-kind'), 'missing-breakpoint');
        assert.equal(await pathCard(page).getAttribute('data-year-value'), 'none');
        const text = await pathCard(page).innerText();
        assert.match(text, /缺口：相邻锚点数值缺失/); assert.match(text, /不跨缺失点插值/);
        assert.match(text, /相邻锚点：2030 = 缺失 → 2035 = 70/);
        await setYear(page, 2030);
        assert.equal(await pathCard(page).getAttribute('data-year-kind'), 'anchor-missing');
        assert.equal(await pathCard(page).getAttribute('data-year-value'), 'none');
        assert.match(await pathCard(page).innerText(), /空值不等于 0/);
        await page.screenshot({ path: path.join(out, mode + '-missing-1280.png'), fullPage: true });
        assert.deepEqual(errors, []); await ctx.close();
        checks.push('a missing anchor stays a gap and is not rendered as zero');
      }

      // 5. Out of range is a gap, with no extrapolation.
      {
        const { ctx, page, errors } = await open(url, fixture({ interpolation: 'linear' }));
        await setYear(page, 2020);
        assert.equal(await pathCard(page).getAttribute('data-year-kind'), 'out-of-range');
        assert.match(await pathCard(page).innerText(), /路径节点范围：2026—2035/);
        assert.match(await pathCard(page).innerText(), /不外推/);
        await setYear(page, 2400);
        // 2400 is outside the frozen contract range, so it is refused as an invalid
        // viewing year rather than being shown as an out-of-range readout.
        assert.equal(await page.locator('[data-year-gap="invalid-year"]').count(), 1);
        assert.match(await detail(page).innerText(), /查看年份须在1900—2300之间/);
        assert.equal(await page.locator('.year-detail-path').count(), 0);
        await setYear(page, 2020);
        assert.equal(await pathCard(page).getAttribute('data-year-kind'), 'out-of-range');
        assert.equal(await pathCard(page).getAttribute('data-year-value'), 'none');
        assert.deepEqual(errors, []); await ctx.close();
        checks.push('outside the node range is a gap and refuses to extrapolate');
      }

      // 6. A candidate without a path shows the gap instead of a number.
      {
        const { ctx, page, errors } = await open(url, fixture({ noPath: true }));
        assert.equal(await page.locator('[data-year-gap="no-path"]').count(), 1);
        const text = await page.locator('[data-year-gap="no-path"]').innerText();
        assert.match(text, /没有时间路径/); assert.match(text, /政策摘要中/); assert.match(text, /「示例变量A」/);
        assert.equal(await page.locator('.year-detail-path').count(), 0);
        assert.equal(await yearInput(page).inputValue(), '2026');
        await setYear(page, 2027);
        assert.equal(await page.locator('[data-year-gap="no-path"]').count(), 1);
        assert.equal(await page.locator('.year-detail-path').count(), 0);
        await page.screenshot({ path: path.join(out, mode + '-nopath-1280.png'), fullPage: true });
        assert.deepEqual(errors, []); await ctx.close();
        checks.push('a candidate with no path reports the gap, not a value');
      }

      // 7. The recorded link and its current applicability are told apart.
      // 适用范围按检算口径分三档：未知（年份未声明/格式待核、地区未知）→ 适用范围待核；
      // 明确不适用（年份或地区有明确依据却对不上）→ 说明具体原因；都匹配才说范围匹配。
      {
        const none = await open(url, fixture({ stateId: null }));
        assert.match(await pathCard(none.page).innerText(), /该锚点未关联任何状态/);
        assert.equal(await pathCard(none.page).getAttribute('data-year-state'), 'none');
        assert.deepEqual(none.errors, []); await none.ctx.close();

        // 明确匹配：归属、年份、地区都有依据。
        const matched = await open(url, fixture());
        assert.match(await pathCard(matched.page).innerText(), /记录状态：示例低档/);
        assert.match(await pathCard(matched.page).innerText(), /范围匹配：状态定义属于当前因素，适用年份含 2026，地区与项目范围一致/);
        assert.equal(await pathCard(matched.page).getAttribute('data-year-state'), 'applicable');
        await matched.page.locator('[data-year-quick="2035"]').click();
        assert.match(await pathCard(matched.page).innerText(), /范围匹配：状态定义属于当前因素，适用年份含 2035/);
        assert.equal(await pathCard(matched.page).getAttribute('data-year-state'), 'applicable');
        assert.deepEqual(matched.errors, []); await matched.ctx.close();

        // 适用范围待核：年份未声明 —— 保留原状态名，不得读成错年。
        const undeclared = await open(url, fixture({ validYears: [] }));
        const undeclaredText = await pathCard(undeclared.page).innerText();
        assert.match(undeclaredText, /记录状态：示例低档/);
        assert.match(undeclaredText, /适用范围待核：状态未声明适用年份，不代表永久有效/);
        assert.doesNotMatch(undeclaredText, /当前不适用/);
        assert.doesNotMatch(undeclaredText, /范围匹配/);
        assert.equal(await pathCard(undeclared.page).getAttribute('data-year-state'), 'unknown-scope');
        assert.deepEqual(undeclared.errors, []); await undeclared.ctx.close();

        // 适用范围待核：状态地区未知。
        const noRegion = await open(url, fixture({ stateRegion: null }));
        const noRegionText = await pathCard(noRegion.page).innerText();
        assert.match(noRegionText, /记录状态：示例低档/);
        assert.match(noRegionText, /适用范围待核：状态地区范围未知/);
        assert.doesNotMatch(noRegionText, /范围匹配/);
        assert.equal(await pathCard(noRegion.page).getAttribute('data-year-state'), 'unknown-scope');
        assert.deepEqual(noRegion.errors, []); await noRegion.ctx.close();

        // 明确不适用：年份有依据却对不上。
        const stale = await open(url, fixture({ validYears: [2030, 2035] }));
        const text = await pathCard(stale.page).innerText();
        assert.match(text, /记录状态：示例低档/);
        assert.match(text, /当前不适用：状态在所选年不适用：状态定义的适用年份不含 2026/);
        assert.doesNotMatch(text, /适用范围待核/);
        assert.equal(await pathCard(stale.page).getAttribute('data-year-state'), 'not-applicable');
        await setYear(stale.page, 2035);
        assert.match(await pathCard(stale.page).innerText(), /记录状态：示例高档；范围匹配/);
        assert.equal(await pathCard(stale.page).getAttribute('data-year-state'), 'applicable');
        assert.deepEqual(stale.errors, []); await stale.ctx.close();

        // 明确不适用：地区有依据却对不上。
        const moved = await open(url, fixture({ stateRegion: '另一地区' }));
        const movedText = await pathCard(moved.page).innerText();
        assert.match(movedText, /记录状态：示例低档/);
        assert.match(movedText, /当前不适用：状态地区与项目不符：状态定义的地区（另一地区）与项目范围（示例地区（非真实政策））不一致/);
        assert.doesNotMatch(movedText, /适用范围待核/);
        assert.equal(await pathCard(moved.page).getAttribute('data-year-state'), 'not-applicable');
        assert.deepEqual(moved.errors, []); await moved.ctx.close();
        checks.push('recorded state and current applicability are separate');
      }

      // 8. Multiple paths are shown separately and never merged.
      {
        const { ctx, page, errors } = await open(url, fixture({ second: true }));
        assert.equal(await page.locator('.year-detail-path').count(), 2);
        assert.match(await detail(page).innerText(), /多条路径分别显示；单位不同不合并、不相加/);
        assert.equal(await pathCard(page, 'path-a').getAttribute('data-year-value'), '20');
        assert.equal(await pathCard(page, 'path-a-alt').getAttribute('data-year-value'), '30');
        assert.equal(await pathCard(page, 'path-a-alt').getAttribute('data-year-unit'), '示例指数');
        await setYear(page, 2026);
        assert.equal(await page.locator('.year-detail-path').count(), 2);
        await page.screenshot({ path: path.join(out, mode + '-multipath-1280.png'), fullPage: true });
        assert.deepEqual(errors, []); await ctx.close();
        checks.push('several paths are shown separately, never merged');
      }

      // 9. Reading a year does not break the existing path editing.
      {
        const { ctx, page, errors } = await open(url, fixture({ interpolation: 'linear' }));
        await setYear(page, 2032);
        const before = JSON.parse(await stored(page));
        await page.getByLabel('节点1数值', { exact: true }).fill('30');
        assert.equal(JSON.parse(await stored(page)).revision, before.revision, 'the draft is not a write');
        await page.getByRole('button', { name: '保存路径', exact: true }).click();
        const after = JSON.parse(await stored(page));
        assert.equal(after.revision, before.revision + 1);
        assert.equal(after.data.paths[0].points[0].value, 30);
        assert.equal(after.data.paths[0].points[0].stateId, null);
        // The readout keeps the year it was showing; read the edited anchor explicitly.
        await setYear(page, 2026);
        assert.equal(await pathCard(page).getAttribute('data-year-value'), '30');
        assert.match(await pathCard(page).innerText(), /该锚点未关联任何状态/);
        await setYear(page, 2032);
        assert.equal(await pathCard(page).getAttribute('data-year-value'), '56.6667');
        assert.deepEqual(errors, []); await ctx.close();
        checks.push('the original path editing still works after reading a year');
      }

      // 10. Keyboard and 390px.
      {
        const { ctx, page, errors } = await open(url, fixture({ interpolation: 'linear' }));
        await yearInput(page).focus();
        await page.keyboard.press('Control+a'); await page.keyboard.type('2032');
        assert.equal(await yearInput(page).inputValue(), '2032');
        assert.equal(await pathCard(page).getAttribute('data-year-value'), '53.3333');
        await page.locator('[data-year-quick="2035"]').focus();
        await page.keyboard.press('Enter');
        assert.equal(await yearInput(page).inputValue(), '2035');
        assert.equal(await pathCard(page).getAttribute('data-year-value'), '70');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-year-quick')), '2035');
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.equal(await yearInput(page).isVisible(), true);
        await page.screenshot({ path: path.join(out, mode + '-detail-390.png'), fullPage: true });
        assert.deepEqual(errors, []); await ctx.close();
        checks.push('keyboard drives the year control and 390px stays readable');
      }

      // 11. The expert view can still reach the evidence record.
      {
        const { ctx, page, errors } = await open(url, fixture(), { expert: true });
        const text = await pathCard(page).innerText();
        assert.match(text, /依据ID：fixture-source/);
        assert.match(await detail(page).innerText(), /fixture-source/);
        assert.deepEqual(errors, []); await ctx.close();
        checks.push('the expert view reaches the evidence record');
      }

      results.push({ mode, passed: true, checks });
    }
    await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
