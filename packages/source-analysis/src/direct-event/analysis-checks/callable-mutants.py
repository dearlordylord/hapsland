from pathlib import Path
import tempfile,subprocess,json,shutil
root=Path(__file__).resolve().parents[2];owner=root/'packages/agent-flow-bend/callable-policy';core=(owner/'core.bend').read_text()
mutants=[
 ('type-only-import-accepted','case NamedEffect{} False{}: True{}','case NamedEffect{} _: True{}','runtime_import_exact'),
 ('namespace-import-refused','case EffectNamespace{} False{}: True{}','case EffectNamespace{} False{}: False{}','runtime_import_exact'),
 ('invoked-untraced-accepted','case False{} True{} True{} FnUntraced{} False{} _: True{}','case False{} True{} True{} FnUntraced{} _ _: True{}','wrapper_exact'),
 ('dynamic-label-accepted','case False{} True{} True{} Fn{} True{} True{}: True{}','case False{} True{} True{} Fn{} True{} _: True{}','wrapper_exact'),
 ('other-body-accepted','case OtherBody{}: False{}','case OtherBody{}: True{}','inline_body_exact'),
 ('direct-arrow-rejected','case DirectArrow{} _ _ _ _: Self{}','case DirectArrow{} _ _ _ _: Reject{}','callable_value_exact'),
 ('generic-wrapper-accepted','case WrapperCall{} False{} True{} True{} True{}: InlineArgument{}','case WrapperCall{} _ True{} True{} True{}: InlineArgument{}','callable_value_exact'),
 ('multiple-declarators-accepted','case True{} True{} True{} True{}: True{}','case True{} _ True{} True{}: True{}','const_callable_exact')]
records=[]
for name,before,after,law in mutants:
 assert core.count(before)==1
 with tempfile.TemporaryDirectory(prefix='hapsland-callable-mutant-') as tmp:
  p=Path(tmp)
  for f in ['LAWS.bend','PROOF.bend']:shutil.copyfile(owner/f,p/f)
  (p/'core.bend').write_text(core.replace(before,after))
  result=subprocess.run(['bend',str(p/'PROOF.bend'),'--verdict'],capture_output=True,text=True,timeout=5);output=result.stdout+result.stderr
  record={'name':name,'law':law,'exitCode':result.returncode,'detected':result.returncode==1 and 'SOME PROOFS FAIL' in output and 'Location: Laws.'+law in output,'output':output};records.append(record);assert record['detected'],record
(root/'evidence/bend-strangler/callable-mutants.json').write_text(json.dumps({'passed':True,'count':len(records),'scope':'pure mutations against unchanged approved laws and universal proofs; no native mutation claim','records':records},indent=2)+'\n');print(json.dumps({'passed':True,'mutantsDetected':len(records)}))
