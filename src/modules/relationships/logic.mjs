import {sameDoi} from './paper-id.mjs';
import {validateCurve,methodDoi} from './curve.mjs';
const pairKey = (a,b) => JSON.stringify([a,b]);
const validScore = score => score === null || Number.isInteger(score) && score >= -3 && score <= 3;
export function statesFor(project, descriptorId) {
  const descriptor = project.data.descriptors.find(d => d.id === descriptorId);
  return (descriptor?.stateIds || []).map(id => project.data.states.find(s => s.id === id && s.descriptorId === descriptorId)).filter(Boolean);
}
export function draftFor(project, sourceId, targetId, record = null) {
  const existing = new Map((record?.entries || []).map(entry => [pairKey(entry.sourceStateId,entry.targetStateId),entry.score]));
  return { region: record?.scope?.regionId || '', years: (Array.isArray(record?.validYears)?record.validYears:[]).join(', '), directness: record?.directness || 'unknown', rationale: record?.rationale || '', evidenceRefs: [...(record?.evidenceRefs || [])], entries: statesFor(project,sourceId).flatMap(a => statesFor(project,targetId).map(b => ({sourceStateId:a.id,targetStateId:b.id,value:existing.get(pairKey(a.id,b.id)) ?? ''}))) };
}
export function parseYears(text) {
  if (!text.trim()) return [];
  const parts = text.split(/[,，\s]+/).filter(Boolean);
  const years = parts.map(Number);
  if (years.some(year => !Number.isInteger(year) || year < 1900 || year > 2300) || new Set(years).size !== years.length) throw new Error('适用年须为1900—2300且不重复的整数');
  return years.sort((a,b)=>a-b);
}
// 方向覆盖：A→B 与 B→A 独立计数；只要该方向存在判断记录就算已覆盖（不分格子）。
export function directionCoverage(project) {
  const ids = project.selection.descriptorIds;
  const covered = new Set(project.data.judgments.map(j => j.sourceDescriptorId + '>' + j.targetDescriptorId));
  const missing = [];
  for (const a of ids) for (const b of ids) { if (a === b) continue; if (!covered.has(a + '>' + b)) missing.push({ source: a, target: b }); }
  return { need: ids.length * (ids.length - 1), covered: covered.size, missing };
}
// 保存后推进：按活动变量顺序取第一个未判方向；全部覆盖返回 null。
export function nextUngjudgedDirection(project) {
  const { missing } = directionCoverage(project);
  return missing.length ? missing[0] : null;
}
export function buildJudgmentChange(project, sourceId, targetId, original, draft, newId) {
  if (sourceId === targetId || ![sourceId,targetId].every(id => project.selection.descriptorIds.includes(id))) throw new Error('请选择两个不同的活动变量');
  if (original && (original.sourceDescriptorId !== sourceId || original.targetDescriptorId !== targetId)) throw new Error('判断方向不匹配');
  if (original?.curveEncoding) throw new Error('编码记录不能在直接评分页覆盖；请新建独立编码判断以保留原值和修订');
  if (!['direct','indirect','unknown'].includes(draft.directness)) throw new Error('请选择有效的直接性说明');
  const allowed = new Set(statesFor(project,sourceId).flatMap(a=>statesFor(project,targetId).map(b=>pairKey(a.id,b.id))));
  const scores = new Map();
  for (const entry of draft.entries) {
    const key=pairKey(entry.sourceStateId,entry.targetStateId), raw=String(entry.value).trim(), score=raw===''?null:Number(raw);
    if (!allowed.has(key) || scores.has(key)) throw new Error('状态对引用过期、重复或属于其他变量，请重新载入');
    if (!validScore(score)) throw new Error('评分只能是−3至+3整数；空白是未判断，0是没关系');
    scores.set(key,score);
  }
  if (!allowed.size) throw new Error('变量缺少状态定义，请先配置已有状态');
  const references=[...new Set(draft.evidenceRefs)];
  if (references.some(id=>!project.data.evidence.some(e=>e.id===id))) throw new Error('关联依据不存在');
  const candidate={ ...(original || {id:newId(),sourceDescriptorId:sourceId,targetDescriptorId:targetId,alternatives:[],version:1,provenance:{origin:'user'}}), alternatives:structuredClone(original?.alternatives||[]), scope:{regionId:draft.region.trim()||null}, validYears:parseYears(draft.years), directness:draft.directness, curveEncoding:null, entries:statesFor(project,sourceId).flatMap(a=>statesFor(project,targetId).map(b=>({sourceStateId:a.id,targetStateId:b.id,score:scores.get(pairKey(a.id,b.id))??null}))), rationale:draft.rationale, evidenceRefs:references, reviewStatus:original?.reviewStatus || 'draft' };
  const next=structuredClone(project);
  if (original && JSON.stringify(candidate)===JSON.stringify(original)) return next;
  const evidenceId=newId(), locator=candidate.id+'@v'+(original?.version||0);
  candidate.version=original?original.version+1:1;
  candidate.reviewStatus='draft';
  candidate.provenance={origin:'user',sourceId:candidate.id,locator};
  candidate.evidenceRefs=[...new Set([...references,evidenceId])];
  next.data.evidence.push({id:evidenceId,kind:'user-assumption',sourceId:candidate.id,locator,excerpt:JSON.stringify({explanation:'用户关系判断修改记录，不是关系规律已获文献证明；方向/强度依据未分别核实。',before:original||null,after:candidate}),reviewStatus:'draft',version:1,provenance:{origin:'user',sourceId:candidate.id}});
  const index=next.data.judgments.findIndex(j=>j.id===candidate.id);
  if(index<0) next.data.judgments.push(candidate); else next.data.judgments[index]=candidate;
  return next;
}

