import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,rmSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
const root=resolve(import.meta.dirname,'../../../../..')
const baselineRoot=process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT??'/workspace/typescript/hapsland-bend-baseline-compatible-4843e8d1'
const sourcePath=resolve(baselineRoot,'packages/source-analysis/dist/direct-event/languages/typescript-functions.js')
const exposure=resolve(dirname(sourcePath),`.declaration-native-${process.pid}.mjs`)
const artifact=process.env.HAPSLAND_DECLARATION_ARTIFACT??resolve(root,'packages/agent-flow-bend/dist/declaration-policy.generated.js')
let cases=0,exceptionCases=0
try{
 writeFileSync(exposure,readFileSync(sourcePath,'utf8')+'\nexport {collectFunctionFact,collectArrowFact,collectTypeFact,typeDeclarationKind};\n')
 const native=await import(pathToFileURL(exposure)),api=await import(pathToFileURL(artifact))
 const staged={
  function:(node,state)=>{const identifier=node.namedChildren.find(child=>child.type==='identifier');const body=node.namedChildren.find(child=>child.type==='statement_block');if(!api.declarationNativeFunctionAdmission(identifier,body,state))return false;void node.parent},
  arrow:(root,state)=>{const name=root.name.text;if(!api.declarationNativeArrowAdmission(name,state))return false;void root.declaration.parent},
  type:(node,state)=>{const identifier=node.namedChildren.find(child=>child.type==='type_identifier');if(!api.declarationNativeTypeAdmission(identifier,state))return false;void node.parent}
 }
 function execute(family,fn,bits,throwAt=Infinity){
  const trace=[];const touch=(name,value)=>{trace.push(name);if(trace.length===throwAt)throw Error('injected');return value}
  const identifier={get type(){return touch('identifier.type',family==='type'?'type_identifier':'identifier')},get text(){return touch('identifier.text','X')}}
  const body={get type(){return touch('body.type','statement_block')}}
  const present=family==='arrow'?true:bits[0],bodyPresent=family==='function'?bits[1]:false
  const children=[...(present?[identifier]:[]),...(bodyPresent?[body]:[])]
  const node={get namedChildren(){return touch('node.children',children)},get parent(){touch('continuation');throw Error('continuation')}}
  const offset=family==='function'?2:family==='type'?1:0
  const state={}
  for(const [index,key] of (family==='type'?['types','imports']:['functions','imports','otherTopLevelBindings']).entries())
   Object.defineProperty(state,key,{get(){return touch('state.'+key,{has:name=>touch(key+'.has:'+name,bits[offset+index])})}})
  const arg=family==='arrow'?{get name(){return touch('root.name',identifier)},get declaration(){return touch('root.declaration',node)}}:node
  let result,error
  try{result=fn(arg,state)}catch(e){error=e.message}
  return{trace,result,error}
 }
 for(const [family,arity,fn] of [['function',5,native.collectFunctionFact],['arrow',3,native.collectArrowFact],['type',3,(node,state)=>native.collectTypeFact(node,'interface',state)]]){
  for(let value=0;value<2**arity;value++){
   const bits=Array.from({length:arity},(_,axis)=>Boolean(value&(1<<axis)))
   const expected=execute(family,fn,bits)
   assert.deepEqual(execute(family,staged[family],bits),expected);cases++
   for(let at=1;at<=expected.trace.length;at++){assert.deepEqual(execute(family,staged[family],bits,at),execute(family,fn,bits,at));exceptionCases++}
  }
 }
 for(const interfaceSyntax of [false,true])for(const aliasSyntax of [false,true]){
  const run=fn=>{let reads=0;const trace=[];const node={get type(){trace.push('type');return ++reads===1?(interfaceSyntax?'interface_declaration':'other'):(aliasSyntax?'type_alias_declaration':'other')}};return{result:fn(node),trace}}
  assert.deepEqual(run(api.declarationNativeTypeKind),run(native.typeDeclarationKind));cases++
 }
 const record={passed:true,cases,exceptionCases,scope:'actual compiled native function/arrow/type admission prefixes against generated binders with exact read traces; source materialization is stopped at first parent read by sentinel; injected exceptions at every prefix event; dynamic type-kind reads cover four conditional cases; no complete collector/root-result/parser/Map-write proof'}
 writeFileSync(resolve(root,'evidence/bend-strangler/declaration-host-falsification.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(exposure,{force:true})}
