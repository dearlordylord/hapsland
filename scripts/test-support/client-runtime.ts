import type { Effect } from "effect"
import { ManagedRuntime } from "effect"
import type { ResidentStartup } from "@hapsland/resident-transport/resident/client"
import { residentStartupLayer } from "@hapsland/resident-transport/resident/client"

/** Native fixture process boundary; all calls share its startup service lifetime. */
const runtime = ManagedRuntime.make(residentStartupLayer)
process.once("beforeExit", () => {
  void runtime.dispose()
})
export const runClient = <A, E>(effect: Effect.Effect<A, E, ResidentStartup>): Promise<A> => runtime.runPromise(effect)
