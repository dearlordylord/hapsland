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
const temporary=mkdtempSync(join(tmpdir(),'hapsland-reference-native-'))
let ids=1,cases=0
const node=(type,text='X',namedChildren=[],parent=undefined)=>{const id=ids++;return {type,text,namedChildren,parent,startIndex:id,endIndex:id+1}}
const tuples=arity=>Array.from({length:2**arity},(_,bits)=>Array.from({length:arity},(_,axis)=>Boolean(bits&(1<<axis))))
const plan=kind=>kind===undefined?'Ignore':({'named-function':'NamedFunction','named-type':'NamedType',unsupported:'Unsupported'})[kind]
try{
 writeFileSync(exposure,source+'\nexport {namedCallReference,ignoredValueIdentifier,valueReferenceKind,declaredTypeName,intrinsicReadonly,typeReferenceKind};\n')
 const native=await import(pathToFileURL(exposure))
 const compiled=join(temporary,'core.mjs')
 execFileSync('bend',[root+'/packages/agent-flow-bend/reference-policy/core.bend','-o',compiled],{timeout:5000})
 const core=(await import(pathToFileURL(compiled))).default
 for(const [call,exists,identifier,uncertain,local] of tuples(5)){
  const callee=node(identifier?'identifier':'member_expression','target'),child=node(call?'call_expression':'other','call',exists?[callee]:[])
  const actual=native.namedCallReference(child,{uncertainBinding:uncertain,localBindings:new Set(local?['target']:[])})
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
  assert.equal(plan(native.valueReferenceKind(child,{uncertainBinding:uncertain,localBindings:new Set(local?['target']:[])},new Set(known?['target']:[]))),core.value_reference(local,known,uncertain).$);cases++
 }
 for(const [intrinsic,imported] of tuples(2)){
  const name=intrinsic?'String':'UserType'
  assert.equal(native.declaredTypeName(name,new Set(imported?[name]:[])),core.declared_type(intrinsic,imported));cases++
 }
 for(const [name,bound,generic,first,one] of tuples(5)){
  const child=node('type_identifier',name?'Readonly':'UserType'),parent=node(generic?'generic_type':'other'),other=node('type_identifier'),args=node('type_arguments','',one?[node('type_identifier')]:[])
  parent.namedChildren=[first?child:other,args];child.parent=parent
  assert.equal(native.intrinsicReadonly(child,new Set(bound?[child.text]:[])),core.readonly_intrinsic(name,bound,generic,first,one));cases++
 }
 for(const [unsupported,identifier,own,context,parameter,readonly,declared] of tuples(7)){
  const text=readonly?'Readonly':declared?'UserType':'String'
  const child=node(unsupported?'nested_type_identifier':identifier?'type_identifier':'identifier',text)
  const parent=node(context?'generic_type':'type_parameter'),args=node('type_arguments','',[node('type_identifier')])
  parent.namedChildren=[child,args];child.parent=parent
  const parameters=new Set(parameter?[text]:[]),imported=new Set()
  assert.equal(plan(native.typeReferenceKind(child,own?text:'different',parameters,imported)),core.type_reference(unsupported,identifier,own,context,parameter,readonly,declared).$);cases++
 }
 // Missing native ports and scalar arities remain distinct from Boolean law facts.
 for(const absent of [null,undefined]){
  const child=node('identifier','value',[],absent)
  assert.equal(native.ignoredValueIdentifier(child,undefined),true)
  const readonly=node('type_identifier','Readonly',[],absent)
  assert.equal(native.intrinsicReadonly(readonly,new Set()),false);cases+=2
 }
 for(const arity of [0,2,3]){
  const child=node('type_identifier','Readonly'),parent=node('generic_type'),args=node('type_arguments','',Array.from({length:arity},()=>node('type_identifier')))
  child.parent=parent;parent.namedChildren=[child,args]
  assert.equal(native.intrinsicReadonly(child,new Set()),false);cases++
 }
 const record={passed:true,cases,booleanFamilyCases:220,extraNativeCases:cases-220,compiledSourceSha256:createHash('sha256').update(source).digest('hex'),scope:'actual compiled private TypeScript reference helpers versus compiled approved core through controlled AST/Set ports; Boolean families include unreachable native conjunctions whose ignored facts do not affect results; names/offsets checked; no real parser, universal native proof or field-read equivalence claim'}
 writeFileSync(root+'/evidence/bend-strangler/reference-native-falsification.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(exposure,{force:true});rmSync(temporary,{recursive:true,force:true})}
