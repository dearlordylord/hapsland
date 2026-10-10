from pathlib import Path
from datetime import datetime, timezone
import tempfile,shutil,subprocess,json,hashlib,re
root=Path(__file__).resolve().parent;owner=root/'local-graph-representation-prototypes/list-state'
proof='NUMERIC_SPEC_MEMBERSHIP_PROOF.bend'
mutations=[
 ('root_forgets_prior_visits','Own.set( Bool, visited, identity, True{})','Own.set( Bool, Own.DNil{}, identity, True{})',2),
 ('reference_budget_forgets_prior_visits','case State{visited, _, address, pending}: State{visited, budget, address, pending}','case State{_, _, address, pending}: State{Own.DNil{}, budget, address, pending}',3),
 ('zero_fuel_forgets_prior_visits','case Request{_, _, _, _, _, state}: BuildResult{InsufficientBound{state}}','case Request{_, _, _, _, _, State{_, budget, address, pending}}: BuildResult{InsufficientBound{State{Own.DNil{}, budget, address, pending}}}',0),
]
probe='''import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const c=(await import(pathToFileURL(process.argv[2]))).default, fuel=BigInt(process.argv[3]);
const nil=()=>({$:'Own.DNil'}), none=()=>({$:'None'}), some=value=>({$:'Some',value}), list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'}), tag=(name,fields={})=>({$:'core.'+name,...fields});
const dict=xs=>xs.reduceRight((rest,[key,value])=>({$:'Own.DCon',key,value,rest,count:99}),nil());
const label=tag('Label',{key:1,type_key:1,function_key:1}),expected=tag('AnyKind'),ref=tag('Reference',{kind:tag('Named'),name:label,expected,target:none()}),declaration=tag('Declaration',{handle:1,identity:1,function:true,bundled:false,references:list([ref])});
const facts=tag('Facts',{kind_aware:false,declarations:dict([[1,some(declaration)]]),imports:nil(),supporting:nil()});
const visited=dict([[42,false],[42,true]]),budget=tag('Budget',{limits:tag('LocalLimits',{work:100,depth:100,targets:100}),targets_by_path:nil(),max_targets:0,work:0,graph_work:0,max_depth:0});
const state={$:'NUMERIC_SPEC.State',visited,budget,next_address:0,pending_rev:list([])},request={$:'NUMERIC_SPEC.Request',facts,path:7,name:label,expected,depth:0,state};
const before=c['NUMERIC_SPEC_MEMBERSHIP.request_member'](request,42n);assert.equal(before,true);
const result=c['NUMERIC_SPEC.interpret'](fuel,request),after=c['NUMERIC_SPEC_MEMBERSHIP.result_member'](result,42n);assert.equal(after,false);
console.log(JSON.stringify({priorMembership:before,resultMembership:after,fuel:Number(fuel),query:42,rawDuplicateVisited:true,firstValueFalse:true,falsified:true}));
'''
samples=[]
for name,before,after,fuel in mutations:
 with tempfile.TemporaryDirectory(prefix='.membership-mutant-',dir=owner.parent) as tmp:
  d=Path(tmp)
  for p in owner.glob('*.bend'):shutil.copyfile(p,d/p.name)
  pristine=subprocess.run(['timeout','5s','bend',str(d/proof),'--verdict'],capture_output=True,text=True);assert pristine.returncode==0 and 'ALL PROOFS CHECK' in pristine.stdout
  p=d/'NUMERIC_SPEC.bend';s=p.read_text();assert s.count(before)==1;p.write_text(s.replace(before,after))
  rejected=subprocess.run(['timeout','5s','bend',str(d/proof),'--verdict'],capture_output=True,text=True);output=rejected.stdout+rejected.stderr
  assert 'Error:' in output and '- expected :' in output and '- observed :' in output and 'ALL PROOFS CHECK' not in output and rejected.returncode!=124,(name,output)
  (root/('local-graph-spec-membership-'+name+'-mutant.log')).write_text(output)
  emit=d/'mutant.mjs';emitted=subprocess.run(['timeout','5s','bend',str(d/'NUMERIC_SPEC_MEMBERSHIP_CANARY.bend'),'-o',str(emit)],capture_output=True,text=True);assert emitted.returncode==0 and emit.exists(),emitted.stdout+emitted.stderr
  js=d/'counter.mjs';js.write_text(probe);actual=subprocess.run(['node',str(js),str(emit),str(fuel)],capture_output=True,text=True,timeout=5);assert actual.returncode==0,actual.stdout+actual.stderr
  samples.append({'name':name,'target':'NUMERIC_SPEC.bend','before':before,'after':after,'pristinePassed':True,'semanticProofRejected':True,'failureLocation':re.search(r'Location: ([^\n]+)',output).group(1),'counterexample':json.loads(actual.stdout)})
record={'at':datetime.now(timezone.utc).isoformat(),'passed':True,'mutants':samples,'sourceHashes':{n:hashlib.sha256((owner/n).read_bytes()).hexdigest() for n in [proof,'NUMERIC_SPEC.bend','NUMERIC_SPEC_MEMBERSHIP_LAWS.bend','NUMERIC_SPEC_MEMBERSHIP_PRIMITIVE_PROOF.bend','NUMERIC_SPEC_MEMBERSHIP_RECURSIVE_PROOF.bend']},'scope':'actual whole interpreter membership theorem qualification; failures may be detected in primitive support; each mutant additionally falsifies the main theorem using emitted actual interpreter, raw duplicate visited keys and false stored Bool; no completion/output equivalence/adoption claim'}
(root/'local-graph-spec-membership-mutants.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({'passed':True,'mutants':len(samples),'actualMainTheoremCounterexamples':len(samples)}))
