import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
const root=resolve(import.meta.dirname,'../..')
const baselineRoot=process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT??'/workspace/typescript/hapsland-bend-baseline-master-5726758e'
const sourcePath=baselineRoot+'/packages/source-analysis/dist/direct-event/languages/typescript-functions.js'
const source=readFileSync(sourcePath,'utf8')
const exposure=join(resolve(sourcePath,'..'),`.reference-native-${process.pid}.mjs`)
const candidateExposure=root+`/packages/source-analysis/dist/direct-event/languages/.reference-draft-${process.pid}.mjs`
const candidatePath=process.env.HAPSLAND_REFERENCE_HOST_DRAFT??root+'/packages/source-analysis/src/direct-event/languages/typescript-functions.ts'
const candidateSource=readFileSync(candidatePath,'utf8')
const temporary=mkdtempSync(join(tmpdir(),'hapsland-reference-native-'))
let ids=1,cases=0,events=[],traceCases=0
const track=(value,id)=>new Proxy(value,{get(target,key,receiver){events.push(id+"."+String(key));return Reflect.get(target,key,receiver)}})
const set=values=>{const id="set"+ids++,actual=new Set(values);return {has(value){events.push(id+".has:"+String(value));return actual.has(value)}}}
const scope=(uncertain,local)=>track({uncertainBinding:uncertain,localBindings:set(local?["target"]:[])},"scope"+ids++)
const node=(type,text='X',namedChildren=[],parent=undefined)=>{const id=ids++;return track({type,text,namedChildren:track(namedChildren,id+'.children'),parent,startIndex:id,endIndex:id+1},'node'+id)}
const tuples=arity=>Array.from({length:2**arity},(_,bits)=>Array.from({length:arity},(_,axis)=>Boolean(bits&(1<<axis))))
const plan=kind=>kind===undefined?'Ignore':({'named-function':'NamedFunction','named-type':'NamedType',unsupported:'Unsupported'})[kind]
try{
 writeFileSync(exposure,source+'\nexport {namedCallReference,ignoredValueIdentifier,valueReferenceKind,declaredTypeName,intrinsicReadonly,typeReferenceKind};\n')
 const baseline=await import(pathToFileURL(exposure))
 const policyPath=process.env.HAPSLAND_REFERENCE_POLICY_ARTIFACT??root+'/packages/agent-flow-bend/dist/reference-policy.generated.js'
 const draft=candidateSource.replace('"@hapsland/canonical-policy/canonical/reference-adapter"',JSON.stringify(policyPath)).replaceAll('"./native-parser.ts"','"./native-parser.js"').replaceAll('"./contracts.ts"','"./contracts.js"')
 writeFileSync(candidateExposure,new Bun.Transpiler({loader:'ts'}).transformSync(draft)+'\nexport {namedCallReference,ignoredValueIdentifier,valueReferenceKind,declaredTypeName,intrinsicReadonly,typeReferenceKind};\n')
 const candidate=await import(pathToFileURL(candidateExposure))
 const native=Object.fromEntries(['namedCallReference','ignoredValueIdentifier','valueReferenceKind','declaredTypeName','intrinsicReadonly','typeReferenceKind'].map(name=>[name,(...args)=>{
   events=[];const expected=baseline[name](...args),before=[...events]
   events=[];const actual=candidate[name](...args),after=[...events]
   assert.deepEqual(actual,expected,name+' result');assert.deepEqual(after,before,name+' read order');traceCases++;return expected
 }]))
 const compiled=join(temporary,'core.mjs')
 execFileSync('bend',[root+'/packages/agent-flow-bend/reference-policy/core.bend','-o',compiled],{timeout:5000})
 const core=(await import(pathToFileURL(compiled))).default
 for(const [call,exists,identifier,uncertain,local] of tuples(5)){
  const callee=node(identifier?'identifier':'member_expression','target'),child=node(call?'call_expression':'other','call',exists?[callee]:[])
  const actual=native.namedCallReference(child,scope(uncertain,local))
  assert.equal(plan(actual?.reference.kind),core.call_reference(call,exists,identifier,uncertain,local).$)
  if(actual){assert.equal(actual.offset,child.startIndex);assert.equal(actual.reference.name,callee.text)}cases++
 }
 for(const [self,parentPresent,declaration,first] of tuples(4)){
  const child=node('identifier'),parent=node(declaration?'call_expression':'other'),other=node('identifier')
  parent.namedChildren=first?[child]:[other];child.parent=parentPresent?parent:undefined
  assert.equal(native.ignoredValueIdentifier(child,self?child:undefined),core.ignored_value(self,parentPresent,declaration,first));cases++
 }
 for(const [local,known,uncertain] of tuples(3)){
  const child=node('identifier','target')
  assert.equal(plan(native.valueReferenceKind(child,scope(uncertain,local),set(known?['target']:[]))),core.value_reference(local,known,uncertain).$);cases++
 }
 for(const [intrinsic,imported] of tuples(2)){
  const name=intrinsic?'String':'UserType'
  assert.equal(native.declaredTypeName(name,set(imported?[name]:[])),core.declared_type(intrinsic,imported));cases++
 }
 for(const [name,bound,generic,first,one] of tuples(5)){
  const child=node('type_identifier',name?'Readonly':'UserType'),parent=node(generic?'generic_type':'other'),other=node('type_identifier'),args=node('type_arguments','',one?[node('type_identifier')]:[])
  parent.namedChildren=[first?child:other,args];child.parent=parent
  assert.equal(native.intrinsicReadonly(child,set(bound?[child.text]:[])),core.readonly_intrinsic(name,bound,generic,first,one));cases++
 }
 for(const [unsupported,identifier,own,context,parameter,readonly,declared] of tuples(7)){
  const text=readonly?'Readonly':declared?'UserType':'String'
  const child=node(unsupported?'nested_type_identifier':identifier?'type_identifier':'identifier',text)
  const parent=node(context?'generic_type':'type_parameter'),args=node('type_arguments','',[node('type_identifier')])
  parent.namedChildren=[child,args];child.parent=parent
  const parameters=set(parameter?[text]:[]),imported=set()
  assert.equal(plan(native.typeReferenceKind(child,own?text:'different',parameters,imported)),core.type_reference(unsupported,identifier,own,context,parameter,readonly,declared).$);cases++
 }
 for(const imported of [false,true]){
  const child=node('type_identifier','String'),parent=node('generic_type');parent.namedChildren=[child];child.parent=parent
  assert.equal(plan(native.typeReferenceKind(child,'different',set([]),set(imported?['String']:[]))),imported?'NamedType':'Ignore');cases++
 }
 // Missing native ports and scalar arities remain distinct from Boolean law facts.
 for(const absent of [null,undefined]){
  const child=node('identifier','value',[],absent)
  assert.equal(native.ignoredValueIdentifier(child,undefined),true)
  const readonly=node('type_identifier','Readonly',[],absent)
  assert.equal(native.intrinsicReadonly(readonly,set()),false);cases+=2
 }
 for(const arity of [0,2,3]){
  const child=node('type_identifier','Readonly'),parent=node('generic_type'),args=node('type_arguments','',Array.from({length:arity},()=>node('type_identifier')))
  child.parent=parent;parent.namedChildren=[child,args]
  assert.equal(native.intrinsicReadonly(child,set()),false);cases++
 }
 const record={passed:true,cases,booleanFamilyCases:220,extraNativeCases:cases-220,compiledSourceSha256:createHash('sha256').update(source).digest('hex'),traceCases,candidatePath,candidateSourceSha256:createHash('sha256').update(candidateSource).digest('hex'),scope:'frozen-master actual compiled private helpers versus staged host using actual core-derived artifact through controlled AST/Set/scope ports; exact recorded reads, result names/offsets and missing values; Boolean families include unreachable native conjunctions whose ignored facts do not affect results; no real parser or universal native proof claim'}
 writeFileSync(root+'/evidence/bend-strangler/reference-host-falsification.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(exposure,{force:true});rmSync(candidateExposure,{force:true});rmSync(temporary,{recursive:true,force:true})}
