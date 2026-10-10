import {createArtifactMachine} from './artifact-dispatcher.mjs'
// Effect/lifetime adapter for actual Canonical owner actions. Root selection and
// resident retention are not implemented here: this is a composed intermediate.
export function createOwnedArtifactDriver({owner,initialState,scope,artifacts,registry,foreign,hooks={}}){
 const machine=createArtifactMachine({...artifacts,retainPrefixes:false})
 let state=initialState,nextHandle=1n
 const resources=new Map(),leases=new Map(),launches=new Map(),sessions=new Map(),finished=new Map()
 const stats={launches:0,resumes:0,accepted:0,providerStarts:0,providerCleanups:0,revoked:0,discarded:0}
 const list=value=>{const out=[];while(value.$==='Con'){out.push(value.head);value=value.tail}if(value.$!=='Nil')throw new Error('Malformed owner action list');return out}
 const save=(invocation,kind,value)=>{const id=nextHandle++;resources.set(id,{invocation,kind,value});return id}
 const load=(id,invocation,kind)=>{const held=resources.get(id);if(!held||held.invocation!==invocation||held.kind!==kind)throw new Error('Wrong opaque resource ownership');return held.value}
 const release=(id,invocation)=>{const held=resources.get(id);if(held&&held.invocation===invocation){resources.delete(id);stats.discarded++}}
 const failed=()=>({failure:{$:'Types.InvocationCancelled'}})
 const settle=(invocation,generation,raw)=>{
  const projection=machine.view(raw)
  if(projection.$==='Types.AwaitService'){
   if(projection.request.invocation!==invocation)throw new Error('Artifact request owner mismatch')
   const id=save(invocation,'state',raw);let transferred=false
   try{hooks.beforeInstall?.({invocation,generation,handle:id,request:projection.request,driver});const step=owner.install(state,invocation,generation,id,projection.request.id);apply(step);transferred=true}
   finally{if(!transferred)release(id,invocation)}
  }else{
   const id=save(invocation,'result',projection)
   try{hooks.beforeTerminal?.({invocation,generation,handle:id,driver});apply(owner.terminal(state,invocation,generation,id))}
   finally{release(id,invocation)}
  }
 }
 const action=command=>{
  const invocation=command.invocation
  switch(command.$){
   case 'Launch': launches.set(invocation,command);stats.launches++;break
   case 'ExecuteProvider':{
    const raw=load(command.state_handle,invocation,'state'),request=machine.view(raw).request
    if(request.invocation!==invocation||request.id!==command.request)throw new Error('Provider Await binding mismatch')
    if(leases.has(command.lease))throw new Error('Duplicate provider lease')
    leases.set(command.lease,{invocation,request,controller:new AbortController()});stats.providerStarts++;break
   }
   case 'Resume':{
    const raw=load(command.state_handle,invocation,'state'),reply=load(command.reply_handle,invocation,'reply')
    if(reply.error)throw reply.error
    stats.resumes++
    settle(invocation,command.generation,machine.resume(raw,{$:'Types.ServiceReply',reply:reply.value}));break
   }
   case 'RetireHandle':release(command.state_handle,invocation);break
   case 'CancelChild':{
    sessions.get(invocation)?.revoke();machine.disposeInvocation(invocation);stats.revoked++
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
    finished.set(invocation,result.$==='Types.FinishedResolver'?{result:result.result,finalFrame:result.final_frame}:{failure:result.failure})
    release(command.result_handle,invocation);stats.accepted++;break
   }
   default:throw new Error('Unknown owner action '+command.$)
  }
 }
 const apply=step=>{
  // Commit revoked continuation rights before any output or physical action.
  state=step.state
  if(step.$==='Rejected')throw new Error('Canonical resolver refused: '+step.refusal.$)
  if(step.$!=='Advanced')throw new Error('Unknown owner step')
  let failure
  for(const command of list(step.actions)){
   if(failure&&!['RetireHandle','CleanupProvider','CancelChild'].includes(command.$))continue
   try{action(command)}catch(error){failure??=error}
  }
  try{hooks.canonicalOutputs?.(list(step.outputs))}catch(error){failure??=error}
  if(failure)throw failure
 }
 const driver={
  allocateInvocation(){
   if(state.next_invocation<1n||state.next_invocation>BigInt(Number.MAX_SAFE_INTEGER))throw new RangeError('Invocation exceeds exact native ID range')
   const inputId=save(0n,'pending-input',undefined)
   try{apply(owner.launch(state,scope,inputId));const invocation=state.next_invocation-1n;resources.set(inputId,{invocation,kind:'input',value:undefined});return Number(invocation)}
   catch(error){resources.delete(inputId);throw error}
  },
  async drive(session,input,options={}){
   const invocation=input.invocation,launch=launches.get(invocation)
   if(!launch)return registry.run(session,async()=>{throw new Error('Missing Canonical Launch')})
   launches.delete(invocation);sessions.set(invocation,session)
   resources.set(launch.input_handle,{invocation,kind:'input',value:input})
   return registry.run(session,async()=>{
    let abortFailure
    const abort=()=>{try{const child=owner.find(invocation,state.children);if(child.$==='Some'&&owner.child_active(child.value))apply(owner.cancel(state,invocation))}catch(error){abortFailure??=error}}
    options.signal?.addEventListener('abort',abort,{once:true})
    try{
     if(options.signal?.aborted)abort()
     if(finished.has(invocation))return finished.get(invocation)
     try{settle(invocation,0n,machine.initial(load(launch.input_handle,invocation,'input')))}finally{release(launch.input_handle,invocation)}
     while(!finished.has(invocation)){
      apply(owner.provider_start(state,invocation))
      const child=owner.find(invocation,state.children).value,lease=leases.get(child.lease.value.id),leaseId=child.lease.value.id
      let payload
      try{
       const signal=options.signal?AbortSignal.any([options.signal,lease.controller.signal]):lease.controller.signal
       hooks.beforeProvider?.({invocation,lease:leaseId,request:lease.request,driver})
       payload={value:await foreign([lease.request],{...options,signal})}
      }catch(error){payload={error}}
      const replyId=save(invocation,'reply',payload)
      try{
       hooks.beforeCompletion?.({invocation,lease:leaseId,request:lease.request,driver})
       apply(owner.provider_completed(state,invocation,leaseId,lease.request.id,replyId))
      }catch(error){
       try{const child=owner.find(invocation,state.children);if(child.$==='Some'&&owner.child_active(child.value))apply(owner.cancel(state,invocation))}
       finally{if(leases.has(leaseId))apply(owner.provider_completed(state,invocation,leaseId,lease.request.id,replyId))}
       throw error
      }finally{release(replyId,invocation)}
     }
     if(abortFailure)throw abortFailure
     return finished.get(invocation)
    }catch(error){
     const child=owner.find(invocation,state.children)
     if(child.$==='Some'&&owner.child_active(child.value))apply(owner.cancel(state,invocation))
     throw error
    }finally{
     options.signal?.removeEventListener('abort',abort)
     // Provider await has settled before registry.run closes native resources.
     machine.disposeInvocation(invocation);sessions.delete(invocation);finished.delete(invocation)
     for(const [id,held] of resources)if(held.invocation===invocation)release(id,invocation)
    }
   })
  },
  constructionFailed(invocation){apply(owner.cancel(state,BigInt(invocation)))},
  cancel(invocation){apply(owner.cancel(state,BigInt(invocation)))},
  canonicalEvent(event){apply(owner.canonical_event(state,event))},
  get state(){return state},get stats(){return {...stats}},
  get resources(){return {payloads:resources.size,leases:leases.size,sessions:sessions.size,artifactStates:machine.retainedHandles,launches:launches.size}}
 }
 return driver
}
