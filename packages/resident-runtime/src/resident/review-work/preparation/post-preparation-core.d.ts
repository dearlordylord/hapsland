import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"

type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields
type Maybe<A> = Tagged<"None"> | Tagged<"Some", { readonly value: A }>

export type SizingField = Tagged<"SizingField", { readonly name: string; readonly value: bigint }>
export type SizingFindingField = Tagged<
  "SizingFindingField",
  { readonly name: string; readonly source: bigint; readonly path: List<string> }
>
export type SizingPrimitive = Tagged<
  | "SizingOutput"
  | "SizingMeasure"
  | "SizingRecipient"
  | "SizingEvaluationPartition"
  | "SizingEvaluationIdentity"
  | "SizingSourcePartition"
  | "SizingWorkSubject"
  | "SizingMultiply"
  | "SizingAdd"
  | "SizingMaximum"
  | "SizingLessEqual"
  | "SizingSubtract"
>
export type SizingLiteral = Tagged<
  | "SizingUnitKind"
  | "SizingZeroUuid"
  | "SizingMaxGeneration"
  | "SizingDigestPlaceholder"
  | "SizingOne"
  | "SizingZero"
  | "SizingFalse"
  | "SizingProbabilityMargin"
  | "SizingOverhead"
  | "SizingFrameBytes"
>
export type SizingOperation =
  | Tagged<"SizingFindings", { readonly target: bigint }>
  | Tagged<"SizingRead", { readonly target: bigint; readonly source: bigint; readonly path: List<string> }>
  | Tagged<"SizingRecord", { readonly target: bigint; readonly fields: List<SizingField> }>
  | Tagged<"SizingArray", { readonly target: bigint; readonly values: List<bigint> }>
  | Tagged<"SizingConstant", { readonly target: bigint; readonly literal: SizingLiteral }>
  | Tagged<
      "SizingCall",
      { readonly target: bigint; readonly primitive: SizingPrimitive; readonly arguments: List<bigint> }
    >
export type SizingMode = Tagged<"WorstOutcomeSizing" | "ReservationSizing" | "DeliverabilitySizing">
type SizingContinuation = { readonly remaining: List<SizingOperation>; readonly result: bigint }
type SizingIndex = SizingContinuation & { readonly index: bigint; readonly left: bigint; readonly target: bigint }
export type SizingStep =
  | Tagged<"SizingAwait", SizingContinuation & { readonly operation: SizingOperation }>
  | Tagged<"SizingRules", SizingContinuation & { readonly target: bigint }>
  | Tagged<"SizingPresence" | "SizingThreshold", SizingIndex>
  | Tagged<"SizingFinding", SizingIndex & { readonly fields: List<SizingFindingField> }>
  | Tagged<"SizingDone", { readonly result: bigint }>
  | Tagged<"SizingRejected">
export type SizingReply =
  | Tagged<"SizingAck">
  | Tagged<"SizingLength", { readonly length: bigint }>
  | Tagged<"SizingFlag", { readonly value: boolean }>

export type Outcome = Tagged<
  "Outcome",
  { readonly handle: bigint; readonly ready: boolean; readonly fits: boolean; readonly reservation_bytes: bigint }
>

export type Route =
  | Tagged<"Owner">
  | Tagged<"CachedEntry">
  | Tagged<"CachedClear">
  | Tagged<"CachedFinding", { readonly evaluation: bigint }>
  | Tagged<"JoinedAdvice">
  | Tagged<"JoinedPending">
  | Tagged<"JoinedClaimed">

export type Planned = Tagged<"Planned", { readonly outcome: Outcome; readonly key: bigint; readonly route: Route }>

export type Allocation = Tagged<"Allocation", { readonly operation: bigint; readonly reservation: bigint }>

export type Slot = Tagged<"Slot", { readonly item: Planned; readonly operation: bigint; readonly reservation: bigint }>

export type ReuseActivity =
  | Tagged<"ClearActivity">
  | Tagged<"FindingsActivity", { readonly findings: bigint }>
  | Tagged<"UnavailableActivity">

export type AdviceRetirement = Tagged<"ExpiredRetirement"> | Tagged<"RetentionFailureRetirement">

