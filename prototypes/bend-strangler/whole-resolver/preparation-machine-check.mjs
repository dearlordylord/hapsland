import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const temporary=await mkdtemp('/tmp/hapsland-preparation-machine-')
try {
 const emitted=join(temporary,'preparation.mjs')
 execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'Preparation.bend'),'-o',emitted],{timeout:5000})
 const machine=(await import(pathToFileURL(emitted))).default
 const list=values=>values.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
 const array=value=>{const values=[];while(value.$==='Con'){values.push(value.head);value=value.tail}assert.equal(value.$,'Nil');return values}
 const none={$:'None'},some=value=>({$:'Some',value}),text=value=>({$:'Types.ProductText',value})
 const contract={$:'PreparationSelection.TypeContract'},functionContract={$:'PreparationSelection.FunctionContract'}
 const limits={$:'../../../packages/agent-flow-bend/ImportGraph.Limits',version:1n,source_bytes:2097152n,tree_bytes:16777216n,files:64n,read_bytes:16777216n,outgoing_edges:256n,depth:32n,work:10000n}
 const candidate=(path,operation='CandidateAdd',lines=['changed'])=>({$:'Candidate',path,operation:{$:operation},added_lines:list(lines)})
 const input=(candidates,overrides={})=>({$:'Input',candidates:list(candidates),contracts:list([contract]),limits,frozen:none,line:none,verified:none,native_patch:none,advicee_host:'codex',before_analyze:true,...overrides})
 const roots=(path,count)=>Array.from({length:count},(_,index)=>({$:'PreparationSelection.Root',id:path+':'+index,declaration:{$:'RootAttribution.Declaration',path,kind:'class',name:'Root'+index,location:{$:'RootAttribution.Location',start:{$:'RootAttribution.Position',line:1n,column:1n},end:{$:'RootAttribution.Position',line:1n,column:2n}},selection_locations:none}}))
 let cases=0,totalRequests=0
 function run(configuration,options={}) {
  let step=machine.initial(1n,configuration),last=-1n,captures=[];const requests=[]
  for(let fuel=0;fuel<10000;fuel++) {
   if(step.$==='Internal'){step=machine.advance(step.state);continue}
   if(step.$!=='Await'){return {step,requests}}
   const request=step.request,command=request.command
   assert.equal(request.invocation,1n);assert.equal(request.id,last+1n);last=request.id
   requests.push(command);totalRequests++
   assert.equal(machine.resume(step,{$:'Reply',invocation:2n,id:request.id,response:{$:'Cancelled'}}).reason,'wrong-correlation')
   let response
   switch(command.$) {
    case 'InspectPath': response={$:'PathAllowed',path:command.candidate.path,selection:1n};break
    case 'CaptureSource': {
     const capture={$:'Capture',path:command.path,handle:BigInt(captures.length+1),text:'x',content_hash:'hash',bytes:1n};captures.push(capture)
     response={$:'SourceCaptured',capture};break
    }
    case 'Preflight': response={$:'PreflightDone',value:text('preflight')};break
    case 'AdmitMaterialization': response={$:'MaterializationDone',requested:1024n,result:options.refuseMaterialization?{$:'CapacityRefused',constraint:'resident-ledger'}:{$:'Resized'}};break
    case 'ExtractSource': {
     const declarations=roots(command.capture.path,options.rootCount??2)
     response={$:'SourceExtracted',extraction:{$:'Extraction',graph:some(list(declarations)),functions:some({$:'FunctionFile',failure:none,functions:list(declarations.map(root=>({...root,id:root.id+':fn',declaration:{...root.declaration,kind:'function',name:root.declaration.name.replace('Root','Fn')}}))),exclusions:list([])}),type_file:{$:'TypeAnalyzed',analyses:list([])}}};break
    }
    case 'ResolveRoot': {
     const ordinal=requests.filter(value=>value.$==='ResolveRoot').length
     if(options.cancelAtRoot===ordinal) response={$:'Cancelled'}
     else if(options.failAtRoot===ordinal) response={$:'TechnicalFailure',message:'provider exploded'}
     else response={$:'RootResolved',unit:options.refuseFirst&&ordinal===1?none:some(text(command.capture.path+':'+command.root.name)),references:list(options.omitted&&ordinal===1?[{$:'../local-graph-draft/core.ReferenceSlot',owner:1n,index:0n,symbol:'missing',reference:{$:'../local-graph-draft/core.Omitted',reason:{$:'../local-graph-draft/core.Unresolved'},target_name:'missing'}}]:[]),captures:list(captures)}
     break
    }
    case 'RenderUnits': response={$:'UnitsRendered',outcomes:list([{$:'OutcomeReady',path:command.context.capture.path,prepared:text(command.context.capture.path)}])};break
    case 'ClassifyAmbiguity': response={$:'AmbiguityClassified',reason:none};break
    default: throw new Error('Unexpected provider '+command.$)
   }
   step=machine.resume(step,{$:'Reply',invocation:1n,id:request.id,response})
  }
  throw new Error('Preparation did not settle')
 }
 const finished=result=>{assert.equal(result.step.$,'Finished');cases++;return result.step.result}
 const count=(result,tag)=>result.requests.filter(value=>value.$===tag).length
 let check=run(input([candidate('a.py'),candidate('b.py')],{contracts:list([contract,functionContract])})),result=finished(check)
 assert.equal(result.complete,true);assert.equal(result.selected,8n);assert.equal(array(result.units).length,8)
 for(const tag of ['CaptureSource','Preflight','AdmitMaterialization'])assert.equal(count(check,tag),2)
 assert.equal(count(check,'ExtractSource'),4);assert.deepEqual(array(result.paths).map(path=>path.path),['a.py','b.py'])
 assert.deepEqual(array(result.units).map(value=>value.value),['a.py:Root0','a.py:Root1','b.py:Root0','b.py:Root1','a.py:Fn0','a.py:Fn1','b.py:Fn0','b.py:Fn1'])
 check=run(input([candidate('a.py')],{contracts:list([contract,functionContract])}),{refuseMaterialization:true});result=finished(check)
 assert.equal(result.complete,false);for(const tag of ['CaptureSource','Preflight','AdmitMaterialization'])assert.equal(count(check,tag),1)
 assert.equal(count(check,'ExtractSource'),0);assert.equal(array(result.paths)[0].diagnostic.value.$,'MaterializationRefused')
 check=run(input([candidate('a.py')],{contracts:list([contract,functionContract])}),{rootCount:40,refuseFirst:true});result=finished(check)
 assert.equal(result.selected,64n);assert.equal(count(check,'ResolveRoot'),64);assert.equal(array(result.units).length,63)
 assert.equal(result.complete,false);assert.equal(array(result.paths)[0].failures.head.reason,'missing-evidence')
 assert.equal(array(array(result.paths)[0].failures).filter(value=>value.reason==='reference-limit').length,16)
 check=run(input([candidate('a.py')]),{omitted:true});result=finished(check);assert.equal(result.complete,false);assert.equal(array(result.units).length,2);assert.equal(array(array(result.paths)[0].failures)[0].reason,'missing-evidence')
 for(const option of [{cancelAtRoot:2},{failAtRoot:2}]) {
  check=run(input([candidate('a.py')]),option);assert.equal(check.step.$,'Failed');assert.equal(count(check,'ResolveRoot'),2);assert.equal(count(check,'RenderUnits'),0);cases++
 }
 check=run(input([candidate('a.py','CandidateDelete'),candidate('b.py','CandidateMove'),candidate('c.py','CandidateUpdate',[' \uFEFF'])]));result=finished(check)
 assert.equal(check.requests.length,0);assert.deepEqual(array(result.paths).map(path=>path.reason.value),['unsupported-operation','unsupported-operation','metadata-only'])
 check=run(input([candidate('a.py')],{frozen:some(list([]))}));result=finished(check);assert.equal(array(result.paths).length,0);assert.equal(count(check,'CaptureSource'),0)
 check=run(input([candidate('a.py')],{frozen:some(list([{$:'FrozenPath',path:'a.py',names:list([])}]))}));result=finished(check);assert.equal(array(result.paths).length,1);assert.equal(result.selected,0n)
 for(let index=0;index<2;index++){result=finished(run(input([candidate('fresh.py')]),{rootCount:65}));assert.equal(result.selected,64n);assert.equal(array(result.units).length,64)}
 check=run(input([candidate('a.py')],{before_analyze:false}));finished(check);assert.equal(count(check,'Preflight'),0);assert.equal(count(check,'AdmitMaterialization'),0)
 console.log(JSON.stringify({passed:true,cases,requests:totalRequests,scope:'finite emitted whole preparation progression, contract/candidate order, shared cache/materialization refusal, quota-before-launch including refused root, fresh outer instances, cancellation/technical errors and frozen-path distinctions; simulated intermediate providers, no resident adoption or universal proof'}))
} finally {await rm(temporary,{recursive:true,force:true})}
