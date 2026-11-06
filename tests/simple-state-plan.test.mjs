import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoProject} from '../src/fixtures/demo.mjs';
import {validateProject} from '../src/core/contracts.mjs';
import {stateAtYear,statePlanFor,changeYearState} from '../src/modules/elements/state-plan.mjs';
import {toggleBranch,resolveSelection} from '../src/modules/elements/selection.mjs';
const ids=()=>{let i=0;return()=>`state-plan-test-${++i}`;};
test('year state choice is categorical, preserves the input and records provenance',()=>{
 const p=createDemoProject(),before=structuredClone(p),next=changeYearState(p,'descriptor-b',2030,'b-high',ids());
 validateProject(next);assert.deepEqual(p,before);
 const plan=statePlanFor(next,'descriptor-b');assert.equal(plan.interpolation,'none');assert.equal(plan.unit,null);assert.ok(plan.points.every(point=>point.value===null));assert.equal(stateAtYear(next,'descriptor-b',2030),'b-high');assert.equal(stateAtYear(next,'descriptor-b',2035),null);assert.ok(plan.evidenceRefs.length);
 assert.deepEqual(next.data.paths.find(path=>path.id==='path-a'),p.data.paths[0]);assert.deepEqual(next.selection,p.selection);
});
test('no-op and clearing state never synthesize a numeric zero',()=>{
 const p=changeYearState(createDemoProject(),'descriptor-b',2030,'b-high',ids());
 assert.deepEqual(changeYearState(p,'descriptor-b',2030,'b-high',ids()),p);
 const next=changeYearState(p,'descriptor-b',2030,null,()=>crypto.randomUUID());validateProject(next);
 assert.equal(stateAtYear(next,'descriptor-b',2030),null);assert.equal(statePlanFor(next,'descriptor-b').version,2);assert.ok(statePlanFor(next,'descriptor-b').points.every(point=>point.value===null));
});
test('numeric paths and their original state bindings remain unchanged',()=>{
 const p=createDemoProject(),next=changeYearState(p,'descriptor-a',2030,'a-high',ids());validateProject(next);
 assert.equal(next.data.paths.length,2);assert.deepEqual(next.data.paths[0],p.data.paths[0]);assert.equal(stateAtYear(next,'descriptor-a',2026),'a-low');assert.equal(stateAtYear(next,'descriptor-a',2030),'a-high');
});
test('rejects cross-factor state, out of scope year and unselected factors',()=>{
 const p=createDemoProject();assert.throws(()=>changeYearState(p,'descriptor-b',2030,'a-high',ids()),/不属于/);assert.throws(()=>changeYearState(p,'descriptor-b',2040,'b-high',ids()),/年份/);p.selection.descriptorIds=[];assert.throws(()=>changeYearState(p,'descriptor-b',2030,'b-high',ids()),/先选择/);
});
test('parent selects every descendant; removing a leaf clears ancestor checks',()=>{
 const p=createDemoProject(),selected=toggleBranch(p,[],'node-1',true);
 assert.equal(selected.length,p.data.taxonomy.length);assert.deepEqual(new Set(resolveSelection(p,selected).descriptorIds),new Set(['descriptor-a','descriptor-b']));
 const partial=toggleBranch(p,selected,'node-6',false);assert.ok(!partial.includes('node-1'));assert.ok(!partial.includes('node-6'));assert.ok(partial.includes('node-peer'));assert.deepEqual(resolveSelection(p,partial).descriptorIds,['descriptor-b']);
 assert.deepEqual(toggleBranch(p,selected,'node-1',false),[]);
});
