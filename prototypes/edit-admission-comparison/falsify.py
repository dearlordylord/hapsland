#!/usr/bin/env python3
"""Literal instances of draft LAWS; Python generates syntax, never admission decisions."""
from pathlib import Path
import re, subprocess, json, hashlib
HERE=Path(__file__).resolve().parent
OUT=HERE/'evidence'
OUT.mkdir(exist_ok=True)
# External histories include monitor-only native chronology and explicit accepted closure.
base='C.Pre{1n,1n,1n,1n,20n,1n},C.NativeStart{1n,2n},C.NativeComplete{1n,3n},C.Post{1n,1n,1n,4n}'
histories=['[]',f'[{base}]',f'[{base},C.RoundClose{{5n}}]']
for t in range(1,8):
    histories += [f'[C.Pre{{1n,1n,2n,{t}n,9n,{t}n}}]',
      f'[{base},C.RoundClose{{5n}},C.Pre{{1n,1n,2n,{t}n,15n,{t}n}}]',
      f'[{base},C.RoundClose{{5n}},C.Restart{{2n,6n}},C.Pre{{1n,2n,2n,{t}n,15n,{t}n}}]']
histories += ['[C.Pre{1n,1n,2n,1n,3n,1n},C.Release{2n}]',
 '[C.Pre{1n,1n,2n,1n,3n,1n},C.Post{1n,1n,2n,4n}]',
 '[C.Pre{1n,1n,1n,1n,20n,1n},C.Pre{1n,1n,2n,1n,20n,1n},C.Pre{1n,1n,3n,1n,20n,1n}]',
 f'[{base},C.Continue{{}},C.RoundClose{{5n}},C.Post{{1n,1n,2n,6n}}]',f'[{base},C.Continue{{}},C.Restart{{2n,5n}}]']
laws=[]
text=(HERE/'LAWS.bend').read_text()
for m in re.finditer(r'^law (\w+):\n(.*?)(?=^law |\Z)',text,re.M|re.S):
    body='\n'.join(x for x in m[2].splitlines() if not x.startswith('#')).strip()
    binders=re.findall(r'for \+?(\w+):[^\n]+',body)
    expr=re.sub(r'^\s*for [^\n]+\n','',body,flags=re.M).strip()
    laws.append((m[1],binders,expr))
instances=[]
for name,binders,expr in laws:
  for hi,h in enumerate(histories):
    for model in ('C.Current{}',):
      for j in range(12):
        # Around premises: retained/new tools, exact/expired deadlines, correct/wrong scopes/lifetimes.
        vals={'history':h,'model':model,'state':f'C.run({h},{model},C.initial())',
              'partition':f'{1 if j%4 else 2}n','live':f'{1+j%3}n',
              'tool':f'{1+j%3}n','now':f'{j}n','start':f'{j%7}n',
              'deadline':f'{j+3}n','at':f'{j}n',
              'event':(['C.Continue{}',f'C.RoundClose{{{j}n}}',f'C.Restart{{2n,{j}n}}',f'C.Pre{{1n,1n,2n,1n,20n,{j}n}}','C.Release{2n}',f'C.NativeStart{{2n,{j}n}}',f'C.NativeComplete{{2n,{j}n}}',f'C.Post{{1n,1n,2n,{j}n}}'][j%8])}
        literal=re.sub(r'\b('+'|'.join(binders)+r')\b',lambda x:vals[x[0]],expr)
        instances.append((name,literal))
# Each batch below is separately subject to the skill's five-second checker limit.
report={'compiler':subprocess.check_output(['bend','version'],text=True).strip(),
 'method':'literal substitution into draft law statements; no universal proofs',
 'laws_sha256':hashlib.sha256(text.encode()).hexdigest(),'instances':len(instances),'laws':{},'batches':[]}
for start in range(0,len(instances),40):
  rows=instances[start:start+40]
  src='import Base\nimport ../core.bend as C\nimport ../spec.bend as S\n'
  src+='\n'.join(f'def probe_{start+i}() -> {expr}:\n  {{==}}\n' for i,(name,expr) in enumerate(rows))
  path=OUT/f'probe-{start//40:03}.bend';path.write_text(src)
  p=subprocess.run([str(HERE/'bend-check'),str(path),'--check-only'],text=True,capture_output=True)
  (OUT/f'probe-{start//40:03}.log').write_text("\n".join(line.rstrip() for line in (p.stdout+p.stderr).splitlines())+"\n")
  report['batches'].append({'batch':start//40,'exit':p.returncode})
  for name,_ in rows:report['laws'][name]=report['laws'].get(name,0)+1
  if p.returncode: print("\n".join(line.rstrip() for line in (p.stdout+p.stderr).splitlines())+"\n");break
# Compiling reject-all Current POST control; valid PRE is retained.
mutant=(HERE/'core.bend').read_text()
old='current_post(expired, partition, live, tool, now, seen(tool, completed(expired)))'
assert mutant.count(old)==1
mutant=mutant.replace(old,'expired')
(HERE/'mutant-reject-all.bend').write_text(mutant)
p=subprocess.run([str(HERE/'bend-check'),str(HERE/'mutant-reject-all.bend'),'--check-only'],capture_output=True,text=True)
report['mutant_compile_exit']=p.returncode
control='import Base\nimport ../mutant-reject-all.bend as C\n'
control+='def planted_control() -> {C.count(C.post(C.Current{},C.pre(C.Current{},C.initial(),1n,1n,9n,1n,10n,1n),1n,1n,9n,2n)) == 1n : Nat}:\n  {==}\n'
(OUT/'planted-control.bend').write_text(control)
p=subprocess.run([str(HERE/'bend-check'),str(OUT/'planted-control.bend'),'--check-only'],capture_output=True,text=True)
(OUT/'planted-control.log').write_text("\n".join(line.rstrip() for line in (p.stdout+p.stderr).splitlines())+"\n");report['planted_control_exit']=p.returncode
(OUT/'falsification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='batches'}|{'batches_checked':len(report['batches'])},indent=2))
raise SystemExit(0 if all(b['exit']==0 for b in report['batches']) and report['mutant_compile_exit']==0 and report['planted_control_exit']==1 else 1)
