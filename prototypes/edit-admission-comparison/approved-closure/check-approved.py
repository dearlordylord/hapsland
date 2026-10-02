#!/usr/bin/env python3
"""Approved closure slice; actual late POST admission mutant, not equivalent retention."""
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
run(HERE/'PROOF.bend','closure-proof',verdict=True,needle='ALL PROOFS CHECK')
run(HERE/'controls.bend','closure-rejected-close-controls',needle='ALL PROOFS CHECK')
run(HERE/'PROOF.bend','closure-kernel-disabled',1,True,dict(os.environ,BENDTT='/usr/bin/false'),'mismatch')
p=subprocess.run(['python3',str(BASE/'approved-receipt'/'check-approved.py')],capture_output=True,text=True)
checks.append({'name':'prior-two-approved-slices-preserved','exit':p.returncode,'expected':0,'pass':p.returncode==0})
mirror=BASE/'.proof-mutants'/'dropped-closure'
if mirror.exists():shutil.rmtree(mirror)
proto=mirror/'prototypes'/'edit-admission-comparison'
for rel in ('core.bend','spec.bend','approved','approved-closure'):
 src=BASE/rel;dst=proto/rel
 if src.is_dir():shutil.copytree(src,dst,ignore=shutil.ignore_patterns('*.json','__pycache__'))
 else:dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
for rel in ('packages','vendor'):(mirror/rel).symlink_to(ROOT/rel,target_is_directory=True)
text=(HERE/'LAWS.bend').read_text();body=text[text.index('law delayed_post_after_close:'):]
expr=re.sub(r'^\s*(law [^\n]+|for [^\n]+)\n','',body,flags=re.M).strip()
history='[C.Pre{1n,1n,1n,1n,20n,1n},C.Post{1n,1n,1n,4n},C.Pre{1n,1n,2n,5n,30n,5n}]'
values={'state':f'C.run({history},C.Current{{}},C.initial())','history':history,'tool':'2n','closed_at':'6n','post_at':'7n'}
def inst(s):return re.sub(r'\b('+'|'.join(values)+r')\b',lambda m:values[m[0]],s)
premises=re.findall(r'^\s*for (\w+): (\{[^\n]+)',body,re.M)
literal='import Base\nimport ../core.bend as C\nimport ../approved-closure/spec.bend as D\n'
for name,premise in premises:literal+=f'def premise_{name}() -> {inst(premise)}:\n  {{==}}\n'
params=','.join(name+': '+inst(premise) for name,premise in premises)
literal+='def approved_at('+params+') -> '+inst(expr)+':\n  {==}\n'
(proto/'approved-closure'/'at.bend').write_text(literal)
run(proto/'approved-closure'/'PROOF.bend','closure-mirror-baseline',verdict=True,needle='ALL PROOFS CHECK')
run(proto/'approved-closure'/'at.bend','closure-at-baseline',needle='ALL PROOFS CHECK')
core=(proto/'core.bend').read_text();old='''      +s = remember_permits(get_pending(get_permit(state)), state)
      State{permit, completed(s), count(s), round(s), False{}, spent(s)}'''
assert core.count(old)==1
core=core.replace(old,'      State{get_permit(state), completed(state), count(state), round(state), False{}, spent(state)}')
(proto/'core.bend').write_text(core)
run(proto/'core.bend','dropped-closure-mutant-compiles',needle='ALL PROOFS CHECK')
run(proto/'approved-closure'/'helpers.bend','closure-mutant-support-facts',verdict=True,needle='ALL PROOFS CHECK')
# Concrete witness computes acceptance + successor in the mutant, with all PRE/close premises true.
witness=literal[:literal.index('def approved_at(')]+'def mutant_actually_reopens() -> '+inst('{D.outcome(C.post(C.Current{},C.close(state,closed_at),C.owner(C.get_permit(state)),C.lifetime(C.get_permit(state)),tool,post_at)) == D.Outcome{2n,2n,True{}} : D.Outcome}')+':\n  {==}\n'
(proto/'approved-closure'/'witness.bend').write_text(witness)
run(proto/'approved-closure'/'witness.bend','closure-mutant-actual-reopen',needle='ALL PROOFS CHECK')
run(proto/'approved-closure'/'at.bend','closure-at-mutant',1,needle='Location: approved_at')
run(proto/'approved-closure'/'PROOF.bend','closure-proof-mutant',1,needle='Location: Laws.delayed_post_after_close')
report={'slice':'Pending PRE, successful active closure, matching delayed POST: no count/round/active reopening','sources':manifest,'proof_sha256':hashlib.sha256((HERE/'PROOF.bend').read_bytes()).hexdigest(),'checks':checks,'mutant':'Dropped closure keeps old Pstate and completed identities while wrapper goes inactive. Defeats purge+fence+completion defenses; no law or proof file adjusted.','all_pass':all(x['pass'] for x in checks)}
(OUT/'closure-approved-gate.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(checks,indent=2));raise SystemExit(0 if report['all_pass'] else 1)
