import pathlib,subprocess,tempfile,shutil,hashlib,json,datetime,time
root=pathlib.Path(__file__).resolve().parents[2]; directory=root/'packages/agent-flow-bend/selection-ui-policy'
files={n:(directory/n).read_bytes() for n in ['core.bend','LAWS.bend','PROOF.bend']};core=files['core.bend'].decode(); results=[];stop=time.monotonic()+60
mutants=[('back submits cancel','    Back{},','    Cancel{},'),('exit submits selection','exit_row, Cancel{}','exit_row, Select{}'),('nonempty warns','nonempty, Select{}, Warn{}','nonempty, Warn{}, Warn{}'),('select all never clears','all_selected, ClearAll{}, ChooseAll{}','all_selected, ChooseAll{}, ChooseAll{}'),('select all never chooses','all_selected, ClearAll{}, ChooseAll{}','all_selected, ClearAll{}, ClearAll{}'),('absent choice adds','      Hold{}\n','      AddChoice{}\n'),('selected choice adds','choice_selected, RemoveChoice{}, AddChoice{}','choice_selected, AddChoice{}, AddChoice{}'),('tab moves backwards','case Tab{}: Next{}','case Tab{}: Previous{}'),('enter holds','case Enter{}: submit(back_row, exit_row, nonempty)','case Enter{}: Hold{}'),('other warns','case Other{}: Hold{}','case Other{}: Warn{}'),('escape reverses back','back, Back{}, Cancel{}','back, Cancel{}, Back{}'),('up moves forward','case Up{}: Previous{}','case Up{}: Next{}')]
with tempfile.TemporaryDirectory(prefix='.mutants-',dir=directory) as temporary:
 temp=pathlib.Path(temporary)
 for name,before,after in mutants:
  assert before in core; assert time.monotonic()<stop
  (temp/'core.bend').write_text(core.replace(before,after,1))
  for n in ['LAWS.bend','PROOF.bend']:(temp/n).write_bytes(files[n])
  checked=subprocess.run(['bend',str(temp/'core.bend')],capture_output=True,text=True,timeout=min(5,stop-time.monotonic()))
  verdict=subprocess.run(['bend',str(temp/'PROOF.bend'),'--verdict'],capture_output=True,text=True,timeout=min(5,stop-time.monotonic()))
  results.append({'mutant':name,'coreExitCode':checked.returncode,'proofExitCode':verdict.returncode,'wellFormed':checked.returncode==0,'detected':checked.returncode==0 and verdict.returncode==1,'diagnostic':(verdict.stdout+verdict.stderr)[-1400:]})
assert all((directory/n).read_bytes()==data for n,data in files.items())
r={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'toolchain':'Bend 2.0.36 / Lean 4.34.0','passed':all(v['detected'] for v in results),'sourceFrozen':True,'sha256':{n:hashlib.sha256(data).hexdigest() for n,data in files.items()},'scope':'well-formed core mutants rejected by unchanged approved-law universal kernel proof; no native or performance acceptance','results':results}
(root/'evidence/bend-strangler/selection-ui-mutants.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'passed':r['passed'],'mutants':len(results)}));raise SystemExit(0 if r['passed'] else 1)
