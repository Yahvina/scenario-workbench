import test from 'node:test';import assert from 'node:assert/strict';
import fixtures from './solver-browser-fixtures.cjs';
import {prepareRun,solve,explain,createEnumeration,classifyDiagnostic} from '../src/modules/solver/engine.mjs';
import {prepareCurve,confirmCurve} from '../src/modules/relationships/curve.mjs';
const prep=p=>prepareRun(p,{year:2030,selectedJudgmentIds:p.data.judgments.map(j=>j.id),assumptionAcknowledgements:{currentAssumptions:true,unknownStateScope:true}});
test('copy hand calculation, conflict differences and exact count independent of displayed length',()=>{const p=fixtures.fixture(),{input}=prep(p),r=solve(input);assert.equal(r.status,'completed');assert.equal(r.space.constrained,'4');assert.equal(r.checked,4);assert.equal(r.count,2);assert.deepEqual(r.scenarios,[{A:'A0',B:'B0'},{A:'A1',B:'B1'}]);const t=explain(input,{A:'A0',B:'B1'});assert.deepEqual(t.balances.map(b=>[b.selectedSupport,b.maximum,b.gap]),[[-1,1,2],[-1,1,2]]);const limited=solve(input,{displayLimit:1});assert.equal(limited.count,2);assert.equal(limited.scenarios.length,1);assert.equal(limited.truncated,true);});
test('opposite/copy has no solution, zero ties all four, heterogeneous all six',()=>{assert.equal(solve(prep(fixtures.fixture({mode:'opposite'})).input).count,0);for(const sizes of [[2,2],[2,3]]){const r=solve(prep(fixtures.fixture({mode:'zero',sizes})).input);assert.equal(r.count,sizes[0]*sizes[1]);}});
test('locked variable is still compared to all states',()=>{const p=fixtures.fixture();p.selection.lockedStateIds=['A0'];let r=solve(prep(p).input);assert.equal(r.space.constrained,'2');assert.equal(r.space.unconstrained,'4');assert.equal(r.count,1);p.selection.lockedStateIds.push('B1');r=solve(prep(p).input);assert.equal(r.checked,1);assert.equal(r.count,0);p.selection.lockedStateIds.push('A1');assert.equal(prep(p).input,null);});
test('three variable hand sum uses source rows and IDs, not positions',()=>{const p=fixtures.fixture({sizes:[2,2,2],mode:'zero'});p.data.judgments.find(j=>j.id==='A->C').entries.find(e=>e.sourceStateId==='A0'&&e.targetStateId==='C1').score=2;p.data.judgments.find(j=>j.id==='B->C').entries.find(e=>e.sourceStateId==='B1'&&e.targetStateId==='C1').score=-1;const input=prep(p).input,t=explain(input,{A:'A0',B:'B1',C:'C0'});assert.equal(t.balances.find(b=>b.descriptorId==='C').candidates.find(c=>c.stateId==='C1').support,1);p.data.states.reverse();p.data.descriptors.forEach(d=>d.stateIds.reverse());assert.equal(explain(prep(p).input,{A:'A0',B:'B1',C:'C0'}).balances.find(b=>b.descriptorId==='C').maximum,1);});
test('no acknowledgement/null/unselected/wrong applicability blocks, resolved conflict is informational',()=>{const p=fixtures.fixture();assert.equal(prepareRun(p,{year:2030,selectedJudgmentIds:p.data.judgments.map(j=>j.id)}).input,null);assert.equal(prepareRun(p,{year:2030}).input,null);p.data.judgments[0].entries[0].score=null;assert.equal(prep(p).input,null);p.data.judgments[0].entries[0].score=0;p.data.states[0].validYears=[2035];assert.equal(prep(p).input,null);p.data.states[0].validYears=[];assert.ok(prep(p).input);assert.equal(classifyDiagnostic({code:'CONFLICT_RESOLVED'},[]),'info');assert.equal(classifyDiagnostic({code:'future-unknown'},[]),'block');});
test('large exact product blocked, cancelled partial has no full count, archive copy replays independently',()=>{const p=fixtures.fixture({sizes:[10,10,10,10,10,10],mode:'zero'}),r=prep(p);assert.equal(r.input,null);assert.equal(r.space.constrained,'1000000');const input=prep(fixtures.fixture({sizes:[3,3,3],mode:'zero'})).input,job=createEnumeration(input);job.step(2);job.cancel();const cancelled=job.step().result;assert.equal(cancelled.status,'failed');assert.equal(cancelled.count,null);assert.equal(cancelled.checked,2);const serialized=JSON.parse(JSON.stringify(input));assert.equal(solve(serialized).count,27);const original=fixtures.fixture();const frozen=prep(original).input;original.data.judgments[0].entries[0].score=-3;assert.equal(solve(frozen).count,2);});

