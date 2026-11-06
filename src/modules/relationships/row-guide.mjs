// H3 纯展示辅助：三档对三档时的逐行判断视图。
// 硬纪律：只读写调用方传入的同一份 draft.entries，不生成分数、不补零、不写证据或修改记录、
// 不改反向关系、不从状态名称猜低/中/高，也不重排传入的状态顺序。
import {el} from '../../core/ui.mjs';
import {MENTOR_GLYPHS,MENTOR_SHAPES,MENTOR_SKETCH_NOTE} from './shape-catalog.mjs';

export const ROW_GUIDE_NOTE='逐行判断与直接填表使用同一份未保存草稿：这里填的分数就是表格里的分数，切换显示方式不会清空。参考图形只用于当前展示，不填分数、不补零，也不写入证据或修改记录。';
export const ROW_GUIDE_SCORE_NOTE='−3…−1抑制，+1…+3促进；0=明确判断没有直接影响，空白=尚未判断，两者不同。';
export const ROW_GUIDE_ORDER_NOTE='有序趋势辅助是可选的：只有你先确认两侧三档具有顺序，并逐档标出低、中、高对应状态，它才会显示。它只按你已填的分数读出顺序，不替你生成分数，也不改变录入顺序。';
const NS='http://www.w3.org/2000/svg';

function svgNode(name,attrs){
  const node=document.createElementNS(NS,name);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
  return node;
}

export function sketchNode(id,width=132){
  const svg=svgNode('svg',{viewBox:'0 0 200 145',width,'aria-hidden':'true',focusable:'false',class:'shape-thumb mentor-sketch'});
  svg.append(svgNode('path',{d:MENTOR_GLYPHS[id],fill:'none',stroke:'var(--tx3)','stroke-width':2,'stroke-linecap':'round','stroke-dasharray':'6 4'}));
  return svg;
}

// 只做展示归一：空值仍是未判断，不补 0，也不把无效输入当成分数。
export function readRowValue(value){
  const raw=String(value??'').trim();
  if(raw==='')return {kind:'missing',text:'未判断',score:null};
  const n=Number(raw);
  if(!Number.isInteger(n)||Math.abs(n)>3)return {kind:'invalid',text:'待修正：'+raw,score:null};
  return {kind:'scored',text:n===0?'0 · 没关系':String(n),score:n};
}

