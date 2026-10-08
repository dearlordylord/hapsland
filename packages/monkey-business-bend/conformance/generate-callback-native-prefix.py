# Mechanical source generator; does not run Bend or validate business policy.
from pathlib import Path
import re,json,hashlib,sys,os,argparse,subprocess,tempfile,importlib.util
root=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser(description='Generate the ONE lossless owner prefix transport')
parser.add_argument('--check',action='store_true')
parser.add_argument('--optional-profile',type=Path,
 help='Prototype-owned JSON roots and codec/metadata outputs; default business generation is unchanged')
arguments=parser.parse_args()
profile=None

def prototype_path(value,suffix):
 if not isinstance(value,str):raise SystemExit('optional profile path must be a string')
 path=(root/value).resolve()
 if not path.is_relative_to(root/'prototypes') or path.suffix!=suffix:
  raise SystemExit('optional profile paths must remain under prototypes with the declared suffix')
 return path

if arguments.optional_profile is not None:
 profile_path=prototype_path(str(arguments.optional_profile),'.json')
 profile=json.loads(profile_path.read_text())
 if not isinstance(profile,dict) or set(profile)!={'roots','codec','metadata'}:
  raise SystemExit('optional profile requires exactly roots, codec and metadata')
 if not isinstance(profile['roots'],dict) or not profile['roots']:
  raise SystemExit('optional profile requires at least one actual owner root')
modules={}
def load(path):
 path=path.resolve()
 if path in modules:return
 text=path.read_text(); imports={}
 for rel,alias in re.findall(r'^import (\S+) as (\w+)$',text,re.M):
  target=(path.parent/rel).resolve(); imports[alias]=target; load(target)
 types={}
 for m in re.finditer(r'^type (\w+) is Data:\n((?:  [^\n]*(?:\n|$))+)',text,re.M):
  body=' '.join(m[2].splitlines()); cases=[]
  for cm in re.finditer(r'(\w+)\{([^{}]*)\}',body):
   fs=[];buf='';depth=0
   for c in cm[2]+',':
    depth+=c=='<'; depth-=c=='>'
    if c==',' and depth==0:
     if buf.strip():fs.append(tuple(x.strip() for x in buf.split(':',1)))
     buf=''
    else:buf+=c
   cases.append((cm[1],fs))
  types[m[1]]=cases
 modules[path]=(imports,types)
load(root/'packages/agent-flow-bend/Canonical.bend')
load(root/'packages/agent-flow-bend/ImportGraph.bend')
load(root/'packages/monkey-business-bend/Callbacks.bend')
load(root/'packages/monkey-business-bend/AdviceeLifecycle.bend')
load(root/'packages/monkey-business-bend/Types.bend')
family_roots={
 'expiry_scenarios':(root/'packages/monkey-business-bend/conformance/expiry-observed-driver.bend','Envelope',True),
 'stop_scenarios':(root/'packages/monkey-business-bend/conformance/stop-observed-wire.bend','Envelope',True),
 'sharing_scenarios':(root/'packages/monkey-business-bend/conformance/sharing-observed-wire.bend','Envelope',False),
 'output_scenarios':(root/'packages/monkey-business-bend/conformance/output-scenario-driver.bend','Envelope',True),
 'writer_scenarios':(root/'packages/monkey-business-bend/conformance/writer-observed-wire.bend','Envelope',True),
}
if profile is not None:
 family_roots={}
 for name,owner in profile['roots'].items():
  if not re.fullmatch(r'[a-z][a-z0-9_]*',name) or not isinstance(owner,dict) or set(owner)!={'module','type','vector'}:
   raise SystemExit('optional root requires a named module, type and vector shape')
  if not isinstance(owner['type'],str) or not re.fullmatch(r'[A-Z][A-Za-z0-9_]*',owner['type']) or type(owner['vector']) is not bool:
   raise SystemExit('optional root has an invalid owner type or vector shape')
  family_roots[name]=(prototype_path(owner['module'],'.bend'),owner['type'],owner['vector'])
for path,_,_ in family_roots.values():load(path)
needed={}; order=[]
def resolve(path,t):
 if '.' in t:
  alias,t=t.split('.',1);path=modules[path][0][alias]
 return path,t

