import {el, infoTip} from '../../core/ui.mjs';
import {stateAtYear,changeYearState} from './state-plan.mjs';
const NS='http://www.w3.org/2000/svg';
function node(tag,attrs,text=''){const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));n.textContent=text;return n;}
export function statePlanPanel(project,descriptorId,context,canChange){
 const d=project.data.descriptors.find(d=>d.id===descriptorId),states=d.stateIds.map(id=>project.data.states.find(s=>s.id===id)).filter(Boolean),years=[...project.scope.years].sort((a,b)=>a-b);
 const box=el('section',{class:'state-plan-panel','aria-label':'按年份选择状态'},el('h3',{},d.label+' · 年份与状态'));
 if((d.evidenceRefs||[]).includes('d46-source-states'))box.append(el('p',{class:'state-note'},el('b',{},'参考状态'),infoTip('这三档状态是平台参考设定：阈值、单位与文献依据均未核定，不代表已核实的政策口径。选择只表达你的方案，不是政策事实，也不锁定检验结果。','参考状态的含义')));
 const message=el('p',{role:'status',class:'state-plan-message'});
 if(!years.length){box.append(el('p',{},'先确定研究年份。'),el('button',{class:'button',onclick:()=>context.navigate('workspace')},'设置年份'));return box;}
 if(!states.length){box.append(el('p',{},'这个因素还没有状态可选。'),el('button',{class:'button',onclick:()=>{const details=document.querySelector('.factor-management');if(details){details.open=true;details.scrollIntoView({block:'start'});}}},'补充这个因素的状态'));return box;}
 function save(year,id){try{if(!canChange())return;const next=changeYearState(context.store.read(),descriptorId,year,id,()=>crypto.randomUUID());const result=context.actions.replaceProject(next);if(!result.ok)throw new Error(result.error.message);
  let extra='';try{if(id&&!localStorage.getItem('scenario-workbench.ref-state-notice')){localStorage.setItem('scenario-workbench.ref-state-notice','1');extra=' 这是第一次采用参考状态：三档为平台参考设定，阈值与依据未核定，详情见上方「参考状态 ⓘ」。';}}catch{}
  context.notify(context.persistenceState().ok?'已保存 '+year+' 年的状态选择。'+extra:'状态已更新，但浏览器保存失败，请下载备份。');}catch(e){message.textContent='未保存：'+e.message;}}
 const svg=node('svg',{viewBox:'0 0 560 230',role:'img','aria-label':d.label+'各年的状态安排'});
 const left=155,right=530,top=28,bottom=185;
 const x=year=>years.length===1?(left+right)/2:left+(year-years[0])/(years.at(-1)-years[0])* (right-left);
 const y=index=>states.length===1?(top+bottom)/2:top+index/(states.length-1)*(bottom-top);
 states.forEach((s,i)=>{svg.append(node('line',{x1:left,y1:y(i),x2:right,y2:y(i),stroke:'#e1e4e8'}));const text=node('text',{x:left-12,y:y(i)+4,'text-anchor':'end'},s.label.length>13?s.label.slice(0,12)+'…':s.label);text.append(node('title',{},s.label));svg.append(text);});
 const chosen=years.map(year=>({year,id:stateAtYear(project,descriptorId,year)}));
 for(let i=1;i<chosen.length;i++){const a=chosen[i-1],b=chosen[i],ai=states.findIndex(s=>s.id===a.id),bi=states.findIndex(s=>s.id===b.id);if(ai>=0&&bi>=0)svg.append(node('path',{d:`M${x(a.year)} ${y(ai)}L${x(b.year)} ${y(bi)}`,fill:'none',stroke:'#456d91','stroke-width':2,'stroke-dasharray':'5 4'}));}
 let drag=null;
 chosen.forEach(c=>{svg.append(node('text',{x:x(c.year),y:216,'text-anchor':'middle'},c.year));const index=states.findIndex(s=>s.id===c.id);if(index<0)return;const dot=node('circle',{cx:x(c.year),cy:y(index),r:7,fill:'#fff',stroke:'#456d91','stroke-width':3,'data-year':c.year,'data-state-id':c.id,class:'state-plan-point'});dot.append(node('title',{},c.year+'：'+states[index].label));svg.append(dot);});
 if(chosen.every(c=>!c.id))svg.append(node('text',{x:(left+right)/2,y:110,'text-anchor':'middle'},'在下方选择各年的状态'));
 svg.addEventListener('pointerdown',e=>{const year=Number(e.target.dataset.year);if(!years.includes(year)||e.button!==0)return;if(!canChange())return;e.preventDefault();drag={year,index:states.findIndex(s=>s.id===e.target.dataset.stateId),dot:e.target};svg.setPointerCapture(e.pointerId);});
 svg.addEventListener('pointermove',e=>{if(!drag)return;const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());drag.index=states.length===1?0:Math.max(0,Math.min(states.length-1,Math.round((point.y-top)/(bottom-top)*(states.length-1))));drag.dot.setAttribute('cy',y(drag.index));message.textContent=drag.year+' → '+states[drag.index].label;});
 svg.addEventListener('pointerup',e=>{if(!drag)return;const active=drag;drag=null;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);save(active.year,states[active.index].id);});
 const cancel=()=>{if(drag){const original=states.findIndex(s=>s.id===stateAtYear(project,descriptorId,drag.year));drag.dot.setAttribute('cy',y(original));drag=null;message.textContent='已取消拖动。';}};
 svg.addEventListener('pointercancel',cancel);svg.addEventListener('lostpointercapture',cancel);
 const selects=el('div',{class:'state-year-options'},...years.map(year=>{const select=el('select',{'aria-label':year+'年状态',onchange:e=>{save(year,e.target.value||null);e.target.value=stateAtYear(context.store.read(),descriptorId,year)||'';}},el('option',{value:''},'请选择状态'),...states.map(s=>el('option',{value:s.id},s.label)));select.value=stateAtYear(project,descriptorId,year)||'';return el('label',{},year+' 年',select);}));
 const anyPicked=chosen.some(c=>c.id);
 box.append(selects,message);
 if(anyPicked)box.append(svg,el('details',{class:'state-chart-note'},el('summary',{},'这张图怎么读'),el('p',{},'纵轴是状态顺序，不是数值大小；虚线是你的安排，不是预测，也不锁定检验结果。可拖动节点修改。')));
 else box.append(el('p',{class:'state-empty'},'选好年份状态后，这里会出现时间图；也可以直接拖动。'));
 return box;
}