export type CleanupAction =
  | Tagged<"DrainCleanupTail", { readonly handle: bigint }>
  | Tagged<"RetireCleanupWork", { readonly handle: bigint }>
  | Tagged<"ReleaseCleanupReservation", { readonly handle: bigint }>
  | Tagged<"ReleaseCleanupRevision", { readonly handle: bigint }>
  | Tagged<"ReleaseCleanupClaim", { readonly handle: bigint }>
  | Tagged<"ReleaseCleanupWorkspace">
  | Tagged<"InvalidCleanupAllocation">
  | Tagged<"InvalidCleanupReservation">
  | Tagged<"InvalidCleanupPlan">
export type CleanupFact =
  | Tagged<"CleanupTail", { readonly handle: bigint; readonly started: boolean }>
  | Tagged<
      "CleanupWork",
      {
        readonly handle: bigint
        readonly cached: boolean
        readonly completed: boolean
        readonly round_bound: boolean
        readonly work_bound: boolean
      }
    >
  | Tagged<
      "CleanupReservation",
      {
        readonly handle: bigint
        readonly present: boolean
        readonly transferred: boolean
        readonly discharged: boolean
      }
    >
  | Tagged<"CleanupRevision", { readonly handle: bigint; readonly present: boolean; readonly transferred: boolean }>
  | Tagged<"CleanupClaim", { readonly handle: bigint; readonly present: boolean; readonly transferred: boolean }>
  | Tagged<"CleanupWorkspace", { readonly source_owned: boolean; readonly active: boolean }>
  | Tagged<"CleanupInvalidAllocation">
  | Tagged<"CleanupInvalidPlan">
export type CleanupMode = Tagged<"RetryCleanup"> | Tagged<"CollectCleanup">
export type CleanupCursor =
  | Tagged<"CleanupDone">
  | Tagged<
      "CleanupAwait",
      { readonly mode: CleanupMode; readonly action: CleanupAction; readonly remaining: List<CleanupAction> }
    >

export type CleanupStage =
  | Tagged<"CleanupTails">
  | Tagged<"CleanupWorks">
  | Tagged<"CleanupReservations">
  | Tagged<"CleanupRevisions">
  | Tagged<"CleanupClaims">
  | Tagged<"CleanupWorkspaceStage">
export type CleanupFinish =
  | Tagged<"CleanupFinishRead", { readonly stage: CleanupStage }>
  | Tagged<
      "CleanupFinishRun",
      { readonly stage: CleanupStage; readonly cursor: Extract<CleanupCursor, { $: "CleanupAwait" }> }
    >
  | Tagged<"CleanupFinishDone">
  | Tagged<"CleanupFinishRejected">

export type ReleaseKind =
  | Tagged<"UnspawnedRelease">
  | Tagged<"AttachedRelease">
  | Tagged<"CachedRelease">
  | Tagged<"FinalizedRelease">
export type ReleaseOperation =
  | Tagged<"ReleaseReadTransfer">
  | Tagged<"ReleaseReadOwner">
  | Tagged<"ReleaseBuildUnit">
  | Tagged<"ReleaseReadPlanClaim">
  | Tagged<"ReleaseReadUnitClaim">
  | Tagged<"ReleasePlanClaim">
  | Tagged<"ReleaseCapacityClaim">
  | Tagged<"ReleaseForgetPlanClaim">
  | Tagged<"ReleaseForgetUnitClaim">
  | Tagged<"ReleaseSlotReservation">
  | Tagged<"ReleaseUnitReservation">
  | Tagged<"ReleaseForgetReservation">
  | Tagged<"ReleaseAcquisition">
  | Tagged<"ReleaseCurrentWork">
  | Tagged<"ReleaseForgetAcquisition">
  | Tagged<"ReleaseMarkUnit">
  | Tagged<"ReleaseReadWorkBound">
  | Tagged<"ReleaseReadCompleted", { readonly work_bound: boolean }>
  | Tagged<"ReleaseReadRound", { readonly work_bound: boolean }>
  | Tagged<"ReleaseRetireWork">
  | Tagged<"ReleaseReadReleased">
export type ReleaseResponse = Tagged<"ReleaseAck"> | Tagged<"ReleaseFlag", { readonly value: boolean }>
export type ReleaseStep =
  | Tagged<"ReleaseAwait", { readonly kind: ReleaseKind; readonly operation: ReleaseOperation }>
  | Tagged<"ReleaseDone">
  | Tagged<"ReleaseRejected">

