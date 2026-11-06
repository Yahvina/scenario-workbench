'use strict';
// 周五演示 P5–P9 的浏览器验收：一次跑通源码模式（开发服务器）与离线产物（dist/scenario-workbench.html）。
// 只断言「界面上真实发生的事」：真实下拉、真实点击、真实下载；不读内存状态，不替页面算结论。
// 唯一不点的是 AI 草案面板里的「检查本地模型服务」——那是本脚本会触发的唯一网络路径。
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = require('./demo-paths-fixture.cjs');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'artifacts/weekly-p5-p9');
const PROJECT_KEY = 'scenario-workbench.project.v1';
const SAVED_WORK_KEY = 'scenario-workbench.saved-work.v1';
const PLAN_LABEL = '已保存的历史归档：演示归档甲（2030）';
const MSG_REPORT = '报告已按所选归档生成；未定项如实写为未定，未用 0 顶替。';
const MSG_NOT_RECOMPUTED = '注意：这里比的是两份历史归档当时算出的结论，不是平台用当前规则重新复算过的结果。旧归档不会被自动重算。';
const FILL = '示例变量A在2030年的示例指数约为50。';
const UNGROUNDED = '这条补充来自模型自己的推断，材料里没有对应原文。';

const KEY = {
  ledgerReading: '[data-override-reading]',
  compareChanged: '[data-compare-panel] tr[data-compare-row=changed]'
};

