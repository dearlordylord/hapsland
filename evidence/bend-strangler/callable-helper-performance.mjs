import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {performance} from 'node:perf_hooks'
const root=resolve(import.meta.dirname,'../..')
const baselineRoot=process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT??'/workspace/typescript/hapsland-bend-baseline-master-5726758e'
const policy=await import(pathToFileURL(root+'/packages/canonical-policy/dist/canonical/callable-adapter.js'))
const lanes={}
for(const [name,laneRoot] of Object.entries({typescript:baselineRoot,integratedBend:root})){
 const source=readFileSync(laneRoot+'/packages/source-analysis/dist/direct-event/languages/typescript-functions.js','utf8')
 const start=source.indexOf('const effectWrapper ='),end=source.indexOf('/** Same callable classification',start)
 assert.ok(start>=0&&end>start)
 lanes[name]=new Function(...Object.keys(policy),source.slice(start,end)+';return {effectWrapper,callableValue,constCallable}')(...Object.values(policy))
}
const native=lanes.typescript,candidate=lanes.integratedBend,fixtures=[]
const compare=(method,args)=>{
 const expected=native[method](...args),actual=candidate[method](...args)
 if(method==='constCallable'&&expected!==undefined){assert.ok(actual!==undefined);for(const key of ['name','callable','declaration'])assert.equal(actual[key],expected[key])}else assert.equal(actual,expected)
 fixtures.push({method,args,expected});return expected
}
const node=(type,fields={},namedChildren=[],text='')=>({type,text,namedChildren,childForFieldName:name=>fields[name]??null})
const temporary=mkdtempSync(join(tmpdir(),'hapsland-callable-native-'))
try{
 const out=join(temporary,'core.mjs');execFileSync('bend',[root+'/packages/agent-flow-bend/callable-policy/core.bend','-o',out],{timeout:5000})
 const core=(await import(pathToFileURL(out))).default
 let cases=0
 const bindings=[{kind:'NamedEffect',binding:{path:'effect',name:'Effect'}},{kind:'EffectNamespace',binding:{path:'effect/Effect',name:'*'}},{kind:'OtherImport',binding:{path:'other',name:'Effect'}},{kind:'OtherImport',binding:{path:'effect',name:'Other'}},{kind:'OtherImport',binding:{path:'effect/Effect',name:'Effect'}}]
 const member=(method,identifier=true)=>node('member_expression',{object:node(identifier?'identifier':'other',{},[],'Alias'),property:node('property_identifier',{},[],method)})
 for(const {kind,binding} of bindings)for(const typeOnly of [false,true]){
  const imports=new Map([['Alias',{...binding,typeOnly}]])
  assert.equal(core.runtime_import({$:kind},typeOnly),compare('effectWrapper',[member('fn'),imports]));cases++
 }
 const imports=new Map([['Alias',{path:'effect',name:'Effect',typeOnly:false}]])
 for(const types of [false,true])for(const identifier of [false,true])for(const binding of [false,true])for(const method of ['fn','fnUntraced','other'])for(const invoked of [false,true])for(const label of [false,true]){
  const selected=member(method,identifier)
  const callee=invoked?node('call_expression',{function:selected,arguments:node('arguments',{},label?[node('string')]:[])},types?[node('type_arguments')]:[]):node('member_expression',selected,types?[node('type_arguments')]:[])
  // Bare callee fields must be supplied through the exact native AST access port.
  if(!invoked)callee.childForFieldName=selected.childForFieldName
  const actual=compare('effectWrapper',[callee,binding?imports:new Map()])
  assert.equal(core.wrapper(types,identifier,binding,{$:method==='fn'?'Fn':method==='fnUntraced'?'FnUntraced':'OtherMethod'},invoked,label),actual);cases++
 }
 for(const kind of ['arrow_function','function_expression','generator_function','other']){
  const body=node(kind),value=node('call_expression',{function:member('fn'),arguments:node('arguments',{},[body])})
  const eligible=compare('callableValue',[value,imports])===body
  assert.equal(core.inline_body({$:{arrow_function:'Arrow',function_expression:'FunctionExpression',generator_function:'GeneratorFunction',other:'OtherBody'}[kind]}),eligible);cases++
 }
 for(const kind of ['DirectArrow','WrapperCall','OtherValue'])for(const types of [false,true])for(const wrapper of [false,true])for(const one of [false,true])for(const bodyEligible of [false,true]){
  const body=node(bodyEligible?'arrow_function':'other'),value=node(kind==='DirectArrow'?'arrow_function':kind==='WrapperCall'?'call_expression':'function_expression',{function:member(wrapper?'fn':'other'),arguments:node('arguments',{},one?[body]:[])},types?[node('type_arguments')]:[])
  const actual=compare('callableValue',[value,imports])
  const plan=actual===value?'Self':actual===body?'InlineArgument':'Reject'
  assert.equal(core.callable_value({$:kind},types,wrapper,one,bodyEligible).$,plan);cases++
 }
 for(const lexical of [false,true])for(const one of [false,true])for(const identifier of [false,true])for(const callable of [false,true]){
  const name=node(identifier?'identifier':'object_pattern'),value=node(callable?'arrow_function':'function_expression'),declarator=node('variable_declarator',{name,value}),declaration=node('lexical_declaration',{},one?[declarator]:[declarator,declarator],lexical?'const x = value':'let x = value')
  const actual=compare('constCallable',[declaration,imports])
  assert.equal(core.const_callable(lexical,one,identifier,callable),actual!==undefined)
  if(actual){assert.equal(actual.name,name);assert.equal(actual.callable,value);assert.equal(actual.declaration,declaration)}cases++
 }
 const consume=(fixture,value)=>{
  if(fixture.expected===undefined)return value===undefined?1:0
  if(fixture.method==='constCallable')return Number(value.name===fixture.expected.name)+Number(value.callable===fixture.expected.callable)+Number(value.declaration===fixture.expected.declaration)
  return Number(value===fixture.expected)+1
 }
 fixtures.splice(0,fixtures.length,...fixtures.filter(x=>x.method===process.env.HAPSLAND_CALLABLE_HELPER))
 const sites=[0,1].map(()=>new Function('fixtures','consume','return(lane)=>{let sum=0;for(let round=0;round<20000;round++)for(const fixture of fixtures)sum+=consume(fixture,lane[fixture.method](...fixture.args));return sum}')(fixtures,consume))
 const samples={typescript:[],integratedBend:[]},cpuSamples={typescript:[],integratedBend:[]},startedAt=new Date().toISOString();let checksum
 for(let pair=0;pair<22;pair++){
  const order=Object.entries(lanes);if(pair%2)order.reverse()
  for(const [name,lane] of order){let seconds=0,cpuSeconds=0;for(const site of sites){const cpu=process.cpuUsage(),start=performance.now(),actual=site(lane),used=process.cpuUsage(cpu);seconds+=(performance.now()-start)/1000;cpuSeconds+=(used.user+used.system)/1e6;checksum??=actual;assert.equal(actual,checksum)}if(pair>=5){samples[name].push(seconds);cpuSamples[name].push(cpuSeconds)}}
 }
 const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length,ratio=mean(samples.integratedBend)/mean(samples.typescript)
 const result={startedAt,at:new Date().toISOString(),baselineRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:baselineRoot,encoding:'utf8'}).trim(),fixtures:fixtures.length,rounds:20000,callers:2,warmupPairs:5,measuredPairs:17,samples,cpuSamples,checksum,meanRatio:ratio,cpuRatio:mean(cpuSamples.integratedBend)/mean(cpuSamples.typescript),executionParity:ratio<=1,scope:'actual compiled private callable classification helpers and actual checked ABI, controlled plain AST/binding fields; both implementations through two identical independent shared callers, alternating pairs, pinned Bun CPU11 nonexclusive; original node identity and all result fields consumed; real parser/physical IO excluded'}
 writeFileSync(root+'/evidence/bend-strangler/callable-diagnostic-'+process.env.HAPSLAND_CALLABLE_HELPER+'.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{rmSync(temporary,{recursive:true,force:true})}
