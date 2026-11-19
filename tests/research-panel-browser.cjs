const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
(async()=>{
 const out=path.resolve('artifacts/research-panel');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({downloadsPath:path.join(out,'downloads'),executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const records=[];
 try{for(const width of [1440,390]){
  const page=await browser.newPage({acceptDownloads:true,viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.APP_URL||pathToFileURL(path.resolve('dist/scenario-workbench.html')).href);
  await page.locator('#perspective-select').selectOption('expert');await page.locator('nav [data-route=robustness]').click();
  const frozen=await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('scenario-workbench.project.v1'));return JSON.stringify([p.id,p.revision,p.data,p.scope,p.selection]);});
  await page.locator('[data-research-panel]>summary').click();await page.getByRole('button',{name:'载入联合改分示例',exact:true}).click();
  await page.getByRole('button',{name:'计算最小合法改动',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-research-status]').textContent.includes('已证明最小'));
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载研究结果',exact:true}).click();const d=await download,r=JSON.parse(fs.readFileSync(await d.path(),'utf8'));assert.deepEqual(r.cost,[2,2]);assert.equal(r.minimumProved,true);
  await page.getByLabel('研究联动方式').selectOption('independent');assert(await page.getByRole('button',{name:'下载研究结果',exact:true}).isDisabled());
  await page.getByRole('button',{name:'计算最小合法改动',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-research-status]').textContent.includes('已证明最小'));
  assert.match(await page.locator('[data-research-panel]').innerText(),/1 格，共改 1 分/);
  await page.evaluate(()=>{const root=document.querySelector('[data-research-panel]');[...root.querySelectorAll('button')].find(b=>b.textContent==='计算最小合法改动').click();[...root.querySelectorAll('button')].find(b=>b.textContent==='停止研究计算').click();});
  await page.waitForFunction(()=>document.querySelector('[data-research-status]').textContent.includes('已停止'));
  const cancelDownload=page.waitForEvent('download');await page.getByRole('button',{name:'下载研究结果',exact:true}).click();const cd=await cancelDownload,cr=JSON.parse(fs.readFileSync(await cd.path(),'utf8'));assert.equal(cr.status,'cancelled');assert.equal(cr.minimumProved,false);
  const input=page.getByLabel('导入研究矩阵JSON');await input.setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"sizes":[2,2],"cells":[]}')});
  await page.waitForFunction(()=>document.querySelector('[data-research-status]').textContent.includes('未载入'));assert(await page.getByRole('button',{name:'下载研究结果',exact:true}).isDisabled());
  await input.setInputFiles(process.env.REAL_CASE_PATH||{name:'case.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'cib-case-handoff',version:1}))});
  await page.waitForFunction(()=>document.querySelector('[data-research-status]').textContent.includes('案例资料未齐'));
  assert(await page.getByRole('button',{name:'计算最小合法改动',exact:true}).isDisabled());
  const caseDownload=page.waitForEvent('download');await page.getByRole('button',{name:'下载研究结果',exact:true}).click();const dc=await caseDownload,ar=JSON.parse(fs.readFileSync(await dc.path(),'utf8'));assert.equal(ar.status,'not-ready');assert.equal(ar.scientificValidity,'not-assessed');
  if(process.env.REAL_CASE_PATH){assert.equal(ar.audit.validScores,0);assert.equal(ar.audit.totalCells,9);}
  await page.screenshot({path:path.join(out,(process.env.APP_URL?'source':'offline')+'-'+width+'.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('scenario-workbench.project.v1'));return JSON.stringify([p.id,p.revision,p.data,p.scope,p.selection]);}),frozen);
  assert.deepEqual(errors,[]);records.push({width,status:'pass',runAndDownload:true,cancellationNotOptimal:true,invalidImportClearsResult:true,incompleteCaseBlocked:true,projectUnchanged:true});await page.close();
 }fs.writeFileSync(path.join(out,(process.env.APP_URL?'source':'offline')+'-browser.json'),JSON.stringify(records,null,2));console.log(JSON.stringify(records));}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