test('BigInt products remain exact beyond safe integer; raw kernel rejects malformed and sample inputs',()=>{
 const huge=prep(fixtures.fixture({sizes:Array(54).fill(2),mode:'zero'}));assert.equal(huge.space.constrained,'18014398509481984');assert.equal(huge.input,null);
 const odd=prep(fixtures.fixture({sizes:Array(34).fill(3),mode:'zero'}));assert.equal(odd.space.constrained,'16677181699666569');assert.equal(odd.input,null);
 const good=prep(fixtures.fixture()).input;
 const partial=createEnumeration(good,{displayLimit:0});partial.step(1);partial.cancel();const stopped=partial.step().result;assert.equal(stopped.count,null);assert.equal(stopped.truncated,true);assert.equal(stopped.scenarios.length,0);
 const gaps=fixtures.fixture();gaps.data.judgments[0].entries[0].score=null;const missing=prep(gaps);assert.equal(missing.input,null);assert.equal(missing.space.constrained,'4');
 for(const mutate of [x=>x.solverConfig.mode='sample',x=>x.matrix.entries[0].score=null,x=>x.matrix.entries.push(x.matrix.entries[0]),x=>x.matrix.entries.pop(),x=>x.lockedStateIds=['NOT_ACTIVE'],x=>x.solverConfig.limit=100001]){const x=structuredClone(good);mutate(x);const r=solve(x);assert.equal(r.status,'blocked');assert.equal(r.checked,0);assert.equal(r.count,null);}
 assert.equal(solve(null).status,'blocked');
});

test('independent nested brute force agrees on asymmetric three-variable integer matrices',()=>{
 for(let example=0;example<5;example++){
  const p=fixtures.fixture({sizes:[2,3,2],mode:'zero'});
  p.data.judgments.forEach((j,i)=>j.entries.forEach((e,k)=>{e.score=((i*13+k*7+example*3+k*k)%7)-3;}));
  const expected=[];
  for(const a of ['A0','A1'])for(const b of ['B0','B1','B2'])for(const c of ['C0','C1']){
   const config={A:a,B:b,C:c};let valid=true;
   for(const target of p.data.descriptors){
    const support=s=>p.data.judgments.filter(j=>j.targetDescriptorId===target.id).reduce((n,j)=>n+j.entries.find(e=>e.sourceStateId===config[j.sourceDescriptorId]&&e.targetStateId===s).score,0);
    if(target.stateIds.some(s=>support(s)>support(config[target.id])))valid=false;
   }
   if(valid)expected.push(config);
  }
  const r=solve(prep(p).input);assert.equal(r.checked,12);assert.deepEqual(r.scenarios,expected);assert.equal(r.count,expected.length);
 }
});

