#!/usr/bin/env python3
"""Actual pending PRE/active/valid-closure literal controls before proof work."""
from pathlib import Path
import json,subprocess,hashlib
HERE=Path(__file__).resolve().parent;BASE=HERE.parent;OUT=BASE/'evidence'
rows=[]
for completed in range(1,9):
 prefix=[]
 for tool in range(1,completed+1):
  at=tool*3;prefix += [f'C.Pre{{1n,1n,{tool}n,{at}n,{at+20}n,{at}n}}',f'C.Post{{1n,1n,{tool}n,{at+1}n}}']
 start=completed*3+2;tool=completed+1
 for elapsed in (0,1,2,4):
  closed=start+elapsed
  for delay in (0,1,2,10,30):
   history='['+','.join(prefix+[f'C.Pre{{1n,1n,{tool}n,{start}n,{start+20}n,{start}n}}'])+']'
   state=f'C.run({history},C.Current{{}},C.initial())'
   rows.append((history,state,tool,closed,closed+delay))
exits=[]
for offset in range(0,len(rows),20):
 path=OUT/f'probe-closure-{offset//20:03}.bend';src='import Base\nimport ../core.bend as C\nimport ../approved-closure/spec.bend as D\n'
 for i,(h,s,t,c,p) in enumerate(rows[offset:offset+20]):
  n=offset+i
  premises=[f'C.active({s})',f'D.permit_active(C.get_permit({s}))',f'D.pending({t}n,{s})',f'Nat.is_ge({c}n,C.fence(C.get_permit({s})))',f'Nat.is_ge({c}n,D.pre_start({t}n,{s}))',f'Nat.is_ge({p}n,{c}n)']
  src+='\n'.join(f'def premise_{n}_{k}() -> {{{expr} == True{{}} : Bool}}:\n  {{==}}\n' for k,expr in enumerate(premises))
  src+=f'def at_{n}() -> {{D.outcome(C.post(C.Current{{}},C.close({s},{c}n),C.owner(C.get_permit({s})),C.lifetime(C.get_permit({s})),{t}n,{p}n)) == D.Outcome{{C.count({s}),C.round({s}),False{{}}}} : D.Outcome}}:\n  {{==}}\n'
 path.write_text(src);p=subprocess.run([str(BASE/'bend-check'),str(path),'--check-only'],capture_output=True,text=True);path.with_suffix('.log').write_text('\n'.join(l.rstrip() for l in (p.stdout+p.stderr).splitlines())+'\n');exits.append(p.returncode)
 if p.returncode:print(p.stdout+p.stderr);break
report={'law_sha256':hashlib.sha256((HERE/'LAWS.bend').read_bytes()).hexdigest(),'actual_valid_pending_PRE_cases':len(rows),'explicit_premises_per_case':6,'equal_clock_POST_cases':32,'batch_exits':exits,'all_pass':len(exits)==8 and all(x==0 for x in exits),'method':'Bend computes valid pending PRE premises and exact closure outcome; no universal proof'}
(HERE/'falsification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));raise SystemExit(0 if report['all_pass'] else 1)
