import {
  bendWorkAdmit, bendWorkCachedFinding, bendWorkClose, bendWorkCompleteSource,
  bendWorkCancelUnfinished,
  bendWorkInitial, bendWorkInterruptObservation, bendWorkInterruptUnit,
  bendWorkOutcome, bendWorkPendingFindings, bendWorkRetire, bendWorkSpawn,
  bendWorkStartSource, bendWorkStartUnit, bendWorkUnfinished, bendWorkReviseFinding,
  bendWorkPendingFor,
  bendLifecycleCutoff,
  bendLifecycleFinishGate,
  bendLifecycleFinishDisposition,
  bendLifecycleSelectionReserve,
  bendLifecycleReserveSelected,
  type BendList, type BendRound, type BendWorkOutcome, type BendWorkState,
  type BendLifecycleFinishDisposition,
  type BendOutputSelection,
  type BendWorkStep,
} from "./bend-policy.generated.js";

const ids = (values: BendList<bigint>): number[] => {
  const result: number[] = [];
  for (let node = values; node.$ === "Con"; node = node.tail) {
    const id = Number(node.head);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("invalid Bend work identity");
    result.push(id);
  }
  return result;
};

/** Source-free work authority for one composed advicee round. */
export class BendWorkTracker {
  #state: BendWorkState = bendWorkInitial();

  #accept(step: BendWorkStep): number[] | undefined {
    if (step.$ !== "Accepted") return undefined;
    const admitted = ids(step.admitted);
    this.#state = step.state;
    return admitted;
  }

  admit(): number {
    const admitted = this.#accept(bendWorkAdmit(this.#state));
    if (admitted?.length !== 1) throw new Error("Bend did not admit one source observation");
    return admitted[0]!;
  }

  spawn(observation: number): number | undefined {
    const admitted = this.#accept(bendWorkSpawn(this.#state, observation, 1));
    return admitted?.length === 1 ? admitted[0] : undefined;
  }

  startSource(observation: number): boolean {
    return this.#accept(bendWorkStartSource(this.#state, observation)) !== undefined;
  }

  startUnit(unit: number): boolean {
    return this.#accept(bendWorkStartUnit(this.#state, unit)) !== undefined;
  }

  cachedFinding(observation: number, count: number, bytes: number): number | undefined {
    const admitted = this.#accept(bendWorkCachedFinding(this.#state, observation, count, bytes));
    return admitted?.length === 1 ? admitted[0] : undefined;
  }

  completeSource(observation: number): boolean {
    return this.#accept(bendWorkCompleteSource(this.#state, observation)) !== undefined;
  }

  interruptSource(observation: number): boolean {
    return this.#accept(bendWorkInterruptObservation(this.#state, observation)) !== undefined;
  }

  outcome(unit: number, outcome: BendWorkOutcome): boolean {
    const accepted = this.#accept(bendWorkOutcome(this.#state, unit, outcome)) !== undefined;
    if (accepted && outcome.$ !== "Finding") this.retire(unit);
    return accepted;
  }

  interruptUnit(unit: number): boolean {
    const accepted = this.#accept(bendWorkInterruptUnit(this.#state, unit)) !== undefined;
    if (accepted) this.retire(unit);
    return accepted;
  }

  retire(unit: number): boolean {
    return this.#accept(bendWorkRetire(this.#state, unit)) !== undefined;
  }

  reviseFinding(unit: number, count: number, bytes: number): boolean {
    return this.#accept(bendWorkReviseFinding(this.#state, unit, count, bytes)) !== undefined;
  }

  unfinished(): number {
    return Number(bendWorkUnfinished(this.#state));
  }

  pendingFindings(): number {
    return Number(bendWorkPendingFindings(this.#state));
  }

  pendingFor(unit: number): number {
    return Number(bendWorkPendingFor(this.#state, unit));
  }

  close(): { readonly cancelledSource: number[]; readonly cancelledJev: number[];
    readonly discardedFindings: number[] } {
    const closed = bendWorkClose(this.#state);
    this.#state = closed.state;
    return { cancelledSource: ids(closed.cancelled_source), cancelledJev: ids(closed.cancelled_jev),
      discardedFindings: ids(closed.discarded_findings) };
  }

  cancelUnfinished(): { readonly cancelledSource: number[]; readonly cancelledJev: number[] } {
    const cancelled = bendWorkCancelUnfinished(this.#state);
    this.#state = cancelled.state;
    return { cancelledSource: ids(cancelled.cancelled_source), cancelledJev: ids(cancelled.cancelled_jev) };
  }

  cutoff(round: BendRound, token: number): { readonly round: BendRound;
    readonly cancelledSource: number[]; readonly cancelledJev: number[] } | undefined {
    const cutoff = bendLifecycleCutoff(round, this.#state, token);
    if (cutoff.$ !== "CutoffGranted") return undefined;
    const cancelledSource = ids(cutoff.cancelled_source);
    const cancelledJev = ids(cutoff.cancelled_jev);
    this.#state = cutoff.work;
    return { round: cutoff.round, cancelledSource, cancelledJev };
  }

  finishGate(round: BendRound, token: number, extraUnfinished: number, deadlineReached: boolean):
    { readonly status: "waiting"; readonly round: BendRound } |
    { readonly status: "cutoff"; readonly round: BendRound;
      readonly cancelledSource: number[]; readonly cancelledJev: number[] } | undefined {
    const result = bendLifecycleFinishGate(round, this.#state, token, extraUnfinished, deadlineReached);
    if (result.$ === "GateDenied") return undefined;
    if (result.$ === "GateWaiting") return { status: "waiting", round: result.round };
    const cancelledSource = ids(result.cancelled_source);
    const cancelledJev = ids(result.cancelled_jev);
    this.#state = result.work;
    return { status: "cutoff", round: result.round, cancelledSource, cancelledJev };
  }

  reserveSelected(round: BendRound, token: number, selectedUnits: ReadonlyArray<number>): BendRound | undefined {
    const result = bendLifecycleReserveSelected(round, this.#state, token, selectedUnits);
    return result.$ === "Granted" ? result.state : undefined;
  }

  reserveOutputSelection(selectedUnits: ReadonlyArray<number>): BendOutputSelection | undefined {
    const result = bendLifecycleSelectionReserve(this.#state, selectedUnits);
    return result.$ === "SelectionReserved" ? result.state : undefined;
  }

  finishDisposition(selectedUnits: ReadonlyArray<number>, hasNotice: boolean,
    passNotices: boolean, canWrite: boolean, bindingValid: boolean,
    deadlineReached: boolean): BendLifecycleFinishDisposition {
    return bendLifecycleFinishDisposition(this.#state, selectedUnits, hasNotice,
      passNotices, canWrite, bindingValid, deadlineReached);
  }
}
