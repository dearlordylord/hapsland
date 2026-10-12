import {
  acceptGraphProjection,
  graphProtocol
} from "@hapsland/source-analysis/direct-event/graph-resolution/composition"
// Private correlation of an invocation's actual Bend engine and retained step.
// No product state is copied, and requests/replies retain their owner protocols.
/**
 * @typedef {ReturnType<typeof import("@hapsland/source-analysis/direct-event/graph-resolution/composition").createGraphMachine>} ArtifactMachine
 * @typedef {ReturnType<typeof import("@hapsland/review-execution/direct-event/preparation").createPreparationCapability>["machine"]} PreparationMachine
 * @typedef {ReturnType<typeof import("../preparation/source-preparation-dispatcher.mjs").createSourcePreparationMachine>} SourceMachine
 * @typedef {ReturnType<typeof import("../preparation/post-preparation-dispatcher.mjs").createPostPreparationMachine>} PostMachine
 * @typedef {ReturnType<typeof import("../preparation/post-preparation-dispatcher.mjs").createAdviceTailMachine>} AdviceMachine
 * @typedef {ArtifactMachine | PreparationMachine | SourceMachine | PostMachine | AdviceMachine} Machine
 * @typedef {Parameters<ArtifactMachine["initial"]>[0] | Parameters<PreparationMachine["initial"]>[0] | Parameters<SourceMachine["initial"]>[0] | Parameters<PostMachine["initial"]>[0] | Parameters<AdviceMachine["initial"]>[0]} Input
 * @typedef {Awaited<ReturnType<typeof import("@hapsland/source-analysis/direct-event/graph-resolution").performGraphServiceRequest>> | Awaited<ReturnType<ReturnType<typeof import("@hapsland/review-execution/direct-event/preparation").createPreparationCapability>["perform"]>> | import("../preparation/source-preparation-core.js").Reply | import("../preparation/post-preparation-core.js").Reply} Reply
 * @typedef {{kind: "artifact", machine: ArtifactMachine, step: ReturnType<ArtifactMachine["initial"]>} | {kind: "preparation", machine: PreparationMachine, step: ReturnType<PreparationMachine["initial"]>} | {kind: "source", machine: SourceMachine, step: ReturnType<SourceMachine["initial"]>} | {kind: "post", machine: PostMachine, step: ReturnType<PostMachine["initial"]>} | {kind: "advice", machine: AdviceMachine, step: ReturnType<AdviceMachine["initial"]>}} Continuation
 * @typedef {{kind: "artifact", machine: ArtifactMachine, view: ReturnType<ArtifactMachine["view"]>} | {kind: "preparation", machine: PreparationMachine, view: ReturnType<PreparationMachine["view"]>} | {kind: "source", machine: SourceMachine, view: ReturnType<SourceMachine["view"]>} | {kind: "post", machine: PostMachine, view: ReturnType<PostMachine["view"]>} | {kind: "advice", machine: AdviceMachine, view: ReturnType<AdviceMachine["view"]>}} Projection
 */

/** @param {Machine} machine @param {Input} input @returns {Continuation} */
export function initial(machine, input) {
  const protocols = [
    "$" in input && input.$ === "Types.ResolverInput",
    "preparation" in input,
    "sourcePreparation" in input,
    "postPreparation" in input,
    "adviceTail" in input
  ]
  if (protocols.filter(Boolean).length !== 1) throw new TypeError("Ambiguous owned input binding")
  switch (machine.kind) {
    case "artifact":
      if (!("$" in input) || input.$ !== "Types.ResolverInput") throw new TypeError("Wrong artifact input binding")
      return graphProtocol.initial(machine, input)
    case "preparation":
      if (!("preparation" in input)) throw new TypeError("Wrong preparation input binding")
      return { kind: "preparation", machine, step: machine.initial(input) }
    case "source":
      if (!("sourcePreparation" in input)) throw new TypeError("Wrong source input binding")
      return { kind: "source", machine, step: machine.initial(input) }
    case "post":
      if (!("postPreparation" in input)) throw new TypeError("Wrong post input binding")
      return { kind: "post", machine, step: machine.initial(input) }
    case "advice":
      if (!("adviceTail" in input)) throw new TypeError("Wrong advice input binding")
      return { kind: "advice", machine, step: machine.initial(input) }
    default:
      throw new TypeError("Unknown owned engine")
  }
}

/** @param {Continuation} held @returns {Projection} */
export function view(held) {
  switch (held.kind) {
    case "artifact":
      return graphProtocol.view(held)
    case "preparation":
      return { kind: "preparation", machine: held.machine, view: held.machine.view(held.step) }
    case "source":
      return { kind: "source", machine: held.machine, view: held.machine.view(held.step) }
    case "post":
      return { kind: "post", machine: held.machine, view: held.machine.view(held.step) }
    case "advice":
      return { kind: "advice", machine: held.machine, view: held.machine.view(held.step) }
    default:
      throw new TypeError("Unknown owned continuation")
  }
}

