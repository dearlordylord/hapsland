import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"

type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields
type Maybe<A> = Tagged<"None"> | Tagged<"Some", { readonly value: A }>

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
  | Tagged<
      "Cleanup",
      { readonly remaining: List<Slot>; readonly planned: List<Planned>; readonly revision: Maybe<bigint> }
    >

export type Response =
  | Tagged<"Ack">
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
  initial(invocation: bigint, round_bound: boolean, outcomes: List<Outcome>, incomplete: boolean): Step
  advance(state: State): Step
  resume(step: Step, reply: Reply): Step
  advice_initial(invocation: bigint, advice: bigint): AdviceTailStep
  advice_initial_cleanup(invocation: bigint, advice: bigint, reason: Termination): AdviceTailStep
  advice_initial_preserved(): AdviceTailStep
  advice_resume(step: AdviceTailStep, reply: Reply): AdviceTailStep
}
export default core
