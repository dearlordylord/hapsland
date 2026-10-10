import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const temporary=mkdtempSync(join(tmpdir(),'hapsland-registry-'))
const list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
const unlist=xs=>{const result=[];while(xs.$==='Con'){result.push(xs.head);xs=xs.tail}assert.equal(xs.$,'Nil');return result}
try{
 const emitted=join(temporary,'registry.mjs')
 execFileSync('bend',[resolve(import.meta.dirname,'local-graph-representation-prototypes/list-state/REGISTRY_RELATION.bend'),'-o',emitted],{timeout:5000})
 const c=(await import(pathToFileURL(emitted))).default
 const values=['','x','type:x','function:x','type:type:x','a\0b','a\0b\0c','a','b','c','é','e\u0301','😀','\ud800','\udc00']
 let seed=17877;const draw=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n}
 let checks=0
 for(const equal of [false,true])for(const found of [{$:'None'},{$:'Some',value:0n},{$:'Some',value:17n}]){
  assert.equal(c.is_missing(c.increment(found)),c.is_missing(found));checks++
  const missing=c.increment(c.find_step(equal,()=>found)).$==='None'
  if(missing){assert.equal(equal,false);assert.equal(c.increment(found).$,'None');checks+=2}
 }
 for(let trial=0;trial<256;trial++){
  const names=Array.from({length:draw(24)},()=>values[draw(values.length)]),raw=list(names),added=values[draw(values.length)]
  for(let index=0;index<names.length+3;index++){
   const selected=c.get(raw,index)
   if(selected.$==='Some'){assert.ok(index<names.length);assert.equal(c.decode(raw,index+1).value,selected.value);checks+=2}
  }
  for(const value of values){
   if(names.length&&names[0]!==value&&c.present(raw,value)){assert.equal(c.present(list(names.slice(1)),value),true);checks++}
   if(names.length&&c.encode(list(names.slice(1)),names[0]).$==='None'){
    const selected=c.encode(list(names.slice(1)),value)
    if(selected.$==='Some'){assert.equal(names[0]===value,false);assert.equal(c.encode(raw,value).value,selected.value+1n);checks+=2}
   }
   const found=c.encode(raw,value),position=names.indexOf(value)
   const zeroBased=c.find(raw,value),appended=c.find(list([...names,added]),value),expectedAppend=position>=0?{$:'Some',value:BigInt(position)}:added===value?{$:'Some',value:BigInt(names.length)}:{$:'None'}
   assert.deepEqual(appended,expectedAppend);assert.deepEqual(c.increment(zeroBased),found);assert.equal(c.get(list([...names,added]),names.length).value,added);checks+=3
   assert.equal(found.$,position<0?'None':'Some');checks++
   if(position>=0){assert.equal(found.value,BigInt(position+1));assert.ok(found.value>0n&&found.value<=BigInt(names.length));checks++;assert.equal(c.decode(raw,found.value).value,value);assert.deepEqual(c.encode(list([...names,added]),value),found);checks+=3}
   const interned=c.intern(raw,value),after=c.names_of(interned),identity=c.id_of(interned)
   assert.equal(c.decode(after,identity).value,value);assert.deepEqual(c.encode(after,value),{$:'Some',value:identity});checks+=2
   if(position>=0){assert.deepEqual(unlist(after),names);assert.equal(identity,BigInt(position+1));checks+=2}
   for(const previous of names){assert.deepEqual(c.encode(after,previous),c.encode(raw,previous));checks++}
  }
  for(const query of values){
   const absent=c.encode(raw,query).$==='None'
   if(absent){assert.equal(c.is_missing(c.encode(raw,query)),true);checks++
    if(names.length){assert.equal(c.encode(list(names.slice(1)),query).$,'None');assert.equal(query===names[0],false);checks+=2}
    if(added!==query){assert.equal(c.encode(list([...names,added]),query).$,'None');checks++}
   }
   if(c.unique(raw)&&absent){assert.equal(c.unique(list([...names,query])),true);checks++}
   if(names.length&&c.encode(list(names.slice(1)),names[0]).$==='None'&&absent&&c.unique(list([...names.slice(1),query]))){assert.equal(c.unique(list([...names,query])),true);checks++}
  }
  const constructed=c.registry(raw);assert.equal(c.unique(constructed),true);assert.deepEqual(unlist(constructed),[...new Set(names)]);checks+=2
  for(const found of [{$:'None'},{$:'Some',value:0},{$:'Some',value:77}]){const after=c.names_of(c.intern_select(found,raw,added));for(const previous of names){assert.deepEqual(c.encode(after,previous),c.encode(raw,previous));checks++}}
  for(const value of values){assert.equal(c.unique(c.names_of(c.intern(constructed,value))),true);checks++}
  const uniqueNames=unlist(constructed)
  for(let identity=1;identity<=uniqueNames.length;identity++){
   const decoded=c.decode(constructed,identity)
   assert.deepEqual(c.encode(constructed,decoded.value),{$:'Some',value:BigInt(identity)});checks++
  }
  const items=Array.from({length:draw(24)},()=>values[draw(values.length)]),collected=c.collect(list(items),raw)
  for(const previous of names){assert.deepEqual(c.encode(collected,previous),c.encode(raw,previous));checks++}
  for(const value of items){assert.equal(c.present(collected,value),true);checks++}
  const headCollected=c.collect(list(items),c.names_of(c.intern(raw,added)));assert.equal(c.present(headCollected,added),true);checks++
  for(const query of values){if(c.present(list([added,...items]),query)){assert.equal(c.present(c.collect(list([added,...items]),raw),query),true);checks++}}
  assert.equal(c.unique(c.collect(list(items),constructed)),true);checks++
 }
 const record={passed:true,rawRegistries:256,checks,values,scope:'finite emitted reference registry checks with duplicate raw entries, shared-role prefix/NUL collisions, Unicode and lone surrogates; no universal proof, boundary-fold or full graph equivalence'}
 writeFileSync(resolve(import.meta.dirname,'local-graph-registry-falsification.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({passed:true,rawRegistries:256,checks}))
}finally{rmSync(temporary,{recursive:true,force:true})}
