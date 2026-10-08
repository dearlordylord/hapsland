import pathlib, subprocess, json, time, statistics, hashlib, datetime
roots={'upstream':pathlib.Path('/workspace/typescript/hapsland-bend-baseline-master-56d1f390'),'qualifiedControl':pathlib.Path('/workspace/typescript/hapsland-bend-control-04208293'),'directCandidate':pathlib.Path('/workspace/typescript/hapsland-bend-selection-ui')}
bun='/home/node/.local/share/mise/installs/bun/1.3.14/bin/bun'
runner=(roots['directCandidate']/'evidence/bend-strangler/direct-login-model-cold-runner.mjs').read_bytes()
sha=lambda b:hashlib.sha256(b).hexdigest()
created=[];bins={};samples={s:{k:[] for k in roots} for s in ['available','locked']}
declaration={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'kind':'pre-execution declaration','purpose':'locate additional cost between pure model initialization and first transition sequence; Effect and storage owners excluded; raw failed cold guard unchanged','rounds':41,'affinity':'CPU11 nonexclusive','rotations':'three lanes, two scenarios; alternating reversal','metrics':['initializationMilliseconds','initializationCpuSeconds','journeyMilliseconds','journeyCpuSeconds'],'runnerSha256':sha(runner),'scope':'diagnostic only; no normalization or acceptance','deadlineSeconds':120}
pathlib.Path('/tmp/hapsland-direct-current-model-cold-declaration.json').write_text(json.dumps(declaration,indent=2)+'\n')
try:
 for lane,root in roots.items():
  entry=root/'.test-runs/direct-current-model-cold.mjs';binary=root/'.test-runs/direct-current-model-cold';entry.write_bytes(runner);created.extend([entry,binary]);bins[lane]=binary
  subprocess.run([bun,'build',str(entry),'--target=bun','--format=esm','--minify','--compile','--bytecode','--no-compile-autoload-dotenv','--no-compile-autoload-bunfig','--no-compile-autoload-tsconfig','--no-compile-autoload-package-json','--outfile',str(binary)],cwd=root,capture_output=True,timeout=30,check=True)
 before={k:sha(p.read_bytes()) for k,p in bins.items()};deadline=time.monotonic()+120;expected={}
 for i in range(41):
  lanes=list(roots);lanes=lanes[i%3:]+lanes[:i%3];scenarios=['available','locked']
  if i%2:lanes.reverse();scenarios.reverse()
  for s in scenarios:
   for lane in lanes:
    assert time.monotonic()<deadline
    r=subprocess.run(['taskset','-c','11',str(bins[lane]),s],cwd=roots[lane],capture_output=True,timeout=5,check=True);assert not r.stderr
    data=json.loads(r.stdout);timing=data.pop('timing');assert data==expected.setdefault(s,data);samples[s][lane].append(timing)
 assert before=={k:sha(p.read_bytes()) for k,p in bins.items()}
 summary={s:{lane:{key:statistics.median(x[key] for x in xs) for key in declaration['metrics']} for lane,xs in values.items()} for s,values in samples.items()}
 result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'declaration':declaration,'artifactsSha256':before,'summary':summary,'samples':samples,'acceptance':False}
 pathlib.Path('/tmp/hapsland-direct-current-model-cold-results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(summary))
finally:
 for p in created:p.unlink(missing_ok=True)
