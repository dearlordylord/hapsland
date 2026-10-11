from pathlib import Path
import tempfile,subprocess,json,shutil
root=Path(__file__).resolve().parents[2];owner=root/'packages/agent-flow-bend/update-notice-policy';core=(owner/'core.bend').read_text()
mutants=[('hello-refused','case Hello{}: False{}','case Hello{}: True{}','incompatible_exact'),('missing-contract-refused','      False{}\n    )','      True{}\n    )','incompatible_exact'),('explicit-false-ignored','case Explicit{value}: value','case Explicit{value}: True{}','opportunity_exact'),('pi-register-eligible','case RegisterEdit{}: Bool.pick(Bool, recipient_pi, False{}, True{})','case RegisterEdit{}: Bool.pick(Bool, recipient_pi, True{}, True{})','opportunity_exact'),('duplicate-granted','already_warned, False{}, Bool.pick','already_warned, True{}, Bool.pick','grant_exact'),('capacity-ignored','capacity_full, False{}, True{})','capacity_full, True{}, True{})','grant_exact')]
records=[]
for name,before,after,law in mutants:
 assert core.count(before)==1,(name,core.count(before))
 with tempfile.TemporaryDirectory(prefix='hapsland-notice-mutant-') as temp:
  temp=Path(temp)
  for source in ['LAWS.bend','PROOF.bend']:shutil.copyfile(owner/source,temp/source)
  (temp/'core.bend').write_text(core.replace(before,after))
  result=subprocess.run(['bend',str(temp/'PROOF.bend'),'--verdict'],capture_output=True,text=True,timeout=5)
  output=result.stdout+result.stderr
  record={'name':name,'law':law,'exitCode':result.returncode,'detected':result.returncode==1 and 'SOME PROOFS FAIL' in output and 'Location: Laws.'+law in output,'output':output}
  records.append(record);print(json.dumps({k:v for k,v in record.items() if k!='output'}),flush=True)
  assert record['detected'],record
(root/'evidence/bend-strangler/update-notice-mutants.json').write_text(json.dumps({'scope':'six changed core decisions; unchanged approved laws and universal proofs; each rejection in its own law section; no production/native-host mutation claim','passed':True,'records':records},indent=2)+'\n')
