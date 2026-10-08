import {
  directLoginCommand,
  directLoginBindReducer,
  type DirectLoginPhase
} from "@hapsland/agent-flow-bend/direct-login-policy"
export const getDirectLoginCommand = directLoginCommand
export const bindDirectLoginReducer = <
  Model extends { readonly phase: DirectLoginPhase; readonly revision: number },
  Action extends { readonly kind: string; readonly commandId?: number }
>(
  facts: { readonly available: (action: Action) => boolean },
  patches: Readonly<
    Record<"no" | "availability" | "storage", (model: Model, action: Action, phase: DirectLoginPhase) => Model>
  >
) => {
  if (typeof facts.available !== "function") throw new TypeError("Missing direct login availability fact")
  for (const name of ["no", "availability", "storage"] as const)
    if (typeof patches[name] !== "function") throw new TypeError("Missing direct login materializer")
  return Object.freeze(directLoginBindReducer(Object.freeze({ ...facts }), Object.freeze({ ...patches })))
}