def visit(path,t):
 t=t.strip()
 if t in ['Nat','Bool','U32','String']:return t.lower()
 gm=re.fullmatch(r'(List|Maybe)<&2,\s*(.*)>',t)
 if gm:
  inner=visit(path,gm[2]); name=gm[1].lower()+'_'+inner
  if name not in needed:
   needed[name]=(gm[1],inner);order.append(name)
  return name
 path,t=resolve(path,t);name=path.stem.lower().replace('-','_')+'_'+t.lower()
 if name in needed:return name
 needed[name]=None
 cases=[]
 for ctor,fields in modules[path][1][t]:
  cases.append((ctor,[(field,visit(path,ft)) for field,ft in fields]))
 needed[name]=(path,t,cases);order.append(name)
 return name
for module,t in [('Canonical','State'),('Canonical','Step'),('Canonical','CanonicalEvent'),('ImportGraph','Bounded'),('ImportGraph','BoundedStep'),('ImportGraph','GraphEvent'),('Callbacks','Target'),('Callbacks','Applicability'),('Callbacks','Control'),('AdviceeLifecycle','Entry'),('AdviceeLifecycle','Action'),('Types','GraphKey'),('Types','GraphEntry')]:
 path=root/'packages'/('agent-flow-bend' if module in ['Canonical','ImportGraph'] else 'monkey-business-bend')/(module+'.bend');visit(path.resolve(),t)
visit((root/'packages/monkey-business-bend/AdviceeLifecycle.bend').resolve(),'List<&2, Entry>')
family_types={name:visit(path.resolve(),f'List<&2,{owner}>' if vector else owner)
 for name,(path,owner,vector) in family_roots.items()}
aliases={p:p.stem.replace('-','_') for p,_,*rest in (item for item in needed.values() if item and isinstance(item[0],Path))}

baseline=root/'packages/monkey-business-bend/conformance/callback-native-codec.bend'
out=baseline if profile is None else prototype_path(profile['codec'],'.bend')
if profile is not None and out in modules:
 raise SystemExit('optional codec output cannot overwrite an imported owner source')
previous=baseline.read_text()
# Optional owner envelopes use only generated encoders and the same pure JSON
# renderer. The default hand-written callback envelope remains business-only.
start=previous.index('def target_member(' if profile is None else 'def number_prefix(')
retention=previous[start:]
# Family entrypoints belong to the generated region, never the retained hand
# envelope. Remove the previous generated suffix when upgrading in place.
for name in family_roots:
 retention=re.sub(r'\ndef '+re.escape(name)+r'\([^\n]+\n  [^\n]+\n?', '\n',retention)
# A larger owner closure can subsume formerly hand-written structural list/
# Maybe helpers. Keep one generated implementation, with the identical prefix
# words; declarations are never rewritten as if they were encoder call sites.
generated_names=set(order)
generated_names.update(name+'_items' for name in order if needed[name][0]=='List')
for name in sorted(generated_names):
 retention=re.sub(r'^def '+re.escape(name)+r'\([^\n]*\n[\s\S]*?(?=^def |^#|\Z)', '',retention,flags=re.M)
metadata={}
def relative_import(path):
 rel=os.path.relpath(path,out.parent)
 return rel if rel.startswith('.') else './'+rel
lines=['import Base']
if profile is None:
 lines.append('import '+relative_import(root/'packages/monkey-business-bend/conformance/callback-native-driver.bend')+' as Run')
if profile is None or (root/'packages/monkey-business-bend/Engine.bend').resolve() in aliases:
 lines.append('import '+relative_import(root/'packages/monkey-business-bend/Engine.bend')+' as Engine')
for p,alias in sorted(aliases.items(),key=lambda x:x[1]):
 # The retained envelope already imports Engine. A newly reached Engine ADT
 # uses that same owner alias instead of publishing a duplicate import.
 if p == (root/'packages/monkey-business-bend/Engine.bend').resolve():continue
 rel=os.path.relpath(p,out.parent)
 if not rel.startswith('.'):rel='./'+rel
 lines.append(f'import {rel} as {alias}')
lines+=['','# Lossless private prefix transport, generated from the actual owner ADTs.','# Every ordinal is local to its expected type; all fields remain in owner order.','# Each encoder prepends to a suffix, avoiding text/concat continuations.','']
def typename(name):
 if name=='nat':return 'Nat'
 if name=='bool':return 'Bool'
 if name=='u32':return 'U32'
 if name=='string':return 'String'
 x=needed[name]
 if x[0] in ['List','Maybe']:return x[0]+'<&2,'+typename(x[1])+'>'
 return aliases[x[0]]+'.'+x[1]
def encode(name,value,suffix):
 if name=='nat':return value+' <> '+suffix
 if name=='bool':return 'boolean('+value+','+suffix+')'
 if name=='u32':return 'U32.to_nat('+value+') <> '+suffix
 if name=='string':return 'text(['+value+'],'+suffix+')'
 return name+'(['+value+'],'+suffix+')'
