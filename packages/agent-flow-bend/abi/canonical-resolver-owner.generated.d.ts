// Canonical lifecycle library ABI. Host conversion preserves fields and converts Nat and imported tags.
import type { Canonical_Output, Canonical_Reason, Canonical_State } from "./raw-canonical-state.d.ts"
import type { Canonical_CanonicalEvent } from "./raw-canonical-event.d.ts"
export type OwnerTransport<Value> = Value extends number ? bigint : Value extends object ? { readonly [Key in keyof Value]: Key extends "$" ? Value[Key] extends `${string}.${string}` ? `../${Value[Key]}` : Value[Key] : OwnerTransport<Value[Key]> } : Value
export type List<Value> = { readonly $: "Nil" } | { readonly $: "Con"; readonly head: Value; readonly tail: List<Value> }
type Maybe<Value> = { readonly $: "None" } | { readonly $: "Some"; readonly value: Value }
export type State =
  | { readonly $: "State"; readonly canonical: OwnerTransport<Canonical_State>; readonly next_invocation: bigint; readonly next_lease: bigint; readonly children: List<Child> }

export type Child =
  | { readonly $: "Child"; readonly scope: Scope; readonly invocation: bigint; readonly generation: bigint; readonly handle: bigint; readonly phase: Phase; readonly request: Maybe<bigint>; readonly lease: Maybe<Lease>; readonly parent: Maybe<Parent> }

export type Scope =
  | { readonly $: "SettingsScope"; readonly operation: bigint }
  | { readonly $: "Scope"; readonly partition: bigint; readonly lifetime: bigint; readonly round: bigint; readonly preparation: bigint }
  | { readonly $: "SourceScope"; readonly partition: bigint; readonly lifetime: bigint; readonly round: bigint; readonly observation: bigint; readonly permission: SourcePermission }
  | { readonly $: "AfterSourceScope"; readonly partition: bigint; readonly lifetime: bigint; readonly round: bigint; readonly observation: bigint; readonly barrier_request: bigint; readonly barrier_generation: bigint; readonly permission: AfterSourcePermission }
  | { readonly $: "PreparationScope"; readonly partition: bigint; readonly lifetime: bigint; readonly round: bigint; readonly preparation: bigint }
  | { readonly $: "RetainingScope"; readonly partition: bigint; readonly lifetime: bigint; readonly round: bigint; readonly observation: bigint; readonly origin: bigint }
  | { readonly $: "AdviceTailScope"; readonly partition: bigint; readonly lifetime: bigint; readonly round: bigint; readonly operation: bigint; readonly origin: bigint; readonly permission: AdvicePermission }

export type SourcePermission =
  | { readonly $: "SourceNew" }
  | { readonly $: "SourceStartPolicy" }
  | { readonly $: "SourceStartObservation" }
  | { readonly $: "SourceGate" }
  | { readonly $: "SourceEarlyRelease" }
  | { readonly $: "SourceCandidate" }
  | { readonly $: "SourceActivity" }
  | { readonly $: "SourcePolicy" }
  | { readonly $: "SourceObservation" }

export type AfterSourcePermission =
  | { readonly $: "AfterNewBarrier" }
  | { readonly $: "AfterBarrier" }
  | { readonly $: "AfterRecoveryAnalytics" }
  | { readonly $: "AfterRecoveryRelease" }
  | { readonly $: "AfterRecoveryRuntime" }
  | { readonly $: "AfterRecoveryActivity" }

export type AdvicePermission =
  | { readonly $: "TailNew" }
  | { readonly $: "TailBarrier" }
  | { readonly $: "TailActive" }
  | { readonly $: "TailPublish" }
  | { readonly $: "TailRecord" }
  | { readonly $: "TailRemove" }

export type Phase =
  | { readonly $: "ChildInstalling" }
  | { readonly $: "ChildReady" }
  | { readonly $: "ChildAwaiting" }
  | { readonly $: "ChildResuming" }
  | { readonly $: "ChildAccepted" }
  | { readonly $: "ChildCancelled" }

export type Lease =
  | { readonly $: "Lease"; readonly id: bigint; readonly request: bigint }

export type Parent =
  | { readonly $: "Parent"; readonly invocation: bigint; readonly generation: bigint; readonly request: bigint }

export type Custody =
  | { readonly $: "Custody"; readonly next_invocation: bigint; readonly next_lease: bigint; readonly children: List<Child> }

