import {el} from '../../core/ui.mjs';
import {curveData} from './curve-data.mjs';
import {definitions,prepareCurve,confirmCurve,scaleWarning} from './curve.mjs';
import {AXIS_NOTE,SKETCH_NOTE,lineTypeText,mentorBlock,panels,thumbnail} from './shape-catalog.mjs';
import {mentorAtlas} from './trend-atlas.mjs';
export function curvePanel(host,context,sourceId,targetId,onDirty,onCancel,onSaved,initialTemplate='') {
  const project=context.store.read(),baseline=context.store.snapshot();
  const expert=project.view.perspective==='expert';
  const box=el('section',{class:'curve-panel'});host.append(box);
  const sourceLabel=project.data.descriptors.find(d=>d.id===sourceId)?.label||sourceId;
  const targetLabel=project.data.descriptors.find(d=>d.id===targetId)?.label||targetId;
  box.append(el('h3',{},sourceLabel+' → '+targetLabel));
  let prepared=null;const edits=new Map(),relationRefs=new Set();
  const notice=el('p',{role:'status'}),preview=el('div');
  const invalidate=()=>{prepared=null;confirmation.checked=false;preview.removeAttribute('data-filled');onDirty();notice.textContent='内容已变化，请更新预览并重新明确确认。';};
  let src,tgt;try{src=definitions(project,sourceId);tgt=definitions(project,targetId);}catch(e){box.append(el('p',{},e.message+'；请继续J1完整状态对直接评分。'),el('button',{class:'button',onclick:onCancel},'返回直接评分'));return;}
  box.append(el('details',{},el('summary',{},'当前完整状态定义及版本（确认前核对）'),el('pre',{},JSON.stringify({source:src,target:tgt},null,2))));

  // ---- shape-first picker -------------------------------------------------
  // Thumbnails come first so the user compares shapes before reading codes. Every
  // tile is built from the reviewed paper data; nothing here can score or save.
  box.append(el('p',{class:'muted'},'选一张图，再核对两侧的高低状态。横轴为 A 水平，纵轴为 B 水平。'));
  const panelIds=panels();
  const grid=el('div',{class:'shape-grid',role:'group','aria-label':'论文图形与线型选择'});
  const shapeState=el('div',{class:'shape-state'});
  const templateSelect=el('select',{'aria-label':'编码模板','aria-hidden':'false',onchange:event=>{selectTemplate(event.target.value);}},el('option',{value:''},'尚未选择线型'));
  for(const t of curveData.templates)templateSelect.append(el('option',{value:t.id,disabled:!t.encodingEnabled},t.id+' · '+curveData.panels.find(p=>p.id===t.panel).label+(!t.encodingEnabled?'（停用，项目暂不采用）':'')));
  let template='';
  const templateButtons=new Map();
  function selectTemplate(id,{focus=false}={}) {
    const entry=curveData.templates.find(t=>t.id===id);
    if(!entry||!entry.encodingEnabled)return false;
    template=id;templateSelect.value=id;invalidate();renderShape();
    for(const [key,node] of templateButtons)node.setAttribute('aria-pressed',String(key===id));
    if(focus)templateButtons.get(id)?.focus();
    return true;
  }
  function renderShape() {
    const entry=curveData.templates.find(t=>t.id===template);
    shapeState.replaceChildren();
    if(!entry){shapeState.append(el('p',{class:'muted'},'尚未选择线型：请点选上方任一缩略图。'));return;}
    const panel=curveData.panels.find(p=>p.id===entry.panel);
    const body=el('div',{},
      el('p',{class:'shape-claim'},panel.label+'：'+panel.description),
      el('p',{},'方向：'+sourceLabel+' → '+targetLabel),
      el('p',{},'线型差异：'+lineTypeText(entry)),
      el('p',{},AXIS_NOTE));
    if(!entry.encodingEnabled)body.append(el('p',{class:'warning-text'},'本项目暂不采用该线型：'+entry.warnings.join('、')));
    if(expert){
      const rows=el('tbody');
      for(const [row,level] of ['high','low'].entries()){
        const rowNode=el('tr',{},el('th',{},level==='high'?'源高':'源低'));
        for(const cell of entry.matrix[row])rowNode.append(el('td',{},String(cell)));
        rows.append(rowNode);
      }
      body.append(el('details',{class:'shape-expert'},el('summary',{},'专家：编号、原文出处、适用条件与完整子矩阵'),
        el('p',{},'模板编号：'+entry.id+'；图形编号：'+panel.id+'；线型：'+entry.lineChoices.join('、')),
        el('p',{},'原文出处：'+curveData.source.citation+'；'+entry.source.table+' 第 '+entry.source.tableRow+' 行（PDF 第 '+entry.source.pdfPage+' 页）；图形页 Fig.2 在 PDF 第 '+panel.source.pdfPage+' 页。'),
        el('p',{},'适用条件：双方完整状态恰为两档、由用户确认有序 H/L、且明确为直接影响；规则版本 '+curveData.ruleVersion+'。'),
        el('p',{},'尺度政策：'+curveData.scale.policy+'，原值 '+curveData.scale.originalValues.join('/')+'，不生成 ±3。'),
        el('table',{class:'relationships-table'},el('caption',{},'原表完整子矩阵：源 H/L × 目标 H/L'),rows)));
    }
    // 选图即出参考分数：这是论文 Table 1 的原值，直接摆出来，不再让人猜点了有没有反应。
    // 只是预览；真正落库仍走下面的确认与保存，口径不变。
    try{
      const aHigh=(typeof highA!=='undefined'&&src.find(s=>s.id===highA.value))||src[0];
      const bHigh=(typeof highB!=='undefined'&&tgt.find(s=>s.id===highB.value))||tgt[0];
      const aLow=src.find(s=>s.id!==aHigh.id),bLow=tgt.find(s=>s.id!==bHigh.id);
      if(aHigh&&bHigh&&aLow&&bLow){
        const cells=[[aHigh,bHigh,entry.matrix[0][0]],[aHigh,bLow,entry.matrix[0][1]],[aLow,bHigh,entry.matrix[1][0]],[aLow,bLow,entry.matrix[1][1]]];
        const t=el('table',{class:'relationships-table paper-score'},el('caption',{},'这张图对应的参考分数（论文原值，尚未保存）'));
        t.append(el('thead',{},el('tr',{},el('th',{},sourceLabel+' ↓ / '+targetLabel+' →'),el('th',{},bHigh.label),el('th',{},bLow.label))));
        t.append(el('tbody',{},
          el('tr',{},el('th',{},aHigh.label),el('td',{},String(entry.matrix[0][0])),el('td',{},String(entry.matrix[0][1]))),
          el('tr',{},el('th',{},aLow.label),el('td',{},String(entry.matrix[1][0])),el('td',{},String(entry.matrix[1][1])))));
        body.append(t,el('p',{class:'muted'},'高低两档按状态顺序预置，可改；点下面「保存已确认编码草案」才写进项目。'));
      }
    }catch{}
    shapeState.append(el('div',{class:'shape-detail'},thumbnail(panel.id,{width:168}),body));
  }
  for(const panel of panelIds){
    const card=el('article',{class:'shape-card','data-shape-panel':panel.id});
    const first=panel.templates.find(t=>t.encodingEnabled);
    card.append(el('button',{class:'shape-preview',type:'button','aria-label':'选择'+panel.label+'图形',disabled:!first,onclick:()=>{if(first)selectTemplate(first.id);}},thumbnail(panel.id)),el('p',{class:'shape-label'},panel.label));
    if(expert)card.append(el('p',{class:'muted'},panel.description));
    const list=el('div',{class:'shape-lines'});
    for(const t of panel.templates){
      const button=el('button',{class:'button shape-line',type:'button','aria-pressed':'false',disabled:!t.encodingEnabled,
        'data-template-id':t.id,onclick:()=>{selectTemplate(t.id);}},t.id+(t.encodingEnabled?'':'（停用）'));
      templateButtons.set(t.id,button);
      list.append(button);
    }
    card.append(list);
    grid.append(card);
  }
  box.append(grid,el('label',{},'编码模板（按编号直选，与上方缩略图同一选项）',templateSelect),shapeState);

  // ---- unchanged encoding form -------------------------------------------
  function checkbox(text){const i=el('input',{type:'checkbox','aria-label':text,onchange:invalidate});box.append(el('label',{class:'relationships-reference'},i,text));return i;}
  const choice=(label,options)=>{const s=el('select',{'aria-label':label,onchange:invalidate},el('option',{value:''},'请选择'),...options);box.append(el('label',{},label,s));return s;};
  const highA=choice('源变量高状态',src.map(s=>el('option',{value:s.id},s.label)));
  const highB=choice('目标变量高状态',tgt.map(s=>el('option',{value:s.id},s.label)));
  // 默认：第一档为高、第二档为低；范围取当前研究范围。用户想改再改。
  if(src.length===2){highA.value=src[0].id;}if(tgt.length===2){highB.value=tgt[0].id;}
  const direct=checkbox('我明确判断这是直接影响');const ordinal=checkbox('我确认双方全部二档均为有序高低，剩余状态为低');
  const region=el('input',{'aria-label':'编码适用地区',value:project.scope.regionId||'',oninput:invalidate}),years=el('input',{'aria-label':'编码适用年份',placeholder:'2030,2035',value:(project.scope.years||[]).join(', '),oninput:invalidate});
  const rationale=el('textarea',{'aria-label':'编码关系理由',oninput:invalidate});
  box.append(el('p',{},'保存为新的独立编码判断，不覆盖当前记录。选择论文图形/线型，不是年份路径。低、高的绑定依据实际定义，不按名称猜测。'),el('label',{},'编码适用地区',region),el('label',{},'编码适用年份',years),el('label',{},'实际关系理由（方法论文不能替代实际关系依据）',rationale),el('p',{class:'warning-text'},scaleWarning),notice,preview);
  const refs=el('details',{},el('summary',{},'关联已有实际关系依据（与方法论文分开）'));for(const e of project.data.evidence){const input=el('input',{type:'checkbox',onchange:event=>{if(event.target.checked)relationRefs.add(e.id);else relationRefs.delete(e.id);invalidate();}});refs.append(el('label',{class:'relationships-reference'},input,e.kind+' · '+e.sourceId+' · '+e.locator));}box.append(refs);
  const confirmation=el('input',{type:'checkbox','aria-label':'明确确认当前绑定、完整分数及全部警告'});
  const parseYears=()=>{const values=years.value.trim()?years.value.split(/[,，\s]+/).filter(Boolean).map(Number):[];if(values.some(y=>!Number.isInteger(y)||y<1900||y>2300)||new Set(values).size!==values.length)throw new Error('适用年份无效或重复');return values.sort((a,b)=>a-b);};
  function generate(){try{if([...box.querySelectorAll('input')].some(input=>input.validity.badInput))throw new Error('数值输入不完整，不能将不完整输入当作空白未判断');
    const args={sourceId,targetId,templateId:template,sourceHigh:highA.value,targetHigh:highB.value,ordinalConfirmed:ordinal.checked,directRelation:direct.checked,region:region.value,years:parseYears(),rationale:rationale.value,relationEvidenceRefs:[...relationRefs]};
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
    preview.setAttribute('data-filled','1');notice.textContent='预览已更新；请阅读警告、核对全部四格并明确确认。';onDirty();
  }catch(e){prepared=null;confirmation.checked=false;notice.textContent=e.message;}}
  box.append(el('button',{class:'button',onclick:generate},'更新编码预览'),el('label',{class:'relationships-reference'},confirmation,'明确确认当前绑定、完整分数及全部警告'),el('button',{class:'button primary-action',onclick:()=>{try{
    if(!prepared||!confirmation.checked)throw new Error('请更新预览并明确确认');
    if(!context.store.isCurrent(baseline))throw new Error('项目输入已变化，请取消并重新载入');
    const saved=confirmCurve(prepared);const result=context.actions.replaceProject(saved.project);if(!result.ok)throw new Error(result.error.message);onSaved(saved.judgment.id);
  }catch(e){notice.textContent=e.message;}}},'保存已确认编码草案'),el('button',{class:'button',onclick:onCancel},'取消编码'));

  // ---- mentor reference (collapsed, after the whole encoding flow) --------
  // mentorBlock() is itself a collapsed <details>, and it is appended only after
  // the paper picker, the state binding, the four-cell preview and the save
  // actions, so picking a paper line type flows straight into encoding. It stays
  // display-only: it writes no judgment, no four-cell score and no selection.
  box.append(el('hr',{class:'section-divider'}),el('p',{class:'muted'},'以下是与上方论文模板分开的导师原型参考，来源和可声称的结论都不同。'),mentorBlock());
  const children=[...box.children], split=children.indexOf(shapeState);
  const gallery=el('div',{class:'curve-gallery'}),work=el('div',{class:'curve-work'});
  children.forEach((n,i)=>(i<split?gallery:work).append(n));box.append(gallery,work);
  gallery.append(mentorAtlas());
  renderShape();
  if(initialTemplate)selectTemplate(initialTemplate);
}
