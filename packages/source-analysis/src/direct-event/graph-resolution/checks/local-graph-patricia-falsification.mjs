import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const temporary=mkdtempSync(join(tmpdir(),'hapsland-patricia-'))
const list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
const values=['','x','y','type:x','function:x','type:type:x','a\0b','a','b\0c','a\0b\0c','é','e\u0301','😀','\ud800','\udc00']
let seed=80319,checks=0;const draw=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n}
try{
 const emitted=join(temporary,'model.mjs')
 const owner=resolve(import.meta.dirname,'../representations/list-state/PATRICIA_CANARY.bend')
 execFileSync('bend',[owner,'-o',emitted],{timeout:5000})
 const c=(await import(pathToFileURL(emitted))).default
 for(const left of values)for(const right of values){
  if(left===right)continue
  const position=c.split(left,right)
  assert.equal(c.prefix(position,left,right),true)
  assert.notEqual(c.route(left,position),c.route(right,position));checks+=2
 }
 for(const key of values)for(const position of [0n,1n,32n,33n,65n,66n,100n,1000n]){
  const bit=c.bit(key,position);assert.equal(bit.fst,key);assert.equal(bit.snd,c.route(key,position));checks+=2
 }
 for(let trial=0;trial<128;trial++){
  const records=Array.from({length:draw(24)},()=>({$:'MAP_HISTORY_RELATION.Record',key:values[draw(values.length)],value:BigInt(draw(100))}))
  const source=c.nat_source(list(records)),expected=new Map(records.map(({key,value})=>[key,value]))
  assert.equal(c.nat_canonical(source),true);checks++
  const first=c.nat_first_leaf(source)
  assert.equal(c.nat_nonempty(source),expected.size>0);checks++
  if(expected.size){assert.equal(first.$,'Some');assert.equal(expected.has(first.value),true);checks+=2}else{assert.equal(first.$,'None');checks++}
  for(const key of values){
   const value=BigInt(draw(100)),updated=c.nat_set(source,key,value)
   assert.equal(c.nat_canonical(updated),true)
   assert.equal(c.nat_lookup(updated,key),value)
   assert.deepEqual(c.nat_set(c.nat_set(source,key,13n),key,value),updated);checks+=3
   for(const query of values)if(query!==key){assert.equal(c.nat_lookup(updated,query),c.nat_lookup(source,query));checks++}
  }
  for(let pair=0;pair<16;pair++){
   const left=values[draw(values.length)],right=values[draw(values.length)]
   if(left!==right){assert.deepEqual(c.nat_set(c.nat_set(source,left,7n),right,11n),c.nat_set(c.nat_set(source,right,11n),left,7n));checks++}
  }
 }
 const tip={$:'MTip'},leaf=key=>({$:'MLeaf',key,val:1n}),node=(pos,lo,hi)=>({$:'MNode',pos,lo,hi})
 const malformed=[node(0n,tip,tip),node(0n,tip,leaf('x')),node(0n,leaf('x'),tip),node(0n,leaf('x'),leaf('x')),node(0n,leaf('x'),leaf('')),node(33n,leaf('a'),leaf('b')),node(0n,node(0n,leaf(''),leaf('x')),leaf('y'))]
 for(const tree of malformed){assert.equal(c.nat_canonical(tree),false);checks++}
 const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex')
 const record={passed:true,histories:128,checks,malformedTreesRejected:malformed.length,values,sourceSha256:sha(owner.replace('CANARY','RELATION')),lawsSha256:sha(owner.replace('CANARY','LAWS')),scope:'finite emitted Nat payload instances of eight approved Patricia laws plus actual-leaf membership checks; exact structural updates, full payload reads, prefix/NUL/Unicode/surrogate Strings, malformed raw-tree rejection; no universal proof, arbitrary U32 Char coverage, boundary or full graph adoption'}
 writeFileSync(resolve(import.meta.dirname,'local-graph-patricia-falsification.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(temporary,{recursive:true,force:true})}