(async () => {
  const { demoProject, demoBundle } = await fixture.ready;
  const projectTitle = demoProject.title;
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const result = { source: null, offline: null };
  const narrowFailures = [];
  // 离线那一条默认打 dist；交付时用 ARTIFACT_URL 指向实际交付出去的那份 HTML，
  // 这样「跑过验收的那一份」和「交到用户手上的那一份」是同一个文件，而不是同一批源码。
  const offlineUrl = process.env.ARTIFACT_URL
    ? pathToFileURL(process.env.ARTIFACT_URL).href
    : pathToFileURL(path.join(root, 'dist/scenario-workbench.html')).href;
  try {
    for (const [mode, url] of [['source', process.env.APP_URL || 'http://127.0.0.1:4173'], ['offline', offlineUrl]]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await ctx.addInitScript(payload => {
        if (!localStorage.getItem(payload.projectKey)) localStorage.setItem(payload.projectKey, JSON.stringify(payload.project));
        if (!localStorage.getItem(payload.bundleKey)) localStorage.setItem(payload.bundleKey, JSON.stringify(payload.bundle));
      }, { project: demoProject, bundle: demoBundle, projectKey: PROJECT_KEY, bundleKey: SAVED_WORK_KEY });
      const page = await ctx.newPage();
      const errors = [], external = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:')) external.push(request.url());
      });
      await page.goto(url);

      const go = route => page.locator('nav [data-route=' + route + ']').first().click();
      const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), PROJECT_KEY);
      // 截图前先把被断言的那一块滚进视口：否则五张图都只会是同一条页面顶栏，
      // 起不到「这条路径确实走到了这个状态」的证据作用。
      const shoot = async (name, target) => {
        if (target) {
          await target.scrollIntoViewIfNeeded();
          await page.waitForTimeout(120);
        }
        if (mode !== 'source') return;
        // 截图先自证「被断言的那一块真的在画面里」：否则五张图会退化成同一条页面顶栏，
        // 既看不出走了哪条路径，也起不到证据作用。
        const box = await target.boundingBox();
        const view = page.viewportSize();
        assert.ok(box && box.y < view.height && box.y + box.height > 0,
          mode + '：截图 ' + name + ' 前目标元素不在视口内 ' + JSON.stringify(box));
        await page.screenshot({ path: path.join(outDir, name) });
      };
      // 窄屏检查：截图后回到桌面宽度，不打断后续路径；失败记进 narrowFailures，
      // 由文件末尾统一断言，这样一条窄屏问题不会把前面五条路径的证据一起吞掉。
      const narrowOk = async (name, target) => {
        await page.setViewportSize({ width: 390, height: 844 });
        if (target) {
          await target.scrollIntoViewIfNeeded();
          await page.waitForTimeout(120);
        }
        const info = await page.evaluate(() => {
          // 只报「真正把页面撑宽」的元素：祖先里有 overflow 容器的元素是自己内部滚动，
          // 不是页面横向滚动的成因，把它们混进来会让报告指向错误的元素。
          const clipped = el => {
            for (let n = el.parentElement; n; n = n.parentElement) {
              if (getComputedStyle(n).overflowX !== 'visible') return true;
            }
            return false;
          };
          const wide = [];
          for (const node of document.querySelectorAll('*')) {
            const box = node.getBoundingClientRect();
            const overBox = box.width > 0 && box.right > 391 && !clipped(node);
            const overContent = node.scrollWidth > node.clientWidth + 1 && node.clientWidth > 0
              && getComputedStyle(node).overflowX === 'visible';
            if (overBox || overContent) {
              wide.push({
                node: node.tagName.toLowerCase() + (node.getAttribute('aria-label') ? '[aria-label="' + node.getAttribute('aria-label') + '"]' : node.id ? '#' + node.id : String(node.className) ? '.' + String(node.className).split(' ')[0] : ''),
                width: Math.round(box.width),
                right: Math.round(box.right),
                scrollWidth: node.scrollWidth,
                clientWidth: node.clientWidth
              });
            }
          }
          // 从最靠右的元素开始报：祖先链本身也会溢出，但它们只是被动被撑宽，
          // 排在最前面的才是真正把页面撑出去的那个元素。
          wide.sort((a, b) => b.right - a.right);
          return { scrollWidth: document.documentElement.scrollWidth, wide: wide.slice(0, 8) };
        });
        await shoot(name, target);
        await page.setViewportSize({ width: 1280, height: 800 });
        if (info.scrollWidth > 390) narrowFailures.push({ mode, screen: name, scrollWidth: info.scrollWidth, offenders: info.wide });
        return info.scrollWidth <= 390;
      };
      // narrowOk 必须从 true 起算：后面用 `&&` 累积，从 false 起算的话永远翻不回来，
      // 会让这份 JSON 把通过的窄屏检查记成 false。
      const outcome = { p5: false, p6: false, p7: false, p8: false, p9: false, narrowOk: true };

      // ---- P5 情景报告：选已保存归档 → 生成 → 下载 Markdown ----
      await go('exports');
      await page.locator('[data-report-panel] select[aria-label="选择要生成报告的归档"]').selectOption({ label: PLAN_LABEL });
      const reportText = await page.locator('[data-report-output]').innerText();
      for (const heading of ['研究范围', '检算结果', '缺项与边界']) {
        assert.ok(reportText.includes(heading), mode + '：报告缺少小节「' + heading + '」');
      }
      assert.equal(await page.locator('[data-report-status]').innerText(), MSG_REPORT);
      const [reportDownload] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('[data-report-download]').click()
      ]);
      const markdown = await fs.readFile(await reportDownload.path(), 'utf8');
      assert.ok(markdown.includes('# '), mode + '：下载的 Markdown 没有标题行');
      assert.ok(markdown.includes(projectTitle), mode + '：下载的 Markdown 没有写出项目名');
      outcome.p5 = true;
      await shoot('p5-report-1280.png', page.locator('[data-report-panel]'));

      // ---- P6 比较：方案比较两行不同，结果比较带上「历史归档未复算」 ----
      const kind = page.locator('[data-compare-panel] select[aria-label="比较对象类型"]');
      await kind.selectOption('plan');
      assert.match(await page.locator('[data-compare-status]').innerText(), /方案比较完成：/);
      const planChanged = await page.locator(KEY.compareChanged).allInnerTexts();
      assert.equal(planChanged.length, 2, mode + '：方案比较的不同行应为 2 行，实际 ' + planChanged.length);
      const planText = planChanged.join('\n');
      assert.ok(planText.includes('关注状态·示例变量A'), mode + '：方案比较缺少「关注状态·示例变量A」');
      assert.ok(planText.includes('示例高档 → 示例变量B·示例高档'), mode + '：方案比较缺少状态对评分差异行');
      await kind.selectOption('run');
      assert.match(await page.locator('[data-compare-status]').innerText(), /结果比较完成：/);
      const runChanged = await page.locator(KEY.compareChanged).allInnerTexts();
      const runText = runChanged.join('\n');
      assert.ok(runChanged.some(text => text.includes('2030') && text.includes('2035')), mode + '：结果比较没有列出检算年份差异');
      assert.ok((await page.locator('[data-compare-panel]').innerText()).includes(MSG_NOT_RECOMPUTED), mode + '：结果比较缺少「旧归档不会被自动重算」提示');
      outcome.p6 = true;
      await shoot('p6-compare-1280.png', page.locator('[data-compare-panel]'));

      // ---- P9 模型输入样例：未核对标记、三个拒绝/放行取值、下载 JSON ----
      const modelInput = page.locator('[data-model-input]');
      assert.equal(await page.locator('[data-model-input-status]').innerText(), '平台推断、未经核对');
      await page.locator('[data-model-input] select[aria-label="映射到哪个模型参数"]').selectOption('D01');
      await page.locator('[data-model-input] select[aria-label="选择状态"]').selectOption('D01-0');
      const valueInput = page.locator('[data-model-input] input[aria-label="参数取值"]');
      await valueInput.fill('3.5');
      const preview = () => page.locator('[data-model-input-preview]').innerText();
      let previewText = await preview();
      assert.ok(previewText.includes('平台推断、未经核对'), mode + '：样例预览缺少未核对标记');
      assert.ok(previewText.includes('million 2010 USD'), mode + '：样例预览缺少证据文件里的单位');
      await valueInput.fill('');
      previewText = await preview();
      assert.ok(previewText.includes('样例还生成不了：') && previewText.includes('未填写'), mode + '：清空取值后没有按「未填写不等于 0」拒绝');
      await valueInput.fill('0');
      previewText = await preview();
      assert.ok(previewText.includes('平台推断、未经核对'), mode + '：填 0 后样例没有正常生成');
      const [sampleDownload] = await Promise.all([
        page.waitForEvent('download'),
        modelInput.getByRole('button', { name: '下载模型输入样例', exact: true }).click()
      ]);
      const sample = JSON.parse(await fs.readFile(await sampleDownload.path(), 'utf8'));
      assert.equal(sample.provenance.reviewedByMentor, false, mode + '：下载的样例没有声明未核对');
      outcome.p9 = true;
      await shoot('p9-model-input-1280.png', page.locator('[data-model-input]'));
      outcome.narrowOk = (await narrowOk('p9-model-input-390.png', page.locator('[data-model-input]'))) && outcome.narrowOk;

      // ---- P7 年度覆盖台账（仅专家视角的时间线） ----
      await page.getByRole('combobox', { name: '界面视角', exact: true }).selectOption('expert');
      await go('timeline');
      const ledger = page.locator('section.override-ledger');
      await page.locator('#timeline-path').selectOption('path-a');
      await ledger.locator('select[aria-label="年度覆盖年份"]').selectOption('2030');
      await ledger.locator('select[aria-label="对照状态（写入记录）"]').selectOption('A-0');
      const overrideValue = ledger.locator('input[aria-label="参数取值（0 是有效值；留空表示撤销）"]');
      await overrideValue.fill('0');
      await ledger.getByRole('button', { name: '保存年度覆盖', exact: true }).click();
      assert.ok((await ledger.locator(KEY.ledgerReading).innerText()).includes('0'), mode + '：保存 0 后读数里没有 0');
      assert.ok((await ledger.innerText()).includes('已保存：override-1'), mode + '：没有出现第一次保存的回执');

      await ledger.locator('input[aria-label="模拟写入失败（仅下一次保存）"]').check();
      await overrideValue.fill('42');
      await ledger.getByRole('button', { name: '保存年度覆盖', exact: true }).click();
      const refused = ledger.locator('[data-override-attempt=refused]');
      assert.equal(await refused.count(), 1, mode + '：模拟写入失败没有产出拒绝区块');
      const refusedText = await refused.innerText();
      assert.ok(refusedText.includes('模拟开关已生效'), mode + '：拒绝区块没有指出模拟开关生效');
      assert.ok(refusedText.includes('与提交前逐项比对：全部一致'), mode + '：拒绝后没有逐项比对的结论');

      await ledger.getByRole('button', { name: '保存年度覆盖', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('section.override-ledger li[data-override-row]').length === 2);
      assert.equal(await ledger.locator('li[data-override-row]').count(), 2, mode + '：成功后该年历史应为 2 条');

      await ledger.getByRole('button', { name: '撤销年度覆盖', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('section.override-ledger li[data-override-row]').length === 3);
      assert.ok((await ledger.locator(KEY.ledgerReading).innerText()).includes('基线'), mode + '：撤销后读数没有回到基线');
      assert.equal(await ledger.locator('li[data-override-row]').count(), 3, mode + '：撤销记录应保留为该年第 3 条');
      outcome.p7 = true;
      await shoot('p7-override-1280.png', ledger.locator('.override-ledger-history-wrap'));
      outcome.narrowOk = (await narrowOk('p7-override-390.png', ledger.locator('.override-ledger-history-wrap'))) && outcome.narrowOk;

      // ---- P8 AI 草案：本地生成提示词、解析候选、采用一条（不联网） ----
      const planned = page.locator('nav details[data-planned]');
      if (await planned.count()) {
        const item = page.locator('nav [data-route=ai-draft]').first();
        if (!(await item.isVisible())) await planned.locator('summary').click();
      }
      await go('ai-draft');
      await page.locator('textarea[aria-label="要交给模型的材料"]').fill(FILL);
      await page.getByRole('button', { name: '按当前材料与项目生成提示词', exact: true }).click();
      const prompt = await page.locator('[data-draft-prompt]').innerText();
      assert.ok(prompt.trim().length > 0, mode + '：提示词为空');
      assert.ok(prompt.includes('示例变量A'), mode + '：提示词没有带上项目因素');
      const before = await stored();
      await page.locator('textarea[aria-label="把模型回复粘贴回来"]').fill(FILL + '\n' + UNGROUNDED);
      await page.getByRole('button', { name: '读取回复并列出候选', exact: true }).click();
      assert.match(await page.locator('[data-draft-status]').innerText(), /已列出 \d+ 条候选。采用前请逐条核对出处。/);
      const items = page.locator('[data-draft-item]');
      assert.ok(await items.count() > 0, mode + '：没有列出任何候选条目');
      await items.first().locator('input[type=checkbox]').check();
      await page.getByRole('button', { name: '采用勾选的条目', exact: true }).click();
      assert.ok((await page.locator('[data-draft-status]').innerText()).includes('没有写入任何评分或数值'), mode + '：采用后没有声明未写入评分');
      const after = await stored();
      assert.ok(after.data.evidence.length > before.data.evidence.length, mode + '：采用后没有新增证据');
      assert.deepEqual(after.data.judgments, before.data.judgments, mode + '：采用草案改动了判断记录');
      assert.deepEqual(after.data.paths, before.data.paths, mode + '：采用草案改动了时间路径');
      outcome.p8 = true;
      await shoot('p8-draft-1280.png', page.locator('[data-draft-status]'));

      assert.deepEqual(errors, [], mode + '：页面脚本报错 ' + JSON.stringify(errors));
      assert.deepEqual(external, [], mode + '：出现了外部请求 ' + JSON.stringify(external));
      await ctx.close();
      result[mode] = outcome;
    }
  } finally {
    await browser.close();
  }
  if (result.source && result.offline) await fs.writeFile(path.join(outDir, 'demo-paths-browser.json'), JSON.stringify(result, null, 2) + '\n');
  // 五条路径与窄屏检查分开报：五条路径全绿时仍然输出那一行结果；
  // 窄屏失败单独成行并置退出码，既不吞掉证据，也不把真实缺陷说成通过。
  if (narrowFailures.length) {
    console.log('demo paths failed: ' + JSON.stringify({ result, narrowFailures }));
    process.exitCode = 1;
  } else {
    console.log('demo paths passed: ' + JSON.stringify(result));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
