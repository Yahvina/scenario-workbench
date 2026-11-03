// Independent literal copy matrix; expected values do not come from the engine.
function input(){return {schemaVersion:1,contractVersion:'1.0.0',projectId:'solver-input-audit',revision:0,scope:{regionId:'audit-region',years:[2030]},year:2030,activeDescriptorIds:['A','B'],stateDefinitions:['A0','A1','B0','B1'].map(id=>({id,descriptorId:id[0],label:id,version:1,validYears:[2030],scope:{regionId:'audit-region'}})),matrix:{version:1,year:2030,descriptorIds:['A','B'],stateIdsByDescriptor:{A:['A0','A1'],B:['B0','B1']},entries:[['A0','B0',1,'AB'],['A0','B1',-1,'AB'],['A1','B0',-1,'AB'],['A1','B1',1,'AB'],['B0','A0',1,'BA'],['B0','A1',-1,'BA'],['B1','A0',-1,'BA'],['B1','A1',1,'BA']].map(([sourceStateId,targetStateId,score,judgmentId])=>({sourceStateId,targetStateId,score,judgmentId})),coverage:{required:8,judged:8,missingPairs:[]},evidenceRefs:[]},lockedStateIds:[],method:'cib',engineVersion:'cib-exact-1.0.0',solverConfig:{mode:'enumerate',limit:100000},seed:null};}
function cases(){const list=[],add=(label,code,mutate)=>{const x=input();mutate(x);list.push({label,code,input:x});};
 add('F1-known-year','STATE_YEAR_MISMATCH',x=>{x.stateDefinitions[0].validYears=[2035];x.assumptionAcknowledgements={currentAssumptions:true,unknownStateScope:true};});
 add('F1-known-region','STATE_REGION_MISMATCH',x=>{x.stateDefinitions[0].scope.regionId='elsewhere';x.assumptionAcknowledgements={currentAssumptions:true,unknownStateScope:true};});
 for(const v of [999,0,'1',null])add('matrix-version-'+v,'MATRIX_VERSION_UNSUPPORTED',x=>x.matrix.version=v);
 for(const v of ['', ' ', 7, null])add('projectId-'+v,'INVALID_RUN_METADATA',x=>x.projectId=v);
 for(const v of [-1,0.5,'0',Number.MAX_SAFE_INTEGER+1])add('revision-'+v,'INVALID_RUN_METADATA',x=>x.revision=v);
 for(const v of [null,7,[],false,'',' '])add('scope-region-'+JSON.stringify(v),'INVALID_SCOPE',x=>x.scope.regionId=v);
 for(const v of ['2030',null,[2030,2030],[2030.5],[1899],[2301],[2030,null]])add('scope-years-'+JSON.stringify(v),'INVALID_SCOPE',x=>x.scope.years=v);
 add('scope-array','INVALID_SCOPE',x=>{x.scope=[];});add('scope-sparse-years','INVALID_SCOPE',x=>x.scope.years=[2030,,2035]);
 add('all-years-9999','INVALID_SCOPE',x=>{x.year=9999;x.matrix.year=9999;x.scope.years=[9999];});
 for(const v of ['2030',2035,1899,2301])add('research-year-'+v,'INVALID_YEAR',x=>x.year=v);
 add('matrix-year','INVALID_MATRIX_METADATA',x=>x.matrix.year=2035);
 for(const v of [0,-1,0.5,'1',Number.MAX_SAFE_INTEGER+1])add('state-version-'+v,'INVALID_STATE_DEFINITION',x=>x.stateDefinitions[0].version=v);
 for(const v of ['',7,null])add('state-id-'+v,'INVALID_STATE_DEFINITION',x=>x.stateDefinitions[0].id=v);
 add('state-owner','INVALID_STATE_DEFINITION',x=>x.stateDefinitions[0].descriptorId='C');add('duplicate-state-id','INVALID_STATE_DEFINITION',x=>x.stateDefinitions[0].id='A1');
 for(const v of ['2030',null,[2030,2030],[2030.5],[1899],[2301]])add('state-years-'+JSON.stringify(v),'STATE_YEARS_INVALID',x=>x.stateDefinitions[0].validYears=v);
 for(const v of [null,[],7])add('state-scope-'+JSON.stringify(v),'STATE_SCOPE_INVALID',x=>x.stateDefinitions[0].scope=v);
 for(const v of ['', ' ', 7, [], false])add('state-region-'+JSON.stringify(v),'STATE_SCOPE_INVALID',x=>x.stateDefinitions[0].scope.regionId=v);
 for(const [label,v]of [['zero',{required:0,judged:0,missingPairs:[]}],['wrong-required',{required:7,judged:8,missingPairs:[]}],['wrong-judged',{required:8,judged:7,missingPairs:[]}],['negative',{required:-8,judged:8,missingPairs:[]}],['string',{required:'8',judged:8,missingPairs:[]}],['false-gap',{required:8,judged:8,missingPairs:[{sourceStateId:'A0',targetStateId:'B0'}]}],['null-gaps',{required:8,judged:8,missingPairs:null}],['missing',undefined],['null',null]])add('coverage-'+label,'COVERAGE_MISMATCH',x=>x.matrix.coverage=v);
 add('extra-state-map','INVALID_MATRIX_METADATA',x=>x.matrix.stateIdsByDescriptor.C=[]);add('matrix-evidence-shape','INVALID_MATRIX_METADATA',x=>x.matrix.evidenceRefs='paper');
 return list;
}
module.exports={input,cases};
