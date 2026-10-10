from pathlib import Path
from datetime import datetime, timezone
import tempfile,shutil,subprocess,json,hashlib,re
root=Path(__file__).resolve().parent;owner=root/'local-graph-representation-prototypes/list-state'
proof='NUMERIC_SPEC_ROOT_RANK_PROOF.bend'
mutations=[
 ('original_bound_removed','TREE_MACHINE_RELATION.bend','(3n * count_catalog(Own.values( Maybe<&2, Core.Declaration>, declarations)) + 3n : Nat)','0n'),
 ('seen_root_reentry_overcharged','NUMERIC_SPEC_RANK.bend','case True{}: List.length(&2, Core.Reference, references)','case True{}: (List.length(&2, Core.Reference, references) + 1n : Nat)'),
]
probe='''import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const c=(await import(pathToFileURL(process.argv[2]))).default;
const nil=()=>({$:'Own.DNil'}), none=()=>({$:'None'}), some=value=>({$:'Some',value}), list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'}), tag=(name,fields={})=>({$:'core.'+name,...fields});
const dict=xs=>xs.reduceRight((rest,[key,value])=>({$:'Own.DCon',key,value,rest,count:99}),nil());
const label=tag('Label',{key:1,type_key:1,function_key:1}),expected=tag('AnyKind'),ref=tag('Reference',{kind:tag('Named'),name:label,expected,target:none()}),declaration=tag('Declaration',{handle:1,identity:1,function:true,bundled:false,references:list([ref])});
const facts=tag('Facts',{kind_aware:false,declarations:dict([[1,some(declaration)]]),imports:nil(),supporting:nil()});
const visited=dict([[1,false],[1,true],[42,false],[42,true]]),budget=tag('Budget',{limits:tag('LocalLimits',{work:100,depth:100,targets:100}),targets_by_path:nil(),max_targets:0,work:0,graph_work:0,max_depth:0});
const state={$:'NUMERIC_SPEC.State',visited,budget,next_address:0,pending_rev:list([])},request={$:'NUMERIC_SPEC.Request',facts,path:7,name:label,expected,depth:0,state};
const actual=c.initial_rank_within_original_bound(facts,label,expected,visited);assert.equal(actual,false);
console.log(JSON.stringify({initialRankWithinOriginalBound:actual,rawDuplicateVisited:true,firstValueFalse:true,falsified:true}));
'''
samples=[]
for name,target,before,after in mutations:
 with tempfile.TemporaryDirectory(prefix='.membership-mutant-',dir=owner.parent) as tmp:
  d=Path(tmp)
  for p in owner.glob('*.bend'):shutil.copyfile(p,d/p.name)
  pristine=subprocess.run(['timeout','5s','bend',str(d/proof),'--verdict'],capture_output=True,text=True);assert pristine.returncode==0 and 'ALL PROOFS CHECK' in pristine.stdout
  p=d/target;s=p.read_text();assert s.count(before)==1;p.write_text(s.replace(before,after))
  rejected=subprocess.run(['timeout','5s','bend',str(d/proof),'--verdict'],capture_output=True,text=True);output=rejected.stdout+rejected.stderr
  assert 'Error:' in output and '- expected :' in output and '- observed :' in output and 'ALL PROOFS CHECK' not in output and rejected.returncode!=124,(name,output)
  (root/('local-graph-spec-root-rank-'+name+'-mutant.log')).write_text(output)
  emit=d/'mutant.mjs';emitted=subprocess.run(['timeout','5s','bend',str(d/'NUMERIC_SPEC_ROOT_RANK_CANARY.bend'),'-o',str(emit)],capture_output=True,text=True);assert emitted.returncode==0 and emit.exists(),emitted.stdout+emitted.stderr
  js=d/'counter.mjs';js.write_text(probe);actual=subprocess.run(['node',str(js),str(emit)],capture_output=True,text=True,timeout=5);assert actual.returncode==0,actual.stdout+actual.stderr
  samples.append({'name':name,'target':target,'before':before,'after':after,'pristinePassed':True,'semanticProofRejected':True,'failureLocation':re.search(r'Location: ([^\n]+)',output).group(1),'counterexample':json.loads(actual.stdout)})
record={'at':datetime.now(timezone.utc).isoformat(),'passed':True,'mutants':samples,'sourceHashes':{n:hashlib.sha256((owner/n).read_bytes()).hexdigest() for n in [proof,'NUMERIC_SPEC_RANK.bend','NUMERIC_SPEC_ROOT_RANK_LAWS.bend','NUMERIC_SPEC_ROOT_PARTITION_LAWS.bend','NUMERIC_SPEC_ROOT_LOOKUP_LAWS.bend','NUMERIC_SPEC_COUNT_LAWS.bend','TREE_MACHINE_RELATION.bend']},'scope':'actual initial_rank_within_original_bound qualification; semantic rejection may be in supporting partition/count; each mutant also yields concrete emitted main-theorem counterexample with seen root, duplicate raw visits and false stored values; no completion/output equivalence/adoption claim'}
(root/'local-graph-spec-root-rank-mutants.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({'passed':True,'mutants':len(samples),'actualMainTheoremCounterexamples':len(samples)}))
