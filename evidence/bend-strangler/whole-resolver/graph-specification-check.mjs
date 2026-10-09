import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {list} from './service-session.mjs'

const folder=import.meta.dirname,temporary=mkdtempSync('/tmp/hapsland-graph-specification-')
const inputFiles=['GraphSpecification.bend','SPEC.bend','SpecificationCheck.bend',
 '../../../packages/agent-flow-bend/ImportGraph.bend','graph-specification-check.mjs']
const hashes=()=>Object.fromEntries(inputFiles.map(path=>[path,createHash('sha256').update(readFileSync(join(folder,path))).digest('hex')]))
const sources=hashes(),tag=(name,fields={})=>({$:'../../../packages/agent-flow-bend/ImportGraph.'+name,...fields})
const caps=n=>tag('Limits',{version:1n,source_bytes:n,tree_bytes:n,files:n,read_bytes:n,outgoing_edges:n,depth:n,work:n})
let compared=0,seed=0x581fae,sequenceEvents=0
const reachablePhases={}
const random=limit=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed>>>8)%limit}
const nat=()=>BigInt(random(7))
function state(limits,phase,flags){return tag('Graph',{phase,pending:list([tag('Edge',{id:2n,depth:1n}),tag('Edge',{id:3n,depth:3n})]),visited:list(random(2)?[1n,2n]:[1n]),
 files:nat(),read_bytes:nat(),tree_bytes:nat(),work:nat(),skipped_tree:!!(flags&1),skipped_excluded:!!(flags&2),skipped_other:!!(flags&4),limits})}
const phases=()=>[tag('Idle'),tag('GraphReady'),tag('Resolving',{edge:tag('Edge',{id:2n,depth:2n})}),
 tag('Checking',{edge:tag('Edge',{id:2n,depth:2n}),target:2n}),tag('Capturing',{edge:tag('Edge',{id:2n,depth:2n}),target:2n}),
 tag('Complete'),tag('Incomplete',{reason:tag('TreeLimit')})]
const events=()=>[tag('Root',{target:1n,source_bytes:nat(),tree_bytes:nat(),local_work:nat(),edges:list([2n,3n])}),tag('Next'),
 ...['Found','NotFound','Many','Unhandled'].map(result=>tag('Resolved',{target:2n,result:tag(result)})),
 tag('PathChecked',{allowed:true}),tag('PathChecked',{allowed:false}),tag('Captured',{source_bytes:nat(),node_bytes:nat(),local_work:nat(),edges:list([4n,5n])}),
 tag('CaptureFailed'),tag('DeadlineReached')]
