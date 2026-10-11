from pathlib import Path
import tempfile, subprocess, json, shutil
root = Path(__file__).resolve().parents[2]
owner = root / 'packages/agent-flow-bend/resident-request-policy'
core = (owner / 'core.bend').read_text()
mutants = [
 ('hello-swept', 'case _: False{}', 'case _: True{}', 'sweep_exact'),
 ('admit-not-swept', 'case Admit{}: True{}', 'case Admit{}: False{}', 'sweep_exact'),
 ('admit-observation-ignored', 'case Admit{}: Bool.pick(Bool, direct_opencode, True{}, observation_opencode)', 'case Admit{}: Bool.pick(Bool, direct_opencode, True{}, False{})', 'unsupported_exact'),
 ('direct-recipient-ignored', 'case _: direct_opencode', 'case _: False{}', 'unsupported_exact'),
 ('hello-snapshot-skipped', 'case Hello{}: True{}', 'case Hello{}: False{}', 'snapshot_exact'),
 ('mismatch-snapshot-read', 'case _: lifetime_matched', 'case _: True{}', 'snapshot_exact'),
 ('foreign-lifetime-continued', 'case True{} True{}: RequestContinue{}', 'case True{} True{}: RequestContinue{}\n    case False{} True{}: RequestContinue{}', 'lifetime_exact'),
 ('edit-refusal-shared', 'Bool.pick(LifetimePlan, edit, RequestEditLost{}, RequestObsolete{})', 'Bool.pick(LifetimePlan, edit, RequestObsolete{}, RequestObsolete{})', 'lifetime_exact'),
 ('hello-not-ready', 'Bool.pick(LifetimePlan, active, RequestReady{}, RequestObsolete{})', 'Bool.pick(LifetimePlan, active, RequestEditLost{}, RequestObsolete{})', 'lifetime_exact')
]
records = []
for name, before, after, law in mutants:
 assert core.count(before) == 1, (name, core.count(before))
 with tempfile.TemporaryDirectory(prefix='hapsland-request-mutant-') as temporary:
  temporary = Path(temporary)
  for source in ['LAWS.bend', 'PROOF.bend']: shutil.copyfile(owner / source, temporary / source)
  (temporary / 'core.bend').write_text(core.replace(before, after))
  result = subprocess.run(['bend', str(temporary / 'PROOF.bend'), '--verdict'], capture_output=True, text=True, timeout=5)
  output = result.stdout + result.stderr
  record = {'name': name, 'law': law, 'exitCode': result.returncode, 'detected': result.returncode == 1 and 'SOME PROOFS FAIL' in output and 'Location: Laws.' + law in output, 'output': output}
  records.append(record)
  print(json.dumps({k: v for k, v in record.items() if k != 'output'}), flush=True)
  assert record['detected'], record
(root / 'evidence/bend-strangler/resident-request-mutants.json').write_text(json.dumps({'scope': 'nine pure decision mutations against unchanged approved laws and universal proofs; no native mutation claim', 'passed': True, 'records': records}, indent=2) + '\n')
