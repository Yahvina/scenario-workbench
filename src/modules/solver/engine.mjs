import {buildMatrix} from '../relationships/logic.mjs';
import {validateProject} from '../../core/contracts.mjs';
export const engineVersion='cib-exact-1.0.0';
export const maxSpace=100000;
export const diagnosticClasses={
 YEAR_REQUIRED:'block',REGION_REQUIRED:'block',DESCRIPTORS_REQUIRED:'block',STATES_MISSING:'block',STATE_REFERENCE_MISSING:'block',STATE_YEARS_INVALID:'block',STATE_YEAR_MISMATCH:'block',STATE_REGION_MISMATCH:'block',STATE_YEARS_UNKNOWN:'unknown-state',STATE_REGION_UNKNOWN:'unknown-state',JUDGMENT_NOT_FOUND:'block',INACTIVE_JUDGMENT:'block',MULTIPLE_SELECTED:'block',SELECTED_INAPPLICABLE:'block',CONFLICT:'block',RECORD_NOT_SELECTED:'block',NO_APPLICABLE_JUDGMENT:'block',STALE_STATE_REFERENCE:'block',DUPLICATE_ENTRY:'block',INVALID_SCORE:'block',EVIDENCE_MISSING:'block',
 JUDGMENT_REGION_UNKNOWN:'candidate',JUDGMENT_REGION_MISMATCH:'candidate',JUDGMENT_YEARS_UNKNOWN:'candidate',JUDGMENT_YEARS_INVALID:'candidate',JUDGMENT_YEAR_MISMATCH:'candidate',CURVE_METHOD_UNVERIFIED:'candidate',CURVE_METHOD_WARNING:'candidate-warning',
 CONFLICT_RESOLVED:'info',EVIDENCE_NOT_INDEPENDENTLY_VERIFIED:'warning',DRAFT_JUDGMENT:'warning',DIRECTNESS_UNCONFIRMED:'warning',RELATION_EVIDENCE_GAP:'warning'
};
export function classifyDiagnostic(d,selectedIds){const type=diagnosticClasses[d.code];if(type==='candidate')return (d.recordIds||[]).some(id=>selectedIds.includes(id))?'block':'info';if(type==='candidate-warning')return (d.recordIds||[]).some(id=>selectedIds.includes(id))?'warning':'info';return type||'block';}
const key=(a,b)=>JSON.stringify([a,b]);
function need(condition,message,code='INVALID_OR_LARGE_INPUT'){if(!condition){const error=new Error(message);error.code=code;throw error;}}
const record=value=>value!==null&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const id=value=>typeof value==='string'&&value.trim().length>0;
const ids=value=>Array.isArray(value)&&Array.from(value).every(id)&&new Set(value).size===value.length;
const year=value=>Number.isInteger(value)&&value>=1900&&value<=2300;
const years=value=>Array.isArray(value)&&Array.from(value).every(year)&&new Set(value).size===value.length;
export function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function dimensions(input){
 need(record(input)&&input.schemaVersion===1&&input.contractVersion==='1.0.0'&&input.method==='cib'&&input.engineVersion===engineVersion&&input.seed===null,'输入/方法版本不支持');
 need(id(input.projectId)&&Number.isSafeInteger(input.revision)&&input.revision>=0,'项目ID须为非空字符串，revision须为非负安全整数','INVALID_RUN_METADATA');
 need(record(input.solverConfig)&&input.solverConfig.mode==='enumerate','仅支持精确枚举，不支持sample');
 const limit=input.solverConfig.limit??maxSpace;need(Number.isInteger(limit)&&limit>0&&limit<=maxSpace,'规模限制须为1—100000');
 need(record(input.scope)&&id(input.scope.regionId)&&years(input.scope.years),'项目范围须有非空地区和1900—2300不重复整数年份数组','INVALID_SCOPE');
 need(year(input.year)&&input.scope.years.includes(input.year),'研究年份无效或不在项目范围','INVALID_YEAR');
 const descriptorIds=input.activeDescriptorIds;need(ids(descriptorIds)&&descriptorIds.length>=2,'至少两个不重复的非空活动变量ID');
 const matrix=input.matrix;need(record(matrix)&&matrix.version===1,'仅支持MatrixSnapshot version=1','MATRIX_VERSION_UNSUPPORTED');
 need(year(matrix.year)&&matrix.year===input.year&&ids(matrix.descriptorIds)&&JSON.stringify(matrix.descriptorIds)===JSON.stringify(descriptorIds),'矩阵年份/变量不匹配','INVALID_MATRIX_METADATA');
 need(record(matrix.stateIdsByDescriptor)&&Object.keys(matrix.stateIdsByDescriptor).length===descriptorIds.length&&descriptorIds.every(d=>Object.hasOwn(matrix.stateIdsByDescriptor,d))&&ids(matrix.evidenceRefs),'矩阵状态集合/依据ID数组无效','INVALID_MATRIX_METADATA');
 const states=input.stateDefinitions,scopeDiagnostics=[];need(Array.isArray(states)&&states.every(s=>record(s)&&id(s.id)&&id(s.descriptorId)&&descriptorIds.includes(s.descriptorId)&&Number.isSafeInteger(s.version)&&s.version>0)&&new Set(states.map(s=>s.id)).size===states.length,'状态ID/归属或正整数版本无效','INVALID_STATE_DEFINITION');
 for(const s of states){
  need(s.validYears===undefined||years(s.validYears),'状态年份须为1900—2300不重复整数数组：'+s.id,'STATE_YEARS_INVALID');
  need(record(s.scope)||s.scope===undefined,'状态地区范围须为对象：'+s.id,'STATE_SCOPE_INVALID');
  const region=s.scope?.regionId;need(region===undefined||region===null||id(region),'状态地区须为非空字符串或null：'+s.id,'STATE_SCOPE_INVALID');
  need(!s.validYears?.length||s.validYears.includes(input.year),'状态在研究年份不适用：'+s.id,'STATE_YEAR_MISMATCH');
  need(region===undefined||region===null||region===input.scope.regionId,'状态地区与项目不符：'+s.id,'STATE_REGION_MISMATCH');
  if(!s.validYears?.length)scopeDiagnostics.push({code:'STATE_YEARS_UNKNOWN',message:'状态适用年份未知；纯RunInput不能证明封套假设确认：'+s.id,recordIds:[s.id]});
  if(region===undefined||region===null)scopeDiagnostics.push({code:'STATE_REGION_UNKNOWN',message:'状态地区未知；纯RunInput不能证明封套假设确认：'+s.id,recordIds:[s.id]});
 }
 const byDescriptor=new Map();let unrestricted=1n,space=1n;
 for(const id of descriptorIds){const list=states.filter(s=>s.descriptorId===id).map(s=>s.id),declared=matrix.stateIdsByDescriptor[id];need(list.length&&ids(declared)&&list.length===declared.length&&list.every(s=>declared.includes(s)),'状态集合/归属不匹配');byDescriptor.set(id,list);unrestricted*=BigInt(list.length);}
 const locks=input.lockedStateIds;need(ids(locks),'锁定重复或无效');
 const locked=new Map();for(const stateId of locks){const s=states.find(s=>s.id===stateId);need(s&&!locked.has(s.descriptorId),'锁定非活动状态或同变量多锁');locked.set(s.descriptorId,stateId);}
 for(const id of descriptorIds)space*=BigInt(locked.has(id)?1:byDescriptor.get(id).length);
 return {ids:descriptorIds,states,byDescriptor,locked,space,unrestricted,limit,scopeDiagnostics};
}
export function inspectInput(input){
 const compiled=dimensions(input),{ids,states,byDescriptor}=compiled,matrix=input.matrix;
 const entries=new Map();need(Array.isArray(matrix.entries),'矩阵缺失');
 for(const e of matrix.entries){need(record(e)&&id(e.sourceStateId)&&id(e.targetStateId),'矩阵单元/状态ID无效');const a=states.find(s=>s.id===e.sourceStateId),b=states.find(s=>s.id===e.targetStateId);need(a&&b&&a.descriptorId!==b.descriptorId&&!entries.has(key(a.id,b.id)),'矩阵重复、归属错误或包含自影响');need(Number.isInteger(e.score)&&Math.abs(e.score)<=3&&id(e.judgmentId),'缺分/非法分或未明确选用');entries.set(key(a.id,b.id),e);}
 let required=0;for(const a of ids)for(const b of ids)if(a!==b)for(const x of byDescriptor.get(a))for(const y of byDescriptor.get(b)){required++;need(entries.has(key(x,y)),'矩阵不完整，不能补0');}
 need(entries.size===required,'额外矩阵单元');
 const coverage={required,judged:entries.size,missingPairs:[]},declared=matrix.coverage;
 need(record(declared)&&Number.isSafeInteger(declared.required)&&Number.isSafeInteger(declared.judged)&&declared.required===coverage.required&&declared.judged===coverage.judged&&Array.isArray(declared.missingPairs)&&declared.missingPairs.length===0,'coverage与实际完整矩阵不一致','COVERAGE_MISMATCH');
 return {...compiled,entries,coverage};
}
export function prepareRun(project,{year,selectedJudgmentIds=[],assumptionAcknowledgements={},limit=maxSpace}){
 const diagnostics=[];let snapshot=null;const add=(code,message)=>diagnostics.push({code,message,recordIds:[],classification:'block'});
 try{validateProject(project);}catch(error){add('INVALID_PROJECT',error.message);return {input:null,diagnostics,space:null};}
 const result=buildMatrix(project,{year,selectedJudgmentIds});snapshot=result.snapshot;
 for(const d of result.diagnostics)diagnostics.push({...d,classification:classifyDiagnostic(d,selectedJudgmentIds)});
 if(!snapshot)add('MATRIX_REQUIRED','无法准备当前矩阵');
 if(snapshot&&snapshot.coverage.missingPairs.length)add('MISSING_SCORES','存在未判断单元，不能补0');
 if(diagnostics.some(d=>d.classification==='warning')&&assumptionAcknowledgements.currentAssumptions!==true)add('ASSUMPTIONS_REQUIRED','请明确同意按当前草案/依据不足/量表假设检算');
 if(diagnostics.some(d=>d.classification==='unknown-state')&&assumptionAcknowledgements.unknownStateScope!==true)add('STATE_ASSUMPTIONS_REQUIRED','请明确同意把未声明的状态范围作为当前截面假设');
 const input={schemaVersion:1,contractVersion:project.contractVersion,projectId:project.id,revision:project.revision,scope:structuredClone(project.scope),year,activeDescriptorIds:[...project.selection.descriptorIds],stateDefinitions:structuredClone(project.data.states.filter(s=>project.selection.descriptorIds.includes(s.descriptorId))),matrix:structuredClone(snapshot),lockedStateIds:[...project.selection.lockedStateIds],method:'cib',engineVersion,solverConfig:{mode:'enumerate',limit},seed:null};
 let space=null;
 if(snapshot)try{const inspected=dimensions(input);space={unconstrained:inspected.unrestricted.toString(),constrained:inspected.space.toString(),limit};if(inspected.space>BigInt(limit))add('SPACE_LIMIT','精确空间'+inspected.space+'超过安全上限'+limit+'；无约束空间'+inspected.unrestricted);inspectInput(input);}catch(error){add('INVALID_RUN_INPUT',error.message);}
 return {input:diagnostics.some(d=>d.classification==='block')?null:freeze(input),diagnostics,space};
}
function evaluateCompiled(input,c,configuration){
 need(configuration&&Object.keys(configuration).length===c.ids.length&&c.ids.every(id=>c.byDescriptor.get(id).includes(configuration[id])),'配置必须为每个变量指定有效状态');
 const balances=c.ids.map(target=>{
   const candidates=c.byDescriptor.get(target).map(stateId=>{const contributions=c.ids.filter(source=>source!==target).map(source=>{const e=c.entries.get(key(configuration[source],stateId));return {sourceDescriptorId:source,sourceStateId:configuration[source],score:e.score,judgmentId:e.judgmentId};});return {stateId,support:contributions.reduce((sum,x)=>sum+x.score,0),contributions};});
   const maximum=candidates.reduce((m,x)=>Math.max(m,x.support),-Infinity),selectedSupport=candidates.find(x=>x.stateId===configuration[target]).support;
   return {descriptorId:target,selectedStateId:configuration[target],selectedSupport,maximum,gap:maximum-selectedSupport,consistent:selectedSupport===maximum,candidates};
 });
 return {configuration:structuredClone(configuration),consistent:balances.every(b=>b.consistent),conflicts:balances.filter(b=>!b.consistent).map(b=>b.descriptorId),violatesLocks:[...c.locked].some(([id,state])=>configuration[id]!==state),balances};
}
export function explain(input,configuration){return evaluateCompiled(input,inspectInput(input),configuration);}
export function createEnumeration(rawInput,{displayLimit=100,keepLimit=displayLimit}={}){
 const input=freeze(structuredClone(rawInput));let compiled=null,error=null;
 try{compiled=inspectInput(input);need(compiled.space<=BigInt(compiled.limit),'SPACE_LIMIT：空间'+compiled.space+'超过'+compiled.limit);need(Number.isInteger(displayLimit)&&displayLimit>=0,'展示上限无效');need(Number.isInteger(keepLimit)&&keepLimit>=displayLimit,'保留上限无效');}catch(e){error=e;}
 const result={id:'run-'+input?.projectId+'-'+input?.revision+'-'+Date.now(),inputSnapshot:input,status:error?'blocked':null,space:compiled?{unconstrained:compiled.unrestricted.toString(),constrained:compiled.space.toString(),limit:compiled.limit}:null,checked:0,count:null,coverage:compiled?structuredClone(compiled.coverage):null,scenarios:[],all:[],truncated:false,sampled:false,balanceTrace:[],// stateCounts 统计全量自洽配置里的状态出现次数，作为频率的分母；all 只保留到 keepLimit，供聚类等逐条比较。
 stateCounts:compiled?Object.fromEntries(compiled.ids.map(id=>[id,Object.fromEntries(compiled.byDescriptor.get(id).map(s=>[s,0]))])):{},diagnostics:error?[{code:error.code||'INVALID_OR_LARGE_INPUT',message:error.message}]:structuredClone(compiled.scopeDiagnostics),createdAt:new Date().toISOString()};
 let found=0,cancelled=false,done=!!error;
 const choices=compiled?.ids.map(id=>compiled.locked.has(id)?[compiled.locked.get(id)]:compiled.byDescriptor.get(id)),positions=choices?.map(()=>0);
 return {cancel(){cancelled=true;},step(batch=250){
   need(Number.isInteger(batch)&&batch>0&&batch<=1000,'每批须为1—1000');
   if(done)return {done:true,result:structuredClone(result),found};
   if(cancelled){done=true;result.status='failed';result.count=null;result.diagnostics.push({code:'CANCELLED',message:'已取消，局部发现不代表全空间结论'});return {done,result:structuredClone(result),found};}
   for(let k=0;k<batch;k++){
     const config=Object.fromEntries(compiled.ids.map((id,i)=>[id,choices[i][positions[i]]]));
     const trace=evaluateCompiled(input,compiled,config);result.checked++;
     if(trace.consistent){found++;
       for(const id of compiled.ids){const bucket=result.stateCounts[id];if(bucket&&Object.hasOwn(bucket,config[id]))bucket[config[id]]++;}
       if(result.all.length<keepLimit)result.all.push(config);
       if(result.scenarios.length<displayLimit){result.scenarios.push(config);result.balanceTrace.push(trace);}}
     let carry=positions.length-1;while(carry>=0&&++positions[carry]===choices[carry].length){positions[carry]=0;carry--;}
     if(carry<0){done=true;result.status='completed';result.count=found;result.truncated=found>result.scenarios.length;break;}
   }
   result.truncated=found>result.scenarios.length;
   return {done,result:structuredClone(result),found};
 }};
}
export function solve(input,options){const job=createEnumeration(input,options);let output;do{output=job.step();}while(!output.done);return output.result;}
