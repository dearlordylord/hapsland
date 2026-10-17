import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"

type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields
type Maybe<A> = Tagged<"None"> | Tagged<"Some", { readonly value: A }>

export type SizingField = Tagged<"SizingField", { readonly name: string; readonly value: number }>
export type SizingFindingField = Tagged<
  "SizingFindingField",
  { readonly name: string; readonly source: number; readonly path: List<string> }
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
  | Tagged<"SizingFindings", { readonly target: number }>
  | Tagged<"SizingRead", { readonly target: number; readonly source: number; readonly path: List<string> }>
  | Tagged<"SizingRecord", { readonly target: number; readonly fields: List<SizingField> }>
  | Tagged<"SizingArray", { readonly target: number; readonly values: List<number> }>
  | Tagged<"SizingConstant", { readonly target: number; readonly literal: SizingLiteral }>
  | Tagged<
      "SizingCall",
      { readonly target: number; readonly primitive: SizingPrimitive; readonly arguments: List<number> }
    >
export type SizingMode = Tagged<"WorstOutcomeSizing" | "ReservationSizing" | "DeliverabilitySizing">
type SizingContinuation = { readonly remaining: List<SizingOperation>; readonly result: number }
type SizingIndex = SizingContinuation & { readonly index: number; readonly left: number; readonly target: number }
export type SizingStep =
  | Tagged<"SizingAwait", SizingContinuation & { readonly operation: SizingOperation }>
  | Tagged<"SizingRules", SizingContinuation & { readonly target: number }>
  | Tagged<"SizingPresence" | "SizingThreshold", SizingIndex>
  | Tagged<"SizingFinding", SizingIndex & { readonly fields: List<SizingFindingField> }>
  | Tagged<"SizingDone", { readonly result: number }>
  | Tagged<"SizingRejected">
export type SizingReply =
  | Tagged<"SizingAck">
  | Tagged<"SizingLength", { readonly length: number }>
  | Tagged<"SizingFlag", { readonly value: boolean }>

export type EnrollmentField = Tagged<"EnrollmentField", { readonly name: string; readonly value: number }>
export type EnrollmentLiteral = Tagged<"EnrollmentTrue" | "EnrollmentFalse" | "EnrollmentNullValue">
export type EnrollmentCheck = Tagged<
  "EnrollmentNull" | "EnrollmentNullish" | "EnrollmentUndefined" | "EnrollmentTrueCheck"
>
export type EnrollmentPrimitive = Tagged<"EnrollmentUuid" | "EnrollmentNow" | "EnrollmentEnvironmentOnly">
export type EnrollmentOperation =
  | Tagged<"EnrollmentRead", { readonly target: number; readonly source: number; readonly path: List<string> }>
  | Tagged<"EnrollmentConstant", { readonly target: number; readonly literal: EnrollmentLiteral }>
  | Tagged<"EnrollmentRecord", { readonly target: number; readonly fields: List<EnrollmentField> }>
  | Tagged<"EnrollmentArray", { readonly target: number; readonly values: List<number> }>
  | Tagged<"EnrollmentPut", { readonly name: string; readonly value: number }>
  | Tagged<
      "EnrollmentCall",
      { readonly target: number; readonly primitive: EnrollmentPrimitive; readonly arguments: List<number> }
    >
  | Tagged<
      "EnrollmentChoose",
      {
        readonly source: number
        readonly check: EnrollmentCheck
        readonly when_true: List<EnrollmentOperation>
        readonly when_false: List<EnrollmentOperation>
      }
    >
export type EnrollmentStep =
  | Tagged<
      "EnrollmentAwait",
      { readonly operation: EnrollmentOperation; readonly remaining: List<EnrollmentOperation> }
    >
  | Tagged<
      "EnrollmentInspect",
      {
        readonly source: number
        readonly check: EnrollmentCheck
        readonly when_true: List<EnrollmentOperation>
        readonly when_false: List<EnrollmentOperation>
        readonly remaining: List<EnrollmentOperation>
      }
    >
  | Tagged<"EnrollmentDone", { readonly evaluation: number }>
  | Tagged<"EnrollmentRejected">
