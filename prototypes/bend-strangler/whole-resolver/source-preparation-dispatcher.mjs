// Mechanical Canonical driver envelope for the outer source cursor.
export function createSourcePreparationMachine(core){
 return {
  initial:input=>input.sourcePreparation.entry==='after-gates'?core.initial_after_gates(input.invocation,input.sourcePreparation.policyRequired,input.sourcePreparation.candidates):core.initial(input.invocation,input.sourcePreparation.policyRequired,input.sourcePreparation.controlledPresent,input.sourcePreparation.candidates),
  resume:(step,event)=>{
   if(event.$!=='Types.ServiceReply')throw new Error('Invalid source reply envelope')
   const resumed=core.resume(step,event.reply)
   return resumed.$==='Rejected'?step:resumed
  },
  permission:request=>({$:['SourceNew','SourceCandidate','SourceActivity','SourcePolicy','SourceObservation',undefined,'SourceStartPolicy','SourceStartObservation','SourceGate','SourceEarlyRelease'][Number(core.permission(request.command))]}),
  afterPermission:request=>{
   const permission={AfterPrepare:'AfterBarrier',RecordPreparationFailureAnalytics:'AfterRecoveryAnalytics',ReleaseJobReservation:'AfterRecoveryRelease',ReadRuntimeActive:'AfterRecoveryRuntime',RecordUnavailableActivity:'AfterRecoveryActivity'}[request.command.$]
   if(!permission)throw new Error('Invalid after-source command')
   return {$:permission}
  },
  view:step=>{
   if(step.$==='Await')return {$:'Types.AwaitService',request:step.request}
   if(step.$==='Finished')return {$:'SourcePreparationFinished',completed:true}
   if(step.$==='Stopped')return {$:'SourcePreparationStopped',completed:step.completed,reason:step.reason}
   throw new Error('Invalid source cursor projection')
  },
  accepted:projection=>({completed:projection.completed,continued:projection.$==='SourcePreparationFinished',reason:projection.reason}),
  disposeInvocation(){},
  get retainedHandles(){return 0}
 }
}
