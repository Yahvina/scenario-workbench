const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const {fixture}=require('./solver-browser-fixtures.cjs');
(async()=>{
 let server=null;
 if(process.env.CONDITION_SERVE_PORT){
  const port=Number(process.env.CONDITION_SERVE_PORT);
  assert.ok(Number.isInteger(port)&&port>=1024&&port<=65535);
  server=spawn(process.execPath,[path.resolve('scripts/serve.mjs'),String(port)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  process.on('exit',()=>server.kill());
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Local source server did not start')),10000);
   server.stdout.once('data',()=>{clearTimeout(timer);resolve();});
   server.once('error',error=>{clearTimeout(timer);reject(error);});
   server.once('exit',code=>{clearTimeout(timer);reject(new Error('Local server exit '+code));});
  });
  process.env.CONDITION_APP_URL='http://127.0.0.1:'+port;
 }
 const {solve}=await import('../src/modules/solver/engine.mjs');
 const {changeYearState}=await import('../src/modules/elements/state-plan.mjs');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const results=[];
 async function open(project){
  let counter=0;
  for(const d of project.selection.descriptorIds)project=changeYearState(project,d,2030,d+'0',()=>`plan-${++counter}`);
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});
  await context.addInitScript(p=>localStorage.setItem('scenario-workbench.project.v1',JSON.stringify(p)),project);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.CONDITION_APP_URL||pathToFileURL(path.resolve('dist/scenario-workbench.html')).href);
  await page.locator('nav [data-route=solver]').first().click();
  await page.locator('[data-condition-settings]').waitFor();
  return {page,context,errors};
 }
 async function setGiven(page,id,state){
  const details=page.locator('[data-condition-settings]');
  if(!await details.evaluate(e=>e.open))await details.locator('summary').click();
  await page.getByLabel('给定条件 '+id,{exact:true}).selectOption(state);
 }
 async function run(page,count){
  await page.locator('.solver-fullspace button').filter({hasText:/^(开始检验|重新检验)$/}).click();
  await page.waitForFunction(count=>{
   const text=document.querySelector('[data-solver-summary]')?.textContent||'';
   return count===0?text.includes('没有找到自洽组合'):text.includes('共找到 '+count+' 种自洽组合');
  },count);
 }
 async function download(page,name){
  const promise=page.waitForEvent('download');
  await page.getByRole('button',{name,exact:true}).click();
  const item=await promise;return JSON.parse(fs.readFileSync(await item.path(),'utf8'));
 }
 try{
  const p=fixture({mode:'opposite'});p.selection.lockedStateIds=['A0'];p.id='given-vs-lock';
  const c=await open(p),page=c.page;
  const before=await page.evaluate(()=>localStorage.getItem('scenario-workbench.project.v1'));
  await run(page,0);await setGiven(page,'A','A0');
  assert.match(await page.locator('[data-solver-stale]').innerText(),/过期/);
  await run(page,1);
  assert.match(await page.locator('[data-result-conditions]').innerText(),/A0/);
  await page.locator('[data-plan-check-run]').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('scenario-workbench.plan-check.v1')),null);
  const archive=await download(page,'下载本次结果 JSON');
  assert.deepEqual(archive.RunInput.conditionedStateIds,['A0']);
  assert.equal(solve(archive.RunInput).count,1);
  assert.equal(archive.RunInput.matrix.coverage.required,2);
  await page.locator('nav [data-route=exports]').first().click();
  await page.getByLabel('检验记录名称',{exact:true}).fill('给定A0检验');
  assert.equal(await page.getByRole('button',{name:'保存为检验记录',exact:true}).count(),1,'完成的条件检验应可保存为历史记录');
  await page.getByRole('button',{name:'保存为检验记录',exact:true}).click();
  assert.match(await page.locator('[data-run-save] [role=status]').innerText(),/已保存检验记录/);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('scenario-workbench.saved-work.v1')));
  assert.deepEqual(saved.runs[0].archive.RunInput.conditionedStateIds,['A0']);
  await page.locator('nav [data-route=solver]').first().click();
  await setGiven(page,'B','B0');
  assert.match(await page.locator('.solver-fullspace').innerText(),/至少保留一个/);
  await page.getByRole('button',{name:'清空给定条件',exact:true}).click();
  assert.match(await page.locator('[data-solver-stale]').innerText(),/过期/);
  await run(page,0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('scenario-workbench.project.v1')),before);
  assert.deepEqual(c.errors,[]);await c.context.close();
  results.push('locked zero solutions; given one solution; all-given blocked; context changes stale; source unchanged; archive replay; named history saved with condition');

  const q=fixture({sizes:[3,3],mode:'copy'});q.id='one-way-given';
  q.title='给定政策机制示例（手工矩阵，非河北实证）';
  q.data.descriptors[0].label='改造支持';q.data.descriptors[1].label='吨钢能耗';
  const labels={A0:'扩大',A1:'维持',A2:'收缩',B0:'明显下降',B1:'小幅下降',B2:'基本不变'};
  for(const state of q.data.states)state.label=labels[state.id];
  q.data.judgments=q.data.judgments.filter(j=>j.sourceDescriptorId==='A');
  q.data.judgments[0].entries=q.data.judgments[0].entries.filter(e=>e.sourceStateId==='A0');
  q.data.judgments[0].entries.forEach((e,i)=>{e.score=2-i;});
  const one=await open(q);await setGiven(one.page,'改造支持','A0');await run(one.page,1);
  if(process.env.CONDITION_SHOT)await one.page.screenshot({path:process.env.CONDITION_SHOT,fullPage:true});
  if(process.env.CONDITION_DOC_SHOT){
    const r=await one.page.locator('[data-condition-settings]').boundingBox();
    await one.page.screenshot({path:process.env.CONDITION_DOC_SHOT,fullPage:true,clip:{x:r.x,y:r.y+await one.page.evaluate(()=>scrollY),width:r.width,height:650}});
  }
  await one.page.locator('nav [data-route=robustness]').first().click();
  await one.page.getByRole('button',{name:'扫描全部评分格',exact:true}).click();
  await one.page.waitForFunction(()=>document.querySelector('[data-batch-status]')?.textContent.startsWith('扫描完成'));
  const scan=await download(one.page,'导出扫描记录');
  assert.equal(scan.totalTrials,6);assert.equal(scan.input.engineVersion,'cib-conditioned-1.0.0');
  assert.ok(scan.rows.every(r=>r.sourceStateId==='A0'));
  await one.page.locator('nav [data-route=chain]').first().click();
  assert.match(await one.page.locator('.chain-module').innerText(),/本次给定条件/);
  await one.page.setViewportSize({width:390,height:900});
  assert.ok(await one.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(one.errors,[]);await one.context.close();
  results.push('one-way partial matrix accepted; only used rows scanned; conditional JSON downloaded; mobile width');
  const mismatch=await open({...fixture({mode:'copy'}),id:'plan-condition-mismatch'});
  await setGiven(mismatch.page,'A','A1');await run(mismatch.page,1);
  assert.match(await mismatch.page.locator('[data-solver-plan]').innerText(),/给定条件不一致/);
  await mismatch.page.locator('[data-plan-check-run]').click();
  assert.match(await mismatch.page.locator('.plan-check').innerText(),/给定条件不一致/);
  assert.deepEqual(mismatch.errors,[]);await mismatch.context.close();
  results.push('a yearly plan that contradicts the given state is rejected, not labelled self-consistent');
  console.log(JSON.stringify({checks:results,passed:true},null,2));
 }finally{await browser.close();server?.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
