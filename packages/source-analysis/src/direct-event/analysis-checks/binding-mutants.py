from pathlib import Path
import json, shutil, subprocess, tempfile
root = Path(__file__).resolve().parents[2]
owner = root / 'packages/agent-flow-bend/binding-policy'
source = (owner / 'core.bend').read_text()
mutations = [
 ('ignore_uncertain_pattern', 'case _ _ True{}: True{}', 'case _ _ True{}: False{}'),
 ('ignore_known_callable', 'case True{} True{} _: True{}', 'case True{} True{} _: False{}'),
 ('remove_early_mark', 'case True{} _ _ _ _: Mark{}', 'case True{} _ _ _ _: NoAction{}'),
 ('deduplicate_marks', 'case False{} True{} True{} True{} False{}: MarkMark{}', 'case False{} True{} True{} True{} False{}: Mark{}'),
 ('drop_mutation_before_bind', 'case False{} True{} True{} True{} True{}: MarkBind{}', 'case False{} True{} True{} True{} True{}: Bind{}'),
 ('bind_non_identifier', 'case False{} _ _ True{} False{}: Mark{}', 'case False{} _ _ True{} False{}: Bind{}'),
 ('lexical_initial_arguments', 'case True{}: False{}', 'case True{}: True{}')
]
rows = []
with tempfile.TemporaryDirectory(prefix='hapsland-binding-mutants-') as temporary:
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
record = {'passed':True,'mutants':rows,'deadlineSecondsPerBend':5,'scope':'unchanged approved laws and full universal proofs reject seven behavior mutations; no native host claim'}
(root/'evidence/bend-strangler/binding-mutation-results.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'passed':True,'mutants':len(rows)}))
