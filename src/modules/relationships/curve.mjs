import {curveData} from './curve-data.mjs';
export const methodDoi=curveData.source.doi;
export const scaleWarning='原论文±2恒等保留，不生成±3；与其他专家量表尚未校准。方法论文不证明实际因素关系。';
export const a2Warning='A(2)原图高源文字weakly与圈选线型及±2数值冲突；本项目仅按数值表复现，未获作者澄清。';
export function stable(value) {
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
const need=(condition,message)=>{if(!condition)throw new Error(message);};
const pair=e=>JSON.stringify([e.sourceStateId,e.targetStateId]);
function ordered(entries){return [...entries].sort((a,b)=>pair(a).localeCompare(pair(b)));}
export function definitions(project,id) {
  need(project.selection.descriptorIds.includes(id),'变量不在活动集合');
  const d=project.data.descriptors.find(d=>d.id===id);
  need(d&&d.stateIds.length===2&&new Set(d.stateIds).size===2,'必须使用完整项目中严格二档，不能删除或忽略中档');
  const all=project.data.states.filter(s=>s.descriptorId===id);
  need(all.length===2&&all.every(s=>d.stateIds.includes(s.id)),'完整状态归属/集合不一致');
  return d.stateIds.map(sid=>{const s=project.data.states.find(s=>s.id===sid);need(s&&s.descriptorId===id&&Number.isSafeInteger(s.version)&&s.version>0,'状态缺失、跨变量或版本无效');return structuredClone(s);}).sort((a,b)=>a.id.localeCompare(b.id));
}
function generate(project,sourceId,targetId,c) {
  need(sourceId!==targetId,'源目标不能相同');
  need(c.encodingSchemaVersion===1&&c.methodId==='stankov-2021-literal-binary-lookup'&&c.ruleVersion===curveData.ruleVersion,'未知编码/方法/规则版本');
  need(c.directRelation===true&&c.ordinalConfirmed===true,'必须明确直接影响并确认序数H/L；名义或未知不可编码');
  need(c.scorePolicy==='identity-no-rescale'&&c.parameters&&typeof c.parameters==='object'&&!Array.isArray(c.parameters)&&Object.keys(c.parameters).length===0,'不支持参数或尺度拉伸');
  const template=curveData.templates.find(t=>t.id===c.templateId);need(template?.encodingEnabled,'未知或停用模板（L(1,3)本项目暂不采用，并非认定原文错误）');
  const src=definitions(project,sourceId),tgt=definitions(project,targetId);
  for(const [side,id] of [['source',sourceId],['target',targetId]]){const d=structuredClone(project.data.descriptors.find(d=>d.id===id));d.stateIds.sort();need(stable(c.descriptorDefinitionSnapshots?.[side])===stable(d),'描述符当前定义/版本已变化');}
  for(const [name,states] of [['source',src],['target',tgt]]){
    const bindings=c.stateBindings?.[name];need(Array.isArray(bindings)&&bindings.length===2&&new Set(bindings.map(b=>b.id)).size===2&&new Set(bindings.map(b=>b.level)).size===2,'H/L绑定缺失或重复');
    need(bindings.every(b=>['high','low'].includes(b.level)&&states.some(s=>s.id===b.id&&s.version===b.definitionVersion)),'完整状态ID/归属/当前版本不匹配');
    need(stable(c.stateDefinitionSnapshots?.[name])===stable(states),'状态完整定义已变化（即使版本相同）');
  }
  need(c.source?.doi===curveData.source.doi&&c.source.pdfSha256===curveData.source.sha256&&c.source.pdfPage===7&&c.source.table==='Table 1'&&c.source.tableRow===template.source.tableRow,'方法来源定位或哈希不符');
  need(c.scaleWarning===scaleWarning&&stable(c.sourceIssues)===stable(template.warnings.map(code=>({code,message:code==='FIG3_A_STRENGTH_TEXT_CONFLICT'?a2Warning:code}))),'量表/原文问题警告缺失或伪造');
  const ix={high:0,low:1};
  return c.stateBindings.source.flatMap(a=>c.stateBindings.target.map(b=>({sourceStateId:a.id,targetStateId:b.id,score:template.matrix[ix[a.level]][ix[b.level]]})));
}
function payload(j){const c=structuredClone(j.curveEncoding);delete c.humanConfirmation;for(const side of ['source','target']){c.stateBindings[side].sort((a,b)=>a.id.localeCompare(b.id));c.stateDefinitionSnapshots[side].sort((a,b)=>a.id.localeCompare(b.id));c.descriptorDefinitionSnapshots[side].stateIds.sort();}c.generatedEntries=ordered(c.generatedEntries);c.manualOverrides=ordered(c.manualOverrides);return stable({...j,entries:ordered(j.entries),curveEncoding:c});}
export function validateCurve(project,j,requireConfirmation=true) {
  try {
    const c=j.curveEncoding;need(Array.isArray(j.evidenceRefs)&&new Set(j.evidenceRefs).size===j.evidenceRefs.length&&j.evidenceRefs.every(id=>project.data.evidence.some(e=>e.id===id)),'判断依据引用缺失或重复');need(c&&j.directness==='direct','不是明确直接影响');
    const expected=generate(project,j.sourceDescriptorId,j.targetDescriptorId,c);
    need(Array.isArray(c.generatedEntries)&&stable(ordered(c.generatedEntries))===stable(ordered(expected)),'原始生成四格被伪造');
    const source=project.data.evidence.find(e=>e.id===c.source.evidenceId);
    need(source?.kind==='paper'&&source.sourceId===curveData.source.doi&&source.locator===methodLocator(),'缺少正确方法来源依据');
    need(j.evidenceRefs.includes(source.id),'判断没有关联方法来源');
    need(Array.isArray(c.manualOverrides),'缺少修订数组');
    const final=structuredClone(expected),seen=new Set();
    for(const edit of c.manualOverrides){
      const original=expected.find(e=>pair(e)===pair(edit));
      need(original&&!seen.has(pair(edit))&&edit.before===original.score,'修订before/状态对错误或重复');seen.add(pair(edit));
      need(edit.after===null||Number.isInteger(edit.after)&&Math.abs(edit.after)<=3,'修订分数无效');
      need(edit.after!==edit.before&&typeof edit.rationale==='string'&&edit.rationale.trim()&&Array.isArray(edit.evidenceRefs)&&new Set(edit.evidenceRefs).size===edit.evidenceRefs.length&&edit.evidenceRefs.every(id=>project.data.evidence.some(e=>e.id===id)),'修订理由/依据无效');
      final.find(e=>pair(e)===pair(edit)).score=edit.after;
    }
    need(Array.isArray(j.entries)&&stable(ordered(j.entries))===stable(ordered(final)),'最终分数与生成值/完整修订差异不符');
    if(requireConfirmation)need(c.humanConfirmation?.confirmed===true&&typeof c.humanConfirmation.confirmedAt==='string'&&Number.isFinite(Date.parse(c.humanConfirmation.confirmedAt))&&c.humanConfirmation.content===payload(j),'尚未明确确认或确认内容已过期');
    return {ok:true,warnings:[scaleWarning,...c.sourceIssues.map(x=>x.message)]};
  }catch(error){return {ok:false,message:error.message};}
}
export function methodLocator(){return 'Stankov2021 Table 1 PDF p7; SHA256 '+curveData.source.sha256;}
export function prepareCurve(project,{sourceId,targetId,templateId,sourceHigh,targetHigh,ordinalConfirmed,directRelation,region,years,rationale,overrides=[],relationEvidenceRefs=[]},newId) {
  const next=structuredClone(project),methodId=newId(),id=newId(),historyId=newId();
  const sourceDefs=definitions(project,sourceId),targetDefs=definitions(project,targetId);
  const bind=(defs,high)=>defs.map(s=>({id:s.id,level:s.id===high?'high':'low',definitionVersion:s.version}));
  need(sourceDefs.some(s=>s.id===sourceHigh)&&targetDefs.some(s=>s.id===targetHigh),'请选择真实高状态，剩余状态为低');
  const t=curveData.templates.find(t=>t.id===templateId);
  const c={encodingSchemaVersion:1,methodId:'stankov-2021-literal-binary-lookup',ruleVersion:curveData.ruleVersion,templateId,directRelation,ordinalConfirmed,scorePolicy:'identity-no-rescale',parameters:{},stateBindings:{source:bind(sourceDefs,sourceHigh),target:bind(targetDefs,targetHigh)},stateDefinitionSnapshots:{source:sourceDefs,target:targetDefs},descriptorDefinitionSnapshots:{source:structuredClone(project.data.descriptors.find(d=>d.id===sourceId)),target:structuredClone(project.data.descriptors.find(d=>d.id===targetId))},source:{doi:curveData.source.doi,pdfSha256:curveData.source.sha256,pdfPage:7,table:'Table 1',tableRow:t?.source.tableRow,evidenceId:methodId},sourceIssues:(t?.warnings||[]).map(code=>({code,message:code==='FIG3_A_STRENGTH_TEXT_CONFLICT'?a2Warning:code})),scaleWarning,manualOverrides:structuredClone(overrides)};
  c.descriptorDefinitionSnapshots.source.stateIds.sort();c.descriptorDefinitionSnapshots.target.stateIds.sort();
  c.generatedEntries=generate(project,sourceId,targetId,c);
  const entries=structuredClone(c.generatedEntries);for(const edit of overrides){const e=entries.find(e=>pair(e)===pair(edit));need(e,'修订状态对错误');e.score=edit.after;}
  next.data.evidence.push({id:methodId,kind:'paper',sourceId:curveData.source.doi,locator:methodLocator(),excerpt:'仅证明二档编码方法来源，不证明本次实际关系。',reviewStatus:'draft',version:1,provenance:{origin:'import'}});
  const j={id,sourceDescriptorId:sourceId,targetDescriptorId:targetId,scope:{regionId:region.trim()||null},validYears:[...years],directness:'direct',curveEncoding:c,entries,alternatives:[],rationale,evidenceRefs:[...new Set([methodId,historyId,...relationEvidenceRefs])],reviewStatus:'draft',version:1,provenance:{origin:'user'}};
  next.data.evidence.push({id:historyId,kind:'user-assumption',sourceId:id,locator:id+'@v0',excerpt:JSON.stringify({before:null,after:null}),reviewStatus:'draft',version:1,provenance:{origin:'user'}});
  const check=validateCurve(next,j,false);need(check.ok,check.message);
  next.data.judgments.push(j);
  return {project:next,judgment:j,historyId};
}
export function confirmCurve(prepared) {
  const next=structuredClone(prepared),j=next.project.data.judgments.find(j=>j.id===next.judgment.id);
  const check=validateCurve(next.project,j,false);need(check.ok,check.message);
  j.curveEncoding.humanConfirmation={confirmed:true,confirmedAt:new Date().toISOString(),content:payload(j)};
  next.project.data.evidence.find(e=>e.id===next.historyId).excerpt=JSON.stringify({before:null,after:j});
  next.judgment=j;return next;
}

