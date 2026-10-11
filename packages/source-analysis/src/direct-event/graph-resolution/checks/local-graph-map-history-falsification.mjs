import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const temporary=mkdtempSync(join(tmpdir(),'hapsland-map-history-'))
const list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
const values=['','x','y','type:x','function:x','type:type:x','a\0b','a','b\0c','a\0b\0c','é','e\u0301','😀','\ud800','\udc00']
let seed=46781,checks=0;const draw=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n}
try{
 const emitted=join(temporary,'model.mjs')
 execFileSync('bend',[resolve(import.meta.dirname,'../representations/list-state/MAP_HISTORY_CANARY.bend'),'-o',emitted],{timeout:5000})
 const c=(await import(pathToFileURL(emitted))).default
 for(let trial=0;trial<512;trial++){
  const records=Array.from({length:draw(32)},()=>({$:'MAP_HISTORY_RELATION.Record',key:values[draw(values.length)],value:BigInt(draw(100))})),items=list(records)
  const names=c['REGISTRY_RELATION.registry'](list([...values,'unused'])),source=c.nat_source(items),numeric=c.nat_numeric(items,names),decoded=c.nat_decode(numeric,names)
  assert.deepEqual(decoded,source);assert.equal(c.nat_valid(numeric),true);assert.equal(c.nat_valid(c.nat_numeric(items,list([]))),true);assert.equal(c.nat_size(numeric),c.nat_count(source));checks+=4
  const raw={$:'Own.DCon',key:100n,value:91n,count:3n,rest:{$:'Own.DCon',key:0n,value:0n,count:2n,rest:{$:'Own.DCon',key:99n,value:2n,count:1n,rest:{$:'Own.DNil'}}}}
  for(const initial of [numeric,c.nat_numeric(items,list([])),raw])for(const registry of [names,list([])]){assert.equal(c.nat_valid(initial),true);assert.equal(c.nat_valid(c.nat_fold(items,registry,initial)),true);checks+=2}
  const expected=new Map(records.map(({key,value})=>[key,value]));assert.equal(c.nat_size(numeric),BigInt(expected.size));checks++
  for(const key of [...values,'unused']){
   const id=c['BOUNDARY_ENCODING.identity'](names,key),actual=c.nat_own_lookup(numeric,id),original=c.nat_lookup(source,key)
   assert.equal(actual,original);assert.equal(original,expected.has(key)?expected.get(key):9999n);checks+=2
   const value=BigInt(draw(100)),updated=c.nat_own_set(numeric,id,value)
   assert.deepEqual(c.nat_decode(updated,names),c.nat_set(decoded,key,value));checks++
   assert.deepEqual(c.nat_set(c.nat_set(source,key,13n),key,value),c.nat_set(source,key,value));checks++
  }
  for(let pair=0;pair<16;pair++){
   const left=values[draw(values.length)],right=values[draw(values.length)]
   if(left!==right){assert.deepEqual(c.nat_set(c.nat_set(source,left,7n),right,11n),c.nat_set(c.nat_set(source,right,11n),left,7n));checks++}
  }
 }
 const record={passed:true,histories:512,checks,values,scope:'finite emitted monomorphic Nat-payload instances of seven proposed generic Map-history laws; raw duplicate ordered records, arbitrary overwrite values, exact structural BaseMap reconstruction/commutation/idempotence, complete lookup/cardinality/cache invariant including unregistered-zero construction; no universal BaseMap proof or boundary/graph adoption'}
 writeFileSync(resolve(import.meta.dirname,'local-graph-map-history-falsification.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(temporary,{recursive:true,force:true})}
