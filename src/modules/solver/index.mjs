import {statusLabel,configurationLabel,diagnosticGroups} from './presentation.mjs';
import {el,infoTip} from '../../core/ui.mjs';
import {prepareRun,createEnumeration,explain,engineVersion} from './engine.mjs';
import {readMatrixHandoff,verifyMatrixHandoff} from '../relationships/handoff.mjs';
import {planCheckSection} from './plan-check.mjs';
import {formulaInline} from '../shared/formula-card.mjs';
import {formulaById} from '../../core/formulas.mjs';
import {planAtYear,changeYearState} from '../elements/state-plan.mjs';
import {createLibrary,namedPlan,emptyBundle} from '../workspace/saved-work.mjs';
const sessions=new Map();
const summaryListeners=new Set();
export function subscribeRunSummary(listener){summaryListeners.add(listener);return ()=>summaryListeners.delete(listener);}
function summaryChanged(){summaryListeners.forEach(listener=>listener());}
export function readRunArchive(store){const session=sessions.get(store.read().id);return session&&!session.running&&session.archives.length?structuredClone(session.archives.at(-1)):null;}
export function readRunSummary(store){
 const p=store.read(),session=sessions.get(p.id),archive=session?.archives.at(-1);
 if(!archive)return null;
 const result=archive.RunResult;
 const sameChoices=JSON.stringify(archive.selectionOfJudgments.map(j=>j.id).sort())===JSON.stringify([...session.selected].sort());
 return {projectId:p.id,revision:archive.projectInputSnapshot.revision,year:archive.RunInput?.year??null,engineVersion:archive.RunInput?.engineVersion??null,status:session.running?'running':result?.status||'blocked',checked:result?.checked??session.progress?.result.checked??0,count:result?.count??null,stale:!store.isCurrent(archive.projectInputSnapshot)||!sameChoices||!!archive.RunInput&&archive.RunInput.year!==Number(session.year)};
}
export function mount(container,context){
 const first=context.store.read();const id=first.id;let session=sessions.get(id);
 const seed=readMatrixHandoff(id);
 if(!session){
  // 默认打开“已经有完整按年方案”的最近一年；都缺才退回第一个年份，不替用户选状态。
  const ready=(first.scope.years||[]).find(y=>{const plan=planAtYear(first,y);return plan.complete;});
  session={year:String(ready??first.scope.years[0]??''),selected:[],assumptions:false,unknown:false,archives:[],scenarioLimit:12};sessions.set(id,session);}
 // 关系页点过“使用这些评分，继续检验”的，就是明确采用：把记录带进来，不再逐方向问一次。
 if(seed?.adopted&&seed.selectionOfJudgments?.length){
  const seedIds=seed.selectionOfJudgments.map(j=>j.id).sort().join(',');
  if(seedIds!==[...session.selected].sort().join(',')||String(seed.year)!==String(session.year)){
   session.year=String(seed.year);session.selected=seed.selectionOfJudgments.map(j=>j.id);
  }
 }
 function start(){
 const root=el('section',{class:'solver-module'});container.append(root);let job=null,timer=null,disposed=false,progress=null,handoffMessage='';
 const button=(text,onclick)=>el('button',{class:'button',onclick},text);
 const name=id=>context.store.read().data.descriptors.find(d=>d.id===id)?.label||id;
 function currentSnapshot(p){return {schemaVersion:p.schemaVersion,contractVersion:p.contractVersion,projectId:p.id,revision:p.revision,scope:structuredClone(p.scope),data:structuredClone(p.data),selection:structuredClone(p.selection)};}

 /* ── 结果摘要：一屏之内回答“算没算、算出多少、我的方案怎样” ── */
 function summaryCard(p,archive){
  const section=el('section',{class:'solver-summary','data-solver-summary':''});

  // “我的方案”：只对当前检验年份下结论。四种状态互斥：
  // 状态未选齐 / 尚未检验 / 自洽 / 存在冲突。全空间有解不能推断你的方案自洽。
  const appendPlan=()=>{
   const planYear=session.year===''?null:Number(session.year);
   if(planYear==null)return;
   const plan=planAtYear(p,planYear);
   const planBlock=el('div',{class:'solver-summary-plan','data-solver-plan':''});
   planBlock.append(el('span',{class:'cap'},'我的方案 · '+planYear+' 年'));
   if(!plan.complete){
    const missing=plan.missing||[];
    planBlock.append(el('p',{class:'bad'},missing.length
      ?'状态未选齐：还差 '+missing.length+' 个因素（'+missing.map(d=>name(d)).join('、')+'）。缺的状态不替你默认选第一档。'
      :'状态未选齐'),
     el('div',{class:'solver-summary-actions'},
      el('button',{class:'button text',onclick:()=>context.navigate('elements')},'去补选状态')));
   }else{
    const states=Object.entries(plan.config).map(([d,s])=>name(d)+'='+(p.data.states.find(x=>x.id===s)?.label||s)).join('，');
    const yearArchive=session.archives.filter(a=>a.RunResult&&a.RunResult.status==='completed'&&String(a.RunInput?.year)===String(planYear)).at(-1)||null;
    let label,cls;
    if(!yearArchive){
     label='尚未检验：这一年还没有完成过检验，不能从任何其他结果推断你的方案。';cls='warn';
    }else{
     const sameChoices=JSON.stringify(yearArchive.selectionOfJudgments.map(j=>j.id).sort())===JSON.stringify([...session.selected].sort());
     const fresh=context.store.isCurrent(yearArchive.projectInputSnapshot)&&sameChoices;
     let trace=null;try{trace=explain(yearArchive.RunInput,plan.config);}catch{}
     if(!fresh){label=(trace?(trace.consistent?'内部自洽（当时输入；此后输入已修改，重新检验才代表现在）':'当时有 '+trace.conflicts.length+' 个因素存在冲突；此后输入已修改，重新检验才代表现在'):'无法复算（输入已变化）');cls='warn';}
     else if(!trace){label='无法用这次冻结输入复算（输入已变化）';cls='warn';}
     else{label=trace.consistent?'内部自洽（允许并列最大）':'存在 '+trace.conflicts.length+' 处冲突：有因素被其他状态压过';cls=trace.consistent?'ok':'bad';}
    }
    planBlock.append(el('p',{},states),
     el('p',{class:cls},label),
     el('div',{class:'solver-summary-actions'},
      el('button',{class:'button text',onclick:()=>{const target=root.querySelector('.plan-check');if(target){target.scrollIntoView({block:'center'});target.querySelector('[data-plan-check-run]')?.focus();}}},'查看原因'),
      el('button',{class:'button text',onclick:()=>{const basis=root.querySelector('.solver-basis');if(basis){basis.open=true;basis.scrollIntoView({block:'center'});}}},'查看这次结果的计算依据'),
      el('button',{class:'button text',onclick:()=>context.navigate('exports')},'保存这次结果')));
   }
   section.append(planBlock);
  };

  // 顶部状态：先讲这次检验（有多少解），方案块紧随其后。
  if(!archive){
   section.append(el('div',{class:'solver-summary-empty'},el('h3',{},'还没有本次检验结果'),
    el('p',{},'下面先检查这一年的方案，或者枚举这一年允许的全部组合。结果只会在计算完成后出现。')));
   appendPlan();
   return section;
  }
  const r=archive.RunResult,year=archive.RunInput?.year??null;
  // 输入改过就明说过期：旧结果保留可查，但不再代表当前输入。
  const sameChoices=JSON.stringify(archive.selectionOfJudgments.map(j=>j.id).sort())===JSON.stringify([...session.selected].sort());
  const stale=!context.store.isCurrent(archive.projectInputSnapshot)||!sameChoices;
  if(stale)section.append(el('p',{class:'solver-stale','data-solver-stale':''},'输入已修改：这份结果已过期；下面保留的是当时的冻结输入与结论，重新检验才代表现在。'));
  if(!r){
   if(session.running||job){
    section.append(el('div',{class:'solver-summary-head'},el('strong',{},'正在计算…'),
      el('p',{'data-solver-progress':''},'已检查 '+((session.progress?.result?.checked)||0)+' / '+(session.progress?.result?.space?.constrained??'?')+' 种组合，正在计算……未完成前不给自洽总数。')));
   }else{
    section.append(el('div',{class:'solver-summary-head bad'},el('strong',{},'还没开始计算'),el('span',{},'输入未通过前置检查；这不等于“0 种自洽组合”。')));
   }
   appendPlan();
   return section;
  }
  if(r.status==='blocked'){
   section.append(el('div',{class:'solver-summary-head bad'},el('strong',{},'计算被阻断'),el('span',{},'输入不满足检验条件，没有产生结果；下面列出要处理的项。')));
   appendPlan();
   return section;
  }
  if(r.status==='failed'){
   section.append(el('div',{class:'solver-summary-head warn'},el('strong',{},'计算未完成'),
    el('span',{},'已检查 '+r.checked+' 种组合'+(archive.partialFound?'，局部发现 '+archive.partialFound+' 个':'')+'；取消或中断时不给出全空间总数。')));
   appendPlan();
   return section;
  }
  if(r.status!=='completed'){
   section.append(el('div',{class:'solver-summary-head warn'},el('strong',{},statusLabel(r.status)),el('span',{},'本次没有可用的完整结果。')));
   appendPlan();
   return section;
  }
  const zero=r.count===0;
  section.append(el('div',{class:'solver-summary-head'+(zero?' warn':'')},
    el('strong',{},(zero?'没有找到自洽组合':'共找到 '+r.count+' 种自洽组合'),infoTip('自洽指每个因素所选状态在自己这一列的支持分不低于任何替代状态。这是矩阵内部一致，不是发生概率，也不是最优解。','自洽组合的含义')),
    el('span',{},zero?'这一年的全部组合都被判为不自洽；你的方案仍保留在下面，可以查看冲突。':'这是该年份全部组合中判为自洽的数量。')));
  section.append(el('div',{class:'solver-summary-stats'},
    el('div',{},el('b',{},String(year??'—')),el('span',{},'研究年份')),
    el('div',{},el('b',{},String(r.checked)),el('span',{},'已检查组合')),
    el('div',{},el('b',{},String(Math.max(0,r.checked-r.count))),el('span',{},'不自洽组合')),
    el('div',{},el('b',{},r.truncated?'截断':'完整'),el('span',{},r.truncated?'列表截断，计数完整':'全部组合已列出'))));
  appendPlan();
  return section;
 }

 /* ── 自洽组合：紧凑表格，点行才展开解释与比较；保存为新方案走预览确认 ── */
 // 结果出来后的三个后续动作都真实可用：解释来自冻结输入复算；比较对当前年度方案逐因素对照；
 // 保存为新方案在项目副本上落状态（不动当前项目的年度安排），经命名库真实写入。
 function scenariosCard(p,archive){
  const r=archive.RunResult;
  if(!r||r.status!=='completed'||!r.scenarios.length)return null;
  const section=el('section',{class:'solver-scenarios'},el('div',{class:'hd'},el('h3',{},'自洽组合'),el('span',{class:'note'},'共 '+r.count+' 个'+(r.truncated?'，此处最多保留 '+r.scenarios.length+' 个':''))));
  const ids=archive.RunInput.activeDescriptorIds,stateName=s=>p.data.states.find(x=>x.id===s)?.label||s;
  const limit=Math.min(session.scenarioLimit||12,r.scenarios.length);
  const table=el('table',{class:'v5-table solver-scenario-table'},
   el('thead',{},el('tr',{},el('th',{},'#'),...ids.map(id=>el('th',{},name(id))),el('th',{scope:'col'},'后续动作'))));
  const tbody=el('tbody');
  const year=archive.RunInput?.year??null;
  const plan=year==null?null:planAtYear(p,year);
  const compareBlock=(config,index)=>{
   const box=el('div',{class:'solver-scenario-compare'},el('h4',{},'与我的方案比较（'+year+' 年）'));
   if(!plan)return box.append(el('p',{class:'v5-hint'},'没有可比较的年度方案。')),box;
   if(!plan.complete){
    box.append(el('p',{class:'v5-hint'},'我的方案 '+year+' 年状态未选齐（缺 '+plan.missing.map(d=>name(d)).join('、')+'），先补齐才能逐因素比较。'),
     el('button',{class:'button text',onclick:()=>context.navigate('elements')},'去补选状态'));
    return box;
   }
   const rows=ids.map(id=>{
    const mine=plan.config[id]??null,their=config[id]??null;
    return {id,same:mine===their,mine:mine?stateName(mine):'—',their:their?stateName(their):'—'};
   });
   const diff=rows.filter(x=>!x.same);
   box.append(diff.length
    ?el('p',{},'与你的方案有 '+diff.length+' 处不同：')
    :el('p',{},'这个组合与你的 '+year+' 年方案完全一致。'),
    el('ul',{class:'solver-compare-list'},...rows.map(x=>el('li',{class:x.same?'':'is-diff'},name(x.id)+'：我的方案「'+x.mine+'」'+(x.same?'＝':'≠')+'组合「'+x.their+'」'))),
    ...(diff.length?[el('p',{class:'v5-hint'},'差异只说明状态不同，不代表你的方案错误；你的方案自洽与否看上方「我的方案」结论。')]:[]));
   return box;
  };
  const saveScenario=(config,index)=>{
   const dialog=el('dialog',{class:'reference-dialog scenario-save-dialog','aria-label':'保存为新方案预览'});
   const rows=ids.map(id=>el('tr',{},el('td',{},name(id)),el('td',{},stateName(config[id]))));
   const input=el('input',{class:'save-name','aria-label':'新方案名称',maxlength:'120',value:'自洽组合 '+(index+1)+' · '+year+' 年'});
   const msg=el('p',{class:'v5-hint',role:'status'});
   const close=()=>dialog.close();
   const doSave=()=>{
    try{
     const value=input.value.trim();
     if(!value)throw new Error('请填写方案名称');
     const storage=('localStorage'in window)?localStorage:null;
     if(!storage)throw new Error('浏览器存储不可访问');
     const library=createLibrary(storage);
     const state=library.load();
     if(!state.ok)throw new Error('本地库无法读取：'+state.error);
     if(state.bundle.plans.some(x=>x.name===value))throw new Error('已有同名方案「'+value+'」，请换一个名称；不会覆盖原方案');
     // 副本上落状态：当前项目的年度安排一个字节都不动。
     let clone=structuredClone(p);
     for(const id of ids){try{clone=changeYearState(clone,id,year,config[id],()=>crypto.randomUUID());}catch{/* 与现状相同即跳过 */}}
     library.merge({...emptyBundle(),plans:[namedPlan(clone,value,config)]});
     window.dispatchEvent(new CustomEvent('scenario-workbench:library-changed'));
     msg.textContent='已保存新方案「'+value+'」：它记录这份自洽组合的 '+year+' 年状态；当前项目的年度安排未被改动。';
     dialog.querySelector('.scenario-save-actions').replaceChildren(el('button',{class:'button',type:'button',onclick:close},'关闭'));
    }catch(error){msg.textContent='未保存：'+error.message;}
   };
   dialog.append(
    el('div',{class:'reference-hd'},el('h3',{},'保存为新方案'),el('button',{class:'button text',type:'button',onclick:close},'关闭')),
    el('div',{class:'reference-body'},
     el('p',{class:'reference-tag'},'保存的是项目快照，其 '+year+' 年状态改为这个自洽组合；不覆盖当前项目的年度安排。'),
     el('dl',{class:'reference-meta'},
      el('div',{},el('dt',{},'目标年份'),el('dd',{},String(year))),
      el('div',{},el('dt',{},'涉及因素与将采用的状态'),el('dd',{},el('table',{class:'v5-table'},el('tbody',{},...rows))))),
     el('label',{class:'save-field'},'方案名称',input),
     msg,
     el('div',{class:'reference-actions scenario-save-actions'},
      el('button',{class:'button primary-action',type:'button',onclick:doSave},'确认保存为新方案'),
      el('button',{class:'button text',type:'button',onclick:close},'取消'))));
   document.body.append(dialog);
   dialog.addEventListener('close',()=>dialog.remove());
   dialog.showModal();
  };
  for(let i=0;i<limit;i++){
   const config=r.scenarios[i],trace=r.balanceTrace?.[i]||null;
   const detail=el('tr',{class:'solver-scenario-detail',hidden:'hidden'},el('td',{colspan:String(ids.length+2)},
     trace?el('div',{class:'solver-scenario-trace'},...trace.balances.map(b=>el('p',{},name(b.descriptorId)+'：所选 '+(stateName(b.selectedStateId))+' 支持 '+b.selectedSupport+'，最大 '+b.maximum+'，差距 '+b.gap))):el('p',{},'这条配置的逐项贡献见「查看计算依据」。'),
     compareBlock(config,i)));
   const toggle=el('button',{class:'button text','aria-expanded':'false','aria-label':'组合 '+(i+1)+' 解释与比较',onclick:e=>{const open=detail.hidden;detail.hidden=!open;e.currentTarget.setAttribute('aria-expanded',String(open));e.currentTarget.textContent=open?'收起':'解释与比较';}},'解释与比较');
   const save=el('button',{class:'button text','aria-label':'组合 '+(i+1)+' 保存为新方案',onclick:()=>saveScenario(config,i)},'保存为新方案');
   tbody.append(el('tr',{},el('td',{},String(i+1)),...ids.map(id=>el('td',{},stateName(config[id]))),el('td',{},toggle,save)),detail);
  }
  table.append(tbody);

  // 自洽组合状态画像：与首页地理地图无关；同一份真实结果，两种视图切换，不重复堆两份内容。
  const order=id=>p.data.descriptors.find(d=>d.id===id)?.stateIds||[];
  const view=session.portraitView||(limit<=4?'cards':'matrix');
  const toggleBar=el('div',{class:'portrait-toggle'},
    el('button',{class:'button text'+(view==='cards'?' is-current':''),onclick:()=>{session.portraitView='cards';render();}},'方案卡'),
    el('button',{class:'button text'+(view==='matrix'?' is-current':''),onclick:()=>{session.portraitView='matrix';render();}},'矩阵'),
    el('span',{class:'note'},'前 '+limit+' 个自洽组合'+(r.truncated?'（完整计数 '+r.count+'，列表截断）':'')));
  const portrait=el('div',{class:'solver-portrait'},
   el('div',{class:'hd'},el('h4',{},'自洽组合状态画像'),toggleBar),
   el('p',{class:'v5-hint'},'来自这次冻结结果。颜色只表示状态在因素里的第几档，不是概率、绩效或促进抑制评分。点方案卡或表格行可展开逐因素解释。'));
  if(view==='cards'){
   // 少量组合：每个组合一张卡，状态名直接可读；点卡切到表格并展开那一行的解释。
   const cards=el('div',{class:'portrait-cards'});
   for(let i=0;i<limit;i++){
    const config=r.scenarios[i];
    const card=el('button',{class:'portrait-card',type:'button','aria-label':'组合 '+(i+1)+'，展开解释'},
      el('b',{},'组合 '+(i+1)),
      ...ids.map(id=>{
        const st=p.data.states.find(x=>x.id===config[id]);
        return el('span',{},el('em',{},name(id)),stateName(config[id]));
      }));
    card.addEventListener('click',()=>{session.portraitExpand=i;session.portraitView='matrix';render();
      const row=body.querySelector('.solver-scenario-detail:not([hidden])')||body.querySelector('.solver-scenarios tbody tr td button');
      row?.scrollIntoView({block:'center'});});
    cards.append(card);
   }
   portrait.append(cards);
  }else{
   // 组合较多：矩阵；格子里直接写状态名（不是只写 1/2/3），列名完整可换行。
   const expand=session.portraitExpand;
   const head=el('tr',{},el('th',{},'组合'),...ids.map(id=>el('th',{},name(id))));
   const rows=[];
   for(let i=0;i<limit;i++){
    const config=r.scenarios[i];
    const row=el('tr',{class:expand===i?'is-open':'',tabindex:'0','aria-label':'组合 '+(i+1)+'，展开解释'},el('th',{},String(i+1)),...ids.map(id=>{
      const idx=order(id).indexOf(config[id]);
      const label=stateName(config[id]);
      return el('td',{class:'lv'+(idx+1),title:name(id)+'：'+label,'aria-label':name(id)+'：'+label},label);
    }));
    row.addEventListener('click',()=>{const btn=body.querySelectorAll('.solver-scenario-table .solver-scenario-detail')[i]?.previousElementSibling?.querySelector('button')||body.querySelectorAll('.solver-scenario-table tbody > tr')[i*2]?.querySelector('td:last-child button');btn?.click();});
    row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();row.click();}});
    rows.push(row);
   }
   portrait.append(el('div',{class:'portrait-scroll'},el('table',{class:'portrait-table','aria-label':'自洽组合状态画像'},el('thead',{},head),el('tbody',{},...rows))));
  }
  session.portraitExpand=undefined;
  section.append(portrait,el('div',{class:'v5-scroll'},table));
  if(r.scenarios.length>limit)section.append(button('显示更多（还有 '+(r.scenarios.length-limit)+' 个）',()=>{session.scenarioLimit=(session.scenarioLimit||12)+24;render();}));
  return section;
 }

 function render(){if(disposed)return;
  const p=context.store.read();root.replaceChildren();
  const year=el('select',{'aria-label':'检算年份',disabled:!!job,onchange:e=>{session.year=e.target.value;render();}},el('option',{value:''},'请先选年份'),...p.scope.years.map(y=>el('option',{value:y},y)));year.value=session.year;
  const yearRow=el('div',{class:'solver-yearbar'},el('span',{class:'cap'},'检验年份'),year,el('span',{class:'hint'},'换年份只换当前截面，不改项目范围'));
  root.append(el('div',{class:'solver-head'},el('p',{},'先看这一年的方案是否自洽，再决定要不要枚举全部组合。')),yearRow);

  const last=session.archives.at(-1);
  root.append(summaryCard(p,last));
  root.append(handoffSection(p));

  // 1 · 检验我的方案（读取因素页该年状态；缺状态就地补选）
  const pre=prepareRun(p,{year:session.year===''?null:Number(session.year),selectedJudgmentIds:session.selected,assumptionAcknowledgements:{currentAssumptions:session.assumptions,unknownStateScope:session.unknown}});
  const planEl=planCheckSection({project:p,prepared:pre,session,context,lastArchive:last,onRender:render});
  planEl.classList.add('solver-task');
  planEl.insertBefore(el('div',{class:'solver-task-hd'},el('span',{class:'no'},'1'),el('h3',{},'检验我的方案'),el('span',{class:'note'},'只算这一年你选的状态，不改变枚举范围')),planEl.firstChild);

  // 2 · 寻找所有自洽组合
  const fullSpace=el('section',{class:'solver-fullspace solver-task'},
    el('div',{class:'solver-task-hd'},el('span',{class:'no'},'2'),el('h3',{},'寻找所有自洽组合'),el('span',{class:'note'},'按这一年允许的全部组合枚举，不锁定我的方案')));
  const fatal=pre.diagnostics.filter(d=>d.classification==='block');
  const spaceText=el('p',{'data-solver-space':''},'组合空间：'+(pre.space?pre.space.constrained+' 种（无约束 '+pre.space.unconstrained+'），上限 '+pre.space.limit:'尚不能确定'));
  fullSpace.append(spaceText);
  if(fatal.length){
   // 普通界面把同义技术诊断合并成一个可操作问题（选因素数量）；
   // 底层校验原文不删不改，完整清单仍在下方“查看输入诊断与假设”。
   let mergedFactors=false;
   const shown=[];
   for(const d of fatal){
    if(/至少需要两个活动变量|至少两个不重复的非空活动变量ID/.test(d.message)){
     if(mergedFactors)continue;
     mergedFactors=true;
     shown.push({message:'请先选择至少 2 个研究因素（当前因素数不够，无法形成方向）'});
     continue;
    }
    shown.push({message:d.message});
   }
   const inlineCheck=(label,value,onchange)=>{const input=el('input',{type:'checkbox','aria-label':label,disabled:!!job,onchange:e=>{onchange(e.target.checked);render();}});input.checked=value;return el('label',{class:'solver-check'},input,label);};
   const codes=new Set(fatal.map(d=>d.code));
   const needCurrent=codes.has('ASSUMPTIONS_REQUIRED'),needUnknown=codes.has('STATE_ASSUMPTIONS_REQUIRED');
   const others=shown.filter(item=>!/请先选择至少 2 个研究因素/.test(item.message));
   fullSpace.append(el('p',{class:'solver-cannot'},'还不能检验：有 '+fatal.length+' 项需要处理'+(mergedFactors?'；其中因素数量问题已合并为一条':'')),
    el('ul',{class:'solver-cannot-list'},...[...new Set(shown.map(d=>d.message))].slice(0,6).map(text=>el('li',{},text))));
   if(others.length||mergedFactors)fullSpace.append(el('div',{class:'solver-cannot-actions'},
      mergedFactors?button('去选择因素',()=>context.navigate('elements')):null,
      others.length?button('去关系页核对评分',()=>context.navigate('relationships')):null,
      button('去因素页核对状态',()=>context.navigate('elements'))));
   if(needCurrent||needUnknown)fullSpace.append(el('div',{class:'solver-assume-inline'},
      el('p',{class:'v5-hint'},'下面这些假设必须由你本人确认；平台不会替你勾选，勾选只表示你同意按这个口径算。'),
      needCurrent?inlineCheck('按当前草案、依据不足及量表假设检算',session.assumptions,v=>{session.assumptions=v;}):null,
      needUnknown?inlineCheck('未声明的状态年份或地区作为当前截面假设',session.unknown,v=>{session.unknown=v;}):null));
   fullSpace.append(el('div',{class:'solver-cannot-actions'},
      button('展开全部输入诊断',()=>{const d=fullSpace.querySelector('.solver-diagnostics');if(d)d.open=true;d?.scrollIntoView({block:'center'});})),
    el('p',{class:'v5-hint'},'这些是计算前置条件，不是结果；处理完再点“开始检验”。'));
  }
  const hasResult=last?.RunResult?.status==='completed';
  const start=button(fatal.length?'开始检验（仍需处理输入）':hasResult?'重新检验':'开始检验',()=>startRun(p,pre));start.disabled=!!job;
  start.classList.add(hasResult?'secondary':'primary-action');
  const diagDetails=el('details',{class:'solver-diagnostics'},el('summary',{},'查看输入诊断与假设（'+pre.diagnostics.length+'）'),el('ul',{},...diagnosticGroups(pre.diagnostics).map(g=>el('li',{},g.count+'项：'+g.message,el('details',{},el('summary',{},'涉及记录与完整诊断'),el('pre',{},JSON.stringify(g.items,null,2)))))));
  if(job)fullSpace.append(button('取消检算',()=>{job.cancel();}),
    el('p',{'data-solver-progress':''},'已检查 '+(progress?.result.checked||0)+(pre.space?' / '+pre.space.constrained:'')+' 种组合，正在计算……未完成前不给自洽总数。'));
  fullSpace.append(start,diagDetails);
  // 结果优先：先给自洽组合，再给我的方案，最后才是重新检验与计算详情。
  const scenarios=last?scenariosCard(p,last):null;
  if(last){
    if(scenarios)root.append(scenarios);
    root.append(planEl,fullSpace);
  }else{
    root.append(planEl,fullSpace);
  }

  // 折叠：完整输入、逐项贡献与公式
  if(last)root.append(basisDetails(p,last));

  // 本次检验结果 vs 历史检验记录
  root.append(sessionResultCard(p,last));

  // 高级：年份、评分选用、假设确认
  const settings=el('details',{class:'solver-settings','data-solver-settings':'',open:session.settingsOpen??false,ontoggle:e=>{if(e.target.isConnected)session.settingsOpen=e.target.open;}},el('summary',{},'高级：逐方向选用评分与假设确认'));
  const controls=el('div',{class:'solver-records'},el('h4',{},'各方向使用哪条评分（已选 '+session.selected.length+' 条）'));
  for(const a of p.selection.descriptorIds)for(const b of p.selection.descriptorIds){if(a===b)continue;
   const records=p.data.judgments.filter(j=>j.sourceDescriptorId===a&&j.targetDescriptorId===b);
   const select=el('select',{'aria-label':'检算选用 '+a+' → '+b,disabled:!!job,onchange:e=>{session.selected=session.selected.filter(id=>!records.some(r=>r.id===id));if(e.target.value)session.selected.push(e.target.value);render();}},el('option',{value:''},'未选用'),...records.map(j=>el('option',{value:j.id},'判断 '+(records.indexOf(j)+1)+' · v'+j.version+' · '+(j.scope?.regionId||'地区未知')+' · '+(j.validYears||[]).join('/'))));
   select.value=records.find(r=>session.selected.includes(r.id))?.id||'';
   controls.append(el('label',{},name(a)+' → '+name(b),select));}
  const yearNum=session.year===''?null:Number(session.year),uniq=[];
  if(yearNum!==null)for(const a of p.selection.descriptorIds)for(const b of p.selection.descriptorIds){if(a===b)continue;const list=p.data.judgments.filter(j=>j.sourceDescriptorId===a&&j.targetDescriptorId===b&&j.scope?.regionId===p.scope.regionId&&Array.isArray(j.validYears)&&j.validYears.includes(yearNum));if(list.length===1&&!session.selected.includes(list[0].id))uniq.push(list[0].id);}
  if(uniq.length)controls.append(el('div',{class:'solver-fill-unique'},button('使用这些方向唯一的评分（'+uniq.length+'）',()=>{session.selected=[...new Set([...session.selected,...uniq])];render();})));
  const check=(label,value,onchange)=>{const input=el('input',{type:'checkbox','aria-label':label,disabled:!!job,onchange:e=>{onchange(e.target.checked);render();}});input.checked=value;return el('label',{class:'solver-check'},input,label);};
  const clear=button('清空本页选用与确认',()=>{session.selected=[];session.assumptions=false;session.unknown=false;render();});clear.disabled=!!job;
  settings.append(el('p',{class:'v5-hint'},'这里的选用只影响本次计算；关系页的矩阵仍以那边明确采用的记录为准。'),
   controls,
   el('div',{class:'solver-assumptions'},check('按当前草案、依据不足及量表假设检算',session.assumptions,v=>{session.assumptions=v;}),check('未声明的状态年份或地区作为当前截面假设',session.unknown,v=>{session.unknown=v;})),
   el('div',{class:'solver-settings-actions'},clear,button('核对项目范围',()=>context.navigate('workspace')),button('核对因素与状态',()=>context.navigate('elements')),button('核对关系与矩阵',()=>context.navigate('relationships'))));
  root.append(settings);
  summaryChanged();
 }

 function handoffSection(p){
  const candidate=readMatrixHandoff(p.id);
  const section=el('section',{'data-flow-candidate':'',class:'solver-handoff'});
  if(!candidate){section.hidden=true;return section;}
  const checked=verifyMatrixHandoff(p,candidate);
  const sameYear=String(candidate.year)===String(session.year);
  const ids=candidate.selectionOfJudgments.map(j=>j.id).sort().join(',');
  const adopted=checked.ok&&sameYear&&ids===[...session.selected].sort().join(',');
  if(adopted){
   section.classList.add('is-compact');
   section.append(el('p',{class:'solver-handoff-line'},'已采用关系页 '+candidate.year+' 年评分（'+candidate.selectionOfJudgments.length+' 条，矩阵 '+candidate.matrix.coverage.judged+'/'+candidate.matrix.coverage.required+'）。'),
    el('button',{class:'button text',onclick:()=>context.navigate('relationships')},'改评分'));
   return section;
  }
  section.append(el('p',{},'关系页已发送 '+candidate.year+' 年、'+candidate.selectionOfJudgments.length+' 条记录（完整矩阵 '+candidate.matrix.coverage.judged+'/'+candidate.matrix.coverage.required+'）。'+(checked.ok?'':'候选已失效：'+checked.message)));
  const adopt=button('采用这份评分',()=>{
   if(job)return;const current=verifyMatrixHandoff(context.store.read(),candidate);if(!current.ok){handoffMessage='未采用：'+current.message;render();return;}
   if((session.year!==''||session.selected.length||session.assumptions||session.unknown)&&!confirm('采用候选会替换本页年份和记录选用，并清除假设确认。已有结果保留，不触发计算。继续采用吗？'))return;
   session.year=String(candidate.year);session.selected=candidate.selectionOfJudgments.map(j=>j.id);session.assumptions=false;session.unknown=false;handoffMessage='已采用；尚未计算。';render();
  });adopt.disabled=!!job||!checked.ok;
  section.append(adopt,button('返回关系页',()=>context.navigate('relationships')));
  if(handoffMessage)section.append(el('p',{class:'v5-hint'},handoffMessage));
  return section;
 }

 function startRun(p,pre){
  const envelope={archiveVersion:1,RunInput:pre.input?structuredClone(pre.input):null,RunResult:null,projectInputSnapshot:currentSnapshot(p),preflightDiagnostics:structuredClone(pre.diagnostics),assumptionAcknowledgements:{currentAssumptions:session.assumptions,unknownStateScope:session.unknown},selectionOfJudgments:session.selected.map(id=>{const j=p.data.judgments.find(j=>j.id===id);return {id,version:j?.version??null,evidenceRefs:structuredClone(j?.evidenceRefs||[])};})};
  session.archives.push(envelope);progress=null;session.progress=null;session.running=false;session.scenarioLimit=12;
  if(!pre.input){render();return;}
  job=createEnumeration(pre.input);session.running=true;const active=job,batch=Math.max(1,Math.min(250,Math.floor(20000/(pre.input.stateDefinitions.length*(pre.input.activeDescriptorIds.length-1)))));
  function tick(){if(disposed||job!==active)return;try{progress=active.step(batch);session.progress=progress;envelope.partialFound=progress.found;
    if(progress.done){envelope.RunResult=progress.result;session.running=false;job=null;timer=null;render();}
    else{const bar=root.querySelector('[data-solver-progress]');if(bar)bar.textContent='已检查 '+progress.result.checked+' / '+(pre.space?pre.space.constrained:'?')+' 种组合，正在计算……未完成前不给自洽总数。';summaryChanged();timer=setTimeout(tick,0);}}
   catch(e){active.cancel();const stopped=active.step();envelope.RunResult={...stopped.result,status:'failed',count:null,diagnostics:[...stopped.result.diagnostics,{code:'ENGINE_FAILURE',message:e.message}]};session.running=false;job=null;timer=null;render();}}
  render();timer=setTimeout(tick,0);
 }

 /* ── 计算依据：公式、逐项贡献、完整输入，默认折叠 ── */
 function basisDetails(p,archive){
  const snapshot=archive.projectInputSnapshot,result=archive.RunResult;
  const wrap=el('details',{class:'solver-basis'},el('summary',{},'查看计算依据（公式、逐项贡献与完整输入）'));
  if(!archive.RunInput){wrap.append(el('p',{},'本次没有可用的冻结输入。'));return wrap;}
  const stateName=stateId=>snapshot.data.states.find(s=>s.id===stateId)?.label||stateId;
  const plan=archive.RunInput.year==null?null:planAtYear(snapshot,archive.RunInput.year);
  const inspection=plan?.complete?plan.config:Object.fromEntries(archive.RunInput.activeDescriptorIds.map(id=>[id,archive.RunInput.matrix.stateIdsByDescriptor[id][0]]));
  const trace=explain(archive.RunInput,inspection);
  wrap.append(el('p',{},'冻结年份 '+archive.RunInput.year+'；地区 '+archive.RunInput.scope.regionId+'；锁定 '+(archive.RunInput.lockedStateIds.map(id=>stateName(id)).join('、')||'无')));
  if(plan?.complete){
   wrap.append(el('p',{},'以下按“我的方案”的配置逐项展开；其他组合可在上方表格里逐条看。'));
   const list=el('ul',{class:'solver-contrib'});
   for(const b of trace.balances){
    const alt=b.candidates.find(c=>c.support===b.maximum);
    list.append(el('li',{},name(b.descriptorId)+' 取“'+stateName(b.selectedStateId)+'”：所选支持 '+b.selectedSupport+'，最大 '+b.maximum+'，差距 '+b.gap+(b.consistent?'（自洽）':''),
     el('ul',{},...b.candidates.map(c=>el('li',{},stateName(c.stateId)+'：'+c.contributions.map(x=>name(x.sourceDescriptorId)+' '+(stateName(x.sourceStateId))+' → '+x.score).join(' + ')+' = '+c.support)))));
   }
   wrap.append(list);
  }
  const fctx={input:archive.RunInput,run:result,trace,name:id=>snapshot.data.descriptors.find(d=>d.id===id)?.label||id};
  if(trace.balances.length){
   const b0=trace.balances[0],picked=b0.candidates.find(c=>c.stateId===b0.selectedStateId);
   if(picked)fctx.sample={label:'我的方案 · '+fctx.name(b0.descriptorId)+' 取“'+stateName(b0.selectedStateId)+'”',text:picked.contributions.map(x=>fctx.name(x.sourceDescriptorId)+' 的“'+stateName(x.sourceStateId)+'”格 '+x.score).join(' + ')+' = '+b0.selectedSupport};
  }
  wrap.append(el('div',{class:'solver-formulas'},...['space','support','consistent','gap','gamma'].map(fid=>formulaInline(formulaById(fid),fctx))),
   el('details',{},el('summary',{},'完整冻结输入与诊断'),el('pre',{},JSON.stringify({RunInput:archive.RunInput,preflightDiagnostics:archive.preflightDiagnostics,resultDiagnostics:result?.diagnostics||[]},null,2))));
  return wrap;
 }

 /* ── 本次检验结果 / 历史检验记录 ── */
 function sessionResultCard(p,archive){
  const section=el('section',{class:'solver-session'},el('div',{class:'hd'},el('h3',{},'本次检验结果'),el('span',{class:'note'},session.archives.length?('本会话 '+session.archives.length+' 次'):'尚无'))); 
  if(!archive){
   section.append(el('p',{class:'v5-hint'},'完成一次检验后可下载结果，或到「保存与导出」保存为检验记录。'));
   section.append(button('前往保存与导出',()=>context.navigate('exports')));
   return section;
  }
  const result=archive.RunResult;
  section.append(el('p',{},result?statusLabel(result.status)+' · 成立数 '+(result.count===null?'未定（未完成）':result.count)+' · 已检查 '+result.checked:'已记录输入，尚未计算'));
  if(session.archives.length>1){
   const choose=el('select',{'aria-label':'查看旧检验结果',onchange:e=>{const i=Number(e.target.value);if(i!==session.archives.length-1){const picked=session.archives.splice(i,1)[0];session.archives.push(picked);render();}}},...session.archives.map((_,i)=>el('option',{value:i},'第 '+(i+1)+' 次检验')));
   choose.value=session.archives.length-1;choose.disabled=!!job;section.append(el('label',{class:'solver-pick'},'查看',choose));
  }
  const download=button('下载本次结果 JSON',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(archive,null,2)],{type:'application/json'})),a=el('a',{href:url,download:'cib-archive.json'});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});download.disabled=!!job;
  section.append(el('div',{class:'solver-session-actions'},download,button('历史检验记录',()=>context.navigate('exports'))));
  section.append(el('p',{class:'v5-hint'},'本次结果只保留在当前浏览器会话；刷新后需重新计算，或到「保存与导出」存为检验记录。'));
  return section;
 }

 const unsubscribe=context.store.subscribe(render);render();
 return {canLeave(){if(job){job.cancel();clearTimeout(timer);const final=job.step();session.archives.at(-1).RunResult=final.result;session.running=false;job=null;timer=null;summaryChanged();}return true;},dispose(){if(job){job.cancel();clearTimeout(timer);session.archives.at(-1).RunResult=job.step().result;session.running=false;job=null;summaryChanged();}disposed=true;clearTimeout(timer);unsubscribe();root.remove();}};
 }
 return start();
}
