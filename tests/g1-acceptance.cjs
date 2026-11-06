/* 主线验收（v5 改版后）：选因素与年度状态 → 判断关系 → 检查评分完整性 → 检验 → 保存。
   同时核对 6 个交付前场景：输入不全 / 有解 / 零解 / 旧结果过期 / 保存刷新恢复 / 双视角不丢数据。
   运行：node tests/g1-acceptance.cjs（需 CHROME_PATH 或默认 Chrome；直接打开 dist 离线包） */
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const APP=pathToFileURL(path.resolve(__dirname,'../dist/scenario-workbench.html')).href;
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-gpu','--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
  await ctx.addInitScript(()=>{window.confirm=()=>true;});
  const page=await ctx.newPage();
  page.setDefaultTimeout(Number(process.env.G1_TIMEOUT_MS||10000));
  const results=[];
  const step=async(name,fn)=>{try{await fn();results.push(['PASS',name]);}catch(e){results.push(['FAIL',name+' :: '+e.message.split('\n')[0]]);}};
  const nav=async t=>{await page.locator(`nav >> text=${t}`).first().click();await page.waitForTimeout(400);};
  const tab=async t=>{await page.locator('.relationships-tabs button',{hasText:t}).first().click();await page.waitForTimeout(300);};
  const fillPair=async values=>{
    if(await page.locator('.relationships-module input[type=number]').count()===0){
      const direct=page.locator('button',{hasText:'直接填写评分'});
      if(await direct.count())await direct.first().click();
      await page.waitForTimeout(300);
    }
    const cells=page.locator('.relationships-module input[type=number]');
    const n=await cells.count();
    assert.equal(n,4,'2×2 应给 4 格，实得 '+n);
    for(let i=0;i<n;i++)await cells.nth(i).fill(String(values[i]));
    await page.locator('input[aria-label="判断适用地区"]').fill('示例地区（非真实政策）');
    await page.locator('input[aria-label="判断适用年份"]').fill('2030, 2035');
    await page.locator('button',{hasText:'保存这一对的评分'}).first().click();
    await page.waitForTimeout(500);
  };

  await page.goto(APP);await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await page.reload();await page.waitForTimeout(700);

  await step('载入机制示例，2030 与 2035 选不同状态',async()=>{
    await page.locator('nav [data-route="exports"]').first().click();await page.waitForTimeout(400);
    await page.locator('.exports-switch [data-tab="advanced"]').click();await page.waitForTimeout(300);
    await page.locator('button',{hasText:'载入机制示例'}).first().click();await page.waitForTimeout(700);
    await nav('因素与年度方案');
    const switchTo=async label=>{await page.locator('.preview-switch button',{hasText:label}).first().click();await page.waitForTimeout(250);};
    await switchTo('示例变量A');
    await page.locator('select[aria-label="2030年状态"]').selectOption('a-high');
    await page.locator('select[aria-label="2035年状态"]').selectOption('a-low');
    await switchTo('示例变量B');
    await page.locator('select[aria-label="2030年状态"]').selectOption('b-low');
    await page.locator('select[aria-label="2035年状态"]').selectOption('b-high');
    await page.waitForTimeout(400);
  });

  await step('关系页第二步：先告诉用户还差什么（输入不全不冒充可检验）',async()=>{
    await nav('关系评分');await tab('检查评分完整性');
    const stats=await page.locator('.rev-stats b').allTextContents();
    assert.equal(stats[0].replace(/\s/g,''),'0/2','已完成方向');
    assert.equal(stats[1],'8','还缺评分格');
    assert.ok(await page.locator('button',{hasText:'继续：检验方案'}).isDisabled(),'不完整时主按钮禁用');
    assert.match(await page.locator('.rev-issues').innerText(),/缺评分/);
    assert.match(await page.locator('.rev-issues').innerText(),/填写第一个方向/);
    assert.equal(await page.locator('.rev-matrix').getAttribute('open'),null,'矩阵默认折叠');
  });

  await step('补评分：定位到具体方向，填完两向后可继续（R17 保存切下一方向）',async()=>{
    await page.locator('button',{hasText:'填写第一个方向'}).first().click();await page.waitForTimeout(400);
    assert.match(await page.locator('.rel-pairbar').innerText(),/示例变量A/,'定位到第一个待补方向');
    await fillPair([3,-3,-3,3]);
    // 从问题卡进来的方向，保存后回到完整性检查（不再自动切下一个方向）。
    assert.match(await page.locator('.relationships-status').innerText(),/回到完整性检查/);
    await page.locator('button',{hasText:'填写第一个方向'}).first().click();await page.waitForTimeout(400);
    assert.match(await page.locator('.rel-pairbar').innerText(),/示例变量B/,'第二个缺口是反方向');
    await fillPair([3,-3,-3,3]);
    await tab('检查评分完整性');
    // 保存即采用：两个方向填完就是用户的明确决定，页面直接给出齐全状态，
    // 不再要求到这一页重复点一次「采用」。
    assert.match(await page.locator('[data-rev-done]').innerText(),/评分已齐：2 个方向、8 格/,'两方向填完即为齐全');
    const cont=page.locator('button',{hasText:'继续：检验方案'}).first();
    assert.ok(!(await cont.isDisabled()),'齐全后主按钮可用');
    await cont.click();
    await page.waitForTimeout(700);
    assert.ok(await page.locator('.solver-module').count(),'采用后直接进入检验，不再逐方向重选');
  });

  await step('检验页：年份在顶部，采用关系页评分后检验我的方案（2030）',async()=>{
    assert.match(await page.locator('.solver-yearbar').innerText(),/2030/,'默认落在有完整方案的年份');
    const adopt=page.locator('button',{hasText:'采用这份评分'});
    if(await adopt.count())await adopt.first().click();
    await page.waitForTimeout(400);
    await page.locator('.solver-settings>summary').click();await page.waitForTimeout(300);
    // 假设口径已默认接受，界面不再要求勾选；此处不再有对应控件。
    await page.waitForTimeout(300);
    const rows=await page.locator('.plan-check-row .st').allTextContents();
    assert.match(rows.join(' '),/示例高档/);assert.match(rows.join(' '),/示例低档/);
    await page.locator('[data-plan-check-run]').click();await page.waitForTimeout(500);
    // 还没跑全空间时，方案结论在方案卡片里；跑完后由顶部唯一摘要承担，不重复。
    assert.ok(await page.locator('.plan-check-verdict').first().isVisible(),'我的方案结论可见');
  });

  await step('全空间：摘要显示真实自洽组合数与统计（有解场景）',async()=>{
    await page.locator('section.solver-fullspace button',{hasText:'开始检验'}).first().click();
    await page.waitForFunction(()=>document.querySelector('[data-solver-summary]')?.innerText.includes('共找到'),null,{timeout:20000});
    const summary=await page.locator('[data-solver-summary]').innerText();
    assert.match(summary,/共找到 \d+ 种自洽组合/);
    const count=Number((summary.match(/共找到 (\d+) 种/)||[])[1]);
    assert.ok(count>0,'有解场景应有结果');
    assert.match(summary,/研究年份/);assert.match(summary,/已检查组合/);assert.match(summary,/不自洽组合/);
    assert.match(summary,/我的方案/);assert.match(summary,/查看原因/);
    const rows=await page.locator('.solver-scenario-table tbody tr:not(.solver-scenario-detail)').count();
    assert.ok(rows>=1,'自洽组合表有行');
    await page.locator('.solver-scenario-table button',{hasText:'解释'}).first().click();
    await page.waitForTimeout(200);
    assert.ok(await page.locator('.solver-scenario-detail').first().isVisible(),'点解释才展开');
    assert.equal(await page.locator('.solver-basis').getAttribute('open'),null,'计算依据默认折叠');
  });

  await step('导出页：默认方案名可改、保存方案成功且不与检验记录混称',async()=>{
    await nav('保存与导出');
    const name=page.locator('input[aria-label="方案名称"]');
    assert.match(await name.inputValue(),/情景方案 1/,'给出可修改的默认名称');
    assert.match(await page.locator('.save-summary').innerText(),/示例变量A=示例高档/,'读出按年状态，只读展示');
    await page.locator('button',{hasText:'保存这个方案'}).click();await page.waitForTimeout(400);
    assert.match(await page.locator('[data-save-plan] [role=status]').innerText(),/已保存到本地库/);
    assert.match(await page.locator('[data-save-plan] [role=status]').innerText(),/检验结果尚未保存/);
    assert.match(await page.locator('[data-saved-work]').innerText(),/我的方案（1）/);
  });

  await step('刷新后：方案仍在本地库、年度状态仍正确',async()=>{
    await page.reload();await page.waitForTimeout(900);
    await nav('保存与导出');
    assert.match(await page.locator('[data-saved-work]').innerText(),/我的方案（1）/);
    assert.match(await page.locator('.save-summary').innerText(),/示例变量A=示例高档/);
  });

  await step('普通/专家切换不丢数据，图册与公式入口可达',async()=>{
    const before=await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('scenario-workbench.project.v1'));return JSON.stringify(p.selection);});
    await page.selectOption('#perspective-select','expert');await page.waitForTimeout(500);
    await nav('专家关系输入');
    assert.ok(await page.locator('.rel-atlas-card').first().isVisible(),'专家视角也首屏见图册');
    await nav('计算过程与依据');
    assert.ok(await page.locator('[data-chain-node="plan"]').count(),'白箱链可达');
    await page.selectOption('#perspective-select','public');await page.waitForTimeout(500);
    const after=await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('scenario-workbench.project.v1'));return JSON.stringify(p.selection);});
    assert.equal(after,before,'切换视角不改选择');
  });

  await step('零解：明确显示没有自洽组合，且保留我的方案',async()=>{
    await nav('关系评分');await page.locator('.relationships-tabs button',{hasText:'判断关系'}).first().click();
    await page.waitForTimeout(300);
    // 构造循环偏好：A→B 与 B→A 各 2×2，四个组合互相被压过。
    await fillPair([-1,1,1,-1]);
    await page.locator('button',{hasText:'交换方向'}).first().click();await page.waitForTimeout(300);
    await fillPair([1,-1,-1,1]);
    const jcount=await page.evaluate(()=>JSON.parse(localStorage.getItem('scenario-workbench.project.v1')).data.judgments.length);
    assert.equal(jcount,2,'改分不应新增候选记录，实得 '+jcount+' 条');
    await tab('检查评分完整性');
    // 齐全态主按钮是「继续检验」，不完整态才有「继续：检验方案」；两种都要能走通。
    const goBtn=page.locator('button',{hasText:/^(使用这些评分，继续检验|继续：检验方案|继续检验)$/}).first();
    await goBtn.click();
    await page.waitForTimeout(700);
    assert.ok(await page.locator('.solver-module').count(),'两向完整后进入检验');
    const ensureSettings=async()=>{const d=page.locator('[data-solver-settings]');
      if(await d.getAttribute('open')===null){await page.locator('.solver-settings>summary').click();await page.waitForTimeout(250);}};
    await ensureSettings();
    // 这一轮只验证“零解怎么显示”，先用检验页的显式选用补齐记录，避免依赖上一页的会话状态。
    const fillUnique=page.locator('button',{hasText:'使用这些方向唯一的评分'});
    if(await fillUnique.count()){await fillUnique.first().click();await page.waitForTimeout(400);}
    await ensureSettings();
    // 假设口径已默认接受，界面不再要求勾选；此处不再有对应控件。
    await page.waitForTimeout(250);
    const startBtn=page.locator('section.solver-fullspace button',{hasText:'开始检验'}).first();
    assert.ok(await startBtn.isEnabled(),'零解场景的输入应可计算');
    await startBtn.click();
    await page.waitForTimeout(800);
    let summary=await page.locator('[data-solver-summary]').innerText();
    if(/还没开始计算/.test(summary)){await page.locator('section.solver-fullspace button',{hasText:'开始检验'}).first().click();await page.waitForTimeout(800);summary=await page.locator('[data-solver-summary]').innerText();}
    const cannot=await page.locator('.solver-cannot').count()?await page.locator('.solver-cannot-list').innerText():'';
    const boxes=await page.locator('.solver-module input[type=checkbox]').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label')+'='+n.checked));
    assert.match(summary,/没有找到自洽组合/,'零解明确说明：'+summary.replace(/\s+/g,' ').slice(0,60)+' | 勾选：'+boxes.join(',')+' | 阻断：'+cannot.replace(/\s+/g,' ').slice(0,120));
    assert.match(summary,/我的方案/,'零解也保留自己的方案');
    assert.doesNotMatch(summary,/成立数 0 种/,'零解不用成立数措辞掩盖');
  });

  await step('输入修改后：旧结果标记过期，不冒充当前',async()=>{
    await nav('关系评分');
    await page.locator('.relationships-tabs button',{hasText:'判断关系'}).first().click();await page.waitForTimeout(300);
    await fillPair([2,-1,0,1]);
    await nav('检验与结果');
    assert.ok(await page.locator('[data-solver-stale]').first().isVisible(),'旧结果标为过期');
    assert.match(await page.locator('[data-solver-stale]').first().innerText(),/已过期/);
  });

  // 先出结论再关浏览器：无头 Chrome 偶尔在 close() 上挂住，不能让结果随之丢失。
  const fails=results.filter(r=>r[0]==='FAIL');
  for(const [s,n] of results)console.log(s==='PASS'?'  ✓':'✗',n);
  console.log(fails.length?`\n${fails.length} 项失败`:'\n主线与六个场景全部通过');
  await Promise.race([browser.close().catch(()=>{}),new Promise(r=>setTimeout(r,4000))]);
  process.exit(fails.length?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
