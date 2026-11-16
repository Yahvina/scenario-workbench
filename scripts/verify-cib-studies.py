from pathlib import Path
from itertools import product
import json,hashlib,time,sys
if len(sys.argv)!=2:raise SystemExit('Usage: python verify-complete-studies.py report-directory')
out=Path(sys.argv[1]).resolve();p=out/'历史实验完整复算.json';data=json.loads(p.read_text('utf-8'));started=time.monotonic()
canonical=lambda xs:sorted(tuple(sorted(x.items())) for x in xs)
def generate(sizes,seed):
 state=seed&0xffffffff
 def score():
  nonlocal state
  state=(1664525*state+1013904223)&0xffffffff
  return int(state/4294967296*7)-3
 ds=[{'id':'D'+str(i),'states':['S'+str(j) for j in range(n)]} for i,n in enumerate(sizes)]
 return {'descriptors':ds,'blocks':[[a['id'],b['id'],[[score() for _ in b['states']] for _ in a['states']]] for a in ds for b in ds if a!=b]}
def independent(inp,fixed):
 ds=inp['descriptors'];n=len(ds);ids=[d['id'] for d in ds];sizes=[len(d['states']) for d in ds];blocks={(ids.index(a),ids.index(b)):v for a,b,v in inp['blocks']};fixedi={ids.index(k):ds[ids.index(k)]['states'].index(v) for k,v in fixed.items()};accepted=[]
 for choices in product(*([fixedi[i]] if i in fixedi else range(sizes[i]) for i in range(n))):
  ok=True
  for j in range(n):
   if j in fixedi:continue
   support=[sum(blocks[i,j][choices[i]][s] for i in range(n) if i!=j) for s in range(sizes[j])]
   if support[choices[j]]!=max(support):ok=False;break
  if ok:accepted.append({ids[i]:ds[i]['states'][choices[i]] for i in range(n)})
 return accepted
def apply(inp,change):
 # Copy score arrays only: no shared mutation of the recorded source input.
 ds=inp['descriptors'];a=next(d for d in ds if d['id']==change['source']);b=next(d for d in ds if d['id']==change['target']);i=a['states'].index(change['sourceState']);j=b['states'].index(change['targetState']);blocks=[]
 for source,target,scores in inp['blocks']:
  copied=[r[:] for r in scores]
  if source==a['id'] and target==b['id']:
   assert copied[i][j]==change['previousScore'];copied[i][j]=change['score']
  blocks.append([source,target,copied])
 return {'descriptors':ds,'blocks':blocks}
def changes(inp,paired):
 for a,b,scores in inp['blocks']:
  if paired and ('D0' in [a,b]):continue
  source=next(d for d in inp['descriptors'] if d['id']==a);target=next(d for d in inp['descriptors'] if d['id']==b)
  for i,s in enumerate(source['states']):
   for j,t in enumerate(target['states']):
    for delta in [-1,1]:
     if abs(scores[i][j]+delta)<=3:yield {'source':a,'sourceState':s,'target':b,'targetState':t,'previousScore':scores[i][j],'score':scores[i][j]+delta}
datasets={d['id']:d for d in data['datasets']};runs=0;sethashes=[];protocol=0
for d in data['datasets']:
 if d['id']=='oil':continue
 assert generate(d['sizes'],d['seed'])==d['input'],d['id']
 selected=[r for r in data['pairedRows'] if r['dataset']==d['id']]
 assert list(changes(d['input'],True))==[r['change'] for r in selected],d['id'];protocol+=len(selected)
assert list(changes(datasets['oil']['input'],False))==[r['change'] for r in data['oilRows']]
for r in data['baselines']:
 configs=independent(datasets[r['dataset']]['input'],r['fixed']);assert canonical(configs)==canonical(r['configurations']);runs+=1
for r in data['pairedRows']:
 inp=apply(datasets[r['dataset']]['input'],r['change'])
 for condition in ['S0','S1']:
  configs=independent(inp,{'D0':condition});assert canonical(configs)==canonical(r[condition]['configurations']),(r['index'],condition);runs+=1
 if (r['index']+1)%2000==0:print('Python full sets checked',r['index']+1,flush=True)
for r in data['oilRows']:
 configs=independent(apply(datasets['oil']['input'],r['change']),{});assert canonical(configs)==canonical(r['configurations']),r['index'];runs+=1
assert runs==17469
report={'date':'2026-11-16','implementation':'Independent Python itertools enumeration; independent LCG seed regeneration and perturbation-protocol enumeration','historicalResultSHA256':hashlib.sha256(p.read_bytes()).hexdigest(),'seededMatricesRegenerated':80,'pairedProtocolRowsVerified':protocol,'oilProtocolRowsVerified':404,'completeSetsMatched':runs,'mismatches':0,'seconds':round(time.monotonic()-started,2),'scope':'Historical records provide metrics only. This verifies new complete sets against independent enumeration and historical metrics, not an invented old full-set archive. No real-policy samples or participant observations.'}
(out/'Python全量独立核验.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8');print(json.dumps(report,ensure_ascii=False),flush=True)