export type EnrollmentReply = Tagged<"EnrollmentAck"> | Tagged<"EnrollmentFlag", { readonly value: boolean }>

export type Outcome = Tagged<
  "Outcome",
  { readonly handle: number; readonly ready: boolean; readonly fits: boolean; readonly reservation_bytes: number }
>

export type Route =
  | Tagged<"Owner">
  | Tagged<"CachedEntry">
  | Tagged<"CachedClear">
  | Tagged<"CachedFinding", { readonly evaluation: number }>
  | Tagged<"JoinedAdvice">
  | Tagged<"JoinedPending">
  | Tagged<"JoinedClaimed">

export type Planned = Tagged<"Planned", { readonly outcome: Outcome; readonly key: number; readonly route: Route }>

export type Allocation = Tagged<"Allocation", { readonly operation: number; readonly reservation: number }>

export type Slot = Tagged<"Slot", { readonly item: Planned; readonly operation: number; readonly reservation: number }>

export type ReuseActivity =
  | Tagged<"ClearActivity">
  | Tagged<"FindingsActivity", { readonly findings: number }>
  | Tagged<"UnavailableActivity">

export type AdviceRetirement = Tagged<"ExpiredRetirement"> | Tagged<"RetentionFailureRetirement">

export type CleanupAction =
  | Tagged<"DrainCleanupTail", { readonly handle: number }>
  | Tagged<"RetireCleanupWork", { readonly handle: number }>
  | Tagged<"ReleaseCleanupReservation", { readonly handle: number }>
  | Tagged<"ReleaseCleanupRevision", { readonly handle: number }>
  | Tagged<"ReleaseCleanupClaim", { readonly handle: number }>
  | Tagged<"ReleaseCleanupWorkspace">
  | Tagged<"InvalidCleanupAllocation">
  | Tagged<"InvalidCleanupReservation">
  | Tagged<"InvalidCleanupPlan">
export type CleanupFact =
  | Tagged<"CleanupTail", { readonly handle: number; readonly started: boolean }>
  | Tagged<
      "CleanupWork",
      {
        readonly handle: number
        readonly cached: boolean
        readonly completed: boolean
        readonly round_bound: boolean
        readonly work_bound: boolean
      }
    >
  | Tagged<
      "CleanupReservation",
      {
        readonly handle: number
        readonly present: boolean
        readonly transferred: boolean
        readonly discharged: boolean
      }
    >
  | Tagged<"CleanupRevision", { readonly handle: number; readonly present: boolean; readonly transferred: boolean }>
  | Tagged<"CleanupClaim", { readonly handle: number; readonly present: boolean; readonly transferred: boolean }>
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
        readonly index: number
        readonly remaining: number
        readonly stage: SelectionStage
      }
    >
  | Tagged<"SelectionFound", { readonly index: number }>
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

export type RetainedObservationOperation = Tagged<
  | "RetainedReadReceipt"
  | "RetainedCheckEnabled"
  | "RetainedPrepareBase"
  | "RetainedReadEvaluation"
  | "RetainedAttachEvaluation"
  | "RetainedOffer"
  | "RetainedComplete"
>
export type RetainedObservationStep =
  | Tagged<"RetainedObservationAwait", { readonly operation: RetainedObservationOperation }>
  | Tagged<"RetainedObservationDone" | "RetainedObservationRejected">
export type RetainedObservationResponse =
  | Tagged<"RetainedObservationAck">
  | Tagged<"RetainedObservationFlag", { readonly value: boolean }>

