import { el } from '../../core/ui.mjs';
import { downloadJson } from '../exports/download.mjs';
import { inspectResearchCase, researchExample, searchResearchCase } from './research-search.mjs';
import { inspectInput } from './engine.mjs';
import { replayHandoffCase } from './case-replay.mjs';

function caseIssueLabel(path,input){
  const names={'scope.baselineYear':'基期年份','definitions.supportPeriod':'支持统计期间','definitions.supportThresholds':'支持程度分档','definitions.energyThresholds':'能耗变化分档',
    'definitionEvidence.baselineYear':'基期依据','definitionEvidence.supportPeriod':'统计期间依据','definitionEvidence.supportThresholds':'支持分档依据','definitionEvidence.energyThresholds':'能耗分档依据',sources:'来源列表'};
  if(names[path])return names[path];
  const match=/^cells\.(\d+)\.(score|evidence)/.exec(path);
  if(match){const c=input.cells?.[Number(match[1])];return (c?c.sourceState+' → '+c.targetState:'第'+(Number(match[1])+1)+'个评分格')+(match[2]==='score'?'／评分':'／依据');}
  return '交接信息';
}

export function researchCaseFromRun(input) {
  inspectInput(input);
  const ids=input.activeDescriptorIds,states=ids.map(id=>input.stateDefinitions.filter(s=>s.descriptorId===id).map(s=>s.id));
  const fixed={},locked=input.lockedStateIds||[],given=input.conditionedStateIds||[];
  if(locked.length&&given.length)throw Error('本研究入口暂不支持同一次检验同时含普通锁定和外生给定；请分别导出研究副本。');
  for(const state of [...locked,...given]){const i=states.findIndex(list=>list.includes(state));fixed[i]=states[i].indexOf(state);}
  const cells=input.matrix.entries.map(e=>{const i=states.findIndex(list=>list.includes(e.sourceStateId)),j=states.findIndex(list=>list.includes(e.targetStateId));return [i,states[i].indexOf(e.sourceStateId),j,states[j].indexOf(e.targetStateId),e.score];});
  const c={sizes:states.map(list=>list.length),cells,uncertain:[],fixed,mode:given.length?'conditioned':locked.length?'locked':'ordinary',
    labels:ids.map((id,i)=>[id,states[i]]),provenance:{projectId:input.projectId,revision:input.revision,year:input.year,source:'frozen-platform-run'}};
  inspectResearchCase(c);return c;
}
export function mountResearchPanel(container,archive) {
  let value=null,result=null,controller=null,disposed=false,version=0;
  const notice=el('p',{role:'status','data-research-status':''},'先导入研究矩阵，或载入合成示例。');
  const content=el('div'),output=el('div',{'aria-live':'polite'}),progress=el('p',{'data-research-progress':'',role:'status'});
  const save=el('button',{class:'button',disabled:true,onclick:()=>result&&downloadJson('有限范围研究结果.json',result)},'下载研究结果');
  const stop=el('button',{class:'button secondary',disabled:true,onclick:()=>controller?.abort()},'停止研究计算');
  const run=el('button',{class:'button',disabled:true,onclick:async()=>{
    if(!value||controller)return;const current=version,c=new AbortController();controller=c;run.disabled=true;stop.disabled=false;save.disabled=true;output.replaceChildren();
    notice.textContent='计算中；只使用研究副本。';
    try{
      const r=await searchResearchCase(value,{signal:c.signal,onProgress:p=>{if(!disposed&&current===version)progress.textContent='已检查 '+p.visitedMatrices+' 个取值组合，完成 '+p.evaluations+' 次配置检验。';}});
      if(disposed||current!==version)return;result=r;save.disabled=false;
      const label=r.status==='optimal'?'已证明最小合法改动':r.status==='invariant'?'在声明的有限范围内集合不变':r.status==='cancelled'?'已停止；未完成最小性判断':'达到计算限制；未完成最小性判断';
      notice.textContent=label;
      output.append(el('p',{},r.cost?(r.minimumProved?'最小代价':'目前找到的候选代价')+'：'+r.cost[0]+' 格，共改 '+r.cost[1]+' 分；新增 '+r.added.length+' 个，移出 '+r.removed.length+' 个。':'没有返回改变集合的评分见证。'),
        el('p',{},'基线 '+(r.baseline?.length??'未计算')+' 个自洽组合；只适用于导入的矩阵、约束和允许取值。'));
      if(!value.uncertain?.length)output.append(el('p',{},'未设置可改评分，范围只有原矩阵；这不证明其他改分下稳定。'));
    }catch(error){if(!disposed&&current===version)notice.textContent='研究未完成：'+error.message;}
    finally{if(controller===c){controller=null;if(!disposed){run.disabled=!value;stop.disabled=true;}}}
  }},'计算最小合法改动');
  const invalidate=()=>{version++;controller?.abort();result=null;save.disabled=true;output.replaceChildren();progress.textContent='';};
  const accept=c=>{inspectResearchCase(c);invalidate();value=structuredClone(c);notice.textContent='研究副本已载入；'+c.sizes.length+' 个因素，'+(c.uncertain?.length||0)+' 个可改格。';render();run.disabled=!!controller;};
  const input=el('input',{type:'file',accept:'.json,application/json','aria-label':'导入研究矩阵JSON',onchange:async event=>{
    const file=event.target.files?.[0];if(!file)return;const token=++version;controller?.abort();value=null;result=null;run.disabled=true;save.disabled=true;content.replaceChildren();output.replaceChildren();progress.textContent='';
    try{if(file.size>2*1024*1024)throw Error('文件超过2 MiB。');const c=JSON.parse(await file.text());if(!disposed&&token===version){
      if(c.format==='cib-case-handoff'){
        const replay=replayHandoffCase(c);result=replay;save.disabled=false;
        notice.textContent=replay.status==='completed'?'案例给定状态复算完成；证据内容尚未独立核验。':'案例资料未齐，未运行实证计算。';
        const lines=replay.status==='completed'?replay.comparisons.map(x=>'给定 '+x.givenState+'：'+x.count+' 个能耗状态自洽。'):
          [...replay.audit.issues.map(x=>caseIssueLabel(x.path,c)+'：'+x.message),...(replay.audit.pendingModelReview||[]).map(x=>'模型确认未完成：'+({baselineConfirmed:'基期选择',stateCoverageConfirmed:'状态覆盖范围',evidenceReviewed:'评分依据复核'}[x]||'模型信息'))];
        output.append(el('p',{},'本入口仅核对交接字段和引用，不把政策文本当作关系评分依据，不补0，不写回当前项目。'),el('ul',{},...lines.map(t=>el('li',{},t))));
      }else accept(c);
    }}
    catch(error){if(!disposed&&token===version){value=null;run.disabled=true;content.replaceChildren();notice.textContent='未载入：'+error.message;}}
    finally{event.target.value='';}
  }});
  function render(){
    content.replaceChildren();if(!value)return;
    const cells=el('select',{'aria-label':'研究可改评分格'},...value.cells.map((r,i)=>el('option',{value:i},'因素'+(r[0]+1)+'状态'+(r[1]+1)+' → 因素'+(r[2]+1)+'状态'+(r[3]+1)+'（原分'+r[4]+'）')));
    const add=el('button',{class:'button secondary',onclick:()=>{const r=value.cells[Number(cells.value)],k=r.slice(0,4);invalidate();value.uncertain||=[];value.uncertain=value.uncertain.filter(d=>JSON.stringify(d.cell)!==JSON.stringify(k));value.uncertain.push({cell:k,values:[...new Set([Math.max(-3,r[4]-1),r[4],Math.min(3,r[4]+1)])]});render();notice.textContent='可改范围已更新，重新计算才有结论。';}},'加入原分±1范围');
    const constraint=el('select',{'aria-label':'研究联动方式'},el('option',{value:'file'},'保留当前约束'),el('option',{value:'independent'},'全部可改格独立变化'),el('option',{value:'equal'},'全部可改格同幅变化'),el('option',{value:'sum'},'全部可改格的改变量和为0'));
    constraint.addEventListener('change',()=>{if(constraint.value==='file')return;const group=(value.uncertain||[]).map(d=>d.cell);if(constraint.value!=='independent'&&group.length<2){notice.textContent='联动需要至少两个可改格。';constraint.value='file';return;}invalidate();delete value.equal_delta_groups;delete value.sum_preserving_groups;if(constraint.value==='equal')value.equal_delta_groups=[group];if(constraint.value==='sum')value.sum_preserving_groups=[group];notice.textContent='联动约束已更新，请重新计算。';});
    content.append(el('p',{},'已设置 '+(value.uncertain?.length||0)+' 个可改格；等幅约束 '+(value.equal_delta_groups?.length||0)+' 项，保持和约束 '+(value.sum_preserving_groups?.length||0)+' 项。'),
      el('label',{},'选择可改评分格',cells),add,el('label',{},'选择联动方式',constraint),
      el('button',{class:'button text',onclick:()=>downloadJson('研究矩阵与允许范围.json',value)},'下载研究输入'));
  }
  const box=el('details',{class:'v5-card is-major','data-research-panel':''},el('summary',{},'研究工具：有限范围内的最小联合改分'),
    el('div',{class:'bd'},el('p',{},'检查完整情景集合是否会改变。也可导入河北案例交接JSON：资料不齐时只列缺项，齐备后复算给定支持状态。研究副本不会写回项目，结果不代表现实概率或政策效果。'),input,
      el('button',{class:'button secondary',onclick:()=>accept(researchExample())},'载入联合改分示例'),
      archive?.RunInput?el('button',{class:'button secondary',onclick:()=>{try{accept(researchCaseFromRun(archive.RunInput));}catch(error){notice.textContent=error.message;}}},'使用本次检验的冻结矩阵'):null,
      content,el('p',{},'最多10000种配置/矩阵、10000个取值组合和200000次配置检验；可停止。范围过大应转独立研究脚本。'),run,stop,notice,progress,output,save));
  container.append(box);
  return {dispose(){disposed=true;version++;controller?.abort();box.remove();}};
}
