import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
// Effect authority follows all provider descendants. Only an accepted dispatch
// execution explicitly replaces this reference with its independent unit scope.
export const ResidentProviderPermit=Context.Reference('Hapsland.prototype.ResidentProviderPermit',{defaultValue:()=>undefined})
export const dispatchExecutionBoundary=effect=>Effect.provideService(effect,ResidentProviderPermit,undefined)
export const providerTransaction=(transaction,bridge)=>({...transaction,
 commitAllEffect:operation=>Effect.flatMap(ResidentProviderPermit,permit=>
  (permit?(permit.pendingRestore?bridge.nativeRestorePending(permit.credential,permit.pendingRestore,operation,permit.committed):bridge.nativeScoped(permit.credential,operation,permit.committed)):bridge.native(operation)).pipe(Effect.map(publication=>publication.value)))
})
