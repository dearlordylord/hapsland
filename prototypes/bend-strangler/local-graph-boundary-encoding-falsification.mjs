import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const temporary=mkdtempSync(join(tmpdir(),'hapsland-boundary-encoding-'))
const source='../../local-graph-draft/core.',boundary='../../local-graph-draft/BOUNDARY.'
const list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
const unlist=xs=>{const result=[];while(xs.$==='Con'){result.push(xs.head);xs=xs.tail}assert.equal(xs.$,'Nil');return result}
const plain=x=>{if(typeof x==='number')return BigInt(x);if(x===null||typeof x!=='object')return x;if(Array.isArray(x))return x.map(plain);return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,k==='$'?v.slice(v.lastIndexOf('.')+1):plain(v)]))}
const entries=d=>{const result=[];while(d.$==='Own.DCon'){result.push([d.key,d.value]);d=d.rest}assert.equal(d.$,'Own.DNil');return result}
const names=['','A','B','type:A','function:A','type:type:A','a\0b','a','b\0c','é','e\u0301','😀','\ud800']
let cases=0,invalidRegistries=0,checks=0
try{
 const emitted=join(temporary,'model.mjs')
 execFileSync('bend',[resolve(import.meta.dirname,'local-graph-representation-prototypes/list-state/BOUNDARY_ENCODING.bend'),'-o',emitted],{timeout:5000})
 const c=(await import(pathToFileURL(emitted))).default
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
  const input={$:'Input',facts,state,path,name:query,expected,depth:seed%4}
  const encoded=c.encode_boundary(input);assert.equal(encoded.$,'Encoded');cases++
  assert.deepEqual(c.decode(encoded),c.source_view(input));checks++
  const registry=unlist(encoded.names),text=id=>{const index=Number(id);assert.ok(index>0&&index<=registry.length,'unassigned ID escaped complete boundary encoding');checks++;return registry[index-1]}
  assert.deepEqual(registry,[...new Set(unlist(c.input_strings(input)))]);assert.equal(c.all_present(c.input_strings(input),encoded.names),true);checks+=2
  assert.equal(c.all_present(c.input_strings(input),c['REGISTRY_RELATION.collect'](c.input_strings(input),list(['prior','prior']))),true);checks++
  for(const name of registry){const id=c.identity(encoded.names,name);assert.ok(id>0n&&id<=BigInt(registry.length));assert.deepEqual(c['REGISTRY_RELATION.decode'](encoded.names,id),{$:'Some',value:name});assert.equal(c.text(encoded.names,id),name);checks+=3}
  for(const valid of [false,true]){assert.equal(c.is_encoded(c.encode_if(valid,encoded.names,input)),valid);checks++}
  assert.equal(c.encode_with_registry(list([]),input).$,'MissingRegistry');invalidRegistries++
  assert.equal(c.encode_with_registry(list([...registry,registry[0]]),input).$,'MissingRegistry');invalidRegistries++
  const extended=c.encode_with_registry(list(['unused',...registry.filter(s=>s!=='unused')]),input);assert.equal(extended.$,'Encoded');assert.deepEqual(c.decode(extended),c.source_view(input));checks+=2
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
  assert.notEqual(plain(actual).$,'InvariantFailure');assert.notEqual(plain(original).$,'InvariantFailure');checks+=2
  const budget=b=>({...plain(b),targets_by_path:decodeTargets(b.targets_by_path)})
  const decodePending=p=>{const x=plain(p);return {...x,from:text(x.from),symbol:text(x.symbol),name:text(x.name),target:x.target.$==='Imported'?{...x.target,path:text(x.target.path),name:text(x.target.name)}:x.target}}
  const decodeSlot=p=>{const x=plain(p),r=x.reference;return {...x,symbol:text(x.symbol),reference:r.$==='Included'?{...r,identity:text(r.identity)}:r.$==='Omitted'?{...r,target_name:text(r.target_name)}:r}}
  const result=plain(actual),decoded=result.$==='MissingRoot'?{...result,visited:decodeVisited(actual.visited),budget:budget(actual.budget)}:{...result,plan:{...result.plan,references:list(unlist(actual.plan.references).map(decodeSlot)),pending:list(unlist(actual.plan.pending).map(decodePending)),visited:decodeVisited(actual.plan.visited),budget:budget(actual.plan.budget)}}
  assert.deepEqual(decoded,plain(original),'complete flat plan, queues, handles or exact BaseMap state differs');checks++
 }
 const record={passed:true,cases,checks,invalidRegistries,scope:'entire emitted Bend ordered boundary encoding and numeric planner versus unchanged String planner; duplicate last-write declaration/import/support/path records, empty sets, alias identities, prefix/NUL/Unicode collisions and over-limit prior counters; exact reconstructed BaseMap values and full flat output; finite evidence only, not universal correspondence, actual host UTF16 codec, independent recursive proof, connected performance or adoption'}
 writeFileSync(resolve(import.meta.dirname,'local-graph-boundary-encoding-falsification.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(temporary,{recursive:true,force:true})}
