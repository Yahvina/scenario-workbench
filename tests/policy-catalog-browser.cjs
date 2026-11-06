// E1 目录小样验收：四级目录 → 燃煤设施限制与退出强度 → 三条带编号的政策摘要。
// 加入当前项目必须沿用既有原子语义：保留项目身份、范围与已有定义/评分/选择，
// 重复加入先逐条核对编号、内容及关联；摘要标明来自团队交流稿且原条款待核，
// 三条摘要严格绑定燃煤候选因素，状态与参数缺口如实显示。
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixtures = require('./flow-fixtures.cjs');

const key = 'scenario-workbench.project.v1';
const CLAUSES = [['TJ-P3-010', '禁止新建燃煤自备机组'], ['TJ-P3-011', '禁止新建燃煤锅炉'], ['TJ-P33-007', '2027 年煤电机组关停替代 130 万千瓦']];
const LEVELS = ['能源生产与供应', '燃煤发电与供热', '数量与比例约束', '燃煤设施限制与退出强度'];
const COAL_LEAF = 'pilot-node-coal-restriction';
const COAL_FACTOR = 'pilot-descriptor-coal-restriction';
const OTHER_NODE = 'own-factor-node';

// 已有数据的项目 + 同页另一个已归类因素（映射示例变量 A），用来验证摘要不会串到别的因素下。
function existingProject() {
  const p = fixtures.withRecords();
  p.view.module = 'elements';
  p.data.taxonomy.push({
    id: OTHER_NODE, label: '自有园区分类', kind: 'category', parentIds: [], childIds: [], descriptorIds: ['A'],
    evidenceRefs: [], version: 1, provenance: { origin: 'user' }
  });
  return p;
}

