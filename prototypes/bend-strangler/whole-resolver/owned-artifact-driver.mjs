import {createArtifactMachine} from './artifact-dispatcher.mjs'
// Effect/lifetime adapter for actual Canonical owner actions. Root selection and
// resident retention are not implemented here: this is a composed intermediate.
export function createOwnedArtifactDriver({owner,initialState,scope,artifacts,registry,foreign,hooks={},control,machine:providedMachine,selectMachine}){
 const machine=providedMachine??createArtifactMachine({...artifacts,retainPrefixes:false})
 const machines=new Map(),engine=invocation=>machines.get(invocation)??machine
 let state=control?undefined:initialState,nextHandle=1n
 const current=()=>control?control.readState():state
 const invoke=(method,...args)=>control?control.invoke(method,args):owner[method](state,...args)
 const resources=new Map(),leases=new Map(),launches=new Map(),sessions=new Map(),finished=new Map()
 const finalizedSessions=new WeakSet()
 const finishSession=async session=>{
  if(finalizedSessions.has(session))return
  try{await session.finish?.();finalizedSessions.add(session)}
  catch(error){registry.retainCleanup(session,async()=>{await session.finish?.();finalizedSessions.add(session)});throw error}
 }
 const closeUnregistered=async session=>{
  if([...sessions.values()].includes(session)||registry.get(session.invocation)===session)return
  try{await finishSession(session)}finally{session.close?.()}
 }
 const stats={launches:0,resumes:0,accepted:0,providerStarts:0,providerCleanups:0,revoked:0,discarded:0}
 const list=value=>{const out=[];while(value.$==='Con'){out.push(value.head);value=value.tail}if(value.$!=='Nil')throw new Error('Malformed owner action list');return out}
 const save=(invocation,kind,value)=>{const id=nextHandle++;resources.set(id,{invocation,kind,value});return id}
 const load=(id,invocation,kind)=>{const held=resources.get(id);if(!held||held.invocation!==invocation||held.kind!==kind)throw new Error('Wrong opaque resource ownership');return held.value}
 const release=(id,invocation)=>{const held=resources.get(id);if(held&&held.invocation===invocation){resources.delete(id);stats.discarded++}}
 const failed=()=>({failure:{$:'Types.InvocationCancelled'}})
 const settle=(invocation,generation,raw)=>{
  const projection=engine(invocation).view(raw)
  if(projection.$==='Types.AwaitService'){
   if(projection.request.invocation!==invocation)throw new Error('Artifact request owner mismatch')
   const id=save(invocation,'state',raw);let transferred=false
   try{hooks.beforeInstall?.({invocation,generation,handle:id,request:projection.request,driver});const child=owner.find(invocation,current().children).value;const step=child.scope.$==='AdviceTailScope'?invoke('install_advice',invocation,generation,id,projection.request.id,engine(invocation).permission(projection.request)):child.scope.$==='SourceScope'?invoke('install_source',invocation,generation,id,projection.request.id,engine(invocation).permission(projection.request)):child.scope.$==='AfterSourceScope'?invoke('install_after_source',invocation,generation,id,projection.request.id,engine(invocation).afterPermission(projection.request)):invoke('install',invocation,generation,id,projection.request.id);apply(step);transferred=true}
   finally{if(!transferred)release(id,invocation)}
  }else{
   const id=save(invocation,'result',projection)
   try{hooks.beforeTerminal?.({invocation,generation,handle:id,driver});const child=owner.find(invocation,current().children).value;const method=child.scope.$==='PreparationScope'?(projection.$==='PreparationFinished'?'terminal_preparation':'terminal_preparation_failed'):child.scope.$==='SourceScope'&&projection.$==='SourcePreparationStopped'?'terminal_source_failed':'terminal';apply(invoke(method,invocation,generation,id))}
   finally{release(id,invocation)}
  }
 }
 const action=command=>{
  const invocation=command.invocation
  switch(command.$){
   case 'Launch': launches.set(invocation,command);stats.launches++;break
   case 'LaunchAdviceTail': {
    const held=resources.get(command.input_handle)
    if(!held||held.invocation!==0n||held.kind!=='advice-input'||held.value.origin!==command.origin)throw new Error('Advice launch requires its prepared opaque input')
    const child=owner.find(invocation,current().children)
    if(child.$!=='Some'||child.value.scope.$!=='AdviceTailScope')throw new Error('Advice launch lacks Canonical custody')
    const receipt=Object.freeze({handoff:invocation,scope:child.value.scope})
    resources.set(command.input_handle,{invocation,kind:'input',value:held.value})
    launches.set(invocation,{...command,receipt});stats.launches++;break
   }
   case 'LaunchPostPreparation': {
    try {
     const result=load(command.result_handle,command.preparation_invocation,'result')
     if(result.$!=='PreparationFinished')throw new Error('Invalid preparation handoff payload')
     const receipt=Object.freeze({handoff:invocation,scope:command.scope})
     resources.set(command.result_handle,{invocation,kind:'input',value:result})
     launches.set(invocation,{...command,input_handle:command.result_handle,receipt})
     finished.set(command.preparation_invocation,receipt);stats.launches++;stats.accepted++
    } catch(error){apply(invoke('cancel',invocation));throw error}
    break
   }
   case 'ExecuteProvider':{
    const raw=load(command.state_handle,invocation,'state'),request=engine(invocation).view(raw).request
    if(request.invocation!==invocation||request.id!==command.request)throw new Error('Provider Await binding mismatch')
    if(leases.has(command.lease))throw new Error('Duplicate provider lease')
    leases.set(command.lease,{invocation,request,controller:new AbortController()});stats.providerStarts++;break
   }
   case 'Resume':{
    const raw=load(command.state_handle,invocation,'state'),reply=load(command.reply_handle,invocation,'reply')
    if(reply.error)throw reply.error
    stats.resumes++
    settle(invocation,command.generation,engine(invocation).resume(raw,{$:'Types.ServiceReply',reply:reply.value}));break
   }
   case 'RetireHandle':release(command.state_handle,invocation);break
   case 'CancelChild':{
    sessions.get(invocation)?.revoke();engine(invocation).disposeInvocation(invocation);stats.revoked++
    const pending=launches.get(invocation);if(pending){release(pending.input_handle,invocation);launches.delete(invocation)}
    for(const lease of leases.values())if(lease.invocation===invocation)lease.controller.abort()
    if(sessions.has(invocation))finished.set(invocation,failed());break
   }
   case 'CleanupProvider':{
    const lease=leases.get(command.lease)
    if(!lease||lease.invocation!==invocation)throw new Error('Wrong provider cleanup owner')
    leases.delete(command.lease);stats.providerCleanups++;break
   }
   case 'AcceptResult':{
    // Synchronous handoff in this serialized turn; no queued acceptance permit.
    const result=load(command.result_handle,invocation,'result')
    finished.set(invocation,result.$==='AdviceTailStopped'&&result.reason instanceof Error?{adviceRetained:false,reason:result.reason,cleanupPending:result.cleanupPending}:engine(invocation).accepted?engine(invocation).accepted(result):result.$==='Types.FinishedResolver'?{result:result.result,finalFrame:result.final_frame}:{failure:result.failure})
    release(command.result_handle,invocation);stats.accepted++;break
   }
   default:throw new Error('Unknown owner action '+command.$)
  }
 }
 const executeActions=commands=>{
  let failure
  for(const command of commands){
   if(failure&&!['RetireHandle','CleanupProvider','CancelChild'].includes(command.$))continue
   try{action(command)}catch(error){failure??=error}
  }
  if(failure)throw failure
 }
 const apply=step=>{
  // External control has already committed through resident Ref.modify.
  if(!control)state=step.state
  if(step.$==='Rejected')throw new Error('Canonical resolver refused: '+step.refusal.$)
  if(step.$!=='Advanced')throw new Error('Unknown owner step')
  let failure
  try{executeActions(list(step.actions))}catch(error){failure=error}
  try{hooks.canonicalOutputs?.(list(step.outputs))}catch(error){failure??=error}
  if(failure)throw failure
 }
 const driver={
  allocateInvocation(parent,preparation=false,issuedScope=scope){
   if(current().next_invocation<1n||current().next_invocation>BigInt(Number.MAX_SAFE_INTEGER))throw new RangeError('Invocation exceeds exact native ID range')
   const inputId=save(0n,'pending-input',undefined)
   try{apply(parent?(preparation?invoke('launch_source_preparation',parent,issuedScope,inputId):invoke('launch_nested',parent,inputId)):invoke(issuedScope.$==='SourceScope'?'launch_source':preparation?'launch_preparation':'launch',issuedScope,inputId));const invocation=current().next_invocation-1n;resources.set(inputId,{invocation,kind:'input',value:undefined});return Number(invocation)}
   catch(error){resources.delete(inputId);throw error}
  },
  allocatePreparationInvocation(issuedScope=scope,parent){return driver.allocateInvocation(parent,true,issuedScope)},
  allocateSourceInvocation(issuedScope){return driver.allocateInvocation(undefined,false,issuedScope)},
  prepareAdviceInput(origin,value){if(typeof origin!=='bigint'||origin<1n)throw new Error('Advice input requires its origin');return save(0n,'advice-input',{origin,value})},
  validateAdviceInput(origin,handle){const held=resources.get(handle);return !!held&&held.invocation===0n&&held.kind==='advice-input'&&held.value.origin===origin},
  releaseAdviceInput(handle){release(handle,0n)},
  adviceHandoff(invocation){const launch=launches.get(invocation);if(launch?.$!=='LaunchAdviceTail')throw new Error('Missing advice launch');return launch.receipt},
  async driveAdvice(receipt,session,options={}){
   const launch=launches.get(receipt.handoff)
   if(!launch||launch.$!=='LaunchAdviceTail'||launch.receipt!==receipt){await closeUnregistered(session);throw new Error('Unknown or consumed advice handoff')}
   if(session.input.invocation!==receipt.handoff){await closeUnregistered(session);throw new Error('Advice session changed Canonical invocation')}
   return await driver.drive(session,session.input,options)
  },
  handoffResult(receipt){
   const launch=launches.get(receipt.handoff)
   if(!launch||launch.receipt!==receipt)throw new Error('Unknown preparation handoff capability')
   return {preparation:load(launch.input_handle,receipt.handoff,'input').result}
  },
  async driveHandoff(receipt,session,buildInput,options={}){
   const invocation=receipt.handoff
   if([...sessions.values()].includes(session)||registry.get(session.invocation)===session)throw new Error('Session already owned by an active invocation')
   // Refuse a consumed capability without cancelling its already-running child.
   const launch=launches.get(invocation)
   if(!launch||launch.receipt!==receipt){
    await closeUnregistered(session)
    throw new Error('Unknown or consumed preparation handoff capability')
   }
   let entered=false
   try {
    const result=driver.handoffResult(receipt)
    const input=buildInput(result,invocation,receipt.scope)
    if(input.invocation!==invocation)throw new Error('Post input changed Canonical invocation')
    entered=true
    return await driver.drive(session,input,options)
   }catch(error){
    const child=owner.find(invocation,current().children)
    if(child.$==='Some'&&owner.child_active(child.value))apply(invoke('cancel',invocation))
    throw error
   }finally{
    if(!entered)await closeUnregistered(session)
   }
  },
  async drive(session,input,options={}){
   if([...sessions.values()].includes(session)||registry.get(session.invocation)===session)throw new Error('Session already owned by an active invocation')
   const invocation=input.invocation,launch=launches.get(invocation)
   if(!launch)return registry.run(session,async()=>{throw new Error('Missing Canonical Launch')})
   let taskEntered=false,constructionError
   try{
   launches.delete(invocation);sessions.set(invocation,session)
   machines.set(invocation,(selectMachine?selectMachine(input):undefined)??machine)
   resources.set(launch.input_handle,{invocation,kind:'input',value:input})
   return await registry.run(session,async()=>{
    taskEntered=true
    let abortFailure
    const abort=()=>{try{const child=owner.find(invocation,current().children);if(child.$==='Some'&&owner.child_active(child.value))apply(invoke('cancel',invocation))}catch(error){abortFailure??=error}}
    options.signal?.addEventListener('abort',abort,{once:true})
    try{
     if(options.signal?.aborted)abort()
     if(finished.has(invocation))return finished.get(invocation)
     try{settle(invocation,0n,engine(invocation).initial(load(launch.input_handle,invocation,'input')))}finally{release(launch.input_handle,invocation)}
     while(!finished.has(invocation)){
      apply(invoke('provider_start',invocation))
      const child=owner.find(invocation,current().children).value,lease=leases.get(child.lease.value.id),leaseId=child.lease.value.id
      let payload
      try{
       const signal=options.signal?AbortSignal.any([options.signal,lease.controller.signal]):lease.controller.signal
       hooks.beforeProvider?.({invocation,lease:leaseId,request:lease.request,driver})
       payload={value:await foreign([lease.request],{...options,signal,ownerLease:Object.freeze({invocation,generation:child.generation,lease:leaseId,request:lease.request.id})})}
      }catch(error){payload={error}}
      const replyId=save(invocation,'reply',payload)
      try{
       hooks.beforeCompletion?.({invocation,lease:leaseId,request:lease.request,driver})
       apply(invoke('provider_completed',invocation,leaseId,lease.request.id,replyId))
      }catch(error){
       try{const child=owner.find(invocation,current().children);if(child.$==='Some'&&owner.child_active(child.value))apply(invoke('cancel',invocation))}
       finally{if(leases.has(leaseId))apply(invoke('provider_completed',invocation,leaseId,lease.request.id,replyId))}
       throw error
      }finally{release(replyId,invocation)}
     }
     if(abortFailure)throw abortFailure
     return finished.get(invocation)
    }catch(error){
     const child=owner.find(invocation,current().children)
     if(child.$==='Some'&&owner.child_active(child.value))apply(invoke('cancel',invocation))
     throw error
    }finally{
     options.signal?.removeEventListener('abort',abort)
     // Provider await has settled before registry.run closes native resources.
     await finishSession(session)
    }
   })
   }catch(error){
    const child=owner.find(invocation,current().children)
    if(child.$==='Some'&&owner.child_active(child.value))apply(invoke('cancel',invocation))
    if(!taskEntered&&child.$==='Some'&&child.value.scope.$==='AdviceTailScope'){constructionError=error;session.forceCleanup?.(error)}
    throw error
   }finally{
    try{await finishSession(session)}finally{
     if(constructionError){
      const child=owner.find(invocation,current().children)
      if(child.$==='Some'&&owner.child_active(child.value)){
       if(child.value.lease.$!=='None')throw new Error('Construction failure still owns a provider lease')
       if(!finalizedSessions.has(session)&&!registry.hasCleanup(session))throw new Error('Construction cleanup has no registered owner')
       // finishSession either discharged cleanup or synchronously registered its retry.
       const id=save(invocation,'result',{$:'AdviceTailStopped',reason:constructionError,cleanupPending:!finalizedSessions.has(session)})
       try{apply(invoke('terminal',invocation,child.value.generation,id))}finally{release(id,invocation)}
      }
     }
     const releaseInvocation=()=>{
      try{engine(invocation).disposeInvocation(invocation)}finally{
       machines.delete(invocation);sessions.delete(invocation);finished.delete(invocation)
       for(const [id,held] of resources)if(held.invocation===invocation)release(id,invocation)
       // registry.run owns close when it registered; construction failure does not.
       if(!taskEntered&&registry.get(Number(invocation))!==session)session.close?.()
      }
     }
     const authority=owner.find(invocation,current().children)
     if(authority.$==='Some'&&authority.value.scope.$==='SourceScope'&&owner.child_active(authority.value)){
      // A rejected interrupt is not a closed Source. Preserve its exact opaque
      // handles and session as a visible registry obligation until the closed
      // owner transition succeeds; no host finalizer edits Canonical work.
      registry.retainCleanup(session,async()=>{
       const pending=owner.find(invocation,current().children)
       if(pending.$==='Some'&&owner.child_active(pending.value))apply(invoke('cancel',invocation))
       await finishSession(session)
       releaseInvocation()
      })
     }else releaseInvocation()
    }
   }
  },
  constructionFailed(invocation){apply(invoke('cancel',BigInt(invocation)))},
  cancel(invocation){apply(invoke('cancel',BigInt(invocation)))},
  acceptActions(commands){executeActions(commands)},
  acceptPublication(step){apply(step)},
  canonicalEvent(event){apply(invoke('canonical_event',event))},
  get state(){return current()},get stats(){return {...stats}},
  get resources(){return {payloads:resources.size,leases:leases.size,sessions:sessions.size,artifactStates:[...new Set([machine,...machines.values()])].reduce((total,owned)=>total+owned.retainedHandles,0),launches:launches.size}}
 }
 return driver
}
