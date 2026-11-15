const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {fixture}=require('./solver-browser-fixtures.cjs'),{steel,electricity}=require('./steel-overlay-fixtures.cjs');
(async()=>{const repo=path.resolve(__dirname,'..'),out=path.join(repo,'artifacts/steel-overlay');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),reports=[];
 try{for(const [mode,url] of [['source',process.env.APP_URL||'http://127.0.0.1:4197'],['offline',pathToFileURL(path.join(repo,'dist/scenario-workbench.html')).href]]){
  const ctx=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await ctx.newPage(),errors=[],external=[];
  if(mode==='source'&&!process.env.APP_URL)await ctx.route('http://127.0.0.1:4197/**',async route=>{
   const pathname=decodeURIComponent(new URL(route.request().url()).pathname),file=path.resolve(repo,'.'+(pathname==='/'?'/index.html':pathname));
   assert.ok(file.startsWith(repo+path.sep));
   try{const body=await fs.readFile(file),ext=path.extname(file),contentType={'.html':'text/html; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml'}[ext]||'application/octet-stream';await route.fulfill({status:200,contentType,body});}
   catch(error){if(error.code!=='ENOENT')throw error;await route.fulfill({status:404,body:'Not found'});}
  });
  await ctx.addInitScript(value=>{
   localStorage.setItem('scenario-workbench.project.v1',JSON.stringify(value));
   const read=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){if(this.name==='slow.xml')await new Promise(r=>setTimeout(r,200));return read.call(this);};
   const hash=SubtleCrypto.prototype.digest;SubtleCrypto.prototype.digest=async function(kind,bytes){const text=new TextDecoder().decode(bytes);if(text.startsWith('<?xml'))await new Promise(r=>setTimeout(r,120));return hash.call(this,kind,bytes);};
  },fixture());
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:'))external.push(r.url());});
  await page.goto(url);await page.locator('nav [data-route=exports]').first().click();await page.locator('.exports-switch [data-tab=advanced]').click();
  let panel=page.locator('[data-steel-overlay]');await panel.locator(':scope > summary').click();
  const original=await page.evaluate(()=>localStorage.getItem('scenario-workbench.project.v1'));
  const file=(label,name,buffer)=>panel.getByLabel(label,{exact:true}).setInputFiles({name,mimeType:'application/xml',buffer:Buffer.from(buffer)});
  const select=(label,value)=>panel.getByLabel('钢铁覆盖'+label,{exact:true}).selectOption(value);
  const op=kind=>panel.getByLabel('钢铁系数操作',{exact:true}).selectOption(kind);
  const amount=value=>panel.getByLabel('钢铁系数操作数值',{exact:true}).fill(value);
  const confirm=()=>panel.getByRole('checkbox').check();
  const run=()=>panel.getByRole('button',{name:'核验并预览覆盖文件',exact:true}).click();
  const disabled=async()=>{for(const name of ['下载覆盖XML（工程测试）','下载核验记录','下载组件请求JSON'])assert.equal(await panel.getByRole('button',{name,exact:true}).isDisabled(),true);};
  const success=async expected=>{await run();await page.waitForFunction(value=>{const n=document.querySelector('[data-steel-audit]');return n?.textContent&&JSON.parse(n.textContent).writtenCoefficient===value;},expected);};
  const failed=async pattern=>{await run();await page.waitForFunction(()=>document.querySelector('[data-steel-status]').textContent.startsWith('未生成：'));assert.match(await panel.locator('[data-steel-status]').textContent(),pattern);await disabled();assert.equal(await panel.locator('[data-steel-xml]').textContent(),'');};
  async function download(name,filename){const event=page.waitForEvent('download');await panel.getByRole('button',{name,exact:true}).click();const d=await event;const data=await fs.readFile(await d.path());await fs.writeFile(path.join(out,mode+'-'+filename),data);return data.toString('utf8');}
  async function choose(){await select('模型地区','HE');await select('新增技术年份','2030');await select('投入项','elect_td_ind');}
  await disabled();
  await file('钢铁工艺输入XML','synthetic-steel.xml',steel);await panel.locator('[data-steel-source]').filter({hasText:/SHA256/}).waitFor();await choose();
  assert.match(await panel.locator('[data-steel-target]').textContent(),/缺少/);
  await file('投入商品单位证明XML','synthetic-electricity.xml',electricity);await panel.locator('[data-steel-unit-source]').filter({hasText:/SHA256/}).waitFor();
  assert.match(await panel.locator('[data-steel-target]').textContent(),/原系数 2 EJ\/Mt/);
  await op('coefficient-decrease-percent');await confirm();await failed(/尚未填写/);
  await amount('5');await success(1.9);
  const xml=await download('下载覆盖XML（工程测试）','overlay.xml'),audit=JSON.parse(await download('下载核验记录','audit.json')),request=JSON.parse(await download('下载组件请求JSON','request.json'));
  assert.equal(xml,await panel.locator('[data-steel-xml]').textContent());assert.deepEqual(audit,JSON.parse(await panel.locator('[data-steel-audit]').textContent()));
  assert.equal(crypto.createHash('sha256').update(xml).digest('hex'),audit.overlaySha256);assert.equal(audit.testOnly,true);assert.equal(audit.researchMappingApproved,false);assert.equal(request.testOnly,true);assert.equal(request.source.path,'synthetic-steel.xml');assert.equal(request.target.expectedBaseline,2);
  await panel.locator('.steel-preview > summary').click();await panel.screenshot({path:path.join(out,mode+'-preview.png')});
  await amount('6');await disabled();assert.equal(await panel.locator('[data-steel-xml]').textContent(),'');
  await run();await amount('7');await page.waitForTimeout(220);await disabled();assert.equal(await panel.locator('[data-steel-xml]').textContent(),'');
  await op('set-coefficient');await amount('0');await success(0);assert.match(await panel.locator('[data-steel-xml]').textContent(),/<coefficient>0<\/coefficient>/);
  await op('reciprocal-efficiency-increase-percent');await amount('5');await success(2/1.05);
  await op('coefficient-decrease-percent');await amount('101');await failed(/不能超过100/);await amount('-1');await failed(/非负/);
  await panel.getByRole('button',{name:'移除额外单位证明',exact:true}).click();await confirm();await amount('5');await failed(/缺少/);
  await select('投入项','scrap');assert.match(await panel.locator('[data-steel-target]').textContent(),/原系数 3 Mt\/Mt/);await op('coefficient-multiplier');await amount('0.95');await confirm();await success(3*.95);
  await file('钢铁工艺输入XML','broken.xml','<scenario>');await page.waitForFunction(()=>document.querySelector('[data-steel-status]').textContent.includes('文件未采用'));await disabled();assert.equal(await panel.locator('[data-steel-xml]').textContent(),'');
  await file('钢铁工艺输入XML','dtd.xml','<!DOCTYPE scenario [<!ENTITY x "data">]><scenario/>');await page.waitForFunction(()=>document.querySelector('[data-steel-status]').textContent.includes('DTD'));await disabled();
  const duplicate=steel.replace('</world>',steel.match(/<region name="HE">[\s\S]*?<\/region>/)[0]+'</world>');
  await file('钢铁工艺输入XML','duplicate.xml',duplicate);await panel.locator('[data-steel-source]').filter({hasText:/duplicate.xml/}).waitFor();await choose();await confirm();await failed(/实际找到 2/);
  await file('钢铁工艺输入XML','slow.xml',steel);await file('钢铁工艺输入XML','fast.xml',steel.replaceAll('<coefficient>2</coefficient>','<coefficient>8</coefficient>'));
  await panel.locator('[data-steel-source]').filter({hasText:/fast.xml/}).waitFor();await page.waitForTimeout(260);assert.match(await panel.locator('[data-steel-source]').textContent(),/^fast.xml/);
  await choose();await select('投入项','scrap');await confirm();await op('set-coefficient');await amount('0');await success(0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('scenario-workbench.project.v1')),original);
  await page.setViewportSize({width:390,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await panel.screenshot({path:path.join(out,mode+'-mobile.png')});
  await file('钢铁工艺输入XML','slow.xml',steel);await page.locator('nav [data-route=solver]').first().click();await page.waitForTimeout(260);await page.locator('nav [data-route=exports]').first().click();await page.locator('.exports-switch [data-tab=advanced]').click();panel=page.locator('[data-steel-overlay]');await panel.locator(':scope > summary').click();assert.equal(await panel.locator('[data-steel-source]').textContent(),'');await disabled();
  if(mode==='source'){
   const core=await page.evaluate(async({steel,electricity,request})=>{
    const engine=await import('/src/modules/exports/steel-overlay.mjs'),encode=text=>new TextEncoder().encode(text);
    const source=await engine.readSteelXml('synthetic-steel.xml',encode(steel)),commodity=await engine.readSteelXml('synthetic-electricity.xml',encode(electricity)),cases=[];
    for(const [kind,value] of [['set-coefficient',0],['set-coefficient',8],['coefficient-multiplier',.95],['coefficient-decrease-percent',0],['coefficient-decrease-percent',100],['reciprocal-efficiency-increase-percent',5]]){
     const r=structuredClone(request);r.operation={kind,value};const result=await engine.verifySteelRequest(r,source,commodity);cases.push(result);
    }
    const mutations=[r=>r.testOnly=false,r=>r.source.sha256='0'.repeat(64),r=>r.target.expectedBaseline=2.01,r=>r.target.unit='Mt/Mt',r=>r.commodity.region='TJ',r=>r.target.year=true,r=>r.target.input='absent',r=>r.target.extra=true,r=>r.operation.value=null];
    let rejected=0;
    for(const mutate of mutations){const r=structuredClone(request);mutate(r);try{await engine.verifySteelRequest(r,source,commodity);}catch{rejected++;}}
    if(rejected!==mutations.length)throw new Error('A malformed request was accepted');
    let namespaceRejected=false;try{await engine.readSteelXml('namespaced.xml',encode('<scenario xmlns="urn:test"><world/></scenario>'));}catch{namespaceRejected=true;}
    if(!namespaceRejected)throw new Error('Unsupported XML namespace was accepted');
    return {cases,rejectedRequests:rejected,namespaceRejected};
   },{steel,electricity,request});
   assert.equal(core.rejectedRequests,9);await fs.writeFile(path.join(out,'source-core-cases.json'),JSON.stringify(core,null,2));
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);reports.push({mode,sourceTransport:mode==='source'?(process.env.APP_URL?'local-http-server':'playwright-file-backed-responses'):'file-url',downloadsMatchPreview:true,pythonRequestCompatible:true,explicitZero:true,blankNegativeAndExcessRejected:true,missingUnitAndDuplicateNodeRejected:true,invalidXMLAndDTDRejected:true,editsInvalidateDownloads:true,asyncPreviewAndFileRacesGuarded:true,routeExitClearsLocalFiles:true,projectUnchanged:true,mobile390Overflow:false,pageErrors:errors,externalRequests:external});await ctx.close();
  console.log('PASS '+mode+' steel overlay browser workflow');
 }
 await fs.writeFile(path.join(out,'browser-results.json'),JSON.stringify(reports,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