export function rowGuide({draft,sources,targets,sourceLabel='源',targetLabel='目标',expert=false,onChange=()=>{}}){
  const entryFor=(a,b)=>draft.entries.find(e=>e.sourceStateId===a.id&&e.targetStateId===b.id);
  const root=el('div',{class:'relationships-row-guide','data-row-guide':''});
  const cells=new Map();          // aId\0bId -> {row:label节点, table:td节点, input, entry}
  const readoutLines=new Map();   // sourceStateId -> p节点

  root.append(el('p',{class:'muted'},ROW_GUIDE_NOTE),el('p',{class:'muted'},ROW_GUIDE_SCORE_NOTE));

  function paintOne(key){
    const item=cells.get(key);
    if(!item)return;
    const state=readRowValue(item.entry.value);
    const scored=state.kind==='scored';
    item.row.className='relationships-row-cell '+(scored?'relationships-score':'relationships-missing');
    item.row.style.background=scored?'var(--s'+state.score+')':'';
    item.input.setAttribute('aria-invalid',item.input.validity.badInput||state.kind==='invalid'?'true':'false');
    item.table.className=scored?'relationships-score':'relationships-missing';
    item.table.setAttribute('data-row-preview-state',state.kind);
    item.table.textContent=state.text;
  }
  function paintAll(){for(const key of cells.keys())paintOne(key);refreshReadout();}
  function refreshReadout(){
    if(!readoutLines.size)return;
    const orderedSource=orderedStates('source',sources),orderedTarget=orderedStates('target',targets);
    if(!orderedSource||!orderedTarget)return;
    for(const sourceState of orderedSource){
      const line=readoutLines.get(sourceState.id);
      if(!line)continue;
      line.textContent='源「'+sourceState.label+'」按目标低→中→高：'+orderedTarget.map(targetState=>readRowValue(entryFor(sourceState,targetState)?.value).text).join('、');
    }
  }

  // ---- 参考图形：只影响当前展示，任何选择都不写草稿 ----
  const graphicSelect=el('select',{'aria-label':'参考趋势图形（仅供参考，不填分数）'},el('option',{value:''},'不显示参考图形'),...MENTOR_SHAPES.map(shape=>el('option',{value:shape.id},shape.label+(shape.parenthetical?'（'+shape.parenthetical+'）':''))));
  const graphicHost=el('div',{class:'row-guide-sketch-host'});
  function renderGraphic(){
    graphicHost.replaceChildren();
    const shape=MENTOR_SHAPES.find(s=>s.id===graphicSelect.value);
    if(!shape)return;
    graphicHost.append(el('article',{class:'row-guide-sketch','data-row-guide-sketch':shape.id},
      sketchNode(shape.id),
      el('p',{class:'row-guide-sketch-note'},shape.label+(shape.glyphClass?'：'+shape.glyphClass:'')),
      el('p',{class:'row-guide-sketch-note'},MENTOR_SKETCH_NOTE)));
  }
  graphicSelect.addEventListener('change',renderGraphic);
  root.append(el('div',{class:'row-guide-graphic'},el('label',{},'参考趋势图形（仅供参考，不填分数）',graphicSelect),graphicHost));
  renderGraphic();

  // ---- 可选的有序趋势辅助：默认不显示，只读不写 ----
  const LEVELS=['低','中','高'];
  const order={source:{on:false,map:{}},target:{on:false,map:{}}};
  const orderHost=el('div',{class:'row-guide-order-body'});
  function orderedStates(side,states){
    if(!order[side].on)return null;
    const pairs=states.map(state=>({state,level:order[side].map[state.id]||''}));
    if(pairs.some(pair=>!pair.level)||new Set(pairs.map(pair=>pair.level)).size!==states.length)return null;
    return LEVELS.map(level=>pairs.find(pair=>pair.level===level)?.state).filter(Boolean);
  }
  function renderOrder(){
    const run=()=>{renderOrder();refreshReadout();};
    orderHost.replaceChildren();
    for(const side of ['source','target']){
      const box=el('input',{type:'checkbox','data-order-side':side,onchange:event=>{order[side].on=event.target.checked;run();}});
      box.checked=order[side].on;
      orderHost.append(el('label',{class:'relationships-reference'},box,'我确认「'+(side==='source'?sourceLabel:targetLabel)+'」的三个状态具有顺序（低→中→高）'));
    }
    for(const side of ['source','target']){
      if(!order[side].on)continue;
      const fields=el('div',{class:'relationships-controls'});
      for(const state of (side==='source'?sources:targets)){
        const select=el('select',{'aria-label':'「'+state.label+'」对应'+(side==='source'?sourceLabel:targetLabel)+'档位',onchange:event=>{order[side].map[state.id]=event.target.value;run();}});
        select.append(el('option',{value:''},'未标明'),...LEVELS.map(level=>el('option',{value:level},level)));
        select.value=order[side].map[state.id]||'';
        fields.append(el('label',{},'「'+state.label+'」对应',select));
      }
      orderHost.append(el('p',{class:'muted'},'请逐档标明低、中、高；同名或同位置的档位不会被自动推断。'),fields);
    }
    readoutLines.clear();
    const orderedSource=orderedStates('source',sources),orderedTarget=orderedStates('target',targets);
    if(!orderedSource||!orderedTarget){
      orderHost.append(el('p',{class:'row-guide-order-pending','data-order-assist':'pending'},'有序趋势辅助尚未可用：需要两侧都确认顺序，并把三档分别标为低、中、高。'));
      return;
    }
    const list=el('div',{class:'row-guide-order-readout','data-order-assist':'ready'});
    for(const sourceState of orderedSource){
      const line=el('p',{'data-order-line':sourceState.id});
      readoutLines.set(sourceState.id,line);
      list.append(line);
    }
    orderHost.append(list);
  }
  root.append(el('details',{class:'row-guide-order'},el('summary',{},'有序趋势辅助（可选；确认三档顺序后才显示）'),el('p',{class:'muted'},ROW_GUIDE_ORDER_NOTE),orderHost));

  // ---- 保存前核对九格：先建单元格，逐行输入直接写入这里（不复制、不补值） ----
  const preview=el('table',{class:'relationships-table'},el('caption',{},'保存前核对：'+sourceLabel+' → '+targetLabel+'，完整 '+sources.length+'×'+targets.length+' 格；缺口保持未判断'));
  preview.append(el('thead',{},el('tr',{},el('th',{scope:'col'},'源 ↓ / 目标 →'),...targets.map(b=>el('th',{scope:'col'},b.label)))));
  const previewBody=el('tbody');
  for(const a of sources){
    const row=el('tr',{},el('th',{scope:'row'},a.label,expert?el('small',{},a.id):null));
    for(const b of targets){
      const cell=el('td',{'data-row-preview-source':a.id,'data-row-preview-target':b.id});
      cells.set(a.id+'\u0000'+b.id,{table:cell,entry:entryFor(a,b)});
      row.append(cell);
    }
    previewBody.append(row);
  }
  preview.append(previewBody);

  // ---- 逐行问答：按传入顺序逐行提问，不重排、不改名 ----
  const rowsHost=el('div',{class:'row-guide-rows'});
  for(const a of sources){
    const targetsText=targets.map(b=>'「'+b.label+'」').join('');
    const article=el('article',{class:'relationships-row','data-row-source':a.id},
      el('p',{class:'row-question'},'当源处于「'+a.label+'」时，它如何直接影响目标处于'+targetsText+'？'),
      expert?el('small',{class:'row-ids'},a.id):null);
    for(const b of targets){
      const key=a.id+'\u0000'+b.id;
      const item=cells.get(key);
      const input=el('input',{type:'number',min:'-3',max:'3',step:'1','data-row-source':a.id,'data-row-target':b.id,'aria-label':'当源处于 '+a.label+' 时，「'+b.label+'」的直接影响评分',placeholder:'未判断'});
      input.value=item.entry.value;
      item.input=input;
      const cell=el('label',{class:'relationships-row-cell'},el('span',{class:'row-cell-label'},b.label,expert?el('small',{},b.id):null),input);
      item.row=cell;
      input.addEventListener('input',event=>{item.entry.value=event.target.value;paintOne(key);refreshReadout();onChange();});
      article.append(cell);
    }
    rowsHost.append(article);
  }
  root.append(el('h4',{class:'row-guide-heading'},'逐行判断：'+sourceLabel+' → '+targetLabel),rowsHost,
    el('h4',{class:'row-guide-heading'},'保存前核对'),el('div',{class:'relationships-scroll',tabindex:'0','aria-label':'逐行判断保存前九格核对表，窄屏可横向滚动'},preview));

  renderOrder();
  paintAll();
  return {root,repaint:paintAll};
}
