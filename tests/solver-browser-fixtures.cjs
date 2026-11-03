function fixture({sizes=[2,2],mode='copy'}={}){
 const base={version:1,provenance:{origin:'fixture'}},ids=sizes.map((_,i)=>String.fromCharCode(65+i));
 const p={schemaVersion:1,contractVersion:'1.0.0',id:'solver-hand-fixture',title:'手算矩阵测试（非真实政策）',revision:0,view:{perspective:'public',module:'solver',objectId:null},scope:{regionId:'fixture-region',years:[2030,2035]},selection:{nodeIds:[],descriptorIds:ids,stateIds:[],lockedStateIds:[]},data:{policies:[],taxonomy:[],descriptors:[],states:[],paths:[],judgments:[],evidence:[],mappings:[]}};
 p.data.descriptors=ids.map((id,i)=>({...base,id,label:id,role:'input',stateIds:Array.from({length:sizes[i]},(_,n)=>id+n),evidenceRefs:[]}));
 p.data.states=p.data.descriptors.flatMap(d=>d.stateIds.map(id=>({...base,id,label:id,descriptorId:d.id,range:null,unit:null,scope:{regionId:p.scope.regionId},validYears:[2030,2035],evidenceRefs:[]})));
 for(const a of p.data.descriptors)for(const b of p.data.descriptors){if(a===b)continue;p.data.judgments.push({...base,id:a.id+'->'+b.id,sourceDescriptorId:a.id,targetDescriptorId:b.id,scope:{regionId:p.scope.regionId},validYears:[2030,2035],directness:'direct',curveEncoding:null,alternatives:[],rationale:'仅测试假设',evidenceRefs:[],reviewStatus:'draft',entries:a.stateIds.flatMap((x,i)=>b.stateIds.map((y,j)=>({sourceStateId:x,targetStateId:y,score:mode==='zero'?0:(i===j?1:-1)*(mode==='opposite'&&a.id==='B'&&b.id==='A'?-1:1)})))});}
 return p;
}
module.exports={fixture};