export type SelectionKind =
  | Tagged<"AdviceMembership">
  | Tagged<"AdviceSelection">
  | Tagged<"ObservedSelection">
  | Tagged<"CachedPlanMembership">
export type SelectionStage =
  | Tagged<"SelectionPresence">
  | Tagged<"SelectionStatus">
  | Tagged<"SelectionEquality">
  | Tagged<"SelectionRoute">
export type SelectionStep =
  | Tagged<
      "SelectionRead",
      {
        readonly kind: SelectionKind
        readonly index: bigint
        readonly remaining: bigint
        readonly stage: SelectionStage
      }
    >
  | Tagged<"SelectionFound", { readonly index: bigint }>
  | Tagged<"SelectionMissing">
  | Tagged<"SelectionRejected">
export type SelectionResponse =
  | Tagged<"SelectionFlag", { readonly value: boolean }>
  | Tagged<"SelectionPlanRoute", { readonly route: Route }>
export type NativePlanAction = Tagged<"StoreNativePlan"> | Tagged<"TrackNativeClaim">
export type ReuseObservation =
  | Tagged<"CachedReuseObservation">
  | Tagged<"JoinedReuseObservation">
  | Tagged<"InvalidReuseObservation">
export type WorkChoice = Tagged<"NoPlannedWork"> | Tagged<"SpawnPlannedWork"> | Tagged<"CachedPlannedWork">
export type InspectionRoute =
  | Tagged<"FreshInspection">
  | Tagged<"CachedInspection">
  | Tagged<"AdviceInspection">
  | Tagged<"PendingInspection">
  | Tagged<"ClaimedInspection">
export type PlanObservationOperation =
  | Tagged<"ReadPlanReceipt">
  | Tagged<"ForgetPlanOrigin">
  | Tagged<"CheckPlanInspection">
  | Tagged<"RegisterPlanOrigin">
  | Tagged<"ReadPlanEvaluation">
  | Tagged<"OfferMissingPlan", { readonly route: InspectionRoute }>
  | Tagged<"OfferLinkedPlan", { readonly route: InspectionRoute }>
declare const planObservationState: unique symbol
export type PlanObservationStep =
  | Tagged<
      "PlanObservationAwait",
      {
        readonly route: Route
        readonly stage: { readonly [planObservationState]: never }
        readonly operation: PlanObservationOperation
      }
    >
  | Tagged<"PlanObservationDone">
  | Tagged<"PlanObservationRejected">
export type PlanObservationResponse =
  | Tagged<"PlanObservationAck">
  | Tagged<"PlanObservationFlag", { readonly value: boolean }>