lines+=['def boolean(value: Bool, suffix: List<&2,Nat>) -> List<&2,Nat>:','  match value:','    case False{}: 0n <> suffix','    case True{}: 1n <> suffix','']
lines += ['def text_words(value: String) -> List<&2,Nat>:', '  match value:',
 '    case SNil{}: []', '    case SCon{Chr{code},tail}: U32.to_nat(code) <> text_words(tail)', '',
 'def text(values: List<&2,String>, suffix: List<&2,Nat>) -> List<&2,Nat>:', '  match values:',
 '    case value <> Nil{}:', '      +words=text_words(value)',
 '      List.length(&2,Nat,words) <> List.append(&2,Nat,words,suffix)',
 '    case _: 999999n <> suffix', '']
for name in order:
 item=needed[name]
 if item[0]=='List':
  _,inner=item;metadata[name]={'kind':'list','element':inner,'representation':'bend'}
  # For commands, fold reversed input into the suffix: E(c1,E(c2,s))
  # equals this tail-recursive accumulator. Transport proposal, not a proof.
  items = (name+'_items([tail],'+encode(inner,'head','suffix')+')' if name=='list_canonical_command'
    else encode(inner,'head',name+'_items([tail],suffix)'))
  source = ('List.reverse(&2,Canonical.Command,value)' if name=='list_canonical_command' else 'value')
  lines += [f'def {name}_items(values: List<&2,{typename(name)}>, suffix: List<&2,Nat>) -> List<&2,Nat>:','  match values:','    case Nil{} <> Nil{}: suffix','    case Con{head,tail} <> Nil{}: '+items, '    case _: 999999n <> suffix','',f'def {name}(values: List<&2,{typename(name)}>, suffix: List<&2,Nat>) -> List<&2,Nat>:','  match values:', f'    case +value <> Nil{{}}: List.length(&2,{typename(inner)},value) <> {name}_items([{source}],suffix)', '    case _: 999999n <> suffix','']
 elif item[0]=='Maybe':
  _,inner=item;metadata[name]={'kind':'maybe','element':inner,'representation':'bend'}
  lines += [f'def {name}(values: List<&2,{typename(name)}>, suffix: List<&2,Nat>) -> List<&2,Nat>:','  match values:','    case None{} <> Nil{}: 0n <> suffix','    case Some{value} <> Nil{}: 1n <> '+encode(inner,'value','suffix'), '    case _: 999999n <> suffix','']
 else:
  path,t,cases=item;metadata[name]={'kind':'adt','constructors':[{'tag':aliases[path]+'.'+ctor,'fields':fs} for ctor,fs in cases]}
  lines += [f'def {name}(values: List<&2,{typename(name)}>, suffix: List<&2,Nat>) -> List<&2,Nat>:','  match values:']
  for ordinal,(ctor,fields) in enumerate(cases):
   vs=['v'+str(i) for i in range(len(fields))];expr='suffix'
   for v,(_,fn) in reversed(list(zip(vs,fields))):expr=encode(fn,v,expr)
   lines += ['    case '+aliases[path]+'.'+ctor+'{'+','.join(vs)+'} <> Nil{}: '+str(ordinal)+'n <> '+expr]
  lines+=['    case _: 999999n <> suffix','']
# Existing envelope calls use the same generated typed encoders. Box their
# first argument mechanically; retain every field, ordinal and suffix order.
pattern=re.compile(r'\b('+'|'.join(re.escape(n) for n in order)+r')\(')
edits=[]
for match in pattern.finditer(retention):
 if retention[retention.rfind('\n',0,match.start())+1:match.start()].lstrip()=='def ': continue
 start=match.end(); depth=0
 if retention[start:].lstrip().startswith("["): continue
 for i in range(start,len(retention)):
  c=retention[i]
  if c in '([{': depth+=1
  elif c in ')]}': depth-=1
  elif c==',' and depth==0:
   edits += [(start,'['),(i,']')];break
for position,text in sorted(edits,reverse=True): retention=retention[:position]+text+retention[position:]
for name,owner_type in family_types.items():
 vector=family_roots[name][2]
 input_type=typename(owner_type) if vector else 'List<&2,'+typename(owner_type)+'>'
 argument='[values]' if vector else 'values'
 lines += [f'def {name}(values: {input_type}, suffix: List<&2,Nat>) -> List<&2,Nat>:',
  f'  {owner_type}({argument},suffix)', '']