export type Command =
  | Tagged<"ObservePreparation">
  | Tagged<"AdvicePendingBarrier", { readonly advice: number }>
  | Tagged<"AdviceCheckActive", { readonly advice: number }>
  | Tagged<"AdvicePublish", { readonly advice: number }>
  | Tagged<"AdviceRecordPublished", { readonly advice: number; readonly publication: number }>
  | Tagged<"AdviceCheckExpired", { readonly advice: number }>
  | Tagged<"AdviceRemove", { readonly advice: number; readonly retirement: AdviceRetirement }>
  | Tagged<"CheckActive">
  | Tagged<"ReleaseWorkspace">
  | Tagged<"Offer", { readonly outcome: Outcome; readonly allowed: boolean }>
  | Tagged<"ReportDeliverabilityCapacity">
  | Tagged<"ReportDeliverabilityNotice">
  | Tagged<"ReportEmptyAnalytics", { readonly incomplete: boolean }>
  | Tagged<"ReportEmptyActivity", { readonly incomplete: boolean }>
  | Tagged<"ObserveReady", { readonly ready: List<Outcome> }>
  | Tagged<"LookupReuse", { readonly outcome: Outcome }>
  | Tagged<"ReadCached", { readonly item: Planned }>
  | Tagged<"ReadPending", { readonly item: Planned }>
  | Tagged<"RestorePending", { readonly item: Planned; readonly owner: number }>
  | Tagged<"ObservePlans", { readonly planned: List<Planned> }>
  | Tagged<"RecordReuseAnalytics", { readonly item: Planned }>
  | Tagged<"OwnerBarrier">
  | Tagged<"CompletePreparation", { readonly retained: List<Planned> }>
  | Tagged<"RegisterClear", { readonly item: Planned }>
  | Tagged<"ReleaseClear", { readonly revision: number }>
  | Tagged<"ReadLiveAdvice", { readonly item: Planned }>
  | Tagged<"PublishJoinedAdvice", { readonly advice: number }>
  | Tagged<"RecordJoinedOutcomes", { readonly advice: number; readonly publication: number }>
  | Tagged<"ReadCurrentAdvice", { readonly advice: number }>
  | Tagged<"ReadJoinedPending", { readonly item: Planned }>
  | Tagged<"AppendJoined", { readonly item: Planned; readonly owner: Maybe<number> }>
  | Tagged<"RememberExpected", { readonly item: Planned }>
  | Tagged<"RecordReuseActivity", { readonly item: Planned; readonly activity: ReuseActivity }>
  | Tagged<"JoinedBarrier">
  | Tagged<"RegisterRevision", { readonly slot: Slot }>
  | Tagged<"RegisterWork", { readonly slot: Slot; readonly revision: number }>
  | Tagged<"ObserveUnit", { readonly slot: Slot; readonly revision: number; readonly work: Maybe<number> }>
  | Tagged<"AttachOwner", { readonly slot: Slot; readonly revision: number; readonly work: Maybe<number> }>
  | Tagged<"Enqueue", { readonly slot: Slot; readonly revision: number; readonly work: Maybe<number> }>
  | Tagged<"StartCachedReview", { readonly slot: Slot }>
  | Tagged<"CompleteCachedReview", { readonly slot: Slot }>
  | Tagged<"RecordCachedActivity", { readonly slot: Slot }>
  | Tagged<"CheckCachedActive", { readonly slot: Slot; readonly revision: number; readonly work: Maybe<number> }>
  | Tagged<"ReadCachedAdvice", { readonly slot: Slot }>
  | Tagged<"RetireCachedWork", { readonly slot: Slot; readonly revision: number; readonly work: Maybe<number> }>
  | Tagged<"ReleaseCachedUnit", { readonly slot: Slot; readonly revision: number; readonly work: Maybe<number> }>
  | Tagged<"InsertCachedAdvice", { readonly slot: Slot; readonly revision: number; readonly work: Maybe<number> }>
  | Tagged<"ObserveRetainedAdvice", { readonly tail: number }>
  | Tagged<"PreserveAdviceTail", { readonly tail: number }>
  | Tagged<"AwaitAdviceTail", { readonly tail: number }>
  | Tagged<"FinalizeCachedUnit", { readonly slot: Slot; readonly revision: number; readonly work: Maybe<number> }>
  | Tagged<"ReleaseAttached", { readonly slot: Slot; readonly revision: number; readonly work: Maybe<number> }>
  | Tagged<"ReleaseUnspawned", { readonly slot: Slot; readonly revision: number }>
  | Tagged<"ReportCapacity", { readonly item: Planned }>
  | Tagged<"Cleanup", { readonly actions: List<CleanupAction> }>
  | Tagged<"PerformCleanup", { readonly action: CleanupAction }>

