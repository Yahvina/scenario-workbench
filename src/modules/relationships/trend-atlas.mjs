import {el} from '../../core/ui.mjs';
import {panels,thumbnail,MENTOR_SHAPES,MENTOR_GLYPHS} from './shape-catalog.mjs';
import {curveData} from './curve-data.mjs';
export function trendAtlas({onSelect=()=>{},onEncode=null,selected=null}={}){
 const root=el('section',{class:'trend-atlas','aria-label':'关系图形图册'},el('h3',{},'选一种关系趋势作参考'),el('span',{class:'trend-badge'},'12 类论文图形 · 编号在图下方'),);
 const grid=el('div',{class:'trend-atlas-grid'}),choice=el('p',{class:'trend-atlas-choice',role:'status'}),buttons=new Map();
 function choose(panel){selected=panel.id;for(const[id,b]of buttons)b.setAttribute('aria-pressed',String(id===selected));choice.textContent='已选：'+panel.label;onSelect(panel);}
 for(const panel of panels()){
  const button=el('button',{type:'button',class:'trend-card','data-atlas-panel':panel.id,'aria-label':'选择趋势：'+panel.label,'aria-pressed':String(panel.id===selected),onclick:()=>choose(panel)},thumbnail(panel.id),el('strong',{},panel.label),el('span',{class:'trend-ids'},panel.templates.map(t=>t.id+(t.encodingEnabled?'':' 停用')).join(' · ')));
  buttons.set(panel.id,button);grid.append(button);
 }
 root.append(grid,choice);
 if(onEncode)root.append(el('button',{class:'button',onclick:()=>onEncode(selected)},'按所选图形新建评分预览'));
 else root.append(el('p',{class:'trend-atlas-note'},'选图帮助表达趋势；在评分区核对各状态之间的影响。'));
 root.append(el('details',{class:'trend-atlas-source'},el('summary',{},'图形出处与评分规则'),el('p',{},curveData.source.citation+' · Fig.2 / Table 1。图形可浏览、选择；三档及更多状态不自动外推论文分数。双方完整二档时，仍需核对高低绑定、直接影响、依据和四格分数后明确确认。')));
 root.append(mentorAtlas());
 if(selected){const panel=panels().find(p=>p.id===selected);if(panel)choice.textContent='已选：'+panel.label;}
 return root;
}
export function mentorAtlas(){
 const mentors=el('section',{class:'atlas-mentors'},el('h3',{},'导师演示的八类趋势'),el('p',{class:'trend-atlas-note'},'原型示意 · 仅供参考 · 不生成评分，与论文模板分开'));
 const mentorGrid=el('div',{class:'atlas-mentor-grid'});
 for(const shape of MENTOR_SHAPES){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 200 145');svg.setAttribute('aria-hidden','true');
  const line=document.createElementNS(svg.namespaceURI,'path');line.setAttribute('d',MENTOR_GLYPHS[shape.id]);line.setAttribute('fill','none');line.setAttribute('stroke','#606973');line.setAttribute('stroke-width','2');line.setAttribute('stroke-dasharray','6 4');svg.append(line);
  mentorGrid.append(el('button',{class:'atlas-mentor-card',type:'button','aria-label':'放大查看导师示意：'+shape.label,onclick:()=>{
    const dialog=el('dialog',{class:'mentor-zoom','aria-label':shape.label},el('h3',{},shape.label),svg.cloneNode(true),el('p',{},'导师原型的趋势示意，仅供参考，不生成评分。'));
    dialog.append(el('button',{class:'button',onclick:()=>dialog.close()},'关闭大图'));dialog.addEventListener('close',()=>dialog.remove());mentors.append(dialog);dialog.showModal();
  }},svg,el('span',{},shape.label)));
 }
 mentors.append(mentorGrid);return mentors;
}