try{
 assert.equal(execFileSync('bend',['version'],{encoding:'utf8',timeout:5000}).trim(),'bend 2.0.36')
 const compiled=join(temporary,'check.mjs');execFileSync('bend',[join(folder,'SpecificationCheck.bend'),'-o',compiled],{timeout:5000})
 const {default:program}=await import(pathToFileURL(compiled))
 function compare(state,event){const actual=program.reference_event(state,event),expected=program.native_event(state,event);assert.deepEqual(actual,expected,JSON.stringify({state,event},(_key,value)=>typeof value==='bigint'?String(value):value));compared++;return actual}
 for(const cap of [0n,1n,2n,4n,8n]){
  assert.deepEqual(program.reference_initial(caps(cap)),program.native_initial(caps(cap)))
  for(const phase of phases())for(let flags=0;flags<8;flags++)for(let variation=0;variation<4;variation++){
   const current=state(caps(cap),phase,flags)
   for(const event of events())compare(current,event)
   if(phase.$.endsWith('.GraphReady'))compare({...current,pending:list([])},tag('Next'))
  }
 }
 // Reachable compositions include tree rollback, read/work ceilings, duplicate
 // targets, queue appends and post-terminal deadlines. No policy-choice oracle
 // is passed into the reference: only the same external event is delivered.
 for(let sample=0;sample<256;sample++){
  const limits=tag('Limits',{version:1n,source_bytes:BigInt(2+random(5)),tree_bytes:BigInt(16+random(48)),files:BigInt(2+random(8)),
   read_bytes:BigInt(16+random(32)),outgoing_edges:BigInt(2+random(6)),depth:BigInt(1+random(6)),work:BigInt(4+random(24))})
  const root=tag('Root',{target:1n,source_bytes:BigInt(random(4)),tree_bytes:BigInt(random(8)),local_work:BigInt(random(4)),edges:list([2n,3n])})
  let result=compare(program.reference_initial(limits),root)
  for(let iteration=0;iteration<32;iteration++){
   const phase=result.state.phase.$.split('.').at(-1)
   reachablePhases[phase]=(reachablePhases[phase]??0)+1
   let event
   if(phase==='GraphReady')event=tag('Next')
   else if(phase==='Resolving')event=tag('Resolved',{target:BigInt(1+random(6)),result:tag(['Found','NotFound','Many','Unhandled'][random(4)])})
   else if(phase==='Checking')event=tag('PathChecked',{allowed:!!random(2)})
   else if(phase==='Capturing')event=random(5)===0?tag('CaptureFailed'):tag('Captured',{source_bytes:nat(),node_bytes:nat(),local_work:nat(),edges:list(random(2)?[4n,5n]:[])})
   else event=tag('DeadlineReached')
   result=compare(result.state,event);sequenceEvents++
  }
 }
 const reachableLimits=tag('Limits',{version:1n,source_bytes:2n,tree_bytes:4n,files:4n,read_bytes:16n,outgoing_edges:4n,depth:4n,work:32n})
 const found=tag('Resolved',{target:2n,result:tag('Found')}),allowed=tag('PathChecked',{allowed:true})
 const sequences=[
  {limits:reachableLimits,events:[tag('Root',{target:1n,source_bytes:1n,tree_bytes:1n,local_work:0n,edges:list([])}),tag('Next'),tag('DeadlineReached')]},
  {limits:reachableLimits,events:[tag('Root',{target:1n,source_bytes:1n,tree_bytes:1n,local_work:0n,edges:list([2n,3n])}),tag('Next'),found,allowed,
   tag('Captured',{source_bytes:1n,node_bytes:1n,local_work:0n,edges:list([])}),tag('Next'),found,tag('Next'),tag('DeadlineReached')]},
  {limits:{...reachableLimits,tree_bytes:1n},events:[tag('Root',{target:1n,source_bytes:1n,tree_bytes:1n,local_work:0n,edges:list([2n])}),tag('Next'),found,allowed,
   tag('Captured',{source_bytes:1n,node_bytes:2n,local_work:0n,edges:list([4n])}),tag('Next'),tag('DeadlineReached')]}
 ]
 for(const sequence of sequences){let current=program.reference_initial(sequence.limits);for(const event of sequence.events){const phase=current.phase.$.split('.').at(-1);reachablePhases[phase]=(reachablePhases[phase]??0)+1;current=compare(current,event).state;sequenceEvents++}}
 assert.deepEqual(hashes(),sources,'sources frozen during comparison')
  for(const phase of ['GraphReady','Resolving','Checking','Capturing','Complete','Incomplete'])assert.ok(reachablePhases[phase]>0,phase+' must be exercised in reachable sequences')
  const record={at:new Date().toISOString(),runtime:typeof Bun==='undefined'?'node':'bun',sources,comparisons:compared,reachableSequenceEvents:sequenceEvents,reachablePhases,
  completeStateAndCommandEquality:true,productionTransitionsExcludedFromReference:true,sharedReferenceForRustAndExpansion:true,
  scope:'Finite independent reference ImportGraph state/event checks against current production kernel, full state and command. Includes raw/nonreachable states and bounded reachable compositions. No universal law, whole resolver driver/projection, proof or production migration acceptance.'}
 // Check the call boundary as well as results: only datatype constructors G.X{}
 // are permitted in this reference module, no lowercase production helpers.
 assert.ok(!/\bG\.[a-z][A-Za-z_0-9]*\s*\(/.test(readFileSync(join(folder,'GraphSpecification.bend'),'utf8')))
 writeFileSync(join(folder,'graph-specification-'+record.runtime+'-evidence.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(temporary,{recursive:true,force:true})}
