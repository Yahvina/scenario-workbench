import {scaleWarning,a2Warning} from './curve.mjs';
import {curvePanel} from './curve-panel.mjs';
import { el, infoTip } from '../../core/ui.mjs';
import { variableColor } from '../../core/object-colors.mjs';
import { statesFor, draftFor, buildJudgmentChange, buildMatrix, directionCoverage, nextUngjudgedDirection } from './logic.mjs';
import {prepareMatrixHandoff,sendMatrixHandoff} from './handoff.mjs';
import {rowGuide} from './row-guide.mjs';
import {trendAtlas} from './trend-atlas.mjs';
import {panels} from './shape-catalog.mjs';
import {planAtYear} from '../elements/state-plan.mjs';
import {referencePlan, applyReference, referenceCoverage} from './reference.mjs';

// 第二步默认落在“已有评分”的年份上：否则用户会被带到没有数据的年份，看起来像全缺。
function preferredYear(project){
 const years=project.scope.years||[];
 let best=years[0]??'',score=-1;
 for(const y of years){
  const ready=planAtYear(project,y).complete?10:0;
  const n=project.data.judgments.filter(j=>j.scope?.regionId===project.scope.regionId&&Array.isArray(j.validYears)&&j.validYears.includes(y)).length;
  const s=ready+n;
  if(s>score){score=s;best=y;}
 }
 return best;
}

