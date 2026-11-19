export function auditHandoff(input) {
  const issues=[];
  const add=(path,message)=>issues.push({path,message});
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const text=v=>typeof v==='string'&&v.trim().length>0;
  if(!object(input)||input.format!=='cib-case-handoff'||input.version!==1)return {status:'invalid-format',issues:[{path:'format/version',message:'不是本交接模板或版本不支持'}],scientificValidity:'not-assessed'};
  const sources=Array.isArray(input.sources)?input.sources:[];
  if(!Array.isArray(input.sources))add('sources','缺少来源列表');
  const map=new Map();
  for(const [i,s] of sources.entries()){
    if(!object(s)||!text(s.id)||!['paper','historical-data','policy','expert','assumption'].includes(s.kind)||!text(s.title)||!text(s.location)){add('sources.'+i,'来源需有唯一id、kind、title和可定位的location');continue;}
    if(map.has(s.id))add('sources.'+i,'来源标识重复');else map.set(s.id,s);
  }
  const evidence=(refs,path,roles=false)=>{
    if(!Array.isArray(refs)||!refs.length){add(path,'未提供证据定位');return false;}
    let valid=true;const covered=new Set();
    for(const [i,r] of refs.entries()){
      const p=path+'.'+i,source=object(r)?map.get(r.sourceId):null;
      if(!source||!text(r?.locator)){add(p,'证据需引用有效来源并填写页/表/字段定位');valid=false;continue;}
      if(roles){
        if(!['direction','strength'].includes(r.role)||!text(r.finding)){add(p,'需分别标记方向/强度，说明依据中的发现');valid=false;}
        else covered.add(r.role);
        if(!['paper','historical-data'].includes(source.kind)){add(p,'本案例规律评分需论文或历史数据支持；当前来源仅可作待核假设');valid=false;}
        if(r.role==='strength'&&!text(r.scoreRationale)){add(p,'强度证据需说明为何编码成该分数');valid=false;}
      }
    }
    if(roles&&(!covered.has('direction')||!covered.has('strength'))){add(path,'需同时交接方向与强度依据');valid=false;}
    return valid;
  };
  const target=input.scope?.targetYear,baseline=input.scope?.baselineYear;
  if(!Number.isInteger(target)||target<1900||target>2300)add('scope.targetYear','目标年份无效');
  if(!Number.isInteger(baseline)||baseline<1900||baseline>=target)add('scope.baselineYear','基期尚未确定或不是有效的早于目标年的年份');
  const fields=[['baselineYear',baseline],['supportPeriod',input.definitions?.support?.period],['supportThresholds',input.definitions?.support?.thresholds],['energyThresholds',input.definitions?.energy?.thresholds]];
  for(const [key,value] of fields){
    if(key!=='baselineYear'&&!(text(value)||object(value)&&Object.keys(value).length))add('definitions.'+key,'尚未填写口径/分档说明');
    evidence(input.definitionEvidence?.[key],'definitionEvidence.'+key);
  }
  const ds=input.descriptors;
  const validDescriptors=Array.isArray(ds)&&ds.length===2&&ds.every(d=>object(d)&&text(d.id)&&Array.isArray(d.states)&&d.states.length===3&&d.states.every(text)&&new Set(d.states).size===3)&&new Set(ds.map(d=>d.id)).size===2;
  if(!validDescriptors)add('descriptors','当前接入版本要求两因素各三状态，状态需唯一；结构改变须先审定并更新接口');
  const cells=Array.isArray(input.cells)?input.cells:[];if(cells.length!==9)add('cells','当前完整比较需9个不同的来源状态—目标状态评分格');
  const seen=new Set();let judged=0,traceable=0;
  const rowCounts=validDescriptors?Object.fromEntries(ds[0].states.map(s=>[s,{validScores:0,traceableEvidence:0}])):{};
  for(const [i,cell] of cells.entries()){
    const p='cells.'+i;
    if(!object(cell)){add(p,'评分格格式无效');continue;}
    const k=JSON.stringify([cell.sourceState,cell.targetState]);
    const known=validDescriptors&&ds[0].states.includes(cell.sourceState)&&ds[1].states.includes(cell.targetState);
    const unique=!seen.has(k);if(!unique)add(p,'评分格重复');seen.add(k);
    if(!known)add(p,'评分状态不属于当前定义');
    const scoreValid=Number.isInteger(cell.score)&&Math.abs(cell.score)<=3;
    if(!scoreValid)add(p+'.score',cell.score===null?'评分未判断；不会补0':'评分必须是−3…+3整数或未判断null');
    const located=evidence(cell.evidence,p+'.evidence',true);
    if(scoreValid&&known&&unique){judged++;rowCounts[cell.sourceState].validScores++;}
    if(scoreValid&&located&&known&&unique){traceable++;rowCounts[cell.sourceState].traceableEvidence++;}
  }
  const reviews=['baselineConfirmed','stateCoverageConfirmed','evidenceReviewed'].filter(k=>input.modelReview?.[k]!==true);
  return {format:'cib-case-handoff-audit',version:1,status:issues.length?'incomplete':reviews.length?'awaiting-model-review':'structurally-ready-for-review',caseId:input.caseId??null,scientificValidity:'not-assessed',meaning:'仅检查字段、引用和评分格式；已填写审核标记不代替独立资料核验。不会改动输入或运行模型。',candidateBaselineYear:input.scope?.candidateBaselineYear??null,confirmedBaselineYear:Number.isInteger(baseline)?baseline:null,totalCells:cells.length,validScores:judged,traceableScores:traceable,pendingModelReview:reviews,conditionalRows:Object.entries(rowCounts).map(([state,r])=>({state,...r,scoreComputable:r.validScores===3,evidenceLocated:r.traceableEvidence===3})),issues};
}
