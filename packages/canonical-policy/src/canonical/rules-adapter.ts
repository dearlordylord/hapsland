import {
  rulesNativeCommand,
  rulesBindReducer,
  type RulesFact,
  type RulesPatch,
  type RulesPhase
} from "@hapsland/agent-flow-bend/rules-policy"
export const getRulesCommand = rulesNativeCommand
const factNames: readonly RulesFact[] = ["planMatches", "digestMatches", "yes", "stale"]
const patchNames: readonly RulesPatch[] = [
  "no",
  "scope",
  "clearPlanOutcome",
  "preview",
  "declined",
  "stale",
  "outcome",
  "clearPlan"
]
export const bindRulesReducer = <
  Model extends { readonly phase: RulesPhase },
  Action extends { readonly kind: string }
>(
  current: (model: Model, event: { readonly revision: number; readonly action: Action }) => boolean,
  facts: Readonly<Record<RulesFact, (model: Model, action: Action) => boolean>>,
  patches: Readonly<Record<RulesPatch, (model: Model, action: Action, phase: RulesPhase) => Model>>
) => {
  if (typeof current !== "function") throw new TypeError("Missing rules correlation fence")
  for (const name of factNames)
    if (typeof facts[name] !== "function") throw new TypeError("Missing rules fact: " + name)
  for (const name of patchNames)
    if (typeof patches[name] !== "function") throw new TypeError("Missing rules materializer: " + name)
  return Object.freeze(rulesBindReducer(current, Object.freeze({ ...facts }), Object.freeze({ ...patches })))
}
