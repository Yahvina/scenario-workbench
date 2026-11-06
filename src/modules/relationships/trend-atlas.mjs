import {el} from '../../core/ui.mjs';
import {panels,thumbnail} from './shape-catalog.mjs';
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
 else root.append();
 root.append(el('details',{class:'trend-atlas-source'},el('summary',{},'图形出处与评分规则'),el('p',{},curveData.source.citation+' · Fig.2 / Table 1。图形可浏览、选择；三档及更多状态不自动外推论文分数。双方完整二档时，仍需核对高低绑定、直接影响、依据和四格分数后明确确认。')));
 if(selected){const panel=panels().find(p=>p.id===selected);if(panel)choice.textContent='已选：'+panel.label;}
 return root;
}