export function mount(container, context) {
  const p0=context.store.read(), key='relationships-ui-v1:'+p0.id;
  let preferences={};
  try { preferences=JSON.parse(sessionStorage.getItem(key)||'{}'); } catch {}
  if(!preferences || typeof preferences!=='object' || Array.isArray(preferences))preferences={};
  let sourceId=preferences.sourceId||p0.selection.descriptorIds[0], targetId=preferences.targetId||p0.selection.descriptorIds[1], recordId=preferences.recordId||null;
  let tab=p0.view.objectId==='matrix'?'matrix':'input', year=preferences.year??preferredYear(p0), picked=Array.isArray(preferences.picked)?preferences.picked:[];
  let curveDirty=false;let original=null,draft=null,clean='',baseline=null,saving=false,disposed=false;
  let guideView='table',inputMode='graph',selectedTrend=null,encodingTemplate='',focusPair='';
  // 参考填入的最近一次操作事实（只放“当时填了多少”，其余缺口每次实时重算，避免陈旧提示）。
  let refReport=null, fillOrigin=null;
  const root=el('section',{class:'relationships-module'}), status=el('p',{class:'relationships-status',role:'status','aria-live':'polite'}), body=el('div');
  const button=(text,onclick,primary=false)=>el('button',{class:'button'+(primary?' primary-action':''),onclick},text);
  const stepsEl=el('div',{class:'rel-steps','aria-label':'关系判断步骤'});
  root.append(el('h2',{},'判断两个因素如何相互影响'),status,
    el('div',{class:'relationships-tabs'},button('1 · 判断关系',()=>changeTab('input')),button('2 · 检查评分完整性',()=>changeTab('matrix'))),body);
  container.append(root);
  function remember() {
    try { sessionStorage.setItem(key,JSON.stringify({sourceId,targetId,recordId,tab,year,picked})); }
    catch { status.textContent='查看选项未能保留，刷新后请重新选择；已保存判断不受此提示影响。'; }
  }
  function dirty() { return curveDirty || !!draft && (JSON.stringify(draft)!==clean || [...body.querySelectorAll('input')].some(input=>input.validity.badInput)); }
  function canLeave() {
    if(blockIncomplete())return false;
    if(dirty()) {status.textContent='有未保存草稿，请先保存或取消，再切换方向、记录、页签、页面或视角。';return false;}
    return true;
  }
  function load() {
    curveDirty=false;
    const p=context.store.read(), active=p.selection.descriptorIds;
    if(!active.includes(sourceId)) sourceId=active[0];
    if(!active.includes(targetId)||targetId===sourceId) targetId=active.find(id=>id!==sourceId);
    // 一个方向只有一条记录时默认打开它来改，避免“改分数”变成“又建一条候选”。
    if(!recordId){
      const same=p.data.judgments.filter(j=>j.sourceDescriptorId===sourceId&&j.targetDescriptorId===targetId);
      if(same.length===1)recordId=same[0].id;
    }
    original=p.data.judgments.find(j=>j.id===recordId&&j.sourceDescriptorId===sourceId&&j.targetDescriptorId===targetId)||null;
    recordId=original?.id||null;
    draft=sourceId&&targetId?draftFor(p,sourceId,targetId,original):null;
    // 适用范围默认取当前研究范围（地区与项目年份）；用户想改再改。只在两栏为空时预填。
    if(draft){
      if(!String(draft.region||'').trim()&&p.scope.regionId)draft.region=p.scope.regionId;
      if(!String(draft.years||'').trim()&&p.scope.years.length)draft.years=p.scope.years.join(', ');
    }
    clean=JSON.stringify(draft);baseline=context.store.snapshot();
    picked=[...new Set(picked)].filter(id=>p.data.judgments.some(j=>j.id===id));
  }
  function incompleteScore() { return [...body.querySelectorAll('input')].find(input=>input.validity.badInput)||null; }
  // 只输负号等未完成的评分，浏览器的 value 读出来是空串，重绘后就与「未判断」无法区分。
  // 因此任何会重绘的切换都必须先在这里拦住，并把焦点放回那一格。
  function blockIncomplete() {
    const input=incompleteScore();
    if(!input)return false;
    status.textContent='这一格的评分还没输入完成：请补成 −3 至 +3 的整数，或清空该格，再切换显示方式或页签。未完成的输入既不是 0，也不是未判断。';
    input.focus();
    return true;
  }
  function changeTab(value) {if(blockIncomplete()||!canLeave())return;tab=value;remember();render();}
  function switchPair(a,b) {if(!canLeave())return;sourceId=a;targetId=b;recordId=null;selectedTrend=null;encodingTemplate='';load();remember();render();}
  function save() {
    try {
      if([...body.querySelectorAll('input')].some(input=>input.validity.badInput)) throw new Error('评分或年份输入不完整，请输入有效整数');
      if(!context.store.isCurrent(baseline)) throw new Error('项目科学输入已变化，请取消草稿后重新载入，避免覆盖');
      const next=buildJudgmentChange(context.store.read(),sourceId,targetId,original,draft,()=>crypto.randomUUID());
      const id=original?.id||next.data.judgments.at(-1)?.id;
      saving=true;const result=context.actions.replaceProject(next);saving=false;
      if(!result.ok)throw new Error(result.error.message+'；'+result.error.recoveryAction);
      recordId=id;
      // 保存这一对就是用户的明确决定：这个方向只有一份记录时直接选用进矩阵，
      // 不再让用户在完整性检查页重复点一次「采用」。
      // 有多份候选时不自动选，避免悄悄替用户挑一条。
      const afterSave=context.store.read();
      const sameDir=afterSave.data.judgments.filter(j=>j.sourceDescriptorId===sourceId&&j.targetDescriptorId===targetId);
      if(sameDir.length===1)picked=[...new Set([...picked,id])];
      remember();
      const saved=context.store.read(),adv=nextUngjudgedDirection(saved);
      const cov=directionCoverage(saved);
      if(fillOrigin==='completeness'){
        fillOrigin=null;tab='matrix';load();remember();render();
        status.textContent=(context.persistenceState().ok?'已保存这个方向的评分，回到完整性检查。':'已更新到当前页面，但浏览器保存失败；请先下载备份。')+' 还剩 '+cov.missing.length+' 个方向没判。';
        return;
      }
      if(adv&&!(adv.source===sourceId&&adv.target===targetId)){
        sourceId=adv.source;targetId=adv.target;recordId=null;
        load();remember();render();
        status.textContent=(context.persistenceState().ok?'判断草稿已保存，修改依据可追踪；不代表专家确认。':'判断已更新到当前页面，但浏览器保存失败；请到项目页下载备份后再离开或刷新。')+' 已切到下一未判方向（还剩 '+cov.missing.length+' 个方向）。';
      }else{
        load();remember();render();
        status.textContent=(context.persistenceState().ok?'判断草稿已保存，修改依据可追踪；不代表专家确认。':'判断已更新到当前页面，但浏览器保存失败；请到项目页下载备份后再离开或刷新。')+(adv?'':' '+cov.need+' 个方向已全部有判断记录。');
      }
    } catch(error) {saving=false;status.textContent='保存失败：'+error.message;}
  }
  function cancel() {load();render();status.textContent='已取消未保存草稿。';}
  function variableLabel(p,id) {return p.data.descriptors.find(d=>d.id===id)?.label||id;}
  // v5 步骤条：只读界面状态（方向、趋势、评分、保存），不参与任何判定。
  // 步骤条挂在 body 内，又被 MutationObserver 观察：必须用签名收敛，
  // 否则 replaceChildren → observer → paintSteps 会形成无限微任务循环。
  let stepsSignature='';
  function paintSteps(p){
    const filled=draft?draft.entries.filter(e=>String(e.value).trim()!==''&&Number.isInteger(Number(e.value))&&Math.abs(Number(e.value))<=3).length:0;
    const trendPicked=!!(selectedTrend||body.querySelector('.curve-panel [data-template-id][aria-pressed="true"]')||body.querySelector('.trend-card[aria-pressed="true"]'));
    const previewed=!!body.querySelector('.curve-panel [data-filled="1"]');
    const steps=[['定方向',!!(sourceId&&targetId&&sourceId!==targetId)],['看图选趋势',trendPicked],['填写评分',filled>0||previewed],['保存草稿',!dirty()&&!!recordId]];
    const cur=steps.findIndex(([,done])=>!done);
    const signature=steps.map(([label,done])=>label+(done?'1':'0')).join('|')+':'+cur;
    if(signature===stepsSignature)return;
    stepsSignature=signature;
    stepsEl.replaceChildren(...steps.map(([label,done],index)=>{
      const k=index+1,isCur=index===cur;
      return el('span',{class:'rs'+(done?' done':isCur?' cur':'')},el('span',{class:'n'},done?'✓':String(k)),label);
    }));
  }
  // v5 方向条：源 A → 目标 B 一眼可读；select 沿用原 aria 标签与切换守卫。
  function pairBar(p,source,target){
    const ids=p.selection.descriptorIds;
    const src=source||el('select',{'aria-label':'影响方 A'},el('option',{value:''},ids.length?'— 选影响方 —':'— 先去选择因素 —'),...ids.map(id=>el('option',{value:id},variableLabel(p,id))));
    const tgt=target||el('select',{'aria-label':'被影响方 B'},el('option',{value:''},'— 选被影响方 —'));
    if(!source)src.value='';if(!target)tgt.value='';
    const sn=sourceId?statesFor(p,sourceId).length:0,tn=targetId?statesFor(p,targetId).length:0;
    const pairOk=sn===2&&tn===2&&sourceId!==targetId;
    const [stText,stCls]=!sourceId||!targetId?['','']:sourceId===targetId?['同一因素 · 请更换','warn']:pairOk?['完整二档 · 可生成四格预览','ok']:['多档因素 · 请逐格评分',''];
    return el('div',{class:'rel-pairbar'},
      el('span',{class:'cap'},'正在判断'),
      el('div',{class:'rel-factor'+(sourceId&&source?'':' empty')},el('span',{class:'role'},'影响方 A（谁影响谁）'),src),
      el('span',{class:'rel-arrow',role:'img','aria-label':'影响方向从 A 到 B'},'→'),
      el('div',{class:'rel-factor'+(targetId&&target?'':' empty')},el('span',{class:'role'},'被影响方 B（谁被影响）'),tgt),
      el('button',{class:'rel-swap',onclick:()=>{if(!canLeave())return;switchPair(targetId,sourceId);}},'交换方向'),
      el('span',{class:'rel-pstate '+stCls},stText),
      el('span',{class:'rel-pstate',title:'A→B 与 B→A 独立计数；保存后自动切到下一个未判方向'},'已判方向 '+directionCoverage(p).covered+' / '+directionCoverage(p).need));
  }
  // 图册卡：趋势参考常驻（v5 ② 区），标题与出处折叠收纳。
  function atlasCard(p,graphEligible){
    // 点一张图就出分（仅完整二档）；不适用时给出原因和下一步，不再点了没反应。
    // 同一个形状有强弱两种线型时，图册会把选中的那一种一起传过来。
    const encodeShape=(panelId,templateId)=>{
      if(!canLeave())return;
      const panel=panels().find(x=>x.id===panelId);
      const template=templateId
        ? panel?.templates.find(t=>t.id===templateId&&t.encodingEnabled)
        : panel?.templates.find(t=>t.encodingEnabled);
      if(!panel||!template){status.textContent='这张图不能自动生成评分，请在右侧逐格判断。';return;}
      recordId=null;inputMode='graph';encodingTemplate=template.id;load();remember();render();
      const strength=template.lineChoices.length===1?(template.lineChoices[0]===1?'（较弱）':'（较强）'):'';
      status.textContent='已按「'+panel.label+'」'+strength+'生成四格评分预览；核对无误后保存。';
    };
    const atlas=trendAtlas({selected:selectedTrend,onSelect:(panel,template)=>{
      selectedTrend=panel.id;
      if(graphEligible){encodeShape(panel.id,template?.id);return;}
      const note=body.querySelector('.chosen-trend');
      const sn=statesFor(p,sourceId).length,tn=statesFor(p,targetId).length;
      if(note)note.textContent='趋势参考：'+panel.label+'。当前两个因素各有 '+sn+'、'+tn+' 档，论文图形只覆盖二档，不会自动出分；请在右侧逐格（或逐行）判断。';
    },onEncode:graphEligible?encodeShape:null});
    return el('section',{class:'rel-card rel-atlas-card'},atlas);
  }
  function evidenceView(p,record) {
    return el('details',{class:'relationships-evidence'},el('summary',{},'依据与修改记录'),
      el('p',{},'政策原文只能说明政策事实；方向与强度仍要你自己判断。'),
      !record?el('p',{},'新判断将作为用户假设草案保存。'):el('p',{},'来源：'+record.provenance.origin+'；版本：'+record.version+'；审核状态：'+(record.reviewStatus||'未知')),
      ...(record?.evidenceRefs||[]).map(id=>{
        const e=p.data.evidence.find(item=>item.id===id);
        if(!e)return el('p',{},'缺少依据：'+id);
        let history=null;try{if(e.kind==='user-assumption')history=JSON.parse(e.excerpt);}catch{}
        const describe=j=>j?j.entries.map(entry=>entry.sourceStateId+'→'+entry.targetStateId+'='+(entry.score===null?'未判断':entry.score)).join('；'):'新建判断';
        return el('article',{},el('strong',{},e.kind+' · '+e.sourceId),el('p',{},e.locator),
          history?.after?el('p',{},'修改前：'+describe(history.before)+' → 修改后：'+describe(history.after)):el('p',{},e.excerpt),
          history?.after?el('details',{},el('summary',{},'完整修改记录（含原始出处）'),el('pre',{},e.excerpt)):null);
      }));
  }
  // 参考评分：两个入口共用同一份计划与同一条写入规则。
  // 一次确认可以同时完成“保存判断 + 选用进矩阵”，失败时保留草稿并说明原因。
  function openReference(){
    const p=context.store.read();
    const yearNum=year===''?null:Number(year);
    if(yearNum===null){status.textContent='请先在第二步选好年份，再填入参考评分。';return;}
    const plan=referencePlan(p,{year:yearNum});
    const dialog=el('dialog',{class:'reference-dialog','aria-label':'参考评分预览'});
    const close=()=>dialog.close();
    const head=el('div',{class:'reference-hd'},el('h3',{},'参考评分预览'),el('button',{class:'button text',type:'button',onclick:close},'关闭'));
    const body=el('div',{class:'reference-body'});
    dialog.append(head,body);

    if(!plan.pack){
      body.append(
        el('p',{},'本次不会写入任何评分。可以改用完整的机制演示案例，那是唯一能完整算通的参考闭环。'),
        el('div',{class:'reference-actions'},
          el('button',{class:'button',type:'button',onclick:()=>{context.exportProject();}},'先下载当前项目备份'),
          el('button',{class:'button primary-action',type:'button',onclick:()=>{
            if(!confirm('切换会替换当前项目的名称、地区、年份、数据与选择；原项目不会自动保留。已下载备份吗？继续切换。'))return;
            close();context.loadDemo();status.textContent='已切换到机制演示案例；这是机制演示，不代表真实政策。';
          }},'切换到完整演示案例')));
      document.body.append(dialog);dialog.showModal();return;
    }

    const dirs=plan.matched;
    const keptNow=dirs.reduce((n,d)=>n+d.kept,0);
    const parts=[
      el('p',{class:'reference-tag'},'演示参考，可修改，非实时AI生成。'),
      el('table',{class:'v5-table reference-table'},el('thead',{},el('tr',{},el('th',{},'方向'),el('th',{},'分值'),el('th',{},'说明'))),
        el('tbody',{},...dirs.map(d=>el('tr',{},el('td',{},d.fromLabel+' → '+d.toLabel),el('td',{},d.score===null?(d.entries.length+' 格'):String(d.score)),el('td',{},d.why||plan.pack.note))))),
      el('details',{class:'reference-why'},el('summary',{},'这份参考是哪来的'),
        el('p',{},plan.pack.caseName+'（'+plan.pack.label+'）'),
        el('p',{},plan.pack.source),
        plan.pack.level==='descriptor'?el('p',{},'同一方向的所有状态对用同一个分值，没有区分状态；采用后可以逐格改。'):null),
      plan.skipped.length?el('p',{class:'reference-warn'},'以下方向没有填入：'+plan.skipped.map(x=>(x.from+'→'+x.to)+'（'+x.reason+'）').join('；')):null,
      
    ].filter(Boolean);
    body.append(...parts);

    const apply=async (overwrite,adopt)=>{
      try{
        const result=applyReference(context.store.read(),plan,{overwrite,newId:()=>crypto.randomUUID()});
        if(!result.filled){
          status.textContent='没有可填入的空白格：已有评分保持原样，也不会被你这次点击改动。';
          close();return;
        }
        const r=context.actions.replaceProject(result.next);
        if(!r.ok)throw new Error(r.error.message);
        if(adopt)picked=[...new Set([...picked,...result.ids])];
        refReport={packLabel:plan.pack.caseName+'（'+plan.pack.label+'）',filled:result.filled,directions:dirs.length,created:result.created,preserved:result.preserved,
          ids:result.ids,coverage:dirs.map(d=>d.from+'|'+d.to),year:plan.year,adopted:adopt,at:Date.now()};
        tab='matrix';remember();
        close();
        status.textContent='已填入 '+result.filled+' 格，涉及 '+dirs.length+' 个方向；'+(adopt?'已保存并选用 '+result.ids.length+' 条判断。':'已保存 '+result.ids.length+' 条判断，尚未选用。')+(context.persistenceState().ok?'':' 浏览器保存失败，草稿仍在内存里，请先下载备份。');
        render();
      }catch(error){status.textContent='参考评分未写入：'+error.message+'。当前草稿与已有评分保持不变。';}
    };
    const kept=dirs.reduce((n,d)=>n+d.kept,0);
    body.append(el('div',{class:'reference-actions'},
      el('button',{class:'button primary-action',type:'button',onclick:()=>apply(false,true)},'确认保存并使用这份评分'),
      el('button',{class:'button',type:'button',onclick:()=>apply(false,false)},'只保存，稍后选用'),
      (()=>{const b=el('button',{class:'button text',type:'button',onclick:()=>{
        if(!confirm('覆盖会改动已有评分（包括 0）。原值会写进修改记录，但当前判断将被替换。确认覆盖？'))return;
        apply(true,true);
      }},'覆盖已有评分…');b.disabled=!kept;return b;})(),
      el('button',{class:'button text',type:'button',onclick:close},'取消')));
    document.body.append(dialog);
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.showModal();
  }

  // 参考评分入口的适用范围：点开预览之前就能看到能覆盖几个方向；
  // 完全没有支持规则时不放无效按钮，改给“手动判断”与“体验完整示例”两条真实出路。
  function referenceEntry(kind){
    const p=context.store.read();
    const cov=referenceCoverage(p);
    if(cov.state==='ok'){
      return [button('一键填入参考评分',()=>{if(!canLeave())return;openReference();}),
        el('span',{class:'rel-ref-coverage',title:'按当前所选因素实时统计；机制示例/旧平台规则按因素身份命中'},'可覆盖 '+cov.matched+' / '+cov.total+' 个方向')];
    }
    if(cov.state==='need-factors')return [];
    return [button('手动判断这个方向',()=>{
      const cell=body.querySelector('.relationships-table input[type=number]');
      if(cell){cell.focus();cell.scrollIntoView({block:'center'});}
      else{const guide=body.querySelector('[data-guide-view="guide"]');if(guide)guide.click();}
      status.textContent='当前因素没有可用的参考规则：请逐格手动判断（0＝没关系，空白＝未判断）。';
    }),
    ].filter(Boolean);
  }
  function loadGuidedWithConfirm(){
    const p=context.store.read();
    const hasWork=p.data.judgments.length||p.selection.descriptorIds.length||p.data.paths.length;
    if(!canLeave())return;
    if(hasWork&&!confirm('体验完整示例会替换当前项目的因素、状态与评分（机制演示数据）。当前内容不会自动保留；需要保留请先到「保存与导出」存为命名方案。继续载入吗？'))return;
    context.loadGuidedDemo();
  }

  // 从问题卡直接进入某一方向：带上因素、方向、记录与年份，保存后可返回原任务。
  function fillDirection(a,b,id=null,origin='completeness'){
    if(!canLeave())return false;
    sourceId=a;targetId=b;recordId=id;selectedTrend=null;encodingTemplate='';inputMode='manual';
    fillOrigin=origin;tab='input';load();
    // 从问题卡进来时，按当前研究范围显式预填地区与年份（可改），避免用户填完 9 格却因“没写范围”又被挡住。
    const proj=context.store.read();
    if(draft&&!draft.region&&proj.scope.regionId)draft.region=proj.scope.regionId;
    if(draft&&!String(draft.years||'').trim()&&year!=='')draft.years=String(year);
    clean=JSON.stringify(draft);
    remember();render();
    const cell=body.querySelector('.relationships-table input[type=number]');if(cell){cell.focus();cell.scrollIntoView({block:'center'});}
    return true;
  }
  function backToCompleteness(){
    // 这个入口是“放弃当前草稿回检查页”，所以直接重载草稿，不再用 canLeave 拦住用户。
    fillOrigin=null;tab='matrix';load();remember();render();
    status.textContent='已返回完整性检查；这个方向未保存的修改已放弃。';
  }

  function render() {
    if(disposed)return;
    const p=context.store.read();body.replaceChildren();
    body.append(stepsEl);
    stepsEl.hidden=tab==='matrix';
    root.dataset.tab=tab;
    root.querySelector('.relationships-tabs').setAttribute('aria-label','关系工作页');
    root.querySelectorAll('.relationships-tabs button').forEach((button,index)=>button.setAttribute('aria-pressed',String(tab===(index===0?'input':'matrix'))));
    if(p.selection.descriptorIds.length<2) {
      const only=p.selection.descriptorIds[0];
      const zero=!p.selection.descriptorIds.length;
      // 0 因素与 1 因素是两个不同的缺口：分开说清，各给直达动作，不互相矛盾。
      body.append(pairBar(p,null,null),
        zero?button('去选择因素',()=>context.navigate('elements'))
            :button('再选一个因素',()=>context.navigate('elements')),
        atlasCard(p,false));
      paintSteps(p);return;
    }
    if(!p.scope.years.length||!p.scope.regionId)body.append(el('p',{class:'warning-text'},'开始检验前，请先补全项目地区和年份。'),button('返回项目范围设置',()=>context.navigate('workspace')));
    if(tab==='matrix'){renderMatrix(p);return;}
    renderInput(p);
  }
  function renderInput(p) {
    const source=el('select',{'aria-label':'影响方 A',onchange:e=>{if(!canLeave()){e.target.value=sourceId;return;}const id=e.target.value;switchPair(id,id===targetId?p.selection.descriptorIds.find(d=>d!==id):targetId);}},...p.selection.descriptorIds.map(id=>el('option',{value:id},variableLabel(p,id))));
    const target=el('select',{'aria-label':'被影响方 B',onchange:e=>{if(!canLeave()){e.target.value=targetId;return;}switchPair(sourceId,e.target.value);}},...p.selection.descriptorIds.filter(id=>id!==sourceId).map(id=>el('option',{value:id},variableLabel(p,id))));
    source.value=sourceId;target.value=targetId;
    if(fillOrigin){
      body.append(el('div',{class:'rel-return','data-rel-return':''},
        el('span',{},'正在补「'+variableLabel(p,sourceId)+' → '+variableLabel(p,targetId)+'」；保存后自动回到「检查评分完整性」。'),
        button('返回检查（不保存改动）',backToCompleteness)));
    }
    body.append(pairBar(p,source,target));
    const records=p.data.judgments.filter(j=>j.sourceDescriptorId===sourceId&&j.targetDescriptorId===targetId);
    const chooser=el('select',{'aria-label':'编辑判断记录',onchange:e=>{if(!canLeave()){e.target.value=recordId||'';return;}recordId=e.target.value||null;inputMode='manual';load();remember();render();}},el('option',{value:''},'新增这一个方向的判断'),...records.map(j=>el('option',{value:j.id},(p.view.perspective==='expert'?j.id:'判断 '+(records.indexOf(j)+1))+' · v'+j.version+' · '+(j.scope?.regionId||'地区未知')+' · '+(Array.isArray(j.validYears)&&j.validYears.length?j.validYears.join('/'):'年份未知/格式待核'))));
    chooser.value=recordId||'';
    body.append(el('details',{class:'rel-records'},el('summary',{},'已有的同方向判断'),el('label',{},'选择已有判断',chooser)));
    const graphEligible=statesFor(p,sourceId).length===2&&statesFor(p,targetId).length===2;
    body.append(el('div',{class:'relationship-modes'},
      graphEligible?button('看图判断',()=>{if(!canLeave())return;inputMode='graph';render();}):null,
      button('直接填写评分',()=>{if(!canLeave())return;inputMode='manual';render();}),
      ...referenceEntry('input')));
    if(graphEligible&&inputMode==='graph'&&!original){
      curvePanel(body,context,sourceId,targetId,()=>{curveDirty=true;},()=>{curveDirty=false;inputMode='manual';render();},savedId=>{recordId=savedId;curveDirty=false;inputMode='manual';const saved=context.store.read(),adv=nextUngjudgedDirection(saved),cov=directionCoverage(saved);if(adv&&!(adv.source===sourceId&&adv.target===targetId)){sourceId=adv.source;targetId=adv.target;recordId=null;load();remember();render();status.textContent='编码草案已保存；已切到下一未判方向（还剩 '+cov.missing.length+' 个）。';}else{load();render();status.textContent='编码草案已保存。'+(adv?'继续核对评分，或交换方向判断。':' '+cov.need+' 个方向已全部有判断记录。');}},encodingTemplate);
      return;
    }
    const manualStart=body.children.length;
    function showAtlas(){
      const pieces=[...body.children].slice(manualStart),rail=el('section',{class:'relation-score-rail'},el('h3',{},'填写并核对评分'));
      const selectionNote=el('p',{class:'chosen-trend',role:'status'});rail.append(selectionNote,...pieces);
      body.append(el('div',{class:'relation-atlas-layout'},atlasCard(p,graphEligible),rail));
    }
    if(original?.curveEncoding){body.append(el('p',{class:'warning-text'},scaleWarning));if(original.curveEncoding.templateId==='A(2)')body.append(el('p',{class:'warning-text'},a2Warning));}
    const sources=statesFor(p,sourceId),targets=statesFor(p,targetId);
    if(!sources.length||!targets.length){body.append(el('p',{class:'warning-text'},'变量缺少状态定义，不能生成状态对；请回描述符页核对已有定义。'),button('返回描述符选择',()=>context.navigate('elements')));showAtlas();return;}
    const region=el('input',{'aria-label':'判断适用地区',value:draft.region,placeholder:'',oninput:e=>{draft.region=e.target.value;}});
    const years=el('input',{'aria-label':'判断适用年份',value:draft.years,placeholder:'',oninput:e=>{draft.years=e.target.value;}});
    const directness=el('select',{'aria-label':'直接性说明',onchange:e=>{draft.directness=e.target.value;}},el('option',{value:'unknown'},'待定'),el('option',{value:'direct'},'直接影响'),el('option',{value:'indirect'},'间接影响'));
    directness.value=draft.directness;
    // 一句话说清分数含义；适用范围已按研究范围默认填好，只在这条评分需要例外时才动。
    body.append(      el('div',{class:'relationships-controls'},el('label',{},'判断适用地区',region),el('label',{},'判断适用年份',years),el('label',{},'直接性说明',directness)));
    // H3：只有源与目标各有三个状态时，才提供可选的「逐行判断」视图。
    // 两种视图共用同一个 draft 对象，切换只重建界面，不清空判断、来源或理由。
    const hasTernaryGuide=sources.length===3&&targets.length===3;
    const counter=el('p',{'data-coverage-draft':'',class:'muted'});
    function count(){counter.textContent='已填 '+draft.entries.filter(e=>String(e.value).trim()!==''&&Number.isInteger(Number(e.value))&&Math.abs(Number(e.value))<=3).length+' / '+draft.entries.length+' 格';}
    function draftChanged(){count();status.textContent='草稿未保存。';}
    if(hasTernaryGuide){
      const toggle=el('div',{class:'relationships-guide-toggle',role:'group','aria-label':'三档判断显示方式'});
      for(const mode of [{id:'table',label:'直接填表'},{id:'guide',label:'逐行判断'}]){
        const active=guideView===mode.id;
        toggle.append(el('button',{class:'button','data-guide-view':mode.id,'aria-pressed':String(active),onclick:()=>{if(active)return;if(blockIncomplete())return;guideView=mode.id;render();}},mode.label));
      }
      body.append(toggle);
    }
    if(hasTernaryGuide&&guideView==='guide'){
      const guide=rowGuide({draft,sources,targets,sourceLabel:variableLabel(p,sourceId),targetLabel:variableLabel(p,targetId),expert:p.view.perspective==='expert',onChange:draftChanged});
      body.append(guide.root,counter);
    }else{
    const table=el('table',{class:'relationships-table'},el('caption',{},'点格子选分或直接输入；0＝没关系，空白＝未判断。'));
    // 点格子选分：分数条放在表格下方，不遮挡其它格子，键盘输入照旧可用。
    let activeInput=null,activeEntry=null,activePaint=null;
    const dock=el('div',{class:'score-dock','data-score-dock':'',hidden:''},
      el('div',{class:'score-dock-chips'},
        ...[-3,-2,-1,0,1,2,3].map(v=>el('button',{type:'button',class:'score-chip','data-pick':String(v),'aria-label':(v===0?'0 没关系':'分数 '+v),onclick:()=>applyPick(v)},v===0?'0':(v>0?'+'+v:String(v)))),
        el('button',{type:'button',class:'score-chip clear','data-pick':'','aria-label':'清除这一格的评分',onclick:()=>applyPick('')},'清除')));
    function activateCell(input,entry,paint,a,b){activeInput=input;activeEntry=entry;activePaint=paint;dock.hidden=false;}
    function applyPick(value){if(!activeInput)return;activeInput.value=value===''?'':String(value);activeEntry.value=activeInput.value;activePaint();draftChanged();}
    const header=el('tr',{},el('th',{scope:'col'},'源状态 ↓ / 目标状态 →'),...targets.map(state=>el('th',{scope:'col'},state.label)));
    table.append(el('thead',{},header));const rows=el('tbody');
    sources.forEach(a=>{
      const row=el('tr',{},el('th',{scope:'row'},a.label,p.view.perspective==='expert'?el('small',{},a.id):null));
      targets.forEach(b=>{
        const entry=draft.entries.find(e=>e.sourceStateId===a.id&&e.targetStateId===b.id);
        const input=el('input',{type:'number',min:'-3',max:'3',step:'1','aria-label':a.label+' → '+b.label,'data-source-state':a.id,'data-target-state':b.id,value:entry.value,placeholder:'点击选分'});
        const cell=el('td',{});
        function paint(){const raw=String(entry.value).trim(),n=Number(raw),valid=raw!==''&&Number.isInteger(n)&&Math.abs(n)<=3;cell.className=valid?'relationships-score':'relationships-missing';cell.style.background=valid?'var(--s'+n+')':'';input.setAttribute('aria-invalid',input.validity.badInput||raw!==''&&!valid?'true':'false');}
        input.addEventListener('input',e=>{entry.value=e.target.value;paint();draftChanged();});
        // 点格子 → 下方分数条可点 −3…+3 或清除；格子内仍然可以键盘输入。
        input.addEventListener('focus',()=>{cell.classList.add('is-active');activateCell(input,entry,paint,a,b);});
        input.addEventListener('blur',()=>{cell.classList.remove('is-active');});
        cell.append(input);paint();row.append(cell);
      });rows.append(row);
    });
    table.append(rows);body.append(el('div',{class:'relationships-scroll',tabindex:'0','aria-label':'状态对评分表，窄屏可横向滚动'},table),dock,counter);
    }
    count();
    const rationale=el('textarea',{'aria-label':'判断理由',rows:'3',oninput:e=>{draft.rationale=e.target.value;}});rationale.value=draft.rationale;
    body.append(el('label',{},'判断理由',rationale));
    const refs=el('details',{},el('summary',{},'引用已有依据'));
    for(const e of p.data.evidence){
      const checkbox=el('input',{type:'checkbox','data-evidence-id':e.id,onchange:event=>{draft.evidenceRefs=event.target.checked?[...new Set([...draft.evidenceRefs,e.id])]:draft.evidenceRefs.filter(id=>id!==e.id);}});checkbox.checked=draft.evidenceRefs.includes(e.id);
      refs.append(el('label',{class:'relationships-reference'},checkbox,e.kind+' · '+e.sourceId+' · '+e.locator));
    }
    if(!p.data.evidence.length)refs.append(el('p',{},'暂无已有依据，保存时会新增用户假设修改记录。'));
    body.append(refs,el('div',{class:'relationships-save'},button('取消草稿',cancel),button('保存这一对的评分',save,true)),evidenceView(p,original));
    showAtlas();
    paintSteps(p);
  }
  // 关系页第二步：先回答“还差什么、能不能去检验”，再给矩阵和诊断。
  // 默认不铺开所有方向与整张矩阵：摘要 + 分组问题 + 一个主按钮。
  function recordApplies(j,p,y){
    if(!j.scope?.regionId||j.scope.regionId!==p.scope.regionId)return false;
    if(!Array.isArray(j.validYears)||!j.validYears.length)return false;
    if(j.validYears.some(n=>!Number.isInteger(n)||n<1900||n>2300))return false;
    return j.validYears.includes(y);
  }
  function directionList(p,y){
    const ids=p.selection.descriptorIds,out=[];
    for(const a of ids)for(const b of ids){
      if(a===b)continue;
      const records=p.data.judgments.filter(j=>j.sourceDescriptorId===a&&j.targetDescriptorId===b);
      const applicable=records.filter(j=>recordApplies(j,p,y));
      const selected=records.filter(j=>picked.includes(j.id));
      // 用户点过选用就用那条；没点过但只有一条适用记录时，视同已采用（没有别的选择）。
      const chosen=selected.length===1?(applicable.find(j=>j.id===selected[0].id)||null)
        :(applicable.length===1?applicable[0]:null);
      out.push({a,b,records,applicable,selected,chosen,cells:statesFor(p,a).length*statesFor(p,b).length});
    }
    return out;
  }
  // 评分矩阵区块：齐全与不齐全两条路径共用，避免只在一处出现。
  function matrixBox(p,snapshot,required,judged){
    const states=snapshot.descriptorIds.flatMap(id=>statesFor(p,id));
    const table=el('table',{class:'relationships-table relationships-matrix'},el('caption',{},'行影响列 · '+snapshot.year+' · 同变量块不适用，不计覆盖'));
    table.append(el('thead',{},el('tr',{},el('th',{scope:'col'},'源 ↓ / 目标 →'),...states.map(st=>el('th',{scope:'col'},variableLabel(p,st.descriptorId)+' / '+st.label)))));
    const rows=el('tbody');
    for(const a of states){const row=el('tr',{},el('th',{scope:'row'},variableLabel(p,a.descriptorId)+' / '+a.label));
      for(const b of states){
        if(a.descriptorId===b.descriptorId)row.append(el('td',{class:'relationships-na'},'不适用'));
        else{const e=snapshot.entries.find(x=>x.sourceStateId===a.id&&x.targetStateId===b.id),value=e?.score??null;
          row.append(el('td',{class:value===null?'relationships-missing':'relationships-score',style:value===null?'':'background:var(--s'+value+')','data-matrix-source':a.id,'data-matrix-target':b.id,'data-score':value===null?'null':value},value===null?'未判断':value===0?'0 · 没关系':value>0?'+'+value:value));}
      }rows.append(row);}
    table.append(rows);
    return el('details',{class:'rev-matrix',...(judged>0?{open:''}:{})},el('summary',{},'评分矩阵（已判 '+judged+' / '+required+' 格）'),
      el('div',{class:'relationships-scroll',tabindex:'0','aria-label':'准备矩阵，窄屏可横向滚动'},table),
      el('p',{'data-matrix-coverage':'',class:'muted'},'0＝没关系；空白＝未判断。覆盖统计不是证据质量，也不代表方向与强度依据已验证。'),
      p.view.perspective==='expert'?el('details',{},el('summary',{},'MatrixSnapshot（输入准备，非求解结果）'),el('pre',{},JSON.stringify(snapshot,null,2))):null);
  }
  function renderMatrix(p){
    const y=year===''?null:Number(year);
    const yearSelect=el('select',{'aria-label':'矩阵年份',onchange:e=>{year=e.target.value;remember();render();}},el('option',{value:''},'请先选年份'),...p.scope.years.map(v=>el('option',{value:v},v)));
    if(!p.scope.years.includes(Number(year)))year='';yearSelect.value=year;

    const rawDirs=y?directionList(p,y):[];
    const filledCells=(dir,record)=>{
      if(!record)return 0;
      return (record.entries||[]).filter(e=>Number.isInteger(e.score)&&Math.abs(e.score)<=3
        && statesFor(p,dir.a).some(st=>st.id===e.sourceStateId)
        && statesFor(p,dir.b).some(st=>st.id===e.targetStateId)).length;
    };
    const dirs=rawDirs.map(dir=>{
      const best=dir.chosen||dir.applicable[0]||null;
      const filled=best?Math.min(filledCells(dir,best),dir.cells):0;
      return {...dir,best,filled};
    });
    const built=buildMatrix(p,{year:y,selectedJudgmentIds:picked});
    const snapshot=built.snapshot,diagnostics=built.diagnostics;
    const required=dirs.reduce((sum,d)=>sum+d.cells,0);
    const missing=dirs.reduce((sum,d)=>sum+(d.cells-d.filled),0);
    const doneDirs=dirs.filter(d=>d.filled===d.cells&&d.applicable.length<=1);
    const incompleteDirs=dirs.filter(d=>d.filled<d.cells);
    const conflictDirs=dirs.filter(d=>d.applicable.length>1&&!d.chosen);
    // 只有一条适用记录的方向不存在“选哪条”的问题，早就当已采用处理了。
    const unadopted=[];
    const judged=required-missing;

    // 适用范围不匹配的记录：按“缺什么、影响哪一步、怎么解决”分成四类，每类给直达动作。
    const scopeIssues=[];
    for(const d of dirs)for(const j of d.records){
      if(d.selected.includes(j.id))continue;
      let kind='',detail='';
      if(!p.scope.regionId||!p.scope.years.length){kind='project';detail='项目还没设置研究地区或年份';}
      else if(!j.scope?.regionId){kind='record-missing';detail='这条判断没写适用地区';}
      else if(j.scope.regionId!==p.scope.regionId){kind='record-mismatch';detail='适用地区是「'+j.scope.regionId+'」，项目是「'+p.scope.regionId+'」';}
      else if(!Array.isArray(j.validYears)||!j.validYears.length){kind='record-missing';detail='这条判断没写适用年份';}
      else if(j.validYears.some(n=>!Number.isInteger(n)||n<1900||n>2300)){kind='record-missing';detail='适用年份格式无效：'+j.validYears.join('/');}
      else if(!j.validYears.includes(y)){kind='record-mismatch';detail='适用年份是 '+j.validYears.join('/')+'，本次检验 '+y;}
      if(kind)scopeIssues.push({direction:d,record:j,kind,detail});
    }
    const byKind=k=>scopeIssues.filter(x=>x.kind===k);
    // 状态定义本身没有声明适用年份/地区：只能如实列出，由用户确认或补定义，平台不改写。
    const unknownStates=[];
    for(const id of p.selection.descriptorIds)for(const st of statesFor(p,id)){
      const noYears=!Array.isArray(st.validYears)||!st.validYears.length;
      const noRegion=!st.scope?.regionId;
      if(noYears||noRegion)unknownStates.push({descriptorId:id,state:st,what:noYears&&noRegion?'年份与地区都未声明':noYears?'未声明年份':'未声明地区'});
    }
    const covered=new Set(refReport?.coverage||[]);
    const noRule=covered.size?dirs.filter(d=>!covered.has(d.a+'|'+d.b)&&d.filled<d.cells):[];

    body.append(el('div',{class:'rev-head'},
      el('h3',{},'检查评分完整性',infoTip('A→B 与 B→A 分开计数；格子按源状态×目标状态计数。','评分怎么算')),
      el('div',{class:'rev-scope'},el('span',{},'地区：'+(p.scope.regionId||'未指定')),el('label',{},'年份',yearSelect))));
    if(!y){
      body.append(el('p',{class:'rev-blocked'},'还不能检验：请先选研究年份。'),el('button',{class:'button',onclick:()=>context.navigate('workspace')},'去设置年份'));
      return;
    }
    if(!dirs.length){
      // 与第一步同口径：0 因素说“尚未选择”，1 因素说“再选一个”，不合并成一句技术诊断。
      const only=p.selection.descriptorIds[0];
      body.append(el('p',{class:'rev-blocked'},!p.selection.descriptorIds.length
        ?'还不能检验：尚未选择研究因素。'
        :'还不能检验：已选 1 个因素「'+variableLabel(p,only)+'」，再选至少 1 个因素才能形成方向。'),
        el('button',{class:'button',onclick:()=>context.navigate('elements')},p.selection.descriptorIds.length?'再选一个因素':'去选择因素'));
      return;
    }

    const canContinue=!!snapshot&&missing===0&&conflictDirs.length===0&&unadopted.length===0;
    const pendingReview=scopeIssues.length+unknownStates.length;

    // 方向清单：一眼看清哪些方向填了、哪些没填，点一下直接去填。
    // 方向一多，光看总数记不住是哪一对。
    const listRows=el('div',{class:'rev-dirlist-rows'});
    for(const d of dirs){
      const full=d.filled>=d.cells;
      const multi=d.applicable.length>1&&!d.chosen;
      let tag,cls;
      if(multi){tag='有 '+d.applicable.length+' 条记录，需选一条';cls='warn';}
      else if(full){tag='已填完 '+d.cells+'/'+d.cells;cls='ok';}
      else if(d.filled>0){tag='填了 '+d.filled+'/'+d.cells;cls='part';}
      else{tag='还没填';cls='none';}
      listRows.append(el('div',{class:'rev-dirlist-row '+cls},
        el('span',{class:'rev-dirlist-name'},variableLabel(p,d.a)+' → '+variableLabel(p,d.b)),
        el('span',{class:'rev-dirlist-tag'},tag),
        (full&&!multi)?null:button(full?'去选一条':'去填',()=>fillDirection(d.a,d.b,d.best?.id||null))));
    }
    body.append(el('section',{class:'rev-dirlist','data-rev-dirlist':''},
      el('h3',{},'方向清单（'+dirs.length+' 个方向）'),listRows));

    if(canContinue){
      // 评分齐全：一条紧凑状态，不再把“已填/已完成/已判/没有待处理”重复四遍。
      // 齐全≠全部已验证：适用范围待核与状态范围未声明仍要如实显示。
      const doneBar=el('div',{class:'rev-done','data-rev-done':''},
        el('strong',{},'评分已齐：'+dirs.length+' 个方向、'+required+' 格'),
        refReport?el('span',{class:'ref-tag'},'演示参考'):[],
        el('button',{class:'button text',type:'button',onclick:()=>{
          const box=body.querySelector('.rev-done-details');if(box){box.open=!box.open;box.scrollIntoView({block:'center'});}
        }},'查看评分与来源'),
        button('继续：检验方案',()=>{
          try{sendMatrixHandoff(context.store.read(),{year:y,selectedJudgmentIds:picked,adopted:true});context.navigate('solver');}
          catch(error){status.textContent='还不能进入检验：'+error.message;}
        },true));
      body.append(doneBar);
      const doneDetails=el('details',{class:'rev-done-details'},el('summary',{},'评分与来源（'+required+' 格）'));
      const srcLines=[];
      if(refReport)srcLines.push('参考来源：'+refReport.packLabel||'机制演示；填入 '+refReport.filled+' 格（'+refReport.directions+' 个方向）');
      for(const d of dirs){
        const rec=d.chosen||d.applicable[0];
        if(rec)srcLines.push(variableLabel(p,d.a)+'→'+variableLabel(p,d.b)+' · 依据：'+(rec.evidenceRefs?.join('；')||rec.source||'未登记')+' · 范围：'+(rec.scope?.regionId||'未写')+' / '+(rec.validYears?.join('/')||'未写'));
      }
      doneDetails.append(el('ul',{class:'rev-done-src'},...srcLines.map(t=>el('li',{},t))));
      body.append(doneDetails);
      if(pendingReview){
        const review=el('details',{class:'rev-review'},el('summary',{},'有 '+pendingReview+' 条评分对不上当前年份或地区（不影响检验，供你核对）'));
        for(const item of scopeIssues.slice(0,8))review.append(el('p',{},variableLabel(p,item.direction.a)+'→'+variableLabel(p,item.direction.b)+' · '+item.detail));
        if(unknownStates.length)review.append(el('p',{},'状态定义：'+unknownStates.slice(0,4).map(x=>variableLabel(p,x.descriptorId)+'「'+x.state.label+'」（'+x.what+'）').join('、')+(unknownStates.length>4?' 等 '+unknownStates.length+' 个':'')));
        body.append(review);
      }
      // 填了参考评分后，用户要看得到分数落在哪。齐全时也把矩阵摊开给出。
      if(snapshot)body.append(matrixBox(p,snapshot,required,judged));
      return;
    }

    body.append(el('div',{class:'rev-stats'},
      el('div',{},el('b',{},doneDirs.length+' / '+dirs.length),el('span',{},'影响方向已完成')),
      el('div',{},el('b',{},String(missing)),el('span',{},'还缺评分格（共 '+required+' 格）')),
      el('div',{},el('b',{},String(conflictDirs.length)),el('span',{},'方向存在多份候选')),
      el('p',{class:'rev-stats-note'},'已判 '+judged+' 格。')));

    // 参考填入后的回执：只在还有缺口时展开；齐全后上面那条紧凑状态已覆盖，不再重复。
    if(refReport&&!canContinue){
      const pendingSave=context.persistenceState().ok?0:refReport.ids.length;
      body.append(el('section',{class:'rev-refill','data-rev-refill':''},
        el('h4',{},'参考评分已填入：'+refReport.filled+' 格，涉及 '+refReport.directions+' 个方向；还缺 '+missing+' 格。'),
        el('p',{class:'rev-refill-sub'},refReport.adopted
          ? '这些判断已保存并选用进矩阵（'+refReport.ids.length+' 条）。下面只剩参考规则没有覆盖的方向。'
          : '这些判断已保存，但还没选用进矩阵；点下方「选用已判完的方向」即可。'),
        el('dl',{class:'rev-refill-facts'},
          el('div',{},el('dt',{},'待保存'),el('dd',{},pendingSave?pendingSave+' 条（浏览器保存失败，请下载备份）':'0（已写入项目）')),
          el('div',{},el('dt',{},'有多条评分待选'),el('dd',{},conflictDirs.length?String(conflictDirs.length):'0')),
          el('div',{},el('dt',{},'没有参考规则'),el('dd',{},noRule.length?noRule.length+' 个方向':'0')),
          el('div',{},el('dt',{},'对不上当前范围'),el('dd',{},scopeIssues.length?scopeIssues.length+' 条':'0')))));
    }

    // 主按钮区：不完整时才带说明，完整时主按钮已在上方紧凑状态里。
    const next=button('继续：检验方案',()=>{
      try{sendMatrixHandoff(context.store.read(),{year:y,selectedJudgmentIds:picked,adopted:true});context.navigate('solver');}
      catch(error){status.textContent='还不能进入检验：'+error.message;}
    },true);
    next.disabled=!canContinue;
    body.append(el('div',{class:'rev-next'},next,...referenceEntry('matrix')));

    // 问题按“要做的动作”合并；齐全时整个区块不出现（没有“没有待处理项”的空状态）。
    const issues=[];
    if(incompleteDirs.length)issues.push({key:'missing',title:'缺评分',count:incompleteDirs.length,
      detail:incompleteDirs.length+' 个方向还没判完，共缺 '+missing+' 格',
      list:incompleteDirs.slice(0,6).map(d=>variableLabel(p,d.a)+'→'+variableLabel(p,d.b)).join('、')+(incompleteDirs.length>6?' 等':''),
      action:'填写第一个方向',run:()=>{const d=incompleteDirs[0];if(!d)return;fillDirection(d.a,d.b,d.best?.id||null);}});
    if(conflictDirs.length)issues.push({key:'conflict',title:'记录有冲突',count:conflictDirs.length,
      detail:conflictDirs.length+' 个方向有多条评分，请选一条（不取平均）',
      list:conflictDirs.slice(0,6).map(d=>variableLabel(p,d.a)+'→'+variableLabel(p,d.b)).join('、'),
      action:'去选一条',run:()=>{focusPair=conflictDirs[0].a+'|'+conflictDirs[0].b;render();
        const box=body.querySelector('[data-rev-conflict]');if(box){box.scrollIntoView({block:'center'});box.querySelector('select')?.focus();}}});
    if(byKind('record-missing').length||byKind('record-mismatch').length||byKind('project').length)issues.push({key:'scope',title:'有些评分不属于这个年份或地区',count:scopeIssues.length,
      detail:scopeIssues.length+' 条评分对不上当前的年份或地区，下面列出来了',
      list:[...new Set(scopeIssues.slice(0,6).map(x=>x.direction.a===x.direction.b?'':variableLabel(p,x.direction.a)+'→'+variableLabel(p,x.direction.b)+' · '+x.detail))].join('；'),
      action:'逐条处理',run:()=>{const box=body.querySelector('[data-rev-scope-issues]');if(box){box.open=true;box.scrollIntoView({block:'center'});box.querySelector('button')?.focus();}}});

    if(issues.length){
      const issueBox=el('section',{class:'rev-issues'},el('h3',{},'还需要处理'));
      for(const item of issues){
        issueBox.append(el('div',{class:'rev-issue'},
          el('div',{class:'rev-issue-hd'},el('strong',{},item.title),el('span',{class:'rev-count'},String(item.count))),
          el('p',{},item.detail),el('p',{class:'rev-issue-list'},item.list),
          button(item.action,item.run)));
      }
      body.append(issueBox);
    }

    // 没有参考规则的方向：直接给“填写”入口，不再让用户自己翻列表。
    if(noRule.length){
      const box=el('details',{class:'rev-norule','data-rev-norule':'',open:''},
        el('summary',{},'参考规则没有覆盖的 '+noRule.length+' 个方向（需要你逐方向判断）'));
      for(const d of noRule.slice(0,8))box.append(el('div',{class:'rev-norule-row'},
        el('span',{},variableLabel(p,d.a)+' → '+variableLabel(p,d.b)+'（还缺 '+(d.cells-d.filled)+' 格）'),
        button('填写这个方向',()=>fillDirection(d.a,d.b,d.best?.id||null))));
      body.append(box);
    }

    // 适用范围：每类给对应入口，能在原地处理的就不跳页。
    const scopeBox=el('details',{class:'rev-diag','data-rev-scope-issues':''},el('summary',{},'适用范围明细'));
    const projectMissing=!p.scope.regionId||!p.scope.years.length;
    if(projectMissing)scopeBox.append(el('div',{class:'rev-scope-item'},
      el('p',{},'项目范围缺失：' + (!p.scope.regionId?'没有研究地区':'') + (!p.scope.regionId&&!p.scope.years.length?'、':'') + (!p.scope.years.length?'没有研究年份':'')),
      el('button',{class:'button secondary',onclick:()=>{context.navigate('workspace');setTimeout(()=>document.querySelector('#project-region')?.focus(),350);}},'去设置研究范围')));
    if(byKind('record-missing').length){
      const box=el('details',{open:''},el('summary',{},'记录范围缺失（'+byKind('record-missing').length+'）'));
      for(const item of byKind('record-missing').slice(0,8))box.append(el('div',{class:'rev-scope-item'},
        el('p',{},variableLabel(p,item.direction.a)+'→'+variableLabel(p,item.direction.b)+' · '+item.detail),
        button('补这条的范围',()=>fillDirection(item.direction.a,item.direction.b,item.record.id))));
      scopeBox.append(box);
    }
    if(byKind('record-mismatch').length){
      const box=el('details',{open:''},el('summary',{},'明确不符（'+byKind('record-mismatch').length+'）'));
      for(const item of byKind('record-mismatch').slice(0,8))box.append(el('div',{class:'rev-scope-item'},
        el('p',{},variableLabel(p,item.direction.a)+'→'+variableLabel(p,item.direction.b)+' · '+item.detail+'（目标：'+(p.scope.regionId||'未设地区')+' / '+y+'）'),
        el('div',{class:'rev-scope-actions'},
          button('换用/修正这条评分',()=>fillDirection(item.direction.a,item.direction.b,item.record.id)),
          button('调整研究范围',()=>{context.navigate('workspace');setTimeout(()=>document.querySelector('#project-region')?.focus(),350);}))));
      scopeBox.append(box);
    }
    if(unknownStates.length)scopeBox.append(el('div',{class:'rev-scope-item'},
      el('p',{},'状态定义范围未知：'+unknownStates.slice(0,4).map(x=>variableLabel(p,x.descriptorId)+'「'+x.state.label+'」（'+x.what+'）').join('、')+(unknownStates.length>4?' 等 '+unknownStates.length+' 个状态':'')),
      el('p',{class:'v5-hint'},'平台不会把它改成“已核实”；检验时会要求你明确确认按当前截面假设。'),
      button('查看状态定义',()=>context.navigate('elements'))));
    if(!scopeIssues.length&&!unknownStates.length)scopeBox.append(el('p',{},'没有记录层面的范围问题。'));
    body.append(scopeBox);

    // 只有多份候选的方向才展开选择；用户点“去处理”时也把该方向带出来。
    if(conflictDirs.length){
      const box=el('section',{class:'rev-conflicts','data-rev-conflict':''},el('h3',{},'这些方向有多条评分，请选一条'));
      for(const d of conflictDirs){
        const select=el('select',{'aria-label':'选用 '+variableLabel(p,d.a)+' → '+variableLabel(p,d.b),onchange:e=>{
          picked=picked.filter(id=>!d.records.some(j=>j.id===id));if(e.target.value)picked.push(e.target.value);remember();render();
        }},el('option',{value:''},'未选用；保留冲突'),...d.records.map(j=>el('option',{value:j.id},
          (p.view.perspective==='expert'?j.id:'判断 '+(d.records.indexOf(j)+1))+' · '+(j.scope?.regionId||'范围未知')+' · '+(Array.isArray(j.validYears)&&j.validYears.length?j.validYears.join('/'):'年份未知')+' · v'+j.version+(recordApplies(j,p,y)?'':'（本年不适用）'))));
        select.value=d.selected.length===1?d.selected[0].id:'';
        box.append(el('div',{class:'rev-conflict-row'},el('span',{},variableLabel(p,d.a)+' → '+variableLabel(p,d.b)),select));
      }
      body.append(box);
    }

    // 矩阵：有分数就默认展开，没分数收起。
    if(snapshot)body.append(matrixBox(p,snapshot,required,judged));

    // 同名诊断合并：数量 + 涉及方向；点开才看原始码与记录。
    const grouped=new Map();
    for(const d of diagnostics){const g=grouped.get(d.code)||{code:d.code,message:d.message,count:0,ids:new Set()};g.count++;for(const id of d.recordIds||[])g.ids.add(id);grouped.set(d.code,g);}
    if(grouped.size){
      const details=el('details',{class:'rev-diag'},el('summary',{},'技术诊断'));
      for(const g of grouped.values()){
        const related=[...g.ids].map(id=>{
          const j=p.data.judgments.find(r=>r.id===id);if(!j)return null;
          return variableLabel(p,j.sourceDescriptorId)+'→'+variableLabel(p,j.targetDescriptorId);
        }).filter(Boolean);
        details.append(el('p',{},g.message+'（'+g.count+' 条）'+(related.length?' · '+[...new Set(related)].slice(0,4).join('、'):'')+(g.count>4?' 等':''),
          p.view.perspective==='expert'?el('code',{},' ['+g.code+']'):null));
      }
      body.append(details);
    }
    body.append(el('p',{class:'warning-text'},'矩阵未经 CIB 检验；填满不等于方向与强度依据已验证。'));
  }
  function beforeUnload(event){if(dirty()){event.preventDefault();event.returnValue='';}}
  window.addEventListener('beforeunload',beforeUnload);
  // 编码面板内部变化（选模板、生成预览）不触发 store 订阅；步骤条只读 DOM 状态。
  const stepObserver=new MutationObserver(()=>{if(!disposed&&tab==='input')paintSteps(context.store.read());});
  stepObserver.observe(body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-filled','aria-pressed']});
  const unsubscribe=context.store.subscribe(()=>{if(saving||disposed)return;if(dirty()){status.textContent='项目输入已变化，草稿保留；请取消后重载，不能陈旧覆盖。';return;}load();render();});
  load();render();
  return {canLeave,dispose(){disposed=true;stepObserver.disconnect();unsubscribe();window.removeEventListener('beforeunload',beforeUnload);root.remove();}};
}
