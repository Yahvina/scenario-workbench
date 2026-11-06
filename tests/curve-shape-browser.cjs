// H2 acceptance: the relationships page must show shapes before codes, keep the
// mentor prototype strictly read-only, and keep every existing encoding gate.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/relationship-shape-picker');await fs.mkdir(out,{recursive:true});
const {createDemoProject}=await import(pathToFileURL(path.join(root,'src/fixtures/demo.mjs')).href);
const browser=await chromium.launch({args:['--no-sandbox','--disable-gpu'],executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results={};
try{
for(const [mode,url] of [['source',process.env.APP_URL||'http://127.0.0.1:4178'],['offline',pathToFileURL(path.join(root,'dist/scenario-workbench.html')).href]]){
  const ctx=await browser.newContext({viewport:{width:1440,height:1080}});
  const p=createDemoProject();p.view.perspective='public';p.view.module='relationships';
  await ctx.addInitScript(project=>{if(!localStorage.getItem('scenario-workbench.project.v1'))localStorage.setItem('scenario-workbench.project.v1',JSON.stringify(project));},p);
  const page=await ctx.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:'))external.push(r.url());});
  await page.goto(url);
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('scenario-workbench.project.v1')));
  const r={};
  await page.getByRole('button',{name:'受限二档图形编码',exact:true}).click();
  const panel=page.locator('.curve-panel');await panel.waitFor();

  // 1. thumbnails come first, one card per reviewed paper figure, and they sit
  //    above the numeric code select in document order.
  assert.equal(await page.locator('.curve-panel .shape-card').count(),12);
  assert.equal(await page.locator('.curve-panel .shape-card svg').count(),12);
  const order=await page.evaluate(()=>{const grid=document.querySelector('.curve-panel .shape-grid'),sel=document.querySelector('.curve-panel select[aria-label="编码模板"]');
    return grid&&sel?grid.compareDocumentPosition(sel)&Node.DOCUMENT_POSITION_FOLLOWING?'grid-first':'select-first':'missing';});
  assert.equal(order,'grid-first');
  r.thumbnailsFirst=true;
  assert.equal(await page.locator('.curve-panel .shape-line').count(),24);
  await page.screenshot({path:path.join(out,mode+'-shapes-public.png'),fullPage:true});

  // 2. the axis note and the sketch boundary are stated next to the figures.
  assert.match(await panel.innerText(),/横轴为源因素水平，纵轴为目标因素水平/);
  assert.match(await panel.innerText(),/不是数值拟合/);
  r.axisNote=true;

  // 3. L(1,3) stays disabled and clicking it cannot change the selection.
  const disabled=page.locator('.curve-panel [data-template-id="L(1,3)"]');
  assert.equal(await disabled.isDisabled(),true);
  assert.equal(await page.locator('option[value="L(1,3)"]').evaluate(e=>e.disabled),true);
  await disabled.click({force:true}).catch(()=>{});
  assert.equal(await page.locator('.curve-panel .shape-state').innerText(),'尚未选择线型：请点选上方任一缩略图。');
  assert.equal(await page.getByLabel('编码模板',{exact:true}).inputValue(),'');
  r.l13Disabled=true;

  // 4. keyboard selection works and the shape detail states direction, line
  //    types and the two axes.
  await page.locator('.curve-panel [data-template-id="A(1)"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.curve-panel [data-template-id="A(1)"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByLabel('编码模板',{exact:true}).inputValue(),'A(1)');
  const detail=page.locator('.curve-panel .shape-state');
  assert.match(await detail.innerText(),/线性正向/);
  assert.match(await detail.innerText(),/方向：示例变量A → 示例变量B/);
  assert.match(await detail.innerText(),/线型 1（较弱）/);
  r.keyboardSelect=true;
  await page.locator('.curve-panel [data-template-id="A(1)"]').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.getByLabel('编码模板',{exact:true}).inputValue(),'A(1)');

  // 5. the mentor prototype is a separate, collapsed, non-interactive section:
  //    it now carries its own qualitative sketches, but still no control of any
  //    kind, and opening or clicking it cannot change the selection or project.
  const mentor=page.locator('[data-mentor-reference]');
  const mentorTop=await mentor.evaluate(node=>Array.from(document.querySelectorAll('.curve-panel > *')).indexOf(node));
  const saveTop=await page.getByRole('button',{name:'保存已确认编码草案',exact:true}).evaluate(node=>{
    let n=node;while(n&&n.parentElement!==document.querySelector('.curve-panel'))n=n.parentElement;
    return Array.from(document.querySelectorAll('.curve-panel > *')).indexOf(n);
  });
  assert.ok(mentorTop>saveTop,'mentor reference should sit after the encoding flow, got '+mentorTop+' vs '+saveTop);
  assert.equal(await mentor.count(),1);
  assert.equal(await page.locator('[data-mentor-shape]').count(),8);
  assert.equal(await page.locator('[data-mentor-reference] button').count(),0);
  assert.equal(await page.locator('[data-mentor-reference] input').count(),0);
  assert.equal(await page.locator('[data-mentor-reference] select').count(),0);
  // Eight qualitative sketches now exist, each dashed and explicitly labelled as
  // a prototype sketch; they are still not the paper thumbnails and carry no
  // control, so the reference block stays read-only.
  assert.equal(await page.locator('[data-mentor-reference] svg').count(),8);
  assert.equal(await page.locator('[data-mentor-reference] .mentor-sketch').count(),8);
  assert.equal(await page.locator('[data-mentor-reference] input, [data-mentor-reference] a').count(),0);
  const dashed=await page.locator('[data-mentor-reference] path').evaluateAll(paths=>paths.map(p=>p.getAttribute('stroke-dasharray')));
  assert.equal(dashed.length,8);
  for(const value of dashed)assert.equal(value,'6 4');
  // The reference block is collapsed by default, so it cannot interrupt the path
  // from paper thumbnail to state binding and four-cell preview.
  assert.equal(await page.locator('.curve-panel [data-mentor-reference]').evaluate(node=>node.tagName),'DETAILS');
  assert.equal(await page.locator('[data-mentor-reference]').evaluate(node=>node.open),false);
  assert.equal(await page.locator('[data-mentor-reference] .mentor-badge').count(),8);
  r.mentorSketches=true;
  await mentor.locator('> summary').click();
  assert.match(await mentor.innerText(),/待核 · 仅供参考/);
  assert.match(await mentor.innerText(),/原型示意，仅供参考/);
  assert.match(await mentor.innerText(),/不是可计算模板/);
  // Provenance is closed by the byte-identical PPTX member, and the recovered
  // parentheticals are recorded as text rather than redrawn from guessed pixels.
  assert.match(await mentor.innerText(),/逐字节相同/);
  assert.match(await mentor.innerText(),/demo-165541\.mp4/);
  const labels=['正向增强','负向抑制','阈值效应','饱和效应','U型关系','倒U型关系','非线性增强','非线性抑制'];
  const parentheticals=['单调上升','单调下降','存在拐点','边际递减','先降后升','先升后降','加速上升','加速下降'];
  const mentorText=await mentor.innerText();
  for(const text of labels)assert.ok(mentorText.includes(text),'mentor label missing: '+text);
  for(const text of parentheticals)assert.ok(mentorText.includes(text),'mentor parenthetical missing: '+text);
  assert.match(await mentor.innerText(),/精确坐标未目视复核/);
  await page.locator('.curve-panel .mentor-boundaries summary').click();
  assert.match(await mentor.innerText(),/不参与编码、不生成四格分数、不改变当前选型/);
  assert.match(await mentor.innerText(),/不是已经实现功能的可运行软件/);
  assert.match(await mentor.innerText(),/三个数字互不相同/);
  await page.screenshot({path:path.join(out,mode+'-mentor-reference.png'),fullPage:true});
  const beforeMentor=JSON.stringify(await stored());
  await page.locator('[data-mentor-shape]').nth(3).click();
  await page.locator('[data-mentor-shape]').nth(6).click();
  assert.equal(await page.getByLabel('编码模板',{exact:true}).inputValue(),'A(1)');
  assert.equal(JSON.stringify(await stored()),beforeMentor);
  r.mentorReadOnly=true;

  // 6. switching the template revokes the previous confirmation, and A(2) keeps
  //    its readable warning through the preview.
  await page.getByLabel('源变量高状态',{exact:true}).selectOption('a-high');
  await page.getByLabel('目标变量高状态',{exact:true}).selectOption('b-high');
  await page.getByLabel('我明确判断这是直接影响',{exact:true}).check();
  await page.getByLabel('我确认双方全部二档均为有序高低，剩余状态为低',{exact:true}).check();
  await page.getByLabel('编码适用地区',{exact:true}).fill(p.scope.regionId);
  await page.getByLabel('编码适用年份',{exact:true}).fill('2030');
  await page.getByLabel('编码关系理由',{exact:true}).fill('H2 图形选型验收');
  await page.locator('.curve-panel [data-template-id="A(2)"]').click();
  assert.equal(await page.getByLabel('编码模板',{exact:true}).inputValue(),'A(2)');
  await page.getByRole('button',{name:'更新编码预览',exact:true}).click();
  assert.match(await panel.innerText(),/weakly/);
  assert.match(await panel.innerText(),/A\(2\)原图高源文字weakly/);
  const confirmBox=page.getByLabel('明确确认当前绑定、完整分数及全部警告',{exact:true});
  await confirmBox.check();
  assert.equal(await confirmBox.isChecked(),true);
  await page.locator('.curve-panel [data-template-id="B(1)"]').click();
  assert.equal(await confirmBox.isChecked(),false);
  assert.match(await page.locator('.curve-panel [role=status]').first().innerText(),/内容已变化，请更新预览并重新明确确认/);
  assert.match(await page.locator('.curve-panel .shape-state').innerText(),/线性负向/);
  r.templateSwitchRevokes=true;

  // 7. the same panel still produces an adoptable 2x2 judgment and the matrix can
  //    use it, with the confirmation invalidated by the earlier switch.
  await page.getByRole('button',{name:'更新编码预览',exact:true}).click();
  await confirmBox.check();
  await page.getByRole('button',{name:'保存已确认编码草案',exact:true}).click();
  const saved=await stored();
  assert.equal(saved.data.judgments.length,1);
  const j=saved.data.judgments[0];
  assert.equal(j.curveEncoding.templateId,'B(1)');
  assert.equal(j.curveEncoding.humanConfirmation.confirmed,true);
  // The stored cell must equal the reviewed paper matrix, not a hand-written guess.
  const {curveData}=await import(pathToFileURL(path.join(root,'src/modules/relationships/curve-data.mjs')).href);
  const expectedCell=curveData.templates.find(t=>t.id==='B(1)').matrix[0][0];
  assert.equal(j.curveEncoding.generatedEntries.find(e=>e.sourceStateId==='a-high'&&e.targetStateId==='b-high').score,expectedCell);
  await page.locator('nav [data-route=relationships]').first().click();
  await page.getByRole('button',{name:'按年份准备矩阵',exact:true}).click();
  await page.getByLabel('矩阵年份',{exact:true}).selectOption('2030');
  await page.getByLabel('选用 示例变量A → 示例变量B',{exact:true}).selectOption(j.id);
  assert.match(await page.locator('[data-matrix-coverage]').innerText(),/已判 4/);
  r.judgmentAdoptable=true;

  // 8. expert view keeps the shape-first flow and adds collapsible provenance.
  //    The public pass above deliberately ran in the ordinary perspective, so the
  //    expert block must not exist until the perspective is actually switched.
  await page.locator('nav [data-route=relationships]').first().click();
  await page.getByRole('button',{name:'受限二档图形编码',exact:true}).click();
  assert.equal(await page.locator('.curve-panel .shape-expert').count(),0);
  await page.evaluate(()=>{const k='scenario-workbench.project.v1';const p=JSON.parse(localStorage.getItem(k));p.view.perspective='expert';p.view.module='relationships';localStorage.setItem(k,JSON.stringify(p));});
  await page.reload();
  await page.getByRole('button',{name:'受限二档图形编码',exact:true}).click();
  await page.locator('.curve-panel [data-template-id="K(1,3)"]').click();
  const expertSummary=page.locator('.curve-panel .shape-expert summary');
  assert.equal(await expertSummary.isVisible(),true);
  assert.match(await page.locator('.curve-panel .shape-state').innerText(),/K形|U形/);
  assert.match(await page.locator('.curve-panel .shape-state').innerText(),/低源段用1，高源段用3/);
  await expertSummary.click();
  assert.match(await panel.innerText(),/Stankov et al. MethodsX 8 \(2021\) 101492/);
  assert.match(await panel.innerText(),/Table 1 第 17 行/);
  assert.match(await panel.innerText(),/identity-no-rescale/);
  r.expertProvenance=true;
  await page.screenshot({path:path.join(out,mode+'-shapes-expert.png'),fullPage:true});

  // 9. 390px must not scroll sideways with the shape grid and the reference shown,
  //    and the collapsed reference must still render all eight sketches there.
  await page.setViewportSize({width:390,height:844});
  await page.reload();
  await page.getByRole('button',{name:'受限二档图形编码',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('[data-mentor-reference] > summary').click();
  assert.equal(await page.locator('[data-mentor-reference] svg').count(),8);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(out,mode+'-shapes-390.png'),fullPage:true});
  r.narrowOk=true;

  // 10. a non-two-tier variable must state the gap and offer the direct-score path
  //     instead of letting the picker stand in for it.
  const three=createDemoProject();three.view.module='relationships';
  three.data.states.push({version:1,provenance:{origin:'fixture',sourceId:'fixture-six-level',locator:'tests/curve-shape-browser.cjs'},id:'a-mid',descriptorId:'descriptor-a',label:'示例中档',range:null,unit:null,validYears:[2026,2030,2035],scope:{regionId:three.scope.regionId},evidenceRefs:['fixture-source']});
  three.data.descriptors.find(d=>d.id==='descriptor-a').stateIds=['a-low','a-mid','a-high'];
  const ctx2=await browser.newContext();
  await ctx2.addInitScript(project=>localStorage.setItem('scenario-workbench.project.v1',JSON.stringify(project)),three);
  const page2=await ctx2.newPage();const errors2=[];page2.on('pageerror',e=>errors2.push(e.message));
  await page2.goto(url);
  await page2.getByRole('button',{name:'受限二档图形编码',exact:true}).click();
  const fallback=await page2.locator('.curve-panel').innerText();
  assert.match(fallback,/严格二档/);
  assert.match(fallback,/请继续J1完整状态对直接评分/);
  assert.equal(await page2.getByRole('button',{name:'返回直接评分',exact:true}).isVisible(),true);
  assert.equal(await page2.getByRole('button',{name:'更新编码预览',exact:true}).count(),0);
  await page2.getByRole('button',{name:'返回直接评分',exact:true}).click();
  assert.equal(await page2.locator('.curve-panel').count(),0);
  assert.deepEqual(errors2,[]);
  r.nonBinaryDirectPath=true;
  await ctx2.close();

  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  results[mode]=r;
  await ctx.close();
}
await fs.writeFile(path.join(out,'curve-shape-browser.json'),JSON.stringify(results,null,2));
console.log('shapes first, keyboard selection, mentor reference read-only, template switch revokes confirmation, L(1,3) disabled, A(2) warning, non-binary direct path and 390px passed');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
