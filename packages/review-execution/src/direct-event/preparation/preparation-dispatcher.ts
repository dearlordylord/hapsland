import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import type {
  ReferenceSlot,
  PlannedReference,
  ReferenceOmission
} from "@hapsland/source-analysis/direct-event/graph-resolution/composition"
import type { Input, Step, Request, Reply, Maybe, Response } from "./preparation-core.js"

type RootResolved = Extract<Response, { readonly $: "RootResolved" }>
export type PreparationReply = Omit<Reply, "response"> & {
  readonly response:
    | Exclude<Response, RootResolved>
    | (Omit<RootResolved, "references"> & {
        readonly references: import("@hapsland/source-artifacts/direct-event/value/codec").List<ReferenceSlot>
      })
}
export type PreparationInvocation = { readonly invocation: number; readonly preparation: Input }
export type PreparationEvent = { readonly $: "Types.ServiceReply"; readonly reply: PreparationReply }
type SettledStep = Exclude<Step, { readonly $: "Internal" }>
type Projection =
  | { readonly $: "Types.AwaitService"; readonly request: Request }
  | { readonly $: "PreparationFinished"; readonly result: Extract<Step, { $: "Finished" }>["result"] }
  | { readonly $: "PreparationFailed"; readonly reason: string }

const referenceOwner = "../../../../source-analysis/src/direct-event/graph-resolution/traversal/core" as const
function omission(reason: ReferenceOmission): ReferenceOmission<typeof referenceOwner> {
  switch (reason.$) {
    case "traversal/core.Unresolved":
      return { $: `${referenceOwner}.Unresolved` }
    case "traversal/core.UnsupportedTarget":
      return { $: `${referenceOwner}.UnsupportedTarget` }
    case "traversal/core.ReferenceLimit":
      return { $: `${referenceOwner}.ReferenceLimit` }
    case "traversal/core.Unavailable":
      return { $: `${referenceOwner}.Unavailable` }
    default:
      throw new TypeError("Invalid Graph reference omission")
  }
}
function planned(reference: PlannedReference): PlannedReference<typeof referenceOwner> {
  switch (reference.$) {
    case "traversal/core.Included":
      return { ...reference, $: `${referenceOwner}.Included` }
    case "traversal/core.Expanded":
      return { ...reference, $: `${referenceOwner}.Expanded` }
    case "traversal/core.Omitted":
      return { ...reference, $: `${referenceOwner}.Omitted`, reason: omission(reference.reason) }
    default:
      throw new TypeError("Invalid Graph planned reference")
  }
}
// Only RootResolved carries Graph-owned constructors. ProductValue, extraction
// facts and all other Preparation records already use their owning ABI.
function preparationReply(reply: PreparationReply): Reply {
  if (reply.response.$ !== "RootResolved") return { ...reply, response: reply.response }
  return {
    ...reply,
    response: {
      ...reply.response,
      references: list(
        unlist(reply.response.references).map((slot) => {
          if (slot.$ !== "traversal/core.ReferenceSlot") throw new TypeError("Invalid Graph reference slot")
          return { ...slot, $: `${referenceOwner}.ReferenceSlot` as const, reference: planned(slot.reference) }
        })
      )
    }
  }
}

// Mechanical dispatch only: Bend chooses each contract, candidate and root.
// Canonical owns lifecycle through the same driver envelope as resolver children.
export function createPreparationMachine(core: typeof import("./preparation-core.js").default) {
  const settled = (result: Maybe<Step>): SettledStep => {
    if (result.$ === "None") throw new Error("Preparation internal dispatch did not settle")
    return result.value as SettledStep
  }
  return {
    kind: "preparation" as const,
    initial: (input: PreparationInvocation) => settled(core.initial_settled(input.invocation, input.preparation)),
    resume: (step: SettledStep, event: PreparationEvent) => {
      if (event.$ !== "Types.ServiceReply") throw new Error("Invalid preparation reply envelope")
      return settled(core.resume_settled(step, preparationReply(event.reply)))
    },
    view: (step: SettledStep): Projection => {
      switch (step.$) {
        case "Await":
          return { $: "Types.AwaitService", request: step.request }
        case "Finished":
          return { $: "PreparationFinished", result: step.result }
        case "Failed":
          return { $: "PreparationFailed", reason: step.reason }
        default:
          throw new Error("Unsettled preparation projection")
      }
    },
    accepted: (projection: Projection) => {
      if (projection.$ === "PreparationFinished") return { preparation: projection.result }
      if (projection.$ === "PreparationFailed") return { failure: { reason: projection.reason } }
      throw new Error("Invalid accepted preparation projection")
    },
    disposeInvocation() {},
    get retainedHandles() {
      return 0
    }
  }
}
