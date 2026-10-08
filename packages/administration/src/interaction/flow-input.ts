import { Effect } from "effect"
import { InteractionService, type Interaction } from "./interaction.ts"
import { inputOwners, type InputOwnerId, uiFlows, type UiFlowId } from "./flow-registry.ts"

type FlowInteraction<K extends InputOwnerId> = Pick<Interaction, "present" | (typeof inputOwners)[K]["inputs"][number]>

/** Production prompt dispatch is limited to the registered owner's input kinds. */
export const flowInteraction = <K extends InputOwnerId>(
  owner: K
): Effect.Effect<FlowInteraction<K>, never, InteractionService> =>
  Effect.map(InteractionService, (interaction) => {
    const definition = inputOwners[owner]
    if (definition === undefined) throw new Error(`Unregistered UI input owner: ${owner}`)
    return Object.fromEntries([
      ["present", interaction.present],
      ...definition.inputs.map((kind) => [kind, interaction[kind]])
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
