const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{fixture}=require('./solver-browser-fixtures.cjs'),{steel,electricity}=require('./steel-overlay-fixtures.cjs');
(async()=>{const repo=path.resolve(__dirname,'..'),out=path.join(repo,'artifacts/steel-cib');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),reports=[];
 try{for(const [mode,url]of [['source',process.env.APP_URL||'http://127.0.0.1:4197'],['offline',pathToFileURL(path.join(repo,'dist/scenario-workbench.html')).href]]){
  async function open(initial){const ctx=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await ctx.newPage(),errors=[],external=[];
   if(mode==='source'&&!process.env.APP_URL)await ctx.route('http://127.0.0.1:4197/**',async route=>{const pathname=decodeURIComponent(new URL(route.request().url()).pathname),file=path.resolve(repo,'.'+(pathname==='/'?'/index.html':pathname));assert.ok(file.startsWith(repo+path.sep));try{const body=await fs.readFile(file);await route.fulfill({status:200,body,contentType:{'.html':'text/html; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'}[path.extname(file)]||'application/octet-stream'});}catch(error){if(error.code!=='ENOENT')throw error;await route.fulfill({status:404,body:'Not found'});}});
   await ctx.addInitScript(p=>{if(p)localStorage.setItem('scenario-workbench.project.v1',JSON.stringify(p));const read=File.prototype.text;File.prototype.text=async function(){if(this.name==='slow-case.json')await new Promise(r=>setTimeout(r,180));return read.call(this);};},initial||null);
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:'))external.push(r.url());});await page.goto(url);return{ctx,page,errors,external};}
  async function go(page){await page.locator('nav [data-route=exports]').first().click();await page.locator('.exports-switch [data-tab=advanced]').click();const panel=page.locator('[data-steel-overlay]');await panel.locator(':scope > summary').click();return panel;}
  async function downloaded(page,locator,name){const event=page.waitForEvent('download');await locator.click();const file=await event,data=await fs.readFile(await file.path());if(name)await fs.writeFile(path.join(out,mode+'-'+name),data);return data.toString('utf8');}
  const main=await open(fixture()),p=main.page;
  await p.locator('.solver-fullspace button').filter({hasText:/^(开始检验.*|重新检验)$/}).click();await p.waitForFunction(()=>document.querySelector('[data-solver-summary]')?.textContent.includes('共找到 2 种自洽组合'));
  const solverArchive=JSON.parse(await downloaded(p,p.getByRole('button',{name:'下载本次结果 JSON',exact:true}),'solver-archive.json'));
  const panel=await go(p),beforeProject=await p.evaluate(()=>localStorage.getItem('scenario-workbench.project.v1'));
  await panel.getByLabel('钢铁工艺输入XML',{exact:true}).setInputFiles({name:'synthetic-steel.xml',mimeType:'application/xml',buffer:Buffer.from(steel)});await panel.locator('[data-steel-source]').filter({hasText:/SHA256/}).waitFor();
  for(const [label,value]of [['模型地区','HE'],['新增技术年份','2030'],['投入项','elect_td_ind']])await panel.getByLabel('钢铁覆盖'+label,{exact:true}).selectOption(value);
  await panel.getByLabel('投入商品单位证明XML',{exact:true}).setInputFiles({name:'synthetic-electricity.xml',mimeType:'application/xml',buffer:Buffer.from(electricity)});await panel.locator('[data-steel-unit-source]').filter({hasText:/SHA256/}).waitFor();
  await panel.getByLabel('钢铁系数操作',{exact:true}).selectOption('coefficient-decrease-percent');await panel.getByLabel('钢铁系数操作数值',{exact:true}).fill('5');
  await panel.locator('[data-steel-cib-link] > summary').click();await panel.getByLabel('关联的CIB冻结结果',{exact:true}).selectOption('session');
  assert.equal(await panel.getByLabel('关联的完整自洽组合',{exact:true}).inputValue(),'');
  await panel.getByLabel('关联的完整自洽组合',{exact:true}).selectOption('0');await panel.getByLabel('关联的输入型因素',{exact:true}).selectOption('A');
  async function run(){await panel.getByRole('checkbox').check();await panel.getByRole('button',{name:'核验并预览覆盖文件',exact:true}).click();}
  async function rejected(pattern){await run();await p.waitForFunction(()=>document.querySelector('[data-steel-status]').textContent.startsWith('未生成：'));assert.match(await panel.locator('[data-steel-status]').textContent(),pattern);assert.equal(await panel.getByRole('button',{name:'下载CIB关联留档',exact:true}).isDisabled(),true);}
  await rejected(/人工参数设定说明/);
  await panel.getByLabel('人工参数设定说明',{exact:true}).fill('合成工程假设：把所选A0状态对应到单项系数降低5%，不是研究建议。');await rejected(/地区对应说明/);
  await panel.getByLabel('CIB与模型地区对应说明',{exact:true}).fill('fixture-region在本次合成演示中人工对应HE，未经审定。');
  await panel.getByLabel('钢铁覆盖新增技术年份',{exact:true}).selectOption('2035');await rejected(/年份/);
  await panel.getByLabel('钢铁覆盖新增技术年份',{exact:true}).selectOption('2030');await panel.getByLabel('钢铁覆盖投入项',{exact:true}).selectOption('elect_td_ind');await run();
  await p.waitForFunction(()=>document.querySelector('[data-steel-status]').textContent.includes('所选完整组合已按冻结矩阵'));
  const raw=await downloaded(p,panel.getByRole('button',{name:'下载CIB关联留档',exact:true}),'case.json'),bundle=JSON.parse(raw),xml=await downloaded(p,panel.getByRole('button',{name:'下载覆盖XML（工程测试）',exact:true}),'linked.xml'),audit=JSON.parse(await downloaded(p,panel.getByRole('button',{name:'下载核验记录',exact:true}),'linked-audit.json'));
  assert.deepEqual(bundle.cib.archive,solverArchive);assert.deepEqual(bundle.cib.configuration,{A:'A0',B:'B0'});assert.equal(bundle.cib.factor.stateId,'A0');assert.equal(bundle.cib.assumption.reviewStatus,'unreviewed');assert.equal(bundle.cib.validation.enumerationCountIndependentlyRecomputed,false);assert.equal(bundle.cib.validation.currentProjectConsistencyEvaluated,false);assert.equal(bundle.parameter.xml,xml);assert.deepEqual(bundle.parameter.audit,audit);assert.equal(crypto.createHash('sha256').update(xml).digest('hex'),audit.overlaySha256);assert.ok(xml.includes(bundle.integrity.archiveSha256));assert.equal(audit.cibOrigin.configurationSha256,bundle.integrity.configurationSha256);
  assert.equal(await p.evaluate(()=>localStorage.getItem('scenario-workbench.project.v1')),beforeProject);
  await panel.locator('.steel-preview > summary').click();await panel.screenshot({path:path.join(out,mode+'-linked-preview.png')});
  await panel.getByLabel('钢铁系数操作数值',{exact:true}).fill('6');assert.equal(await panel.getByRole('checkbox').isChecked(),false);assert.equal(await panel.getByRole('button',{name:'下载CIB关联留档',exact:true}).isDisabled(),true);await panel.getByLabel('钢铁系数操作数值',{exact:true}).fill('5');
  await p.getByLabel('检验记录名称',{exact:true}).fill('关联演示冻结源');await p.getByRole('button',{name:'保存为检验记录',exact:true}).click();
  const savedValue=await panel.getByLabel('关联的CIB冻结结果',{exact:true}).locator('option').evaluateAll(nodes=>nodes.find(n=>n.value.startsWith('saved:'))?.value);assert.ok(savedValue);
  await panel.getByLabel('关联的CIB冻结结果',{exact:true}).selectOption(savedValue);assert.equal(await panel.getByLabel('关联的完整自洽组合',{exact:true}).inputValue(),'');await rejected(/完整自洽组合/);
  await panel.getByLabel('关联的完整自洽组合',{exact:true}).selectOption('1');await panel.getByLabel('关联的输入型因素',{exact:true}).selectOption('A');await panel.getByLabel('人工参数设定说明',{exact:true}).fill('合成工程假设：A1同样采用5%的单项系数操作，仅验证情景身份留档。');await run();await p.waitForFunction(()=>document.querySelector('[data-steel-status]').textContent.includes('所选完整组合已按冻结矩阵'));
  const second=JSON.parse(await downloaded(p,panel.getByRole('button',{name:'下载CIB关联留档',exact:true}),'second-case.json'));assert.deepEqual(second.cib.configuration,{A:'A1',B:'B1'});assert.notEqual(second.integrity.configurationSha256,bundle.integrity.configurationSha256);assert.notEqual(second.parameter.xml,xml);
  await p.setViewportSize({width:390,height:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await panel.screenshot({path:path.join(out,mode+'-mobile.png')});
  const independent=await open(null),q=independent.page,reopenRoot=await go(q),reopen=reopenRoot.locator('[data-steel-cib-reopen]');await reopen.locator(':scope > summary').click();const original=await q.evaluate(()=>localStorage.getItem('scenario-workbench.project.v1'));
  const file=(name,contents)=>reopen.getByLabel('核验钢铁CIB关联留档',{exact:true}).setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(contents)});
  await file('case.json',raw);await q.waitForFunction(()=>document.querySelector('[data-steel-cib-reopen-status]').textContent.includes('留档核验通过'));assert.match(await reopen.locator('[data-steel-cib-reopen-status]').textContent(),/原模型源文件未重新读取/);assert.equal(await downloaded(q,reopen.getByRole('button',{name:'取回留档中的XML',exact:true})),xml);
  assert.equal(await reopenRoot.getByLabel('钢铁工艺输入XML',{exact:true}).evaluate(n=>n.files.length),0);
  const bad=structuredClone(bundle);bad.parameter.xml=bad.parameter.xml.replace('<coefficient>1.9','<coefficient>99');
  await file('tampered.json',JSON.stringify(bad));await q.waitForFunction(()=>document.querySelector('[data-steel-cib-reopen-status]').textContent.startsWith('留档未采用'));assert.equal(await reopen.getByRole('button',{name:'取回留档中的XML',exact:true}).isDisabled(),true);
  await file('slow-case.json',raw);await file('invalid.json','{broken');await q.waitForTimeout(260);assert.match(await reopen.locator('[data-steel-cib-reopen-status]').textContent(),/^留档未采用/);assert.equal(await reopen.getByRole('button',{name:'取回留档中的XML',exact:true}).isDisabled(),true);
  await file('oversize.json',' '.repeat(8*1024*1024+1));await q.waitForFunction(()=>document.querySelector('[data-steel-cib-reopen-status]').textContent.includes('超过8 MiB'));assert.equal(await q.evaluate(()=>localStorage.getItem('scenario-workbench.project.v1')),original);
  for(const c of [main,independent]){assert.deepEqual(c.errors,[]);assert.deepEqual(c.external,[]);await c.ctx.close();}
  reports.push({mode,actualSolverRunThenExport:true,sessionAndSavedHistorySources:true,explicitWholeScenarioSelection:true,manualAssumptionRegionAndYearChecks:true,fullArchivePreserved:true,xmlAndAuditHashBound:true,parameterEditsInvalidateAndRequireRecheck:true,independentReopenWithoutModelFiles:true,tamperedInvalidOversizeAndRacingImportsRejected:true,projectUnchanged:true,mobile390Overflow:false,httpServerTested:mode==='source'&&!!process.env.APP_URL});console.log('PASS '+mode+' CIB-linked export and independent reopen');
 }
 await fs.writeFile(path.join(out,'browser-results.json'),JSON.stringify(reports,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
