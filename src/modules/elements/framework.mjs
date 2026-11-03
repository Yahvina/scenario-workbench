import {createJJJDraftProject} from '../../fixtures/jjj-draft.mjs';
import {validateProject} from '../../core/contracts.mjs';
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;}
export function joinJJJFramework(project){
 validateProject(project);const next=structuredClone(project),template=createJJJDraftProject(),conflicts=[];
 for(const [collection,records]of Object.entries(template.data))for(const record of records){const existing=next.data[collection].find(item=>item.id===record.id);if(!existing)next.data[collection].push(structuredClone(record));else if(JSON.stringify(canonical(existing))!==JSON.stringify(canonical(record)))conflicts.push(collection+' / '+record.id+'：已有定义与框架不同');}
 if(conflicts.length)throw new Error('框架未加入，原项目保持不变：'+conflicts.join('；'));
 validateProject(next);return next;
}