(async () => {
  const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts', 'policy-catalog-pilot');
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({args:['--no-sandbox','--disable-gpu'], executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const source = process.env.APP_URL || 'http://127.0.0.1:4180', results = [];

  async function open(url, p) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
    await ctx.addInitScript(({ p, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(p)); }, { p, key });
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    const errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:')) external.push(r.url()); });
    await page.goto(url);
    return { ctx, page, errors, external };
  }
  const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  const pilot = page => page.locator('.elements-pilot');
  const join = page => page.getByRole('button', { name: '向当前项目加入目录小样', exact: true });
  const rejoin = page => page.getByRole('button', { name: '再次加入目录小样（内容一致时不新增）', exact: true });
  const nodeBox = (page, id) => page.locator('.elements-row input[data-node="' + id + '"]');
  const summary = page => page.locator('.elements-summary');
  const clauseBlocks = page => page.locator('.elements-summary .elements-clauses');
  // 状态行不止一条（定义面板也有一条空的），所以先按文本过滤再等可见；否则会读到空串。
  const expectStatus = (page, pattern) => page.locator('.elements-module [role="status"]').filter({ hasText: pattern }).first().waitFor();
  // 真实键盘展开：折叠全部后，逐级 focus + Enter。展开后按钮的 aria-label 会从“展开”变成“收起”，
  // 所以断言要重新按“收起 X”定位（data-path 是含全部祖先的 JSON 路径，不适合当选择器）。
  async function expandByKeyboard(page, label) {
    const open = page.locator('.elements-row button[aria-label="展开 ' + label + '"]');
    await open.focus();
    await page.keyboard.press('Enter');
    const closed = page.locator('.elements-row button[aria-label="收起 ' + label + '"]');
    assert.equal(await closed.getAttribute('aria-expanded'), 'true');
  }

  async function run(mode, url) {
    const { ctx, page, errors, external } = await open(url, existingProject());
    const r = { mode, passed: true, checks: [] };

    // 1) 独立目录小样预览：四级路径、候选因素 ID 与三条编号摘要都在，且标明交流稿、原条款待核
    const preview = await pilot(page).innerText();
    for (const label of LEVELS) assert.ok(preview.includes(label), 'missing level ' + label);
    for (const [clauseId, excerpt] of CLAUSES) { assert.ok(preview.includes(clauseId), 'missing ' + clauseId); assert.ok(preview.includes(excerpt), 'missing excerpt ' + clauseId); }
    assert.match(preview, /交流稿摘要，原条款待核/);
    assert.match(preview, /状态定义/);
    assert.match(preview, /分母与基准年/);
    assert.match(preview, /130 万千瓦的关停替代容量的统计口径待核/);
    // 预览里出现的 "政策原文" 只是那句"不挂政策原文标签"的自我说明；真正的记录类型在落库数据上核对。
    assert.doesNotMatch(preview, /政策原文 ·/);
    assert.equal(await page.locator('.elements-pilot').innerHTML().then(html => html.includes('null</')), false, 'null children must not be stringified into text');
    const beforeJoin = await stored(page);
    await page.screenshot({ path: path.join(out, mode + '-pilot-1280.png'), fullPage: true });
    r.checks.push('catalog preview with four levels and three numbered summaries');

    // 2) 加入当前项目：身份、范围与已有定义/评分/选择一律保留
    await join(page).click();
    const after = await stored(page);
    assert.equal(after.id, beforeJoin.id);
    assert.equal(after.title, beforeJoin.title);
    assert.deepEqual(after.scope, beforeJoin.scope);
    assert.deepEqual(after.view, beforeJoin.view);
    assert.deepEqual(after.selection, beforeJoin.selection);
    assert.deepEqual(after.data.judgments, beforeJoin.data.judgments);
    assert.deepEqual(after.data.paths, beforeJoin.data.paths);
    assert.equal(after.data.evidence.some(item => item.id === 'own-evidence'), true);
    assert.equal(after.data.taxonomy.filter(node => node.id.startsWith('pilot-node-')).length, 4);
    assert.equal(after.data.policies.length, 3);
    assert.deepEqual(after.data.policies.map(item => item.clauseId), CLAUSES.map(clause => clause[0]));
    assert.equal(after.data.policies.every(item => item.reviewStatus === 'draft'), true);
    const factor = after.data.descriptors.find(item => item.id === COAL_FACTOR);
    assert.deepEqual(factor.stateIds, []);
    assert.equal(after.data.states.some(item => item.descriptorId === COAL_FACTOR), false);
    assert.equal(after.contractVersion, '1.0.0');
    assert.equal(after.revision, beforeJoin.revision + 1);
    await expectStatus(page, /原有定义、评分、选择保留/);
    r.checks.push('join keeps identity, scope, existing records and selection');

    // 3) 三条摘要严格绑定燃煤候选因素：编号、内容、说明、关联因素与依据都落在记录里
    for (const saved of after.data.policies) {
      assert.deepEqual(saved.descriptorIds, [COAL_FACTOR], saved.clauseId + ' must bind the coal factor');
      assert.deepEqual(saved.evidenceRefs, ['pilot-source-team-draft']);
    }
    r.checks.push('each summary is bound to the coal candidate factor');

    // 4) 键盘逐级展开四级目录，末级叶子可见（先折叠全部，再从一级开始用键盘展开）
    await page.getByRole('button', { name: '收起全部', exact: true }).click();
    await expandByKeyboard(page, LEVELS[0]);
    await expandByKeyboard(page, LEVELS[1]);
    await expandByKeyboard(page, LEVELS[2]);
    assert.equal(await nodeBox(page, COAL_LEAF).count(), 1);
    assert.equal(await nodeBox(page, COAL_LEAF).isVisible(), true);
    assert.match(await page.locator('.elements-row').first().innerText(), /1级/);
    r.checks.push('keyboard expands all four levels to the leaf');

    // 5) 重复加入：先逐条核对编号、内容及关联，一致才报告"已加入"且不新增
    await rejoin(page).click();
    const repeated = await stored(page);
    assert.equal(JSON.stringify(repeated), JSON.stringify(after));
    await expectStatus(page, /未新增节点或记录/);
    r.checks.push('repeating the join adds no node or record');

    // 6) 打开燃煤叶子：同一因素的三条摘要与状态缺口，且不提供下级变量（状态为空不能参与计算）
    await nodeBox(page, COAL_LEAF).check();
    const saved = await stored(page);
    assert.ok(saved.selection.nodeIds.includes(COAL_LEAF));
    assert.ok(saved.selection.descriptorIds.includes(COAL_FACTOR));
    const coalText = await summary(page).innerText();
    for (const [clauseId, excerpt] of CLAUSES) { assert.ok(coalText.includes(clauseId)); assert.ok(coalText.includes(excerpt)); }
    assert.match(coalText, /交流稿摘要，原条款待核/);
    assert.match(coalText, /状态待定义/);
    assert.match(coalText, /130 万千瓦的关停替代容量的统计口径待核/);
    assert.match(coalText, /关系评分依据继续独立/);
    assert.equal(await clauseBlocks(page).count(), 1);
    assert.equal(await page.getByRole('button', { name: /^选择下级已有变量/ }).count(), 0);
    await page.screenshot({ path: path.join(out, mode + '-leaf-1280.png'), fullPage: true });
    r.checks.push('leaf shows one factor with three summaries and the state gap');

    // 7) 同页再选中另一个已归类因素：两个因素同时在列，但三条摘要只挂在燃煤因素下
    await nodeBox(page, OTHER_NODE).check();
    const otherSaved = await stored(page);
    assert.ok(otherSaved.selection.nodeIds.includes(OTHER_NODE));
    assert.ok(otherSaved.selection.nodeIds.includes(COAL_LEAF), 'the coal factor stays selected');
    assert.ok(otherSaved.selection.descriptorIds.includes('A'));
    assert.equal(await clauseBlocks(page).count(), 1, 'exactly one factor may show the clause block');
    // 分类列表里的 article 也含同名文本，所以按"映射分类"这一行定位真正的研究因素卡片。
    const otherArticle = page.locator('.elements-summary article').filter({ hasText: '映射分类：自有园区分类' }).first();
    assert.match(await otherArticle.innerText(), /映射分类：自有园区分类/, 'the other factor must render its own detail');
    const otherText = await otherArticle.innerText();
    for (const [clauseId] of CLAUSES) assert.equal(otherText.includes(clauseId), false, clauseId + ' leaked to another factor');
    assert.equal(otherText.includes('状态待定义'), false, 'the coal gap text must not leak either');
    const coalArticle = page.locator('.elements-summary article').filter({ hasText: '映射分类：燃煤设施限制与退出强度' }).first();
    assert.match(await coalArticle.innerText(), /TJ-P3-010/, 'the coal factor still shows its own summaries');
    r.checks.push('the three summaries appear only under the coal factor');

    // 8) 刷新后来源与缺口仍在；专家可见来源定位，且记录本身是用户假设而不是政策原文
    await nodeBox(page, OTHER_NODE).uncheck();
    await page.reload();
    assert.match(await pilot(page).innerText(), /原条款待核/);
    await page.getByLabel('界面视角').selectOption('expert');
    const expertPilot = await pilot(page).innerText();
    assert.match(expertPilot, /《描述符分级与时间轴 团队交流版》第 3 节/);
    assert.match(expertPilot, /审核状态 draft/);
    assert.match(await summary(page).innerText(), /角色：context/);
    const sourceRecord = (await stored(page)).data.evidence.find(item => item.id === 'pilot-source-team-draft');
    assert.equal(sourceRecord.kind, 'user-assumption');
    assert.equal((await stored(page)).data.evidence.some(item => item.kind === 'policy'), false);
    assert.doesNotMatch(await page.locator('.elements-module').innerText(), /政策原文 ·/);
    await page.screenshot({ path: path.join(out, mode + '-expert-1280.png'), fullPage: true });
    r.checks.push('refresh keeps the source and the gaps; expert sees the locator, nothing claims 政策原文');

    // 9) 390px 阅读正常，无横向滚动（预览仍可读到条款编号）
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.match(await pilot(page).innerText(), /TJ-P33-007/);
    await page.screenshot({ path: path.join(out, mode + '-390.png'), fullPage: true });
    r.checks.push('390px reads without horizontal overflow');

    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    r.checks.push('no page errors and no external requests');
    await ctx.close();
    return r;
  }

  // 冲突场景：叶子和三条编号都在，但其中一条内容被改写 → 原项目保持不变并有明确提示。
  async function runConflict(mode, url) {
    const seed = existingProject();
    const { ctx, page } = await open(url, seed);
    await join(page).click();
    // 先把加入后的项目读出来，再关掉上下文（关掉之后就没法再读 localStorage 了）。
    const joinedProject = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    await ctx.close();

    const tampered = JSON.parse(JSON.stringify(joinedProject));
    assert.ok(tampered, 'the join must have written the project before tampering');
    const target = tampered.data.policies.find(item => item.clauseId === 'TJ-P3-011');
    target.excerpt = '禁止新建燃煤锅炉（被改写的版本）';
    const before = JSON.stringify(tampered);

    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
    await ctx2.addInitScript(({ p, key }) => localStorage.setItem(key, JSON.stringify(p)), { p: tampered, key });
    const page2 = await ctx2.newPage();
    page2.setDefaultTimeout(8000);
    const errors = [];
    page2.on('pageerror', e => errors.push(e.message));
    await page2.goto(url);
    // 叶子和三条编号都在（目录行要展开后才进 DOM，所以先看数据，再用键盘展开确认叶子可见）
    assert.equal(await page2.getByRole('button', { name: '再次加入目录小样（内容一致时不新增）', exact: true }).count(), 1);
    const seeded = await page2.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.ok(seeded.data.taxonomy.some(node => node.id === COAL_LEAF));
    assert.deepEqual(seeded.data.policies.map(item => item.clauseId).sort(), ['TJ-P3-011', 'TJ-P3-010', 'TJ-P33-007'].sort());
    await page2.getByRole('button', { name: '收起全部', exact: true }).click();
    for (const label of LEVELS.slice(0, 3)) await expandByKeyboard(page2, label);
    assert.equal(await nodeBox(page2, COAL_LEAF).count(), 1);
    await page2.getByRole('button', { name: '再次加入目录小样（内容一致时不新增）', exact: true }).click();
    await expectStatus(page2, /原项目保持不变/);
    const message = await page2.locator('.elements-module [role="status"]').filter({ hasText: /原项目保持不变/ }).first().innerText();
    assert.match(message, /目录小样未加入，原项目保持不变/);
    assert.match(message, /TJ-P3-011/);
    assert.match(message, /摘要、说明、关联因素或依据与目录小样不同/);
    assert.equal(await page2.evaluate(key => localStorage.getItem(key), key), before, 'a conflicting join must not touch the project');
    assert.deepEqual(errors, []);
    await ctx2.close();
    return { mode, passed: true, checks: ['conflicting clause aborts the join, keeps the project and names the clause'] };
  }

  try {
    for (const [mode, url] of [['source', source], ['offline', pathToFileURL(path.join(root, 'dist/scenario-workbench.html')).href]]) {
      const r = await run(mode, url);
      results.push(r);
      console.log(mode + ': ' + r.checks.join(' | '));
      const c = await runConflict(mode, url);
      results.push(c);
      console.log(mode + ' conflict: ' + c.checks.join(' | '));
    }
    await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally { await browser.close(); }
})();
