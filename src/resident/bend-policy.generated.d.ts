export type BendList<T> = { readonly $: "Nil" } |
  { readonly $: "Con"; readonly head: T; readonly tail: BendList<T> };

export type BendSelection = {
  readonly $: "Selection";
  readonly partition: bigint;
  readonly round: bigint;
  readonly selected: BendList<bigint>;
  readonly retained: BendList<bigint>;
  readonly findings: bigint;
  readonly bytes: bigint;
};

export type BendAdvice = {
  readonly $: "Advice";
  readonly id: number | bigint;
  readonly unit: number | bigint;
  readonly partition: number | bigint;
  readonly round: number | bigint;
  readonly snapshot: number | bigint;
  readonly current_snapshot: number | bigint;
  readonly credential: number | bigint;
  readonly current_credential: number | bigint;
  readonly age_ms: number | bigint;
  readonly solo_bytes: number | bigint;
  readonly collection_ready: boolean;
};

export type BendSelectionResult =
  | { readonly $: "Selected" | "Retained" | "Expired" | "Duplicate"; readonly state: BendSelection }
  | { readonly $: "Limited"; readonly state: BendSelection; readonly id: bigint };

export function bendSelectionInitial(
  partition: number | bigint, round: number | bigint,
): BendSelection;
export function bendSelectionStep(
  state: BendSelection, advice: BendAdvice, prospectiveBytes: number | bigint,
): BendSelectionResult;
export function bendFitsBatch(items: number | bigint, bytes: number | bigint): boolean;

export type BendAdmissionState = {
  readonly $: "AdmissionState";
  readonly partition: bigint;
  readonly lifetime: bigint;
  readonly round: bigint;
  readonly active: boolean;
  readonly closed_at: bigint;
  readonly next_token: bigint;
  readonly permits: BendList<unknown>;
  readonly used: BendList<unknown>;
};
export type BendMaybeNat = { readonly $: "None" } | { readonly $: "Some"; readonly value: bigint };
export type BendAdmissionResult =
  | { readonly $: "Accepted"; readonly state: BendAdmissionState;
      readonly token: BendMaybeNat; readonly round: BendMaybeNat }
  | { readonly $: "Rejected"; readonly state: BendAdmissionState;
      readonly reason: { readonly $: string } };
export type BendAdmissionEvent =
  | { readonly $: "Issue"; readonly tool: number | bigint;
      readonly started: number | bigint; readonly deadline: number | bigint;
      readonly now: number | bigint }
  | { readonly $: "Consume"; readonly token: number | bigint;
      readonly tool: number | bigint; readonly now: number | bigint }
  | { readonly $: "Release"; readonly token: number | bigint }
  | { readonly $: "CloseRound"; readonly at: number | bigint };
export function bendAdmissionInitial(partition: number | bigint,
  lifetime: number | bigint): BendAdmissionState;
export function bendAdmissionStep(state: BendAdmissionState, partition: number | bigint,
  lifetime: number | bigint, event: BendAdmissionEvent): BendAdmissionResult;
export function bendAdmissionCloseProspective(state: BendAdmissionState,
  at: number | bigint): BendAdmissionResult;
export function bendWorkFinishWait(unfinished: number | bigint,
  deadlineReached: boolean, continuationBudget: boolean): boolean;

export type BendWorkState = {
  readonly $: "Work";
  readonly next_observation: bigint;
  readonly next_unit: bigint;
  readonly source_capacity: unknown;
  readonly review_capacity: unknown;
  readonly observations: BendList<unknown>;
  readonly units: BendList<unknown>;
};
export type BendWorkStep =
  | { readonly $: "Accepted"; readonly state: BendWorkState; readonly admitted: BendList<bigint> }
  | { readonly $: "Rejected"; readonly state: BendWorkState; readonly reason: { readonly $: string } };
export type BendWorkOutcome =
  | { readonly $: "Finding"; readonly count: number | bigint; readonly bytes: number | bigint }
  | { readonly $: "Clear" | "Unavailable" };
export type BendWorkClose = { readonly $: "Closed"; readonly state: BendWorkState;
  readonly cancelled_source: BendList<bigint>; readonly cancelled_jev: BendList<bigint>;
  readonly discarded_findings: BendList<bigint> };
export type BendWorkCancel = { readonly $: "Cancelled"; readonly state: BendWorkState;
  readonly cancelled_source: BendList<bigint>; readonly cancelled_jev: BendList<bigint> };
export function bendWorkInitial(): BendWorkState;
export function bendWorkAdmit(state: BendWorkState): BendWorkStep;
export function bendWorkStartSource(state: BendWorkState, observation: number | bigint): BendWorkStep;
export function bendWorkStartUnit(state: BendWorkState, unit: number | bigint): BendWorkStep;
export function bendWorkSpawn(state: BendWorkState, observation: number | bigint,
  count: number | bigint): BendWorkStep;
export function bendWorkCompleteSource(state: BendWorkState,
  observation: number | bigint): BendWorkStep;
export function bendWorkCachedFinding(state: BendWorkState, observation: number | bigint,
  count: number | bigint, bytes: number | bigint): BendWorkStep;
