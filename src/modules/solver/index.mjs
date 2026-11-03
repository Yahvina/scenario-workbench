import {el} from '../../core/ui.mjs';
import {prepareRun,createEnumeration,explain,engineVersion} from './engine.mjs';
const sessions=new Map();
const summaryListeners=new Set();
export function subscribeRunSummary(listener){summaryListeners.add(listener);return ()=>summaryListeners.delete(listener);}
function summaryChanged(){summaryListeners.forEach(listener=>listener());}
export function readRunSummary(store){
 const p=store.read(),session=sessions.get(p.id),archive=session?.archives.at(-1);
 if(!archive)return null;
 const result=archive.RunResult;
 const sameChoices=JSON.stringify(archive.selectionOfJudgments.map(j=>j.id).sort())===JSON.stringify([...session.selected].sort());
 return {projectId:p.id,revision:archive.projectInputSnapshot.revision,year:archive.RunInput?.year??null,engineVersion:archive.RunInput?.engineVersion??null,status:session.running?'running':result?.status||'blocked',checked:result?.checked??session.progress?.result.checked??0,count:result?.count??null,stale:!store.isCurrent(archive.projectInputSnapshot)||!sameChoices||!!archive.RunInput&&archive.RunInput.year!==Number(session.year)};
}
export function mount(container,context){
 const id=context.store.read().id;let session=sessions.get(id);if(!session){session={year:'',selected:[],assumptions:false,unknown:false,archives:[]};sessions.set(id,session);}
 const root=el('section',{class:'solver-module'});container.append(root);let job=null,timer=null,disposed=false,progress=null;
 const button=(text,onclick)=>el('button',{class:'button',onclick},text);
 function currentSnapshot(p){return {schemaVersion:p.schemaVersion,contractVersion:p.contractVersion,projectId:p.id,revision:p.revision,scope:structuredClone(p.scope),data:structuredClone(p.data),selection:structuredClone(p.selection)};}
 function render(){if(disposed)return;const p=context.store.read();root.replaceChildren(el('h2',{},'精确CIB检验与逐项解释'),el('p',{},'只检验给定矩阵下内部一致性，不表示发生概率、减排效果或动态预测。刷新不恢复本会话结果，请下载JSON归档。'));
  const year=el('select',{'aria-label':'检算年份',disabled:!!job,onchange:e=>{session.year=e.target.value;render();}},el('option',{value:''},'请明确选择年份'),...p.scope.years.map(y=>el('option',{value:y},y)));year.value=session.year;root.append(el('label',{},'检算年份',year));
  const controls=el('details',{open:true},el('summary',{},'逐方向明确选用记录（不继承其他模块选择）'));
  const descriptorName=id=>p.data.descriptors.find(d=>d.id===id)?.label||id;
  for(const a of p.selection.descriptorIds)for(const b of p.selection.descriptorIds){if(a===b)continue;const records=p.data.judgments.filter(j=>j.sourceDescriptorId===a&&j.targetDescriptorId===b),select=el('select',{'aria-label':'检算选用 '+a+' → '+b,disabled:!!job,onchange:e=>{session.selected=session.selected.filter(id=>!records.some(r=>r.id===id));if(e.target.value)session.selected.push(e.target.value);render();}},el('option',{value:''},'未选用'),...records.map(j=>el('option',{value:j.id},j.id+' · v'+j.version+' · '+(j.scope?.regionId||'地区未知')+' · '+(j.validYears||[]).join('/'))));select.value=records.find(r=>session.selected.includes(r.id))?.id||'';controls.append(el('label',{},descriptorName(a)+' → '+descriptorName(b),select));}
  root.append(controls);
  const clear=button('清空本页选用与确认',()=>{session.selected=[];session.assumptions=false;session.unknown=false;render();});clear.disabled=!!job;root.append(clear);
  root.append(el('div',{},button('核对项目范围',()=>context.navigate('workspace')),button('核对描述符与锁定',()=>context.navigate('elements')),button('核对关系与矩阵',()=>context.navigate('relationships'))));
  const check=(label,value,onchange)=>{const input=el('input',{type:'checkbox','aria-label':label,disabled:!!job,onchange:e=>{onchange(e.target.checked);render();}});input.checked=value;return el('label',{class:'solver-check'},input,label);};
  root.append(check('按当前草案、依据不足及量表假设检算',session.assumptions,v=>{session.assumptions=v;}),check('未声明的状态年份或地区作为当前截面假设',session.unknown,v=>{session.unknown=v;}));
  const pre=prepareRun(p,{year:session.year===''?null:Number(session.year),selectedJudgmentIds:session.selected,assumptionAcknowledgements:{currentAssumptions:session.assumptions,unknownStateScope:session.unknown}});
  root.append(el('p',{'data-solver-space':''},'精确空间：'+(pre.space?pre.space.constrained+'（无约束 '+pre.space.unconstrained+'），上限 '+pre.space.limit:'尚不能确定')),
    el('section',{class:'solver-diagnostics'},el('h3',{},'输入诊断与假设'),el('ul',{},...pre.diagnostics.map(d=>el('li',{},d.classification+' · '+d.code+'：'+d.message)))));
  const start=button('冻结输入并精确检算',()=>startRun(p,pre));start.disabled=!!job;root.append(start);
  if(job)root.append(button('取消检算',()=>{job.cancel();}),el('p',{'data-solver-progress':''},'枚举中：已检查 '+(progress?.result.checked||0)+'；局部发现 '+(progress?.found||0)+'，尚未完成，不报告全空间成立数。'),el('p',{},'离开本模块或切换视角会取消正在进行的检算；已完成的结果和冻结输入保留在本会话。'));
  const last=session.archives.at(-1);if(last)renderArchive(last);summaryChanged();
 }
 function startRun(p,pre){
  const envelope={archiveVersion:1,RunInput:pre.input?structuredClone(pre.input):null,RunResult:null,projectInputSnapshot:currentSnapshot(p),preflightDiagnostics:structuredClone(pre.diagnostics),assumptionAcknowledgements:{currentAssumptions:session.assumptions,unknownStateScope:session.unknown},selectionOfJudgments:session.selected.map(id=>{const j=p.data.judgments.find(j=>j.id===id);return {id,version:j?.version??null,evidenceRefs:structuredClone(j?.evidenceRefs||[])};})};
  session.archives.push(envelope);progress=null;session.progress=null;session.running=false;
  if(!pre.input){render();return;}
  job=createEnumeration(pre.input);session.running=true;const active=job,batch=Math.max(1,Math.min(250,Math.floor(20000/(pre.input.stateDefinitions.length*(pre.input.activeDescriptorIds.length-1)))));
  function tick(){if(disposed||job!==active)return;try{progress=active.step(batch);session.progress=progress;envelope.partialFound=progress.found;if(progress.done){envelope.RunResult=progress.result;session.running=false;job=null;timer=null;render();}else{root.querySelector('[data-solver-progress]').textContent='枚举中：已检查 '+progress.result.checked+'；局部发现 '+progress.found+'，尚未完成，不报告全空间成立数。';summaryChanged();timer=setTimeout(tick,0);}}catch(e){active.cancel();const stopped=active.step();envelope.RunResult={...stopped.result,status:'failed',count:null,diagnostics:[...stopped.result.diagnostics,{code:'ENGINE_FAILURE',message:e.message}]};session.running=false;job=null;timer=null;render();}}
  render();timer=setTimeout(tick,0);
 }
 function renderArchive(archive){
  const p=context.store.read(),snapshot=archive.projectInputSnapshot,result=archive.RunResult;
  const sameChoices=JSON.stringify(archive.selectionOfJudgments.map(j=>j.id).sort())===JSON.stringify([...session.selected].sort());
  const fresh=context.store.isCurrent(snapshot)&&sameChoices&&(!archive.RunInput||archive.RunInput.year===Number(session.year));root.append(el('h3',{},'会话归档（共'+session.archives.length+'份）'),el('p',{'data-solver-current':''},fresh?'当前科学输入；解释仅基于冻结快照':'输入已变化：旧归档已过期，保留原输入与解释'));
  if(!result){root.append(el('p',{'data-solver-result':''},job?'尚在检算，成立数未定':'阻断：未开始求解，成立数=null；不是0解'));}
  else root.append(el('p',{'data-solver-result':''},result.status+' · 已检查 '+result.checked+' · 成立数 '+(result.count===null?'null（未完成）':result.count)+' · 展示 '+result.scenarios.length+(result.truncated?(result.status==='completed'?'（列表截断，计数完整）':'（局部列表截断；全空间未完成）'):'')),el('ul',{},...result.diagnostics.map(d=>el('li',{},d.code+'：'+d.message))));
  const exportButton=button('下载检算JSON归档',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(archive,null,2)],{type:'application/json'})),a=el('a',{href:url,download:'cib-archive.json'});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});exportButton.disabled=!!job;root.append(exportButton);
  root.append(el('details',{},el('summary',{},'本归档选用、版本、依据及完整诊断'),el('pre',{},JSON.stringify({selectionOfJudgments:archive.selectionOfJudgments,assumptionAcknowledgements:archive.assumptionAcknowledgements,preflightDiagnostics:archive.preflightDiagnostics},null,2))));
  if(session.archives.length>1){const choose=el('select',{'aria-label':'查看旧归档',onchange:e=>{const i=Number(e.target.value);if(i!==session.archives.length-1){const selected=session.archives.splice(i,1)[0];session.archives.push(selected);render();}}},...session.archives.map((_,i)=>el('option',{value:i},'归档 '+(i+1))));choose.value=session.archives.length-1;choose.disabled=!!job;root.append(choose);}
  if(!archive.RunInput)return;
  root.append(el('p',{},'冻结年份 '+archive.RunInput.year+'，地区 '+archive.RunInput.scope.regionId+'；锁定 '+(archive.RunInput.lockedStateIds.join('、')||'无')+'；'+engineVersion));
  if(result?.status==='failed')root.append(el('p',{},'未完成；局部发现 '+(archive.partialFound||0)+'，不能作为全空间结论。'));
  if(result?.scenarios.length)root.append(...result.scenarios.map((config,i)=>el('div',{},button('解释成立配置 '+(i+1),()=>{archive.inspection=structuredClone(config);render();}),Object.entries(config).map(([id,s])=>id+'='+s).join('，'))));
  archive.inspection ||= Object.fromEntries(archive.RunInput.activeDescriptorIds.map(id=>[id,archive.RunInput.matrix.stateIdsByDescriptor[id][0]]));
  const controls=el('div',{class:'solver-config'},el('h3',{},'检查自己的配置（允许不自洽）'));
  const name=stateId=>snapshot.data.states.find(s=>s.id===stateId)?.label||stateId;
  for(const id of archive.RunInput.activeDescriptorIds){const select=el('select',{'aria-label':'检查配置 '+id,onchange:e=>{archive.inspection[id]=e.target.value;render();}},...archive.RunInput.matrix.stateIdsByDescriptor[id].map(s=>el('option',{value:s},name(s))));select.value=archive.inspection[id];controls.append(el('label',{},snapshot.data.descriptors.find(d=>d.id===id)?.label||id,select));}
  root.append(controls);
  const trace=explain(archive.RunInput,archive.inspection);root.append(el('p',{'data-solver-inspection':''},trace.consistent?'该配置自洽（允许并列最大）':'该配置存在冲突：'+trace.conflicts.join('、')));if(trace.violatesLocks)root.append(el('p',{},'此手动配置不满足锁定，仅作独立解释，不计枚举结果。'));
  for(const b of trace.balances){root.append(el('h3',{},(snapshot.data.descriptors.find(d=>d.id===b.descriptorId)?.label||b.descriptorId)+'：所选支持 '+b.selectedSupport+'；最大 '+b.maximum+'；差距 '+b.gap),el('ul',{},...b.candidates.map(c=>el('li',{},name(c.stateId)+'：'+c.contributions.map(x=>name(x.sourceStateId)+' 的 '+x.score+' ['+x.judgmentId+']').join(' + ')+' = '+c.support))));}
  if(p.view.perspective==='expert')root.append(el('details',{},el('summary',{},'公式与冻结RunInput'),el('p',{},'I_j(l|s)=Σ_(i≠j) C_ij(s_i,l)，对每个j，所选支持≥所有候选支持。Weimer-Jehle2009 PDF p3 Eq1、p6 Eq8。'),el('pre',{},JSON.stringify(archive.RunInput,null,2))));
 }
 const unsubscribe=context.store.subscribe(render);render();
 return {canLeave(){if(job){job.cancel();clearTimeout(timer);const final=job.step();session.archives.at(-1).RunResult=final.result;session.running=false;job=null;timer=null;summaryChanged();}return true;},dispose(){if(job){job.cancel();clearTimeout(timer);session.archives.at(-1).RunResult=job.step().result;session.running=false;job=null;summaryChanged();}disposed=true;clearTimeout(timer);unsubscribe();root.remove();}};
}
