const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');const {pathToFileURL}=require('node:url');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),home=require('./home-controls.cjs');
(async()=>{const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/curve-integration');await fs.mkdir(out,{recursive:true});const {createDemoProject}=await import(pathToFileURL(path.join(root,'src/fixtures/demo.mjs')).href);const browser=await chromium.launch({args:['--no-sandbox','--disable-gpu'],executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{for(const [mode,url]of[['source',process.env.APP_URL||'http://127.0.0.1:4178'],['offline',pathToFileURL(path.join(root,'dist/scenario-workbench.html')).href]]){
 const ctx=await browser.newContext({viewport:{width:1440,height:1080}});const p=createDemoProject();p.view.module='relationships';await ctx.addInitScript(p=>{if(!localStorage.getItem('scenario-workbench.project.v1'))localStorage.setItem('scenario-workbench.project.v1',JSON.stringify(p));},p);const page=await ctx.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:'))external.push(r.url());});await page.goto(url);
 const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('scenario-workbench.project.v1')));
 await page.getByRole('button',{name:'受限二档图形编码',exact:true}).click();await page.getByLabel('源变量高状态',{exact:true}).selectOption('a-high');await page.getByLabel('目标变量高状态',{exact:true}).selectOption('b-high');await page.getByLabel('编码模板',{exact:true}).selectOption('A(2)');assert.equal(await page.locator('option[value="L(1,3)"]').evaluate(e=>e.disabled),true);await page.getByLabel('我明确判断这是直接影响',{exact:true}).check();await page.getByLabel('我确认双方全部二档均为有序高低，剩余状态为低',{exact:true}).check();await page.getByLabel('编码适用地区',{exact:true}).fill(p.scope.regionId);await page.getByLabel('编码适用年份',{exact:true}).fill('2030');await page.getByRole('button',{name:'更新编码预览',exact:true}).click();assert.match(await page.locator('.curve-panel').innerText(),/weakly/);await page.screenshot({path:path.join(out,mode+'-preview.png'),fullPage:true});await page.getByRole('button',{name:'保存已确认编码草案',exact:true}).click();assert.equal((await stored()).data.judgments.length,0);
 await page.getByLabel('修订 示例高档 → 示例高档',{exact:true}).fill('1');await page.getByLabel('修订理由 示例高档 → 示例高档',{exact:true}).fill('用户额外判断');await page.getByRole('button',{name:'更新编码预览',exact:true}).click();await page.getByLabel('明确确认当前绑定、完整分数及全部警告',{exact:true}).check();await page.getByLabel('编码关系理由',{exact:true}).fill('修改后必须重确认');assert.equal(await page.getByLabel('明确确认当前绑定、完整分数及全部警告',{exact:true}).isChecked(),false);await page.getByRole('button',{name:'更新编码预览',exact:true}).click();await page.getByLabel('明确确认当前绑定、完整分数及全部警告',{exact:true}).check();await page.getByRole('button',{name:'保存已确认编码草案',exact:true}).click();const saved=await stored();assert.equal(saved.data.judgments.length,1);const j=saved.data.judgments[0];assert.equal(j.curveEncoding.generatedEntries.find(e=>e.sourceStateId==='a-high'&&e.targetStateId==='b-high').score,2);assert.equal(j.entries.find(e=>e.sourceStateId==='a-high'&&e.targetStateId==='b-high').score,1);assert.equal(j.reviewStatus,'draft');
 await page.getByLabel('编辑判断记录',{exact:true}).selectOption(j.id);assert.match(await page.locator('.relationships-module').innerText(),/weakly/);await page.getByRole('button',{name:'按年份准备矩阵',exact:true}).click();await page.getByLabel('矩阵年份',{exact:true}).selectOption('2030');await page.getByLabel('选用 示例变量A → 示例变量B',{exact:true}).selectOption(j.id);assert.match(await page.locator('[data-matrix-coverage]').innerText(),/已判 4/);assert.match(await page.locator('.relationships-diagnostics').innerText(),/缺关系规律/);assert.match(await page.locator('.relationships-diagnostics').innerText(),/weakly/);await page.screenshot({path:path.join(out,mode+'-matrix.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,mode+'-mobile.png'),fullPage:true});await page.reload();await page.getByRole('button',{name:'按年份准备矩阵',exact:true}).click();assert.match(await page.locator('[data-matrix-coverage]').innerText(),/已判 4/);assert.ok((await stored()).data.judgments[0].curveEncoding.sourceIssues[0].message.includes('weakly'));await page.locator('nav [data-route=workspace]').first().click();const event=page.waitForEvent('download');await home.downloadBackup(page);const download=await event;const backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.ok(backup.data.judgments[0].curveEncoding.sourceIssues[0].message.includes('weakly'));// Each restore target differs in both title and scientific evidence data.
 const dialogs=[],restoreResults=[];
 async function restore(target,label,accept=true){
   await page.locator('nav [data-route=workspace]').first().click();
   const incoming=structuredClone(target),marker='restore-marker-'+mode+'-'+label;
   incoming.title='F2-'+mode+'-'+label;incoming.view.module='workspace';incoming.view.objectId=null;
   incoming.data.evidence.push({id:marker,kind:'user-assumption',sourceId:'restore-test',locator:label,excerpt:'Distinguishable restore fixture '+label,version:1,reviewStatus:'draft',provenance:{origin:'user'}});
   const before=await stored();
   const handling=page.waitForEvent('dialog',{timeout:8000}).then(async dialog=>{assert.equal(dialog.type(),'confirm');assert.match(dialog.message(),/恢复备份会替换当前项目/);dialogs.push({label,action:accept?'accept':'dismiss',message:dialog.message()});if(accept)await dialog.accept();else await dialog.dismiss();});
   await page.getByLabel('从JSON备份恢复').setInputFiles({name:label+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(incoming))});   await handling;
   if(accept){
     await page.waitForFunction(({title,marker})=>{const p=JSON.parse(localStorage.getItem('scenario-workbench.project.v1'));return p.title===title&&p.data.evidence.some(e=>e.id===marker)&&document.querySelector('#global-status')?.textContent.includes('项目备份已恢复');},{title:incoming.title,marker});
     const actual=await stored();assert.deepEqual(actual.data,incoming.data);assert.deepEqual(actual.selection,incoming.selection);assert.notDeepEqual(actual.data,before.data);restoreResults.push({label,accepted:true,markerLoaded:true});
   }else{
     await page.waitForFunction(()=>document.querySelector('#project-import').value==='');assert.deepEqual(await stored(),before);restoreResults.push({label,accepted:false,projectUnchanged:true});
   }
   return incoming;
 }
 async function matrixFor(id,count,label,gap=false){
   await page.locator('nav [data-route=relationships]').first().click();await page.getByRole('button',{name:'按年份准备矩阵',exact:true}).click();await page.getByLabel('矩阵年份',{exact:true}).selectOption('2030');await page.getByLabel('选用 示例变量A → 示例变量B',{exact:true}).selectOption(id);assert.match(await page.locator('[data-matrix-coverage]').innerText(),new RegExp('已判 '+count+'；'));
   if(count===0)assert.match(await page.locator('.relationships-diagnostics').innerText(),/曲线记录拒绝/);
   if(gap)assert.match(await page.locator('.relationships-diagnostics').innerText(),/尚缺关系规律/);
   await page.screenshot({path:path.join(root,'artifacts/curve-review-fixes',mode+'-'+label+'.png'),fullPage:true});
 }
 await fs.mkdir(path.join(root,'artifacts/curve-review-fixes'),{recursive:true});
 const valid=await restore(backup,'valid');
 assert.deepEqual((await stored()).data.judgments[0],backup.data.judgments[0]);
 assert.equal(valid.data.judgments[0].curveEncoding.generatedEntries.find(e=>e.sourceStateId==='a-high'&&e.targetStateId==='b-high').score,2);
 assert.equal(valid.data.judgments[0].entries.find(e=>e.sourceStateId==='a-high'&&e.targetStateId==='b-high').score,1);
 assert.equal(valid.data.judgments[0].curveEncoding.humanConfirmation.confirmed,true);assert.ok(valid.data.judgments[0].curveEncoding.sourceIssues[0].message.includes('weakly'));
 await matrixFor(j.id,4,'valid-restored',true);
 const unconfirmed=structuredClone(backup);unconfirmed.data.judgments[0].curveEncoding.humanConfirmation=null;
 await restore(unconfirmed,'unconfirmed');assert.equal((await stored()).data.judgments[0].curveEncoding.humanConfirmation,null);await matrixFor(j.id,0,'unconfirmed-rejected');
 const tampered=structuredClone(backup);tampered.data.judgments[0].entries[0].score=-3;
 await restore(tampered,'tampered');assert.equal((await stored()).data.judgments[0].entries[0].score,-3);await matrixFor(j.id,0,'tampered-rejected');
 await restore(backup,'cancelled',false);
 // F1 review reproduction: a genuinely confirmed curve references a separate DOI-URL alias.
 const {prepareCurve,confirmCurve,validateCurve}=await import(pathToFileURL(path.join(root,'src/modules/relationships/curve.mjs')).href);
 const aliasProject=createDemoProject();aliasProject.data.evidence.push({id:'url-method-alias',kind:'paper',sourceId:'https://doi.org/10.1016/j.mex.2021.101492',locator:'Only encoding method',excerpt:'Not actual relationship evidence',reviewStatus:'draft',version:1,provenance:{origin:'import'}});
 let seq=0;const alias=confirmCurve(prepareCurve(aliasProject,{sourceId:'descriptor-a',targetId:'descriptor-b',sourceHigh:'a-high',targetHigh:'b-high',templateId:'A(2)',ordinalConfirmed:true,directRelation:true,region:aliasProject.scope.regionId,years:[2030],rationale:'F1 URL alias reproduction',relationEvidenceRefs:['url-method-alias']},()=>mode+'-alias-'+(++seq)));
 assert.equal(validateCurve(alias.project,alias.judgment).ok,true);
 await restore(alias.project,'url-alias-curve');await matrixFor(alias.judgment.id,4,'url-alias-curve-gap',true);
 const aliasDirect=structuredClone(alias.project);aliasDirect.data.judgments[0].curveEncoding=null;aliasDirect.data.judgments[0].evidenceRefs=['url-method-alias'];
 await restore(aliasDirect,'url-alias-direct');await matrixFor(alias.judgment.id,4,'url-alias-direct-gap',true);
 assert.equal(dialogs.length,6);assert.equal(dialogs.filter(d=>d.action==='accept').length,5);assert.equal(dialogs.filter(d=>d.action==='dismiss').length,1);
 await fs.writeFile(path.join(root,'artifacts/curve-review-fixes',mode+'-restore-results.json'),JSON.stringify({dialogs,restoreResults},null,2));
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await ctx.close();console.log(mode+': original preview/override/mobile checks; 5 explicitly accepted distinct restores, 1 dismissed restore, invalid adopted=0 and curve/direct URL-alias evidence gaps passed');
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

