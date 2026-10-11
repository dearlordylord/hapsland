import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import p from '/tmp/hapsland-retained-forest-projection.mjs';
import c from '/tmp/hapsland-construction-address-relation.mjs';
import m from '/tmp/hapsland-retained-materialization-probe.mjs';
import ap from '/tmp/hapsland-actual-attachment-frame-projection.mjs';
import rp from '/tmp/hapsland-reference-attachment-frame-projection.mjs';
import fixture from '/tmp/hapsland-attachment-frame-fixture.mjs';
import tx from '/tmp/hapsland-attachment-transaction-probe.mjs';
const fp='../whole-resolver/ForestSpecification.',tp='../whole-resolver/Types.',sp='../local-graph-draft/SPEC.',cp='../local-graph-draft/core.';
const list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'});
const arr=xs=>xs.$==='Nil'?[]:[xs.head,...arr(xs.tail)];
const artifact={$:tp+'Artifact',origin:{$:'None'},path:{$:'None'},id:'',kind:{$:tp+'FunctionArtifact'},name:'',source:'',source_hash:'',order:list(['ArtifactIdKey','ArtifactKindKey','ArtifactNameKey','ArtifactSourceKey','ArtifactHashKey'].map(k=>({$:tp+k})))};
const artifacts=list([{$:tp+'ArtifactEntry',handle:0n,value:artifact}]);
let cases=0,negative=0,detached=0,products=0,frames=0,frameNegative=0,pairedFrames=0,orderedFrames=0,orderMismatch=0,ready=0,enter=0,replies=0,staged=0,afterFrames=0,registeredPending=0,freshnessRejected=0,terminalFrames=0,boundaryCases=0,visitedCoverageRejected=0,provenanceRejected=0,canonicalRejected=0;
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

 const vp='AttachmentFrameView.',gp='../../../packages/agent-flow-bend/ImportGraph.';
 const empty={$:'MTip'},emptyOrder={$:vp+'Order',pending:list([]),targets:list([]),ids:list([]),captured:list([]),identities:list([]),visited:list([])};
 const limits={$:gp+'Limits',version:1n,source_bytes:1000n,tree_bytes:1000n,files:100n,read_bytes:1000n,outgoing_edges:1000n,depth:100n,work:1000n};
 const budget={$:cp+'Budget',limits:{$:cp+'LocalLimits',work:1000n,depth:100n,targets:100n},targets_by_path:empty,max_targets:0n,work:0n,graph_work:0n,max_depth:0n};
 const graph={$:gp+'Graph',phase:{$:gp+'GraphReady'},pending:list([]),visited:list([]),files:1n,read_bytes:0n,tree_bytes:0n,work:0n,skipped_tree:false,skipped_excluded:false,skipped_other:false,limits};
 const history={$:vp+'History',addresses:made.created.addresses,order:emptyOrder,edges:list([]),captures:list([]),artifacts,graph_remaining:300n,next_episode:episode+1n};
 const frame={$:tp+'ResolverFrame',branch:{$:tp+'FunctionBranch'},limits,graph,command:{$:gp+'NoCommand'},dependencies:list([]),root:0n,nodes:flat.nodes,references:flat.slots,visited:empty,budget,next_node:BigInt(arr(flat.nodes).length),next_edge:0n,next_target:0n,next_artifact:1n,pending:empty,target_paths:empty,target_ids:empty,target_artifacts:empty,captured:empty,artifacts};
 const viewed=ap.project(frame,history);assert.equal(viewed.$,'Some');assert.deepEqual(viewed.value.forest,run().value);frames++;

 const xp='../whole-resolver/ExpansionSpecification.',dp='../whole-resolver/ExpansionDriverSpecification.',sip='../whole-resolver/SignedLocalSpecification.',op='../whole-resolver/WholeObservation.';
 const config={$:dp+'Config',invocation:1n,root_path:'root',language:{$:tp+'BendLanguage'},frontend:{$:tp+'BendSourceContext',branch:{$:tp+'FunctionBranch'}},clock:{$:tp+'ClockToken',invocation:1n,id:2n},cache:{$:'None'}};
 const refFrame={$:xp+'Frame',graph:{$:gp+'Bounded',graph,remaining:300n},command:frame.command,forest:run().value,local:{$:sip+'State',local:{$:sp+'State',visited:empty,budget,next_address:0n,pending_rev:list([])},graph_work:{$:op+'Nonnegative',value:0n}},pending:list([]),captured:list([]),identities:list([]),next_edge:0n,next_episode:episode+1n,next_artifact:1n,dependencies:list([])};
 const refState={$:dp+'State',config,frame:refFrame,targets:list([]),ids:list([]),next_target:0n,next_request:7n,iterations:20n,stage:{$:dp+'Iteration'}};
 assert.deepEqual(rp.project(refState,history),viewed);pairedFrames++;

 const rawSource={$:tp+'SourceFacts',kind_aware:{$:'Some',value:false},declarations:list([{$:tp+'FactDeclaration',key:'x',artifact,references:list([]),exported:false}]),imports:list([]),supporting:list([])};
 const catalog=rp['../whole-resolver/SPEC.source'](rawSource,0n);
 const exported={$:'MLeaf',key:'x',val:false};
 const pendingValues=[9n,2n].map((id,i)=>({$:cp+'Pending',owner:0n,index:BigInt(i),from:'root',symbol:['z','a'][i],name:'x',depth:1n,expected:{$:cp+'FunctionKind'},target:{$:cp+'Imported',path:'child',name:'x'}}));
 const edges=pendingValues.map((value,i)=>({$:xp+'Edge',id:[9n,2n][i],pending:{$:fp+'Pending',owner:made.created.root,value},source:rawSource,catalog}));
 let orderedActual={...frame,next_edge:10n,next_target:8n};
 for(let i=0;i<2;i++){
  const id=[9n,2n][i],target=[7n,1n][i],key=['z','a'][i],value=pendingValues[i];
  orderedActual=fixture.pending(orderedActual,id,value);
  orderedActual=fixture.target(orderedActual,target,{$:tp+'FileTarget',path:key,name:'x',edge:value});
  orderedActual=fixture.target_id(orderedActual,key,target);
  orderedActual=fixture.capture(orderedActual,key,{$:tp+'CapturedFacts',facts:catalog.facts,exported,source_bytes:BigInt(10+i)});
  orderedActual=fixture.identity(orderedActual,target,key);
  orderedActual=fixture.visited(orderedActual,key);
 }
 const order={$:vp+'Order',pending:list([9n,2n]),targets:list([7n,1n]),ids:list(['z','a']),captured:list(['z','a']),identities:list([7n,1n]),visited:list(['z','a'])};
 const orderedHistory={...history,order,edges:list(edges.map(e=>({$:vp+'EdgeSource',id:e.id,source:rawSource,catalog}))),captures:list(['z','a'].map(path=>({$:vp+'CaptureSource',path,source:rawSource,catalog})))};
 const orderedReference={...refState,next_target:8n,targets:list(edges.map((edge,i)=>({$:dp+'TargetEntry',id:[7n,1n][i],target:{$:dp+'FileTarget',path:['z','a'][i],name:'x',edge}}))),ids:list([{$:dp+'TargetId',key:'z',id:7n},{$:dp+'TargetId',key:'a',id:1n}]),frame:{...refFrame,next_edge:10n,pending:list(edges),captured:list(['z','a'].map((path,i)=>({$:xp+'Captured',path,source:rawSource,bytes:BigInt(10+i)}))),identities:list([7n,1n].map((target,i)=>({$:xp+'TargetArtifact',target,identity:['z','a'][i]}))),local:{...refFrame.local,local:{...refFrame.local.local,visited:orderedActual.visited}}}};
 const actualOrdered=ap.project(orderedActual,orderedHistory),referenceOrdered=rp.project(orderedReference,orderedHistory);
 assert.equal(actualOrdered.$,'Some');assert.deepEqual(referenceOrdered,actualOrdered);orderedFrames++;
 const reordered={...orderedReference,frame:{...orderedReference.frame,pending:list(edges.toReversed())}};
 assert.notDeepEqual(rp.project(reordered,orderedHistory),actualOrdered);orderMismatch++;
 assert.equal(ap.project(orderedActual,{...orderedHistory,order:{...order,pending:list([9n,9n])}}).$,'None');orderMismatch++;

 const baselineSource=rawSource;
 if(flat.slots.$==='Con'){
  for(const bundled of [false,true])for(const known of [false,true])for(const iterations of [0n,1n,20n]){
  const php='AttachmentPhaseView.',lp='../whole-resolver/Loop.';
  const rawSource=bundled?{...baselineSource,supporting:baselineSource.declarations}:baselineSource;
  const catalog=rp['../whole-resolver/SPEC.source'](rawSource,0n);
  const declaration=bundled?catalog.facts.supporting.val.value:catalog.facts.declarations.val.value;
  const symbol=flat.slots.head.symbol;
  const edgeValue={$:cp+'Pending',owner:0n,index:0n,from:'root',symbol,name:'x',depth:1n,expected:{$:cp+'FunctionKind'},target:bundled?{$:cp+'BundledTarget',declaration:declaration.handle}:{$:cp+'Imported',path:'child',name:'x'}};
  const edge={$:xp+'Edge',id:0n,pending:{$:fp+'Pending',owner:made.created.root,value:edgeValue},source:rawSource,catalog};
  const creation=c[fp+'construct'](200n,t,episode+1n,list([]),artifacts);assert.equal(creation.$,fp+'Constructed');
  const token={$:tp+'CaptureToken',invocation:1n,id:3n};
  const newPending=arr(flat.slots).slice(0,3).map(slot=>({$:cp+'Pending',owner:slot.owner,index:slot.index,from:'child',symbol:slot.symbol,name:'x',depth:2n,expected:{$:cp+'FunctionKind'},target:{$:cp+'Imported',path:'next',name:'x'}}));
  const newSemanticPending=newPending.map(value=>({$:fp+'Pending',owner:arr(creation.created.addresses).find(e=>e.local===value.owner).address,value}));
  const childVisited=known?{$:'MLeaf',key:'',val:true}:empty;
  const plan={$:cp+'Plan',root:0n,nodes:flat.nodes,references:flat.slots,pending:list(newPending),visited:childVisited,budget};
  const child={$:tp+'TentativeChild',target:7n,path:bundled?'root':'child',capture:token,source_bytes:10n,file:{$:tp+'CapturedFacts',facts:catalog.facts,exported:bundled?empty:exported,source_bytes:10n},artifact:declaration.handle,identity:'',local_work_before:0n,plan,previous_tree_bytes:0n,candidate:{$:tp+'ProductNull'},pending_ids:list([])};
  const captureGraph={...graph,phase:{$:gp+'Capturing',edge:{$:gp+'Edge',id:0n,depth:1n},target:7n}};
  let phaseFrame={...frame,artifacts:catalog.artifacts,next_artifact:BigInt(arr(catalog.artifacts).length),graph:captureGraph,command:{$:gp+'ReadSource',target:7n},next_edge:1n,next_target:8n};
  if(known)phaseFrame=fixture.visited(phaseFrame,'');
  phaseFrame=fixture.pending(phaseFrame,0n,edgeValue);phaseFrame=fixture.target(phaseFrame,7n,bundled?{$:tp+'BundledTarget',declaration:declaration.handle,facts:catalog.facts,edge:edgeValue}:{$:tp+'FileTarget',path:'child',name:'x',edge:edgeValue});phaseFrame=fixture.target_id(phaseFrame,'child',7n);
  const phaseHistory={...history,artifacts:catalog.artifacts,order:{...emptyOrder,pending:list([0n]),targets:list([7n]),ids:list(['child']),visited:list(known?['']:[])},edges:list([{$:vp+'EdgeSource',id:0n,source:rawSource,catalog}])};
  const childHistory={$:php+'ChildHistory',created:creation.created,source:rawSource,catalog,capture:token,visited:list(known?['']:[])};
  const input={$:tp+'ResolverInput',invocation:1n,root_path:'root',root_capture:token,root_bytes:10n,root_name:'x',root_source:'',branch:frame.branch,caller_cache:{$:'None'},limits};
  const actualState=tx.actor(input,phaseFrame,child,edgeValue,config.clock,config.language,7n,iterations);assert.equal(actualState.$,'Some');
  const attempt={$:xp+'Attempt',target:7n,edge,kind:bundled?{$:xp+'BundledChild'}:{$:xp+'FileChild',path:'child'},source:rawSource,bytes:10n,name:'x',expected:{$:cp+'FunctionKind'},declaration,catalog,local_work_before:0n};
  const refChild={$:xp+'Child',attempt,created:creation.created,tentative:{...refFrame.local,local:{...refFrame.local.local,visited:childVisited}},pending:list(newSemanticPending)};
  const phaseReference={...refState,iterations,next_target:8n,targets:list([{$:dp+'TargetEntry',id:7n,target:bundled?{$:dp+'BundledTarget',declaration:arr(rawSource.supporting)[0],source:rawSource,catalog,edge}:{$:dp+'FileTarget',path:'child',name:'x',edge}}]),ids:list([{$:dp+'TargetId',key:'child',id:7n}]),frame:{...refFrame,local:{...refFrame.local,local:{...refFrame.local.local,visited:phaseFrame.visited}},graph:{$:gp+'Bounded',graph:captureGraph,remaining:300n},command:phaseFrame.command,pending:list([edge]),next_artifact:phaseFrame.next_artifact,next_edge:1n}};
  const actualReady=tx['ActualAttachmentPhaseProjection.project'](actualState.value,phaseHistory,childHistory),refReady=tx['ReferenceAttachmentPhaseProjection.project'](phaseReference,refChild,phaseHistory,childHistory);
  assert.equal(actualReady.$,'Some');assert.deepEqual(refReady,actualReady);ready++;
  const hollowFrame=tx.pending_hole(phaseFrame,edgeValue);
  assert.equal(ap.project(hollowFrame,phaseHistory).$,'Some');
  const hollowState=tx.actor(input,hollowFrame,child,edgeValue,config.clock,config.language,7n,iterations);
  assert.equal(tx['ActualAttachmentPhaseProjection.project'](hollowState.value,phaseHistory,childHistory).$,'None');canonicalRejected++;
  const strayHistory={...phaseHistory,edges:list([...arr(phaseHistory.edges),{$:vp+'EdgeSource',id:phaseFrame.next_edge,source:baselineSource,catalog:rp['../whole-resolver/SPEC.source'](baselineSource,99n)}])};
  assert.equal(tx['ActualAttachmentPhaseProjection.project'](actualState.value,strayHistory,childHistory).$,'None');provenanceRejected++;
  const extraVisited=fixture.visited({...phaseFrame,visited:plan.visited},'unlisted').visited;
  const hiddenChild={...child,plan:{...plan,visited:extraVisited}};
  const hiddenState=tx.actor(input,phaseFrame,hiddenChild,edgeValue,config.clock,config.language,7n,iterations);
  assert.equal(tx['ActualAttachmentPhaseProjection.project'](hiddenState.value,phaseHistory,childHistory).$,'None');visitedCoverageRejected++;
  const collision=tx.actor(input,{...phaseFrame,next_edge:0n},child,edgeValue,config.clock,config.language,7n,iterations);
  assert.equal(tx['ActualAttachmentPhaseProjection.project'](collision.value,phaseHistory,childHistory).$,'None');freshnessRejected++;
  for(const previous of [0n,1n,1000n]){
  const actualEnter=tx.actual_enter(previous,actualState.value),refEnter=tx.reference_enter(phaseReference,refChild,previous);
  assert.equal(actualEnter.$,lp+'ServiceStep');assert.equal(actualEnter.step.$,tp+'AwaitService');assert.deepEqual(tx['AttachmentReferenceBoundary.selected_request'](refEnter),{$:'Some',value:actualEnter.step.request});enter++;

  const newIDs=newPending.map((_,i)=>BigInt(i+1));
  const manualMeasuringHistory={...phaseHistory,addresses:tx['AttachmentMapping.extended'](phaseHistory.addresses,phaseFrame.next_node,creation.created),next_episode:phaseHistory.next_episode+1n,order:{...phaseHistory.order,pending:list([0n,...newIDs])},edges:list([...arr(phaseHistory.edges),...newIDs.map(id=>({$:vp+'EdgeSource',id,source:rawSource,catalog}))])};
  const measuringHistory=tx['AttachmentHistory.measurement'](actualReady.value,phaseHistory);
  assert.deepEqual(measuringHistory,manualMeasuringHistory);
  const measuredActual=ap.project(actualEnter.step.state.frame.value,measuringHistory);
  const measuredReference=tx['AttachmentStagedReferenceProjection.project'](refEnter,measuringHistory);
  assert.equal(measuredActual.$,'Some');assert.deepEqual(measuredReference,measuredActual);assert.equal(measuredActual.value.next_edge,1n+BigInt(newPending.length));staged++;registeredPending+=newPending.length;
  for(const outcome of [0n,1n,999n,1000n,1001n].map(bytes=>({$:tp+'ProductEncoded',bytes})).concat([{$:tp+'SourceTextEncoded',bytes:1n},{$:tp+'ProviderRejected',exception:{$:tp+'ExceptionToken',invocation:1n,id:11n}},{$:tp+'ProviderRejected',exception:{$:tp+'ExceptionToken',invocation:2n,id:11n}}])){
   for(const [invocation,id] of [[1n,7n],[2n,7n],[1n,8n],[2n,8n]]){
   const reply={$:tp+'Reply',invocation,id,outcome};
   const actualAfter=tx.actual_deliver(actualEnter,reply),refAfter=tx.reference_deliver(refEnter,reply);
   if(actualAfter.step.$===tp+'FailedResolver'){
    assert.equal(refAfter.$,dp+'DriverFailed');assert.deepEqual(refAfter.failure,actualAfter.step.failure);
   }else if(actualAfter.step.$===tp+'AwaitService'){
    assert.equal(refAfter.$,dp+'DriverSelected');assert.deepEqual(tx['AttachmentReferenceBoundary.selected_request']({$:dp+'Selected',state:refAfter.state,operation:refAfter.operation}),{$:'Some',value:actualAfter.step.request});
   }else{
    assert.equal(actualAfter.step.$,tp+'FinishedResolver');assert.equal(refAfter.$,dp+'DriverFinished');assert.equal(actualAfter.step.result.$,tp+'NoReviewUnit');assert.equal(refAfter.product.$,'None');
   }

   if(actualAfter.step.$===tp+'AwaitService'||actualAfter.step.$===tp+'FinishedResolver'){
    const refused=refAfter.state.frame.command.$===gp+'SkipImport';
    const manualAfterHistory={...measuringHistory,graph_remaining:299n,order:{...measuringHistory.order,captured:list(refused||bundled?[]:['child']),identities:list(refused?[]:[7n])},captures:list(refused||bundled?[]:[{$:vp+'CaptureSource',path:'child',source:rawSource,catalog}])};
    const afterHistory=tx['AttachmentHistory.reply'](actualReady.value,measuringHistory,previous,actualEnter.step.request,reply);
    assert.deepEqual(afterHistory,manualAfterHistory);
    const afterActualFrame=actualAfter.step.$===tp+'AwaitService'?actualAfter.step.state.frame:actualAfter.step.final_frame;
    assert.equal(afterActualFrame.$,'Some');
    const boundary=tx.actual_boundary(actualAfter,afterHistory),expectedBoundary=tx.reference_boundary(refAfter,refChild,afterHistory);
    assert.equal(boundary.$,'Some');assert.deepEqual(expectedBoundary,boundary);boundaryCases++;
    const observedAfter=ap.project(afterActualFrame.value,afterHistory),expectedAfter=rp.project(refAfter.state,afterHistory);
    assert.equal(observedAfter.$,'Some');assert.deepEqual(expectedAfter,observedAfter);afterFrames++;if(actualAfter.step.$===tp+'FinishedResolver')terminalFrames++;
   }
   if(actualAfter.step.$===tp+'FailedResolver'){const boundary=tx.actual_boundary(actualAfter,measuringHistory);assert.equal(boundary.$,'Some');assert.deepEqual(tx.reference_boundary(refAfter,refChild,measuringHistory),boundary);boundaryCases++;}
   assert.deepEqual(refAfter.world.effects,list([]));replies++;
   }
  }
  }
  }
 }
 for(const [f,h] of [[{...frame,next_node:frame.next_node+1n},history],[frame,{...history,next_episode:episode}],[{...frame,target_ids:{$:'MLeaf',key:'extra',val:{$:'Some',value:1n}}},history],[frame,{...history,order:{...emptyOrder,ids:list(['absent'])}}],[{...frame,artifacts:list([...arr(artifacts),{$:tp+'ArtifactEntry',handle:99n,value:{...artifact,order:list([])}}])},history]]){assert.equal(ap.project(f,h).$,'None');frameNegative++;}
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
const record={cases,negative,detached,products,frames,frameNegative,pairedFrames,orderedFrames,orderMismatch,ready,enter,replies,staged,afterFrames,registeredPending,freshnessRejected,terminalFrames,boundaryCases,visitedCoverageRejected,provenanceRejected,canonicalRejected,actualCompiledConstructAndFlatten:true,universalProof:false,sourceSha256:createHash('sha256').update(readFileSync('/workspace/typescript/hapsland-bend-selection-ui/packages/source-analysis/src/direct-event/graph-resolution/attachment/RetainedForestProjection.bend')).digest('hex'),scope:'Finite synthetic attachment phases: full staged and post-reply frames, pending registration, admission/refusal and service reply correlation. Raw source-to-child-plan reachability and universal correspondence are not established; no production adoption'};
writeFileSync('/workspace/typescript/hapsland-bend-selection-ui/evidence/bend-strangler/whole-entry-draft/attachment-transaction-falsification.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