export function buildMatrix(project, {year,selectedJudgmentIds=[]} = {}) {
  const diagnostics=[];
  const report=(code,message,recordIds=[])=>diagnostics.push({code,message,recordIds});
  if (!Number.isInteger(year) || !project.scope.years.includes(year)) report('YEAR_REQUIRED','请显式选择项目研究年份');
  if (!project.scope.regionId) report('REGION_REQUIRED','项目研究地区未指定，未知范围不能当通用');
  const descriptorIds=[...project.selection.descriptorIds];
  if(descriptorIds.length<2) report('DESCRIPTORS_REQUIRED','至少需要两个活动变量');
  if(diagnostics.some(d=>['YEAR_REQUIRED','REGION_REQUIRED'].includes(d.code))) return {snapshot:null,diagnostics};
  const stateIdsByDescriptor=Object.fromEntries(descriptorIds.map(id=>[id,[]]));
  for(const id of descriptorIds) {
    const descriptor=project.data.descriptors.find(d=>d.id===id), states=statesFor(project,id);
    stateIdsByDescriptor[id]=states.map(s=>s.id);
    if(!descriptor || !states.length) report('STATES_MISSING','变量缺少有效状态定义',[id]);
    if(descriptor?.stateIds.some(stateId=>!states.some(s=>s.id===stateId))) report('STATE_REFERENCE_MISSING','变量引用了缺失或归属错误的状态',[id]);
    for(const state of states) {
      if(state.validYears!==undefined && !Array.isArray(state.validYears)) report('STATE_YEARS_INVALID','状态适用年格式无效，请核对',[state.id]);
      else if(Array.isArray(state.validYears) && (new Set(state.validYears).size!==state.validYears.length || state.validYears.some(y=>!Number.isInteger(y)||y<1900||y>2300))) report('STATE_YEARS_INVALID','状态适用年格式无效，请核对',[state.id]);
      else if(!state.validYears?.length) report('STATE_YEARS_UNKNOWN','状态未声明适用年，不代表永久有效',[state.id]);
      else if(!state.validYears.includes(year)) report('STATE_YEAR_MISMATCH','状态在所选年不适用',[state.id]);
      if(!state.scope?.regionId) report('STATE_REGION_UNKNOWN','状态地区范围未知',[state.id]);
      else if(state.scope.regionId!==project.scope.regionId) report('STATE_REGION_MISMATCH','状态地区与项目不符',[state.id]);
    }
  }
  for(const id of selectedJudgmentIds) {
    const record=project.data.judgments.find(j=>j.id===id);
    if(!record) report('JUDGMENT_NOT_FOUND','选中的判断记录已不存在',[id]);
    else if(![record.sourceDescriptorId,record.targetDescriptorId].every(id=>descriptorIds.includes(id))) report('INACTIVE_JUDGMENT','选用记录属于非活动变量，不进入当前矩阵',[id]);
  }
  const entries=[], evidence=new Set();
  for(const sourceId of descriptorIds) for(const targetId of descriptorIds) {
    if(sourceId===targetId) continue;
    const records=project.data.judgments.filter(j=>j.sourceDescriptorId===sourceId && j.targetDescriptorId===targetId);
    const applicable=[];
    for(const record of records) {
      if(!record.scope?.regionId) {report('JUDGMENT_REGION_UNKNOWN','判断范围未知，未采用',[record.id]);continue;}
      if(record.scope.regionId!==project.scope.regionId) {report('JUDGMENT_REGION_MISMATCH','判断地区不符，未采用',[record.id]);continue;}
      if(record.validYears!==undefined && !Array.isArray(record.validYears)) {report('JUDGMENT_YEARS_INVALID','判断适用年格式无效，未采用',[record.id]);continue;}
      if(!record.validYears?.length) {report('JUDGMENT_YEARS_UNKNOWN','判断未声明适用年，未采用',[record.id]);continue;}
      if(new Set(record.validYears).size!==record.validYears.length || record.validYears.some(y=>!Number.isInteger(y)||y<1900||y>2300)) {report('JUDGMENT_YEARS_INVALID','判断适用年格式无效，未采用',[record.id]);continue;}
      if(!record.validYears.includes(year)) {report('JUDGMENT_YEAR_MISMATCH','判断在所选年不适用，未采用',[record.id]);continue;}
      if(record.curveEncoding) { const check=validateCurve(project,record); if(!check.ok){report('CURVE_METHOD_UNVERIFIED','曲线记录拒绝：'+check.message,[record.id]);continue;} for(const warning of check.warnings)report('CURVE_METHOD_WARNING',warning,[record.id]); }
      applicable.push(record);
    }
    const explicit=records.filter(j=>selectedJudgmentIds.includes(j.id));
    let chosen=null;
    if(explicit.length>1) report('MULTIPLE_SELECTED','同方向选中多条记录，未采用任何一条',explicit.map(j=>j.id));
    else if(explicit.length===1) {
      if(applicable.some(j=>j.id===explicit[0].id)) chosen=explicit[0];
      else report('SELECTED_INAPPLICABLE','明确选择的记录不适用，不能替换为其他记录',[explicit[0].id]);
    } else if(applicable.length>1) report('CONFLICT','同方向有多个适用候选，请明确选用；不求均值',applicable.map(j=>j.id));
    else if(applicable.length===1) report('RECORD_NOT_SELECTED','存在一条适用记录，仍需明确选用',[applicable[0].id]);
    else report('NO_APPLICABLE_JUDGMENT','该方向没有可用判断',[sourceId,targetId]);
    if(chosen && applicable.length>1) report('CONFLICT_RESOLVED','多个候选中已显式选择一条，未作聚合',applicable.map(j=>j.id));
    const scoreMap=new Map();
    if(chosen) {
      report('EVIDENCE_NOT_INDEPENDENTLY_VERIFIED','方向和强度依据未分别核实；覆盖完整不等于证据有效',[chosen.id]);
      if(chosen.reviewStatus!=='reviewed') report('DRAFT_JUDGMENT','采用的是草案或存疑判断，未经确认',[chosen.id]);
      if(chosen.directness!=='direct') report('DIRECTNESS_UNCONFIRMED','判断直接性未确认，不代表可用于求解',[chosen.id]);
      const external=(chosen.evidenceRefs||[]).filter(id=>id!==chosen.curveEncoding?.source?.evidenceId).map(id=>project.data.evidence.find(e=>e.id===id)).filter(e=>e && !sameDoi(e.sourceId,methodDoi) && !(chosen.curveEncoding && e.id===chosen.curveEncoding.source?.evidenceId));
      if(!external.some(e=>e.kind==='paper'||e.kind==='historical-data')) report('RELATION_EVIDENCE_GAP','尚缺关系规律的论文/历史数据依据；政策或修改记录不能替代',[chosen.id]);
      for(const id of chosen.evidenceRefs||[]) {if(project.data.evidence.some(e=>e.id===id)) evidence.add(id); else report('EVIDENCE_MISSING','判断引用缺失依据',[chosen.id,id]);}
      for(const entry of chosen.entries||[]) {
        const key=pairKey(entry.sourceStateId,entry.targetStateId);
        if(!stateIdsByDescriptor[sourceId].includes(entry.sourceStateId)||!stateIdsByDescriptor[targetId].includes(entry.targetStateId)) {report('STALE_STATE_REFERENCE','判断包含旧状态或跨变量引用，忽略该行',[chosen.id,entry.sourceStateId,entry.targetStateId]);continue;}
        if(scoreMap.has(key)) {scoreMap.set(key,null);report('DUPLICATE_ENTRY','同一状态对重复，不采用其分数',[chosen.id,entry.sourceStateId,entry.targetStateId]);}
        else if(!validScore(entry.score)) {scoreMap.set(key,null);report('INVALID_SCORE','记录分数不合法，保留未判断',[chosen.id]);}
        else scoreMap.set(key,entry.score);
      }
    }
    for(const sourceStateId of stateIdsByDescriptor[sourceId]) for(const targetStateId of stateIdsByDescriptor[targetId]) entries.push({sourceStateId,targetStateId,score:scoreMap.get(pairKey(sourceStateId,targetStateId))??null,judgmentId:chosen?.id||null});
  }
  const missingPairs=entries.filter(e=>e.score===null).map(e=>({sourceStateId:e.sourceStateId,targetStateId:e.targetStateId}));
  return {snapshot:{version:1,descriptorIds,stateIdsByDescriptor,year,entries,coverage:{required:entries.length,judged:entries.length-missingPairs.length,missingPairs},evidenceRefs:[...evidence]},diagnostics};
}

