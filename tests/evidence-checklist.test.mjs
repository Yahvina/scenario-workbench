import test from 'node:test';
import assert from 'node:assert/strict';
import fixtures from './solver-browser-fixtures.cjs';
import {prepareRun,solve} from '../src/modules/solver/engine.mjs';
import {evidenceChecklist} from '../src/modules/solver/evidence-checklist.mjs';
import {methodDoi} from '../src/modules/relationships/curve.mjs';
function archive(project=fixtures.fixture({mode:'zero'}),conditionedStateIds=[]){
 const prepared=prepareRun(project,{year:2030,conditionedStateIds,assumptionAcknowledgements:{currentAssumptions:true,unknownStateScope:true}});
 assert.ok(prepared.input);
 return {RunInput:prepared.input,RunResult:solve(prepared.input),projectInputSnapshot:structuredClone(project)};
}
test('explicit zero scores remain judged, not low-confidence; completed calculations do not certify evidence',()=>{
 const report=evidenceChecklist(archive());
 assert.equal(report.totals.usedCells,8);assert.equal(report.totals.zeroCells,8);
 assert.equal(report.calculationStatus,'completed');assert.equal(report.evidenceAdequacy,'not-established');
 assert.equal(report.totals.directionsWithRelationReferences,0);
 assert.ok(report.rows.every(r=>r.tasks.some(t=>t.includes('补充关系'))));
});
test('paper metadata and reviewed tags never substitute for independent content verification',()=>{
 const p=fixtures.fixture({mode:'zero'});
 p.data.evidence=[{id:'paper',kind:'paper',sourceId:'fictional-metadata-only',locator:'Table 2',excerpt:'Synthetic test reference, not a real publication',reviewStatus:'reviewed',version:1,provenance:{origin:'fixture'}}];
 for(const j of p.data.judgments){j.reviewStatus='reviewed';j.evidenceRefs=['paper'];}
 const report=evidenceChecklist(archive(p));
 assert.equal(report.totals.directionsWithRelationReferences,2);
 assert.equal(report.evidenceAdequacy,'not-established');
 assert.ok(report.rows.every(r=>r.tasks.some(t=>t.includes('独立内容核验'))));
});
test('method-only citations do not count as relationship evidence; snapshots are isolated',()=>{
 const a=archive();
 a.projectInputSnapshot.data.evidence=[{id:'method',kind:'paper',sourceId:methodDoi,locator:'methods'}];
 a.projectInputSnapshot.data.judgments.forEach(j=>{j.evidenceRefs=['method','missing'];});
 const before=structuredClone(a),report=evidenceChecklist(a);
 assert.equal(report.totals.directionsWithRelationReferences,0);
 assert.ok(report.rows.every(r=>r.references[0].role==='scoring-method'&&r.tasks.some(t=>t.includes('缺少被引用'))));
 report.input.matrix.entries[0].score=3;assert.deepEqual(a,before);
});
test('conditioned checklists include only actually used directions and cells',()=>{
 const report=evidenceChecklist(archive(fixtures.fixture({mode:'zero'}),['A0']));
 assert.equal(report.totals.usedDirections,1);assert.equal(report.totals.usedCells,2);
 assert.equal(report.rows[0].sourceDescriptorId,'A');assert.equal(report.rows[0].targetDescriptorId,'B');
 assert.throws(()=>evidenceChecklist({}),/冻结输入/);
});
