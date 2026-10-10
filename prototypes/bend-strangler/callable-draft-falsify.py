from pathlib import Path
import tempfile,shutil,itertools,subprocess,json,hashlib
root=Path(__file__).resolve().parents[2];owner=root/'packages/agent-flow-bend/callable-policy'
b=['False{}','True{}'];cases=[]
def add(fn,args,spec,typ):
 cases.append(f'def case_{len(cases)}() -> {{ Core.{fn}({", ".join(args)}) == Laws.{spec}({", ".join(args)}) : {typ} }}: {{==}}')
for k,t in itertools.product(['NamedEffect{}','EffectNamespace{}','OtherImport{}'],b):add('runtime_import',['Core.'+k,t],'import_spec','Bool')
for t,m,i,k,c,l in itertools.product(b,b,b,['Fn{}','FnUntraced{}','OtherMethod{}'],b,b):add('wrapper',[t,m,i,'Core.'+k,c,l],'wrapper_spec','Bool')
for k in ['Arrow{}','FunctionExpression{}','GeneratorFunction{}','OtherBody{}']:add('inline_body',['Core.'+k],'body_spec','Bool')
for k,t,w,o,a in itertools.product(['DirectArrow{}','WrapperCall{}','OtherValue{}'],b,b,b,b):add('callable_value',['Core.'+k,t,w,o,a],'value_spec','Core.CallablePlan')
for args in itertools.product(b,repeat=4):add('const_callable',args,'declaration_spec','Bool')
with tempfile.TemporaryDirectory(prefix='hapsland-callable-laws-') as tmp:
 p=Path(tmp)
 shutil.copyfile(owner/'core.bend',p/'core.bend')
 (p/'LAWS.bend').write_text((owner/'LAWS.bend').read_text().split('law runtime_import_exact:')[0])
 (p/'instances.bend').write_text('import Base\nimport ./core.bend as Core\nimport ./LAWS.bend as Laws\n'+'\n\n'.join(cases)+'\n')
 result=subprocess.run(['bend',str(p/'instances.bend'),'--verdict'],capture_output=True,text=True,timeout=5)
 output=result.stdout+result.stderr
 print(output)
 assert result.returncode==0 and 'ALL PROOFS CHECK' in output
 record={'cases':len(cases),'passed':True,'scope':'all finite decision-fact combinations: concrete kernel instances compare draft implementation and independent law specifications; not a universal proof or native AST/host validation','coreSha256':hashlib.sha256((owner/'core.bend').read_bytes()).hexdigest(),'lawsSha256':hashlib.sha256((owner/'LAWS.bend').read_bytes()).hexdigest()}
 (root/'evidence/bend-strangler/callable-draft-falsification.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
