"""Check literal instances extracted from the original laws and reject core mutants."""
import hashlib,json,os,pathlib,re,resource,shutil,subprocess,sys,tempfile,time
ROOT=pathlib.Path(__file__).resolve().parents[3]
SOURCE=pathlib.Path(__file__).resolve().parent
CPU=os.environ.get('HAPSLAND_PROOF_CPU','11')
LAWS=(SOURCE/'./RUNTIME_LAWS.bend').read_text()
MODEL=(SOURCE/'./RuntimeModel.bend').read_text()
PRELUDE='''import Base
import ./RuntimeModel.bend as R
import ./RuntimeSpecification.bend as Specification
import ./RuntimeLawObservation.bend as Observation
import ./Types.bend as T
import ./Environment.bend as E
import ./WholeObservation.bend as O
import ../../../packages/agent-flow-bend/ImportGraph.bend as G
def suspend(operation: T.Operation, world: Nat) -> R.ProviderResponse<Nat>:
  R.ProviderSuspended{world, []}
def observe(exception: T.ExceptionToken, world: Nat) -> O.Error:
  O.Error{None{}, O.Text{[]}, O.Text{[]}, None{}, None{}}
def fixture_input() -> T.ResolverInput:
  T.ResolverInput{1n, "", T.CaptureToken{1n, 1n}, 0n, "",
    "", T.TypeBranch{}, None{},
    G.Limits{1n, 1n, 1n, 1n, 1n, 1n, 1n, 1n}}
def matching_completion() -> R.RuntimeEvent<Nat>:
  R.RuntimeComplete{E.Completion{O.ProviderLease{1n, 1n}, 1n,
    T.ClockStarted{T.ClockToken{1n, 1n}}, []}}
'''
# Mutate one existing function body, never the specification or law owner.
CANCEL_BEFORE='cancellation(World, Nat.is_eq(invocation, actual), state)'
ADVANCE_BEFORE='''case _: state

def cancellation_execution'''
ADVANCE_AFTER='''case State{invocation, registry, execution, provider, next, world, actions}:
      State{invocation, registry, execution, provider, (next + 1n : Nat), world, actions}

def cancellation_execution'''
LATE_BEFORE='world_effects(World, old_world), nested)}, actions_append(actions, ProviderRetired{lease})}'
LATE_AFTER='world_effects(World, old_world), nested)}, actions_append(actions_append(actions, ProviderRetired{lease}), ProviderRetired{lease})}'
CASES=[
 ('scheduler_step_exact','ignore-matching-cancel',CANCEL_BEFORE,'cancellation(World, False{}, state)'),
 ('scheduler_prefix_exact','ignore-matching-cancel',CANCEL_BEFORE,'cancellation(World, False{}, state)'),
 ('cancellation_suffix_machine_fenced','advance-closed-counter',ADVANCE_BEFORE,ADVANCE_AFTER),
 ('cancellation_suffix_actions_exact','duplicate-late-retirement',LATE_BEFORE,LATE_AFTER),
]
def claim(name):
 block=re.search(r'^law '+name+r':\n(.*?)(?=^law |\Z)',LAWS,re.M|re.S).group(1)
 block=re.sub(r'^#.*\n','',block,flags=re.M).rstrip()
 statement=block[block.index('  {'):].strip()
 values={'World':'Nat','respond':'suspend','observe':'observe','state':'R.initial(Nat, fixture_input(), 0n)',
 'item':'R.RuntimeCancel{1n}','input':'fixture_input()','world':'0n',
 'events':'R.RuntimeCancel{1n} <> []',
 'prefix':'R.RuntimeAdvance{} <> []' if name.endswith('actions_exact') else '[]',
 'suffix':'matching_completion() <> matching_completion() <> []' if name.endswith('actions_exact') else 'R.RuntimeAdvance{} <> []'}
 binders=re.findall(r'^  for [~+]?([a-zA-Z_]+):',block,re.M)
 for binder in binders:
  statement=re.sub(r'\b'+binder+r'\b',lambda _:values[binder],statement)
 return statement,{binder:values[binder] for binder in binders}
