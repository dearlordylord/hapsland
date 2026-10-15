import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"

type Maybe<Value> = { readonly $: "None" } | { readonly $: "Some"; readonly value: Value }
export type Reference =
  | { readonly $: "Model.Named"; readonly name: string; readonly target_id: Maybe<string> }
  | { readonly $: "Model.Unsupported"; readonly name: string }
export type Declaration = {
  readonly $: "Model.Declaration"
  readonly slot: number
  readonly identity: string
  readonly name: string
  readonly references: List<Reference>
}
export type Catalog = {
  readonly $: "Model.Catalog"
  readonly declarations: List<Declaration>
  readonly supporting: List<{ readonly $: "Model.Supporting"; readonly key: string; readonly declaration: Declaration }>
}
export type Purpose = { readonly $: "Trees" | "Outcomes" | "Preflight" }
export type Failure = { readonly $: "Model.MissingEvidence" | "Model.UnsupportedReference" | "Model.ReferenceLimit" }
export type ReferencePlan =
  | {
      readonly $: "Model.Omitted"
      readonly symbol: string
      readonly target: Maybe<string>
      readonly reason: { readonly $: "Model.Unresolved" | "Model.UnsupportedSyntax" | "Model.LimitExceeded" }
    }
  | { readonly $: "Model.Included"; readonly symbol: string; readonly target: string }
  | { readonly $: "Model.Expanded"; readonly symbol: string; readonly node: NodePlan }
export type NodePlan = { readonly $: "Model.NodePlan"; readonly slot: number; readonly references: List<ReferencePlan> }
export type Outcome = {
  readonly $: "Model.Outcome"
  readonly root: number
  readonly failure: Maybe<Failure>
  readonly tree: Maybe<NodePlan>
}
export type Operation =
  | { readonly $: "Model.Push"; readonly value: number }
  | { readonly $: "Model.MeasureArtifact"; readonly slot: number }
  | { readonly $: "Model.MeasureText"; readonly value: string }
  | { readonly $: "Model.Add" | "Model.Multiply" }

// Bend retains these values. Native bindings pass them back without reading or
// constructing traversal state, frames, pending roots or continuations.
declare const state: unique symbol
type State = { readonly [state]: true }
export type Step =
  | { readonly $: "NextRoot"; readonly global: State }
  | { readonly $: "Continue"; readonly cursor: State }
  | {
      readonly $: "Engine"
      readonly operation: Operation
      readonly request: number
      readonly remaining: List<Operation>
      readonly next: State
    }
  | { readonly $: "Completed"; readonly outcomes: List<Outcome> }
  | { readonly $: "PreflightCompleted" }
  | { readonly $: "Exhausted" }
  | { readonly $: "InvalidReply" }

declare const core: {
  initial(catalog: Catalog, purpose: Purpose): Step
  advance(step: Step): Step
  resume(step: Step, reply: { readonly $: "Ack"; readonly request: number }): Step
}
export default core
