from pathlib import Path
import tempfile,subprocess,json,shutil
root=Path(__file__).resolve().parents[2];owner=root/'packages/agent-flow-bend/reference-policy';core=(owner/'core.bend').read_text()
mutants=[
 ('uncertain-call-accepted','case True{} True{} True{} False{} False{}: NamedFunction{}','case True{} True{} True{} _ False{}: NamedFunction{}','call_reference_exact'),
 ('missing-callee-unsupported','case _ False{} _ _ _: Ignore{}','case _ False{} _ _ _: Unsupported{}','call_reference_exact'),
 ('missing-parent-recorded','case _ False{} _ _: True{}','case _ False{} _ _: False{}','ignored_value_exact'),
 ('local-value-recorded','case True{} _ _: Ignore{}','case True{} _ _: Unsupported{}','value_reference_exact'),
 ('bound-intrinsic-refused','case True{} False{}: False{}','case True{} _: False{}','declared_type_exact'),
 ('bound-readonly-intrinsic','case True{} False{} True{} True{} True{}: True{}','case True{} _ True{} True{} True{}: True{}','readonly_intrinsic_exact'),
 ('unsupported-type-ignored','case True{} _ _ _ _ _ _: Unsupported{}','case True{} _ _ _ _ _ _: Ignore{}','type_reference_exact'),
 ('own-type-recorded','case False{} True{} False{} True{} False{} False{} True{}: NamedType{}','case False{} True{} _ True{} False{} False{} True{}: NamedType{}','type_reference_exact')]

records=[]
for name,before,after,law in mutants:
 assert core.count(before)==1
 with tempfile.TemporaryDirectory(prefix='hapsland-reference-mutant-') as tmp:
  p=Path(tmp)
  for f in ['LAWS.bend','PROOF.bend']:shutil.copyfile(owner/f,p/f)
  (p/'core.bend').write_text(core.replace(before,after))
  result=subprocess.run(['bend',str(p/'PROOF.bend'),'--verdict'],capture_output=True,text=True,timeout=5);output=result.stdout+result.stderr
  record={'name':name,'law':law,'exitCode':result.returncode,'detected':result.returncode==1 and 'SOME PROOFS FAIL' in output and 'Location: Laws.'+law in output,'output':output};records.append(record);assert record['detected'],record
(root/'evidence/bend-strangler/reference-mutants.json').write_text(json.dumps({'passed':True,'count':len(records),'scope':'pure mutations against unchanged approved laws and universal proofs; no native mutation claim','records':records},indent=2)+'\n');print(json.dumps({'passed':True,'mutantsDetected':len(records)}))
