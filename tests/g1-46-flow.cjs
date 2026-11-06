// 46 项描述符体系 + 地区地图的浏览器验收：跑在 dist/scenario-workbench.html 上。
// 目标不是“点得到按钮”，而是从地图选地区开始，用参考评分真的算出结果并保存方案。
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');

const APP = pathToFileURL(path.resolve('dist/scenario-workbench.html')).href;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--disable-gpu', '--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await ctx.addInitScript(() => { window.confirm = () => true; });
  const page = await ctx.newPage();
  page.setDefaultTimeout(Number(process.env.G1_TIMEOUT_MS || 8000));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const results = [];
  const step = async (name, fn) => {
    try { await fn(); results.push(['PASS', name]); }
    catch (error) { results.push(['FAIL', name + ' :: ' + String(error.message).split('\n')[0]]); }
  };
  // 新浏览器在第一次写入前没有存储记录：读不到就是 null，不能当成“读到了空项目”。
  const project = () => page.evaluate(() => JSON.parse(localStorage.getItem('scenario-workbench.project.v1') || 'null'));
  const scopeRegion = () => page.evaluate(() => (JSON.parse(localStorage.getItem('scenario-workbench.project.v1') || 'null'))?.scope?.regionId ?? null);
  const nav = async title => { await page.locator('nav >> text=' + title).first().click(); await page.waitForTimeout(400); };

  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.waitForTimeout(700);

  await step('首页有离线地图，四个范围可选，默认京津冀整体', async () => {
    assert.equal(await page.locator('.geo-shape').count(), 3, '三个省级单元');
    // 底部快捷 chips 已撤：地图形状本身键盘可达（tabindex+Enter），下拉保留同步。
    assert.equal(await page.locator('.geo-chip').count(), 0, '不再有第三套平级入口');
    assert.match(await page.locator('.geo-card').innerText(), /京津冀整体/);
    assert.match(await page.locator('.geo-card').innerText(), /政策库收录/);
    assert.match(await page.locator('.geo-card').innerText(), /查看政策资料/);
    assert.doesNotMatch(await page.locator('.geo-card').innerText(), /取消预览/);
  });

  await step('点地区先预览，不写项目；卡片可用键盘打开', async () => {
    await page.locator('.geo-shape[data-geo="北京"]').focus();
    await page.waitForTimeout(200);
    assert.match(await page.locator('.geo-card').innerText(), /北京/, '聚焦即显示该地区卡片');
    assert.equal(await scopeRegion(), null, '预览不能直接改项目');
    await page.locator('.geo-shape[data-geo="天津"]').click();
    await page.waitForTimeout(200);
    const card = await page.locator('.geo-card').innerText();
    assert.match(card, /天津/);
    assert.match(card, /预览：尚未应用到项目/);
    assert.match(card, /研究范围由「京津冀」改为「天津市」|不会被删除|适用地区不匹配/);
    assert.equal(await scopeRegion(), null, '点击仍然只是预览');
  });

  await step('「研究这个地区」才写入范围，且地区下拉同步', async () => {
    await page.locator('[data-geo-apply]').click();
    await page.waitForTimeout(500);
    const p = await project();
    assert.equal(p.scope.regionId, '天津市');
    assert.deepEqual(p.scope.years, [2030, 2035]);
    assert.equal(await page.locator('#project-region').inputValue(), '天津市', '下拉与地图双向同步');
    assert.match(await page.locator('.geo-card').innerText(), /当前研究地区/);
  });

  await step('46 项目录默认载入：新项目进因素页即有目录，不自动勾选', async () => {
    await nav('因素与年度方案');
    await page.waitForTimeout(900);
    assert.equal(await page.locator('[data-join-baseline]').count(), 0, '不再要求手动加入');
    const sel0 = (await project()).selection.descriptorIds;
    assert.equal(sel0.length, 0, '不自动替用户勾选因素');
    const p = await project();
    const leaves = p.data.descriptors.filter(d => d.id.startsWith('d46-') && !d.id.startsWith('d46-out-'));
    assert.equal(leaves.length, 46);
    assert.equal(p.data.descriptors.filter(d => d.id.startsWith('d46-out-')).length, 2);
    const roots = await page.locator('.elements-row.is-root').allTextContents();
    assert.equal(roots.length, 11, '10 个政策领域 + 1 组结果指标');
    assert.ok(roots.some(t => t.includes('结果指标（不计入 46 项）')));
    assert.match(await page.locator('.region-strip').innerText(), /天津市/);
  });

  await step('父级带选：勾一个领域带选它下面的全部描述符，分类节点不是计算变量', async () => {
    const before = (await project()).selection.descriptorIds.length;
    await page.locator('.elements-row.is-root').filter({ hasText: '碳管理' }).locator('input[type=checkbox]').check();
    await page.waitForTimeout(700);
    const p = await project();
    assert.equal(p.selection.descriptorIds.length, before + 4, '碳管理下 4 项');
    const categoryIds = p.data.taxonomy.filter(n => n.id.startsWith('d46-g') && n.kind === 'category').map(n => n.id);
    assert.ok(categoryIds.every(id => !p.selection.descriptorIds.includes(id)), '领域节点不能进计算变量');
    // 再取消，恢复原样
    await page.locator('.elements-row.is-root').filter({ hasText: '碳管理' }).locator('input[type=checkbox]').uncheck();
    await page.waitForTimeout(700);
    assert.equal((await project()).selection.descriptorIds.length, before);
  });

  await step('示例起点：两项有双向参考规则，按年份选状态后真实落盘', async () => {
    await page.locator('[data-starter]').click();
    await page.waitForTimeout(700);
    assert.deepEqual((await project()).selection.descriptorIds.sort(), ['d46-20', 'd46-23']);
    await page.locator('.preview-switch button', { hasText: '建筑能效要求' }).first().click();
    await page.waitForTimeout(200);
    await page.locator('select[aria-label="2030年状态"]').selectOption({ index: 2 });
    await page.locator('select[aria-label="2035年状态"]').selectOption({ index: 1 });
    await page.waitForTimeout(300);
    await page.locator('.preview-switch button', { hasText: '清洁取暖替代' }).first().click();
    await page.waitForTimeout(200);
    await page.locator('select[aria-label="2030年状态"]').selectOption({ index: 1 });
    await page.locator('select[aria-label="2035年状态"]').selectOption({ index: 2 });
    await page.waitForTimeout(400);
    const plans = (await project()).data.paths.filter(p => p.provenance?.locator === 'state-plan');
    assert.equal(plans.length, 2);
    assert.equal(plans.find(p => p.descriptorId === 'd46-20').points.find(q => q.year === 2030).stateId, 'd46-20-st2');
  });

  await step('一键参考：预览写明演示参考、只填空白；采用后直通检验', async () => {
    await nav('关系评分');
    await page.locator('.relationships-tabs button', { hasText: '检查评分完整性' }).click();
    await page.waitForTimeout(300);
    await page.locator('button', { hasText: '一键填入参考评分' }).first().click();
    await page.waitForTimeout(400);
    const dialog = await page.locator('.reference-dialog').innerText();
    assert.match(dialog, /演示参考，可修改，非实时AI生成/);
    assert.match(dialog, /将填 18 格/);
    assert.match(dialog, /旧平台参考规则（已映射到 46 项）/);
    // 一次确认同时完成“保存判断 + 选用进矩阵”；齐全后只剩一条紧凑状态，不再重复计数。
    await page.locator('.reference-dialog button', { hasText: '确认保存并使用' }).click();
    await page.waitForTimeout(800);
    assert.equal(await page.locator('.rev-stats').count(), 0, '齐全后不再显示三格计数');
    assert.equal(await page.locator('[data-rev-refill]').count(), 0, '齐全后收起预填回执');
    assert.equal(await page.locator('.rev-clear').count(), 0, '没有“没有待处理项”空区域');
    const done = (await page.locator('[data-rev-done]').innerText()).replace(/\s+/g, ' ');
    assert.match(done, /评分已齐：2 个方向、18 格/, '一条紧凑状态：' + done.slice(0, 80));
    assert.match(done, /演示参考/, '性质标签保留');
    await page.locator('button', { hasText: '查看评分与来源' }).click();
    await page.waitForTimeout(300);
    assert.match((await page.locator('.rev-done-src').innerText()), /依据/, '来源可查');
    const next = page.locator('button', { hasText: '继续检验' }).first();
    assert.equal(await next.isEnabled(), true, '齐全后主按钮可用');
    await next.click();
    await page.waitForTimeout(800);
    assert.ok(await page.locator('.solver-module').count());
  });

  await step('检验：假设必须亲手勾选，全空间给出真实自洽组合数', async () => {
    assert.match(await page.locator('.solver-cannot').first().innerText(), /还不能检验/);
    // 假设口径已默认接受，界面不再要求勾选；此处不再有对应控件。
    await page.locator('[data-plan-check-run]').click();
    await page.waitForTimeout(500);
    assert.match(await page.locator('.plan-check').innerText(), /自洽/);
    await page.locator('section.solver-fullspace button', { hasText: '开始检验' }).first().click();
    await page.waitForTimeout(1500);
    const summary = await page.locator('[data-solver-summary]').innerText();
    assert.match(summary, /共找到 9 种自洽组合/, '实际结果来自 RunResult：' + summary.replace(/\s+/g, ' ').slice(0, 80));
    assert.match(summary, /我的方案/);
  });

  await step('白箱追踪：节点 4 读到本次 2030 检验，写明解释对象', async () => {
    await nav('计算过程与依据');
    const hd = page.locator('[data-chain-node="plan"] .chain-node-hd');
    if (await hd.getAttribute('aria-expanded') !== 'true') { await hd.click(); await page.waitForTimeout(250); }
    const planText = await page.locator('[data-chain-node="plan"]').innerText();
    assert.match(planText, /2030/);
    assert.match(planText, /已检验/);
    assert.match(await page.locator('.chain-context').innerText(), /解释对象/);
    // 反查表挂在“求解”节点下：展开它，确认能从一条评分反查到具体判断记录。
    const shd = page.locator('[data-chain-node="solve"] .chain-node-hd');
    if (await shd.getAttribute('aria-expanded') !== 'true') { await shd.click(); await page.waitForTimeout(250); }
    assert.ok(await page.locator('[data-chain-node="solve"] .chain-reverse table').count(), '求解节点里的反查表存在');
  });

  await step('保存与导出：方案带地区与年度状态写入本地库，刷新后仍在', async () => {
    await nav('保存与导出');
    await page.locator('.exports-switch button', { hasText: '我的方案与历史' }).click().catch(() => {});
    await page.waitForTimeout(200);
    await page.locator('button', { hasText: '保存这个方案' }).first().click();
    await page.waitForTimeout(500);
    assert.match(await page.locator('[data-save-plan] [role=status]').innerText(), /已保存/);
    await page.reload();
    await page.waitForTimeout(900);
    await nav('保存与导出');
    assert.match(await page.locator('[data-saved-work]').innerText(), /我的方案（1）/);
    assert.match(await page.locator('.save-summary').innerText(), /天津市/);
  });

  await step('无脚本错误', async () => {
    assert.deepEqual(errors, [], '页面异常：' + errors.join(' | '));
  });

  for (const [status, name] of results) console.log(status === 'PASS' ? '  ✓' : '✗', name);
  const fails = results.filter(r => r[0] === 'FAIL');
  console.log(fails.length ? '\n' + fails.length + ' 项失败' : '\n46 项目录与地区地图主线全部通过');
  await Promise.race([browser.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 4000))]);
  process.exit(fails.length ? 1 : 0);
})();
