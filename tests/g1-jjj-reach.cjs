/* G1 真实目录可达性：用旧平台 24 项京津冀描述符（不是机制示例）走同一条主线，
   核对图册、三档九格、按年状态、检验我的方案与白箱链到哪一步真的能走通。
   运行：node tests/g1-jjj-reach.cjs（需 CHROME_PATH 或默认 Chrome 路径；直接打开 dist 离线包） */
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
  const nav=async t=>{await page.locator(`nav >> text=${t}`).first().click();await page.waitForTimeout(350);};
  const project=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('scenario-workbench.project.v1')));
  const pickFactor=async term=>{
    const search=page.locator('.elements-module input[type=search], .elements-module input[aria-label*="搜索"]').first();
    await search.fill(term);await page.waitForTimeout(250);
    await page.locator('.elements-row').filter({hasText:term}).last().locator('input[type=checkbox]').check();
    await page.waitForTimeout(350);
  };
  const setYear=async(label,state)=>{
    const sw=page.locator('.preview-switch button',{hasText:label});
    if(await sw.count())await sw.first().click();
    await page.waitForTimeout(200);
    await page.locator('select[aria-label="2030年状态"]').selectOption({index:Number(state)+1});
    await page.locator('select[aria-label="2035年状态"]').selectOption({index:Number(state)===0?3:1});
    await page.waitForTimeout(350);
  };

  await page.goto(APP);await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await page.reload();await page.waitForTimeout(700);

  await step('京津冀：旧 24 项框架收进折叠分组，仍可加入且不清空 46 项',async()=>{
    await nav('因素与年度方案');
    // 新项目默认已有 46 项；旧框架在「旧项目兼容与迁移」折叠里，展开后才出现加入按钮。
    await page.locator('.framework-box>summary').first().click();await page.waitForTimeout(250);
    await page.locator('.fw-legacy>summary').first().click();await page.waitForTimeout(250);
    // 旧框架卡收进折叠组后按钮叫「加入当前项目」；标题仍是「旧版 24 项目录」。
    await page.locator('.fw-legacy button',{hasText:'加入当前项目'}).first().click();
    await page.waitForTimeout(600);
    const p=await project();
    const legacy=p.data.descriptors.filter(d=>d.provenance?.sourceId==='legacy-framework');
    assert.equal(legacy.length,24,'旧描述符 24 项');
    assert.equal(p.data.descriptors.length,72,'46 项+2 结果指标不被清空，实得 '+p.data.descriptors.length);
    assert.equal(p.scope.regionId,'京津冀');
    assert.deepEqual(p.scope.years,[2030,2035]);
  });
  await step('京津冀：选两个真实因素，状态面板按年份出现',async()=>{
    await pickFactor('经济增长速度');
    await pickFactor('碳价水平与碳市场覆盖');
    const p=await project();
    assert.deepEqual(p.selection.descriptorIds,['jjj-d1','jjj-d19']);
    assert.equal(await page.locator('.state-plan-panel select[aria-label="2030年状态"]').count(),1);
  });
  await step('京津冀：2030 与 2035 分别选不同状态',async()=>{
    await setYear('经济增长速度','0');
    await setYear('碳价水平与碳市场覆盖','1');
    const p=await project();
    const plans=p.data.paths.filter(x=>x.provenance?.locator==='state-plan');
    assert.equal(plans.length,2,'两个因素都写了按年状态');
    const a=plans.find(x=>x.descriptorId==='jjj-d1');
    assert.notEqual(a.points.find(x=>x.year===2030).stateId,a.points.find(x=>x.year===2035).stateId,'2030 与 2035 不同');
  });
  await step('京津冀：关系页首屏有图册，三档给完整 3×3 九格',async()=>{
    await nav('关系评分');
    assert.ok(await page.locator('.rel-atlas-card').first().isVisible(),'图册首屏可见');
    assert.ok((await page.locator('.rel-atlas-card .trend-card').count())>=8,'导师八类图形都在');
    const direct=page.locator("button",{hasText:'直接填写评分'});
    if(await direct.count())await direct.first().click();
    await page.waitForTimeout(300);
    const cells=page.locator('.relationships-module input[type=number]');
    assert.equal(await cells.count(),9,'三档应为 3×3 九格');
    assert.match(await page.locator('.relationships-table caption').first().innerText(),/3×3/);
  });
  await step('京津冀：两个方向各九格保存后切到下一方向',async()=>{
    for(let round=0;round<2;round++){
      const cells=page.locator('.relationships-module input[type=number]');
      const n=await cells.count();
      assert.equal(n,9,'第 '+(round+1)+' 个方向九格');
      for(let i=0;i<n;i++)await cells.nth(i).fill(String((i%3)-1));
      await page.locator('input[aria-label="判断适用地区"]').fill('京津冀');
      await page.locator('input[aria-label="判断适用年份"]').fill('2030, 2035');
      await page.locator("button",{hasText:'保存这一对的评分'}).first().click();
      await page.waitForTimeout(600);
      if(round===0)assert.equal(await page.locator('select[aria-label="影响方 A"]').inputValue(),'jjj-d19','保存后切到反方向');
    }
    assert.match(await page.locator('.rel-pstate').allTextContents().then(a=>a.join(' ')),/已判方向 2 \/ 2/);
    // 第二步：判完还要明确采用，才能去检验。
    await page.locator('.relationships-tabs button',{hasText:'检查评分完整性'}).click();
    await page.waitForTimeout(400);
    const stats=await page.locator('.rev-stats b').allTextContents();
    assert.equal(stats[0].replace(/\s/g,''),'2/2','两个方向已完成');
    await page.locator('button',{hasText:/继续：检验方案|使用这些评分，继续检验/}).first().click();
    await page.waitForTimeout(700);
  });
  await step('京津冀：检验页读出 2030 真实方案并给出结论',async()=>{
    const take=page.locator('button',{hasText:'采用这份评分'});
    if(await take.count())await take.first().click();
    await page.waitForTimeout(300);
    await page.locator('.solver-settings>summary').click();await page.waitForTimeout(250);
    const rows=await page.locator('.plan-check-row').allTextContents();
    const text=rows.join(' ');
    assert.match(text,/经济增长速度/);assert.match(text,/碳价水平与碳市场覆盖/);
    // 旧平台状态没有逐条声明适用年，必须由用户显式确认这两类假设，平台不会替他默认。
    // 假设口径已默认接受，界面不再要求勾选；此处不再有对应控件。
    await page.waitForTimeout(300);
    const run=page.locator('[data-plan-check-run]');
    assert.ok(await run.count(),'方案检验按钮可用（矩阵无阻断）');
    await run.first().click();await page.waitForTimeout(500);
    assert.ok(await page.locator('.plan-check-verdict').first().isVisible(),'结论可见');
    const rec=await page.evaluate(()=>JSON.parse(localStorage.getItem('scenario-workbench.plan-check.v1')||'{}'));
    assert.ok(Object.values(rec)[0]['2030'],'2030 记录已持久化');
  });
  await step('京津冀：白箱链节点4读到 2030 检验，反查表可回到判断',async()=>{
    await nav('计算过程与依据');
    const hd=page.locator('[data-chain-node="plan"] .chain-node-hd');
    if(await hd.getAttribute('aria-expanded')!=='true'){await hd.click();await page.waitForTimeout(250);}
    const planText=await page.locator('[data-chain-node="plan"]').innerText();
    assert.match(planText,/2030/);assert.match(planText,/已检验/);
    assert.match(planText,/阈值|状态未声明|缺口|r\d/, '缺口或版本如实写');
    assert.ok(await page.locator('.chain-reverse table').first().isVisible(),'反查表存在');
  });
  await step('京津冀：不把全空间锁成单一方案（精确空间仍按未锁定枚举）',async()=>{
    await nav('检验与结果');
    const text=await page.locator('.solver-module').innerText();
    assert.match(text,/组合空间：/);
    assert.ok(!/已锁定 [1-9]/.test(text.split('组合空间：')[1]?.slice(0,80)||''),'未偷偷锁定用户方案');
  });

  await browser.close();
  const fails=results.filter(r=>r[0]==='FAIL');
  for(const [s,n] of results)console.log(s==='PASS'?'  ✓':'✗',n);
  console.log(fails.length?`\n${fails.length} 项失败`:'\n京津冀真实目录主线全部通过');
  process.exit(fails.length?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
