#!/usr/bin/env python3
"""Literal substitution into unapproved decision candidates; no reducer in Python."""
from pathlib import Path
import json,re,subprocess,hashlib
HERE=Path(__file__).resolve().parent;BASE=HERE.parent;OUT=BASE/'evidence'
base='C.Pre{1n,1n,1n,1n,20n,1n},C.Post{1n,1n,1n,4n}'
histories=['[]',f'[{base}]',f'[{base},C.RoundClose{{5n}}]',
 f'[{base},C.RoundClose{{5n}},C.Pre{{1n,1n,2n,6n,10n,6n}}]',
 f'[{base},C.Restart{{2n,5n}}]',
 '[C.Pre{1n,1n,2n,1n,3n,1n}]',
 '[C.NativeStart{2n,1n},C.Post{1n,1n,2n,3n},C.NativeComplete{2n,2n}]',
 f'[{base},C.NativeStart{{2n,2n}},C.RoundClose{{5n}},C.NativeComplete{{2n,3n}},C.Post{{1n,1n,2n,8n}}]']
text=(HERE/'LAWS.bend').read_text();rows=[];counts={}
for m in re.finditer(r'^law (\w+):\n(.*?)(?=^law |\Z)',text,re.M|re.S):
 body='\n'.join(x for x in m[2].splitlines() if not x.startswith('#')).strip();binders=re.findall(r'for \+?(\w+):[^\n]+',body);expr=re.sub(r'^\s*for [^\n]+\n','',body,flags=re.M).strip()
 for h in histories:
  for j in range(1 if m[1]=='receipt_native_erasure' else 12):
   for native in ((0,2,8) if m[1]=='current_native_fresh_under_host_order' else (0,)):
    values={'history':h,'partition':f'{1+j%2}n','live':f'{1+j%3}n','tool':f'{1+j%3}n','now':f'{j}n','native_start':f'{native}n'}
    rows.append((m[1],re.sub(r'\b('+'|'.join(binders)+r')\b',lambda x:values[x[0]],expr)));counts[m[1]]=counts.get(m[1],0)+1
exits=[]
for start in range(0,len(rows),40):
 path=OUT/f'probe-decision-{start//40:03}.bend';path.write_text('import Base\nimport ../core.bend as C\nimport ../spec.bend as S\nimport ../decision/spec.bend as D\n'+'\n'.join(f'def at_{start+i}() -> {expr}:\n  {{==}}\n' for i,(_,expr) in enumerate(rows[start:start+40])))
 p=subprocess.run([str(BASE/'bend-check'),str(path),'--check-only'],capture_output=True,text=True);path.with_suffix('.log').write_text('\n'.join(x.rstrip() for x in (p.stdout+p.stderr).splitlines())+'\n');exits.append(p.returncode)
 if p.returncode:print(p.stdout+p.stderr);break
report={'method':'literal substitution into unapproved candidate statements; no universal proof','law_sha256':hashlib.sha256(text.encode()).hexdigest(),'histories':len(histories),'instances':len(rows),'laws':counts,'batch_exits':exits,'all_pass':all(x==0 for x in exits) and len(exits)==(len(rows)+39)//40};(HERE/'falsification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));raise SystemExit(0 if report['all_pass'] else 1)
