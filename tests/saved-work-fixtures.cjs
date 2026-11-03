const {fixture}=require('./solver-browser-fixtures.cjs');
async function archive(kind='completed'){
 const {prepareRun,solve,createEnumeration}=await import('../src/modules/solver/engine.mjs');const p=fixture({mode:kind==='zero'?'opposite':'copy'});p.id='saved-work-fixture';const acks={currentAssumptions:true,unknownStateScope:true};if(kind==='preflight')p.data.judgments[0].entries[0].score=null;const pre=prepareRun(p,{year:2030,selectedJudgmentIds:p.data.judgments.map(j=>j.id),assumptionAcknowledgements:acks});let result=null,partialFound;
 if(pre.input){if(kind==='failed'){const job=createEnumeration(pre.input);job.step(1);job.cancel();const output=job.step();result=output.result;partialFound=output.found;}else result=solve(pre.input);}
 const value={archiveVersion:1,RunInput:pre.input?structuredClone(pre.input):null,RunResult:result,projectInputSnapshot:{schemaVersion:p.schemaVersion,contractVersion:p.contractVersion,projectId:p.id,revision:p.revision,scope:p.scope,data:p.data,selection:p.selection},preflightDiagnostics:pre.diagnostics,assumptionAcknowledgements:acks,selectionOfJudgments:p.data.judgments.map(j=>({id:j.id,version:j.version,evidenceRefs:j.evidenceRefs}))};if(partialFound!==undefined)value.partialFound=partialFound;return {project:p,archive:value};
}
module.exports={archive};
