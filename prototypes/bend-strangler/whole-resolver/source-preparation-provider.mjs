import {decodeControlledOptions} from '../../../packages/resident-runtime/src/resident/authorization/controlled.ts'
import {verifyObservationRoot} from '@hapsland/native-observation/direct-event/adapter'
import {effectiveSessionAnalytics} from '@hapsland/runtime-inputs/configuration/resolve'
import * as Effect from 'effect/Effect'
import {recordActivity} from '@hapsland/activity-observation/activity/status'
import {captureWorkspaceBytes} from '../../../packages/resident-runtime/src/resident/work-ownership/workspace.ts'
import {withinWork} from '../../../packages/resident-runtime/src/resident/work-ownership/cancellation.ts'
import {ResidentAdapterError} from '../../../packages/resident-runtime/src/resident/adapter-error.ts'
import {ResidentProviderPermit,ResidentResourceReceipt} from './resident-provider-permit.mjs'
import {createPostPreparationProvider} from './post-preparation-host.mjs'
import {decodePreparationResult} from './preparation-result-codec.mjs'
import {list,unlist} from './service-session.mjs'

// Foreign effects and opaque receipts for one whole source. The cursor chooses
// admission, refusal reporting, candidate progression and source completion.
export function createSourcePreparationProvider(invocation,context,{owner,bridge,driver,candidates,buildPreparationSession,analyticsEnabled=false,entry='full'}){
 const handles=new Map(candidates.map((candidate,index)=>[BigInt(index+1),candidate]))
 const preparations=new Map(),errors=new Map(),expected=new Map()
 let revoked=false,closed=false,finished=false,primaryFailure,controlled,credentialRequired
 const run=Effect.runPromise,ledger=context.deps.residentLedger,job=context.job
 const activity=fields=>recordActivity({statePath:job.dispatch.activityPath,root:job.observation.root,advicee:job.observation.advicee,lifetime:context.deps.lifetime,...fields})
 const candidate=handle=>{const value=handles.get(handle);if(!value)throw new Error('Unknown source candidate');return value}
 return {
  invocation:Number(invocation),
  input:{invocation,sourcePreparation:{entry,controlledPresent:job.dispatch.controlled!==null,policyRequired:job.round!==undefined&&job.workObservationId!==undefined,candidates:list([...handles.keys()])}},
  error:token=>errors.get(token),
  revoke(){revoked=true},close(){closed=true},
  async finish(){
   if(finished)return
   // Only exact resources acquired by this source; transferred units are owned
   // by their independent dispatcher/advice scope and are never swept here.
   const failures=[]
   const attempt=async(effect,settled=()=>{})=>{try{await run(Effect.uninterruptible(effect));settled()}catch(error){failures.push(error)}}
   for(const receipt of preparations.values())if(context.activeWorkspaces.has(receipt.preparation.reservation)){
    await attempt(ledger.release(receipt.preparation.reservation),()=>context.activeWorkspaces.delete(receipt.preparation.reservation))
   }
   if(job.reservation!==undefined)await attempt(ledger.release(job.reservation))
   for(const key of [...context.unassignedClaims])await attempt(context.deps.residentReleaseReuseClaim(key),()=>context.unassignedClaims.delete(key))
   if(failures.length)throw new AggregateError(primaryFailure===undefined?failures:[primaryFailure,...failures],'Source resource cleanup remains incomplete',{cause:primaryFailure??failures[0]})
   finished=true
  },
  async perform(request,options={}){
   if(revoked||closed||options.signal?.aborted)throw new Error('Revoked source session')
   if(request.invocation!==invocation)throw new Error('Wrong source invocation')
   const command=request.command
   let response={$:'Ack'},observationCommitted=false
   const committed=publication=>options.afterCommit?.(command,publication)
   const scoped=effect=>run(Effect.uninterruptible(effect).pipe(Effect.provideService(ResidentProviderPermit,{credential:options.ownerLease,committed}),Effect.provideService(ResidentResourceReceipt,committed)))
   try{
    options.beforeCommand?.(command)
    switch(command.$){
     case 'StartPolicySource':response={$:'GateAccepted',value:await scoped(ledger.rounds.policyWork(job.round).pipe(Effect.map(policy=>policy.startSource(job.workObservationId))))};break
     case 'StartObservation':response={$:'GateAccepted',value:!(await run(bridge.startSourceObservation(options.ownerLease,committed))).refusal};break
     case 'AwaitBackendGate':await scoped(context.deps.residentAwaitBackendGate());break
     case 'ReadRuntimeActive':response={$:'Active',value:(await scoped(ledger.runtime.snapshot())).lifecycle==='active'};break
     case 'DecodeControlled':controlled=decodeControlledOptions(job.dispatch.controlled);response={$:'GateAccepted',value:controlled!==undefined};break
     case 'ReadCredentialRequired':credentialRequired=context.deps.residentCredentialRequired(controlled);break
     case 'CheckCredentialShape':response={$:'GateAccepted',value:context.deps.residentCredentialShapeMatches(job.dispatch,job.settings.credentialEnvVar,credentialRequired)};break
     case 'VerifyObservationRoot':response={$:'GateAccepted',value:await run(withinWork(verifyObservationRoot(job.observation),context.preparationSignal))};break
     case 'CheckCredentialGeneration':response={$:'GateAccepted',value:context.deps.residentCredentialGenerationCurrent(job.dispatch,credentialRequired)};break
     case 'ReleaseJobReservation':if(job.reservation!==undefined)await scoped(ledger.release(job.reservation));break
     case 'CheckJobActive':response={$:'Active',value:await scoped(context.deps.residentJobActive(job))};break
     case 'RecordPreparationFailureAnalytics':await scoped(context.deps.residentRecordAnalytics(job,'preparation-failed'));break
     case 'RecordUnavailableActivity':activity({stage:'unavailable'});break
     case 'ReadEffectiveAnalytics':analyticsEnabled=effectiveSessionAnalytics(job.settings.configuration.policy);job.analyticsEnabled=analyticsEnabled;break
     case 'CheckCandidateActive':candidate(command.candidate);response={$:'Active',value:await scoped(context.deps.residentJobActive(job))};break
     case 'AdmitCandidateWorkspace':{
      const selected=candidate(command.candidate),requestedBytes=captureWorkspaceBytes(selected.path)
      let receipt
      const onCommitted=publication=>{
       if(publication.value?.status==='admitted'){
        receipt=Object.freeze({handle:request.id+1n,candidate:command.candidate,invocation,admissionRequest:request.id,preparation:publication.value})
        preparations.set(receipt.handle,receipt);context.activeWorkspaces.add(receipt.preparation.reservation)
       }
       committed(publication)
      }
      const result=await run(Effect.uninterruptible(ledger.beginObservedPreparation(job.partition,job.canonicalObservationId,requestedBytes,job.canonicalRound)).pipe(Effect.provideService(ResidentProviderPermit,{credential:options.ownerLease,committed:onCommitted})))
      const reasons={'stale-round':'StaleRound','wrong-stage':'WrongStage'}
      response=result.status==='admitted'?{$:'WorkspaceAdmitted',preparation:receipt.handle}:{$:'WorkspaceRefused',requested_bytes:BigInt(requestedBytes),reason:result.status==='capacity-refused'?{$:'CapacityRefused'}:result.status==='unavailable'?{$:'Unavailable',reason:{$:reasons[result.reason]??(()=>{throw new Error('Unknown workspace unavailability')})()}}:{$:'InvalidMeasurement'}}
      break
     }
     case 'PrepareCandidate':{
      const receipt=preparations.get(command.preparation)
      if(!receipt||receipt.invocation!==invocation||receipt.candidate!==command.candidate||receipt.admissionRequest+1n!==request.id)throw new Error('Candidate preparation differs from issued admission receipt')
      const child=owner.find(invocation,driver.state.children).value
      const parent={$:'Parent',invocation,generation:child.generation,request:request.id}
      const prepInvocation=driver.allocatePreparationInvocation({$:'PreparationScope',partition:child.scope.partition,lifetime:child.scope.lifetime,round:child.scope.round,preparation:BigInt(receipt.preparation.operation)},parent)
      const session=await buildPreparationSession(prepInvocation,candidate(command.candidate),receipt.preparation)
      const handoff=await driver.drive(session,session.input,{signal:options.signal})
      if(!handoff.handoff)throw session.error?.(handoff.failure?.reason?.token)??Object.assign(new Error('Preparation child failed: '+String(handoff.failure?.reason??handoff.failure?.$)),{cause:handoff.failure})
      const result=driver.handoffResult(handoff).preparation
      const prepared=decodePreparationResult(result,job.observation.advicee)
      const pathObservation={...job.observation,candidates:[candidate(command.candidate)]}
      const post=createPostPreparationProvider(handoff.handoff,context,prepared,receipt.preparation,pathObservation,analyticsEnabled)
      const accepted=await driver.driveHandoff(handoff,post,()=>post.input,{signal:options.signal})
      if(['TechnicalFailure','InvocationCancelled'].includes(accepted.reason?.$))throw post.error(accepted.reason.token)??new Error('Post-preparation failed: '+accepted.reason.$)
      if(accepted.failure)throw options.signal?.reason??Object.assign(new Error('Post-preparation invocation cancelled'),{cause:accepted.failure})
      response={$:'CandidateContinued',value:accepted.continued===true};break
     }
     case 'ObserveCandidateDiagnostic':{
      const selected=candidate(command.candidate),diagnostic=command.diagnostic
      const value=diagnostic.$==='WorkspaceCapacity'?{stage:'preparation',code:'preparation-resource-refused',args:{phase:'capture-workspace',requestedBytes:Number(diagnostic.requested_bytes)}}:diagnostic.$==='WorkspaceUnavailable'?{stage:'preparation',code:'preparation-unavailable',args:{reason:diagnostic.reason.$==='StaleRound'?'stale-round':'wrong-stage'}}:{stage:'preparation',code:'panic',args:{boundary:'review-preparation'}}
      context.deps.residentInspection.observeDiagnostic(job.inspectionReceipt,selected.path,selected.path,value);break
     }
     case 'RejectCandidateCapacity':await scoped(ledger.runtime.rejectCapacity());break
     case 'RecordCandidateAnalytics':await scoped(context.deps.residentRecordAnalytics(job,command.outcome.$==='CapacityRejected'?'capacity-rejected':'preparation-failed'));break
     case 'RecordCandidateUnavailable':activity({stage:'unavailable'});break
     case 'ReadExpectedActivity':{
      expected.clear();context.expectedActivityUnits.forEach((identity,index)=>expected.set(BigInt(index+1),identity));response={$:'ExpectedActivity',identities:list([...expected.keys()])};break
     }
     case 'RecordPendingActivity':activity({stage:'pending',expectedUnitIdentities:unlist(command.identities).map(handle=>{if(!expected.has(handle))throw new Error('Unknown expected activity receipt');return expected.get(handle)})});break
     case 'CompletePolicySource':response={$:'CompletionAccepted',value:await scoped(ledger.rounds.policyWork(job.round).pipe(Effect.map(policy=>policy.completeSource(job.workObservationId))))};break
     case 'CompleteObservation':
      await run(bridge.completeSourceObservation(options.ownerLease,publication=>{observationCommitted=true;job.completed=true;committed(publication)}));response={$:'CompletionAccepted',value:true};break
     case 'AfterPrepare':await run(withinWork(context.deps.residentPreparationControls.afterPrepare.pipe(Effect.mapError(()=>new ResidentAdapterError({operation:'preparation barrier'}))),context.preparationSignal));break
     default:throw new Error('Unknown source command '+command.$)
    }
   }catch(error){primaryFailure??=error;const token=BigInt(errors.size+1);errors.set(token,error);response={$:observationCommitted?'ObservationCommittedFailure':options.signal?.aborted?'Cancelled':'Failed',token}}
   return {$:'Reply',invocation,id:request.id,response}
  }
 }
}
