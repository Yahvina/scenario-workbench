import test from 'node:test';import assert from 'node:assert/strict';
import {replayHandoffCase} from '../src/modules/solver/case-replay.mjs';
function fixture(){
 const ref={sourceId:'test-only',locator:'synthetic fixture, not real evidence'};
 return {format:'cib-case-handoff',version:1,caseId:'synthetic-only',scope:{targetYear:2030,baselineYear:2023},
  definitions:{support:{period:'synthetic-only',thresholds:'synthetic-only'},energy:{thresholds:'synthetic-only'}},
  definitionEvidence:Object.fromEntries(['baselineYear','supportPeriod','supportThresholds','energyThresholds'].map(k=>[k,[ref]])),
  sources:[{id:'test-only',kind:'historical-data',title:'SYNTHETIC TEST DATA',location:'in-memory fixture, not empirical'}],
  descriptors:[{id:'support',states:['high','mid','low']},{id:'energy',states:['large','small','same']}],
  cells:['high','mid','low'].flatMap((a,i)=>['large','small','same'].map((b,j)=>({sourceState:a,targetState:b,score:i===2?0:i===j?1:-1,
    evidence:[{...ref,role:'direction',finding:'synthetic'},{...ref,role:'strength',finding:'synthetic',scoreRationale:'synthetic'}]}))),
  modelReview:{baselineConfirmed:true,stateCoverageConfirmed:true,evidenceReviewed:true}};
}
test('source-backed handoff structure replays only given support, without invented reverse relations',()=>{
 const c=fixture(),copy=structuredClone(c),r=replayHandoffCase(c);assert.equal(r.status,'completed');assert.deepEqual(r.comparisons.map(x=>x.count),[1,1,3]);assert.equal(r.scientificValidity,'not-assessed');assert.deepEqual(c,copy);
});
test('unknown score, policy-only evidence or unsigned model review blocks case calculation',()=>{
 for(const alter of [c=>c.cells[0].score=null,c=>c.sources[0].kind='policy',c=>c.modelReview.evidenceReviewed=false]){const c=fixture();alter(c);const r=replayHandoffCase(c);assert.equal(r.status,'not-ready');assert.deepEqual(r.comparisons,[]);}
});