lines.append(retention)
# Schema-like descriptions here are wire structure only. They do not validate
# owner invariants; production exact codecs validate the reconstructed DTOs.
def record(fields):return {'kind':'record','fields':fields}
if profile is None:
 metadata.update({
  'wire_graph':record([['before','importgraph_bounded'],['after','importgraph_bounded'],['command','importgraph_command']]),
  'wire_scope':{'kind':'maybe','element':'nat','representation':'plain'},
  'wire_scopes':{'kind':'list','element':'wire_scope','representation':'plain'},
  'wire_receipt':{'kind':'maybe','element':'callbacks_target','representation':'plain'},
  'wire_frames':{'kind':'list','element':'wire_frame','representation':'plain'},
  'wire_targets':{'kind':'list','element':'callbacks_target','representation':'plain'},
  'wire_endpoint':record([['time','nat'],['projection','canonical_state'],['targets','wire_targets'],['lifecycles','list_adviceelifecycle_entry']]),
  'wire_scenario':record([['frames','wire_frames'],['endpoint','wire_endpoint']]),
  'wire_scenarios':{'kind':'list','element':'wire_scenario','representation':'plain'},
  'wire_frame':{'kind':'variant','constructors':[
  {'kind':'canonical','fields':[['time','nat'],['before','canonical_state'],['after','canonical_state'],['event','canonical_canonicalevent'],['result','canonical_step'],['commandScopes','wire_scopes'],['receipt','wire_receipt']]},
  {'kind':'graph','fields':[['time','nat'],['before','canonical_state'],['after','canonical_state'],['key','types_graphkey'],['position','nat'],['event','importgraph_graphevent'],['graph','wire_graph']]},
  {'kind':'callback','fields':[['time','nat'],['before','canonical_state'],['after','canonical_state'],['target','callbacks_target'],['action','callbacks_control'],['result','callbacks_applicability']]},
  {'kind':'lifecycle','fields':[['before','canonical_state'],['after','canonical_state'],['partition','nat'],['action','adviceelifecycle_action']]},
  {'kind':'source','fields':[['time','nat'],['event','canonical_canonicalevent']]},
  {'kind':'fuelExhausted','fields':[]},{'kind':'unexpectedCoreNil','fields':[]},{'kind':'unexpectedSerializerInput','fields':[]}]}
 })
for name,owner_type in family_types.items():metadata[name]=metadata[owner_type]
ownerSources=[{'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(aliases)]
p=(root/'packages/monkey-business/src/callback-native-metadata.ts') if profile is None else prototype_path(profile['metadata'],'.ts');metadata_text = '// Generated mechanical transport descriptors from actual Bend owner declarations.\n// Semantic validation remains in the production exact boundary codecs.\nexport const callbackNativeDescriptors = '+json.dumps(metadata,separators=(',',':'))+' as const;\nexport const callbackNativeOwnerSources = '+json.dumps(ownerSources,separators=(',',':'))+' as const;\n'
if profile is None:
 metadata_text = subprocess.run([str(root/'node_modules/.bin/dprint'),'fmt','--stdin','ts'],
  input=metadata_text,text=True,capture_output=True,cwd=root,timeout=5,check=True).stdout
native_text = '\n'.join(lines)
if profile is not None:
 # Optional codecs share the repository's pinned formatter with the commit gate.
 sys.dont_write_bytecode=True
 spec=importlib.util.spec_from_file_location('bend_format',root/'scripts/bend-format.py')
 formatter=importlib.util.module_from_spec(spec);spec.loader.exec_module(formatter)
 jar=os.environ.get('BEND_FORMAT_JAR')
 command=([os.environ.get('BEND_FORMAT_JAVA','java'),'-jar',jar]
  if jar else [os.environ.get('BEND_FORMAT_BIN','bend-format')])
 version=subprocess.run(command+['--version'],text=True,capture_output=True,timeout=10,check=True)
 if version.stdout.strip()!=formatter.VERSION:
  raise SystemExit('Optional codec generation requires '+formatter.VERSION)
 with tempfile.NamedTemporaryFile(mode='w',suffix='.bend',dir=out.parent,delete=False) as staged:
  staged.write(native_text);temporary=Path(staged.name)
 try:
  subprocess.run(command+['fix',str(temporary)],capture_output=True,text=True,timeout=60,check=True)
  native_text=temporary.read_text()
 finally:
  temporary.unlink()

if arguments.check:
 if out.read_text() != native_text or p.read_text() != metadata_text:
  raise SystemExit('callback numeric transport differs from actual owner generation')
else:
 out.write_text(native_text)
 p.write_text(metadata_text)
print('generated',len(order),'ownerencoders',sum(len(x[2]) for x in needed.values() if isinstance(x[0],Path)),'constructors')
