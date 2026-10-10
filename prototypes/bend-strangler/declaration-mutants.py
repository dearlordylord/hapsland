from pathlib import Path
import json, shutil, subprocess, tempfile
root = Path(__file__).resolve().parents[2]
owner = root / 'packages/agent-flow-bend/declaration-policy'
source = (owner / 'core.bend').read_text()
mutations = [
 ('missing_function_body','case True{} True{} False{} False{} False{}: True{}','case True{} _ False{} False{} False{}: True{}'),
 ('function_collision','case True{} True{} False{} False{} False{}: True{}','case True{} True{} _ False{} False{}: True{}'),
 ('arrow_import_collision','case False{} False{} False{}: True{}','case False{} _ False{}: True{}'),
 ('missing_type_identifier','case True{} False{} False{}: True{}','case _ False{} False{}: True{}'),
 ('type_import_collision','case True{} False{} False{}: True{}','case True{} False{} _: True{}'),
 ('interface_priority','case True{} _: Interface{}','case True{} _: TypeAlias{}'),
 ('drop_limit_failure','case False{} True{}: DeclarationLimit{}','case False{} True{}: Unsupported{}'),
 ('reject_success','case True{} _: Complete{}','case True{} _: Unsupported{}')
]
rows = []
with tempfile.TemporaryDirectory(prefix='hapsland-declaration-mutants-') as temporary:
 directory = Path(temporary)
 for name in ['LAWS.bend','PROOF.bend']:
  shutil.copyfile(owner/name, directory/name)
 for name, before, after in mutations:
  assert source.count(before) == 1, name
  (directory/'core.bend').write_text(source.replace(before, after))
  result = subprocess.run(['bend',str(directory/'PROOF.bend'),'--verdict'],capture_output=True,text=True,timeout=5)
  output = result.stdout + result.stderr
  assert 'SOME PROOFS FAIL' in output and 'ALL PROOFS CHECK' not in output, output
  assert 'expected' in output.lower(), output
  rows.append({'name':name,'caught':True,'exitCode':result.returncode,'diagnostic':output})
record = {'passed':True,'mutants':rows,'deadlineSecondsPerBend':5,'scope':'unchanged approved laws and full universal proofs reject eight behavior mutations; no native host claim'}
(root/'evidence/bend-strangler/declaration-mutation-results.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'passed':True,'mutants':len(rows)}))