export type Step =
  | { readonly $: "Advanced"; readonly state: State; readonly outputs: List<OwnerTransport<Canonical_Output>>; readonly actions: List<Action> }
  | { readonly $: "Rejected"; readonly state: State; readonly refusal: Refusal }

export type Action =
  | { readonly $: "Launch"; readonly invocation: bigint; readonly input_handle: bigint }
  | { readonly $: "LaunchPostPreparation"; readonly invocation: bigint; readonly preparation_invocation: bigint; readonly result_handle: bigint; readonly scope: Scope }
  | { readonly $: "LaunchAdviceTail"; readonly invocation: bigint; readonly origin: bigint; readonly operation: bigint; readonly input_handle: bigint }
  | { readonly $: "ExecuteProvider"; readonly invocation: bigint; readonly lease: bigint; readonly request: bigint; readonly state_handle: bigint }
  | { readonly $: "Resume"; readonly invocation: bigint; readonly generation: bigint; readonly state_handle: bigint; readonly reply_handle: bigint }
  | { readonly $: "RetireHandle"; readonly invocation: bigint; readonly state_handle: bigint }
  | { readonly $: "CancelChild"; readonly invocation: bigint; readonly state_handle: bigint }
  | { readonly $: "CleanupProvider"; readonly invocation: bigint; readonly lease: bigint }
  | { readonly $: "AcceptResult"; readonly scope: Scope; readonly invocation: bigint; readonly result_handle: bigint }

export type Refusal =
  | { readonly $: "NotPreparing" }
  | { readonly $: "UnknownInvocation" }
  | { readonly $: "WrongGeneration" }
  | { readonly $: "WrongPhase" }
  | { readonly $: "WrongLease" }
  | { readonly $: "CanonicalRejected"; readonly reason: OwnerTransport<Canonical_Reason> }

export type ResidentEvent =
  | { readonly $: "CanonicalEvent"; readonly event: OwnerTransport<Canonical_CanonicalEvent> }
  | { readonly $: "LaunchSettingsEvent"; readonly input_handle: bigint }
  | { readonly $: "LaunchEvent"; readonly scope: Scope; readonly input_handle: bigint }
  | { readonly $: "LaunchSourceEvent"; readonly scope: Scope; readonly input_handle: bigint }
  | { readonly $: "LaunchSourcePreparationEvent"; readonly parent: Parent; readonly scope: Scope; readonly input_handle: bigint }
  | { readonly $: "StartSourceObservationEvent"; readonly invocation: bigint; readonly generation: bigint; readonly lease: bigint; readonly request: bigint }
  | { readonly $: "CompleteSourceObservationEvent"; readonly invocation: bigint; readonly generation: bigint; readonly lease: bigint; readonly request: bigint }
  | { readonly $: "LaunchPreparationEvent"; readonly scope: Scope; readonly input_handle: bigint }
  | { readonly $: "LaunchNestedEvent"; readonly parent: Parent; readonly input_handle: bigint }
  | { readonly $: "HandoffAdviceEvent"; readonly invocation: bigint; readonly generation: bigint; readonly lease: bigint; readonly request: bigint; readonly operation: bigint; readonly input_handle: bigint }
  | { readonly $: "AdviceCleanupOnlyEvent"; readonly invocation: bigint }
  | { readonly $: "InstallAfterSourceEvent"; readonly invocation: bigint; readonly generation: bigint; readonly handle: bigint; readonly request: bigint; readonly permission: AfterSourcePermission }
  | { readonly $: "InstallSourceEvent"; readonly invocation: bigint; readonly generation: bigint; readonly handle: bigint; readonly request: bigint; readonly permission: SourcePermission }
  | { readonly $: "InstallAdviceEvent"; readonly invocation: bigint; readonly generation: bigint; readonly handle: bigint; readonly request: bigint; readonly permission: AdvicePermission }
  | { readonly $: "InstallEvent"; readonly invocation: bigint; readonly generation: bigint; readonly handle: bigint; readonly request: bigint }
  | { readonly $: "ProviderStartEvent"; readonly invocation: bigint }
  | { readonly $: "ProviderCompletedEvent"; readonly invocation: bigint; readonly lease: bigint; readonly request: bigint; readonly reply_handle: bigint }
  | { readonly $: "CancelEvent"; readonly invocation: bigint }
  | { readonly $: "TerminalSourceFailedEvent"; readonly invocation: bigint; readonly generation: bigint; readonly result_handle: bigint }
  | { readonly $: "TerminalPreparationFailedEvent"; readonly invocation: bigint; readonly generation: bigint; readonly result_handle: bigint }
  | { readonly $: "TerminalPreparationEvent"; readonly invocation: bigint; readonly generation: bigint; readonly result_handle: bigint }
  | { readonly $: "TerminalAdvicePreservedEvent"; readonly invocation: bigint; readonly generation: bigint; readonly result_handle: bigint }
  | { readonly $: "TerminalEvent"; readonly invocation: bigint; readonly generation: bigint; readonly result_handle: bigint }

