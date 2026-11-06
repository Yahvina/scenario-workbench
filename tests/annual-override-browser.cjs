const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const key = 'scenario-workbench.project.v1';
const archiveKey = 'scenario-workbench.saved-work.v1';

// P7-B/P7-C1: the override preview is read-only, and the hand-computed example comes from
// docs/proposals/annual-override-state-rules.md (mechanism example, not real policy):
// low [0,60) / mid [60,80) / high [80,100]; path 2026 = 50 -> 2035 = 100 linear.
//
// P7-C1 把两个方向分开跑：
//   正向（bench）—— 独立测试入口 tests/entry/annual-override-fixture.html，绑定由该入口显式注入；
//   负控（source / offline）—— 正式入口 index.html 与默认离线产物，项目 JSON 自带完整绑定、
//                                 页面还预先设置旧的全局开关，两者都必须仍然停在待核。
const FIXTURE_ENTRY = '/tests/entry/annual-override-fixture.html';
const LEGACY_FLAG = '__scenarioWorkbenchReviewBindingFixture';
const FIXTURE_SLOT = '__scenarioWorkbenchReviewBindingFixtureNow';

(async () => {
  const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts', 'annual-override-preview');
  await fs.mkdir(out, { recursive: true });
  const { createDemoProject } = await import(pathToFileURL(path.join(root, 'src/fixtures/demo.mjs')).href);
  const { emptyBundle, namedPlan } = await import(pathToFileURL(path.join(root, 'src/modules/workspace/saved-work.mjs')).href);
  const browser = await chromium.launch({args:['--no-sandbox','--disable-gpu'], executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const results = [];
  const appUrl = process.env.APP_URL || 'http://127.0.0.1:4181';
  const distUrl = pathToFileURL(path.join(root, 'dist/scenario-workbench.html')).href;

  const range = (min, max, minInclusive = true, maxInclusive = false) => ({ min, max, minInclusive, maxInclusive });
  const binding = (extra = {}) => ({
    verified: true, purpose: '机制示例：单年采用值核对', region: '示例地区（非真实政策）',
    year: 2030, indicator: '示例占比', unit: '%', denominator: '示例分母', baseYear: 2025, ...extra
  });

  function fixture({
    override = {}, states = 'three', bindingValue = null, qualitative = false, multiParameter = false,
    points = null, unit = '%', stateId = 'a-low', second = false, noPath = false
  } = {}) {
    const p = createDemoProject();
    p.view.module = 'timeline';
    p.data.paths[0].interpolation = 'linear';
    p.data.paths[0].unit = unit;
    p.data.paths[0].points = points || [
      { year: 2026, value: 50, stateId: null, origin: 'source', evidenceRefs: ['fixture-source'] },
      { year: 2035, value: 100, stateId: null, origin: 'source', evidenceRefs: ['fixture-source'] }
    ];
    if (stateId) p.data.paths[0].points[0].stateId = stateId;

    // 三个状态：低/中/高。descriptor-a 的既有状态换成这一组，保持契约自洽。
    const base = p.data.states.find(s => s.id === 'a-low');
    const low = { ...structuredClone(base), id: 'r-low', label: '低', range: range(0, 60), unit: '%', validYears: [2026, 2030, 2031, 2035] };
    const mid = { ...structuredClone(base), id: 'r-mid', label: '中', range: range(60, 80), unit: '%', validYears: [2026, 2030, 2031, 2035] };
    const high = { ...structuredClone(base), id: 'r-high', label: '高', range: range(80, 100, true, true), unit: '%', validYears: [2026, 2030, 2031, 2035] };
    const chosen = states === 'two' ? [low, mid] : states === 'overlap' ? [low, mid, { ...high, range: range(79, 100, true, true) }]
      : states === 'no-range' ? [low, { ...mid, range: null }, high]
        : states === 'wrong-unit' ? [low, { ...mid, unit: '万千瓦' }, high] : [low, mid, high];
    p.data.states = p.data.states.filter(s => s.descriptorId !== 'descriptor-a').concat(chosen);
    p.data.descriptors.find(d => d.id === 'descriptor-a').stateIds = chosen.map(s => s.id);
    if (stateId) p.data.paths[0].points[0].stateId = chosen.find(s => s.id === 'r-low') ? 'r-low' : chosen[0].id;

    // 项目数据自己携带的绑定：只有负控才会用到（正式页面必须把它当未核验）。
    const target = p.data.paths[0];
    if (bindingValue || qualitative || multiParameter) {
      target.reviewBinding = { ...(bindingValue || {}), ...(qualitative ? { qualitative: true } : {}), ...(multiParameter ? { multiParameter: true } : {}) };
      if (!bindingValue) { delete target.reviewBinding.verified; target.reviewBinding.verified = false; }
    }
    if (second) {
      const copy = structuredClone(target);
      copy.id = 'path-a-alt';
      copy.points = [{ year: 2026, value: 30, stateId: null, origin: 'source', evidenceRefs: ['fixture-source'] }];
      p.data.paths.push(copy);
    }
    if (noPath) p.data.paths = p.data.paths.filter(item => item.descriptorId !== 'descriptor-a');
    return { project: p, override, chosen };
  }

  // 一份真实的、通过 validateBundle 的历史库：用来证明预览不改动已存历史。
  const archiveProject = createDemoProject();
  archiveProject.scope = { regionId: '示例地区（非真实政策）', years: [2030] };
  const archive = { ...emptyBundle(), plans: [namedPlan(archiveProject, '自有园区方案', {}, 'own-plan')] };

  async function open(url, data, {
    expert = false, width = 1440, height = 1080, seedArchive = true,
    fixtureBindings = null, legacyFlag = false
  } = {}) {
    const project = structuredClone(data);
    project.view.perspective = expert ? 'expert' : 'public';
    const ctx = await browser.newContext({ viewport: { width, height } });
    await ctx.addInitScript(({ project, key, archiveKey, archive, seedArchive, fixtureBindings, legacyFlag, LEGACY_FLAG, FIXTURE_SLOT }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(project));
      if (seedArchive && !localStorage.getItem(archiveKey)) localStorage.setItem(archiveKey, JSON.stringify(archive));
      // 负控刻意预置 P7-B 时代的旧全局开关：正式页面不认识它，因此它不该有任何效果。
      if (legacyFlag) globalThis[LEGACY_FLAG] = true;
      // 独立测试入口自己读这个槽；正式入口 index.html 里的代码完全不知道它存在。
      if (fixtureBindings) globalThis[FIXTURE_SLOT] = fixtureBindings;
    }, { project, key, archiveKey, archive, seedArchive, fixtureBindings, legacyFlag, LEGACY_FLAG, FIXTURE_SLOT });
    const page = await ctx.newPage(), errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:')) external.push(r.url()); });
    await page.goto(url);
    await page.locator('.year-detail').waitFor();
    return { ctx, page, errors, external };
  }

  const stored = page => page.evaluate(key => localStorage.getItem(key), key);
  const archiveStored = page => page.evaluate(key => localStorage.getItem(key), archiveKey);
  const yearInput = page => page.getByLabel('查看年份', { exact: true });
  const setYear = async (page, value) => { await yearInput(page).fill(''); await yearInput(page).fill(String(value)); };
  const card = (page, id = 'path-a') => page.locator('[data-year-path="' + id + '"]');
  const box = (page, id = 'path-a') => page.locator('[data-annual-override="' + id + '"]');
  const inputOf = (page, id = 'path-a') => page.locator('[data-override-input="' + id + '"]');
  const verdict = (page, id = 'path-a') => page.locator('[data-annual-override="' + id + '"] [data-override-verdict]');
  const reasons = (page, id = 'path-a') => page.locator('[data-annual-override="' + id + '"] .annual-override-reasons').innerText();
  const adopted = (page, id = 'path-a') => page.locator('[data-annual-override="' + id + '"] [data-override-value]').getAttribute('data-override-value');
  const setOverride = async (page, value, id = 'path-a') => { await inputOf(page, id).fill(''); await inputOf(page, id).fill(String(value)); };
  const clearOverride = async (page, id = 'path-a') => page.locator('[data-override-clear="' + id + '"]').click();
  // 插值点没有锚点显式记录的对照状态，按规则必须由用户显式选一个；测试里等价于点这一项。
  const chooseReference = async (page, value, id = 'path-a') => {
    await page.locator('[data-annual-override="' + id + '"] [data-override-reference-select]').selectOption(value);
  };
  // 2030 是插值点，没有锚点显式记录的对照状态，按规则必须显式选一个才能核对。
  const ready = async (page, year = 2030, reference = 'r-mid') => { await setYear(page, year); await chooseReference(page, reference); };
  // 正向例一律通过独立测试入口把绑定交给预览。
  const bench = (bindings = { 'path-a': binding() }) => ({ fixtureBindings: bindings });

  try {
    // ---------- 正向：独立测试入口 ----------
    {
      const mode = 'bench', checks = [];
      const url = appUrl + FIXTURE_ENTRY;

      // 1. 75 仍在原状态范围；基线本来是 650/9。覆盖只作用于 2030，2031 读自己的基线。
      {
        const { ctx, page, errors, external } = await open(url, fixture().project, bench());
        await ready(page);
        const before = await stored(page), archiveBefore = await archiveStored(page);
        await setOverride(page, 75);
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'within');
        assert.equal(await verdict(page).innerText(), '判定：仍在原状态范围');
        assert.equal(await box(page).getAttribute('data-override-year'), '2030');
        const text = await reasons(page);
        assert.match(text, /仍在原状态「中」的区间 \[60, 80\) % 内/);
        assert.match(text, /不自动改分/);
        assert.match(await card(page).innerText(), /基线：72.2222 %/);
        assert.equal(await adopted(page), '75');
        // 2031 基线仍由路径自己算出：700/9。覆盖值与对照状态都不跨年复制。
        await setYear(page, 2031);
        assert.match(await card(page).innerText(), /基线：77.7778 %/);
        assert.equal(await inputOf(page).inputValue(), '', 'the 2030 override must not leak into 2031');
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'baseline', '2031 starts with no override of its own');
        await setOverride(page, 78);
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'pending', '2031 has no reference choice of its own');
        assert.match(await reasons(page), /未选择对照状态：请显式选一个状态用于本次核对，不从邻年复制/);
        await setYear(page, 2030);
        assert.equal(await inputOf(page).inputValue(), '75', 'returning to 2030 keeps its own value');
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'within', '2030 keeps its own reference choice too');
        // 预览没写入任何存储。
        assert.equal(await stored(page), before, 'the project bytes must not change');
        assert.equal(await archiveStored(page), archiveBefore, 'the saved-work archive bytes must not change');
        checks.push({
          name: '75 stays within, 2031 keeps its own 700/9 baseline', passed: true,
          detail: 'verdict=within; card baseline 72.2222 / 77.7778; inputs isolated per year; localStorage identical',
          screenshot: path.join(out, mode + '-within-1280.png')
        });
        await page.screenshot({ path: path.join(out, mode + '-within-1280.png'), fullPage: true });
        assert.equal(errors.length, 0, errors.join('; '));
        assert.equal(external.length, 0, external.join('; '));
        await ctx.close();
      }

      // 2. 80 越界且唯一建议；79.9999 仍属中档（显示四舍五入不参与判档）。
      {
        const { ctx, page } = await open(url, fixture().project, bench());
        await ready(page);
        await setOverride(page, 80);
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'out-of-range');
        assert.equal(await verdict(page).innerText(), '判定：已超出原状态范围');
        const text = await reasons(page);
        assert.match(text, /越出上界 80（不含上界）/);
        assert.match(text, /其他适用状态均可排查，恰好一档命中「高」\[80, 100\] %/);
        assert.match(text, /建议复核为「高」；仅供核对，需你确认/);
        assert.equal(await page.locator('[data-override-candidates="1"]').count(), 1);

        await setOverride(page, 79.9999);
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'within');
        assert.equal(await adopted(page), '79.9999', 'the saved precision must be shown as-is');
        assert.match(await reasons(page), /仍在原状态「中」/);
        checks.push({
          name: '80 is out of range with one candidate; 79.9999 still counts as middle', passed: true,
          detail: 'verdict=out-of-range then within; data-override-value keeps 79.9999 rather than 80',
          screenshot: path.join(out, mode + '-boundary-1280.png')
        });
        await page.screenshot({ path: path.join(out, mode + '-boundary-1280.png'), fullPage: true });
        await ctx.close();
      }

      // 3. 0 是有效值（命中低档）；清空恢复基线；清空不写 0。
      {
        const { ctx, page } = await open(url, fixture().project, bench());
        await ready(page);
        await setOverride(page, 0);
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'out-of-range');
        assert.equal(await adopted(page), '0');
        assert.match(await reasons(page), /恰好一档命中「低」\[0, 60\)/);
        assert.equal(await page.locator('[data-override-candidates="1"]').count(), 1);

        await clearOverride(page);
        assert.equal(await inputOf(page).inputValue(), '');
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'baseline');
        assert.equal(await adopted(page), 'cleared');
        assert.match(await reasons(page), /覆盖已清空：回到该年基线 72.2222/);
        assert.match(await reasons(page), /清空与显式填 0 是两条不同的读法/);
        checks.push({
          name: '0 is adopted, clearing restores the 72.2222 baseline', passed: true,
          detail: '0 -> out-of-range/hit low; clear -> verdict=baseline, data-override-value=cleared',
          screenshot: path.join(out, mode + '-clear-1280.png')
        });
        await page.screenshot({ path: path.join(out, mode + '-clear-1280.png'), fullPage: true });
        await ctx.close();
      }

      // 4. 重叠、缺口、范围未知、单位不符、定性、多参数各自进入正确的判定。
      {
        const cases = [
          { name: 'overlap', data: fixture({ states: 'overlap' }).project, override: 79.5, expect: 'multiple', match: /不按排序取第一档/ },
          { name: 'gap', data: fixture({ states: 'three' }).project, override: 100.5, expect: 'gap', match: /未落入已定义状态/ },
          { name: 'no-range', data: fixture({ states: 'no-range' }).project, override: 75, expect: 'pending', match: /没有有效数值区间/ },
          { name: 'wrong-unit', data: fixture({ states: 'wrong-unit' }).project, override: 75, expect: 'pending', match: /单位不一致（状态 万千瓦，指标 %）/ },
          { name: 'qualitative', bindings: { 'path-a': binding({ qualitative: true }) }, data: fixture().project, override: 75, expect: 'pending', match: /状态为定性/ },
          { name: 'multi', bindings: { 'path-a': binding({ multiParameter: true }) }, data: fixture().project, override: 95, expect: 'pending', match: /多参数状态缺少带版本的组合规则/ },
          { name: 'no-binding', bindings: {}, data: fixture().project, override: 75, expect: 'pending', match: /生产项目缺少显式指标绑定/ },
          { name: 'other-year', data: fixture().project, override: 75, expect: 'pending', match: /绑定年份（2030）与查看年份（2031）不一致/ }
        ];
        const seen = [];
        for (const item of cases) {
          const { ctx, page } = await open(url, item.data, bench(item.bindings));
          const year = item.name === 'other-year' ? 2031 : 2030;
          await setYear(page, year);
          // 口径待核的各例在选对照状态之前就已经是 pending；先选上，确保判定不受选择顺序影响。
          if (item.name !== 'no-binding') await chooseReference(page, item.name === 'multi' ? 'r-high' : 'r-mid');
          await setOverride(page, item.override);
          const got = await verdict(page).getAttribute('data-override-verdict');
          assert.equal(got, item.expect, item.name + ' -> ' + got);
          assert.match(await reasons(page), item.match);
          if (item.expect === 'pending') {
            assert.equal(await page.locator('[data-annual-override="path-a"] [data-override-candidates="0"]').count(), 1, item.name + ' must not offer a candidate');
          }
          seen.push(item.name + '=' + got);
          await ctx.close();
        }
        checks.push({
          name: 'overlap, gap, unknown range, unit mismatch, qualitative, multi-parameter, missing binding and other year', passed: true,
          detail: seen.join('; '),
          screenshot: null
        });
      }

      // 5. 缺口年份：没有基线值时不写 0，也不给建议。
      {
        const { ctx, page } = await open(url, fixture().project, bench());
        await setYear(page, 2040); // 路径范围外 → 缺口
        await chooseReference(page, 'r-mid');
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'pending');
        assert.equal(await box(page).getAttribute('data-override-year'), '2040');
        assert.match(await card(page).innerText(), /缺口：该年不在路径节点范围内/);
        assert.match(await reasons(page), /基线/);
        assert.equal(await adopted(page), 'cleared');
        const none = await page.locator('[data-annual-override="path-a"] [data-override-baseline="none"]').count();
        assert.equal(none, 1, 'a missing baseline must be reported as none, not 0');
        checks.push({
          name: 'a year outside the path reports a missing baseline, never 0', passed: true,
          detail: 'year=2040 -> verdict=pending, data-override-baseline=none, no candidate offered',
          screenshot: path.join(out, mode + '-out-of-range-1280.png')
        });
        await page.screenshot({ path: path.join(out, mode + '-out-of-range-1280.png'), fullPage: true });
        await ctx.close();
      }

      // 6. 未完成输入被拦住，不会被静默当成清空；键盘可用。
      {
        const { ctx, page } = await open(url, fixture().project, bench());
        await ready(page);
        await inputOf(page).focus();
        await page.keyboard.type('-');
        assert.equal(await inputOf(page).evaluate(node => node.validity.badInput), true);
        assert.equal(await page.locator('[data-override-pending="incomplete"]').count(), 1);
        assert.match(await page.locator('[data-override-pending="incomplete"]').innerText(), /未完成的输入既不是 0，也不是清空覆盖/);
        await page.keyboard.type('5');
        // -5 是一个完整的数字，但它落在三个已定义区间之外（低档下界为 0），
        // 因此正确的判定是「未落入已定义状态」；这同时证明补完输入后确实进入了判定。
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'gap');
        assert.equal(await inputOf(page).inputValue(), '-5');
        assert.match(await reasons(page), /未落入已定义状态/);
        // 键盘清空后恢复基线。
        await inputOf(page).focus();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'baseline');
        checks.push({
          name: 'a half-typed score is blocked and the control is keyboard driven', passed: true,
          detail: 'badInput -> data-override-pending=incomplete; typing 5 -> complete -5 judged as gap; Control+A/Delete -> baseline',
          screenshot: null
        });
        await ctx.close();
      }

      // 7. 无路径的候选因素照常报缺口，不给覆盖输入。
      {
        const { ctx, page } = await open(url, fixture({ noPath: true }).project, bench());
        await page.locator('[data-year-gap="no-path"]').waitFor();
        assert.equal(await page.locator('[data-annual-override]').count(), 0, 'no path means no override box');
        checks.push({
          name: 'a candidate with no path shows the gap and no override box', passed: true,
          detail: '[data-year-gap=no-path] present; [data-annual-override] count 0',
          screenshot: null
        });
        await ctx.close();
      }

      // 8. 窄屏 390：无横向滚动，覆盖区仍可用。
      {
        const { ctx, page } = await open(url, fixture().project, { ...bench(), width: 390, height: 844 });
        await ready(page);
        await setOverride(page, 75);
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'within');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 0, '390px must not scroll horizontally, overflow=' + overflow);
        await inputOf(page).evaluate(node => node.scrollIntoView({ block: 'center' }));
        assert.equal(await inputOf(page).isVisible(), true);
        checks.push({
          name: '390px stays readable with no horizontal scroll', passed: true,
          detail: 'scrollWidth - innerWidth = ' + overflow,
          screenshot: path.join(out, mode + '-override-390.png')
        });
        await page.screenshot({ path: path.join(out, mode + '-override-390.png'), fullPage: true });
        await ctx.close();
      }

      // 9. 原路径编辑仍可用：年度详情只读，编辑区照旧；保存后预览按新基线重新核对。
      {
        const { ctx, page } = await open(url, fixture().project, bench());
        await ready(page);
        await setOverride(page, 75);
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'within');
        const revision = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).revision, key);
        const beforeRevision = await revision();
        // 2026 锚点由 50 改到 80：2030 的插值随之变化，预览必须按新基线重新核对。
        await page.locator('input[data-value-index="0"]').fill('80');
        await page.getByRole('button', { name: '保存路径' }).click();
        assert.equal(await revision(), beforeRevision + 1, 'the editor still saves and bumps the revision');
        assert.match(await card(page).innerText(), /基线：88.8889 %/, 'the baseline is re-read after the edit');
        // 路径版本变化后旧预览按设计失效：值被清掉，对照状态要重新确认。
        assert.equal(await inputOf(page).inputValue(), '', 'a new path version drops the stale preview');
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'baseline');
        await chooseReference(page, 'r-mid');
        // 75 仍在原状态（中档 [60,80)）内。
        await setOverride(page, 75);
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'within');
        // 85 越过中档上界 80，恰好在高档命中一档。
        await setOverride(page, 85);
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'out-of-range');
        assert.match(await reasons(page), /越出上界 80（不含上界）/);
        checks.push({
          name: 'the original path editing still works and the baseline is re-read', passed: true,
          detail: 'revision ' + beforeRevision + ' -> ' + (await revision()) + '; new version clears the stale preview, baseline becomes 88.8889, then 75=within and 85=out-of-range',
          screenshot: null
        });
        await ctx.close();
      }

      // 10. 两条路径各自一份预览，同年不互相覆盖。
      {
        const { ctx, page } = await open(url, fixture({ second: true }).project,
          bench({ 'path-a': binding(), 'path-a-alt': binding() }));
        await setYear(page, 2030);
        await chooseReference(page, 'r-mid', 'path-a');
        assert.equal(await page.locator('[data-annual-override]').count(), 2);
        await setOverride(page, 75, 'path-a');
        await setOverride(page, 0, 'path-a-alt');
        assert.equal(await inputOf(page, 'path-a').inputValue(), '75');
        assert.equal(await inputOf(page, 'path-a-alt').inputValue(), '0');
        assert.equal(await verdict(page, 'path-a').getAttribute('data-override-verdict'), 'within');
        // 第二条路径没有显式选对照状态，因此照规则停在待核，而不是借用第一条的选择。
        assert.equal(await verdict(page, 'path-a-alt').getAttribute('data-override-verdict'), 'pending');
        assert.match(await page.locator('[data-annual-override="path-a-alt"] .annual-override-reasons').innerText(), /未选择对照状态/);
        checks.push({
          name: 'two paths keep two separate previews', passed: true,
          detail: 'path-a=75/within, path-a-alt=0/pending (its own reference choice is still missing)',
          screenshot: null
        });
        await ctx.close();
      }

      // 11. 专家视角可达依据记录，普通视角也能核对。
      {
        const { ctx, page } = await open(url, fixture().project, { ...bench(), expert: true });
        await ready(page);
        await setOverride(page, 75);
        assert.match(await card(page).innerText(), /依据ID：fixture-source/);
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'within');
        checks.push({
          name: 'the expert view reaches the evidence record', passed: true,
          detail: 'evidence line contains 依据ID：fixture-source while the verdict stays identical',
          screenshot: null
        });
        await ctx.close();
      }

      results.push({ mode, passed: checks.every(c => c.passed), entry: FIXTURE_ENTRY, checks });
    }

    // ---------- 负控：正式入口 source 与默认离线产物 ----------
    for (const [mode, url] of [['source', appUrl + '/'], ['offline', distUrl]]) {
      const checks = [];
      const carried = binding({ purpose: '看起来完整、但来自项目数据本身', verified: true });

      // 12. 项目 JSON 自带完整 verified:true 的绑定，页面还预置了 P7-B 的旧全局开关：
      //     正式源码与默认离线产物都必须仍然停在待核，并且不给出任何建议状态。
      {
        const { ctx, page, errors, external } = await open(url, fixture({ bindingValue: carried }).project, { legacyFlag: true });
        await ready(page);
        await setOverride(page, 80);
        assert.equal(await verdict(page).getAttribute('data-override-verdict'), 'pending',
          'a binding carried by the project JSON must never enable the numeric verdict');
        assert.equal(await page.locator('[data-annual-override="path-a"] [data-override-candidates="0"]').count(), 1,
          'no candidate may be offered for an unverified carried binding');
        assert.match(await page.locator('[data-annual-override="path-a"] .annual-override-candidates').innerText(), /候选状态：无/);
        assert.match(await reasons(page), /项目数据里携带的指标绑定未经核验：状态对应待核/);
        assert.doesNotMatch(await reasons(page), /建议复核为/);
        // 项目里的绑定字段必须原样留在数据里，没有被预览改写。
        const carriedStill = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).data.paths[0].reviewBinding, key);
        assert.deepEqual(carriedStill, carried, 'the carried binding must be left untouched');
        assert.equal(errors.length, 0, errors.join('; '));
        assert.equal(external.length, 0, external.join('; '));
        checks.push({
          name: 'a binding carried by the project data never enables a verdict', passed: true,
          detail: 'verified:true in the project JSON + the legacy global flag preset -> verdict=pending, candidates=0, no 建议复核为, bytes untouched',
          screenshot: null
        });
        await ctx.close();
      }

      // 13. 发布产物自检：旧全局开关与测试入口都不得出现在默认离线 HTML 里。
      if (mode === 'offline') {
        const html = await fs.readFile(path.join(root, 'dist/scenario-workbench.html'), 'utf8');
        assert.equal(html.includes(LEGACY_FLAG), false, 'the release HTML must not contain the legacy fixture flag');
        assert.equal(html.includes(FIXTURE_SLOT), false, 'the release HTML must not contain the fixture slot');
        assert.equal(html.includes('tests/entry'), false, 'the release HTML must not reference the test entry');
        assert.equal(html.includes('annual-override-fixture'), false, 'the release HTML must not embed the fixture entry');
        // 三个既有守卫脚本把这一行当作 bundle 启动行，正式入口必须原样保留。
        assert.ok(html.includes('__require("src/app.mjs");'), 'the release HTML must still boot from src/app.mjs');
        checks.push({
          name: 'the release HTML carries neither the legacy flag nor the test entry', passed: true,
          detail: 'no __scenarioWorkbenchReviewBindingFixture / __scenarioWorkbenchReviewBindingFixtureNow / tests/entry; boot line __require("src/app.mjs"); intact',
          screenshot: null
        });
      }

      results.push({ mode, passed: checks.every(c => c.passed), entry: url, checks });
    }
  } finally {
    await browser.close();
  }

  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  for (const group of results) {
    console.log(group.mode + (group.passed ? ' PASS' : ' FAIL'));
    for (const check of group.checks) console.log('  ' + (check.passed ? 'ok  ' : 'FAIL') + ' ' + check.name + (check.detail ? ' :: ' + check.detail : ''));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
