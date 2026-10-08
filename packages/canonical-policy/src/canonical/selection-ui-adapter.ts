import {
  selectionUiBindUpdate,
  type SelectionUiFacts,
  type SelectionUiApply
} from "@hapsland/agent-flow-bend/selection-ui-policy"
export const bindSelectionUiUpdate = <Model, Options, Result>(
  facts: SelectionUiFacts<Model, Options>,
  apply: SelectionUiApply<Model, Options, Result>
) => {
  for (const name of [
    "back",
    "backRow",
    "exitRow",
    "nonempty",
    "selectAll",
    "choiceIds",
    "choiceId",
    "allSelected",
    "choicePresent",
    "choiceSelected"
  ] as const)
    if (typeof facts[name] !== "function") throw new TypeError("Unknown selection UI fact")
  for (const name of [
    "hold",
    "back",
    "cancel",
    "move",
    "first",
    "last",
    "select",
    "warn",
    "clearAll",
    "chooseAll",
    "removeChoice",
    "addChoice"
  ] as const)
    if (typeof apply[name] !== "function") throw new TypeError("Unknown selection UI materializer")
  return selectionUiBindUpdate(Object.freeze({ ...facts }), Object.freeze({ ...apply }))
}
