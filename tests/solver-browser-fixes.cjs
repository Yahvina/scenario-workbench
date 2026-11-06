const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {fixture}=require('./solver-browser-fixtures.cjs'),review=require('./solver-browser-input-fixtures.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/solver-fixes');await fs.mkdir(out,{recursive:true});
 const html=await fs.readFile(path.join(root,'dist/scenario-workbench.html'),'utf8'),bundle=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 const boot='__require("src/app.mjs");';assert.ok(bundle.includes(boot));
 // Test-only access to the actual bundled engine, without adding a production global or booting another app.
 const engineBundle=bundle.replace(boot,'globalThis.__solverFixTest=__require("src/modules/solver/engine.mjs");');
 const browser=await chromium.launch({args:['--no-sandbox','--disable-gpu'],executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),reports=[];
 try{for(const [mode,url]of[['source',process.env.APP_URL||'http://127.0.0.1:4184'],['offline',pathToFileURL(path.join(root,'dist/scenario-workbench.html')).href]]){
  const ctx=await browser.newContext({viewport:{width:1280,height:960}}),p=fixture();p.data.states[0].validYears=[];p.data.states[0].scope.regionId=null;
  await ctx.addInitScript(p=>{if(!localStorage.getItem('scenario-workbench.project.v1'))localStorage.setItem('scenario-workbench.project.v1',JSON.stringify(p));},p);
  const page=await ctx.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:'))external.push(r.url());});await page.goto(url);
  await page.getByLabel('检算年份',{exact:true}).selectOption('2030');for(const j of p.data.judgments)await page.getByLabel('检算选用 '+j.sourceDescriptorId+' → '+j.targetDescriptorId,{exact:true}).selectOption(j.id);
  await page.getByLabel('按当前草案、依据不足及量表假设检算',{exact:true}).check();await page.getByRole('button',{name:'冻结输入并精确检算',exact:true}).click();assert.match(await page.locator('[data-solver-result]').innerText(),/阻断.*未定/);assert.match(await page.locator('.solver-diagnostics').textContent(),/STATE_ASSUMPTIONS_REQUIRED/);
  await page.getByText('检算设置与矩阵交接',{exact:true}).click();await page.getByLabel('未声明的状态年份或地区作为当前截面假设',{exact:true}).check();await page.getByRole('button',{name:'冻结输入并精确检算',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-solver-result]')?.textContent.includes('检算完成 · 已检查 4 · 成立数 2'));
  const event=page.waitForEvent('download');await page.getByRole('button',{name:'下载检算JSON归档',exact:true}).click();const download=await event,file=path.join(out,mode+'-unknown-confirmed-archive.json');await download.saveAs(file);const archive=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(archive.assumptionAcknowledgements.unknownStateScope,true);assert.equal(archive.RunResult.count,2);assert.deepEqual(archive.RunResult.coverage,{required:8,judged:8,missingPairs:[]});
  await page.screenshot({path:path.join(out,mode+'-unknown-confirmed.png'),fullPage:true});
  if(mode==='source')await page.evaluate(async()=>{globalThis.__solverFixTest=await import('/src/modules/solver/engine.mjs');});else await page.evaluate(code=>(0,eval)(code),engineBundle);
  const actual=await page.evaluate(({input,cases})=>{
   const api=globalThis.__solverFixTest,summary=r=>({status:r.status,checked:r.checked,count:r.count,coverage:r.coverage,code:r.diagnostics[0]?.code});
   const replay=api.solve(input),baseline=api.solve(cases.baseline),rejections=cases.bad.map(c=>{let explainCode=null;try{api.explain(c.input,{A:'A0',B:'B0'});}catch(e){explainCode=e.code;}return {label:c.label,expected:c.code,solve:summary(api.solve(c.input)),chunk:summary(api.createEnumeration(c.input).step(1).result),explainCode};});
   const changed=structuredClone(input);changed.stateDefinitions[0].validYears=[2035];const knownMismatch=summary(api.solve(changed));
   return {replay:summary(replay),unknownCodes:replay.diagnostics.map(d=>d.code),baseline:summary(baseline),rejections,knownMismatch};
  },{input:archive.RunInput,cases:{baseline:review.input(),bad:review.cases()}});
  assert.equal(actual.replay.count,2);assert.equal(actual.baseline.count,2);assert.deepEqual(actual.replay.coverage,{required:8,judged:8,missingPairs:[]});assert.ok(actual.unknownCodes.includes('STATE_YEARS_UNKNOWN'));assert.ok(actual.unknownCodes.includes('STATE_REGION_UNKNOWN'));
  for(const c of actual.rejections){for(const r of [c.solve,c.chunk]){assert.equal(r.status,'blocked',c.label);assert.equal(r.checked,0,c.label);assert.equal(r.count,null,c.label);assert.equal(r.coverage,null,c.label);assert.equal(r.code,c.expected,c.label);}assert.equal(c.explainCode,c.expected,c.label);}
  assert.equal(actual.knownMismatch.status,'blocked');assert.equal(actual.knownMismatch.count,null);assert.equal(actual.knownMismatch.checked,0);assert.equal(actual.knownMismatch.code,'STATE_YEAR_MISMATCH');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  reports.push({mode,...actual,pageErrors:errors,externalRequests:external});await ctx.close();console.log(mode+': '+actual.rejections.length+' direct negative controls across solve/chunks/explain; actual confirmed-unknown download replays 2 with coverage 8/8');
 }
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify(reports,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
