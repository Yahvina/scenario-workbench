const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const home = require('./home-controls.cjs');
const key = 'scenario-workbench.project.v1';
(async () => {
  const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts', 'timeline');
  await fs.mkdir(out, { recursive: true });
  const { createDemoProject } = await import(pathToFileURL(path.join(root,'src/fixtures/demo.mjs')).href);
  const browser = await chromium.launch({args:['--no-sandbox','--disable-gpu'], executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const results = [];
  async function open(url, fixture, failure = false) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true });
    await ctx.addInitScript(({fixture,key,failure}) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify(fixture));
      if (failure) Storage.prototype.setItem = function() { throw new Error('simulated quota'); };
    },{ fixture, key, failure });
    const page = await ctx.newPage(), errors = [], external = [];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{ if (/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:')) external.push(r.url()); });
    await page.goto(url);
    return { ctx, page, errors, external };
  }
  const stored = page => page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  const route = (page, id) => page.locator('nav [data-route="'+id+'"]').first().click();
  try {
    for (const [mode,url] of [['source',process.env.APP_URL || 'http://127.0.0.1:4175'],['offline',pathToFileURL(path.join(root,'dist/scenario-workbench.html')).href]]) {
      const fixture=createDemoProject(); fixture.data.paths[0].points[0].origin='source';
      const {ctx,page,errors,external}=await open(url,fixture);
      await home.snapshot(page);
      await route(page,'timeline');
      assert.equal(await page.locator('.timeline-variable').count(),2);
      assert.equal(await page.locator('circle[data-point-index]').count(),2);
      assert.equal(await page.locator('.timeline-derived').count(),0);
      await page.getByLabel('插值方式',{exact:true}).selectOption('step');
      assert.match(await page.locator('.timeline-preview').innerText(),/2030：20/);
      await page.getByLabel('插值方式',{exact:true}).selectOption('none');
      assert.equal(await page.locator('.timeline-derived').count(),0);
      assert.match(await page.locator('.timeline-preview').innerText(),/2030：未定义/);
      await page.getByLabel('插值方式',{exact:true}).selectOption('linear');
      assert.match(await page.locator('.timeline-preview').innerText(),/2030：42.2222/);
      await page.getByRole('button',{name:'保存路径',exact:true}).click();
      assert.match(await page.locator('#snapshot-details').innerText(),/已过期/);
      const rev=(await stored(page)).revision;
      await page.getByLabel('节点1数值',{exact:true}).fill('30');
      await page.getByLabel('节点1数值',{exact:true}).press('Tab');
      assert.equal((await stored(page)).revision,rev);
      await page.getByRole('combobox',{name:'界面视角',exact:true}).selectOption('expert');
      assert.equal(await page.getByRole('combobox',{name:'界面视角',exact:true}).inputValue(),'public');
      assert.match(await page.locator('.timeline-message').innerText(),/未保存/);
      await page.locator('[data-descriptor="descriptor-b"]').click();
      assert.equal(await page.locator('[data-descriptor="descriptor-a"]').getAttribute('aria-pressed'),'true');
      await route(page,'elements'); assert.equal(await page.locator('.timeline-module').count(),1);
      await page.getByRole('button',{name:'保存路径',exact:true}).click();
      const precise=await stored(page);
      assert.equal(precise.data.paths[0].points[0].value,30); assert.equal(precise.data.paths[0].points[0].origin,'user-assumption'); assert.equal(precise.data.paths[0].points[0].stateId,null);
      assert.equal(precise.revision,rev+1);
      const first = page.locator('circle[data-point-index="0"]');
      await page.mouse.move(0,0);
      const objectColor=await page.locator('[data-descriptor="descriptor-a"] .variable-mark').evaluate(e=>getComputedStyle(e).backgroundColor);
      assert.equal(await first.evaluate(e=>getComputedStyle(e).stroke),objectColor);
      assert.equal(await page.locator('.topbar').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
      assert.equal(await page.getByRole('button',{name:'保存路径',exact:true}).evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
      const chartBox=await page.locator('.timeline-chart').boundingBox();
      const box=await first.boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2-30,{steps:6});
      assert.equal((await stored(page)).revision,precise.revision);
      const draftValue=Number(await page.getByLabel('节点1数值',{exact:true}).inputValue());
      const expectedDrag=30 + 30/chartBox.height*300/218*52;
      assert.ok(Math.abs(draftValue-expectedDrag)<1e-3, 'drag numeric scale: expected ' + expectedDrag + ', actual ' + draftValue + ', height ' + chartBox.height);
      await page.mouse.up();
      await page.getByRole('button',{name:'保存路径',exact:true}).click();
      const dragged=await stored(page); assert.equal(dragged.revision,precise.revision+1); assert.equal(dragged.data.paths[0].points[0].value,draftValue);
      assert.equal(await page.getByLabel('节点1数值',{exact:true}).inputValue(),String(draftValue));
      // Pointer cancel restores the previous draft point without a scientific write.
      const cancelBox=await first.boundingBox();
      await page.mouse.move(cancelBox.x+cancelBox.width/2,cancelBox.y+cancelBox.height/2); await page.mouse.down(); await page.mouse.move(cancelBox.x+cancelBox.width/2,cancelBox.y-15);
      await page.locator('.timeline-chart').dispatchEvent('pointercancel',{pointerId:1}); await page.mouse.up();
      assert.equal(await page.getByLabel('节点1数值',{exact:true}).inputValue(),String(draftValue)); assert.equal((await stored(page)).revision,dragged.revision);
      const escapeBox=await first.boundingBox();
      await page.mouse.move(escapeBox.x+escapeBox.width/2,escapeBox.y+escapeBox.height/2); await page.mouse.down(); await page.mouse.move(escapeBox.x+escapeBox.width/2,escapeBox.y-10);
      await page.keyboard.press('Escape'); await page.mouse.up();
      assert.equal(await page.getByLabel('节点1数值',{exact:true}).inputValue(),String(draftValue));
      await page.getByLabel('节点1年份',{exact:true}).fill('2035'); await page.getByRole('button',{name:'保存路径',exact:true}).click();
      assert.match(await page.locator('.timeline-message').innerText(),/年份重复/); assert.equal((await stored(page)).revision,dragged.revision);
      await page.getByRole('button',{name:'取消修改',exact:true}).click();
      await page.getByLabel('节点1数值',{exact:true}).fill(''); await page.getByRole('button',{name:'保存路径',exact:true}).click();
      assert.equal((await stored(page)).data.paths[0].points[0].value,null);
      assert.equal(await page.locator('circle[data-point-index]').count(),1); assert.equal(await page.locator('.timeline-derived').count(),0);
      await page.getByLabel('节点1数值',{exact:true}).fill(String(draftValue)); await page.getByRole('button',{name:'保存路径',exact:true}).click();
      const beforeView=await stored(page);
      await page.getByRole('combobox',{name:'界面视角',exact:true}).selectOption('expert');
      assert.equal((await stored(page)).revision,beforeView.revision);
      await page.getByText('路径来源与修改记录',{exact:true}).click();
      assert.match(await page.locator('.timeline-sources').innerText(),/2026=20/);
      assert.match(await page.locator('.timeline-sources').innerText(),/fixture-source/);
      await page.screenshot({path:path.join(out,mode+'-desktop.png'),fullPage:true});
      await page.setViewportSize({width:390,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:path.join(out,mode+'-mobile.png'),fullPage:true});
      await page.reload(); assert.equal((await stored(page)).data.paths[0].points[0].value,draftValue);
      // Export and restore the real backup through the existing workspace controls.
      await route(page,'workspace');
      const downloadEvent=page.waitForEvent('download'); await home.downloadBackup(page);
      const download=await downloadEvent, backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));
      assert.ok(backup.data.evidence.some(e=>e.kind==='user-assumption' && JSON.parse(e.excerpt).before?.points[0].value===20));
      await home.restore(page,backup,'timeline.json');
      await route(page,'timeline'); assert.equal(await page.getByLabel('节点1数值',{exact:true}).inputValue(),String(draftValue));
      await page.locator('[data-descriptor="descriptor-b"]').click(); assert.match(await page.locator('.timeline-editor').innerText(),/暂无路径/);
      await page.getByRole('button',{name:'新建用户假设路径',exact:true}).click();
      assert.match(await page.locator('.timeline-chart').textContent(),/暂无数值节点/);
      await page.getByLabel('节点1数值',{exact:true}).fill('0'); await page.getByRole('button',{name:'保存路径',exact:true}).click();
      assert.equal((await stored(page)).data.paths.length,2);
      await page.getByRole('button',{name:'添加节点',exact:true}).click();
      await page.getByLabel('节点4年份',{exact:true}).fill('2038'); await page.getByLabel('节点4数值',{exact:true}).fill('10');
      await page.getByRole('button',{name:'保存路径',exact:true}).click();
      assert.deepEqual((await stored(page)).data.paths[1].points.map(p=>p.year),[2026,2030,2035,2038]);
      assert.match(await page.locator('.timeline-editor').innerText(),/范围外/);
      await page.getByRole('button',{name:'删除节点4',exact:true}).click(); await page.getByRole('button',{name:'保存路径',exact:true}).click();
      assert.equal((await stored(page)).data.paths[1].points.length,3);
      await route(page,'elements'); await page.getByRole('button',{name:'移除分类 示例实施方式',exact:true}).click();
      await route(page,'timeline'); assert.equal(await page.locator('.timeline-variable').count(),1); assert.equal((await stored(page)).data.paths.length,2);
      assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
      results.push({mode,passed:true,checks:['precise keyboard input','real pointer drag and cancel','one save one revision','null','duplicate rejected','dirty navigation/view guard','backup restore provenance','narrow screen','active selection/history']});
      await ctx.close();
    }
    const source=process.env.APP_URL || 'http://127.0.0.1:4175';
    for (const kind of ['empty','no-years','single-null','multiple','storage-failure','out-of-range-long-name']) {
      const p=createDemoProject(); p.view.module='timeline';
      if(kind==='empty') { p.selection={nodeIds:['node-1'],descriptorIds:[],stateIds:[],lockedStateIds:[]}; }
      if(kind==='no-years') p.scope.years=[];
      if(kind==='single-null') { p.scope.years=[2030]; p.data.paths[0].points=[{year:2030,value:null,stateId:null,origin:'source',evidenceRefs:['fixture-source']}]; }
      if(kind==='multiple') { const copy=structuredClone(p.data.paths[0]); copy.id='path-second'; p.data.paths.push(copy); }
      if(kind==='out-of-range-long-name') { p.scope.years=[2030]; p.data.descriptors[0].label='长中文变量名称换行'.repeat(12); p.data.paths[0].scope.regionId='其他地区'; }
      const {ctx,page,errors}=await open(source,p,kind==='storage-failure');
      if(kind==='empty') assert.match(await page.locator('.timeline-editor').innerText(),/尚无计算变量映射/);
      if(kind==='no-years') { assert.match(await page.locator('.timeline-editor').innerText(),/尚未指定研究年份/); assert.equal(await page.locator('.timeline-chart').count(),0); }
      if(kind==='single-null') { assert.match(await page.locator('.timeline-chart').textContent(),/暂无数值/); await page.getByLabel('节点1数值',{exact:true}).fill('5'); await page.getByRole('button',{name:'保存路径',exact:true}).click(); assert.equal((await stored(page)).data.paths[0].points[0].value,5); }
      if(kind==='multiple') { assert.equal(await page.getByLabel('路径选择',{exact:true}).inputValue(),''); assert.equal(await page.locator('.timeline-chart').count(),0); await page.getByLabel('路径选择',{exact:true}).selectOption('path-second'); assert.equal(await page.locator('.timeline-chart').count(),1); }
      if(kind==='storage-failure') { await page.getByLabel('节点1数值',{exact:true}).fill('99'); await page.getByRole('button',{name:'保存路径',exact:true}).click(); assert.match(await page.locator('.timeline-message').innerText(),/浏览器保存失败/); assert.equal(await page.getByLabel('节点1数值',{exact:true}).inputValue(),'99'); assert.equal((await stored(page)).data.paths[0].points[0].value,20); }
      if(kind==='out-of-range-long-name') {
        assert.match(await page.locator('.timeline-editor').innerText(),/范围外/); assert.match(await page.locator('.timeline-editor').innerText(),/地区与项目范围不同/);
        assert.match(await page.locator('.timeline-chart').textContent(),/2026/); assert.match(await page.locator('.timeline-chart').textContent(),/2035/);
        await page.setViewportSize({width:390,height:844}); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      }
      await page.screenshot({path:path.join(out,kind+'.png'),fullPage:true}); assert.deepEqual(errors,[]); results.push({mode:kind,passed:true}); await ctx.close();
    }
    const lifecycleContext = await browser.newContext(), lifecyclePage = await lifecycleContext.newPage();
    await lifecyclePage.goto(source);
    const lifecycle = await lifecyclePage.evaluate(async () => {
      const {mount}=await import('/src/modules/timeline/index.mjs');
      const {createDemoProject}=await import('/src/fixtures/demo.mjs');
      const {createProjectStore}=await import('/src/core/project-store.mjs');
      const {createActions}=await import('/src/core/actions.mjs');
      const store=createProjectStore('fixture-six-level',createDemoProject()), actions=createActions(store);
      let subscriptions=0, writes=0; const handlers=new Set();
      const add=window.addEventListener.bind(window), remove=window.removeEventListener.bind(window);
      window.addEventListener=(type,fn,...args)=>{ if(type==='beforeunload') handlers.add(fn); return add(type,fn,...args); };
      window.removeEventListener=(type,fn,...args)=>{ if(type==='beforeunload') handlers.delete(fn); return remove(type,fn,...args); };
      const host=document.createElement('div'); document.body.replaceChildren(host);
      const context={store:{read:store.read,snapshot:store.snapshot,isCurrent:store.isCurrent,subscribe(fn){subscriptions++; const off=store.subscribe(fn);return()=>{subscriptions--;off();};}},actions:{replaceProject(p){writes++;return actions.replaceProject(p);}},persistenceState:()=>({ok:true}),navigate(){}};
      for(let i=0;i<3;i++) { const mounted=mount(host,context); mounted.dispose(); store.setView({perspective:'expert'}); }
      const mounted=mount(host,context);
      const input=host.querySelector('[data-value-index="0"]'); input.value='88'; input.dispatchEvent(new Event('input'));
      const blocked=!mounted.canLeave();
      actions.updateScope({regionId:null,years:[2030]});
      [...host.querySelectorAll('button')].find(b=>b.textContent==='保存路径').click();
      const conflict=host.textContent.includes('避免覆盖');
      const originalUnchanged=store.read().data.paths[0].points[0].value===20;
      mounted.dispose();
      window.addEventListener=add; window.removeEventListener=remove;
      return {subscriptions,writes,handlers:handlers.size,roots:host.children.length,blocked,conflict,originalUnchanged};
    });
    assert.deepEqual(lifecycle,{subscriptions:0,writes:0,handlers:0,roots:0,blocked:true,conflict:true,originalUnchanged:true});
    results.push({mode:'lifecycle-conflict',passed:true,details:lifecycle}); await lifecycleContext.close();
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2)); console.log(JSON.stringify(results,null,2));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