export type Command =
  | Tagged<"ObservePreparation">
  | Tagged<"AdvicePendingBarrier", { readonly advice: bigint }>
  | Tagged<"AdviceCheckActive", { readonly advice: bigint }>
  | Tagged<"AdvicePublish", { readonly advice: bigint }>
  | Tagged<"AdviceRecordPublished", { readonly advice: bigint; readonly publication: bigint }>
  | Tagged<"AdviceCheckExpired", { readonly advice: bigint }>
  | Tagged<"AdviceRemove", { readonly advice: bigint; readonly retirement: AdviceRetirement }>
  | Tagged<"CheckActive">
  | Tagged<"ReleaseWorkspace">
  | Tagged<"Offer", { readonly outcome: Outcome; readonly deliverability: boolean }>
  | Tagged<"ReportDeliverabilityCapacity">
  | Tagged<"ReportDeliverabilityNotice">
  | Tagged<"ReportEmptyAnalytics", { readonly incomplete: boolean }>
  | Tagged<"ReportEmptyActivity", { readonly incomplete: boolean }>
  | Tagged<"ObserveReady", { readonly ready: List<Outcome> }>
  | Tagged<"LookupReuse", { readonly outcome: Outcome }>
  | Tagged<"ReadCached", { readonly item: Planned }>
  | Tagged<"ReadPending", { readonly item: Planned }>
  | Tagged<"RestorePending", { readonly item: Planned; readonly owner: bigint }>
  | Tagged<"ObservePlans", { readonly planned: List<Planned> }>
  | Tagged<"RecordReuseAnalytics", { readonly item: Planned }>
  | Tagged<"OwnerBarrier">
  | Tagged<"CompletePreparation", { readonly retained: List<Planned> }>
  | Tagged<"RegisterClear", { readonly item: Planned }>
  | Tagged<"ReleaseClear", { readonly revision: bigint }>
  | Tagged<"ReadLiveAdvice", { readonly item: Planned }>
  | Tagged<"PublishJoinedAdvice", { readonly advice: bigint }>
  | Tagged<"RecordJoinedOutcomes", { readonly advice: bigint; readonly publication: bigint }>
  | Tagged<"ReadCurrentAdvice", { readonly advice: bigint }>
  | Tagged<"ReadJoinedPending", { readonly item: Planned }>
  | Tagged<"AppendJoined", { readonly item: Planned; readonly owner: Maybe<bigint> }>
  | Tagged<"RememberExpected", { readonly item: Planned }>
  | Tagged<"RecordReuseActivity", { readonly item: Planned; readonly activity: ReuseActivity }>
  | Tagged<"JoinedBarrier">
  | Tagged<"RegisterRevision", { readonly slot: Slot }>
  | Tagged<"RegisterWork", { readonly slot: Slot; readonly revision: bigint }>
  | Tagged<"ObserveUnit", { readonly slot: Slot; readonly revision: bigint; readonly work: Maybe<bigint> }>
  | Tagged<"AttachOwner", { readonly slot: Slot; readonly revision: bigint; readonly work: Maybe<bigint> }>
  | Tagged<"Enqueue", { readonly slot: Slot; readonly revision: bigint; readonly work: Maybe<bigint> }>
  | Tagged<"StartCachedReview", { readonly slot: Slot }>
  | Tagged<"CompleteCachedReview", { readonly slot: Slot }>
  | Tagged<"RecordCachedActivity", { readonly slot: Slot }>
  | Tagged<"CheckCachedActive", { readonly slot: Slot; readonly revision: bigint; readonly work: Maybe<bigint> }>
  | Tagged<"ReadCachedAdvice", { readonly slot: Slot }>
  | Tagged<"RetireCachedWork", { readonly slot: Slot; readonly revision: bigint; readonly work: Maybe<bigint> }>
  | Tagged<"ReleaseCachedUnit", { readonly slot: Slot; readonly revision: bigint; readonly work: Maybe<bigint> }>
  | Tagged<"InsertCachedAdvice", { readonly slot: Slot; readonly revision: bigint; readonly work: Maybe<bigint> }>
  | Tagged<"ObserveRetainedAdvice", { readonly tail: bigint }>
  | Tagged<"PreserveAdviceTail", { readonly tail: bigint }>
  | Tagged<"AwaitAdviceTail", { readonly tail: bigint }>
  | Tagged<"FinalizeCachedUnit", { readonly slot: Slot; readonly revision: bigint; readonly work: Maybe<bigint> }>
  | Tagged<"ReleaseAttached", { readonly slot: Slot; readonly revision: bigint; readonly work: Maybe<bigint> }>
  | Tagged<"ReleaseUnspawned", { readonly slot: Slot; readonly revision: bigint }>
  | Tagged<"ReportCapacity", { readonly item: Planned }>
  | Tagged<"Cleanup", { readonly actions: List<CleanupAction> }>
  | Tagged<"PerformCleanup", { readonly action: CleanupAction }>

export type Response =
  | Tagged<"Ack">
  | Tagged<"CleanupInventory", { readonly facts: List<CleanupFact> }>
  | Tagged<"Active", { readonly value: boolean }>
  | Tagged<"Expired", { readonly value: boolean }>
  | Tagged<"Offered", { readonly accepted: boolean }>
  | Tagged<"Routed", { readonly key: bigint; readonly route: Route }>
  | Tagged<"CachedFacts", { readonly evaluation: bigint; readonly findings: bigint }>
  | Tagged<"PendingOwner", { readonly owner: bigint }>
  | Tagged<"AdviceOwner", { readonly owner: Maybe<bigint> }>
  | Tagged<"Published", { readonly publication: bigint }>
  | Tagged<"FindingCount", { readonly findings: bigint }>
  | Tagged<"JoinOwner", { readonly owner: Maybe<bigint> }>
  | Tagged<"Reserved", { readonly allocations: List<Maybe<Allocation>> }>
  | Tagged<"Revision", { readonly token: bigint }>
  | Tagged<"Work", { readonly token: Maybe<bigint> }>
  | Tagged<"Attached", { readonly accepted: boolean }>
  | Tagged<"Queued", { readonly accepted: boolean }>
  | Tagged<"ReviewAccepted", { readonly value: boolean }>
  | Tagged<"AdviceInserted", { readonly tail: bigint }>
  | Tagged<"Cancelled", { readonly token: bigint }>
  | Tagged<"Failed", { readonly token: bigint }>
  | Tagged<"Defect", { readonly token: bigint }>

