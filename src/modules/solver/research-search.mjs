import { runCib } from '../../standalone-cib/index.mjs';

const key = cell => cell.join(',');
const need = (ok, message) => { if (!ok) throw new Error(message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export function researchExample() {
  return { sizes:[2,2], cells:[[0,0,1,0,0],[0,0,1,1,0],[0,1,1,0,0],[0,1,1,1,1],
    [1,0,0,0,1],[1,0,0,1,0],[1,1,0,0,0],[1,1,0,1,1]],
    uncertain:[{cell:[0,0,1,0],values:[-1,0]},{cell:[0,0,1,1],values:[0,1]}],
    sum_preserving_groups:[[[0,0,1,0],[0,0,1,1]]], mode:'ordinary' };
}
export function inspectResearchCase(value) {
  need(object(value),'研究输入须为JSON对象。');
  need(Object.keys(value).every(k=>['sizes','cells','uncertain','equal_delta_groups','sum_preserving_groups','fixed','mode','name','expected','labels','source','locator','provenance'].includes(k)),'包含未支持字段；请勿把其他格式的约束直接当作本研究输入。');
  const c=structuredClone(value),sizes=c.sizes;
  need(Array.isArray(sizes)&&sizes.length>=2&&sizes.length<=20&&sizes.every(n=>Number.isInteger(n)&&n>0&&n<=12),'需要2至20个因素，每个因素1至12个状态。');
  need(Array.isArray(c.cells)&&Array.isArray(c.uncertain||[]),'缺少评分表或可改范围格式无效。');
  const cells=new Map();
  for(const r of c.cells){
    need(Array.isArray(r)&&r.length===5&&r.every(Number.isInteger),'评分格须为五个整数；缺分不能补0。');
    const [i,a,j,b,v]=r,k=key(r.slice(0,4));
    need(i!==j&&i>=0&&j>=0&&i<sizes.length&&j<sizes.length&&a>=0&&b>=0&&a<sizes[i]&&b<sizes[j]&&Math.abs(v)<=3&&!cells.has(k),'评分格重复、越界或分数不在−3至+3。');
    cells.set(k,v);
  }
  need(cells.size===sizes.reduce((n,s,i)=>n+sizes.reduce((m,t,j)=>m+(i===j?0:s*t),0),0),'需要完整有向评分矩阵；未判断不能按0计算。');
  const domains=new Map();
  for(const d of c.uncertain||[]){
    need(object(d)&&Array.isArray(d.cell)&&d.cell.length===4&&d.cell.every(Number.isInteger),'可改格坐标无效。');
    const k=key(d.cell),vs=d.values;
    need(cells.has(k)&&!domains.has(k)&&Array.isArray(vs)&&vs.length&&vs.every(v=>Number.isInteger(v)&&Math.abs(v)<=3)&&new Set(vs).size===vs.length&&vs.includes(cells.get(k)),'可改范围必须唯一、包含原评分，且均为−3至+3整数。');domains.set(k,vs);
  }
  for(const field of ['equal_delta_groups','sum_preserving_groups']){
    need(c[field]===undefined||Array.isArray(c[field]),'联动约束须为列表。');
    for(const g of c[field]||[])need(Array.isArray(g)&&g.length>=2&&g.every(k=>Array.isArray(k)&&k.length===4&&k.every(Number.isInteger)&&domains.has(key(k)))&&new Set(g.map(key)).size===g.length,'每项联动约束须引用至少两个不同的可改格。');
  }
  const mode=c.mode||'ordinary',fixed=c.fixed||{};
  need(['ordinary','locked','conditioned'].includes(mode)&&object(fixed),'固定条件格式或模式无效。');
  need(Object.entries(fixed).every(([i,v])=>/^(0|[1-9]\d*)$/.test(i)&&Number(i)<sizes.length&&Number.isInteger(v)&&v>=0&&v<sizes[Number(i)]),'固定状态越界。');
  need(mode!=='ordinary'||!Object.keys(fixed).length,'设置固定状态时须明确locked或conditioned模式。');
  need(mode!=='conditioned'||Object.keys(fixed).length<sizes.length,'至少保留一个接受检验的因素。');
  const space=sizes.reduce((n,s,i)=>n*BigInt(Object.hasOwn(fixed,String(i))?1:s),1n);
  need(space<=10000n,'本研究入口每张矩阵最多检查10000种配置；请缩小问题或在独立脚本中明确分片。');
  const descriptors=sizes.map((n,i)=>({id:String(i),states:Array.from({length:n},(_,s)=>String(s))}));
  const blocks=[];
  for(let i=0;i<sizes.length;i++)for(let j=0;j<sizes.length;j++)if(i!==j)blocks.push([String(i),String(j),Array.from({length:sizes[i]},(_,a)=>Array.from({length:sizes[j]},(_,b)=>cells.get(key([i,a,j,b]))))]);
  return {c,cells,domains,space:Number(space),input:{descriptors,blocks},options:{mode:mode==='ordinary'?'locked':mode,fixed:Object.fromEntries(Object.entries(fixed).map(([i,v])=>[i,String(v)]))}};
}
export async function searchResearchCase(value,{signal,onProgress=()=>{},yieldControl=()=>new Promise(resolve=>setTimeout(resolve,0)),maxEvaluations=200000,maxMatrices=10000}={}){
  need(Number.isSafeInteger(maxEvaluations)&&maxEvaluations>=0&&maxEvaluations<=2000000&&Number.isSafeInteger(maxMatrices)&&maxMatrices>=0&&maxMatrices<=100000,'计算预算无效。');
  const p=inspectResearchCase(value),keys=[...p.domains.keys()],positions=keys.map(()=>0);
  const out={format:'scenario-workbench.finite-research-result',version:1,status:'running',input:p.c,
    limits:{maxEvaluations,maxMatrices,configurationsPerMatrix:p.space},evaluations:0,visitedMatrices:0,legalMatrices:0,
    baseline:null,variant:null,cost:null,added:[],removed:[],minimumProved:false,completeDomainEnumeration:false,
    scope:'仅对输入声明的有限范围有效；不代表概率或现实政策效果。'};
  const memberKey=z=>JSON.stringify(z),members=result=>result.scenarios.map(s=>p.input.descriptors.map(d=>Number(s.configuration[d.id])));
  if(signal?.aborted)return {...out,status:'cancelled'};
  if(p.space>maxEvaluations||maxMatrices===0)return {...out,status:'limit'};
  const baseline=runCib(p.input,p.options);need(baseline.status==='completed','基线未完成。');
  out.baseline=members(baseline);out.evaluations=p.space;const before=new Set(out.baseline.map(memberKey));
  const legal=changes=>(p.c.equal_delta_groups||[]).every(g=>new Set(g.map(k=>changes.get(key(k))-p.cells.get(key(k)))).size===1)&&
    (p.c.sum_preserving_groups||[]).every(g=>g.reduce((n,k)=>n+changes.get(key(k))-p.cells.get(key(k)),0)===0);
  const finish=status=>({...out,status,minimumProved:status==='optimal'});
  let more=true;
  while(more){
    await yieldControl();
    if(signal?.aborted)return finish('cancelled');
    if(out.visitedMatrices>=maxMatrices)return finish('limit');
    const changes=new Map(keys.map((k,i)=>[k,p.domains.get(k)[positions[i]]]));out.visitedMatrices++;
    if(legal(changes)){
      out.legalMatrices++;
      const modified=[...changes].filter(([k,v])=>v!==p.cells.get(k));
      if(modified.length){
        if(out.evaluations+p.space>maxEvaluations)return finish('limit');
        const input=structuredClone(p.input);
        for(const [k,v]of modified){const [i,a,j,b]=k.split(',').map(Number);input.blocks.find(block=>block[0]===String(i)&&block[1]===String(j))[2][a][b]=v;}
        const trial=runCib(input,p.options);need(trial.status==='completed','候选未完成。');out.evaluations+=p.space;
        const after=members(trial),afterSet=new Set(after.map(memberKey));
        const added=after.filter(z=>!before.has(memberKey(z))),removed=out.baseline.filter(z=>!afterSet.has(memberKey(z)));
        if(added.length||removed.length){
          const d=[modified.length,modified.reduce((n,[k,v])=>n+Math.abs(v-p.cells.get(k)),0)];
          if(!out.cost||d[0]<out.cost[0]||d[0]===out.cost[0]&&d[1]<out.cost[1])Object.assign(out,{cost:d,changes:modified.map(([k,v])=>({cell:k.split(',').map(Number),score:v})),variant:after,added,removed});
          if(out.cost[0]===1&&out.cost[1]===1){out.proof='integer-universal-lower-bound';return finish('optimal');}
        }
      }
    }
    onProgress({visitedMatrices:out.visitedMatrices,evaluations:out.evaluations,legalMatrices:out.legalMatrices,bestKnownCost:out.cost});
    let i=positions.length-1;
    while(i>=0&&++positions[i]===p.domains.get(keys[i]).length)positions[i--]=0;
    more=i>=0;
  }
  out.completeDomainEnumeration=true;out.proof='finite-domain-exhaustion';return finish(out.cost?'optimal':'invariant');
}
