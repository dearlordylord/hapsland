#!/usr/bin/env python3
"""First approved slice only; check frozen sources, kernel, and law-owned mutant."""
from pathlib import Path
import hashlib,json,re,shutil,subprocess,os
HERE=Path(__file__).resolve().parent
BASE=HERE.parent
ROOT=BASE.parents[1]
OUT=BASE/'evidence'
manifest=json.loads((HERE/'approval.json').read_text())
assert hashlib.sha256((BASE/'core.bend').read_bytes()).hexdigest()==manifest['core_sha256']
assert hashlib.sha256((BASE/'LAWS.bend').read_bytes()).hexdigest()==manifest['draft_source_sha256']
assert hashlib.sha256((HERE/'LAWS.bend').read_bytes()).hexdigest()==manifest['copied_subset_sha256']
checks=[]
def run(file,name,expected=0,verdict=False,env=None,needle=None):
    p=subprocess.run([str(BASE/'bend-check'),str(file),'--verdict' if verdict else '--check-only'],capture_output=True,text=True,env=env)
    output="\n".join(line.rstrip() for line in (p.stdout+p.stderr).splitlines())+"\n"
    (OUT/(name+'.log')).write_text(output)
    ok=p.returncode==expected and (needle is None or needle in output)
    checks.append({'name':name,'exit':p.returncode,'expected':expected,'pass':ok})
    return output
run(HERE/'PROOF.bend','approved-proof',verdict=True,needle='ALL PROOFS CHECK')
run(HERE/'PROOF.bend','approved-kernel-disabled',1,True,dict(os.environ,BENDTT='/usr/bin/false'),'mismatch')
run(BASE/'LAWS.bend','unapproved-laws-still-open',1,needle='TODOs')
mirror=BASE/'.proof-mutants'/'missing-pre'
if mirror.exists():shutil.rmtree(mirror)
proto=mirror/'prototypes'/'edit-admission-comparison'
for rel in ('core.bend','spec.bend','approved'):
    src=BASE/rel; dst=proto/rel
    if src.is_dir():shutil.copytree(src,dst,ignore=shutil.ignore_patterns('*.json','__pycache__'))
    else:dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
for rel in ('packages','vendor'):(mirror/rel).symlink_to(ROOT/rel,target_is_directory=True)
# Instantiate the EXACT approved declaration by its binders, not a custom claim.
text=(HERE/'LAWS.bend').read_text();body=text[text.index('law current_fence_witness:'):]
expr=re.sub(r'^\s*(law [^\n]+|for [^\n]+)\n','',body,flags=re.M).strip()
values={'history':'Nil{}','partition':'1n','live':'1n','tool':'9n','now':'4n'}
expr=re.sub(r'\b('+'|'.join(values)+r')\b',lambda m:values[m[0]],expr)
literal='import Base\nimport ../core.bend as C\nimport ../spec.bend as S\ndef approved_at() -> '+expr+':\n  {==}\n'
(proto/'approved'/'at.bend').write_text(literal)
run(proto/'approved'/'PROOF.bend','approved-mirror-baseline',verdict=True,needle='ALL PROOFS CHECK')
run(proto/'approved'/'at.bend','approved-at-baseline',needle='ALL PROOFS CHECK')
core=(proto/'core.bend').read_text()
old='current_post(expired, partition, live, tool, now, seen(tool, completed(expired)))'
assert core.count(old)==1
core=core.replace(old,'accepted(expired,tool)')
(proto/'core.bend').write_text(core)
run(proto/'core.bend','missing-pre-mutant-compiles',needle='ALL PROOFS CHECK')
# Preserve the true supporting freshness invariant for the bypass mutant: its
# acceptance leaves the Pstate unchanged after expiry. The approved law section
# itself and all guard/lookup proof bodies remain byte-for-byte unchanged.
inv=(proto/'approved'/'invariants.bend').read_text()
a=inv.index('def post_fresh(');b=inv.index('\ndef ',a+1)
section=inv[a:b];head=section[:section.index('\n  ')]
# Signature may span lines; body starts at the existing final return colon.
idx=section.index('):') if '):' in section else -1
# Return annotation is explicit, so use its final body delimiter line.
lines=section.splitlines(); first_body=next(i for i,x in enumerate(lines) if x.startswith('  ') and not x.startswith('    ') and i>0)
# Existing function body begins after signature's trailing colon.
last_sig=next(i for i,x in enumerate(lines) if x.endswith(':'))
new='\n'.join(lines[:last_sig+1])+'\n  accepted_fresh(C.expire_now(state,now),tool,expire_now_fresh(state,now,clean))\n'
inv=inv[:a]+new+inv[b:];(proto/'approved'/'invariants.bend').write_text(inv)
run(proto/'approved'/'invariants.bend','mutant-true-support-invariant',verdict=True,needle='ALL PROOFS CHECK')
run(proto/'approved'/'at.bend','approved-at-mutant',1,needle='Location: approved_at')
output=run(proto/'approved'/'PROOF.bend','approved-proof-mutant',1,needle='Location: Laws.current_fence_witness')
report={'slice':'current_fence_witness only; necessary valid-PRE helpers','sources':manifest,
 'proof_sources_sha256':{str(p.relative_to(HERE)):hashlib.sha256(p.read_bytes()).hexdigest() for p in HERE.rglob('*.bend')},
 'checks':checks,'support_proof_adjustment':'Mutant-only post_fresh proves bypass leaves Pstate fresh; approved PROOF and law unchanged.',
 'all_pass':all(x['pass'] for x in checks)}
(OUT/'approved-gate.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(checks,indent=2))
raise SystemExit(0 if report['all_pass'] else 1)
