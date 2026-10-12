import composition from "./artifact-composition-core.js"
import parent from "./generic-artifact-core.js"
import python from "./python-artifact-core.js"
import go from "./go-artifact-core.js"
import { createArtifactMachine } from "./artifact-dispatcher.mjs"

/** One actual Graph composition with packaged Generic/Python/Go engines.
 * Canonical owns the outer invocation; this machine owns graph continuations.
 */
type GraphCores = Omit<Parameters<typeof createArtifactMachine>[0], "retainPrefixes">
export function createGraphMachine({
  cores = { composition, parent, python, go },
  retainPrefixes = false
}: { readonly cores?: GraphCores; readonly retainPrefixes?: boolean } = {}) {
  return createArtifactMachine({ ...cores, retainPrefixes })
}
export type { ReferenceSlot, PlannedReference, ReferenceOmission } from "../traversal/reference.ts"

// Closed Graph result projection after Canonical has accepted the invocation.
type Projection = ReturnType<ReturnType<typeof createArtifactMachine>["view"]>
export type GraphOutcome =
  | {
      readonly result: Extract<Projection, { $: "Types.FinishedResolver" }>["result"]
      readonly finalFrame: Extract<Projection, { $: "Types.FinishedResolver" }>["final_frame"]
    }
  | { readonly failure: Extract<Projection, { $: "Types.FailedResolver" }>["failure"] }
export function acceptGraphProjection(view: Projection): GraphOutcome {
  if (view.$ === "Types.FinishedResolver") return { result: view.result, finalFrame: view.final_frame }
  if (view.$ === "Types.FailedResolver") return { failure: view.failure }
  throw new TypeError("Unaccepted graph projection")
}
