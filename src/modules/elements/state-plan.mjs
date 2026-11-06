export function statePlanFor(project,descriptorId){
 return project.data.paths.filter(p=>p.descriptorId===descriptorId&&p.provenance?.locator==='state-plan'&&p.scope.regionId===project.scope.regionId).at(-1)||null;
}
export function stateAtYear(project,descriptorId,year){
 const plan=statePlanFor(project,descriptorId);
 if(plan)return plan.points.find(p=>p.year===year)?.stateId||null;
 const ids=[...new Set(project.data.paths.filter(p=>p.descriptorId===descriptorId&&p.scope.regionId===project.scope.regionId).flatMap(p=>p.points.filter(point=>point.year===year&&point.stateId).map(point=>point.stateId)))];
 return ids.length===1?ids[0]:null;
}
// 把某一年的就地选择读成一份“方案”：求解页用它检验，不用于限制枚举。
// 每个因素分别说明状态来自哪里，缺的就留空，绝不回填第一个状态。
export function planAtYear(project,year){
 const descriptors=project.selection.descriptorIds.map(descriptorId=>{
  const plan=statePlanFor(project,descriptorId);
  const point=plan?plan.points.find(p=>p.year===year)||null:null;
  const stateId=point?.stateId??null;
  const fallback=stateId?null:stateAtYear(project,descriptorId,year);
  const state=project.data.states.find(s=>s.id===(stateId||fallback))||null;
  return {descriptorId,stateId:state?.id??null,label:state?.label??null,
   source:stateId?'就地选择':fallback?'数值路径的状态节点':null,
   pathId:plan?.id??null,pathVersion:plan?.version??null,
   origin:point?.origin??null,evidenceRefs:point?[...point.evidenceRefs]:[]};
 });
 const missing=descriptors.filter(d=>!d.stateId);
 return {year,descriptors,missing:missing.map(d=>d.descriptorId),
  complete:descriptors.length>=2&&missing.length===0,
  planVersion:Math.max(0,...descriptors.map(d=>d.pathVersion||0)),
  config:Object.fromEntries(descriptors.filter(d=>d.stateId).map(d=>[d.descriptorId,d.stateId]))};
}
export function changeYearState(project,descriptorId,year,stateId,newId){
 if(!project.selection.descriptorIds.includes(descriptorId))throw new Error('请先选择这个因素');
 if(!project.scope.years.includes(year))throw new Error('年份不在当前研究范围内');
 if(stateId!==null&&!project.data.states.some(s=>s.id===stateId&&s.descriptorId===descriptorId))throw new Error('状态不属于这个因素');
 const original=statePlanFor(project,descriptorId);
 if(stateAtYear(project,descriptorId,year)===stateId)return structuredClone(project);
 const next=structuredClone(project),pathId=original?.id||newId(),evidenceId=newId();
 const points=original?structuredClone(original.points):project.scope.years.map(y=>({year:y,value:null,stateId:stateAtYear(project,descriptorId,y),origin:'user-assumption',evidenceRefs:[]}));
 let point=points.find(p=>p.year===year);
 if(!point){point={year,value:null,stateId:null,origin:'user-assumption',evidenceRefs:[]};points.push(point);}
 point.stateId=stateId;point.value=null;point.origin='user-assumption';point.evidenceRefs=[...new Set([...point.evidenceRefs,evidenceId])];points.sort((a,b)=>a.year-b.year);
 const after={...(original||{id:pathId,descriptorId,scope:{regionId:project.scope.regionId},evidenceRefs:[]}),version:(original?.version||0)+1,provenance:{origin:'user',sourceId:pathId,locator:'state-plan'},unit:null,interpolation:'none',points,evidenceRefs:[...new Set([...(original?.evidenceRefs||[]),evidenceId])]};
 next.data.evidence.push({id:evidenceId,kind:'user-assumption',sourceId:pathId,locator:pathId+'@v'+after.version,excerpt:JSON.stringify({explanation:'用户按年份选择的状态安排，不是政策事实或数值预测；未自动限制CIB枚举。',before:original,after}),reviewStatus:'draft',version:1,provenance:{origin:'user',sourceId:pathId}});
 const index=next.data.paths.findIndex(p=>p.id===pathId);if(index<0)next.data.paths.push(after);else next.data.paths[index]=after;
 return next;
}
