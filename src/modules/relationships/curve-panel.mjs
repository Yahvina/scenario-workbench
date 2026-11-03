import {el} from '../../core/ui.mjs';
import {curveData} from './curve-data.mjs';
import {definitions,prepareCurve,confirmCurve,scaleWarning} from './curve.mjs';
export function curvePanel(host,context,sourceId,targetId,onDirty,onCancel,onSaved) {
  const project=context.store.read(),baseline=context.store.snapshot();
  const box=el('section',{class:'curve-panel'});host.append(box);
  box.append(el('h3',{},(project.data.descriptors.find(d=>d.id===sourceId)?.label||sourceId)+' → '+(project.data.descriptors.find(d=>d.id===targetId)?.label||targetId)));
  let prepared=null;const edits=new Map(),relationRefs=new Set();
  const notice=el('p',{role:'status'}),preview=el('div');
  const invalidate=()=>{prepared=null;confirmation.checked=false;onDirty();notice.textContent='内容已变化，请更新预览并重新明确确认。';};
  let src,tgt;try{src=definitions(project,sourceId);tgt=definitions(project,targetId);}catch(e){box.append(el('p',{},e.message+'；请继续J1完整状态对直接评分。'),el('button',{class:'button',onclick:onCancel},'返回直接评分'));return;}
  box.append(el('details',{},el('summary',{},'当前完整状态定义及版本（确认前核对）'),el('pre',{},JSON.stringify({source:src,target:tgt},null,2))));
  const choice=(label,options)=>{const s=el('select',{'aria-label':label,onchange:invalidate},el('option',{value:''},'请选择'),...options);box.append(el('label',{},label,s));return s;};
  const highA=choice('源变量高状态',src.map(s=>el('option',{value:s.id},s.label)));
  const highB=choice('目标变量高状态',tgt.map(s=>el('option',{value:s.id},s.label)));
  const template=choice('编码模板',curveData.templates.map(t=>el('option',{value:t.id,disabled:!t.encodingEnabled},t.id+' · '+curveData.panels.find(p=>p.id===t.panel).label+(!t.encodingEnabled?'（停用，项目暂不采用）':''))));
  function checkbox(text){const i=el('input',{type:'checkbox','aria-label':text,onchange:invalidate});box.append(el('label',{class:'relationships-reference'},i,text));return i;}
  const graph=el('div',{'aria-label':'关系图形示意'});box.append(graph);
  function plot(){graph.replaceChildren();const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 200 145');svg.setAttribute('width','240');svg.style.maxWidth='100%';const paths={A:'M25 105L170 25',B:'M25 25L170 105',C:'M25 105H90L170 25',D:'M25 105L90 25H170',E:'M25 105Q140 105 170 25',F:'M25 105Q50 25 170 25',G:'M25 25H90L170 105',H:'M25 25L90 105H170',I:'M25 25Q140 25 170 105',J:'M25 25Q50 105 170 105',K:'M25 25Q100 150 170 25',L:'M25 105Q100 -20 170 105'};const path=document.createElementNS(ns,'path');path.setAttribute('d',paths[template.value[0]]||'');path.setAttribute('stroke','var(--tx2)');path.setAttribute('fill','none');path.setAttribute('stroke-width','2');svg.append(path);graph.append(svg,el('p',{},'图形仅示意形状，非数值拟合；线型编号1/3较弱、2/4较强，K/L中1/2为低源段、3/4为高源段，实际分数严格查原表。 横轴为源因素水平，纵轴为目标因素水平。模板编号中的线型选择按原表，不从像素斜率推分。'));}
  template.addEventListener('change',plot);
  const direct=checkbox('我明确判断这是直接影响');const ordinal=checkbox('我确认双方全部二档均为有序高低，剩余状态为低');
  const region=el('input',{'aria-label':'编码适用地区',oninput:invalidate}),years=el('input',{'aria-label':'编码适用年份',placeholder:'2030,2035',oninput:invalidate});
  const rationale=el('textarea',{'aria-label':'编码关系理由',oninput:invalidate});
  box.append(el('p',{},'保存为新的独立编码判断，不覆盖当前记录。选择论文图形/线型，不是年份路径。低、高的绑定依据实际定义，不按名称猜测。'),el('label',{},'编码适用地区',region),el('label',{},'编码适用年份',years),el('label',{},'实际关系理由（方法论文不能替代实际关系依据）',rationale),el('p',{class:'warning-text'},scaleWarning),notice,preview);
  const refs=el('details',{},el('summary',{},'关联已有实际关系依据（与方法论文分开）'));for(const e of project.data.evidence){const input=el('input',{type:'checkbox',onchange:event=>{if(event.target.checked)relationRefs.add(e.id);else relationRefs.delete(e.id);invalidate();}});refs.append(el('label',{class:'relationships-reference'},input,e.kind+' · '+e.sourceId+' · '+e.locator));}box.append(refs);
  const confirmation=el('input',{type:'checkbox','aria-label':'明确确认当前绑定、完整分数及全部警告'});
  const parseYears=()=>{const values=years.value.trim()?years.value.split(/[,，\s]+/).filter(Boolean).map(Number):[];if(values.some(y=>!Number.isInteger(y)||y<1900||y>2300)||new Set(values).size!==values.length)throw new Error('适用年份无效或重复');return values.sort((a,b)=>a-b);};
  function generate(){try{if([...box.querySelectorAll('input')].some(input=>input.validity.badInput))throw new Error('数值输入不完整，不能将不完整输入当作空白未判断');
    const args={sourceId,targetId,templateId:template.value,sourceHigh:highA.value,targetHigh:highB.value,ordinalConfirmed:ordinal.checked,directRelation:direct.checked,region:region.value,years:parseYears(),rationale:rationale.value,relationEvidenceRefs:[...relationRefs]};
    const base=prepareCurve(project,args,()=>crypto.randomUUID());
    args.overrides=base.judgment.entries.flatMap(e=>{const edit=edits.get(JSON.stringify([e.sourceStateId,e.targetStateId]));if(!edit)return[];const after=edit.value.trim()===''?null:Number(edit.value);return after===e.score?[]:[{...e,before:e.score,after,rationale:edit.reason,evidenceRefs:[]}];});
    prepared=prepareCurve(project,args,()=>crypto.randomUUID());confirmation.checked=false;
    preview.replaceChildren(el('h3',{},'完整2×2预览与逐格回述'));
    for(const issue of prepared.judgment.curveEncoding.sourceIssues)preview.append(el('p',{class:'warning-text'},issue.message));
    preview.append(el('p',{},'方法来源：Stankov2021，Table1 PDF p7；'+prepared.judgment.curveEncoding.ruleVersion));
    const table=el('table',{class:'relationships-table'},el('caption',{},'源H/L × 目标H/L：原始生成值 → 最终分数'));table.append(el('thead',{},el('tr',{},el('th',{},'源 / 目标'),el('th',{},'高'),el('th',{},'低'))));const rows=el('tbody');for(const level of ['high','low']){const a=base.judgment.curveEncoding.stateBindings.source.find(b=>b.level===level);const row=el('tr',{},el('th',{},level==='high'?'高':'低'));for(const targetLevel of ['high','low']){const b=base.judgment.curveEncoding.stateBindings.target.find(b=>b.level===targetLevel);const orig=base.judgment.entries.find(e=>e.sourceStateId===a.id&&e.targetStateId===b.id),final=prepared.judgment.entries.find(e=>e.sourceStateId===a.id&&e.targetStateId===b.id);row.append(el('td',{},orig.score+' → '+(final.score??'未判断')));}rows.append(row);}table.append(rows);preview.append(el('div',{class:'relationships-scroll'},table));
    for(const e of base.judgment.entries){const k=JSON.stringify([e.sourceStateId,e.targetStateId]),edit=edits.get(k)||{value:String(e.score),reason:''};
      const name=project.data.states.find(s=>s.id===e.sourceStateId).label+' → '+project.data.states.find(s=>s.id===e.targetStateId).label;
      const value=el('input',{type:'number',min:'-3',max:'3',step:'1',value:edit.value,'aria-label':'修订 '+name,oninput:event=>{edit.value=event.target.value;edits.set(k,edit);invalidate();}});
      const reason=el('input',{value:edit.reason,'aria-label':'修订理由 '+name,oninput:event=>{edit.reason=event.target.value;edits.set(k,edit);invalidate();}});
      preview.append(el('article',{},el('p',{},name+'：生成 '+e.score+'（'+(e.score===0?'没关系':e.score>0?'促进':'抑制')+'）；最终 '+(prepared.judgment.entries.find(x=>x.sourceStateId===e.sourceStateId&&x.targetStateId===e.targetStateId).score??'未判断')),el('label',{},'最终分数（空白=未判断）',value),el('label',{},'改分理由（改分必须填写）',reason)));
    }
    notice.textContent='预览已更新；请阅读警告、核对全部四格并明确确认。';onDirty();
  }catch(e){prepared=null;confirmation.checked=false;notice.textContent=e.message;}}
  box.append(el('button',{class:'button',onclick:generate},'更新编码预览'),el('label',{class:'relationships-reference'},confirmation,'明确确认当前绑定、完整分数及全部警告'),el('button',{class:'button primary-action',onclick:()=>{try{
    if(!prepared||!confirmation.checked)throw new Error('请更新预览并明确确认');
    if(!context.store.isCurrent(baseline))throw new Error('项目输入已变化，请取消并重新载入');
    const saved=confirmCurve(prepared);const result=context.actions.replaceProject(saved.project);if(!result.ok)throw new Error(result.error.message);onSaved(saved.judgment.id);
  }catch(e){notice.textContent=e.message;}}},'保存已确认编码草案'),el('button',{class:'button',onclick:onCancel},'取消编码'));
}

