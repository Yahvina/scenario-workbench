import {validateProject} from '../../core/contracts.mjs';
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sameField=(key,a,b)=>['evidenceRefs','validYears','stateIds'].includes(key)?same([...a].sort(),[...b].sort()):same(a,b);
export function definitionDraft(project,id=null){const d=project.data.descriptors.find(d=>d.id===id);return {id:d?.id||null,label:d?.label||'',role:d?.role||'input',evidenceRefs:[...(d?.evidenceRefs||[])],nodeId:project.data.taxonomy.find(n=>n.descriptorIds.includes(id))?.id||'',rootLabel:'',reason:'',states:d?d.stateIds.map(id=>structuredClone(project.data.states.find(s=>s.id===id))):[]};}
export function definitionChange(project,draft,newId){
 validateProject(project);const next=structuredClone(project),old=project.data.descriptors.find(d=>d.id===draft.id),warnings=[];
 need(!draft.id||old,'因素ID不存在，不可改名或搬移');need(typeof draft.label==='string'&&draft.label.trim(),'请填写因素名称');need(['input','outcome','context'].includes(draft.role),'角色无效');need(Array.isArray(draft.states)&&draft.states.length,'至少一个状态');
 const allocated=new Set(Object.values(project.data).flat().map(r=>r.id));const allocate=()=>{const id=newId();need(typeof id==='string'&&id.trim()&&!allocated.has(id),'新ID碰撞，保存已拒绝');allocated.add(id);return id;};
 const refs=value=>{need(Array.isArray(value)&&new Set(value).size===value.length&&value.every(id=>project.data.evidence.some(e=>e.id===id)),'依据引用无效');return [...value];};
 const factorId=old?.id||allocate(),stateIds=new Set(),changedStates=[];
 const states=draft.states.map(s=>{
  const prior=old&&project.data.states.find(x=>x.id===s.id&&x.descriptorId===old.id);need(!s.id||prior,'状态ID不可改名或跨因素使用');const sid=prior?.id||allocate();need(!stateIds.has(sid),'状态重复');stateIds.add(sid);
  need(typeof s.label==='string'&&s.label.trim(),'请填写状态名称');need(s.unit===null||typeof s.unit==='string','单位格式错误');need(Array.isArray(s.validYears)&&new Set(s.validYears).size===s.validYears.length&&s.validYears.every(y=>Number.isInteger(y)&&y>=1900&&y<=2300),'适用年份须1900—2300且不重复');need(s.scope&& !Array.isArray(s.scope)&&(s.scope.regionId===null||typeof s.scope.regionId==='string'&&s.scope.regionId.trim()),'状态地区格式错误');
  const r=s.range;need(r===null||r&&typeof r==='object'&&!Array.isArray(r)&&['min','max'].every(k=>r[k]===null||typeof r[k]==='number'&&Number.isFinite(r[k]))&&typeof r.minInclusive==='boolean'&&typeof r.maxInclusive==='boolean'&&(r.min===null||r.max===null||r.min<r.max||r.min===r.max&&r.minInclusive&&r.maxInclusive),'数值区间无效：须有限数/无界，不能倒置或为空');
  const fields={label:s.label.trim(),range:structuredClone(r),unit:s.unit?.trim()||null,validYears:[...s.validYears],scope:structuredClone(s.scope),evidenceRefs:refs(s.evidenceRefs)};
  const changed=!prior||Object.keys(fields).some(k=>!sameField(k,prior[k],fields[k]));if(changed)changedStates.push(sid);
  return {...(prior||{}),...fields,id:sid,descriptorId:factorId,version:prior?prior.version+(changed?1:0):1,provenance:changed?{origin:'user'}:structuredClone(prior.provenance)};
 });
 need(!old||old.stateIds.every(id=>stateIds.has(id)),'首包不支持删除状态');
 const descriptor={...(old||{}),id:factorId,label:draft.label.trim(),role:draft.role,stateIds:states.map(s=>s.id),evidenceRefs:refs(draft.evidenceRefs)};
 const changed=!old||changedStates.length||['label','role','stateIds','evidenceRefs'].some(k=>!sameField(k,descriptor[k],old[k]));
 if(!changed)return {project:structuredClone(project),changed:false,warnings:[],impact:{judgments:[],paths:[]}};
 need(typeof draft.reason==='string'&&draft.reason.trim(),'请填写定义变更理由');
 descriptor.version=old?old.version+1:1;descriptor.provenance={origin:'user'};
 const beforeJudgments=old?project.data.judgments.filter(j=>[j.sourceDescriptorId,j.targetDescriptorId].includes(old.id)):[],beforePaths=old?project.data.paths.filter(p=>p.descriptorId===old.id):[];
 const logId=allocate();descriptor.evidenceRefs=[...new Set([...descriptor.evidenceRefs,logId])];states.filter(s=>changedStates.includes(s.id)).forEach(s=>s.evidenceRefs=[...new Set([...s.evidenceRefs,logId])]);
 if(old)next.data.descriptors[next.data.descriptors.findIndex(d=>d.id===old.id)]=descriptor;else next.data.descriptors.push(descriptor);
 next.data.states=next.data.states.filter(s=>s.descriptorId!==factorId).concat(states);
 if(!old){let node=next.data.taxonomy.find(n=>n.id===draft.nodeId);if(!node){need(!draft.nodeId,'绑定分类不存在');need(!project.data.taxonomy.length,'已有分类时请明确选择绑定分类');need(typeof draft.rootLabel==='string'&&draft.rootLabel.trim(),'请命名新建独立根分类');node={id:allocate(),label:draft.rootLabel.trim(),kind:'category',parentIds:[],childIds:[],descriptorIds:[],evidenceRefs:[],version:0,provenance:{origin:'user'}};next.data.taxonomy.push(node);}node.descriptorIds.push(factorId);node.version++;node.evidenceRefs=[...new Set([...node.evidenceRefs,logId])];}
 const owned=id=>next.data.descriptors.find(d=>d.id===id).stateIds;
 for(const j of next.data.judgments.filter(j=>beforeJudgments.some(o=>o.id===j.id))){j.entries=owned(j.sourceDescriptorId).flatMap(a=>owned(j.targetDescriptorId).map(b=>({sourceStateId:a,targetStateId:b,score:null})));j.version++;j.reviewStatus='draft';j.rationale+='；定义已变化，原判断仅留历史，当前待重新判断';j.evidenceRefs=[...new Set([...j.evidenceRefs,logId])];j.provenance={origin:'user',sourceId:j.id,locator:logId};}
 for(const p of next.data.paths.filter(p=>beforePaths.some(o=>o.id===p.id))){p.points.forEach(point=>{point.stateId=null;});p.version++;p.evidenceRefs=[...new Set([...p.evidenceRefs,logId])];}
 for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){const a=states[i],b=states[j];if(a.unit!==b.unit||!same(a.scope,b.scope)||!same(a.validYears,b.validYears))warnings.push(a.label+' / '+b.label+'：单位或适用范围不同');if(a.range&&b.range&&a.unit===b.unit&&same(a.scope,b.scope)&&same(a.validYears,b.validYears)){const lo=Math.max(a.range.min??-Infinity,b.range.min??-Infinity),hi=Math.min(a.range.max??Infinity,b.range.max??Infinity);if(lo<hi||lo===hi&&[a,b].every(s=>(s.range.min!==lo||s.range.minInclusive)&&(s.range.max!==hi||s.range.maxInclusive)))warnings.push(a.label+' / '+b.label+'：区间重叠');else if(lo>hi||lo===hi&&[a,b].every(s=>(s.range.min!==lo||!s.range.minInclusive)&&(s.range.max!==hi||!s.range.maxInclusive)))warnings.push(a.label+' / '+b.label+'：区间存在空隙（仅为两状态比较，不代表整体覆盖）');}}
 const afterJudgments=next.data.judgments.filter(j=>beforeJudgments.some(o=>o.id===j.id)),afterPaths=next.data.paths.filter(p=>beforePaths.some(o=>o.id===p.id));
 next.data.evidence.push({id:logId,kind:'user-assumption',sourceId:factorId,locator:'definition-change/'+factorId,excerpt:JSON.stringify({reason:draft.reason,before:{descriptor:old||null,states:old?project.data.states.filter(s=>s.descriptorId===factorId):[],judgments:beforeJudgments,paths:beforePaths},after:{descriptor,states,judgments:afterJudgments,paths:afterPaths},notice:'定义变化：当前关系待重新判断，路径原数值保留、状态对应待核；候选和旧结果过期。',warnings}),reviewStatus:'draft',version:1,provenance:{origin:'user'}});
 validateProject(next);return {project:next,changed:true,warnings,impact:{judgments:beforeJudgments.map(j=>j.id),paths:beforePaths.map(p=>p.id)},before:old||null,after:descriptor};
}
