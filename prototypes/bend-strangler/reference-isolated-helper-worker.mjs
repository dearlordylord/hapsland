import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {performance} from 'node:perf_hooks'
const root=resolve(import.meta.dirname,'../..')
const baselineRoot=process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT??'/workspace/typescript/hapsland-bend-baseline-master-5726758e'
const selectedRoot=process.argv[2];assert.ok(selectedRoot);
const sourcePath=selectedRoot+'/packages/source-analysis/dist/direct-event/languages/typescript-functions.js'
const source=readFileSync(sourcePath,'utf8')
const candidatePath=root+'/packages/source-analysis/dist/direct-event/languages/typescript-functions.js'
const candidateSource=readFileSync(candidatePath,'utf8')
const candidateExposure=join(resolve(candidatePath,'..'),`.reference-candidate-${process.pid}.mjs`)
const exposure=join(resolve(sourcePath,'..'),`.reference-native-${process.pid}.mjs`)
const temporary=mkdtempSync(join(tmpdir(),'hapsland-reference-native-'))
let ids=1,cases=0;const fixtures=[]
const node=(type,text='X',namedChildren=[],parent=undefined)=>{const id=ids++;return {type,text,namedChildren,parent,startIndex:id,endIndex:id+1}}
const tuples=arity=>Array.from({length:2**arity},(_,bits)=>Array.from({length:arity},(_,axis)=>Boolean(bits&(1<<axis))))
const plan=kind=>kind===undefined?'Ignore':({'named-function':'NamedFunction','named-type':'NamedType',unsupported:'Unsupported'})[kind]
try{
 writeFileSync(exposure,source+'\nexport {namedCallReference,ignoredValueIdentifier,valueReferenceKind,declaredTypeName,intrinsicReadonly,typeReferenceKind};\n')
 const baseline=await import(pathToFileURL(exposure))
 const candidate=baseline
 const names=['namedCallReference','ignoredValueIdentifier','valueReferenceKind','declaredTypeName','intrinsicReadonly','typeReferenceKind']
 const native=Object.fromEntries(names.map(method=>[method,(...args)=>{const expected=baseline[method](...args);assert.deepEqual(candidate[method](...args),expected);fixtures.push({method,args,expected});return expected}]))
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
 const rounds=Number(process.env.HAPSLAND_REFERENCE_ROUNDS??10000);assert.ok(Number.isSafeInteger(rounds)&&rounds>0)
 const consume=(fixture,result)=>fixture.method==='namedCallReference'&&fixture.expected!==undefined?Number(result?.offset===fixture.expected.offset)+Number(result?.reference.name===fixture.expected.reference.name)+Number(result?.reference.kind===fixture.expected.reference.kind):Number(Object.is(result,fixture.expected))
 const sites=[0,1].map(()=>new Function('fixtures','consume','rounds','return lane=>{let sum=0;for(let round=0;round<rounds;round++)for(const fixture of fixtures)sum+=consume(fixture,lane[fixture.method](...fixture.args));return sum}')(fixtures,consume,rounds))
 const lanes={selected:baseline},samples={typescript:[],integratedBend:[]},cpuSamples={typescript:[],integratedBend:[]},startedAt=new Date().toISOString();let checksum
 for(let pair=0;pair<6;pair++){
  const order=Object.entries(lanes);if(pair%2)order.reverse()
  for(const [name,lane] of order){let seconds=0,cpuSeconds=0;for(const site of sites){const start=performance.now(),cpu=process.cpuUsage(),actual=site(lane),used=process.cpuUsage(cpu);seconds+=(performance.now()-start)/1000;cpuSeconds+=(used.user+used.system)/1e6;checksum??=actual;assert.equal(actual,checksum)}if(pair>=5){console.log(JSON.stringify({seconds,cpuSeconds,checksum,fixtures:fixtures.length,rounds,callers:2,warmups:5,coreValidated:true}))}}
 }

}finally{rmSync(exposure,{force:true});rmSync(candidateExposure,{force:true});rmSync(temporary,{recursive:true,force:true})}
