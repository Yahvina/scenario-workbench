import { auditHandoff } from './case-handoff.mjs';
import { runCib } from '../../standalone-cib/index.mjs';

export function replayHandoffCase(raw) {
  const input=structuredClone(raw),audit=auditHandoff(input);
  if(audit.status!=='structurally-ready-for-review')return {format:'scenario-workbench.case-replay',version:1,status:'not-ready',audit,input,comparisons:[],scientificValidity:'not-assessed'};
  const [support,energy]=input.descriptors;
  const block=support.states.map(a=>energy.states.map(b=>input.cells.find(c=>c.sourceState===a&&c.targetState===b).score));
  const core={descriptors:input.descriptors.map(d=>({id:d.id,states:d.states})),blocks:[[support.id,energy.id,block]]};
  const comparisons=support.states.map(state=>{
    const result=runCib(core,{mode:'conditioned',fixed:{[support.id]:state}});
    if(result.status!=='completed')throw Error('案例给定状态未完成计算。');
    return {givenState:state,mode:'conditioned',count:result.count,configurations:result.scenarios.map(s=>s.configuration),explanations:result.scenarios.map(s=>s.balances)};
  });
  return {format:'scenario-workbench.case-replay',version:1,status:'completed',audit,input,comparisons,scientificValidity:'not-assessed',
    meaning:'仅在外生给定支持状态下检查能耗状态的支持分；未补反向评分，不是实际政策效果或真实能耗预测。'};
}
