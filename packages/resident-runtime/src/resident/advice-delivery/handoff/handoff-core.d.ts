import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"

type Maybe<Value> = { readonly $: "None" } | { readonly $: "Some"; readonly value: Value }

export type FRequestKind =
  | { readonly $: "FOtherRequest" }
  | { readonly $: "FEditCollect" }
  | {
      readonly $: "FSharedCollect"
      readonly composed: boolean
      readonly claude: boolean
      readonly turn_end: boolean
      readonly finish: boolean
      readonly report: boolean
    }

export type FResponseKind =
  | { readonly $: "FAdviceResponse" }
  | { readonly $: "FEmptyResponse" }
  | { readonly $: "FPendingResponse" }
  | { readonly $: "FOtherResponse" }

export type FAuthority =
  | { readonly $: "FNoAuthority" }
  | { readonly $: "FAdvisoryAuthority" }
  | { readonly $: "FBlockingAuthority" }

export type FInput = {
  readonly $: "FInput"
  readonly request: FRequestKind
  readonly response: FResponseKind
  readonly authority: FAuthority
}

export type FDisposition =
  | { readonly $: "FRetain" }
  | { readonly $: "FRetire" }
  | { readonly $: "FRelease" }
  | { readonly $: "FIgnore" }

export type FSurface =
  | { readonly $: "FCodexSurface" }
  | { readonly $: "FStopSurface" }
  | { readonly $: "FAdvisorySurface" }
  | { readonly $: "FBlockingSurface" }

export type FCommand =
  | { readonly $: "FClock" }
  | { readonly $: "FExpire" }
  | { readonly $: "FPrune" }
  | { readonly $: "FWorkState" }
  | { readonly $: "FCollectorGate" }
  | { readonly $: "FEditStatus" }
  | { readonly $: "FAdvice"; readonly copy: boolean }
  | { readonly $: "FDelivery"; readonly advice: number }
  | { readonly $: "FCredentialFacts"; readonly advice: number }
  | { readonly $: "FCredentialAuthority"; readonly advice: number }
  | { readonly $: "FObserveCredential"; readonly generation: boolean; readonly authorized: boolean }
  | { readonly $: "FCredentialGate"; readonly collect: boolean; readonly invalid: boolean }
  | { readonly $: "FReleaseComposed" }
  | { readonly $: "FSourceCurrent"; readonly advice: number }
  | { readonly $: "FRoundActive"; readonly advice: number }
  | { readonly $: "FExpired"; readonly advice: number }
  | { readonly $: "FWorkCurrent"; readonly advice: number }
  | { readonly $: "FRoute"; readonly expired: boolean; readonly current: boolean; readonly has_findings: boolean }
  | { readonly $: "FReleaseAdvice"; readonly advice: number }
  | { readonly $: "FRemoveAdvice"; readonly advice: number }
  | { readonly $: "FRenewAdvice"; readonly advice: number }
  | { readonly $: "FReleaseDelivery" }
  | { readonly $: "FAllowsBlocking"; readonly advice: number }
  | { readonly $: "FPendingFindings"; readonly advice: number }
  | { readonly $: "FOffers"; readonly advice: number }
  | { readonly $: "FFit"; readonly offers: List<number>; readonly surface: FSurface }
  | { readonly $: "FUpdate"; readonly advice: number; readonly findings: List<number> }
  | { readonly $: "FContent"; readonly advice: number }
  | { readonly $: "FContentFindings"; readonly advice: number; readonly content: number }
  | { readonly $: "FNotices" }
  | { readonly $: "FOutputFit"; readonly findings: List<number>; readonly notices: List<number> }
  | { readonly $: "FRenewNotice"; readonly notice: number }
  | { readonly $: "FFinalAuthority"; readonly blocking: boolean }
  | { readonly $: "FEmptyResponseValue" }
  | {
      readonly $: "FBuildResponse"
      readonly blocking: boolean
      readonly findings: List<number>
      readonly notices: List<number>
    }
  | {
      readonly $: "FObserveMessage"
      readonly response: number
      readonly findings: List<number>
      readonly contents: List<number>
      readonly advice: List<number>
    }

