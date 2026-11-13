import { sameDoi } from '../relationships/paper-id.mjs';
import { methodDoi } from '../relationships/curve.mjs';
const filled=value=>typeof value==='string'&&value.trim().length>0;

export function evidenceChecklist(archive) {
  const input=archive?.RunInput,data=archive?.projectInputSnapshot?.data;
  if(!input?.matrix||!data)throw new Error('需要含冻结输入和科学快照的检验记录。');
  const groups=new Map();
  for(const entry of input.matrix.entries){
    if(!groups.has(entry.judgmentId))groups.set(entry.judgmentId,[]);
    groups.get(entry.judgmentId).push(entry);
  }
  const rows=[...groups].map(([judgmentId,entries])=>{
    const record=data.judgments?.find(j=>j.id===judgmentId);
    const source=input.stateDefinitions.find(s=>s.id===entries[0].sourceStateId)?.descriptorId;
    const target=input.stateDefinitions.find(s=>s.id===entries[0].targetStateId)?.descriptorId;
    const references=[...new Set(record?.evidenceRefs||[])].map(id=>{
      const evidence=data.evidence?.find(e=>e.id===id);
      const methodOnly=id===record?.curveEncoding?.source?.evidenceId||sameDoi(evidence?.sourceId,methodDoi);
      return {id,exists:!!evidence,kind:evidence?.kind??null,sourceId:evidence?.sourceId??null,
        locator:evidence?.locator??null,reviewStatus:evidence?.reviewStatus??null,
        role:methodOnly?'scoring-method':['paper','historical-data'].includes(evidence?.kind)?'relation-candidate':evidence?.kind==='policy'?'policy-context':'other'};
    });
    const relation=references.filter(e=>e.exists&&e.role==='relation-candidate');
    const tasks=[];
    if(!record)tasks.push('冻结快照中缺少判断记录');
    if(record&&(record.sourceDescriptorId!==source||record.targetDescriptorId!==target))tasks.push('判断方向与矩阵归属不一致');
    if(!relation.length)tasks.push('补充关系方向与强度的论文或历史数据引用；政策或评分方法论文不能替代');
    for(const ref of references){
      if(!ref.exists)tasks.push('缺少被引用的依据记录：'+ref.id);
      else if(!filled(ref.sourceId)||!filled(ref.locator))tasks.push('补齐引用来源和具体定位：'+ref.id);
    }
    if(record?.reviewStatus!=='reviewed')tasks.push('判断记录仍需人工审核');
    tasks.push('分别核对引用对影响方向、评分强度、状态划分及地区年份的支持；本清单不代替独立内容核验');
    return {judgmentId,version:record?.version??null,sourceDescriptorId:source,targetDescriptorId:target,
      sourceLabel:data.descriptors.find(d=>d.id===source)?.label||source,
      targetLabel:data.descriptors.find(d=>d.id===target)?.label||target,
      judgedCells:entries.length,zeroCells:entries.filter(e=>e.score===0).length,
      relationReferenceCount:relation.length,reviewStatus:record?.reviewStatus??null,references,tasks};
  });
  return structuredClone({version:1,projectId:input.projectId,revision:input.revision,year:input.year,regionId:input.scope.regionId,
    input,calculationStatus:archive.RunResult?.status??'not-completed',
    evidenceAdequacy:'not-established',
    interpretation:'这是冻结引用的整理和人工核验清单，不是文献质量评分或科学有效性认证。0分是已判断没关系，不是低置信。',
    totals:{usedDirections:rows.length,usedCells:input.matrix.entries.length,
      zeroCells:rows.reduce((n,r)=>n+r.zeroCells,0),directionsWithRelationReferences:rows.filter(r=>r.relationReferenceCount>0).length,
      tasks:rows.reduce((n,r)=>n+r.tasks.length,0)},rows});
}
