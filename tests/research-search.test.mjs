import test from 'node:test';import assert from 'node:assert/strict';
import {inspectResearchCase,researchExample,searchResearchCase} from '../src/modules/solver/research-search.mjs';
const fast={yieldControl:async()=>{}};
test('sum-preserving example has exact two-cell minimum and independent cells have one-cell minimum',async()=>{
 const c=researchExample(),saved=structuredClone(c),a=await searchResearchCase(c,fast);assert.equal(a.status,'optimal');assert.deepEqual(a.cost,[2,2]);assert(a.completeDomainEnumeration);assert.deepEqual(c,saved);
 delete c.sum_preserving_groups;const b=await searchResearchCase(c,fast);assert.equal(b.status,'optimal');assert.deepEqual(b.cost,[1,1]);assert.equal(b.minimumProved,true);
});
test('mixed equal-delta and sum constraint leaves only baseline, so finite domain is invariant',async()=>{
 const c=researchExample();c.equal_delta_groups=structuredClone(c.sum_preserving_groups);const r=await searchResearchCase(c,fast);assert.equal(r.status,'invariant');assert.equal(r.legalMatrices,1);assert.equal(r.cost,null);assert(r.completeDomainEnumeration);
});
test('budget and cancellation never certify invariant or optimal; best-known witness remains unproved',async()=>{
 const c=researchExample();const a=await searchResearchCase(c,{...fast,maxMatrices:0});assert.equal(a.status,'limit');assert.equal(a.baseline,null);
 const controller=new AbortController();const b=await searchResearchCase(c,{signal:controller.signal,yieldControl:async()=>controller.abort()});assert.equal(b.status,'cancelled');assert.equal(b.minimumProved,false);assert.equal(b.completeDomainEnumeration,false);
 const d=await searchResearchCase(c,{...fast,maxMatrices:1});assert.equal(d.status,'limit');assert.equal(d.minimumProved,false);
});
test('null, duplicate scores, illegal coupling, unknown fields and huge spaces are rejected',()=>{
 for(const alter of [c=>c.cells[0][4]=null,c=>c.cells.push(c.cells[0]),c=>c.sum_preserving_groups=[[[9,0,1,0],[0,0,1,1]]],c=>c.constraints=[],c=>c.fixed={0:8}]){const c=researchExample();alter(c);assert.throws(()=>inspectResearchCase(c));}
});
