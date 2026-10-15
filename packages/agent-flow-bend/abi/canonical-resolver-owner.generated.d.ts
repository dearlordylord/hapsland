// Canonical lifecycle library ABI. Bend 2.0.37 uses number Nat; host conversion relocates imported tags.
import type { Canonical_Output, Canonical_Reason, Canonical_State } from "./raw-canonical-state.d.ts"
import type { Canonical_CanonicalEvent } from "./raw-canonical-event.d.ts"
export type OwnerTransport<Value> = Value extends object ? { readonly [Key in keyof Value]: Key extends "$" ? Value[Key] extends `${string}.${string}` ? `../${Value[Key]}` : Value[Key] : OwnerTransport<Value[Key]> } : Value
export type List<Value> = { readonly $: "Nil" } | { readonly $: "Con"; readonly head: Value; readonly tail: List<Value> }
type Maybe<Value> = { readonly $: "None" } | { readonly $: "Some"; readonly value: Value }
export type ActiveReader = { readonly $: "ActiveReader"; readonly query: (invocation: number) => Maybe<boolean> }
export type State =
  | { readonly $: "State"; readonly canonical: OwnerTransport<Canonical_State>; readonly next_invocation: number; readonly next_lease: number; readonly children: List<Child> }

export type Child =
  | { readonly $: "Child"; readonly scope: Scope; readonly invocation: number; readonly generation: number; readonly handle: number; readonly phase: Phase; readonly request: Maybe<number>; readonly lease: Maybe<Lease>; readonly parent: Maybe<Parent> }

export type Scope =
  | { readonly $: "SettingsScope"; readonly operation: number }
  | { readonly $: "FreshnessScope"; readonly operation: number }
  | { readonly $: "Scope"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly preparation: number }
  | { readonly $: "SourceScope"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly observation: number; readonly permission: SourcePermission }
  | { readonly $: "AfterSourceScope"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly observation: number; readonly barrier_request: number; readonly barrier_generation: number; readonly permission: AfterSourcePermission }
  | { readonly $: "PreparationScope"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly preparation: number }
  | { readonly $: "RetainingScope"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly observation: number; readonly origin: number }
  | { readonly $: "AdviceTailScope"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly origin: number; readonly permission: AdvicePermission }

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
  | { readonly $: "Lease"; readonly id: number; readonly request: number }

export type Parent =
  | { readonly $: "Parent"; readonly invocation: number; readonly generation: number; readonly request: number }

export type Custody =
  | { readonly $: "Custody"; readonly next_invocation: number; readonly next_lease: number; readonly children: List<Child> }

export type Step =
  | { readonly $: "Advanced"; readonly state: State; readonly outputs: List<OwnerTransport<Canonical_Output>>; readonly actions: List<Action> }
  | { readonly $: "Rejected"; readonly state: State; readonly refusal: Refusal }

export type Action =
  | { readonly $: "Launch"; readonly invocation: number; readonly input_handle: number }
  | { readonly $: "LaunchPostPreparation"; readonly invocation: number; readonly preparation_invocation: number; readonly result_handle: number; readonly scope: Scope }
  | { readonly $: "LaunchAdviceTail"; readonly invocation: number; readonly origin: number; readonly operation: number; readonly input_handle: number }
  | { readonly $: "ExecuteProvider"; readonly invocation: number; readonly lease: number; readonly request: number; readonly state_handle: number }
  | { readonly $: "Resume"; readonly invocation: number; readonly generation: number; readonly state_handle: number; readonly reply_handle: number }
  | { readonly $: "RetireHandle"; readonly invocation: number; readonly state_handle: number }
  | { readonly $: "CancelChild"; readonly invocation: number; readonly state_handle: number }
  | { readonly $: "CleanupProvider"; readonly invocation: number; readonly lease: number }
  | { readonly $: "AcceptResult"; readonly scope: Scope; readonly invocation: number; readonly result_handle: number }

export type Refusal =
  | { readonly $: "NotPreparing" }
  | { readonly $: "UnknownInvocation" }
  | { readonly $: "WrongGeneration" }
  | { readonly $: "WrongPhase" }
  | { readonly $: "WrongLease" }
  | { readonly $: "CanonicalRejected"; readonly reason: OwnerTransport<Canonical_Reason> }