export type Publication =
  | { readonly $: "Published"; readonly canonical: OwnerTransport<Canonical_State>; readonly custody: Custody; readonly outputs: List<OwnerTransport<Canonical_Output>>; readonly actions: List<Action> }
  | { readonly $: "Refused"; readonly refusal: Refusal }

export interface CanonicalResolverOwner {
  initial(canonical: OwnerTransport<Canonical_State>): State
  initial_limits(global_items: bigint, global_bytes: bigint, partition_items: bigint, partition_bytes: bigint): State
  initial_custody(): Custody
  assembled(canonical: OwnerTransport<Canonical_State>, custody: Custody): State
  find(invocation: bigint, children: List<Child>): Maybe<Child>
  child_active(child: Child): boolean
  live(canonical: OwnerTransport<Canonical_State>, scope: Scope): boolean
  provider_live(state: State, invocation: bigint, generation: bigint, lease: bigint, request: bigint): boolean
  advice_provider_allowed(state: State, invocation: bigint, generation: bigint, lease: bigint, request: bigint, kind: AdvicePermission): boolean
  begin_public_preparation(state: State, partition: bigint, lifetime: bigint, round: bigint, bytes: bigint): List<Step>
  complete_public_preparation(state: State, partition: bigint, lifetime: bigint, round: bigint, operation: bigint, observation: bigint): List<Step>
  canonical_event(state: State, event: OwnerTransport<Canonical_CanonicalEvent>): Step
  launch_settings(state: State, input_handle: bigint): Step
  launch(state: State, scope: Scope, input_handle: bigint): Step
  launch_preparation(state: State, scope: Scope, input_handle: bigint): Step
  launch_source(state: State, scope: Scope, input_handle: bigint): Step
  launch_nested(state: State, parent: Parent, input_handle: bigint): Step
  launch_source_preparation(state: State, parent: Parent, scope: Scope, input_handle: bigint): Step
  start_source_observation(state: State, invocation: bigint, generation: bigint, lease: bigint, request: bigint): Step
  complete_source_observation(state: State, invocation: bigint, generation: bigint, lease: bigint, request: bigint): Step
  handoff_advice(state: State, invocation: bigint, generation: bigint, lease: bigint, request: bigint, operation: bigint, input_handle: bigint): Step
  advice_cleanup_only(state: State, invocation: bigint): Step
  install(state: State, invocation: bigint, generation: bigint, handle: bigint, request: bigint): Step
  install_source(state: State, invocation: bigint, generation: bigint, handle: bigint, request: bigint, permission: SourcePermission): Step
  install_after_source(state: State, invocation: bigint, generation: bigint, handle: bigint, request: bigint, permission: AfterSourcePermission): Step
  install_advice(state: State, invocation: bigint, generation: bigint, handle: bigint, request: bigint, permission: AdvicePermission): Step
  provider_start(state: State, invocation: bigint): Step
  provider_completed(state: State, invocation: bigint, lease: bigint, request: bigint, reply_handle: bigint): Step
  cancel(state: State, invocation: bigint): Step
  terminal(state: State, invocation: bigint, generation: bigint, result_handle: bigint): Step
  terminal_source_failed(state: State, invocation: bigint, generation: bigint, result_handle: bigint): Step
  terminal_preparation_failed(state: State, invocation: bigint, generation: bigint, result_handle: bigint): Step
  terminal_preparation(state: State, invocation: bigint, generation: bigint, result_handle: bigint): Step
  terminal_advice_preserved(state: State, invocation: bigint, generation: bigint, result_handle: bigint): Step
  resident_event(state: State, event: ResidentEvent): Step
  resident_step(canonical: OwnerTransport<Canonical_State>, custody: Custody, event: ResidentEvent): Publication
  resident_reconcile(canonical: OwnerTransport<Canonical_State>, custody: Custody): Publication
}
declare const owner: CanonicalResolverOwner
export default owner
