import {scientificKey} from '../../core/contracts.mjs';
import {buildMatrix} from './logic.mjs';
import {prepareRun} from '../solver/engine.mjs';
const candidates=new Map();
const pendingConfirmations=new Set(['ASSUMPTIONS_REQUIRED','STATE_ASSUMPTIONS_REQUIRED']);
export function prepareMatrixHandoff(project,{year,selectedJudgmentIds}){
 if(!Array.isArray(selectedJudgmentIds)||new Set(selectedJudgmentIds).size!==selectedJudgmentIds.length)throw new Error('选用记录须明确且不重复');
 const pre=prepareRun(project,{year,selectedJudgmentIds}),blocked=pre.diagnostics.filter(d=>d.classification==='block'&&!pendingConfirmations.has(d.code));
 if(blocked.length)throw new Error(blocked.map(d=>d.code+'：'+d.message).join('；'));
 const {snapshot}=buildMatrix(project,{year,selectedJudgmentIds});
 return {handoffVersion:1,projectInputSnapshot:structuredClone({schemaVersion:project.schemaVersion,contractVersion:project.contractVersion,projectId:project.id,revision:project.revision,scope:project.scope,data:project.data,selection:project.selection}),year,selectionOfJudgments:selectedJudgmentIds.map(id=>({id,version:project.data.judgments.find(j=>j.id===id).version})),matrix:structuredClone(snapshot),diagnostics:structuredClone(pre.diagnostics)};
}
export function sendMatrixHandoff(project,options){const candidate=prepareMatrixHandoff(project,options);candidates.set(project.id,structuredClone(candidate));return structuredClone(candidate);}
export function readMatrixHandoff(projectId){return candidates.has(projectId)?structuredClone(candidates.get(projectId)):null;}
export function verifyMatrixHandoff(project,candidate){
 try{
  const s=candidate?.projectInputSnapshot;
  if(candidate?.handoffVersion!==1||s?.schemaVersion!==project.schemaVersion||s?.contractVersion!==project.contractVersion||s?.projectId!==project.id||s?.revision!==project.revision||scientificKey(s)!==scientificKey(project))throw new Error('来源项目或科学输入已变化，候选已过期，请返回矩阵页重新确认发送');
  if(!Array.isArray(candidate.selectionOfJudgments)||candidate.selectionOfJudgments.some(j=>!j||project.data.judgments.find(r=>r.id===j.id)?.version!==j.version))throw new Error('候选选用记录/版本不符，请重新发送');
  const fresh=prepareMatrixHandoff(project,{year:candidate.year,selectedJudgmentIds:candidate.selectionOfJudgments.map(j=>j.id)});
  if(JSON.stringify(fresh.matrix)!==JSON.stringify(candidate.matrix))throw new Error('候选矩阵与当前重新构造结果不符，拒绝采用');
  return {ok:true,candidate:fresh};
 }catch(error){return {ok:false,message:error.message};}
}