export type Termination =
  | Tagged<"Inactive">
  | Tagged<"CancelledReason", { readonly token: bigint }>
  | Tagged<"TechnicalFailure", { readonly token: bigint }>
  | Tagged<"DefectFailure", { readonly token: bigint }>

declare const stateHandle: unique symbol
export type State = { readonly [stateHandle]: "PostPreparation.State" }

export type Request = Tagged<"Request", { readonly invocation: bigint; readonly id: bigint; readonly command: Command }>

export type Reply = Tagged<"Reply", { readonly invocation: bigint; readonly id: bigint; readonly response: Response }>

export type Step =
  | Tagged<"Internal", { readonly state: State }>
  | Tagged<"Await", { readonly state: State; readonly request: Request }>
  | Tagged<"Finished">
  | Tagged<"Stopped", { readonly reason: Termination }>
  | Tagged<"Rejected">

declare const adviceTailStateHandle: unique symbol
export type AdviceTailState = { readonly [adviceTailStateHandle]: "PostPreparation.AdviceTailState" }

export type AdviceTailStep =
  | Tagged<"AdviceAwait", { readonly state: AdviceTailState; readonly request: Request }>
  | Tagged<"AdvicePreserved">
  | Tagged<"AdviceFinished">
  | Tagged<"AdviceStopped", { readonly reason: Termination }>
  | Tagged<"AdviceRejected">
  | Tagged<"AdviceCleanupPending", { readonly advice: bigint; readonly reason: Termination }>

declare const core: {
  sizing_initial(mode: SizingMode): SizingStep
  sizing_initial_ready(mode: SizingMode, ready: boolean): SizingStep
  sizing_resume(step: SizingStep, reply: SizingReply): SizingStep
  route_cached(route: Route): boolean
  native_plan_actions(route: Route): List<NativePlanAction>
  reuse_observation(route: Route): ReuseObservation
  planned_work(route: Route, policy: boolean, observation: boolean): WorkChoice
  selection_initial(kind: SelectionKind, length: bigint): SelectionStep
  selection_resume(step: SelectionStep, response: SelectionResponse): SelectionStep
  plan_observation_initial(route: Route): PlanObservationStep
  plan_observation_resume(step: PlanObservationStep, response: PlanObservationResponse): PlanObservationStep
  release_initial(kind: ReleaseKind): ReleaseStep
  release_resume(step: ReleaseStep, response: ReleaseResponse): ReleaseStep
  cleanup_finish_initial(): CleanupFinish
  cleanup_finish_inventory(finish: CleanupFinish, facts: List<CleanupFact>): CleanupFinish
  cleanup_finish_reply(finish: CleanupFinish, success: boolean): CleanupFinish
  cleanup_initial(mode: CleanupMode, facts: List<CleanupFact>): CleanupCursor
  cleanup_reply(cursor: CleanupCursor, success: boolean): CleanupCursor
  initial(invocation: bigint, round_bound: boolean, outcomes: List<Outcome>, incomplete: boolean): Step
  advance(state: State): Step
  resume(step: Step, reply: Reply): Step
  advice_initial(invocation: bigint, advice: bigint): AdviceTailStep
  advice_initial_cleanup(invocation: bigint, advice: bigint, reason: Termination): AdviceTailStep
  advice_initial_preserved(): AdviceTailStep
  advice_retirement(expired: boolean): AdviceRetirement
  advice_resume(step: AdviceTailStep, reply: Reply): AdviceTailStep
}
export default core
