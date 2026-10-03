#!/usr/bin/env python3
"""Bounded necessary-validity probes; no universal proof or Python reducer."""
from pathlib import Path
import subprocess,json,hashlib
HERE=Path(__file__).resolve().parent
BASE=HERE.parent
OUT=BASE/'evidence'
base='C.Pre{1n,1n,1n,1n,20n,1n},C.Post{1n,1n,1n,4n}'
histories=['[]',f'[{base}]',f'[{base},C.RoundClose{{5n}}]',
 '[C.Pre{1n,1n,2n,1n,3n,1n}]','[C.Pre{1n,1n,2n,1n,3n,1n},C.Release{2n}]',
 '[C.Pre{1n,1n,1n,1n,20n,1n},C.Pre{1n,1n,2n,1n,20n,1n}]',
 f'[{base},C.Restart{{2n,5n}}]',f'[{base},C.RoundClose{{5n}},C.Pre{{1n,1n,2n,6n,10n,6n}}]',
 '[C.Pre{2n,1n,2n,1n,9n,1n}]','[C.Pre{1n,2n,2n,1n,9n,1n}]',
 '[C.Pre{1n,1n,2n,0n,9n,0n}]','[C.Pre{1n,1n,2n,1n,9n,7n}]',
 f'[{base},C.Continue{{}},C.RoundClose{{5n}}]',
 '[C.Pre{1n,1n,2n,1n,3n,1n},C.Post{1n,1n,2n,3n}]']
rows=[]
for h in histories:
 for scope in (1,2):
  for life in (1,2):
   for tool in (1,2):
    for now in (0,1,2,3,4,6,9,10):
     state=f'C.run({h},C.Current{{}},C.initial())'
     expr=f'{{Bool.or(Nat.is_eq(C.count(C.post(C.Current{{}},{state},{scope}n,{life}n,{tool}n,{now}n)),C.count({state})),V.valid_pre({state},{scope}n,{life}n,{tool}n,{now}n)) == True{{}} : Bool}}'
     rows.append(expr)
exits=[]
for start in range(0,len(rows),40):
 path=OUT/f'probe-validity-{start//40:03}.bend'
 path.write_text('import Base\nimport ../core.bend as C\nimport ../approved/validity.bend as V\n'+'\n'.join(f'def at_{start+i}() -> {expr}:\n  {{==}}\n' for i,expr in enumerate(rows[start:start+40])))
 p=subprocess.run([str(BASE/'bend-check'),str(path),'--check-only'],capture_output=True,text=True)
 path.with_suffix('.log').write_text("\n".join(line.rstrip() for line in (p.stdout+p.stderr).splitlines())+"\n");exits.append(p.returncode)
 if p.returncode:print("\n".join(line.rstrip() for line in (p.stdout+p.stderr).splitlines())+"\n");break
report={'instances':len(rows),'histories':len(histories),'batch_exits':exits,'predicate_sha256':hashlib.sha256((HERE/'validity.bend').read_bytes()).hexdigest(),'method':'literal necessary-validity implication; no universal proof','all_pass':all(x==0 for x in exits) and len(exits)==(len(rows)+39)//40}
(HERE/'validity-falsification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2));raise SystemExit(0 if report['all_pass'] else 1)