// Narrow a closed reply union at the physical protocol seam. Shared empty/failure
// constructors remain shared; required Source defect flags are checked explicitly.
/** @param {Exclude<Reply, {$: "Types.Reply"}>} reply @returns {import("../preparation/source-preparation-core.js").Reply} */
function sourceReply(reply) {
  const response = reply.response
  switch (response.$) {
    case "GateAccepted":
    case "ExpectedActivity":
    case "Active":
    case "WorkspaceAdmitted":
    case "WorkspaceRefused":
    case "ObservationCommittedCancelled":
    case "ObservationCommittedFailure":
    case "ObservationCommittedDefect":
    case "CandidateContinued":
    case "Ack":
    case "CompletionAccepted":
    case "Failed":
      return { ...reply, response }
    case "Defect":
      if (!("interrupted" in response) || !("recoverable" in response))
        throw new TypeError("Missing source defect facts")
      return { ...reply, response }
    case "Cancelled":
      if (!("token" in response)) throw new TypeError("Missing source cancellation token")
      return { ...reply, response }
    default:
      throw new TypeError("Wrong source reply binding")
  }
}

/** @param {Exclude<Reply, {$: "Types.Reply"}>} reply @returns {import("../preparation/post-preparation-core.js").Reply} */
function postReply(reply) {
  const response = reply.response
  switch (response.$) {
    case "Ack":
    case "Active":
    case "Expired":
    case "Offered":
    case "Routed":
    case "CachedFacts":
    case "PendingOwner":
    case "AdviceOwner":
    case "Published":
    case "FindingCount":
    case "JoinOwner":
    case "Reserved":
    case "Revision":
    case "Work":
    case "Attached":
    case "Queued":
    case "ReviewAccepted":
    case "AdviceInserted":
    case "Failed":
    case "Defect":
      return { ...reply, response }
    case "Cancelled":
      if (!("token" in response)) throw new TypeError("Missing post cancellation token")
      return { ...reply, response }
    default:
      throw new TypeError("Wrong post reply binding")
  }
}

/** @param {Exclude<Reply, {$: "Types.Reply"}>} reply @returns {Awaited<ReturnType<ReturnType<typeof import("@hapsland/review-execution/direct-event/preparation").createPreparationCapability>["perform"]>>} */
function preparationReply(reply) {
  const response = reply.response
  switch (response.$) {
    case "Ack":
    case "Cancelled":
    case "AmbiguityClassificationFailed":
    case "PathAllowed":
    case "PathDenied":
    case "SourceCaptured":
    case "SourceUnavailable":
    case "PreflightDone":
    case "MaterializationDone":
    case "SourceExtracted":
    case "NativePatchVerified":
    case "AmbiguityClassified":
    case "RootResolved":
    case "UnitsRendered":
    case "TechnicalFailure":
      return { ...reply, response }
    default:
      throw new TypeError("Wrong preparation reply binding")
  }
}

/** @param {Continuation} held @param {Reply} reply @returns {Continuation} */
export function resume(held, reply) {
  if (held.kind === "artifact") {
    if (reply.$ !== "Types.Reply") throw new TypeError("Wrong artifact reply binding")
    return graphProtocol.resume(held, reply)
  }
  if (reply.$ === "Types.Reply") throw new TypeError("Wrong workflow reply binding")
  switch (held.kind) {
    case "preparation":
      return {
        ...held,
        step: held.machine.resume(held.step, { $: "Types.ServiceReply", reply: preparationReply(reply) })
      }
    case "source":
      return { ...held, step: held.machine.resume(held.step, { $: "Types.ServiceReply", reply: sourceReply(reply) }) }
    case "post":
      return { ...held, step: held.machine.resume(held.step, { $: "Types.ServiceReply", reply: postReply(reply) }) }
    case "advice":
      return { ...held, step: held.machine.resume(held.step, { $: "Types.ServiceReply", reply: postReply(reply) }) }
    default:
      throw new TypeError("Unknown owned continuation")
  }
}

/** @param {Projection} projected
 * @returns {ReturnType<typeof acceptGraphProjection> | ReturnType<PreparationMachine["accepted"]> | ReturnType<SourceMachine["accepted"]> | ReturnType<PostMachine["accepted"]> | ReturnType<AdviceMachine["accepted"]>}
 */
export function accepted(projected) {
  switch (projected.kind) {
    case "artifact":
      return acceptGraphProjection(projected.view)
    case "preparation":
      if (projected.view.$ !== "Types.AwaitService") return projected.machine.accepted(projected.view)
      break
    case "source":
      if (projected.view.$ !== "Types.AwaitService") return projected.machine.accepted(projected.view)
      break
    case "post":
      if (projected.view.$ !== "Types.AwaitService") return projected.machine.accepted(projected.view)
      break
    case "advice":
      if (projected.view.$ !== "Types.AwaitService") return projected.machine.accepted(projected.view)
      break
  }
  throw new TypeError("Unaccepted owned projection")
}
