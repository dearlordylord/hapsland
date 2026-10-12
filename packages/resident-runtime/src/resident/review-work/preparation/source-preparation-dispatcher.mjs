// Mechanical Canonical driver envelope for the outer source cursor.
/** @param {typeof import("./source-preparation-core.js").default} core */
export function createSourcePreparationMachine(core) {
  return {
    /** @param {{ invocation: bigint, sourcePreparation: { entry: "full" | "after-gates", policyRequired: boolean, controlledPresent: boolean, candidates: import("@hapsland/source-artifacts/direct-event/value/codec").List<bigint> } }} input */
    initial: (input) =>
      input.sourcePreparation.entry === "after-gates"
        ? core.initial_after_gates(
            input.invocation,
            input.sourcePreparation.policyRequired,
            input.sourcePreparation.candidates
          )
        : core.initial(
            input.invocation,
            input.sourcePreparation.policyRequired,
            input.sourcePreparation.controlledPresent,
            input.sourcePreparation.candidates
          ),
    /**
     * @param {import("./source-preparation-core.js").Step} step
     * @param {{ $: "Types.ServiceReply", reply: import("./source-preparation-core.js").Reply }} event
     */
    resume: (step, event) => {
      if (event.$ !== "Types.ServiceReply") throw new Error("Invalid source reply envelope")
      const resumed = core.resume(step, event.reply)
      return resumed.$ === "Rejected" ? step : resumed
    },
    /** @param {import("./source-preparation-core.js").Request} request */
    permission: (request) => ({
      $: [
        "SourceNew",
        "SourceCandidate",
        "SourceActivity",
        "SourcePolicy",
        "SourceObservation",
        undefined,
        "SourceStartPolicy",
        "SourceStartObservation",
        "SourceGate",
        "SourceEarlyRelease"
      ][Number(core.permission(request.command))]
    }),
    /** @param {import("./source-preparation-core.js").Request} request */
    afterPermission: (request) => {
      /** @type {Partial<Record<import("./source-preparation-core.js").Command["$"], string>>} */
      const permissions = {
        AfterPrepare: "AfterBarrier",
        RecordPreparationFailureAnalytics: "AfterRecoveryAnalytics",
        ReleaseJobReservation: "AfterRecoveryRelease",
        ReadRuntimeActive: "AfterRecoveryRuntime",
        RecordUnavailableActivity: "AfterRecoveryActivity"
      }
      const permission = permissions[request.command.$]
      if (!permission) throw new Error("Invalid after-source command")
      return { $: permission }
    },
    /** @param {import("./source-preparation-core.js").Step} step */
    view: (step) => {
      if (step.$ === "Await") return { $: "Types.AwaitService", request: step.request }
      if (step.$ === "Finished") return { $: "SourcePreparationFinished", completed: true }
      if (step.$ === "Stopped") return { $: "SourcePreparationStopped", completed: step.completed, reason: step.reason }
      throw new Error("Invalid source cursor projection")
    },
    /** @param {{ $: "SourcePreparationFinished" | "SourcePreparationStopped", completed: boolean, reason?: import("./source-preparation-core.js").Reason }} projection */
    accepted: (projection) => ({
      completed: projection.completed,
      continued: projection.$ === "SourcePreparationFinished",
      reason: projection.reason
    }),
    disposeInvocation() {},
    get retainedHandles() {
      return 0
    }
  }
}
