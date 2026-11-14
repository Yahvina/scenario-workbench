const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const {fixture}=require('./solver-browser-fixtures.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1100}});
  await context.addInitScript(p=>localStorage.setItem('scenario-workbench.project.v1',JSON.stringify(p)),fixture({mode:'zero'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function openBaseline(){
   await page.locator('nav [data-route=solver]').first().click();
   await page.locator('.solver-fullspace button').filter({hasText:/^(开始检验|重新检验)$/}).click();
   await page.waitForFunction(()=>document.querySelector('[data-solver-summary]')?.textContent.includes('共找到 4 种自洽组合'));
   await page.locator('nav [data-route=robustness]').first().click();
  }
  await page.goto(pathToFileURL(path.resolve('dist/scenario-workbench.html')).href);await openBaseline();
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('scenario-workbench.project.v1')).data);
  async function create(name,sign){
   for(const [index,score] of [[0,sign],[1,-sign]]){
    await page.getByLabel('要改的评分格',{exact:true}).selectOption(String(index));
    await page.getByLabel('新评分',{exact:true}).selectOption(String(score));
    await page.getByRole('button',{name:'加入联合改分',exact:true}).click();
   }
   await page.getByLabel('联合方案名称',{exact:true}).fill(name);
   await page.getByRole('button',{name:'保存联合方案',exact:true}).click();
   assert.match(await page.locator('[data-joint-saved-status]').innerText(),/已保存联合方案/);
  }
  await create('左侧方案',1);await create('右侧方案',-1);
  await page.getByLabel('已保存联合方案',{exact:true}).selectOption({label:'左侧方案'});
  await page.getByLabel('并排比较另一方案',{exact:true}).selectOption({label:'右侧方案'});
  await page.getByRole('button',{name:'并排比较两方案',exact:true}).click();
  assert.match(await page.locator('[data-joint-saved-comparison]').innerText(),/共有 2 个情景；仅左方案 1 个；仅右方案 1 个/);
  const event=page.waitForEvent('download');await page.getByRole('button',{name:'导出两方案比较',exact:true}).click();
  const download=await event,output=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.deepEqual(output.plans.map(p=>p.result.variantCount),[3,3]);
  assert.deepEqual(Object.values(output.between).map(r=>r.length),[2,1,1]);
  const {solve}=await import('../src/modules/solver/engine.mjs');for(const p of output.plans)assert.equal(solve(p.result.variantInput).count,3);
  if(process.env.JOINT_PLANS_SHOT)await page.locator('[data-joint-saved]').screenshot({path:process.env.JOINT_PLANS_SHOT});
  await page.reload();await openBaseline();
  await page.getByLabel('已保存联合方案',{exact:true}).selectOption({label:'左侧方案'});
  await page.getByRole('button',{name:'载入联合方案',exact:true}).click();
  assert.match(await page.locator('[data-joint-list]').innerText(),/已选择 2 项/);
  await page.getByRole('button',{name:'联合重算并比较',exact:true}).click();
  assert.deepEqual(await page.locator('.robust-stats b').allTextContents(),['4','3','3','0','1']);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('scenario-workbench.project.v1')).data),before);
  await page.getByRole('button',{name:'删除所选联合方案',exact:true}).click();
  assert.equal(await page.getByLabel('已保存联合方案',{exact:true}).locator('option').count(),1);
  await page.locator('nav [data-route=solver]').first().click();
  await page.getByLabel('检算年份',{exact:true}).selectOption('2035');await openBaseline();
  await page.getByRole('button',{name:'载入联合方案',exact:true}).click();
  assert.match(await page.locator('[data-joint-saved-status]').innerText(),/另一冻结基线/);
  assert.match(await page.locator('[data-joint-list]').innerText(),/已选择 0 项/);
  await page.setViewportSize({width:390,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS saved joint plans: named save, equal-count member comparison, JSON replay, refresh reload and re-run, source unchanged, delete, different-year rejection, mobile');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