export function bendWorkOutcome(state: BendWorkState, unit: number | bigint,
  outcome: BendWorkOutcome): BendWorkStep;
export function bendWorkInterruptObservation(state: BendWorkState,
  observation: number | bigint): BendWorkStep;
export function bendWorkInterruptUnit(state: BendWorkState, unit: number | bigint): BendWorkStep;
export function bendWorkRetire(state: BendWorkState, unit: number | bigint): BendWorkStep;
export function bendWorkReviseFinding(state: BendWorkState, unit: number | bigint,
  count: number | bigint, bytes: number | bigint): BendWorkStep;
export function bendWorkUnfinished(state: BendWorkState): bigint;
export function bendWorkPendingFindings(state: BendWorkState): bigint;
export function bendWorkPendingFor(state: BendWorkState, unit: number | bigint): bigint;
export function bendWorkClose(state: BendWorkState): BendWorkClose;
export function bendWorkCancelUnfinished(state: BendWorkState): BendWorkCancel;

export type BendLeaseSurface = { readonly $: "Edit" | "Background" | "Stop" };
export type BendLeasePhase = { readonly $: "Available" } |
  { readonly $: "Reserved" | "Authorized"; readonly token: bigint; readonly surface: BendLeaseSurface } |
  { readonly $: "Submitted" | "Uncertain"; readonly surface: BendLeaseSurface };
export type BendLease = {
  readonly $: "Lease";
  readonly item: bigint;
  readonly round: bigint;
  readonly closed: boolean;
  readonly reoffered: boolean;
  readonly phase: BendLeasePhase;
};
export type BendLeaseResult = { readonly $: "Granted" | "Denied"; readonly state: BendLease };
export function bendLeaseInitial(item: number | bigint, round: number | bigint): BendLease;
export function bendLeaseReserve(state: BendLease, round: number | bigint,
  token: number | bigint, surface: BendLeaseSurface): BendLeaseResult;
export function bendLeaseAuthorize(state: BendLease, round: number | bigint,
  token: number | bigint): BendLeaseResult;
export function bendLeaseRelease(state: BendLease, round: number | bigint,
  token: number | bigint): BendLeaseResult;
export function bendLeaseTerminal(state: BendLease, round: number | bigint,
  token: number | bigint, certain: boolean): BendLeaseResult;
export function bendLeaseReoffer(state: BendLease, round: number | bigint,
  token: number | bigint, fresh: boolean): BendLeaseResult;
export function bendLeaseClose(state: BendLease): BendLease;
export function bendLeaseSuppresses(state: BendLease, round: number | bigint,
  requested: BendLeaseSurface): boolean;

export type BendRound = {
  readonly $: "Round";
  readonly generation: bigint;
  readonly active: boolean;
  readonly closed_at: bigint;
  readonly continuations: bigint;
  readonly stop_token: bigint;
  readonly barrier: boolean;
  readonly deciding: boolean;
  readonly output_reserved: boolean;
};
export type BendRoundStep =
  | { readonly $: "Granted"; readonly state: BendRound }
  | { readonly $: "Denied"; readonly state: BendRound };

export function bendRoundInitial(): BendRound;
export function bendRoundMaxContinuations(): bigint;
export function bendRoundActive(state: BendRound, generation: number | bigint): boolean;
export function bendRoundBudget(state: BendRound): boolean;
export function bendRoundBeginStop(state: BendRound, token: number | bigint): BendRoundStep;
export function bendRoundOwnsStop(state: BendRound, token: number | bigint): boolean;
export function bendRoundBeginDecision(state: BendRound, token: number | bigint): BendRoundStep;
export function bendRoundConsume(state: BendRound): BendRoundStep;
export function bendRoundReserveOutput(state: BendRound, token: number | bigint): BendRoundStep;
export function bendRoundFinishStop(state: BendRound, token: number | bigint,
  close: boolean, at: number | bigint): BendRoundStep;
export function bendRoundReopen(state: BendRound, generation: number | bigint): BendRoundStep;

export type BendBackgroundWaiter = {
  readonly $: "Waiter";
  readonly owner: bigint;
};
export type BendBackgroundStep =
  | { readonly $: "Granted"; readonly state: BendBackgroundWaiter }
  | { readonly $: "Denied"; readonly state: BendBackgroundWaiter };
export function bendBackgroundInitial(): BendBackgroundWaiter;
export function bendBackgroundClaim(state: BendBackgroundWaiter, token: number | bigint,
  active: boolean, used: number | bigint,
  capacity: number | bigint): BendBackgroundStep;
export function bendBackgroundRelease(state: BendBackgroundWaiter,
  token: number | bigint): BendBackgroundStep;
export function bendBackgroundExpire(state: BendBackgroundWaiter,
  elapsed: number | bigint, lifetime: number | bigint): BendBackgroundWaiter;

export type BendNoticeAction = { readonly $: "Suppress" | "Refresh" | "RejectFull" | "Create" };
export function bendNoticeDecide(remaining: BendMaybeNat,
  count: number | bigint, maximum: number | bigint): BendNoticeAction;
