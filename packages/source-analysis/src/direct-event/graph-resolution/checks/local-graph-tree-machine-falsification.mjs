import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const temporary=mkdtempSync(join(tmpdir(),'hapsland-tree-machine-'))
const source='../../local-graph-draft/core.',boundary='../../local-graph-draft/BOUNDARY.'
const list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
const unlist=xs=>{const result=[];while(xs.$==='Con'){result.push(xs.head);xs=xs.tail}assert.equal(xs.$,'Nil');return result}
const plain=x=>{if(typeof x==='number')return BigInt(x);if(x===null||typeof x!=='object')return x;if(Array.isArray(x))return x.map(plain);return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,k==='$'?v.slice(v.lastIndexOf('.')+1):plain(v)]))}
const entries=d=>{const result=[];while(d.$==='Own.DCon'){result.push([d.key,d.value]);d=d.rest}assert.equal(d.$,'Own.DNil');return result}
const names=['','A','B','type:A','function:A','type:type:A','a\0b','a','b\0c','é','e\u0301','😀','\ud800']
let cases=0,invalidRegistries=0,checks=0
try{
 const emitted=join(temporary,'model.mjs')
 execFileSync('bend',[resolve(import.meta.dirname,'local-graph-representation-prototypes/list-state/TREE_MACHINE_CANARY.bend'),'-o',emitted],{timeout:5000})
 const all=(await import(pathToFileURL(emitted))).default
 const c={...all,...Object.fromEntries(Object.entries(all).filter(([key])=>key.startsWith('BOUNDARY_ENCODING.')).map(([key,value])=>[key.slice('BOUNDARY_ENCODING.'.length),value]))}
 for(let seed=0;seed<384;seed++){
  const tag=(name,fields={})=>({$:source+name,...fields}),aware=seed%2===0,path=names[seed%names.length],query=names[(seed+1)%names.length]
  const expected=tag(['AnyKind','TypeKind','FunctionKind'][seed%3])
  const decl=(n,handle)=>tag('Declaration',{handle,identity:names[(handle+seed)%names.length],function:handle%3!==0,bundled:handle%2===0,references:list(names.slice(0,6).map((name,i)=>tag('Reference',{kind:tag(i===4?'Unsupported':'Named'),name,expected:tag(['AnyKind','TypeKind','FunctionKind'][i%3]),target:i%3===0?{$:'Some',value:names[(i+seed)%names.length]}:{$:'None'}})))})
  const keys=[query,'type:'+query,'function:'+query,query,'type:'+query,...names.slice(0,5)]
  const records=keys.map((key,i)=>({$:boundary+'DeclarationEntry',key,declaration:decl(key,i+1)}))
  const bindings=[query,'A','B',query].map((key,i)=>({$:boundary+'ImportEntry',key,binding:tag('ImportBinding',{path:names[(i+seed)%names.length],name:names[(i+seed+2)%names.length],type_only:i%2===0})}))
  const support=[names[seed%names.length],names[(seed+1)%names.length],names[seed%names.length]].map((key,i)=>({$:boundary+'DeclarationEntry',key,declaration:decl(key,20+i)}))
  const facts={$:boundary+'BoundaryFacts',kind_aware:aware,declarations:list(records),imports:list(bindings),supporting:list(support)}
  const targetRecords=[{$:boundary+'PathTargetsEntry',path,targets:list(['prior','prior',query])},{$:boundary+'PathTargetsEntry',path:'empty',targets:list([])},{$:boundary+'PathTargetsEntry',path,targets:list(seed%4?['other']:[])}]
  const state={$:boundary+'BoundaryState',visited:list(seed%3?['prior','prior',names[seed%names.length]]:[]),targets:list(targetRecords),limits:tag('LocalLimits',{work:seed%15,depth:seed%5,targets:seed%7}),max_targets:seed%8,work:seed%19,graph_work:seed%4,max_depth:seed%6}
  const input={$:'BOUNDARY_ENCODING.Input',facts,state,path,name:query,expected,depth:seed%4}
  const encoded=c.encode_boundary(input);assert.equal(plain(encoded).$,'Encoded');cases++
  assert.deepEqual(c.decode(encoded),c.source_view(input));checks++
  const registry=unlist(encoded.names),text=id=>{const index=Number(id);assert.ok(index>0&&index<=registry.length,'unassigned ID escaped complete boundary encoding');checks++;return registry[index-1]}
  assert.deepEqual(registry,[...new Set(unlist(c.input_strings(input)))]);assert.equal(c.all_present(c.input_strings(input),encoded.names),true);checks+=2
  assert.equal(c.all_present(c.input_strings(input),c['REGISTRY_RELATION.collect'](c.input_strings(input),list(['prior','prior']))),true);checks++
  for(const name of registry){const id=c.identity(encoded.names,name);assert.ok(id>0n&&id<=BigInt(registry.length));assert.deepEqual(c['REGISTRY_RELATION.decode'](encoded.names,id),{$:'Some',value:name});assert.equal(c.text(encoded.names,id),name);checks+=3}
  for(const valid of [false,true]){assert.equal(c.is_encoded(c.encode_if(valid,encoded.names,input)),valid);checks++}
  assert.equal(plain(c.encode_with_registry(list([]),input)).$,'MissingRegistry');invalidRegistries++
  assert.equal(plain(c.encode_with_registry(list([...registry,registry[0]]),input)).$,'MissingRegistry');invalidRegistries++
  const extended=c.encode_with_registry(list(['unused',...registry.filter(s=>s!=='unused')]),input);assert.equal(plain(extended).$,'Encoded');assert.deepEqual(c.decode(extended),c.source_view(input));checks+=2
  for(const kind of ['AnyKind','TypeKind','FunctionKind'])for(const aware of [false,true]){assert.equal(c.text(encoded.names,c['core.lookup_key'](aware,{$:'core.'+kind},c.label(encoded.names,query))),c[source+'lookup_key'](aware,tag(kind),query));checks++}
  const decodeReference=r=>{const p=plain(r);const name=text(p.name.key);assert.equal(text(p.name.type_key),'type:'+name);assert.equal(text(p.name.function_key),'function:'+name);checks+=2;return {...p,name,target:p.target.$==='Some'?{$:'Some',value:text(p.target.value)}:p.target}}
  const decodeDecl=d=>({...plain(d),identity:text(d.identity),references:list(unlist(d.references).map(decodeReference))})
  const sourceFacts=c[boundary+'facts'](facts)
  for(const [field,records] of [['declarations',keys],['supporting',support.map(x=>x.key)]]){
   const actual=entries(encoded.facts[field]);assert.equal(actual.length,new Set(records).size);checks++
   for(const [id,v] of actual){const key=text(id),expectedValue=unlist(facts[field]).filter(record=>record.key===key).at(-1).declaration
    assert.deepEqual(decodeDecl(v.value),plain(expectedValue));checks++
   }
  }
  for(const [id,v] of entries(encoded.facts.imports)){const key=text(id),binding=c[source+'import_lookup'](sourceFacts,key).value
   assert.equal(text(v.value.path),binding.path);assert.equal(text(v.value.name),binding.name);assert.equal(v.value.type_only,binding.type_only);assert.equal(text(v.value.composite),c[source+'import_target_key'](path,binding));checks+=4
  }
  const decodeVisited=d=>c[boundary+'identities'](list(entries(d).map(([id])=>text(id))))
  const decodeTargets=d=>c[boundary+'targets'](list(entries(d).map(([id,targets])=>({$:boundary+'PathTargetsEntry',path:text(id),targets:list(entries(targets).map(([key])=>text(key)))}))))
  assert.deepEqual(decodeVisited(encoded.visited),c[boundary+'state_visited'](state));assert.deepEqual(decodeTargets(encoded.budget.targets_by_path),c[boundary+'state_budget'](state).targets_by_path);checks+=2
  const original=c[source+'plan'](sourceFacts,path,query,expected,c[boundary+'state_visited'](state),c[boundary+'state_budget'](state),input.depth)
  const actual=c['core.plan'](encoded.facts,encoded.path,encoded.name,encoded.expected,encoded.visited,encoded.budget,encoded.depth)
  const observed=c.encoded_core(encoded),recursive=c.encoded_recursive(encoded)
  assert.notEqual(plain(observed).$,'Failed');assert.notEqual(plain(recursive).$,'Failed');assert.deepEqual(recursive,observed,'whole independent numeric tree/flatten observation differs');checks+=3
  assert.notEqual(plain(actual).$,'InvariantFailure');assert.notEqual(plain(original).$,'InvariantFailure');checks+=2
  const budget=b=>({...plain(b),targets_by_path:decodeTargets(b.targets_by_path)})
  const decodePending=p=>{const x=plain(p);return {...x,from:text(x.from),symbol:text(x.symbol),name:text(x.name),target:x.target.$==='Imported'?{...x.target,path:text(x.target.path),name:text(x.target.name)}:x.target}}
  const decodeSlot=p=>{const x=plain(p),r=x.reference;return {...x,symbol:text(x.symbol),reference:r.$==='Included'?{...r,identity:text(r.identity)}:r.$==='Omitted'?{...r,target_name:text(r.target_name)}:r}}
  const result=plain(actual),decoded=result.$==='MissingRoot'?{...result,visited:decodeVisited(actual.visited),budget:budget(actual.budget)}:{...result,plan:{...result.plan,references:list(unlist(actual.plan.references).map(decodeSlot)),pending:list(unlist(actual.plan.pending).map(decodePending)),visited:decodeVisited(actual.plan.visited),budget:budget(actual.plan.budget)}}
  assert.deepEqual(decoded,plain(original),'complete flat plan, queues, handles or exact BaseMap state differs');checks++
  const stringRecursive=plain(c.string_recursive(input)),expectedRecursive=plain(original).$==='MissingRoot'?{$:'Absent',visited:plain(original.visited),budget:plain(original.budget)}:{$:'Present',plan:plain(original.plan)}
  assert.deepEqual(stringRecursive,expectedRecursive,'original independent String recursive specification differs');checks++
 }
 let random=91671,rawCases=0,expandedNodes=0,rawPending=0,continuationCases=0,continuationSteps=0,requestCases=0,requestRuns=0,priorVisitedRoots=0
 const draw=n=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random%n}
 const tag=(name,fields={})=>({$:'core.'+name,...fields}),nil=()=>({$:'Own.DNil'}),none=()=>({$:'None'}),some=value=>({$:'Some',value})
 const dict=xs=>xs.reduceRight((rest,[key,value],index)=>({$:'Own.DCon',key,value,rest,count:index%3===0?99:0}),nil())
 const label=key=>tag('Label',{key,type_key:draw(24),function_key:draw(24)})
 const kind=()=>tag(['AnyKind','TypeKind','FunctionKind'][draw(3)])
 const reference=()=>tag('Reference',{kind:tag(draw(5)?'Named':'Unsupported'),name:label(draw(24)),expected:kind(),target:draw(5)?none():some(draw(12))})
 for(let trial=0;trial<512;trial++){
  const records=Array.from({length:1+draw(24)},(_,i)=>[draw(24),draw(7)?some(tag('Declaration',{handle:i,identity:draw(12),function:!!draw(2),bundled:!!draw(2),references:list(Array.from({length:draw(9)},reference))})):none()])
  const facts=tag('Facts',{kind_aware:!!draw(2),declarations:dict(records),supporting:dict(records.map(([key,value])=>[key%12,value])),imports:dict(Array.from({length:draw(12)},()=>[draw(24),draw(5)?some(tag('ImportBinding',{path:draw(12),name:draw(24),type_only:!!draw(2),composite:draw(24)})):none()]))})
  const visited=dict(Array.from({length:draw(8)},()=>[draw(12),!!draw(2)])),budget=tag('Budget',{limits:tag('LocalLimits',{work:trial%3?1000:draw(12),depth:trial%3?1000:draw(5),targets:trial%3?1000:draw(12)}),targets_by_path:dict([[7,dict(Array.from({length:draw(8)},()=>[draw(24),true]))],[7,nil()],[9,nil()]]),max_targets:draw(8),work:draw(4),graph_work:draw(4),max_depth:draw(4)})
  const query=trial%5?tag('Label',{key:records[0][0],type_key:records[0][0],function_key:records[0][0]}):label(25),expected=kind(),depth=draw(4)
  const production=c['TREE_MACHINE_RELATION.core_observation'](facts,7,query,expected,visited,budget,depth),recursive=c['TREE_MACHINE_RELATION.recursive_observation'](facts,7,query,expected,visited,budget,depth)
  assert.notEqual(plain(production).$,'Failed');assert.notEqual(plain(recursive).$,'Failed');assert.deepEqual(recursive,production,'raw numeric whole observation differs');checks+=3;rawCases++
  assert.deepEqual(c['TREE_MACHINE_CONTINUATION.initial'](facts,7,query,expected,visited,budget,depth),recursive,'initial whole stack/tree observation differs');checks++
  if(trial<128){
   let machine=tag('Machine',{facts,path:7,frames:list(Array.from({length:draw(5)},(_,i)=>tag('Frame',{owner:i,depth:draw(6),index:draw(8),remaining:list(Array.from({length:draw(7)},reference))}))),visited,budget,next_node:5,nodes_rev:list([tag('PlannedNode',{node:2,artifact:44}),tag('PlannedNode',{node:0,artifact:33})]),references_rev:list([tag('ReferenceSlot',{owner:0,index:0,symbol:3,reference:tag('Included',{identity:8})})]),pending_rev:list([])})
   const before=c['TREE_MACHINE_CONTINUATION.observe'](machine);assert.notEqual(plain(before).$,'Failed');checks++;continuationCases++
   assert.deepEqual(c['TREE_MACHINE_RELATION.observe_core'](c['core.run'](c['RANK.rank'](machine),machine)),before,'whole raw run/continuation differs');checks++
   for(let step=0;step<12&&!c['core.done'](machine);step++){
    const next=c['core.step'](machine);assert.deepEqual(c['TREE_MACHINE_CONTINUATION.observe'](next),c['TREE_MACHINE_CONTINUATION.observe'](machine),'actual full step changes independent continuation');checks++;continuationSteps++;machine=next
   }
   if(c['core.done'](machine)){assert.deepEqual(c['TREE_MACHINE_RELATION.observe_core']({$:'core.CompletePlan',plan:c['core.finish'](machine)}),c['TREE_MACHINE_CONTINUATION.observe'](machine),'whole terminal observation differs');checks++}
  }
  if(plain(production).$==='Present'){expandedNodes+=unlist(production.plan.nodes).length;rawPending+=unlist(production.plan.pending).length}
  const measure=name=>c['NUMERIC_SPEC_RANK.'+name]
  assert.ok(measure('root_rank')(facts,query,expected,visited)<=c['TREE_MACHINE_RELATION.spec_bound'](facts));checks++
  const selected=c['NUMERIC_SPEC.find_declaration'](facts,query,expected)
  if(selected.$==='Some'&&c['Own.contains'](visited,selected.value.identity))priorVisitedRoots++
  const specState={$:'NUMERIC_SPEC.State',visited,budget,next_address:5,pending_rev:list([])}
  for(const request of [{$:'NUMERIC_SPEC.Request',facts,path:7,name:query,expected,depth,state:specState},{$:'NUMERIC_SPEC.ReferencesRequest',items:list(Array.from({length:draw(9)},reference)),facts,path:7,owner:2,index:3,depth,state:specState}]){
   const fuel=measure('request_rank')(request);requestCases++
   for(const budgetFuel of [0n,1n,2n,fuel]){
    const result=c['NUMERIC_SPEC.interpret'](budgetFuel,request),after=measure('visited')(measure('result_state')(result));requestRuns++
    if(budgetFuel===fuel){assert.equal(measure('successful')(result),true);checks++}
    for(let id=0;id<12;id++)if(c['Own.contains'](visited,id)){assert.equal(c['Own.contains'](after,id),true);checks++}
    assert.ok(measure('unseen')(facts,after)<=measure('unseen')(facts,visited));checks++
   }
  }

 }
 assert.ok(expandedNodes>256&&rawPending>0,'raw full traversal coverage insufficient')
 const sourceHashes=Object.fromEntries(['NUMERIC_SPEC.bend','TREE_MACHINE_RELATION.bend','TREE_MACHINE_CONTINUATION.bend','TREE_MACHINE_LAWS.bend','TREE_MACHINE_CONTINUATION_LAWS.bend','NUMERIC_SPEC_RANK.bend','NUMERIC_SPEC_RANK_LAWS.bend'].map(name=>[name,createHash('sha256').update(readFileSync(resolve(import.meta.dirname,'local-graph-representation-prototypes/list-state',name))).digest('hex')]))
 const record={passed:true,sourceHashes,cases,rawCases,expandedNodes,rawPending,continuationCases,continuationSteps,requestCases,requestRuns,priorVisitedRoots,checks,invalidRegistries,scope:'complete emitted numeric core versus independent adapted recursive numeric DFS and full flatten, plus unchanged String core versus unchanged independent String recursive specification;384 full ordered boundary/state fixtures including duplicate records, collisions and over-limit counters; exact full nodes/slots/pending/handles/visited/budget; finite evidence only, 512 additional raw numeric fact/state cases with duplicate keys, inconsistent caches, aliased Label alternatives and raw import composite IDs; 128 arbitrary raw machines with actual whole step/run versus independent whole-stack continuation; 1024 raw root/reference requests with fuel0/1/2/independent rank, full success and prior-membership preservation; not universal simulation, production host codec, connected performance or adoption'}
 writeFileSync(resolve(import.meta.dirname,'local-graph-tree-machine-falsification.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(temporary,{recursive:true,force:true})}
