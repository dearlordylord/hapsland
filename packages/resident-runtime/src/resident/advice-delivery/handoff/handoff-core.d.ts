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
export type RDecision =
  | { readonly $: "RReserved" | "RFailed" | "RNotices" }
  | { readonly $: "RAllowed"; readonly reason: RReason }
export type RCommand =
  | { readonly $: "RRevoke" | "RRound" | "RSnapshots" | "RPendingFindings" | "RClock" }
  | {
      readonly $: "RDecide"
      readonly selected: List<number>
      readonly binding: boolean
      readonly can_write: boolean
      readonly provisional: boolean
    }
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

export type PItem = {
  readonly $: "PItem"
  readonly handle: number
  readonly identity: number
  readonly root: number
  readonly partition: number
  readonly work: boolean
}
export type PFrame = {
  readonly $: "PFrame"
  readonly eligible: List<PItem>
  readonly owners: List<number>
  readonly unavailable: List<number>
}
export type PCommand =
  | { readonly $: "PAdvice" | "PResponseGate" | "PResponseBarrier" }
  | { readonly $: "PFacts" | "PStartWorkspace"; readonly advice: number }
  | { readonly $: "PCheckWorkspace"; readonly advice: number; readonly workspace: number }
  | { readonly $: "PReservePartition"; readonly advice: number; readonly members: List<number> }
  | { readonly $: "PVerifyAll"; readonly frame: PFrame; readonly admitted: List<number> }
  | { readonly $: "PDeleteUnavailable"; readonly members: List<number> }
export type PResponse =
  | { readonly $: "PHandles"; readonly values: List<number> }
  | { readonly $: "PAdviceFacts"; readonly item: PItem; readonly owned: boolean }
  | { readonly $: "PWorkspace"; readonly workspace: Maybe<number> }
  | { readonly $: "PTruth"; readonly value: boolean }
  | { readonly $: "PVerifiedAll"; readonly frame: PFrame }
  | { readonly $: "PAck" }
export type PReply = {
  readonly $: "PReply"
  readonly invocation: number
  readonly id: number
  readonly response: PResponse
}
export type PStep =
  | {
      readonly $: "PAwait"
      readonly invocation: number
      readonly id: number
      readonly phase: unknown
      readonly request: {
        readonly $: "PRequest"
        readonly invocation: number
        readonly id: number
        readonly command: PCommand
      }
    }
  | { readonly $: "PDone" | "PRejected" }
export type PValidation = { readonly $: "PCurrentValidation" | "PUnavailableValidation" | "PStaleValidation" }
export type PValidationRoute = { readonly $: "PNoResult" | "PStaleResult" | "PCommitResult" }
export type PReservation = { readonly $: "PCaptureAdmitted" | "PCaptureRefused"; readonly frame: PFrame }
export type KCommand =
  | { readonly $: "KReviseWork" | "KReviseAdvice" | "KFindingKeys" | "KObserve" }
  | { readonly $: "KUpdateDelivery"; readonly indices: List<number> }
export type KResponse =
  | { readonly $: "KAck" }
  | { readonly $: "KTruth"; readonly value: boolean }
  | { readonly $: "KKeys"; readonly retained: List<string>; readonly delivery: List<string> }
export type KReply = {
  readonly $: "KReply"
  readonly invocation: number
  readonly id: number
  readonly response: KResponse
}
export type KStep =
  | {
      readonly $: "KAwait"
      readonly invocation: number
      readonly id: number
      readonly phase: unknown
      readonly request: {
        readonly $: "KRequest"
        readonly invocation: number
        readonly id: number
        readonly command: KCommand
      }
    }
  | { readonly $: "KDone"; readonly accepted: boolean }
  | { readonly $: "KRejected" }

