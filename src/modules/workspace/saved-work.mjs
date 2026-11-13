import {validateProject} from '../../core/contracts.mjs';
import {inspectInput,explain,prepareRun} from '../solver/engine.mjs';
export const SAVED_WORK_KEY='scenario-workbench.saved-work.v1';
export const MAX_ITEMS=20;
export const MAX_BYTES=5*1024*1024;
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim().length>0;
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const ids=v=>Array.isArray(v)&&v.every(text)&&new Set(v).size===v.length;
function canonical(v){return Array.isArray(v)?v.map(canonical):obj(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function date(v){if(typeof v!=='string')return false;const m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?(Z|[+-]\d\d:\d\d)$/.exec(v);if(!m||!Number.isFinite(Date.parse(v)))return false;const [y,month,day,hour,minute,second]=m.slice(1,7).map(Number),days=[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];return month>=1&&month<=12&&day>=1&&day<=days[month-1]&&hour<24&&minute<60&&second<60;}
export function emptyBundle(){return {format:'scenario-workbench.saved-work',archiveVersion:1,plans:[],runs:[]};}
function jsonTree(v,seen=new Set()){if(v===null||typeof v==='string'||typeof v==='boolean')return;if(typeof v==='number'){need(Number.isFinite(v),'非有限JSON数值');return;}need(Array.isArray(v)||obj(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null),'仅支持完整JSON值');need(!seen.has(v),'不支持循环记录');seen.add(v);for(const item of Array.isArray(v)?Array.from(v):Object.values(v))jsonTree(item,seen);seen.delete(v);}
function size(value){jsonTree(value);const serialized=JSON.stringify(value);need(new TextEncoder().encode(serialized).length<=MAX_BYTES,'整库或导入超过5MiB，未保存');return serialized;}
function diagnostics(value){need(Array.isArray(value)&&value.every(d=>obj(d)&&text(d.code)&&text(d.message)&&(d.recordIds===undefined||Array.isArray(d.recordIds)&&Array.from(d.recordIds).every(text))&&(d.classification===undefined||['block','warning','info','unknown-state'].includes(d.classification))),'诊断格式无效');}
function projectShape(p,strict=true){validateProject(p);if(!strict)return p;
 const scope=v=>obj(v)&&(v.regionId===null||text(v.regionId));
 const years=v=>Array.isArray(v)&&new Set(v).size===v.length&&v.every(y=>Number.isInteger(y)&&y>=1900&&y<=2300);
 need(p.data.descriptors.every(d=>['input','outcome','context'].includes(d.role)),'因素角色格式无效');
 for(const j of p.data.judgments)need(scope(j.scope)&&years(j.validYears)&&['direct','indirect','unknown'].includes(j.directness)&&['draft','reviewed','disputed'].includes(j.reviewStatus)&&typeof j.rationale==='string'&&Array.isArray(j.alternatives)&&(j.curveEncoding===null||obj(j.curveEncoding)),'判断范围或记录格式无效');
 for(const path of p.data.paths)need(scope(path.scope)&&(path.unit===null||typeof path.unit==='string'),'路径范围/单位无效');
 for(const mapping of p.data.mappings)need(p.data.descriptors.some(d=>d.id===mapping.descriptorId),'模型映射引用断裂');
 for(const s of p.data.states){need(s.range===null||obj(s.range)&&['min','max'].every(k=>s.range[k]===null||typeof s.range[k]==='number'&&Number.isFinite(s.range[k]))&&typeof s.range.minInclusive==='boolean'&&typeof s.range.maxInclusive==='boolean'&&(s.range.min===null||s.range.max===null||s.range.min<s.range.max||s.range.min===s.range.max&&s.range.minInclusive&&s.range.maxInclusive),'状态数值区间不合法');need(s.unit===null||typeof s.unit==='string','状态单位无效');need(Array.isArray(s.validYears)&&new Set(s.validYears).size===s.validYears.length&&s.validYears.every(y=>Number.isInteger(y)&&y>=1900&&y<=2300)&&obj(s.scope)&&(s.scope.regionId===null||text(s.scope.regionId)),'状态适用范围格式无效');}
 return p;
}
export function snapshotProject(s){need(obj(s)&&s.schemaVersion===1&&s.contractVersion==='1.0.0'&&text(s.projectId)&&integer(s.revision),'科学快照无效');return {schemaVersion:s.schemaVersion,contractVersion:s.contractVersion,id:s.projectId,title:'历史科学快照',revision:s.revision,view:{perspective:'public',module:'workspace',objectId:null},scope:structuredClone(s.scope),data:structuredClone(s.data),selection:structuredClone(s.selection)};}
export function validateArchive(a){
 size(a);
 need(obj(a)&&a.archiveVersion===1&&Object.hasOwn(a,'RunInput')&&Object.hasOwn(a,'RunResult'),'不支持的检算封套版本或缺少输入/结果');const p=projectShape(snapshotProject(a.projectInputSnapshot),false);diagnostics(a.preflightDiagnostics);need(obj(a.assumptionAcknowledgements)&&typeof a.assumptionAcknowledgements.currentAssumptions==='boolean'&&typeof a.assumptionAcknowledgements.unknownStateScope==='boolean','缺少原假设确认');
 need(Array.isArray(a.selectionOfJudgments)&&a.selectionOfJudgments.every(j=>obj(j)&&text(j.id)&&(j.version===null||Number.isSafeInteger(j.version)&&j.version>0)&&ids(j.evidenceRefs))&&new Set(a.selectionOfJudgments.map(j=>j.id)).size===a.selectionOfJudgments.length,'封套选用记录无效');
 const input=a.RunInput,r=a.RunResult;
 if(input===null&&r===null){need(a.preflightDiagnostics.some(d=>d.classification==='block'),'前置阻断须保留阻断诊断');return a;}
 need(obj(r)&&text(r.id)&&date(r.createdAt)&&['completed','blocked','failed'].includes(r.status)&&integer(r.checked)&&Array.isArray(r.scenarios)&&Array.isArray(r.balanceTrace)&&typeof r.truncated==='boolean'&&r.sampled===false,'检算结果元数据无效');diagnostics(r.diagnostics);need(equal(r.inputSnapshot,input),'RunResult输入快照不一致');
 if(r.status==='blocked'){need(r.checked===0&&r.count===null&&r.scenarios.length===0&&r.balanceTrace.length===0&&!r.truncated&&r.diagnostics.length>0,'拒绝记录不能伪装完成');let refused=null;try{refused=inspectInput(input);}catch{}need(refused?equal(r.space,{unconstrained:refused.unrestricted.toString(),constrained:refused.space.toString(),limit:refused.limit})&&equal(r.coverage,refused.coverage):r.space===null&&r.coverage===null,'拒绝记录的空间/覆盖声明不一致');return a;}
 projectShape(p);const compiled=inspectInput(input);need(compiled.space<=BigInt(compiled.limit),'超过支持的枚举规模');
 for(const j of a.selectionOfJudgments){const original=p.data.judgments.find(r=>r.id===j.id);need(original&&original.version===j.version&&equal(original.evidenceRefs||[],j.evidenceRefs),'选用判断版本/依据与科学快照不一致');}
 const prepared=prepareRun(p,{year:input.year,selectedJudgmentIds:a.selectionOfJudgments.map(j=>j.id),assumptionAcknowledgements:a.assumptionAcknowledgements,limit:input.solverConfig.limit??100000,conditionedStateIds:input.conditionedStateIds??[]});need(prepared.input,'冻结项目按原闸门不能构造有效输入');
 for(const key of ['schemaVersion','contractVersion','projectId','revision','scope','year','activeDescriptorIds','stateDefinitions','matrix','lockedStateIds','conditionedStateIds','method','engineVersion','seed'])need(equal(input[key],prepared.input[key]),'冻结输入与原项目不一致：'+key);
 need(equal(a.preflightDiagnostics,prepared.diagnostics),'封套原诊断与冻结项目不一致');
 const space={unconstrained:compiled.unrestricted.toString(),constrained:compiled.space.toString(),limit:compiled.limit};need(equal(r.space,space)&&equal(r.coverage,compiled.coverage),'结果空间/coverage不一致');
 const total=Number(compiled.space);need(r.checked<=total,'已检查数超过空间');
 if(a.inspection!==undefined)explain(input,a.inspection);
 if(r.status==='completed')need(r.checked===total&&integer(r.count)&&r.count<=r.checked&&r.scenarios.length<=r.count&&r.truncated===(r.count>r.scenarios.length),'完成状态计数/截断声明不一致');else{need(r.count===null&&r.scenarios.length<=r.checked&&r.diagnostics.length>0,'未完成状态数量必须未定且保留原因');if(a.partialFound!==undefined)need(integer(a.partialFound)&&a.partialFound<=r.checked&&a.partialFound>=r.scenarios.length&&r.truncated===(a.partialFound>r.scenarios.length),'局部发现数不一致');}
 need(r.balanceTrace.length===r.scenarios.length&&new Set(r.scenarios.map(c=>JSON.stringify(canonical(c)))).size===r.scenarios.length,'场景/解释数量或重复配置无效');
 r.scenarios.forEach((c,i)=>{const trace=explain(input,c);need(trace.consistent&&!trace.violatesLocks&&equal(trace,r.balanceTrace[i]),'保存配置或逐项解释与原矩阵不一致');});return a;
}
export function validateBundle(bundle){
 size(bundle);need(obj(bundle)&&Object.keys(bundle).sort().join(',')==='archiveVersion,format,plans,runs'&&bundle.format==='scenario-workbench.saved-work'&&bundle.archiveVersion===1&&Array.isArray(bundle.plans)&&Array.isArray(bundle.runs),'未知保存格式或版本/扩展字段');need(bundle.plans.length<=MAX_ITEMS&&bundle.runs.length<=MAX_ITEMS,'最多20条方案和20条归档');const all=[...bundle.plans,...bundle.runs];need(all.every(r=>obj(r)&&text(r.id)&&text(r.name)&&date(r.createdAt))&&new Set(all.map(r=>r.id)).size===all.length,'记录ID/名称/日期无效或重复');
 for(const plan of bundle.plans){projectShape(plan.project);const focused=plan.project.selection.stateIds.map(id=>plan.project.data.states.find(s=>s.id===id).descriptorId);need(new Set(focused).size===focused.length,'每因素最多一个关注状态');}
 bundle.runs.forEach(r=>validateArchive(r.archive));return structuredClone(bundle);
}
export function namedPlan(project,name,focus,id=crypto.randomUUID()){const p=structuredClone(project);need(obj(focus)&&Object.keys(focus).every(id=>p.selection.descriptorIds.includes(id)),'关注因素无效');p.selection.stateIds=p.selection.descriptorIds.flatMap(id=>{const sid=Object.hasOwn(focus,id)?focus[id]:'';if(sid===''||sid===null||sid===undefined)return [];need(typeof sid==='string','关注状态须为ID字符串或未选');need(p.data.states.some(s=>s.id===sid&&s.descriptorId===id),'关注状态归属错误');return [sid];});const item={id,name,createdAt:new Date().toISOString(),project:p};validateBundle({...emptyBundle(),plans:[item]});return item;}
export function savedRun(archive,name,id=crypto.randomUUID()){const item={id,name,createdAt:new Date().toISOString(),archive:structuredClone(archive)};validateBundle({...emptyBundle(),runs:[item]});return item;}
export function mergeBundle(current,incoming){validateBundle(current);validateBundle(incoming);const next=structuredClone(current),existing=new Map([...next.plans,...next.runs].map(r=>[r.id,r]));for(const kind of ['plans','runs'])for(const r of incoming[kind]){if(existing.has(r.id))need(equal(existing.get(r.id),r)&&next[kind].some(x=>x.id===r.id),'ID冲突，整批拒绝：'+r.id);else{next[kind].push(structuredClone(r));existing.set(r.id,r);}}return validateBundle(next);}
function legacyId(a){if(text(a.RunResult?.id))return 'legacy-'+a.RunResult.id;let n=2166136261;for(const c of JSON.stringify(canonical(a)))n=Math.imul(n^c.charCodeAt(0),16777619);return 'legacy-preflight-'+(n>>>0).toString(16);}
export function parseImport(raw,current=emptyBundle()){need(typeof raw==='string'&&new TextEncoder().encode(raw).length<=MAX_BYTES,'导入超过5MiB');const value=JSON.parse(raw);if(obj(value)&&Object.hasOwn(value,'format'))return validateBundle(value);if(value?.archiveVersion===1&&Object.hasOwn(value,'projectInputSnapshot')){validateArchive(value);const id=legacyId(value),old=current.runs.find(r=>r.id===id),entry={id,name:old?.name||'导入的历史检算',createdAt:old?.createdAt||new Date().toISOString(),archive:value};return validateBundle({...emptyBundle(),runs:[entry]});}throw new Error('未知格式；Project备份请使用原项目恢复入口');}
export function createLibrary(storage){
 function load(){let raw=null;try{raw=storage.getItem(SAVED_WORK_KEY);return {ok:true,raw,bundle:raw===null?emptyBundle():validateBundle(JSON.parse(raw))};}catch(error){return {ok:false,raw,error:error.message};}}
 function write(next,expected){validateBundle(next);const serialized=size(next);need(storage.getItem(SAVED_WORK_KEY)===expected,'库已变化，请重载后重试');storage.setItem(SAVED_WORK_KEY,serialized);return structuredClone(next);}
 return {load,merge(incoming){const state=load();need(state.ok,'原库无法读取/已损坏，未覆盖：'+state.error);return write(mergeBundle(state.bundle,incoming),state.raw);},rebuild(){const raw=storage.getItem(SAVED_WORK_KEY);return write(emptyBundle(),raw);}};
}
