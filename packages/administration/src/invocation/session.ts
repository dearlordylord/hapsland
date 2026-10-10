import type { AutomationOptions, ClientArguments } from "./arguments.ts"

/** One invocation owns its options and presentation state; separate calls share no mutable session. */
export type InvocationSession = {
  readonly options: AutomationOptions | undefined
  readonly client: ClientArguments | undefined
  setupInventoryShown: boolean
}
