import test from 'node:test';
import assert from 'node:assert/strict';
import {sameDoi,normalizeDoi} from '../src/modules/relationships/paper-id.mjs';
import {createDemoProject} from '../src/fixtures/demo.mjs';
import {prepareCurve,confirmCurve,validateCurve,methodDoi} from '../src/modules/relationships/curve.mjs';
import {buildMatrix} from '../src/modules/relationships/logic.mjs';
const aliases=[methodDoi,'https://doi.org/'+methodDoi,'http://dx.doi.org/'+methodDoi,'doi:'+methodDoi,'  DOI :  '+methodDoi.toUpperCase()+' \n','HTTPS://DOI.ORG/'+methodDoi.toUpperCase(),'https://doi.org/10.1016%2Fj.mex.2021.101492/','https://doi.org/'+methodDoi+'?download=1#table1'];
const distinct=[methodDoi+'0',methodDoi+'.other',methodDoi+'/appendix','10.1016/j.mex.2021.999999','https://doi.org/'+methodDoi+'//','https://doi.org/10.1016%252Fj.mex.2021.101492','https://doi.org.evil.example/'+methodDoi,'https://example.org/'+methodDoi,'https://doi.org:8443/'+methodDoi,'https://user@doi.org/'+methodDoi,'https://doi.org/10.1016%ZZ/j.mex.2021.101492','10.1016 /j.mex.2021.101492','https://doi.org/10.1000/other?related='+methodDoi+'#'+methodDoi,'https://doi.org/'+methodDoi+'0?x=1#table1'];
test('F1 exact DOI alias policy and lookalike/invalid negative controls',()=>{for(const value of aliases)assert.equal(sameDoi(value,methodDoi),true,value);for(const value of distinct)assert.equal(sameDoi(value,methodDoi),false,value);assert.equal(normalizeDoi(null),null);assert.equal(sameDoi('not-doi','not-doi'),false);});
function candidate(sourceId,kind='paper'){
 const p=createDemoProject();p.data.evidence.push({id:'extra-reference',kind,sourceId,locator:'F1 independent existence-control fixture',excerpt:'Only test reference identity, not evidence validity',version:1,reviewStatus:'draft',provenance:{origin:'user'}});
 let n=0;return confirmCurve(prepareCurve(p,{sourceId:'descriptor-a',targetId:'descriptor-b',sourceHigh:'a-high',targetHigh:'b-high',templateId:'A(2)',ordinalConfirmed:true,directRelation:true,region:p.scope.regionId,years:[2030],rationale:'F1 fixture',relationEvidenceRefs:['extra-reference']},()=>`f1-${++n}`));
}
for(const [label,values,kind,gap]of [['method aliases',aliases,'paper',true],['different DOI papers',distinct.slice(0,4),'paper',false],['ordinary relation paper',['10.1000/actual-relation','https://doi.org/10.1000/actual-relation?related='+methodDoi+'#'+methodDoi],'paper',false],['historical data',['historical-series-2030'],'historical-data',false]])test('F1 actual curve/direct matrices: '+label,()=>{
 for(const value of values){const prepared=JSON.parse(JSON.stringify(candidate(value,kind))),j=prepared.project.data.judgments[0];assert.equal(validateCurve(prepared.project,j).ok,true);for(const direct of [false,true]){const p=structuredClone(prepared.project),record=p.data.judgments[0];if(direct){record.curveEncoding=null;record.evidenceRefs=['extra-reference'];}const result=buildMatrix(p,{year:2030,selectedJudgmentIds:[record.id]});assert.equal(result.snapshot.coverage.judged,4);assert.equal(result.diagnostics.some(d=>d.code==='RELATION_EVIDENCE_GAP'),gap,value+' direct='+direct);assert.ok(result.diagnostics.some(d=>d.code==='EVIDENCE_NOT_INDEPENDENTLY_VERIFIED'));}}
});
test('F1 relation alias handling does not loosen exact curve method-source gate',()=>{
 const prepared=candidate('https://doi.org/'+methodDoi),j=prepared.project.data.judgments[0];
 prepared.project.data.evidence.find(e=>e.id===j.curveEncoding.source.evidenceId).sourceId='https://doi.org/'+methodDoi;
 assert.equal(validateCurve(prepared.project,j).ok,false);
 const result=buildMatrix(prepared.project,{year:2030,selectedJudgmentIds:[j.id]});assert.equal(result.snapshot.coverage.judged,0);assert.ok(result.diagnostics.some(d=>d.code==='CURVE_METHOD_UNVERIFIED'));
});
