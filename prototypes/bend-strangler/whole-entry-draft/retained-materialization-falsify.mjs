import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import p from '/tmp/hapsland-retained-forest-projection.mjs';
import c from '/tmp/hapsland-construction-address-relation.mjs';
import m from '/tmp/hapsland-retained-materialization-probe.mjs';
const fp='../whole-resolver/ForestSpecification.',tp='../whole-resolver/Types.',sp='../local-graph-draft/SPEC.',cp='../local-graph-draft/core.';
const list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'});
const arr=xs=>xs.$==='Nil'?[]:[xs.head,...arr(xs.tail)];
const artifact={$:tp+'Artifact',origin:{$:'None'},path:{$:'None'},id:'',kind:{$:tp+'FunctionArtifact'},name:'',source:'',source_hash:'',order:list(['ArtifactIdKey','ArtifactKindKey','ArtifactNameKey','ArtifactSourceKey','ArtifactHashKey'].map(k=>({$:tp+k})))};
const artifacts=list([{$:tp+'ArtifactEntry',handle:0n,value:artifact}]);
let cases=0,negative=0,detached=0,products=0;
for(let seed=0;seed<128;seed++)for(const episode of [0n,3n]){
 let next=0n;
 const tree=(s,d)=>({$:sp+'Tree',address:next++,artifact:0n,references:list(Array.from({length:d<3?s%4:0},(_,i)=>({$:sp+'TreeReference',symbol:['','\0','\ud800'][i%3],outcome:(s+i)%3===0?{$:sp+'Included',identity:''}:(s+i)%3===1?{$:sp+'Omitted',reason:{$:cp+'Unresolved'},target:''}:{$:sp+'Expanded',tree:tree((s*3+i+1)%29,d+1)}})))});
 const t=tree(seed,0),made=c[fp+'construct'](200n,t,episode,list([]),artifacts),flat=c[sp+'flatten'](200n,{$:sp+'FlattenTree',tree:t});
 assert.equal(made.$,fp+'Constructed');assert.equal(flat.$,sp+'Flat');
 const run=(nodes=flat.nodes,slots=flat.slots,catalog=artifacts,addresses=made.created.addresses)=>p.project(0n,nodes,slots,catalog,addresses);
 assert.deepEqual(run(),{$:'Some',value:{$:fp+'Forest',root:{$:'Some',value:made.created.root},nodes:made.created.nodes}});cases++;
 const checkProduct=(projected,slots)=>{for(const deps of [[],['','\0','\ud800']]){
  const actual=m.actual(0n,flat.nodes,slots,artifacts,list(deps)),expected=m.expected(200n,projected.value,list(deps));
  assert.equal(actual.$,'Some');assert.equal(expected.$,fp+'Materialized');assert.deepEqual(actual.value,expected.product);products++;
 }};
 checkProduct(run(),flat.slots);
 for(const result of [run(flat.nodes,flat.slots,list([...arr(artifacts),...arr(artifacts)])),run(flat.nodes,flat.slots,artifacts,made.created.addresses.tail),run(list([...arr(flat.nodes),arr(flat.nodes)[0]])),run(flat.nodes,list([...arr(flat.slots),{$:cp+'ReferenceSlot',owner:999n,index:0n,symbol:'',reference:{$:cp+'Included',identity:''}}]))]){assert.equal(result.$,'None');negative++;}
 if(flat.slots.$==='Con'){
  const bad={...flat.slots,head:{...flat.slots.head,index:99n}};assert.equal(run(flat.nodes,bad).$,'None');negative++;
 }
 if(arr(flat.nodes).length>1){
  const refs=arr(flat.slots).map(s=>s.reference.$===cp+'Expanded'?{...s,reference:{$:cp+'Omitted',reason:{$:cp+'Unresolved'},target_name:s.symbol}}:s);
  const projected=run(flat.nodes,list(refs));assert.equal(projected.$,'Some');assert.equal(arr(projected.value.nodes).length,arr(flat.nodes).length);detached++;checkProduct(projected,list(refs));
  assert.equal(run(list(arr(flat.nodes).reverse())).$,'None');negative++;
 }
}
const record={cases,negative,detached,products,actualCompiledConstructAndFlatten:true,universalProof:false,sourceSha256:createHash('sha256').update(readFileSync('/workspace/typescript/hapsland-bend-selection-ui/evidence/bend-strangler/whole-entry-draft/RetainedForestProjection.bend')).digest('hex'),scope:'Finite internal retained projection correspondence; not arbitrary Core rejection equivalence, whole attachment proof or production adoption'};
writeFileSync('/workspace/typescript/hapsland-bend-selection-ui/evidence/bend-strangler/whole-entry-draft/retained-materialization-falsification.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
