#!/usr/bin/env python3
"""Approved positive Receipt slice; literal and law-owned reject-all controls."""
from pathlib import Path
import hashlib,json,re,shutil,subprocess,os
HERE=Path(__file__).resolve().parent
BASE=HERE.parent
ROOT=BASE.parents[1]
OUT=BASE/'evidence'
manifest=json.loads((HERE/'approval.json').read_text())
assert hashlib.sha256((BASE/'core.bend').read_bytes()).hexdigest()==manifest['core_sha256']
assert hashlib.sha256((HERE/'LAWS.bend').read_bytes()).hexdigest()==manifest['law_sha256']
checks=[]
def run(file,name,expected=0,verdict=False,env=None,needle=None):
 p=subprocess.run([str(BASE/'bend-check'),str(file),'--verdict' if verdict else '--check-only'],capture_output=True,text=True,env=env)
 output='\n'.join(line.rstrip() for line in (p.stdout+p.stderr).splitlines())+'\n'
 (OUT/(name+'.log')).write_text(output)
 checks.append({'name':name,'exit':p.returncode,'expected':expected,'pass':p.returncode==expected and (needle is None or needle in output)})
run(HERE/'PROOF.bend','receipt-proof',verdict=True,needle='ALL PROOFS CHECK')
run(HERE/'PROOF.bend','receipt-kernel-disabled',1,True,dict(os.environ,BENDTT='/usr/bin/false'),'mismatch')
# First slice is immutable and retains its own kernel/mutant controls.
p=subprocess.run(['python3',str(BASE/'approved'/'check-approved.py')],capture_output=True,text=True)
checks.append({'name':'first-approved-slice-preserved','exit':p.returncode,'expected':0,'pass':p.returncode==0})
mirror=BASE/'.proof-mutants'/'receipt-reject-all'
if mirror.exists():shutil.rmtree(mirror)
proto=mirror/'prototypes'/'edit-admission-comparison'
for rel in ('core.bend','spec.bend','approved-receipt'):
 src=BASE/rel;dst=proto/rel
 if src.is_dir():shutil.copytree(src,dst,ignore=shutil.ignore_patterns('*.json','__pycache__'))
 else:dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
(mirror/'packages').symlink_to(ROOT/'packages',target_is_directory=True)
# Literal uses the approved equation and premise, specialized to no PRE history.
text=(HERE/'LAWS.bend').read_text();body=text[text.index('law receipt_complete:'):]
premise=re.search(r'for correct: ([^\n]+)',body)[1]
expr=re.sub(r'^\s*(law [^\n]+|for [^\n]+)\n','',body,flags=re.M).strip()
values={'history':'Nil{}','partition':'1n','live':'1n','tool':'9n','now':'1n'}
def instantiate(s):return re.sub(r'\b('+'|'.join(values)+r')\b',lambda m:values[m[0]],s)
literal='import Base\nimport ../core.bend as C\nimport ../spec.bend as S\ndef premise_at() -> '+instantiate(premise)+':\n  {==}\ndef approved_at(correct: '+instantiate(premise)+') -> '+instantiate(expr)+':\n  {==}\n'
(proto/'approved-receipt'/'at.bend').write_text(literal)
run(proto/'approved-receipt'/'PROOF.bend','receipt-mirror-baseline',verdict=True,needle='ALL PROOFS CHECK')
run(proto/'approved-receipt'/'at.bend','receipt-at-baseline',needle='ALL PROOFS CHECK')
# Reject every Receipt POST. Predicate and all proof source files stay unchanged.
p=proto/'core.bend';core=p.read_text();old='case Receipt{}: post_guard(state, tool, receipt_eligible(state, partition, live, tool, now))'
assert core.count(old)==1;p.write_text(core.replace(old,'case Receipt{}: state'))
run(proto/'core.bend','receipt-reject-all-compiles',needle='ALL PROOFS CHECK')
run(proto/'approved-receipt'/'at.bend','receipt-at-mutant',1,needle='Location: approved_at')
run(proto/'approved-receipt'/'PROOF.bend','receipt-proof-mutant',1,needle='Location: Laws.receipt_complete')
report={'slice':'Receipt positive completeness only','sources':manifest,'proof_sha256':hashlib.sha256((HERE/'PROOF.bend').read_bytes()).hexdigest(),'checks':checks,'mutant':'Receipt post branch returns state; all law and proof files unchanged','all_pass':all(x['pass'] for x in checks)}
(OUT/'receipt-approved-gate.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(checks,indent=2));raise SystemExit(0 if report['all_pass'] else 1)
