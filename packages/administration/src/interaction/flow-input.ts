import { absurd, Effect } from "effect"
import { InteractionService, type Interaction } from "./interaction.ts"
import {
  inputOwners,
  type InputOwnerId,
  uiFlows,
  uiJourneys,
  type UiJourneyId,
  type UiFlowId
} from "./flow-registry.ts"

type FlowInteraction<K extends InputOwnerId> = Pick<Interaction, "present" | (typeof inputOwners)[K]["inputs"][number]>

/** Production prompt dispatch is limited to the registered owner's input kinds. */
export const flowInteraction = <K extends InputOwnerId>(
  owner: K
): Effect.Effect<FlowInteraction<K>, never, InteractionService> =>
  Effect.map(InteractionService, (interaction) => {
    const definition = Object.entries(inputOwners).find(([id]) => id === owner)?.[1]
    if (definition === undefined) throw new Error(`Unregistered UI input owner: ${owner}`)
    return Object.fromEntries([
      ["present", interaction.present],
      ...definition.inputs.map((kind): readonly [string, Interaction[keyof Interaction]] => {
        switch (kind) {
          case "choose":
            return [kind, interaction.choose]
          case "chooseMany":
            return [kind, interaction.chooseMany]
          case "confirm":
            return [kind, interaction.confirm]
          case "hidden":
            return [kind, interaction.hidden]
          default:
            return absurd(kind)
        }
      })
    ]) as FlowInteraction<K>
  })

/** Child effects are dispatched through the same closed composition graph. */
export const childFlow = <P extends UiFlowId, C extends (typeof uiFlows)[P]["composes"][number], A, E, R>(
  parent: P,
  child: C,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => {
  if (!(uiFlows[parent].composes as readonly string[]).includes(child))
    throw new Error(`Undeclared UI composition: ${parent} -> ${child}`)
  return effect
}

/** Command routing and the public journey index share a closed set of IDs. */
export const cliJourney = <J extends UiJourneyId, A, E, R>(
  journey: J,
  run: () => Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => {
  if (!uiJourneys[journey]) throw new Error(`Unregistered CLI journey: ${journey}`)
  return Effect.suspend(run)
}
