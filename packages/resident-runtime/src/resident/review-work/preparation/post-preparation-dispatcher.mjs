/**
 * @typedef {{ $: "PostPreparationFinished" } | { $: "PostPreparationStopped", reason: import("./post-preparation-core.js").Termination }} PostTerminal
 * @typedef {PostTerminal | { $: "Types.AwaitService", request: import("./post-preparation-core.js").Request }} PostProjection
 * @typedef {{ $: "AdviceTailFinished" } | { $: "AdviceTailPreserved" } | { $: "AdviceTailStopped", reason: import("./post-preparation-core.js").Termination, cleanupPending: boolean }} AdviceTerminal
 * @typedef {AdviceTerminal | { $: "Types.AwaitService", request: import("./post-preparation-core.js").Request }} AdviceProjection
 */
// Mechanical ABI projection; Bend owns the entire post-preparation progression.
/** @param {typeof import("./post-preparation-core.js").default} core */
export function createPostPreparationMachine(core) {
  /** @param {{ $: "None" } | { $: "Some", value: import("./post-preparation-core.js").Step }} result */
  const settled = (result) => {
    if (result.$ === "None") throw new Error("Post-preparation internal dispatch did not settle")
    return result.value
  }
  return {
    /** @type {"post"} */
    kind: "post",
    /** @param {{ invocation: bigint, postPreparation: { roundBound: boolean, outcomes: import("@hapsland/source-artifacts/direct-event/value/codec").List<import("./post-preparation-core.js").Outcome>, incomplete: boolean } }} input */
    initial: (input) =>
      settled(
        core.initial_settled(
          input.invocation,
          input.postPreparation.roundBound,
          input.postPreparation.outcomes,
          input.postPreparation.incomplete
        )
      ),
    /**
     * @param {import("./post-preparation-core.js").Step} step
     * @param {{ $: "Types.ServiceReply", reply: import("./post-preparation-core.js").Reply }} event
     */
    resume: (step, event) => {
      if (event.$ !== "Types.ServiceReply") throw new Error("Invalid post-preparation reply envelope")
      return settled(core.resume_settled(step, event.reply))
    },
    /**
     * @param {import("./post-preparation-core.js").Step} step
     * @returns {PostProjection}
     */
    view: (step) => {
      if (step.$ === "Await") return { $: "Types.AwaitService", request: step.request }
      if (step.$ === "Finished") return { $: "PostPreparationFinished" }
      if (step.$ === "Stopped") return { $: "PostPreparationStopped", reason: step.reason }
      throw new Error("Unsettled post-preparation projection")
    },
    /** @param {PostTerminal} projection */
    accepted: (projection) =>
      projection.$ === "PostPreparationFinished"
        ? { continued: true }
        : { continued: false, reason: projection.reason },
    disposeInvocation() {},
    get retainedHandles() {
      return 0
    }
  }
}

// The same module implements the independent post-insert continuation.
/** @param {typeof import("./post-preparation-core.js").default} core */
export function createAdviceTailMachine(core) {
  /** @type {Partial<Record<import("./post-preparation-core.js").Command["$"], import("@hapsland/agent-flow-bend/canonical-resolver-owner").AdvicePermission["$"]>>} */
  const permissions = {
    AdvicePendingBarrier: "TailBarrier",
    AdviceCheckActive: "TailActive",
    AdvicePublish: "TailPublish",
    AdviceRecordPublished: "TailRecord",
    AdviceCheckExpired: "TailRemove",
    AdviceRemove: "TailRemove"
  }
  return {
    /** @type {"advice"} */
    kind: "advice",
    /** @param {import("./post-preparation-core.js").Request} request */
    permission: (request) => {
      const permission = permissions[request.command.$]
      if (!permission) throw new Error("Unknown closed advice command")
      return { $: permission }
    },
    /** @param {{ invocation: bigint, adviceTail: { advice: bigint, preserved?: boolean, failure?: import("./post-preparation-core.js").Termination } }} input */
    initial: (input) =>
      input.adviceTail.preserved
        ? core.advice_initial_preserved()
        : input.adviceTail.failure
          ? core.advice_initial_cleanup(input.invocation, input.adviceTail.advice, input.adviceTail.failure)
          : core.advice_initial(input.invocation, input.adviceTail.advice),
    /**
     * @param {import("./post-preparation-core.js").AdviceTailStep} step
     * @param {{ $: "Types.ServiceReply", reply: import("./post-preparation-core.js").Reply }} event
     */
    resume: (step, event) => {
      if (event.$ !== "Types.ServiceReply") throw new Error("Invalid advice tail reply envelope")
      return core.advice_resume(step, event.reply)
    },
    /**
     * @param {import("./post-preparation-core.js").AdviceTailStep} step
     * @returns {AdviceProjection}
     */
    view: (step) => {
      if (step.$ === "AdviceAwait") return { $: "Types.AwaitService", request: step.request }
      if (step.$ === "AdvicePreserved") return { $: "AdviceTailPreserved" }
      if (step.$ === "AdviceFinished") return { $: "AdviceTailFinished" }
      if (step.$ === "AdviceStopped" || step.$ === "AdviceCleanupPending")
        return { $: "AdviceTailStopped", reason: step.reason, cleanupPending: step.$ === "AdviceCleanupPending" }
      throw new Error("Unsettled advice tail projection")
    },
    /** @param {AdviceTerminal} projection */
    accepted: (projection) =>
      projection.$ === "AdviceTailFinished" || projection.$ === "AdviceTailPreserved"
        ? { adviceRetained: true }
        : { adviceRetained: false, reason: projection.reason, cleanupPending: projection.cleanupPending },
    disposeInvocation() {},
    get retainedHandles() {
      return 0
    }
  }
}
