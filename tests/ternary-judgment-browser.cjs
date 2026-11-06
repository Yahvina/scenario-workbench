// H3 acceptance: the optional row-by-row guide on a three-state × three-state
// direction. It must share one unsaved draft with the direct table, keep 0 and
// blank apart, draw nothing from a picture, and never invent the reverse.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),home=require('./home-controls.cjs');
const key='scenario-workbench.project.v1';
// 示例评分只用于验收夹具：与 docs/proposals/ternary-relationship-scoring.md 的手算例一致。
const HAND=[2,1,-2,-1,2,1,-2,1,2];
(async()=>{
  const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','ternary-judgment-guide');await fs.mkdir(out,{recursive:true});
  const {createDemoProject}=await import(pathToFileURL(path.join(root,'src/fixtures/demo.mjs')).href);

  // 三档对三档：A 与 B 各补一个中档；名义状态只用于入口范围检查，不参与主线。
  function fixture({nominal=false,order=null}={}){
    const p=createDemoProject();
    const mid=structuredClone(p.data.states.find(s=>s.id==='a-low'));mid.id='a-mid';mid.label='示例中档A';p.data.states.push(mid);p.data.descriptors[0].stateIds.splice(1,0,mid.id);
    const bmid=structuredClone(p.data.states.find(s=>s.id==='b-high'));bmid.id='b-mid';bmid.label='示例中档';p.data.states.push(bmid);p.data.descriptors[1].stateIds.splice(1,0,bmid.id);
    // 定义顺序被打乱时，界面必须原样照做，不得自行排成低→中→高。
    if(order)p.data.descriptors[0].stateIds=order;
    if(nominal){
      // 名义状态：只有名称不同，没有低/中/高含义，用户也没有确认顺序。
      for(const [descriptorId,labels] of [['descriptor-a',['红','蓝','绿']],['descriptor-b',['甲','乙','丙']]]) {
        const d=p.data.descriptors.find(item=>item.id===descriptorId);
        d.stateIds.forEach((id,index)=>{p.data.states.find(s=>s.id===id).label=labels[index];});
      }
    }
    return p;
  }
  const browser=await chromium.launch({args:['--no-sandbox','--disable-gpu'],executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const source=process.env.APP_URL||'http://127.0.0.1:4179',results=[];
  async function open(url,p,fail=false){
    const ctx=await browser.newContext({viewport:{width:1440,height:1080},acceptDownloads:true});
    await ctx.addInitScript(({p,key,fail})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(p));if(fail)Storage.prototype.setItem=function(){throw new Error('simulated quota');};},{p,key,fail});
    const page=await ctx.newPage();page.setDefaultTimeout(8000);const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:'))external.push(r.url());});await page.goto(url);return {ctx,page,errors,external};
  }
  const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  const route=(page,id)=>page.locator('nav [data-route="'+id+'"]').first().click();
  const row=(page,a,b)=>page.locator('input[data-row-source="'+a+'"][data-row-target="'+b+'"]');
  const preview=(page,a,b)=>page.locator('td[data-row-preview-source="'+a+'"][data-row-preview-target="'+b+'"]');
  const cell=(page,a,b)=>page.locator('input[data-source-state="'+a+'"][data-target-state="'+b+'"]');
  const guide=page=>page.getByRole('button',{name:'逐行判断',exact:true});
  const table=page=>page.getByRole('button',{name:'直接填表',exact:true});
  // 视角切换会按路由重新挂载，显示方式回到默认的直接填表；需要时再点回逐行。
  async function ensureGuide(page){if(await page.locator('[data-guide-view="guide"][aria-pressed="false"]').count())await guide(page).click();}
  const pairs=[['a-low','b-low'],['a-low','b-mid'],['a-low','b-high'],['a-mid','b-low'],['a-mid','b-mid'],['a-mid','b-high'],['a-high','b-low'],['a-high','b-mid'],['a-high','b-high']];

  try{
    for(const [mode,url] of [['source',source],['offline',pathToFileURL(path.join(root,'dist/scenario-workbench.html')).href]]){
      const p=fixture();p.view.perspective='expert';const {ctx,page,errors,external}=await open(url,p);
      await home.snapshot(page);await route(page,'relationships');
      const r={mode,passed:true,checks:[]};

      // 1) 入口只在三档对三档出现，且是可选的显示方式
      assert.equal(await guide(page).count(),1);assert.equal(await table(page).count(),1);
      assert.equal(await page.getByRole('group',{name:'三档判断显示方式'}).count(),1);
      assert.equal(await page.locator('[data-guide-view="table"]').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('input[data-source-state]').count(),9);
      // 未选图形也能继续：默认没有草图，也不需要选图
      assert.equal(await page.locator('[data-row-guide-sketch]').count(),0);
      r.checks.push('guide only for 3x3');

      // 2) 按实际状态名逐行提问，顺序与定义一致，不猜低/中/高
      await guide(page).click();
      assert.equal(await page.locator('article[data-row-source]').count(),3);
      const asked=await page.locator('article[data-row-source] > .row-question').allInnerTexts();
      assert.deepEqual(asked,[
        '当源处于「示例低档」时，它如何直接影响目标处于「示例低档」「示例中档」「示例高档」？',
        '当源处于「示例中档A」时，它如何直接影响目标处于「示例低档」「示例中档」「示例高档」？',
        '当源处于「示例高档」时，它如何直接影响目标处于「示例低档」「示例中档」「示例高档」？']);
      const rowIds=await page.locator('article[data-row-source]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-row-source')));
      assert.deepEqual(rowIds,['a-low','a-mid','a-high']);
      const named=(await page.locator('.relationships-row-cell .row-cell-label').allInnerTexts()).map(text=>text.split('\n')[0]);
      assert.deepEqual(named,['示例低档','示例中档','示例高档','示例低档','示例中档','示例高档','示例低档','示例中档','示例高档']);
      const headerNames=await page.locator('.relationships-module table.relationships-table thead th').allInnerTexts();
      assert.deepEqual(headerNames,['源 ↓ / 目标 →','示例低档','示例中档','示例高档']);
      const rowHeads=(await page.locator('.relationships-module table.relationships-table tbody th').allInnerTexts()).map(text=>text.split('\n')[0]);
      assert.deepEqual(rowHeads,['示例低档','示例中档A','示例高档']);
      assert.equal(await page.locator('input[data-row-source]').count(),9);
      for(const [a,b] of pairs)assert.equal(await row(page,a,b).count(),1);
      // 有序辅助默认不显示，也拿不到任何自动档位
      assert.equal(await page.locator('[data-order-assist="pending"]').count(),1);
      assert.equal(await page.locator('[data-order-line]').count(),0);
      r.checks.push('rows follow definition order and real names');

      // 3) 逐行填入手算例九格；保存前核对表同步显示实际状态名与方向
      for(let index=0;index<pairs.length;index+=1)await row(page,pairs[index][0],pairs[index][1]).fill(String(HAND[index]));
      assert.equal(await page.locator('td[data-row-preview-source][data-row-preview-target]').count(),9);
      assert.equal(await preview(page,'a-low','b-low').innerText(),'2');
      assert.equal(await preview(page,'a-mid','b-mid').innerText(),'2');
      assert.equal(await preview(page,'a-high','b-high').innerText(),'2');
      assert.match(await page.locator('table.relationships-table > caption').first().innerText(),/示例变量A → 示例变量B/);
      const previewText=await page.locator('.relationships-module table.relationships-table').last().innerText();
      for(const label of ['示例低档','示例中档','示例高档'])assert.ok(previewText.includes(label),'missing '+label);
      r.checks.push('full nine cells with real names before save');

      // 4) 0 与未判断分别呈现，且不会互相补值
      await row(page,'a-mid','b-low').fill('0');
      await row(page,'a-high','b-mid').fill('');
      assert.equal(await preview(page,'a-mid','b-low').innerText(),'0 · 没关系');
      assert.equal(await preview(page,'a-high','b-mid').innerText(),'未判断');
      assert.equal(await preview(page,'a-mid','b-low').getAttribute('data-row-preview-state'),'scored');
      assert.equal(await preview(page,'a-high','b-mid').getAttribute('data-row-preview-state'),'missing');
      assert.notEqual(await preview(page,'a-mid','b-low').evaluate(e=>getComputedStyle(e).backgroundColor),await preview(page,'a-high','b-mid').evaluate(e=>getComputedStyle(e).backgroundColor));
      r.checks.push('0 and blank stay distinct');

      // 5) 未完成的评分不得被切换悄悄丢掉：真实键盘只输负号，浏览器的 value 是空串，
      //    重绘后与「未判断」无法区分；切换显示方式与页签都必须先拦住并聚焦该格。
      await row(page,'a-low','b-mid').fill('');
      await row(page,'a-low','b-mid').focus();
      await page.keyboard.type('-');
      assert.equal(await row(page,'a-low','b-mid').evaluate(e=>e.validity.badInput),true);
      assert.equal(await row(page,'a-low','b-mid').inputValue(),'');
      await table(page).click();
      assert.equal(await page.locator('[data-guide-view="guide"]').getAttribute('aria-pressed'),'true','未完成输入时切换到直接填表必须被拦住');
      assert.equal(await page.locator('input[data-source-state]').count(),0);
      assert.match(await page.locator('.relationships-status').innerText(),/还没输入完成/);
      assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-row-target')),'b-mid');
      await page.getByRole('button',{name:'按年份准备矩阵',exact:true}).click();
      assert.equal(await page.locator('[data-row-guide]').count(),1,'未完成输入时切到矩阵页签必须被拦住');
      assert.equal(await page.locator('[data-row-guide]').isVisible(),true);
      // 补成合法整数后，切换恢复正常
      await row(page,'a-low','b-mid').fill('1');
      assert.equal(await row(page,'a-low','b-mid').evaluate(e=>e.validity.badInput),false);
      await table(page).click();
      assert.equal(await page.locator('input[data-source-state]').count(),9);
      // 反方向同样拦住：直接填表里只输负号，切回逐行判断
      await cell(page,'a-low','b-mid').fill('');
      await cell(page,'a-low','b-mid').focus();
      await page.keyboard.type('-');
      assert.equal(await cell(page,'a-low','b-mid').evaluate(e=>e.validity.badInput),true);
      await guide(page).click();
      assert.equal(await page.locator('[data-guide-view="table"]').getAttribute('aria-pressed'),'true','未完成输入时切换到逐行判断必须被拦住');
      assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-target-state')),'b-mid');
      assert.match(await page.locator('.relationships-status').innerText(),/还没输入完成/);
      await cell(page,'a-low','b-mid').fill('1');
      await guide(page).click();
      assert.equal(await row(page,'a-low','b-mid').inputValue(),'1');
      r.checks.push('unfinished score blocks every switch');

      // 5) 切换参考图形不写分数、不补零、不改草稿
      const draftBefore=await page.evaluate(()=>JSON.stringify([...document.querySelectorAll('input[data-row-source]')].map(i=>[i.getAttribute('data-row-source'),i.getAttribute('data-row-target'),i.value])));
      await page.getByLabel('参考趋势图形（仅供参考，不填分数）',{exact:true}).selectOption('mentor-4');
      assert.equal(await page.locator('[data-row-guide-sketch="mentor-4"]').count(),1);
      assert.match(await page.locator('[data-row-guide-sketch="mentor-4"]').innerText(),/原型示意，仅供参考/);
      await page.getByLabel('参考趋势图形（仅供参考，不填分数）',{exact:true}).selectOption('mentor-5');
      const draftAfter=await page.evaluate(()=>JSON.stringify([...document.querySelectorAll('input[data-row-source]')].map(i=>[i.getAttribute('data-row-source'),i.getAttribute('data-row-target'),i.value])));
      assert.equal(draftAfter,draftBefore);
      assert.equal(await preview(page,'a-high','b-mid').innerText(),'未判断');
      assert.equal((await stored(page)).data.judgments.length,0);
      r.checks.push('graphic never writes the draft');

      // 6) 有序趋势辅助：只有明确确认并逐档标出低中高后才读出顺序，读出顺序不写分数
      await home.openDetails(page,'.row-guide-order');
      await page.locator('[data-order-side="source"]').check();await page.locator('[data-order-side="target"]').check();
      assert.equal(await page.locator('[data-order-assist="pending"]').count(),1);
      await page.getByLabel('「示例低档」对应示例变量A档位').selectOption('低');
      await page.getByLabel('「示例中档A」对应示例变量A档位').selectOption('中');
      await page.getByLabel('「示例高档」对应示例变量A档位').selectOption('高');
      await page.getByLabel('「示例低档」对应示例变量B档位').selectOption('低');
      await page.getByLabel('「示例中档」对应示例变量B档位').selectOption('中');
      await page.getByLabel('「示例高档」对应示例变量B档位').selectOption('高');
      assert.equal(await page.locator('[data-order-assist="ready"]').count(),1);
      assert.equal(await page.locator('[data-order-line="a-mid"]').innerText(),'源「示例中档A」按目标低→中→高：0 · 没关系、2、1');
      assert.equal(await page.locator('[data-order-line="a-high"]').innerText(),'源「示例高档」按目标低→中→高：-2、未判断、2');
      assert.equal(await preview(page,'a-mid','b-low').innerText(),'0 · 没关系');
      await page.screenshot({path:path.join(out,mode+'-filled-1280.png'),fullPage:true});
      r.checks.push('ordered assist reads, never writes');

      // 7) 切回直接填表：同一份草稿、同样的分数与空格
      await table(page).click();
      assert.equal(await cell(page,'a-low','b-low').inputValue(),'2');
      assert.equal(await cell(page,'a-mid','b-mid').inputValue(),'2');
      assert.equal(await cell(page,'a-mid','b-low').inputValue(),'0');
      assert.equal(await cell(page,'a-high','b-mid').inputValue(),'');
      assert.equal(await page.locator('input[data-source-state]').count(),9);
      assert.match(await page.locator('[data-coverage-draft]').innerText(),/8 \/ 9 格已填/);
      await guide(page).click();
      assert.equal(await row(page,'a-mid','b-low').inputValue(),'0');
      await page.getByLabel('判断理由',{exact:true}).fill('用户判断：演示假设，九格依据待核');
      r.checks.push('two views, one draft');

      // 8) 保存：缺口保持未判断，0 保持 0，反向记录不被生成
      await page.getByLabel('判断适用地区',{exact:true}).fill(p.scope.regionId);
      await page.getByLabel('判断适用年份',{exact:true}).fill('2030');
      await page.getByLabel('直接性说明',{exact:true}).selectOption('direct');
      await page.getByRole('button',{name:'保存判断草稿',exact:true}).click();
      const saved=await stored(page),judgment=saved.data.judgments.find(j=>j.sourceDescriptorId==='descriptor-a');
      assert.ok(judgment,'judgment was not saved');
      const byPair=new Map(judgment.entries.map(e=>[e.sourceStateId+'|'+e.targetStateId,e.score]));
      assert.equal(byPair.get('a-low|b-low'),2);assert.equal(byPair.get('a-mid|b-mid'),2);assert.equal(byPair.get('a-high|b-high'),2);
      assert.equal(byPair.get('a-mid|b-low'),0);assert.equal(byPair.get('a-high|b-mid'),null);
      assert.equal(judgment.entries.length,9);assert.equal(judgment.rationale,'用户判断：演示假设，九格依据待核');
      // 唯一的依据是 J1 既有的修改记录：参考图形的选择没有写入任何证据。
      assert.equal(judgment.evidenceRefs.length,1);
      const note=saved.data.evidence.find(e=>e.id===judgment.evidenceRefs[0]);
      assert.equal(note.kind,'user-assumption');
      const after=JSON.parse(note.excerpt).after;
      assert.equal(after.entries.find(e=>e.sourceStateId==='a-mid'&&e.targetStateId==='b-low').score,0);
      assert.equal(after.entries.find(e=>e.sourceStateId==='a-high'&&e.targetStateId==='b-mid').score,null);
      assert.equal(judgment.provenance.origin,'user');
      assert.equal(saved.data.judgments.filter(j=>j.sourceDescriptorId==='descriptor-b'&&j.targetDescriptorId==='descriptor-a').length,0);
      assert.equal(saved.contractVersion,'1.0.0');
      r.checks.push('0 stays 0, gap stays null, no reverse record');

      // 9) J1 延续：手算例九格逐格核对——矩阵实际采用的是保存下来的那九格
      await page.getByRole('button',{name:'按年份准备矩阵',exact:true}).click();
      await page.getByLabel('矩阵年份',{exact:true}).selectOption('2030');
      await page.getByLabel('选用 示例变量A → 示例变量B',{exact:true}).selectOption(judgment.id);
      const matrixCell=(a,b)=>page.locator('[data-matrix-source="'+a+'"][data-matrix-target="'+b+'"]');
      // 逐格核对：手算例九格（A中→B低 已被负控改成 0、A高→B中 是缺口）
      // 矩阵对正值带 + 号，这是 J1 既有渲染，不是本包新增。
      const expectMatrix=[
        ['a-low','b-low','2','+2'],['a-low','b-mid','1','+1'],['a-low','b-high','-2','-2'],
        ['a-mid','b-low','0','0 · 没关系'],['a-mid','b-mid','2','+2'],['a-mid','b-high','1','+1'],
        ['a-high','b-low','-2','-2'],['a-high','b-mid','null','未判断'],['a-high','b-high','2','+2']];
      for(const [a,b,score,text] of expectMatrix){
        assert.equal(await matrixCell(a,b).getAttribute('data-score'),score,'matrix score differs at '+a+'→'+b);
        assert.equal(await matrixCell(a,b).innerText(),text,'matrix text differs at '+a+'→'+b);
        assert.equal(await matrixCell(a,b).getAttribute('title'),'判断记录：'+judgment.id);
      }
      // 负控：反向 B→A 九格在矩阵里仍是未判断，且没有被本条判断填入
      for(const a of ['a-low','a-mid','a-high'])for(const b of ['b-low','b-mid','b-high']){
        assert.equal(await matrixCell(b,a).getAttribute('data-score'),'null','reverse matrix cell must stay unscored at '+b+'→'+a);
        assert.equal(await matrixCell(b,a).innerText(),'未判断');
      }
      assert.match(await page.locator('[data-matrix-coverage]').innerText(),/^应判 18；已判 8；未判断 10。/);
      r.checks.push('matrix consumes the same judgment');

      // 10) 反向独立：切过去仍是空表，且未生成任何记录
      await page.getByRole('button',{name:'关系判断输入',exact:true}).click();
      await page.getByRole('button',{name:'交换方向',exact:true}).click();
      assert.equal(await page.getByLabel('来源变量',{exact:true}).inputValue(),'descriptor-b');
      assert.equal(await page.locator('input[data-row-source]').count(),9);
      assert.ok((await page.locator('input[data-row-source]').evaluateAll(nodes=>nodes.every(n=>n.value===''))));
      assert.equal(await page.locator('[data-order-assist="pending"]').count(),1);
      assert.notEqual(await page.locator('article[data-row-source]').first().getAttribute('data-row-source'),'a-low');
      await table(page).click();
      assert.equal(await page.locator('input[data-source-state]').count(),9);
      assert.ok((await page.locator('input[data-source-state]').evaluateAll(nodes=>nodes.every(n=>n.value===''))));
      await guide(page).click();
      await page.screenshot({path:path.join(out,mode+'-guide-1280.png'),fullPage:true});
      r.checks.push('reverse direction stays independent');

      // 11) 未保存保护（取消、切页）与草稿保留
      await guide(page).click();
      await row(page,'b-low','a-low').fill('-3');
      await page.getByRole('button',{name:'取消草稿',exact:true}).click();
      assert.equal(await page.locator('.relationships-module').count(),1);
      await guide(page).click();
      assert.equal(await row(page,'b-low','a-low').inputValue(),'');
      assert.match(await page.locator('.relationships-status').innerText(),/已取消未保存草稿/);
      await row(page,'b-low','a-low').fill('-3');
      await route(page,'timeline');
      assert.equal(await page.locator('.relationships-module').count(),1);
      await page.getByLabel('来源变量',{exact:true}).selectOption('descriptor-b');
      await ensureGuide(page);
      assert.equal(await row(page,'b-low','a-low').inputValue(),'-3');
      r.checks.push('unsaved draft is protected');

      // 12) 普通与专家共享同一记录：视角只改显示，读的是同一条已保存判断
      await page.getByRole('button',{name:'取消草稿',exact:true}).click();
      await page.getByLabel('来源变量',{exact:true}).selectOption('descriptor-a');
      await page.getByLabel('编辑判断记录',{exact:true}).selectOption(judgment.id);
      await guide(page).click();
      assert.equal(await page.locator('.row-ids').count(),3);
      assert.equal(await row(page,'a-low','b-low').inputValue(),'2');
      assert.equal(await row(page,'a-mid','b-low').inputValue(),'0');
      assert.equal(await row(page,'a-high','b-mid').inputValue(),'');
      // 专家页不允许直接切回普通视角，按既有做法改存储后重载。
      await page.evaluate(key=>{const data=JSON.parse(localStorage.getItem(key));data.view.perspective='public';localStorage.setItem(key,JSON.stringify(data));},key);
      await page.reload();await route(page,'relationships');
      await page.getByLabel('来源变量',{exact:true}).selectOption('descriptor-a');
      await page.getByLabel('编辑判断记录',{exact:true}).selectOption(judgment.id);
      await guide(page).click();
      assert.equal(await page.locator('.row-ids').count(),0);
      assert.equal(await row(page,'a-low','b-low').inputValue(),'2');
      assert.equal(await row(page,'a-mid','b-low').inputValue(),'0');
      assert.equal(await row(page,'a-high','b-mid').inputValue(),'');
      r.checks.push('public and expert share one record');

      // 13) 窄屏与键盘
      await page.setViewportSize({width:390,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:path.join(out,mode+'-guide-390.png'),fullPage:true});
      await page.setViewportSize({width:1440,height:1080});
      await ensureGuide(page);
      await row(page,'a-low','b-low').focus();
      await page.keyboard.press('ArrowUp');
      assert.equal(await row(page,'a-low','b-low').evaluate(e=>e.validity.badInput),false);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      assert.notEqual(await page.evaluate(()=>document.activeElement?.getAttribute('data-row-target')),null);
      r.checks.push('390px and keyboard');

      // 14) 保存失败：草稿留在页面上，不落库
      await ctx.close();
      const failing=await open(url,fixture(),true);await route(failing.page,'relationships');await guide(failing.page).click();
      await row(failing.page,'a-low','b-low').fill('2');
      await failing.page.getByLabel('判断适用地区',{exact:true}).fill(p.scope.regionId);
      await failing.page.getByLabel('判断适用年份',{exact:true}).fill('2030');
      await failing.page.getByRole('button',{name:'保存判断草稿',exact:true}).click();
      assert.match(await failing.page.locator('.relationships-status').innerText(),/浏览器保存失败/);
      assert.equal(await row(failing.page,'a-low','b-low').inputValue(),'2');
      assert.equal((await stored(failing.page)).data.judgments.length,0);
      assert.deepEqual(failing.errors,[]);await failing.ctx.close();
      r.checks.push('failed save keeps the draft');

      // 总控补验：保留上面的缺口负控，另外走一遍完整手算例。
      const complete=await open(url,fixture());
      const full=complete.page;
      await route(full,'relationships');
      await guide(full).click();
      for(const [i,[a,b]] of pairs.entries())await row(full,a,b).fill(String(HAND[i]));
      await full.getByLabel('判断适用地区',{exact:true}).fill(p.scope.regionId);
      await full.getByLabel('判断适用年份',{exact:true}).fill('2030');
      await full.getByLabel('直接性说明',{exact:true}).selectOption('direct');
      await full.getByLabel('判断理由',{exact:true}).fill('完整九格手算例，演示假设');
      await full.getByRole('button',{name:'保存判断草稿',exact:true}).click();
      const fullJudgment=(await stored(full)).data.judgments[0];
      assert.equal(fullJudgment.entries.length,9);
      const fullScores=new Map(fullJudgment.entries.map(e=>[e.sourceStateId+'|'+e.targetStateId,e.score]));
      assert.deepEqual(pairs.map(([a,b])=>fullScores.get(a+'|'+b)),HAND);
      await full.getByRole('button',{name:'按年份准备矩阵',exact:true}).click();
      await full.getByLabel('矩阵年份',{exact:true}).selectOption('2030');
      await full.getByLabel('选用 示例变量A → 示例变量B',{exact:true}).selectOption(fullJudgment.id);
      for(const [i,[a,b]] of pairs.entries()){
        const matrix=full.locator('[data-matrix-source="'+a+'"][data-matrix-target="'+b+'"]');
        assert.equal(await matrix.getAttribute('data-score'),String(HAND[i]));
        assert.equal(await matrix.getAttribute('title'),'判断记录：'+fullJudgment.id);
      }
      assert.deepEqual(complete.errors,[]);
      assert.deepEqual(complete.external,[]);
      await complete.ctx.close();
      r.checks.push('all nine hand-example scores save and reach the matrix');

      assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
      results.push(r);await ctx.close().catch(()=>{});
    }

    // 15) 非三档入口不出现：二档主线保持原样；名义状态不给有序辅助
    const two=createDemoProject();two.view.module='relationships';
    const twoRun=await open(source,two);await route(twoRun.page,'relationships');
    assert.equal(await twoRun.page.locator('input[data-source-state]').count(),4);
    assert.equal(await twoRun.page.getByRole('button',{name:'逐行判断',exact:true}).count(),0);
    assert.equal(await twoRun.page.locator('[data-row-guide]').count(),0);
    assert.deepEqual(twoRun.errors,[]);await twoRun.ctx.close();
    results.push({mode:'two-state',passed:true,checks:['no guide for 2x2']});

    const nominal=fixture({nominal:true});nominal.view.module='relationships';
    const nominalRun=await open(source,nominal);await route(nominalRun.page,'relationships');
    await nominalRun.page.getByRole('button',{name:'逐行判断',exact:true}).click();
    assert.match(await nominalRun.page.locator('.row-question').first().innerText(),/当源处于「红」时/);
    assert.equal(await nominalRun.page.locator('[data-order-assist="pending"]').count(),1);
    assert.equal(await nominalRun.page.locator('[data-order-line]').count(),0);
    assert.ok(!(await nominalRun.page.locator('[data-row-guide]').innerText()).includes('低→中→高：'));
    assert.deepEqual(nominalRun.errors,[]);await nominalRun.ctx.close();
    results.push({mode:'nominal',passed:true,checks:['nominal names get no inferred order']});

    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
