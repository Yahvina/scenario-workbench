import {el} from '../../core/ui.mjs';
import {panels,thumbnail} from './shape-catalog.mjs';
import {curveData} from './curve-data.mjs';
export function trendAtlas({onSelect=()=>{},onEncode=null,selected=null}={}){
 const root=el('section',{class:'trend-atlas','aria-label':'关系图形图册'},el('h3',{},'选一种关系趋势作参考'),el('span',{class:'trend-badge'},'12 类论文图形'),);
 const grid=el('div',{class:'trend-atlas-grid'}),choice=el('p',{class:'trend-atlas-choice',role:'status'}),cards=new Map();
 let pickedLine=null;   // 同一形状选了"较弱/较强"哪一个
 const strengthOf=t=>t&&t.lineChoices.length===1?(t.lineChoices[0]===1?'较弱':'较强'):'';
 // 强弱开关只在"选中的那张卡"里出现：平时 12 张卡干干净净，选中后当场能调。
 const paint=()=>{
  for(const[id,card]of cards){
   const on=id===selected;
   card.classList.toggle('is-selected',on);
   const lines=card.querySelector('.trend-lines');
   if(lines)lines.hidden=!on;
  }
  for(const chip of root.querySelectorAll('.trend-line'))chip.setAttribute('aria-pressed',String(chip.dataset.line===pickedLine));
 };
 function choose(panel,template){
  selected=panel.id;pickedLine=template&&template.lineChoices.length===1?template.id:null;paint();
  choice.textContent='已选：'+panel.label+(strengthOf(template)?'（'+strengthOf(template)+'）':'');
  onSelect(panel,template);
 }
 for(const panel of panels()){
  const enabled=panel.templates.filter(t=>t.encodingEnabled);
  const head=el('button',{type:'button',class:'trend-card-head','data-atlas-panel':panel.id,'aria-label':'选择趋势：'+panel.label,onclick:()=>choose(panel,enabled[0])},thumbnail(panel.id),el('strong',{},panel.label));
  const card=el('div',{class:'trend-card','data-atlas-card':panel.id},head);
  // 同一形状有强弱两种线型时才有这个开关；平时收着，选中才显示。
  const single=enabled.length===2&&enabled.every(t=>t.lineChoices.length===1);
  if(single){
   card.append(el('span',{class:'trend-lines',hidden:true},...enabled.map(t=>{
    const chip=el('button',{type:'button',class:'trend-line','data-line':t.id,onclick:()=>choose(panel,t)},strengthOf(t));
    return chip;
   })));
  }
  cards.set(panel.id,card);grid.append(card);
 }
 paint();
 root.append(grid,choice);
 if(onEncode)root.append(el('button',{class:'button',onclick:()=>onEncode(selected)},'按所选图形新建评分预览'));
 else root.append();
 root.append(el('details',{class:'trend-atlas-source'},el('summary',{},'图形出处与评分规则'),el('p',{},curveData.source.citation+' · Fig.2 / Table 1。图形可浏览、选择；三档及更多状态不自动外推论文分数。双方完整二档时，仍需核对高低绑定、直接影响、依据和四格分数后明确确认。')));
 if(selected){const panel=panels().find(p=>p.id===selected);if(panel)choice.textContent='已选：'+panel.label;}
 paint();
 return root;
}