export type Response =
  | Tagged<"Ack">
  | Tagged<"CleanupInventory", { readonly facts: List<CleanupFact> }>
  | Tagged<"Active", { readonly value: boolean }>
  | Tagged<"Expired", { readonly value: boolean }>
  | Tagged<"Offered", { readonly accepted: boolean }>
  | Tagged<"Routed", { readonly key: number; readonly route: Route }>
  | Tagged<"CachedFacts", { readonly evaluation: number; readonly findings: number }>
  | Tagged<"PendingOwner", { readonly owner: number }>
  | Tagged<"AdviceOwner", { readonly owner: Maybe<number> }>
  | Tagged<"Published", { readonly publication: number }>
  | Tagged<"FindingCount", { readonly findings: number }>
  | Tagged<"JoinOwner", { readonly owner: Maybe<number> }>
  | Tagged<"Reserved", { readonly allocations: List<Maybe<Allocation>> }>
  | Tagged<"Revision", { readonly token: number }>
  | Tagged<"Work", { readonly token: Maybe<number> }>
  | Tagged<"Attached", { readonly accepted: boolean }>
  | Tagged<"Queued", { readonly accepted: boolean }>
  | Tagged<"ReviewAccepted", { readonly value: boolean }>
  | Tagged<"AdviceInserted", { readonly tail: number }>
  | Tagged<"Cancelled", { readonly token: number }>
  | Tagged<"Failed", { readonly token: number }>
  | Tagged<"Defect", { readonly token: number }>

export type Termination =
  | Tagged<"Inactive">
  | Tagged<"CancelledReason", { readonly token: number }>
  | Tagged<"TechnicalFailure", { readonly token: number }>
  | Tagged<"DefectFailure", { readonly token: number }>

declare const stateHandle: unique symbol
export type State = { readonly [stateHandle]: "PostPreparation.State" }

export type Request = Tagged<"Request", { readonly invocation: number; readonly id: number; readonly command: Command }>

export type Reply = Tagged<"Reply", { readonly invocation: number; readonly id: number; readonly response: Response }>

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
  | Tagged<"AdviceCleanupPending", { readonly advice: number; readonly reason: Termination }>

declare const core: {
  enrollment_initial(): EnrollmentStep
  fresh_enrollment_initial(): EnrollmentStep
  enrollment_resume(step: EnrollmentStep, reply: EnrollmentReply): EnrollmentStep
  sizing_initial(mode: SizingMode): SizingStep
  sizing_initial_ready(mode: SizingMode, ready: boolean): SizingStep
  sizing_resume(step: SizingStep, reply: SizingReply): SizingStep
  route_cached(route: Route): boolean
  native_plan_actions(route: Route): List<NativePlanAction>
  reuse_observation(route: Route): ReuseObservation
  planned_work(route: Route, policy: boolean, observation: boolean): WorkChoice
  selection_initial(kind: SelectionKind, length: number): SelectionStep
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
  retained_observation_initial(): RetainedObservationStep
  retained_observation_resume(
    step: RetainedObservationStep,
    response: RetainedObservationResponse
  ): RetainedObservationStep
  initial_settled(invocation: number, round_bound: boolean, outcomes: List<Outcome>, incomplete: boolean): Maybe<Step>
  resume_settled(step: Step, reply: Reply): Maybe<Step>
  initial(invocation: number, round_bound: boolean, outcomes: List<Outcome>, incomplete: boolean): Step
  advance(state: State): Step
  resume(step: Step, reply: Reply): Step
  advice_initial(invocation: number, advice: number): AdviceTailStep
  advice_initial_cleanup(invocation: number, advice: number, reason: Termination): AdviceTailStep
  advice_initial_preserved(): AdviceTailStep
  advice_retirement(expired: boolean): AdviceRetirement
  advice_resume(step: AdviceTailStep, reply: Reply): AdviceTailStep
}
export default core
