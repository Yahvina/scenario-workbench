const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),home=require('./home-controls.cjs');
const key='scenario-workbench.project.v1';
(async()=>{
  const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','relationships');await fs.mkdir(out,{recursive:true});
  const {createDemoProject}=await import(pathToFileURL(path.join(root,'src/fixtures/demo.mjs')).href);
  function fixture(three=true){
    const p=createDemoProject();
    if(three){const s=structuredClone(p.data.states.find(s=>s.id==='b-high'));s.id='b-mid';s.label='示例中档';p.data.states.push(s);p.data.descriptors[1].stateIds.push(s.id);}
    return p;
  }
  function record(p,id='ab-original',score=-1){return {id,sourceDescriptorId:'descriptor-a',targetDescriptorId:'descriptor-b',scope:{regionId:p.scope.regionId},validYears:[2030],directness:'direct',curveEncoding:null,entries:p.data.descriptors[0].stateIds.flatMap(a=>p.data.descriptors[1].stateIds.map(b=>({sourceStateId:a,targetStateId:b,score:a==='a-low'&&b==='b-low'?score:null}))),alternatives:[],rationale:'原始导入判断测试记录',evidenceRefs:['fixture-source'],reviewStatus:'reviewed',version:1,provenance:{origin:'import',sourceId:'fixture-source'}};}
  const browser=await chromium.launch({args:['--no-sandbox','--disable-gpu'],executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const source=process.env.APP_URL||'http://127.0.0.1:4176',results=[];
  async function open(url,p,fail=false,corrupt=false){
    const ctx=await browser.newContext({viewport:{width:1440,height:1080},acceptDownloads:true});
    await ctx.addInitScript(({p,key,fail,corrupt})=>{if(corrupt)sessionStorage.setItem('relationships-ui-v1:'+p.id,'null');if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(p));if(fail)Storage.prototype.setItem=function(){throw new Error('simulated quota');};},{p,key,fail,corrupt});
    const page=await ctx.newPage();page.setDefaultTimeout(8000);const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:'))external.push(r.url());});await page.goto(url);return {ctx,page,errors,external};
  }
  const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  const route=(page,id)=>page.locator('nav [data-route="'+id+'"]').first().click();
  const cell=(page,a,b)=>page.locator('input[data-source-state="'+a+'"][data-target-state="'+b+'"]');
  const matrixCell=(page,a,b)=>page.locator('[data-matrix-source="'+a+'"][data-matrix-target="'+b+'"]');
  try{
    for(const [mode,url] of [['source',source],['offline',pathToFileURL(path.join(root,'dist/scenario-workbench.html')).href]]){
      const p=fixture();p.view.perspective='expert';p.data.judgments.push(record(p));const {ctx,page,errors,external}=await open(url,p);
      await home.snapshot(page);await route(page,'relationships');
      assert.equal(await page.locator('input[data-source-state]').count(),6);
      assert.equal(await cell(page,'a-low','b-low').inputValue(),'');
      await page.getByLabel('编辑判断记录',{exact:true}).selectOption('ab-original');assert.equal(await cell(page,'a-low','b-low').inputValue(),'-1');
      const before=(await stored(page));
      await cell(page,'a-low','b-low').fill('0');await cell(page,'a-low','b-low').press('Tab');await cell(page,'a-high','b-mid').fill('2');
      await page.getByLabel('判断理由',{exact:true}).fill('用户修订：0表示没关系，另一格+2；依据待核');
      await page.getByRole('button',{name:'交换方向',exact:true}).click();assert.equal(await page.getByLabel('来源变量',{exact:true}).inputValue(),'descriptor-a');
      await page.getByRole('button',{name:'按年份准备矩阵',exact:true}).click();assert.equal(await page.locator('.relationships-module').getAttribute('data-tab'),'input');
      await page.getByLabel('界面视角',{exact:true}).selectOption('public');assert.equal(await page.getByLabel('界面视角',{exact:true}).inputValue(),'expert');
      await route(page,'timeline');assert.equal(await page.locator('.relationships-module').count(),1);assert.equal((await stored(page)).revision,before.revision);
      await cell(page,'a-low','b-low').fill('1.5');await page.getByRole('button',{name:'保存判断草稿',exact:true}).click();assert.match(await page.locator('.relationships-status').innerText(),/整数/);assert.equal((await stored(page)).revision,before.revision);
      await cell(page,'a-low','b-low').fill('4');await page.getByRole('button',{name:'保存判断草稿',exact:true}).click();assert.equal((await stored(page)).revision,before.revision);
      await cell(page,'a-low','b-low').fill('0');await page.getByLabel('判断适用年份',{exact:true}).fill('2030,2030');await page.getByRole('button',{name:'保存判断草稿',exact:true}).click();assert.match(await page.locator('.relationships-status').innerText(),/不重复/);
      await page.getByLabel('判断适用年份',{exact:true}).fill('2030');await page.getByRole('button',{name:'保存判断草稿',exact:true}).click();
      const saved=await stored(page);assert.equal(saved.revision,before.revision+1);assert.equal(saved.data.judgments[0].entries[0].score,0);assert.equal(saved.data.judgments[0].reviewStatus,'draft');assert.match(await page.locator('#snapshot-details').innerText(),/已过期/);
      await page.getByRole('button',{name:'保存判断草稿',exact:true}).click();assert.equal((await stored(page)).revision,saved.revision);
      await page.getByText('关联依据、原始值与修改记录',{exact:true}).click();assert.match(await page.locator('.relationships-evidence').innerText(),/a-low→b-low=-1/);
      await page.screenshot({path:path.join(out,mode+'-input.png'),fullPage:true});
      await page.getByRole('button',{name:'交换方向',exact:true}).click();assert.equal(await page.getByLabel('来源变量',{exact:true}).inputValue(),'descriptor-b');assert.equal(await page.locator('input[data-source-state]').count(),6);assert.equal(await cell(page,'b-low','a-low').inputValue(),'');
      await cell(page,'b-low','a-low').focus();await cell(page,'b-low','a-low').press('-');assert.equal(await cell(page,'b-low','a-low').evaluate(e=>e.validity.badInput),true);await page.getByRole('button',{name:'按年份准备矩阵',exact:true}).click();assert.equal(await page.locator('.relationships-module').getAttribute('data-tab'),'input');
      await cell(page,'b-low','a-low').fill('-3');await page.getByLabel('判断适用地区',{exact:true}).fill(p.scope.regionId);await page.getByLabel('判断适用年份',{exact:true}).fill('2030');await page.getByLabel('直接性说明',{exact:true}).selectOption('direct');await page.getByRole('button',{name:'保存判断草稿',exact:true}).click();
      const reverseId=(await stored(page)).data.judgments.find(j=>j.sourceDescriptorId==='descriptor-b').id;
      await page.getByRole('button',{name:'按年份准备矩阵',exact:true}).click();await page.getByLabel('矩阵年份',{exact:true}).selectOption('2030');
      assert.match(await page.locator('[data-matrix-coverage]').innerText(),/应判 12；已判 0；未判断 12/);
      await page.getByLabel('选用 示例变量A → 示例变量B',{exact:true}).selectOption('ab-original');await page.getByLabel('选用 示例变量B → 示例变量A',{exact:true}).selectOption(reverseId);
      assert.match(await page.locator('[data-matrix-coverage]').innerText(),/应判 12；已判 3；未判断 9/);
      assert.equal(await matrixCell(page,'a-low','b-low').innerText(),'0 · 没关系');assert.equal(await matrixCell(page,'a-low','b-high').innerText(),'未判断');
      assert.notEqual(await matrixCell(page,'a-low','b-low').evaluate(e=>getComputedStyle(e).backgroundColor),await matrixCell(page,'a-low','b-high').evaluate(e=>getComputedStyle(e).backgroundColor));
      assert.equal(await matrixCell(page,'b-low','a-low').innerText(),'-3');assert.equal(await page.locator('.relationships-na').count(),13);
      const revision=(await stored(page)).revision;
      await page.getByLabel('矩阵年份',{exact:true}).selectOption('2035');assert.match(await page.locator('[data-matrix-coverage]').innerText(),/已判 0/);assert.match(await page.locator('.relationships-diagnostics').innerText(),/所选年不适用/);
      await page.getByLabel('矩阵年份',{exact:true}).selectOption('2030');await page.getByLabel('界面视角',{exact:true}).selectOption('public');assert.equal((await stored(page)).revision,revision);await page.getByLabel('界面视角',{exact:true}).selectOption('expert');await route(page,'relationships');await page.getByRole('button',{name:'按年份准备矩阵',exact:true}).click();
      assert.equal(await page.getByLabel('选用 示例变量A → 示例变量B',{exact:true}).inputValue(),'ab-original');assert.equal((await stored(page)).revision,revision);
      await page.screenshot({path:path.join(out,mode+'-matrix.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,mode+'-mobile.png'),fullPage:true});
      await page.reload();await page.getByRole('button',{name:'按年份准备矩阵',exact:true}).click();assert.match(await page.locator('[data-matrix-coverage]').innerText(),/已判 3/);
      await route(page,'workspace');const downloadEvent=page.waitForEvent('download');await home.downloadBackup(page);const download=await downloadEvent,backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));
      const history=backup.data.evidence.filter(e=>e.kind==='user-assumption').map(e=>JSON.parse(e.excerpt));assert.ok(history.some(e=>e.before?.entries[0].score===-1&&e.after.entries[0].score===0));
      await home.restore(page,backup,'relationships.json');await route(page,'relationships');
      await page.getByRole('button',{name:'关系判断输入',exact:true}).click();await page.getByLabel('来源变量',{exact:true}).selectOption('descriptor-a');await page.getByLabel('编辑判断记录',{exact:true}).selectOption('ab-original');assert.equal(await cell(page,'a-low','b-low').inputValue(),'0');
      assert.deepEqual(errors,[]);assert.deepEqual(external,[]);results.push({mode,passed:true,checks:['2x3 direction independence','0 vs null','invalid input atomic rejection','no-op revision','dirty protection','source history/JSON roundtrip','matrix12/judged3/missing9','year applicability','perspective and refresh selection','390px']});await ctx.close();
    }
    for(const kind of ['empty','no-states','no-scope','conflict','storage-failure','long-name','applicability','ui-storage-corrupt']){
      const p=fixture(false);p.view.module='relationships';
      if(kind==='empty')p.selection.descriptorIds=[];
      if(kind==='no-states'){p.data.descriptors[1].stateIds=[];p.data.states=p.data.states.filter(s=>s.descriptorId!=='descriptor-b');}
      if(kind==='no-scope'){p.scope.regionId=null;p.scope.years=[];}
      if(kind==='conflict'){p.view.objectId='matrix';p.data.judgments.push(record(p,'choice-a',3),record(p,'choice-b',-3));}
      if(kind==='applicability'){p.view.objectId='matrix';const wrong=record(p,'wrong-region',3),unknown=record(p,'unknown-region',2);wrong.scope.regionId='其他地区';unknown.scope.regionId=null;p.data.judgments.push(wrong,unknown);}
      if(kind==='long-name')p.data.descriptors[0].label='长中文描述符名称换行检查'.repeat(8);
      const {ctx,page,errors,external}=await open(source,p,kind==='storage-failure',kind==='ui-storage-corrupt');
      if(kind==='ui-storage-corrupt')assert.equal(await page.locator('input[data-source-state]').count(),4);
      if(kind==='empty')assert.match(await page.locator('.relationships-module').innerText(),/至少需要两个/);
      if(kind==='no-states')assert.match(await page.locator('.relationships-module').innerText(),/缺少状态定义/);
      if(kind==='no-scope'){await page.getByRole('button',{name:'保存判断草稿',exact:true}).click();assert.equal((await stored(page)).data.judgments[0].scope.regionId,null);await page.getByRole('button',{name:'按年份准备矩阵',exact:true}).click();assert.equal(await page.locator('.relationships-matrix').count(),0);assert.match(await page.locator('.relationships-diagnostics').innerText(),/地区未指定/);}
      if(kind==='conflict'){assert.equal(await page.locator('.relationships-module').getAttribute('data-tab'),'matrix');await page.getByLabel('矩阵年份',{exact:true}).selectOption('2030');assert.match(await page.locator('.relationships-diagnostics').innerText(),/多个适用候选/);assert.match(await page.locator('[data-matrix-coverage]').innerText(),/已判 0/);await page.getByLabel('选用 示例变量A → 示例变量B',{exact:true}).selectOption('choice-b');assert.equal(await matrixCell(page,'a-low','b-low').innerText(),'-3');}
      if(kind==='storage-failure'){await cell(page,'a-low','b-low').fill('0');await page.getByRole('button',{name:'保存判断草稿',exact:true}).click();assert.match(await page.locator('.relationships-status').innerText(),/浏览器保存失败/);assert.equal((await stored(page)).data.judgments.length,0);assert.equal(await cell(page,'a-low','b-low').inputValue(),'0');}
      if(kind==='applicability'){await page.getByLabel('矩阵年份',{exact:true}).selectOption('2030');await page.getByLabel('选用 示例变量A → 示例变量B',{exact:true}).selectOption('wrong-region');assert.match(await page.locator('[data-matrix-coverage]').innerText(),/已判 0/);assert.match(await page.locator('.relationships-diagnostics').innerText(),/地区不符/);assert.match(await page.locator('.relationships-diagnostics').innerText(),/范围未知/);}
      if(kind==='long-name'){await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
      await page.screenshot({path:path.join(out,kind+'.png'),fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(external,[]);results.push({mode:kind,passed:true});await ctx.close();
    }
    const life=await browser.newContext(),page=await life.newPage();await page.goto(source);
    const lifecycle=await page.evaluate(async()=>{
      const {mount}=await import('/src/modules/relationships/index.mjs');
      const {createDemoProject}=await import('/src/fixtures/demo.mjs');
      const {createProjectStore}=await import('/src/core/project-store.mjs');
      const {createActions}=await import('/src/core/actions.mjs');
      const p=createDemoProject(),store=createProjectStore(p.id,p),actions=createActions(store);
      let subscriptions=0,writes=0;const handlers=new Set();
      const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);
      window.addEventListener=(type,fn,...rest)=>{if(type==='beforeunload')handlers.add(fn);return add(type,fn,...rest);};
      window.removeEventListener=(type,fn,...rest)=>{if(type==='beforeunload')handlers.delete(fn);return remove(type,fn,...rest);};
      const host=document.createElement('div');document.body.replaceChildren(host);
      const context={store:{read:store.read,snapshot:store.snapshot,isCurrent:store.isCurrent,subscribe(fn){subscriptions++;const off=store.subscribe(fn);return()=>{subscriptions--;off();};}},actions:{replaceProject(p){writes++;return actions.replaceProject(p);}},persistenceState:()=>({ok:true}),navigate(){}};
      for(let i=0;i<3;i++){const mounted=mount(host,context);mounted.dispose();store.setView({perspective:'expert'});}
      const mounted=mount(host,context),input=host.querySelector('input[data-source-state]');input.value='0';input.dispatchEvent(new Event('input'));
      const protectedDraft=!mounted.canLeave();actions.updateScope({regionId:'新地区',years:[2030]});
      [...host.querySelectorAll('button')].find(b=>b.textContent==='保存判断草稿').click();
      const conflict=host.textContent.includes('避免覆盖'),unchanged=store.read().data.judgments.length===0;
      mounted.dispose();window.addEventListener=add;window.removeEventListener=remove;
      return {subscriptions,writes,listeners:handlers.size,roots:host.children.length,protectedDraft,conflict,unchanged};
    });
    assert.deepEqual(lifecycle,{subscriptions:0,writes:0,listeners:0,roots:0,protectedDraft:true,conflict:true,unchanged:true});results.push({mode:'lifecycle-conflict',passed:true,details:lifecycle});await life.close();
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
