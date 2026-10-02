#!/usr/bin/env python3
from pathlib import Path
import subprocess,json
HERE=Path(__file__).resolve().parent
OUT=HERE/'evidence'
checks=[]
def check(path,name,expected=0,needle=None,execute=False):
    p=subprocess.run([str(HERE/'bend-check'),str(path)]+([] if execute else ['--check-only']),capture_output=True,text=True)
    output="\n".join(line.rstrip() for line in (p.stdout+p.stderr).splitlines())+"\n"
    (OUT/(name+'.log')).write_text(output)
    ok=p.returncode==expected and (needle is None or needle in output)
    checks.append({'name':name,'expected_exit':expected,'observed_exit':p.returncode,'pass':ok})
check(HERE/'core.bend','core')
check(HERE/'spec.bend','spec')
check(HERE/'LAWS.bend','open-laws',1,'TODOs')
check(HERE/'traces.bend','traces',execute=True)
check(OUT/'false-current-coverage.bend','false-current-coverage',1,'expected : 0n')
# Positive baseline for the planted exact-admission control.
source=(OUT/'planted-control.bend').read_text().replace('../mutant-reject-all.bend','../core.bend')
(OUT/'baseline-control.bend').write_text(source)
check(OUT/'baseline-control.bend','baseline-control')
# Targeted retained prefix boundaries, generated independently of C.retain decisions.
s='import Base\nimport ../core.bend as C\n'
for n in (0,1,999,1000,1001):
    ids='['+','.join(f'{i}n' for i in range(n,0,-1))+']'
    s+=f'def cap_{n}() -> {{List.length(&2,Nat,C.retain(1000n,{ids})) == {min(n,1000)}n : Nat}}:\n  {{==}}\n'
# Small sequence probe excludes latest-only retained history.
s+='def prefix_two() -> {C.retain(1000n,[2n,1n]) == [2n,1n] : List<&2,Nat>}:\n  {==}\n'
(OUT/'retention-boundaries.bend').write_text(s)
check(OUT/'retention-boundaries.bend','retention-boundaries')
(OUT/'checks.json').write_text(json.dumps(checks,indent=2)+'\n')
print(json.dumps(checks,indent=2))
raise SystemExit(0 if all(x['pass'] for x in checks) else 1)
