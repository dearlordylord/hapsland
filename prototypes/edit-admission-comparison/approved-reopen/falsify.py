#!/usr/bin/env python3
"""Positive valid-created-PRE instances, computed in Bend before universal proof."""
from pathlib import Path
import json,re,subprocess,hashlib
HERE=Path(__file__).resolve().parent;BASE=HERE.parent;OUT=BASE/'evidence'
text=(HERE/'LAWS.bend').read_text();body=text[text.index('law fresh_registered_post_reopens:'):]
expr=re.sub(r'^\s*(law [^\n]+|for [^\n]+)\n','',body,flags=re.M).strip();premises=re.findall(r'^\s*for (\w+): (\{[^\n]+)',body,re.M)
rows=[]
for rounds in range(1,9):
 events=[]
 for tool in range(1,rounds+1):
  start=tool*5;events += [f'C.Pre{{1n,1n,{tool}n,{start}n,{start+20}n,{start}n}}',f'C.Post{{1n,1n,{tool}n,{start+1}n}}',f'C.RoundClose{{{start+2}n}}']
 history='['+','.join(events)+']';state=f'C.run({history},C.Current{{}},C.initial())';start=rounds*5+3;tool=rounds+1;deadline=start+8
 for issueoffset in (0,1,3,4):
  for postoffset in (0,1,2,3):
   issue=start+issueoffset;post=issue+postoffset
   registered=f'C.pre(C.Current{{}},{state},1n,1n,{tool}n,{start}n,{deadline}n,{issue}n)'
   rows.append({'history':history,'state':state,'registered':registered,'tool':f'{tool}n','start':f'{start}n','deadline':f'{deadline}n','issued_at':f'{issue}n','post_at':f'{post}n'})
exits=[]
for offset in range(0,len(rows),16):
 src='import Base\nimport ../core.bend as C\nimport ../approved-reopen/spec.bend as D\nimport ../approved-closure/spec.bend as O\n'
 for i,values in enumerate(rows[offset:offset+16]):
  def inst(s):return re.sub(r'\b('+'|'.join(values)+r')\b',lambda m:values[m[0]],s)
  for name,premise in premises:src+=f'def premise_{offset+i}_{name}() -> {inst(premise)}:\n  {{==}}\n'
  src+=f'def at_{offset+i}() -> {inst(expr)}:\n  {{==}}\n'
 path=OUT/f'probe-reopen-{offset//16:03}.bend';path.write_text(src);p=subprocess.run([str(BASE/'bend-check'),str(path),'--check-only'],capture_output=True,text=True);path.with_suffix('.log').write_text('\n'.join(x.rstrip() for x in (p.stdout+p.stderr).splitlines())+'\n');exits.append(p.returncode)
 if p.returncode:print(p.stdout+p.stderr);break
report={'law_sha256':hashlib.sha256(text.encode()).hexdigest(),'valid_created_PRE_instances':len(rows),'prior_completed_rounds':'1..8','explicit_premises_per_instance':len(premises),'equal_start_issue_post_cases':8,'batch_exits':exits,'all_pass':len(exits)==8 and all(x==0 for x in exits),'method':'Exact approved equation and each independent premise instantiated; actualPRE and registry facts computed by Bend'}
(HERE/'falsification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));raise SystemExit(0 if report['all_pass'] else 1)
