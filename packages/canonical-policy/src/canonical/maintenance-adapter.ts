import {
  maintenanceNativeCommand,
  maintenanceBindReducer,
  type MaintenanceFact,
  type MaintenancePatch,
  type MaintenancePhase
} from "@hapsland/agent-flow-bend/maintenance-policy"
export const getMaintenanceCommand = maintenanceNativeCommand
const factNames: readonly MaintenanceFact[] = [
  "unique",
  "nonempty",
  "reinstall",
  "validDigest",
  "digestMatches",
  "yes",
  "activate",
  "more"
]
const patchNames: readonly MaintenancePatch[] = [
  "no",
  "discovered",
  "inspected",
  "digest",
  "outcomeNext",
  "skippedNext",
  "observedActivate",
  "observedNext",
  "activatedNext",
  "emptyActivation",
  "skipPending",
  "failedNext"
]
export const bindMaintenanceReducer = <
  Model extends { readonly phase: MaintenancePhase },
  Action extends { readonly kind: string }
>(
  current: (model: Model, event: { readonly revision: number; readonly action: Action }) => boolean,
  readTag: (action: Action) => string,
  facts: Readonly<Record<MaintenanceFact, (model: Model, action: Action) => boolean>>,
  patches: Readonly<Record<MaintenancePatch, (model: Model, action: Action, phase: MaintenancePhase) => Model>>
) => {
  if (typeof current !== "function" || typeof readTag !== "function")
    throw new TypeError("Missing maintenance fence or action classifier")
  for (const name of factNames)
    if (typeof facts[name] !== "function") throw new TypeError("Missing maintenance fact: " + name)
  for (const name of patchNames)
    if (typeof patches[name] !== "function") throw new TypeError("Missing maintenance materializer: " + name)
  return Object.freeze(
    maintenanceBindReducer(current, readTag, Object.freeze({ ...facts }), Object.freeze({ ...patches }))
  )
}
