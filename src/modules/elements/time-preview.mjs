import {el} from '../../core/ui.mjs';
import {interpolate} from '../timeline/logic.mjs';

const NS='http://www.w3.org/2000/svg';
function svgNode(tag,attrs,text=''){
  const node=document.createElementNS(NS,tag);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
  node.textContent=text;return node;
}
export function timePreview(project,id,edit){
  const box=el('section',{class:'time-preview','aria-label':'因素时间变化'});
  const descriptor=project.data.descriptors.find(d=>d.id===id);
  if(!descriptor){box.append(el('h3',{},'选一个因素，看它随年份怎么变'),el('p',{},'勾选左边的因素，曲线会显示在这里。'));return box;}
  box.append(el('h3',{},descriptor.label+' · 随年份怎么变'));
  const paths=project.data.paths.filter(p=>p.descriptorId===id);
  if(!paths.length){box.append(el('p',{},'这个因素还没有时间路径。'),el('button',{class:'button',onclick:edit},'新建时间路径'));return box;}
  const host=el('div');box.append(host);
  const draw=path=>{
    host.replaceChildren();
    const years=[...new Set([...project.scope.years,...path.points.map(p=>p.year)])].sort((a,b)=>a-b);
    const points=years.map(year=>({year,reading:interpolate(path,year)}));
    const values=points.flatMap(p=>p.reading?.value===null||p.reading?.value===undefined?[]:[p.reading.value]);
    if(!years.length||!values.length){host.append(el('p',{},'尚无可绘制的数值节点。'));}
    else{
      const lo=Math.min(...values),hi=Math.max(...values),pad=(hi-lo||Math.max(Math.abs(lo)*.1,1))*.15;
      const x=year=>48+(year-years[0])/(years.at(-1)-years[0]||1)*400;
      const y=value=>185-(value-lo+pad)/(hi-lo+pad*2)*145;
      const svg=svgNode('svg',{viewBox:'0 0 480 235',role:'img','aria-label':descriptor.label+'的时间曲线'});
      svg.append(svgNode('path',{d:'M48 25V185H450',stroke:'#aab5c0',fill:'none'}));
      svg.append(svgNode('text',{x:48,y:18,'font-size':12,fill:'#454d56'},path.unit||'单位待指定'));
      svg.append(svgNode('text',{x:420,y:230,'font-size':12,fill:'#454d56'},'年份'));
      for(const year of [...new Set([years[0],...project.scope.years,years.at(-1)])])svg.append(svgNode('text',{x:x(year),y:207,'font-size':11,'text-anchor':'middle',fill:'#454d56'},year));
      for(const value of [...new Set([lo,hi])])svg.append(svgNode('text',{x:40,y:y(value)+4,'font-size':11,'text-anchor':'end',fill:'#454d56'},Number(value.toFixed(2))));
      for(let i=1;i<path.points.length;i++){
        const a=path.points[i-1],b=path.points[i];
        if(path.interpolation==='none'||a.value===null||b.value===null)continue;
        const d=path.interpolation==='step'?`M${x(a.year)} ${y(a.value)}H${x(b.year)}V${y(b.value)}`:`M${x(a.year)} ${y(a.value)}L${x(b.year)} ${y(b.value)}`;
        svg.append(svgNode('path',{d,stroke:'#456d91','stroke-width':2,fill:'none'}));
      }
      for(const point of path.points){if(point.value===null)continue;const dot=svgNode('circle',{cx:x(point.year),cy:y(point.value),r:4,fill:'#456d91'});dot.append(svgNode('title',{},point.year+'：'+point.value));svg.append(dot);}
      host.append(svg);
    }
    host.append(el('div',{class:'preview-values'},...project.scope.years.map(year=>{const r=interpolate(path,year);return el('span',{},year+'：'+(r?.value===null||r?.value===undefined?'未设定':Number(r.value.toFixed(4))));})),el('p',{},path.interpolation==='none'?'仅显示原始节点；尚未连成推算曲线。':path.interpolation==='linear'?'节点之间按直线推算。':'节点之间保持前一节点的值。'),el('button',{class:'button primary-action',onclick:edit},'调整年份与节点（可拖动）'));
    if(path.scope?.regionId!==project.scope.regionId)host.append(el('p',{class:'warning-text'},'这条路径的地区与当前项目不同，请先核对适用范围。'));
  };
  if(paths.length>1){const picker=el('select',{'aria-label':'查看这条时间路径',onchange:e=>draw(paths.find(p=>p.id===e.target.value))},...paths.map((p,i)=>el('option',{value:p.id},'路径 '+(i+1)+' · '+(p.unit||'单位未指定'))));box.insertBefore(picker,host);}
  draw(paths[0]);return box;
}