def check(folder,file,label):
 start=time.monotonic();before=resource.getrusage(resource.RUSAGE_CHILDREN)
 process=subprocess.Popen(['timeout','--signal=KILL','5s','taskset','-c',CPU,'bend',str(folder/file),'--verdict'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 samples={}
 def sample(pid):
  try:
   stat=pathlib.Path('/proc/'+str(pid)+'/stat').read_text().rsplit(')',1)[1].split()
   previous=samples.setdefault(str(pid),{'cpuTicks':0,'rssPages':0,'name':pathlib.Path('/proc/'+str(pid)+'/comm').read_text().strip()})
   previous['cpuTicks']=max(previous['cpuTicks'],int(stat[11])+int(stat[12]))
   previous['rssPages']=max(previous['rssPages'],int(stat[21]))
   for child in pathlib.Path('/proc/'+str(pid)+'/task/'+str(pid)+'/children').read_text().split():sample(int(child))
  except (FileNotFoundError,ProcessLookupError):pass
 while True:
  sample(process.pid)
  try:
   stdout,stderr=process.communicate(timeout=.05);break
  except subprocess.TimeoutExpired:pass
 after=resource.getrusage(resource.RUSAGE_CHILDREN);log='/tmp/hapsland-runtime-mutant-'+label+'.log';pathlib.Path(log).write_text(stdout+stderr)
 return {'exitCode':process.returncode,'seconds':time.monotonic()-start,'cpuSeconds':after.ru_utime+after.ru_stime-before.ru_utime-before.ru_stime,'processTreeSamples':samples,'sampledCpuSeconds':sum(v['cpuTicks'] for v in samples.values())/os.sysconf('SC_CLK_TCK'),'output':stdout+stderr,'log':log}
def passed(r):return r['exitCode']==0 and r['seconds']<=5 and 'ALL PROOFS CHECK' in r['output']
selected=set(sys.argv[1:])
assert selected <= {row[0] for row in CASES}, 'Unknown original law selection'
checks=[row for row in CASES if not selected or row[0] in selected]
folder=pathlib.Path(tempfile.mkdtemp(prefix='.runtime-mutant-',dir=SOURCE.parent));rows=[]
record={'lawOwnerSha256':hashlib.sha256(LAWS.encode()).hexdigest(),'modelSha256':hashlib.sha256(MODEL.encode()).hexdigest(),'cpu':CPU,'selectedLaws':[row[0] for row in checks],'cases':rows,'selectedChecksQualified':False,'qualified':False,'scope':'Four finite literal instances mechanically extracted from original law statements plus unchanged canonical proof rejection. Pure runtime model only; not physical cleanup or graph correctness.'}
try:
 for file in SOURCE.glob('*.bend'):shutil.copy2(file,folder/file.name)
 for name,mutation,before,after in checks:
  assert MODEL.count(before)==1,(name,'mutation anchor not unique')
  statement,bindings=claim(name)
  wrapper=PRELUDE+'\ndef original_law_instance() -> '+statement+':\n  {==}\ndef main() -> Unit:\n  Unit{}\n'
  (folder/'INSTANCE.bend').write_text(wrapper);(folder/'./RuntimeModel.bend').write_text(MODEL)
  row={'law':name,'mutation':mutation,'bindings':bindings,'instantiatedStatement':statement,'mutationBefore':before,'mutationAfter':after};rows.append(row)
  row['originalInstance']=check(folder,'INSTANCE.bend',name+'-original')
  if not passed(row['originalInstance']):raise RuntimeError('Unqualified original instance: '+name)
  (folder/'./RuntimeModel.bend').write_text(MODEL.replace(before,after))
  row['mutantModel']=check(folder,'./RuntimeModel.bend',name+'-model')
  if not passed(row['mutantModel']):raise RuntimeError('Invalid or unqualified mutant: '+name)
  row['mutantInstance']=check(folder,'INSTANCE.bend',name+'-instance')
  row['mutantCanonicalProof']=check(folder,'./RUNTIME_PROOF.bend',name+'-proof')
  for key in ['mutantInstance','mutantCanonicalProof']:
   result=row[key]
   if result['exitCode']!=1 or result['seconds']>5 or not all(marker in result['output'] for marker in ['SOME PROOFS FAIL','- expected :','- observed :','Location:']):raise RuntimeError('Missing mathematical rejection: '+name+' '+key)
  row['rejected']=True
  row['canonicalFailureLocation']=re.search(r'Location: ([^\n]+)',row['mutantCanonicalProof']['output']).group(1)
  row['canonicalRejectionScope']='Fails in shared supporting lemma; finite original-law instance independently fails in its own section'
  assert 'Location: original_law_instance' in row['mutantInstance']['output']
  print(json.dumps({'law':name,'rejected':True}),flush=True)
 record['selectedChecksQualified']=True
 record['qualified']=len(checks)==len(CASES)
finally:
 record['at']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
 (SOURCE/('runtime-mutation-selected-evidence.json' if selected else 'runtime-mutation-evidence.json')).write_text(json.dumps(record,indent=2)+'\n')
 shutil.rmtree(folder)
