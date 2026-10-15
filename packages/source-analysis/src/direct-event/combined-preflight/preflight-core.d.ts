import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"
export type Operation =
  | { readonly $: "Model.Push"; readonly value: number }
  | { readonly $: "Model.MeasureArtifact" | "Model.ObserveSites"; readonly function_slot: number }
  | { readonly $: "Model.MeasureRawSite"; readonly function_slot: number; readonly site_slot: number }
  | {
      readonly $:
        | "Model.MeasureRawPath"
        | "Model.Add"
        | "Model.Multiply"
        | "Model.ReadTypeBytes"
        | "Model.Swap"
        | "Model.ObserveRootImports"
        | "Model.ReadTypeImports"
        | "Model.InspectGo"
    }
export type Decision =
  | { readonly $: "Model.Unavailable" | "Model.RetainBound" }
  | { readonly $: "Model.MeasuredEmpty"; readonly imports: boolean }
  | { readonly $: "Model.Measured"; readonly declarations: number; readonly imports: boolean }
declare const phase: unique symbol
type Phase = { readonly [phase]: true }
export type Step =
  | { readonly $: "Advance"; readonly phase: Phase; readonly request: number }
  | {
      readonly $: "Engine"
      readonly operation: Operation
      readonly request: number
      readonly remaining: List<Operation>
      readonly next: Phase
    }
  | {
      readonly $: "AwaitSites"
      readonly slot: number
      readonly remaining_functions: number
      readonly count: number
      readonly request: number
    }
  | {
      readonly $: "AwaitRootImports" | "AwaitTypeImports"
      readonly count: number
      readonly empty: boolean
      readonly request: number
    }
  | { readonly $: "AwaitGo"; readonly request: number }
  | { readonly $: "Completed"; readonly decision: Decision }
  | { readonly $: "InvalidReply" }
export type Reply =
  | { readonly $: "Ack"; readonly request: number }
  | { readonly $: "SitesObserved"; readonly request: number; readonly count: number }
  | { readonly $: "ImportsObserved"; readonly request: number; readonly present: boolean }
  | { readonly $: "GoInspected"; readonly request: number; readonly valid: boolean }
declare const core: {
  typescript(parse_valid: boolean, types: number, functions: number, bound: boolean): Step
  go(bound: boolean): Step
  passthrough(bound: boolean): Step
  advance(step: Step): Step
  resume(step: Step, reply: Reply): Step
  resume_group(step: Step, reply: Reply): Step
}
export default core
