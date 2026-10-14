import * as Effect from "effect/Effect"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { effectiveGraphLimits } from "@hapsland/runtime-inputs/configuration/resolve"
import post from "../preparation/post-preparation-core.js"
import type { PostContext } from "../preparation/post-preparation-host.mjs"
import type { createResidentOwnerTransaction } from "../../state/resolver-custody/resident-owner-transaction.mjs"
import { createPreparationSessionRegistry } from "./native-preparation-sessions.ts"
import { createResidentPreparationDriver } from "./preparation-driver.ts"
import { createResidentPreparationSession } from "./preparation-session.ts"
import { runResidentSourcePreparation } from "./source-preparation-entry.ts"

/** One resident lifetime binding. Canonical owns all five machine families;
 * callers provide the current job's effects and receive whole preparation.
 * Keep this binding and its action sink alive until cleanup succeeds. Failed
 * cleanup retains exact obligations and may be retried through the same entry.
 */
export function createResidentPreparationBinding(bridge: ReturnType<typeof createResidentOwnerTransaction>) {
  const registry = createPreparationSessionRegistry()
  const driver = createResidentPreparationDriver({ bridge, registry })
  return {
    acceptActions: driver.acceptActions,
    validateAdviceInput: driver.validateAdviceInput,
    prepare: Effect.fn("ResidentRuntime.canonicalPreparation")(function* (context: Omit<PostContext, "ownedAdvice">) {
      const ownedContext: PostContext = { ...context, ownedAdvice: { core: post, bridge, driver } }
      yield* runResidentSourcePreparation(ownedContext, {
        bridge,
        driver,
        buildPreparationSession: (invocation, candidate, preparation) => {
          // Construct only after Source accepts the gates and issues admission;
          // no job, settings or capture cache is held by the lifetime constructor.
          const { job, deps } = ownedContext
          const settings = job.settings
          const cache = new Map()
          return createResidentPreparationSession({
            invocation,
            observation: job.observation,
            candidate,
            connection: { bridge, runtime: deps.residentLedger.runtime, preparation },
            owner,
            driver,
            root: job.observation.root,
            rootIdentity: job.observation.rootIdentity,
            context: {
              ...deps.residentInspection.preparationPorts(job),
              ...(deps.residentCaptureSource === undefined ? {} : { captureSource: deps.residentCaptureSource }),
              now: deps.residentNow
            },
            cache,
            settings,
            graphLimits: effectiveGraphLimits(settings.configuration.policy),
            residentContext: ownedContext
          })
        }
      })
    }),
    cleanup: () => registry.retryCleanupEffect()
  }
}
