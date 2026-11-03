import {scaleWarning,a2Warning} from './curve.mjs';
import {curvePanel} from './curve-panel.mjs';
import { el } from '../../core/ui.mjs';
import { variableColor } from '../../core/object-colors.mjs';
import { statesFor, draftFor, buildJudgmentChange, buildMatrix } from './logic.mjs';
import {prepareMatrixHandoff,sendMatrixHandoff} from './handoff.mjs';

export function mount(container, context) {
  const p0=context.store.read(), key='relationships-ui-v1:'+p0.id;
  let preferences={};
  try { preferences=JSON.parse(sessionStorage.getItem(key)||'{}'); } catch {}
  if(!preferences || typeof preferences!=='object' || Array.isArray(preferences))preferences={};
  let sourceId=preferences.sourceId||p0.selection.descriptorIds[0], targetId=preferences.targetId||p0.selection.descriptorIds[1], recordId=preferences.recordId||null;
  let tab=p0.view.objectId==='matrix'?'matrix':'input', year=preferences.year??'', picked=Array.isArray(preferences.picked)?preferences.picked:[];
  let curveDirty=false;let original=null,draft=null,clean='',baseline=null,saving=false,disposed=false;
  const root=el('section',{class:'relationships-module'}), status=el('p',{class:'relationships-status',role:'status','aria-live':'polite'}), body=el('div');
  const button=(text,onclick,primary=false)=>el('button',{class:'button'+(primary?' primary-action':''),onclick},text);
  root.append(el('h2',{},'有向关系判断与矩阵准备'),el('p',{},'记录“什么状态影响什么状态”。A→B与B→A分别判断；未判断用空白，0表示没关系。此处不运行CIB。'),status,
    el('div',{class:'relationships-tabs'},button('关系判断输入',()=>changeTab('input')),button('按年份准备矩阵',()=>changeTab('matrix'))),body);
  container.append(root);
  function remember() {
    try { sessionStorage.setItem(key,JSON.stringify({sourceId,targetId,recordId,tab,year,picked})); }
    catch { status.textContent='查看选项未能保留，刷新后请重新选择；已保存判断不受此提示影响。'; }
  }
  function dirty() { return curveDirty || !!draft && (JSON.stringify(draft)!==clean || [...body.querySelectorAll('input')].some(input=>input.validity.badInput)); }
  function canLeave() {
    if(dirty()) {status.textContent='有未保存草稿，请先保存或取消，再切换方向、记录、页签、页面或视角。';return false;}
    return true;
  }
  function load() {
    curveDirty=false;
    const p=context.store.read(), active=p.selection.descriptorIds;
    if(!active.includes(sourceId)) sourceId=active[0];
    if(!active.includes(targetId)||targetId===sourceId) targetId=active.find(id=>id!==sourceId);
    original=p.data.judgments.find(j=>j.id===recordId&&j.sourceDescriptorId===sourceId&&j.targetDescriptorId===targetId)||null;
    recordId=original?.id||null;
    draft=sourceId&&targetId?draftFor(p,sourceId,targetId,original):null;
    clean=JSON.stringify(draft);baseline=context.store.snapshot();
    picked=[...new Set(picked)].filter(id=>p.data.judgments.some(j=>j.id===id));
  }
  function changeTab(value) {if(!canLeave())return;tab=value;remember();render();}
  function switchPair(a,b) {if(!canLeave())return;sourceId=a;targetId=b;recordId=null;load();remember();render();}
  function save() {
    try {
      if([...body.querySelectorAll('input')].some(input=>input.validity.badInput)) throw new Error('评分或年份输入不完整，请输入有效整数');
      if(!context.store.isCurrent(baseline)) throw new Error('项目科学输入已变化，请取消草稿后重新载入，避免覆盖');
      const next=buildJudgmentChange(context.store.read(),sourceId,targetId,original,draft,()=>crypto.randomUUID());
      const id=original?.id||next.data.judgments.at(-1)?.id;
      saving=true;const result=context.actions.replaceProject(next);saving=false;
      if(!result.ok)throw new Error(result.error.message+'；'+result.error.recoveryAction);
      recordId=id;load();remember();render();
      status.textContent=context.persistenceState().ok?'判断草稿已保存，修改依据可追踪；不代表专家确认。':'判断已更新到当前页面，但浏览器保存失败；请到项目页下载备份后再离开或刷新。';
    } catch(error) {saving=false;status.textContent='保存失败：'+error.message;}
  }
  function cancel() {load();render();status.textContent='已取消未保存草稿。';}
  function variableLabel(p,id) {return p.data.descriptors.find(d=>d.id===id)?.label||id;}
  function evidenceView(p,record) {
    return el('details',{class:'relationships-evidence'},el('summary',{},'关联依据、原始值与修改记录'),
      el('p',{},'方向和强度依据未分别核实；政策原文可说明政策事实，不能单独证明描述符间影响规律。'),
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
  function render() {
    if(disposed)return;
    const p=context.store.read();body.replaceChildren();
    root.dataset.tab=tab;
    root.querySelector('.relationships-tabs').setAttribute('aria-label','关系工作页');
    root.querySelectorAll('.relationships-tabs button').forEach((button,index)=>button.setAttribute('aria-pressed',String(tab===(index===0?'input':'matrix'))));
    if(p.selection.descriptorIds.length<2) {body.append(el('p',{},'至少需要两个有计算变量映射的活动描述符。'),button('返回描述符选择',()=>context.navigate('elements')));return;}
    if(!p.scope.years.length||!p.scope.regionId)body.append(el('p',{class:'warning-text'},'研究年份或地区未指定：可以保存未知范围草案，但不能组装适用矩阵。'),button('返回项目范围设置',()=>context.navigate('workspace')));
    if(tab==='matrix'){renderMatrix(p);return;}
    renderInput(p);
  }
  function renderInput(p) {
    const source=el('select',{'aria-label':'来源变量',onchange:e=>{if(!canLeave()){e.target.value=sourceId;return;}const id=e.target.value;switchPair(id,id===targetId?p.selection.descriptorIds.find(d=>d!==id):targetId);}},...p.selection.descriptorIds.map(id=>el('option',{value:id},variableLabel(p,id))));
    const target=el('select',{'aria-label':'目标变量',onchange:e=>{if(!canLeave()){e.target.value=targetId;return;}switchPair(sourceId,e.target.value);}},...p.selection.descriptorIds.filter(id=>id!==sourceId).map(id=>el('option',{value:id},variableLabel(p,id))));
    source.value=sourceId;target.value=targetId;
    body.append(el('div',{class:'relationships-controls'},el('label',{},'来源变量',source),el('span',{},'→'),el('label',{},'目标变量',target),button('交换方向',()=>switchPair(targetId,sourceId))),
      el('h3',{},el('span',{class:'variable-mark',style:'--variable-color:'+variableColor(sourceId)}),variableLabel(p,sourceId)+' → '+variableLabel(p,targetId)));
    const records=p.data.judgments.filter(j=>j.sourceDescriptorId===sourceId&&j.targetDescriptorId===targetId);
    const chooser=el('select',{'aria-label':'编辑判断记录',onchange:e=>{if(!canLeave()){e.target.value=recordId||'';return;}recordId=e.target.value||null;load();remember();render();}},el('option',{value:''},'新建独立判断草案'),...records.map(j=>el('option',{value:j.id},j.id+' · v'+j.version+' · '+(j.scope?.regionId||'地区未知')+' · '+(Array.isArray(j.validYears)&&j.validYears.length?j.validYears.join('/'):'年份未知/格式待核'))));
    chooser.value=recordId||'';
    body.append(el('label',{},'编辑判断记录（独立方向，不自动复制分数）',chooser));
    body.append(button('受限二档图形编码',()=>{if(!canLeave())return;curveDirty=true;body.replaceChildren();curvePanel(body,context,sourceId,targetId,()=>{curveDirty=true;},()=>{curveDirty=false;render();},savedId=>{recordId=savedId;curveDirty=false;load();render();status.textContent=context.persistenceState().ok?'编码草案已保存；人工确认不代表专家审核。':'已在当前页面提交，但浏览器保存失败，请下载备份。';});}));
    if(original?.curveEncoding){body.append(el('p',{class:'warning-text'},scaleWarning));if(original.curveEncoding.templateId==='A(2)')body.append(el('p',{class:'warning-text'},a2Warning));}
    const sources=statesFor(p,sourceId),targets=statesFor(p,targetId);
    if(!sources.length||!targets.length){body.append(el('p',{class:'warning-text'},'变量缺少状态定义，不能生成状态对；请回描述符页核对已有定义。'),button('返回描述符选择',()=>context.navigate('elements')));return;}
    const region=el('input',{'aria-label':'判断适用地区',value:draft.region,placeholder:'留空表示未知，不当通用',oninput:e=>{draft.region=e.target.value;}});
    const years=el('input',{'aria-label':'判断适用年份',value:draft.years,placeholder:'例如2030, 2035；留空为未知',oninput:e=>{draft.years=e.target.value;}});
    const directness=el('select',{'aria-label':'直接性说明',onchange:e=>{draft.directness=e.target.value;}},el('option',{value:'unknown'},'直接性待核'),el('option',{value:'direct'},'记录为直接影响'),el('option',{value:'indirect'},'记录为间接影响'));
    directness.value=draft.directness;
    body.append(el('div',{class:'relationships-controls'},el('label',{},'判断适用地区',region),el('label',{},'判断适用年份',years),el('label',{},'直接性说明',directness)),el('p',{class:'muted'},'适用范围须明确填写，不从项目范围偷偷继承。空白评分=未判断；0=没关系；−3…−1抑制，+1…+3促进。'));
    const table=el('table',{class:'relationships-table'},el('caption',{},'源状态 × 目标状态：'+sources.length+'×'+targets.length+'，逐格直接评分'));
    const header=el('tr',{},el('th',{scope:'col'},'源状态 ↓ / 目标状态 →'),...targets.map(state=>el('th',{scope:'col'},state.label)));
    table.append(el('thead',{},header));const rows=el('tbody');
    const counter=el('p',{'data-coverage-draft':'',class:'muted'});
    function count(){counter.textContent='当前草稿：'+draft.entries.filter(e=>String(e.value).trim()!==''&&Number.isInteger(Number(e.value))&&Math.abs(Number(e.value))<=3).length+' / '+draft.entries.length+' 格已填；允许其余保留未判断。';}
    sources.forEach(a=>{
      const row=el('tr',{},el('th',{scope:'row'},a.label,p.view.perspective==='expert'?el('small',{},a.id):null));
      targets.forEach(b=>{
        const entry=draft.entries.find(e=>e.sourceStateId===a.id&&e.targetStateId===b.id);
        const input=el('input',{type:'number',min:'-3',max:'3',step:'1','aria-label':a.label+' → '+b.label,'data-source-state':a.id,'data-target-state':b.id,value:entry.value,placeholder:'未判断'});
        const cell=el('td',{},input);
        function paint(){const raw=String(entry.value).trim(),n=Number(raw),valid=raw!==''&&Number.isInteger(n)&&Math.abs(n)<=3;cell.className=valid?'relationships-score':'relationships-missing';cell.style.background=valid?'var(--s'+n+')':'';input.setAttribute('aria-invalid',input.validity.badInput||raw!==''&&!valid?'true':'false');}
        input.addEventListener('input',e=>{entry.value=e.target.value;paint();count();status.textContent='草稿未保存。';});paint();row.append(cell);
      });rows.append(row);
    });
    table.append(rows);body.append(el('div',{class:'relationships-scroll',tabindex:'0','aria-label':'状态对评分表，窄屏可横向滚动'},table),counter);count();
    const rationale=el('textarea',{'aria-label':'判断理由',rows:'3',oninput:e=>{draft.rationale=e.target.value;}});rationale.value=draft.rationale;
    body.append(el('label',{},'判断理由',rationale),el('p',{class:'muted'},'没有可用规律依据也可保存为用户假设草案；保存不等于专家确认。'));
    const refs=el('details',{},el('summary',{},'引用已有依据（不自动认证方向或强度）'));
    for(const e of p.data.evidence){
      const checkbox=el('input',{type:'checkbox','data-evidence-id':e.id,onchange:event=>{draft.evidenceRefs=event.target.checked?[...new Set([...draft.evidenceRefs,e.id])]:draft.evidenceRefs.filter(id=>id!==e.id);}});checkbox.checked=draft.evidenceRefs.includes(e.id);
      refs.append(el('label',{class:'relationships-reference'},checkbox,e.kind+' · '+e.sourceId+' · '+e.locator));
    }
    if(!p.data.evidence.length)refs.append(el('p',{},'暂无已有依据，保存时会新增用户假设修改记录。'));
    body.append(refs,el('div',{class:'relationships-save'},button('取消草稿',cancel),button('保存判断草稿',save,true)),evidenceView(p,original),
      el('p',{class:'warning-text'},'图形化关系已提供受限二档模板：仅完整、有序H/L且明确直接关系；L(1,3)停用、A(2)保留原文冲突警告。三档及任意连续曲线不自动外推，方法论文不能代替实际关系依据。'));
    if(p.view.perspective==='expert')body.append(el('p',{class:'muted'},'源ID：'+sourceId+'；目标ID：'+targetId+'；判断ID：'+(original?.id||'未保存')+'；版本：'+(original?.version||'未保存')));
  }
  function renderMatrix(p) {
    const yearSelect=el('select',{'aria-label':'矩阵年份',onchange:e=>{year=e.target.value;remember();render();}},el('option',{value:''},'请选择研究年份'),...p.scope.years.map(y=>el('option',{value:y},y)));
    if(!p.scope.years.includes(Number(year)))year='';yearSelect.value=year;
    body.append(el('h3',{},'按范围准备状态对矩阵'),el('p',{},'地区：'+(p.scope.regionId||'未指定')+'。只采用显式选用且符合地区、年份的记录，不聚合冲突。'),el('label',{},'矩阵年份',yearSelect));
    const choices=el('details',{open:true},el('summary',{},'逐方向明确选用判断记录'));
    for(const a of p.selection.descriptorIds)for(const b of p.selection.descriptorIds){
      if(a===b)continue;
      const candidates=p.data.judgments.filter(j=>j.sourceDescriptorId===a&&j.targetDescriptorId===b);
      const selected=candidates.filter(j=>picked.includes(j.id));
      const select=el('select',{'aria-label':'选用 '+variableLabel(p,a)+' → '+variableLabel(p,b),onchange:e=>{
        picked=picked.filter(id=>!candidates.some(j=>j.id===id));if(e.target.value)picked.push(e.target.value);remember();render();
      }},el('option',{value:''},'未选用；保留缺口/冲突'),...candidates.map(j=>el('option',{value:j.id},j.id+' · '+(j.scope?.regionId||'范围未知')+' · '+(Array.isArray(j.validYears)&&j.validYears.length?j.validYears.join('/'):'年份未知/格式待核')+' · v'+j.version)));
      select.value=selected.length===1?selected[0].id:'';choices.append(el('label',{},variableLabel(p,a)+' → '+variableLabel(p,b),select));
    }
    body.append(choices);
    const {snapshot,diagnostics}=buildMatrix(p,{year:year===''?null:Number(year),selectedJudgmentIds:picked});
    const diagnosis=el('section',{class:'relationships-diagnostics'},el('h3',{},'适用性、缺口与冲突'));
    diagnosis.append(diagnostics.length?el('ul',{},...diagnostics.map(d=>el('li',{},d.message,p.view.perspective==='expert'?' ['+d.code+'] '+d.recordIds.join('、'):''))):el('p',{},'当前没有适用性诊断；仍未执行CIB或证据有效性认证。'));
    if(snapshot){
      const {required,judged,missingPairs}=snapshot.coverage;
      body.append(el('p',{'data-matrix-coverage':''},'应判 '+required+'；已判 '+judged+'；未判断 '+missingPairs.length+'。覆盖统计不是证据质量或现实可信度。'));
      const states=snapshot.descriptorIds.flatMap(id=>statesFor(p,id));
      const table=el('table',{class:'relationships-table relationships-matrix'},el('caption',{},'行影响列 · '+snapshot.year+' · 同变量块不适用，不计覆盖'));
      table.append(el('thead',{},el('tr',{},el('th',{scope:'col'},'源 ↓ / 目标 →'),...states.map(s=>el('th',{scope:'col'},variableLabel(p,s.descriptorId)+' / '+s.label)))));
      const rows=el('tbody');
      for(const a of states){const row=el('tr',{},el('th',{scope:'row'},variableLabel(p,a.descriptorId)+' / '+a.label));
        for(const b of states){
          if(a.descriptorId===b.descriptorId)row.append(el('td',{class:'relationships-na'},'不适用'));
          else {const e=snapshot.entries.find(e=>e.sourceStateId===a.id&&e.targetStateId===b.id),value=e?.score??null;
            row.append(el('td',{class:value===null?'relationships-missing':'relationships-score',style:value===null?'':'background:var(--s'+value+')','data-matrix-source':a.id,'data-matrix-target':b.id,'data-score':value===null?'null':value,title:'判断记录：'+(e?.judgmentId||'未选用')},value===null?'未判断':value===0?'0 · 没关系':value>0?'+'+value:value));}
        }rows.append(row);
      }table.append(rows);body.append(el('div',{class:'relationships-scroll',tabindex:'0','aria-label':'准备矩阵，窄屏可横向滚动'},table));
      if(p.view.perspective==='expert')body.append(el('details',{},el('summary',{},'MatrixSnapshot（输入准备，非求解结果）'),el('pre',{},JSON.stringify(snapshot,null,2))));
    }
    body.append(diagnosis,el('p',{class:'warning-text'},'矩阵尚未经过CIB检验；填满不等于适用性和方向/强度依据均已验证。'));
    let reason='';try{prepareMatrixHandoff(p,{year:year===''?null:Number(year),selectedJudgmentIds:picked});}catch(error){reason=error.message;}
    const send=button('确认并用于检算',()=>{try{sendMatrixHandoff(context.store.read(),{year:year===''?null:Number(year),selectedJudgmentIds:picked});context.navigate('solver');}catch(error){status.textContent='未发送候选：'+error.message;}});
    send.disabled=!!reason;body.append(el('p',{},'仅发送当前年份、记录版本和完整矩阵作为会话候选。求解页仍须明确采用并确认假设；发送不触发计算，刷新不恢复候选。'),send);
    if(reason)body.append(el('p',{class:'warning-text'},'候选尚不能发送：'+reason));
  }
  function beforeUnload(event){if(dirty()){event.preventDefault();event.returnValue='';}}
  window.addEventListener('beforeunload',beforeUnload);
  const unsubscribe=context.store.subscribe(()=>{if(saving||disposed)return;if(dirty()){status.textContent='项目输入已变化，草稿保留；请取消后重载，不能陈旧覆盖。';return;}load();render();});
  load();render();
  return {canLeave,dispose(){disposed=true;unsubscribe();window.removeEventListener('beforeunload',beforeUnload);root.remove();}};
}