export type FResponse =
  | { readonly $: "FAck" }
  | { readonly $: "FTruth"; readonly value: boolean }
  | { readonly $: "FHandle"; readonly handle: number }
  | { readonly $: "FHandles"; readonly handles: List<number> }
  | { readonly $: "FOptionalResponse"; readonly response: Maybe<number> }
  | {
      readonly $: "FDeliveryFacts"
      readonly present: boolean
      readonly owned: boolean
      readonly findings: List<number>
      readonly round: boolean
      readonly work: boolean
    }
  | { readonly $: "FSource"; readonly present: boolean; readonly current: boolean }
  | { readonly $: "FRouted"; readonly route: FDisposition }
  | { readonly $: "FCount"; readonly count: number }

export type FTerminal =
  | { readonly $: "FOriginal" }
  | { readonly $: "FEmpty" }
  | { readonly $: "FLost" }
  | { readonly $: "FCredentialUnavailable" }
  | { readonly $: "FResponseHandle"; readonly response: number }

export type FRequest = {
  readonly $: "FRequest"
  readonly invocation: number
  readonly id: number
  readonly command: FCommand
}

export type FReply = {
  readonly $: "FReply"
  readonly invocation: number
  readonly id: number
  readonly response: FResponse
}

export type FStep =
  | { readonly $: "FAwait"; readonly state: unknown; readonly request: FRequest }
  | { readonly $: "FDone"; readonly result: FTerminal }
  | { readonly $: "FRejected" }

export type RInput = {
  readonly $: "RInput"
  readonly finish: boolean
  readonly provisional_findings: boolean
  readonly advice: boolean
  readonly findings: number
  readonly can_write: boolean
  readonly same_token: boolean
}
export type RSnapshot = {
  readonly $: "RSnapshot"
  readonly handle: number
  readonly owned: boolean
  readonly same_round: boolean
  readonly work: boolean
  readonly delivery: boolean
  readonly count: number
  readonly operation: number
}
export type RPending = { readonly $: "RPending"; readonly operation: number; readonly count: number }
export type RReason = { readonly $: "RNoAdvice" | "RDeadline" | "RUnavailable" }
export type RDecision = { readonly $: "RReserved" | "RRefused" } | { readonly $: "RAllowed"; readonly reason: RReason }
export type RCommand =
  | { readonly $: "RRevoke" | "RRound" | "RSnapshots" | "RPendingFindings" | "RClock" }
  | { readonly $: "RDecide"; readonly selected: List<number>; readonly binding: boolean; readonly can_write: boolean }
  | { readonly $: "RRelease"; readonly provisional: boolean }
  | { readonly $: "RAllow"; readonly reason: RReason }
export type RResponse =
  | { readonly $: "RAck" }
  | { readonly $: "RTruth"; readonly value: boolean }
  | { readonly $: "RSnapshotValues"; readonly values: List<RSnapshot> }
  | { readonly $: "RPendingValues"; readonly values: List<RPending> }
  | { readonly $: "RDecided"; readonly decision: RDecision }
export type RReply = {
  readonly $: "RReply"
  readonly invocation: number
  readonly id: number
  readonly response: RResponse
}
export type RStep =
  | {
      readonly $: "RAwait"
      readonly invocation: number
      readonly id: number
      readonly phase: unknown
      readonly request: {
        readonly $: "RRequest"
        readonly invocation: number
        readonly id: number
        readonly command: RCommand
      }
    }
  | { readonly $: "RFinal" | "REmpty" | "RRejected" }

declare const core: {
  reconcile_initial(invocation: number, input: RInput): RStep
  reconcile_resume(step: RStep, reply: RReply): RStep
  finalize_initial(invocation: number, input: FInput): FStep
  finalize_resume(step: FStep, reply: FReply): FStep
}
export default core
