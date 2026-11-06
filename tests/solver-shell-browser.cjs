async function settings(page){const d=page.locator('[data-solver-settings]');if(await d.count()&&!await d.evaluate(e=>e.open))await d.locator('summary').first().click();}
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {fixture}=require('./solver-browser-fixtures.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/solver-shell');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--disable-gpu']});
 try{for(const [mode,url] of [['source',process.env.APP_URL||'http://127.0.0.1:4188'],['offline',pathToFileURL(path.join(root,'dist/scenario-workbench.html')).href]]){
  async function open(p){const c=await browser.newContext({viewport:{width:1440,height:1080}}),page=await c.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(p=>localStorage.setItem('scenario-workbench.project.v1',JSON.stringify(p)),p);await page.goto(url);return {c,page,errors};}
// 假设口径已默认接受（界面不再有该勾选框）。
  async function check(page,pattern){await page.waitForFunction(pattern=>new RegExp(pattern).test(document.querySelector('[data-cib-status]').textContent),pattern.source);assert.match((await page.locator('[data-cib-trace]').textContent()).replace(/^CIB检验：/,''),pattern);}
  const p=fixture(),a=await open(p),page=a.page;
  await check(page,/尚未运行CIB/);assert.doesNotMatch(await page.locator('nav [data-route=solver]').innerText(),/待实现/);
  await page.getByRole('button',{name:'冻结输入并精确检算',exact:true}).click();await check(page,/检算阻断.*未开始/);
  await choices(page,p);await page.getByRole('button',{name:'冻结输入并精确检算',exact:true}).click();await check(page,/检算完成.*2 个自洽配置/);
  await page.getByLabel('界面视角',{exact:true}).selectOption('expert');await check(page,/检算完成.*2 个自洽配置/);
  await page.locator('nav [data-route=workspace]').click();await check(page,/检算完成.*2 个自洽配置/);
  await page.locator('nav [data-route=solver]').click();await settings(page);await page.getByLabel('检算年份',{exact:true}).selectOption('2035');await check(page,/旧检算已过期/);
  await page.screenshot({path:path.join(out,mode+'-stale.png'),fullPage:true});
  await settings(page);await page.getByLabel('检算年份',{exact:true}).selectOption('2030');await check(page,/^检算完成/);
  await page.reload();await check(page,/尚未运行CIB/);assert.deepEqual(a.errors,[]);await a.c.close();
  const zero=fixture({mode:'opposite'}),b=await open(zero);await choices(b.page,zero);await b.page.getByRole('button',{name:'冻结输入并精确检算',exact:true}).click();await check(b.page,/检算完成.*0 个自洽配置/);assert.deepEqual(b.errors,[]);await b.c.close();
  const large=fixture({mode:'zero',sizes:Array(5).fill(8)}),d=await open(large);await choices(d.page,large);await d.page.getByRole('button',{name:'冻结输入并精确检算',exact:true}).click();await check(d.page,/检算中/);await d.page.getByRole('button',{name:'取消检算',exact:true}).click();await check(d.page,/检算未完成.*成立数未定/);assert.doesNotMatch(await d.page.locator('[data-cib-status]').innerText(),/0 个自洽/);assert.deepEqual(d.errors,[]);await d.c.close();
  console.log(mode+': shell status, navigation, zero vs blocked, cancellation, stale, views, cross-page and refresh passed');
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
