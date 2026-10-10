import pathlib,subprocess,json,time,resource,statistics,hashlib,datetime
roots={'upstream':pathlib.Path('/workspace/typescript/hapsland-bend-baseline-master-56d1f390'),'control':pathlib.Path('/workspace/typescript/hapsland-bend-control-04208293'),'candidate':pathlib.Path('/workspace/typescript/hapsland-bend-selection-ui')}
bun='/home/node/.local/share/mise/installs/bun/1.3.14/bin/bun';entry=pathlib.Path('/tmp/hapsland-placement-entry.mjs');origin=pathlib.Path('/tmp/hapsland-placement-origin');entry.write_text('console.log("empty-process-control")\n');created=[entry,origin];bins={};samples=[]
declaration={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'kind':'pre-execution declaration','rounds':21,'scope':'identical empty binary crossed through three physical sites and three working directories; diagnostics only, no guard subtraction/normalization','affinity':'CPU11 nonexclusive','order':'all nine cells; rotate and reverse every round','metrics':['wall','user CPU','system CPU','minor/major faults','voluntary/involuntary context switches'],'deadlineSeconds':120}
pathlib.Path('/tmp/hapsland-cold-placement-declaration.json').write_text(json.dumps(declaration,indent=2)+'\n')
try:
 subprocess.run([bun,'build',str(entry),'--target=bun','--minify','--compile','--bytecode','--no-compile-autoload-dotenv','--no-compile-autoload-bunfig','--no-compile-autoload-tsconfig','--no-compile-autoload-package-json','--outfile',str(origin)],capture_output=True,timeout=30,check=True)
 binary=origin.read_bytes();digest=hashlib.sha256(binary).hexdigest()
 for site,root in roots.items():
  p=root/'.test-runs/identical-placement-control';p.write_bytes(binary);p.chmod(0o755);bins[site]=p;created.append(p);assert hashlib.sha256(p.read_bytes()).hexdigest()==digest
 fields=['ru_utime','ru_stime','ru_minflt','ru_majflt','ru_nvcsw','ru_nivcsw'];cells=[(site,cwd) for site in roots for cwd in roots];deadline=time.monotonic()+120
 for i in range(21):
  order=cells[i%9:]+cells[:i%9]
  if i%2:order.reverse()
  for site,cwd in order:
   assert time.monotonic()<deadline;before=resource.getrusage(resource.RUSAGE_CHILDREN);start=time.monotonic();r=subprocess.run(['taskset','-c','11',str(bins[site])],cwd=roots[cwd],capture_output=True,timeout=5,check=True);wall=time.monotonic()-start;after=resource.getrusage(resource.RUSAGE_CHILDREN);assert r.stdout==b'empty-process-control\n' and not r.stderr
   samples.append({'site':site,'cwd':cwd,'round':i,'wall':wall,**{k:getattr(after,k)-getattr(before,k) for k in fields}})
 summary={}
 for site,cwd in cells:
  xs=[x for x in samples if x['site']==site and x['cwd']==cwd];summary[site+'/'+cwd]={'medianWall':statistics.median(x['wall'] for x in xs),'meanUserCpu':statistics.mean(x['ru_utime'] for x in xs),'meanSystemCpu':statistics.mean(x['ru_stime'] for x in xs),'medianMinorFaults':statistics.median(x['ru_minflt'] for x in xs),'majorFaults':sum(x['ru_majflt'] for x in xs)}
 result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'declaration':declaration,'binarySha256':digest,'bytes':len(binary),'summary':summary,'samples':samples,'acceptance':False};pathlib.Path('/tmp/hapsland-cold-placement-results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(summary))
finally:
 for p in created:p.unlink(missing_ok=True)
