import {
  setupSelectionBindReducer,
  type SetupSelectionFacts,
  type SetupSelectionApply,
  type SetupSelectionPhase
} from "@hapsland/agent-flow-bend/setup-selection-policy"
export type { SetupSelectionPhase }
export const bindSetupSelectionReducer = <
  Model extends { phase: SetupSelectionPhase },
  Action extends { kind: "selected" | "ended" | "observed" }
>(
  facts: SetupSelectionFacts<Model, Action>,
  apply: SetupSelectionApply<Model, Action>
) => {
  for (const name of ["nonempty", "hasNext"] as const)
    if (typeof facts[name] !== "function") throw new TypeError("Unknown setup selection fact")
  for (const name of ["start", "end", "observed"] as const)
    if (typeof apply[name] !== "function") throw new TypeError("Unknown setup selection patch")
  return setupSelectionBindReducer(Object.freeze({ ...facts }), Object.freeze({ ...apply }))
}
