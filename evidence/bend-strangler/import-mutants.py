from pathlib import Path
import json, shutil, subprocess, tempfile
root = Path(__file__).resolve().parents[2]
owner = root / 'packages/agent-flow-bend/import-policy'
source = (owner / 'core.bend').read_text()
mutations = [
 ('missing_module','case True{} True{}: True{}','case _ True{}: True{}'),
 ('missing_clause','case True{} True{}: True{}','case True{} _: True{}'),
 ('missing_namespace_name','case True{} False{}: True{}','case _ False{}: True{}'),
 ('namespace_collision','case True{} False{}: True{}','case True{} _: True{}'),
 ('missing_imported_name','case True{} True{} False{}: True{}','case _ True{} False{}: True{}'),
 ('missing_local_name','case True{} True{} False{}: True{}','case True{} _ False{}: True{}'),
 ('specifier_collision','case True{} True{} False{}: True{}','case True{} True{} _: True{}'),
 ('type_only_false_positive','case False{} False{}: False{}','case False{} False{}: True{}'),
 ('drop_type_only','case _ _: True{}','case _ _: False{}')
]
rows = []
with tempfile.TemporaryDirectory(prefix='hapsland-import-mutants-') as temporary:
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
record = {'passed':True,'mutants':rows,'deadlineSecondsPerBend':5,'scope':'unchanged approved laws and full universal proofs reject nine behavior mutations; no native host claim'}
(root/'evidence/bend-strangler/import-mutation-results.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'passed':True,'mutants':len(rows)}))
