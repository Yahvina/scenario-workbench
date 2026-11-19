const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const out=path.resolve('artifacts/drawer-keyboard');fs.mkdirSync(out,{recursive:true});const results=[];
 try{
  const targets=[['offline',pathToFileURL(path.resolve('dist/scenario-workbench.html')).href]];
  if(process.env.APP_URL)targets.push(['source',process.env.APP_URL]);
  for(const [mode,url]of targets)for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url);await page.locator('nav [data-route="elements"]').click();
   const trigger=page.getByRole('button',{name:/查看政策资料/}).first();
   await trigger.evaluate(node=>node.dataset.keyboardTrigger='true');
   await page.evaluate(()=>{const marker=document.createElement('div');marker.id='already-inert';marker.inert=true;document.body.append(marker);document.body.style.overflow='scroll';});
   await trigger.click();
   const inside=()=>page.evaluate(()=>!!document.activeElement.closest('.app-drawer'));
   assert(await inside());
   assert(await page.locator('main').evaluate(node=>!!node.closest('[inert]')));
   await page.keyboard.press('Shift+Tab');assert(await inside(),'reverse Tab must stay in drawer');
   await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'关闭');
   for(let n=0;n<35;n++){await page.keyboard.press('Tab');assert(await inside(),'Tab must stay in drawer');}
   await page.evaluate(()=>document.querySelector('nav button').focus());assert(await inside(),'background cannot take focus');
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('.app-drawer').count(),0);
   assert.equal(await page.evaluate(()=>document.activeElement.dataset.keyboardTrigger),'true');
   assert.equal(await page.locator('main').evaluate(node=>!!node.closest('[inert]')),false);
   assert.equal(await page.locator('#already-inert').evaluate(node=>node.inert),true);
   assert.equal(await page.evaluate(()=>document.body.style.overflow),'scroll');
   await trigger.click();
   for(let n=0;n<3;n++)await page.evaluate(()=>document.querySelector('[data-keyboard-trigger]').click());
   assert.equal(await page.locator('.app-drawer').count(),1);
   await page.screenshot({path:path.join(out,mode+'-'+width+'.png')});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.getByRole('button',{name:'关闭',exact:true}).click();assert.equal(await page.locator('main').evaluate(node=>!!node.closest('[inert]')),false);
   await trigger.click();
   await page.evaluate(()=>document.querySelector('nav button[data-route="relationships"]').click());
   assert.equal(await page.locator('.app-drawer').count(),0);assert.equal(await page.locator('main').evaluate(node=>!!node.closest('[inert]')),false);
   assert.equal(await page.evaluate(()=>document.body.style.overflow),'scroll');assert.deepEqual(errors,[]);
   if(mode==='source'){
    await page.evaluate(async()=>{
     const {openDrawer,el}=await import('/src/core/ui.mjs');
     openDrawer(document.querySelector('nav button'),'表单键盘核验',body=>body.append(
      el('button',{disabled:true},'禁用'),el('button',{hidden:true},'隐藏'),
      el('input',{id:'drawer-input'}),el('button',{id:'drawer-last'},'最后一个操作')));
    });
    await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'drawer-last');
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'关闭');
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'drawer-input');
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'drawer-last');
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'关闭');
    await page.evaluate(()=>{document.querySelectorAll('.app-drawer button,.app-drawer input').forEach(n=>n.disabled=true);document.querySelector('.app-drawer').focus();});
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.className),'app-drawer');
    await page.keyboard.press('Escape');
    await page.evaluate(async()=>{const {openDrawer}=await import('/src/core/ui.mjs');openDrawer(document.querySelector('nav button'),'异常内容',()=>{throw Error('test content failure');});});
    assert.equal(await page.locator('.app-drawer').count(),0);assert.equal(await page.locator('main').evaluate(n=>!!n.closest('[inert]')),false);
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'scroll');
   }
   results.push({mode,width,keyboardLoop:true,backgroundInert:true,previousInertAndScrollRestored:true,reopenAndRouteCleanup:true,pageErrors:errors});
   await page.close();
  }
  fs.writeFileSync(path.join(out,'after.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
