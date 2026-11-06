const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {pathToFileURL}=require('node:url');const path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),entry=process.env.APP_URL||pathToFileURL(process.env.ARTIFACT_URL||path.join(root,'dist/scenario-workbench.html')).href;
 const {createJJJDraftProject}=await import(pathToFileURL(path.join(root,'src/fixtures/jjj-draft.mjs')).href);
 const p=createJJJDraftProject();p.id='atlas-real-ternary';p.scope.years=[2030,2035];p.selection.nodeIds=['jjj-node-d1','jjj-node-d3'];p.selection.descriptorIds=['jjj-d1','jjj-d3'];p.view={perspective:'public',module:'relationships',objectId:null};
 const out=path.join(root,'artifacts/relationship-atlas');await fs.mkdir(out,{recursive:true});
 const b=await chromium.launch({args:['--no-sandbox','--disable-gpu'],executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 const errors=[];const open=async(project,width=1440)=>{const c=await b.newContext({viewport:{width,height:1000}});await c.addInitScript(p=>localStorage.setItem('scenario-workbench.project.v1',JSON.stringify(p)),project);const page=await c.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));await page.goto(entry);return page;};
 const page=await open(p),read=()=>page.evaluate(()=>localStorage.getItem('scenario-workbench.project.v1'));
 assert.equal(await page.locator('[data-atlas-panel]').count(),12);assert.equal(await page.locator('.atlas-mentor-card').count(),8);
 assert.ok((await page.locator('[data-atlas-panel="A"]').boundingBox()).y<1000);
 await page.screenshot({path:path.join(out,'real-three-state-initial.png'),fullPage:true});
 await page.locator('.trend-atlas').screenshot({path:path.join(out,'visible-atlas.png')});
 await page.getByRole('button',{name:'放大查看导师示意：正向增强',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'关闭大图',exact:true}).click();
 const before=await read();await page.getByRole('button',{name:'选择趋势：线性正向',exact:true}).click();assert.equal(await read(),before);assert.equal(await page.locator('[data-atlas-panel="A"]').getAttribute('aria-pressed'),'true');
 const score=page.getByLabel('高速 → 集聚增强',{exact:true});await score.fill('0');
 await page.getByLabel('中速 → 平稳收缩',{exact:true}).fill('-2');
 const incomplete=page.getByLabel('低速 → 加速收缩',{exact:true});await incomplete.press('-');
 await page.getByRole('button',{name:'选择趋势：线性负向',exact:true}).click();assert.equal(await incomplete.evaluate(e=>e.validity.badInput),true);assert.equal(await score.inputValue(),'0');assert.equal(await page.getByLabel('中速 → 平稳收缩',{exact:true}).inputValue(),'-2');await incomplete.fill('');assert.equal(await read(),before);
 await page.getByLabel('判断适用地区',{exact:true}).fill('京津冀');await page.getByLabel('判断适用年份',{exact:true}).fill('2030,2035');await page.getByLabel('判断理由',{exact:true}).fill('图册回归测试的人工假设');
 await page.getByRole('button',{name:'保存这一对的评分',exact:true}).click();
 const saved=JSON.parse(await read()),judgment=saved.data.judgments[0];assert.equal(judgment.entries.filter(e=>e.score===0).length,1);assert.equal(judgment.entries.filter(e=>e.score===-2).length,1);assert.equal(judgment.entries.filter(e=>e.score===null).length,7);assert.equal(saved.data.judgments.length,1);assert.equal(judgment.sourceDescriptorId,'jjj-d1');assert.equal(judgment.curveEncoding,null);
 assert.equal(await page.locator('[data-atlas-panel]').count(),12);
 await page.getByLabel('界面视角',{exact:true}).selectOption('expert');assert.equal(await page.locator('[data-atlas-panel]').count(),12);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,'atlas-390.png'),fullPage:true});
 const {fixture}=require('./solver-browser-fixtures.cjs');
 for(const sizes of [[2,3],[4,3]]){const mixed=fixture({sizes});mixed.id='atlas-'+sizes.join('-');mixed.view.module='relationships';const q=await open(mixed);assert.equal(await q.locator('[data-atlas-panel]').count(),12);assert.equal(await q.locator('input[data-source-state]').count(),sizes[0]*sizes[1]);}
 const binary=fixture();binary.id='atlas-existing-binary';binary.view.module='relationships';const q=await open(binary);
 assert.equal(await q.locator('.shape-card').count(),12);assert.equal(await q.locator('.atlas-mentor-card').count(),8);
 await q.getByText('查看或修改已有判断',{exact:true}).click();await q.getByLabel('编辑判断记录',{exact:true}).selectOption('A->B');assert.equal(await q.locator('[data-atlas-panel]').count(),12);
 await q.getByRole('button',{name:'选择趋势：线性正向',exact:true}).click();await q.getByRole('button',{name:'按所选图形新建评分预览',exact:true}).click();assert.equal(await q.locator('[data-template-id="A(1)"]').getAttribute('aria-pressed'),'true');assert.equal(await q.locator('[data-template-id="L(1,3)"]').isDisabled(),true);
 const empty=fixture();empty.id='atlas-empty';empty.view.module='relationships';empty.selection.descriptorIds=[];const e=await open(empty);assert.equal(await e.locator('[data-atlas-panel]').count(),12);
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'results.json'),JSON.stringify({entry,errors,checks:['real 3x3 initial twelve shapes and eight mentor references','first row inside viewport','selection changes no project data','manual scores and unfinished number survive shape switching','zero/null and direction preserved on actual save','both perspectives','390px width','2x3 and 4x3','existing binary record keeps atlas','binary preselect and disabled template preserved','unselected factors can browse']},null,2));console.log('Relationship atlas passed');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