export type ResidentEvent =
  | { readonly $: "CanonicalEvent"; readonly event: OwnerTransport<Canonical_CanonicalEvent> }
  | { readonly $: "LaunchSettingsEvent"; readonly input_handle: number }
  | { readonly $: "LaunchFreshnessEvent"; readonly input_handle: number }
  | { readonly $: "LaunchEvent"; readonly scope: Scope; readonly input_handle: number }
  | { readonly $: "LaunchSourceEvent"; readonly scope: Scope; readonly input_handle: number }
  | { readonly $: "LaunchSourcePreparationEvent"; readonly parent: Parent; readonly scope: Scope; readonly input_handle: number }
  | { readonly $: "StartSourceObservationEvent"; readonly invocation: number; readonly generation: number; readonly lease: number; readonly request: number }
  | { readonly $: "CompleteSourceObservationEvent"; readonly invocation: number; readonly generation: number; readonly lease: number; readonly request: number }
  | { readonly $: "LaunchPreparationEvent"; readonly scope: Scope; readonly input_handle: number }
  | { readonly $: "LaunchNestedEvent"; readonly parent: Parent; readonly input_handle: number }
  | { readonly $: "HandoffAdviceEvent"; readonly invocation: number; readonly generation: number; readonly lease: number; readonly request: number; readonly operation: number; readonly input_handle: number }
  | { readonly $: "AdviceCleanupOnlyEvent"; readonly invocation: number }
  | { readonly $: "InstallAfterSourceEvent"; readonly invocation: number; readonly generation: number; readonly handle: number; readonly request: number; readonly permission: AfterSourcePermission }
  | { readonly $: "InstallSourceEvent"; readonly invocation: number; readonly generation: number; readonly handle: number; readonly request: number; readonly permission: SourcePermission }
  | { readonly $: "InstallAdviceEvent"; readonly invocation: number; readonly generation: number; readonly handle: number; readonly request: number; readonly permission: AdvicePermission }
  | { readonly $: "InstallEvent"; readonly invocation: number; readonly generation: number; readonly handle: number; readonly request: number }
  | { readonly $: "ProviderStartEvent"; readonly invocation: number }
  | { readonly $: "ProviderCompletedEvent"; readonly invocation: number; readonly lease: number; readonly request: number; readonly reply_handle: number }
  | { readonly $: "CancelEvent"; readonly invocation: number }
  | { readonly $: "TerminalSourceFailedEvent"; readonly invocation: number; readonly generation: number; readonly result_handle: number }
  | { readonly $: "TerminalPreparationFailedEvent"; readonly invocation: number; readonly generation: number; readonly result_handle: number }
  | { readonly $: "TerminalPreparationEvent"; readonly invocation: number; readonly generation: number; readonly result_handle: number }
  | { readonly $: "TerminalAdvicePreservedEvent"; readonly invocation: number; readonly generation: number; readonly result_handle: number }
  | { readonly $: "TerminalEvent"; readonly invocation: number; readonly generation: number; readonly result_handle: number }

export type Publication =
  | { readonly $: "Published"; readonly canonical: OwnerTransport<Canonical_State>; readonly custody: Custody; readonly outputs: List<OwnerTransport<Canonical_Output>>; readonly actions: List<Action> }
  | { readonly $: "Refused"; readonly refusal: Refusal }

export interface CanonicalResolverOwner {
  initial(canonical: OwnerTransport<Canonical_State>): State
  initial_limits(global_items: number, global_bytes: number, partition_items: number, partition_bytes: number): State
  initial_custody(): Custody
  assembled(canonical: OwnerTransport<Canonical_State>, custody: Custody): State
  find(invocation: number, children: List<Child>): Maybe<Child>
  child_active(child: Child): boolean
  active_reader(children: List<Child>): ActiveReader
  live(canonical: OwnerTransport<Canonical_State>, scope: Scope): boolean
  provider_live(state: State, invocation: number, generation: number, lease: number, request: number): boolean
  advice_provider_allowed(state: State, invocation: number, generation: number, lease: number, request: number, kind: AdvicePermission): boolean
  begin_public_preparation(state: State, partition: number, lifetime: number, round: number, bytes: number): List<Step>
  complete_public_preparation(state: State, partition: number, lifetime: number, round: number, operation: number, observation: number): List<Step>
  canonical_event(state: State, event: OwnerTransport<Canonical_CanonicalEvent>): Step
  launch_settings(state: State, input_handle: number): Step
  launch_freshness(state: State, input_handle: number): Step
  launch(state: State, scope: Scope, input_handle: number): Step
  launch_preparation(state: State, scope: Scope, input_handle: number): Step
  launch_source(state: State, scope: Scope, input_handle: number): Step
  launch_nested(state: State, parent: Parent, input_handle: number): Step
  launch_source_preparation(state: State, parent: Parent, scope: Scope, input_handle: number): Step
  start_source_observation(state: State, invocation: number, generation: number, lease: number, request: number): Step
  complete_source_observation(state: State, invocation: number, generation: number, lease: number, request: number): Step
  handoff_advice(state: State, invocation: number, generation: number, lease: number, request: number, operation: number, input_handle: number): Step
  advice_cleanup_only(state: State, invocation: number): Step
  install(state: State, invocation: number, generation: number, handle: number, request: number): Step
  install_source(state: State, invocation: number, generation: number, handle: number, request: number, permission: SourcePermission): Step
  install_after_source(state: State, invocation: number, generation: number, handle: number, request: number, permission: AfterSourcePermission): Step
  install_advice(state: State, invocation: number, generation: number, handle: number, request: number, permission: AdvicePermission): Step
  provider_start(state: State, invocation: number): Step
  provider_completed(state: State, invocation: number, lease: number, request: number, reply_handle: number): Step
  cancel(state: State, invocation: number): Step
  terminal(state: State, invocation: number, generation: number, result_handle: number): Step
  terminal_source_failed(state: State, invocation: number, generation: number, result_handle: number): Step
  terminal_preparation_failed(state: State, invocation: number, generation: number, result_handle: number): Step
  terminal_preparation(state: State, invocation: number, generation: number, result_handle: number): Step
  terminal_advice_preserved(state: State, invocation: number, generation: number, result_handle: number): Step
  resident_event(state: State, event: ResidentEvent): Step
  resident_step(canonical: OwnerTransport<Canonical_State>, custody: Custody, event: ResidentEvent): Publication
  resident_reconcile(canonical: OwnerTransport<Canonical_State>, custody: Custody): Publication
}
declare const owner: CanonicalResolverOwner
export default owner
