import type * as Owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import type { NativeSession } from "@hapsland/runtime-environment/runtime/native-session-registry"

// Existing committed Canonical entries; domain adapters cannot add actions or
// change their execution order. Parameters retain the owner ABI correlation.
export type Method =
  | "launch"
  | "launch_source"
  | "launch_source_preparation"
  | "launch_preparation"
  | "launch_nested"
  | "install"
  | "install_source"
  | "install_after_source"
  | "install_advice"
  | "provider_start"
  | "provider_completed"
  | "cancel"
  | "terminal"
  | "terminal_source_failed"
  | "terminal_preparation_failed"
  | "terminal_preparation"
  | "terminal_advice_preserved"
  | "canonical_event"
type EntryArguments = {
  [M in Method]: Parameters<Owner.CanonicalResolverOwner[M]> extends [Owner.State, ...infer Args] ? Args : never
}
export type Arguments<M extends Method> = EntryArguments[M]
export type ControlledStep =
  | Omit<Extract<Owner.Step, { readonly $: "Advanced" }>, "state">
  | Omit<Extract<Owner.Step, { readonly $: "Rejected" }>, "state">
export type Control = {
  readState(): Owner.State
  invoke<M extends Method>(method: M, args: Arguments<M>): ControlledStep
}
export type Installation =
  | { readonly method: "install" }
  | { readonly method: "install_source"; readonly permission: Owner.SourcePermission }
  | { readonly method: "install_after_source"; readonly permission: Owner.AfterSourcePermission }
  | { readonly method: "install_advice"; readonly permission: Owner.AdvicePermission }
export type TerminalMethod =
  | "terminal"
  | "terminal_source_failed"
  | "terminal_preparation_failed"
  | "terminal_preparation"
  | "terminal_advice_preserved"
export type Session = NativeSession & {
  revoke(): unknown
  finish?: () => unknown | Promise<unknown>
  forceCleanup?: (error: unknown) => unknown
}
export type Input = { readonly invocation: bigint | number; readonly kind?: never }
export type Machine = { disposeInvocation(invocation: bigint): void; readonly retainedHandles: number }
export type Request = { readonly invocation: bigint; readonly id: bigint }
export type Projection = { readonly kind: string; readonly view: { readonly $: string } }
export type PreparationHandoff = {
  readonly handoff: bigint
  readonly scope: Extract<Owner.Scope, { $: "RetainingScope" }>
}
export type CancellationOutcome = { readonly failure: { readonly $: "Types.InvocationCancelled" } }
export type ConstructionOutcome = {
  readonly adviceRetained: false
  readonly reason: unknown
  readonly cleanupPending: boolean
}
export type Outcome<Accepted> = Accepted | PreparationHandoff | CancellationOutcome | ConstructionOutcome

// Opaque continuations and projections remain with their machine owner. These
// ports project only the existing Canonical entry and physical ABI facts.
export type Protocol<
  I extends Input,
  M extends Machine,
  C,
  P extends Projection,
  R extends Request,
  Reply,
  Accepted,
  Preparation,
  S extends Session
> = {
  initial(machine: M, input: I): C
  view(continuation: C): P
  resume(continuation: C, reply: Reply): C
  awaitRequest(projection: P): R | undefined
  installation(projection: P, scope: Owner.Scope): Installation
  terminal(projection: P, scope: Owner.Scope): TerminalMethod
  accepted(projection: P): Accepted
  preparation(projection: P): Preparation
  projectTerminal(outcome: Outcome<Accepted>, session: S): Outcome<Accepted>
}