test('confirmed curve passes with warnings, stale definition and unconfirmed curve block without relaxing J1',()=>{
 const p=fixtures.fixture();p.data.judgments=p.data.judgments.filter(j=>j.id==='B->A');let n=0;
 const c=confirmCurve(prepareCurve(p,{sourceId:'A',targetId:'B',sourceHigh:'A1',targetHigh:'B1',templateId:'A(2)',ordinalConfirmed:true,directRelation:true,region:p.scope.regionId,years:[2030],rationale:'Only test assumptions'},()=> 'curve-solver-'+(++n)));
 assert.ok(prep(c.project).input);assert.ok(prep(c.project).diagnostics.some(d=>d.code==='CURVE_METHOD_WARNING'&&d.classification==='warning'));
 for(const mutate of [p=>p.data.states[0].version++,p=>p.data.judgments.find(j=>j.curveEncoding).curveEncoding.humanConfirmation=null,p=>p.data.judgments.find(j=>j.curveEncoding).entries[0].score=3]){const x=structuredClone(c.project);mutate(x);const pre=prep(x);assert.equal(pre.input,null);assert.ok(pre.diagnostics.some(d=>d.code==='CURVE_METHOD_UNVERIFIED'&&d.classification==='block'));}
});

test('explicit classification distinguishes resolved conflicts, unchosen inapplicable records and state unknown acknowledgement',()=>{
 const p=fixtures.fixture(),other=structuredClone(p.data.judgments[0]);other.id='other-region';other.scope.regionId='elsewhere';p.data.judgments.push(other);
 const opts={year:2030,selectedJudgmentIds:['A->B','B->A'],assumptionAcknowledgements:{currentAssumptions:true}};
 assert.ok(prepareRun(p,opts).input);assert.equal(prepareRun(p,opts).diagnostics.find(d=>d.code==='JUDGMENT_REGION_MISMATCH').classification,'info');
 opts.selectedJudgmentIds=['other-region','B->A'];assert.equal(prepareRun(p,opts).input,null);
 opts.selectedJudgmentIds=['A->B','B->A'];p.data.states[0].validYears=[];assert.equal(prepareRun(p,opts).input,null);opts.assumptionAcknowledgements.unknownStateScope=true;assert.ok(prepareRun(p,opts).input);
 other.scope.regionId=p.scope.regionId;const pre=prepareRun(p,opts);assert.ok(pre.input);assert.equal(pre.diagnostics.find(d=>d.code==='CONFLICT_RESOLVED').classification,'info');opts.selectedJudgmentIds=['B->A'];assert.equal(prepareRun(p,opts).input,null);
});

test('published Table 1 independently transcribed: 243 configurations, exactly the two p4 solutions',()=>{
 const p=fixtures.fixture({sizes:[3,3,3,3,3],mode:'zero'});
 // PDF p3 Table 1: A=Tom, B=Nancy, C=Ray, D=Helen, E=Max; states [+,0,-].
 const polarized=n=>[[n,0,-n],[0,0,0],[-n,0,n]];
 const blocks={'A->E':polarized(1),'B->E':polarized(2),'C->D':polarized(2),'D->A':polarized(3),'D->B':[[2,0,-2],[0,0,0],[0,0,0]],'D->C':polarized(2),'E->A':polarized(2),'E->B':polarized(1),'E->C':[[-3,0,3],[-1,2,-1],[3,0,-3]]};
 for(const j of p.data.judgments){const block=blocks[j.id];if(block)j.entries.forEach((e,k)=>{e.score=block[Math.floor(k/3)][k%3];});}
 const input=prep(p).input,r=solve(input);assert.equal(r.checked,243);assert.equal(r.count,2);
 assert.deepEqual(r.scenarios,[{A:'A1',B:'B1',C:'C1',D:'D1',E:'E1'},{A:'A2',B:'B0',C:'C2',D:'D2',E:'E0'}]);
 const t=explain(input,{A:'A1',B:'B2',C:'C0',D:'D0',E:'E2'});
 assert.deepEqual(t.balances.map(b=>b.candidates.map(c=>c.support)),[[1,0,-1],[1,0,-1],[5,0,-5],[2,0,-2],[-2,0,2]]);
 assert.deepEqual(t.balances.map(b=>b.gap),[1,2,0,0,0]);
});
