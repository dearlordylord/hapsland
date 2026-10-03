#!/usr/bin/env python3
"""Approved positive reopening slice; reject all reopening POSTs with valid PRE premises."""
from pathlib import Path
import hashlib,json,re,shutil,subprocess,os
HERE=Path(__file__).resolve().parent;BASE=HERE.parent;ROOT=BASE.parents[1];OUT=BASE/'evidence'
manifest=json.loads((HERE/'approval.json').read_text())
assert hashlib.sha256((BASE/'core.bend').read_bytes()).hexdigest()==manifest['core_sha256']
assert hashlib.sha256((HERE/'LAWS.bend').read_bytes()).hexdigest()==manifest['law_sha256']
checks=[]
def run(file,name,expected=0,verdict=False,env=None,needle=None):
 p=subprocess.run([str(BASE/'bend-check'),str(file),'--verdict' if verdict else '--check-only'],capture_output=True,text=True,env=env)
 output='\n'.join(line.rstrip() for line in (p.stdout+p.stderr).splitlines())+'\n';(OUT/(name+'.log')).write_text(output)
 checks.append({'name':name,'exit':p.returncode,'expected':expected,'pass':p.returncode==expected and (needle is None or needle in output)})
run(HERE/'PROOF.bend','reopen-proof',verdict=True,needle='ALL PROOFS CHECK')
run(HERE/'controls.bend','reopen-excluded-boundary-controls',needle='ALL PROOFS CHECK')
run(HERE/'PROOF.bend','reopen-kernel-disabled',1,True,dict(os.environ,BENDTT='/usr/bin/false'),'mismatch')
p=subprocess.run(['python3',str(BASE/'approved-closure'/'check-approved.py')],capture_output=True,text=True)
checks.append({'name':'prior-two-current-slices-preserved','exit':p.returncode,'expected':0,'pass':p.returncode==0})
mirror=BASE/'.proof-mutants'/'reject-reopening-post'
if mirror.exists():shutil.rmtree(mirror)
proto=mirror/'prototypes'/'edit-admission-comparison'
for rel in ('core.bend','spec.bend','approved','approved-closure','approved-reopen'):
 src=BASE/rel;dst=proto/rel
 if src.is_dir():shutil.copytree(src,dst,ignore=shutil.ignore_patterns('*.json','__pycache__'))
 else:dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
for rel in ('packages','vendor'):(mirror/rel).symlink_to(ROOT/rel,target_is_directory=True)
text=(HERE/'LAWS.bend').read_text();body=text[text.index('law fresh_registered_post_reopens:'):]
expr=re.sub(r'^\s*(law [^\n]+|for [^\n]+)\n','',body,flags=re.M).strip()
history='[C.Pre{1n,1n,1n,1n,20n,1n},C.Post{1n,1n,1n,2n},C.RoundClose{3n}]'
state=f'C.run({history},C.Current{{}},C.initial())'
values={'state':state,'history':history,'tool':'2n','start':'4n','deadline':'12n','issued_at':'4n','post_at':'4n',
 'registered':f'C.pre(C.Current{{}},{state},1n,1n,2n,4n,12n,4n)'}
def inst(s):return re.sub(r'\b('+'|'.join(values)+r')\b',lambda m:values[m[0]],s)
premises=re.findall(r'^\s*for (\w+): (\{[^\n]+)',body,re.M)
literal='import Base\nimport ../core.bend as C\nimport ../approved-reopen/spec.bend as D\nimport ../approved-closure/spec.bend as O\n'
for name,premise in premises:literal+=f'def premise_{name}() -> {inst(premise)}:\n  {{==}}\n'
params=','.join(name+': '+inst(premise) for name,premise in premises)
literal+='def approved_at('+params+') -> '+inst(expr)+':\n  {==}\n'
(proto/'approved-reopen'/'at.bend').write_text(literal)
run(proto/'approved-reopen'/'PROOF.bend','reopen-mirror-baseline',verdict=True,needle='ALL PROOFS CHECK')
run(proto/'approved-reopen'/'at.bend','reopen-at-baseline',needle='ALL PROOFS CHECK')
core=(proto/'core.bend').read_text()
old='current_post(expired, partition, live, tool, now, seen(tool, completed(expired)))'
assert core.count(old)==1
# Preserve the first completed-round setup; reject every POST with old round >0.
core=core.replace(old,'current_post(expired, partition, live, tool, now, Bool.or(Nat.is_gt(round(expired),0n), seen(tool, completed(expired))))')
(proto/'core.bend').write_text(core)
run(proto/'core.bend','reject-reopening-mutant-compiles',needle='ALL PROOFS CHECK')
run(proto/'approved-reopen'/'helpers.bend','reopen-mutant-support-facts',verdict=True,needle='ALL PROOFS CHECK')
witness=literal[:literal.index('def approved_at(')]+'def mutant_actually_refuses() -> '+inst('{O.outcome(C.post(C.Current{},registered,C.owner(C.get_permit(state)),C.lifetime(C.get_permit(state)),tool,post_at)) == O.Outcome{1n,1n,False{}} : O.Outcome}')+':\n  {==}\n'
(proto/'approved-reopen'/'witness.bend').write_text(witness)
run(proto/'approved-reopen'/'witness.bend','reopen-mutant-actual-refusal',needle='ALL PROOFS CHECK')
run(proto/'approved-reopen'/'at.bend','reopen-at-mutant',1,needle='Location: approved_at')
run(proto/'approved-reopen'/'PROOF.bend','reopen-proof-mutant',1,needle='Location: Laws.fresh_registered_post_reopens')
report={'slice':'Positive Current POST reopening after actual fresh PRE registration','sources':manifest,'proof_sha256':hashlib.sha256((HERE/'PROOF.bend').read_bytes()).hexdigest(),'checks':checks,'mutant':'Reject all Current POSTs when old round >0; first completed-round setup and fresh PRE success preserved. All law/proof files unchanged. Global reject-all PRE remains outside the conditional success law.','all_pass':all(x['pass'] for x in checks)}
(OUT/'reopen-approved-gate.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(checks,indent=2));raise SystemExit(0 if report['all_pass'] else 1)