export type GInput = {
  readonly $: "GInput"
  readonly composed: boolean
  readonly turn_end: boolean
  readonly finish: boolean
}
export type GLease = {
  readonly $: "GLease"
  readonly handle: number
  readonly partition: boolean
  readonly delivery: boolean
}
export type GCommand =
  | {
      readonly $:
        | "GOwnStop"
        | "GPruneNotices"
        | "GAdvice"
        | "GRound"
        | "GTotalUnfinished"
        | "GOwnUnfinished"
        | "GDiscard"
    }
  | { readonly $: "GExpired" | "GRelease"; readonly advice: number }
  | { readonly $: "GGate"; readonly extra: number }
  | { readonly $: "GAllow"; readonly reason: { readonly $: "GUnavailable" | "GLimit" } }
export type GResponse =
  | { readonly $: "GAck" | "GNoGate" | "GWaiting" }
  | { readonly $: "GTruth"; readonly value: boolean }
  | { readonly $: "GLeases"; readonly leases: List<GLease> }
  | { readonly $: "GCount"; readonly value: number }
  | { readonly $: "GCutoff"; readonly limited: boolean }
export type GReply = {
  readonly $: "GReply"
  readonly invocation: number
  readonly id: number
  readonly response: GResponse
}
export type GStep =
  | {
      readonly $: "GAwait"
      readonly invocation: number
      readonly id: number
      readonly phase: unknown
      readonly request: {
        readonly $: "GRequest"
        readonly invocation: number
        readonly id: number
        readonly command: GCommand
      }
    }
  | { readonly $: "GDone"; readonly result: { readonly $: "GCollect" | "GEmpty" | "GPending" | "GUnsupported" } }
  | { readonly $: "GRejected" }

export type DCommand =
  | { readonly $: "DFinalize"; readonly command: FCommand }
  | { readonly $: "DDecode"; readonly result: FTerminal }
  | { readonly $: "DCanWrite" }
  | { readonly $: "DReconcile"; readonly command: RCommand }
export type DResponse =
  | { readonly $: "DFinalized"; readonly response: FResponse }
  | { readonly $: "DDecoded" }
  | { readonly $: "DFinishInput"; readonly input: RInput }
  | { readonly $: "DReconciled"; readonly response: RResponse }
export type DReply = {
  readonly $: "DReply"
  readonly invocation: number
  readonly id: number
  readonly response: DResponse
}
export type DStep =
  | {
      readonly $: "DAwait"
      readonly invocation: number
      readonly id: number
      readonly phase: unknown
      readonly request: {
        readonly $: "DRequest"
        readonly invocation: number
        readonly id: number
        readonly command: DCommand
      }
    }
  | { readonly $: "DDone"; readonly empty: boolean }
  | { readonly $: "DRejected" }

declare const core: {
  delivery_finalize_initial(invocation: number, transport: boolean, input: FInput): DStep
  delivery_finalize_resume(step: DStep, reply: DReply): DStep
  collection_gate_initial(invocation: number, input: GInput): GStep
  collection_gate_atomic(step: GStep): boolean
  collection_gate_resume(step: GStep, reply: GReply): GStep
  prepare_initial(invocation: number, advice: boolean): PStep
  prepare_transport_initial(invocation: number, advice: boolean): PStep
  prepare_resume(step: PStep, reply: PReply): PStep
  prepare_member(frame: PFrame, identity: number): Maybe<PItem>
  prepare_source(frame: PFrame, root: number): Maybe<PItem>
  prepare_validation(capacity_unavailable: boolean, validation: PValidation): PValidationRoute
  prepare_capacity(previous: boolean, resized: boolean): boolean
  prepare_reservation(resized: boolean, frame: PFrame, partition: number): PReservation
  prepare_commit_initial(invocation: number, work: boolean): KStep
  prepare_commit_resume(step: KStep, reply: KReply): KStep

  reserve_finish_initial(invocation: number, input: RInput): RStep
  reconcile_initial(invocation: number, input: RInput): RStep
  reconcile_resume(step: RStep, reply: RReply): RStep
  finalize_initial(invocation: number, input: FInput): FStep
  finalize_resume(step: FStep, reply: FReply): FStep
}
export default core
