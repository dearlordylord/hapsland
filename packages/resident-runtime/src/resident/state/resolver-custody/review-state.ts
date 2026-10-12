import * as Effect from "effect/Effect"
import resolverOwner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import type { Action } from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { type UnitJob, type Job } from "../../work-ownership/jobs.ts"
import { type CapacityLimits, defaultLimits } from "../capacity/model.ts"
import type { ResidentTransaction } from "../resident/transaction.ts"
import { makeResidentTransaction, residentStateFacades } from "../resident/assembly.ts"
import { createResidentOwnerTransaction } from "./resident-owner-transaction.mjs"
import { providerTransaction } from "./resident-provider-permit.mjs"

/** Host resource binding for Canonical commands, retained through final cleanup. */
type ResidentOwnerBinding = {
  readonly acceptActions: (actions: readonly Action[]) => void
  readonly validateAdviceInput: (invocation: bigint, inputHandle: bigint) => boolean
}

/** Internal composition seam. The binding receives facades, never the mutable
 * transaction. No publication is possible until the action sink is installed;
 * every facade then uses the same provider authority and commit owner.
 */
export const makeResidentReviewState = <Binding extends ResidentOwnerBinding>(
  bind: (
    ledger: ReturnType<typeof residentStateFacades<UnitJob, string, Job>>,
    bridge: ReturnType<typeof createResidentOwnerTransaction>
  ) => Binding,
  limits: CapacityLimits = defaultLimits,
  requestedLifetime?: string
) =>
  Effect.gen(function* () {
    const transaction = yield* makeResidentTransaction<UnitJob, string, Job>(limits, requestedLifetime)
    const resources: { binding?: Binding } = {}
    const bound = () => {
      if (!resources.binding) throw new Error("resident owner resources are not bound")
      return resources.binding
    }
    const guarded: ResidentTransaction<UnitJob, string, Job> = {
      ...transaction,
      commitAllEffect: (operation) =>
        Effect.suspend(() => {
          bound()
          return transaction.commitAllEffect(operation)
        })
    }
    const bridge = createResidentOwnerTransaction({
      owner: resolverOwner,
      transaction: guarded,
      onActions: (actions) => Effect.sync(() => bound().acceptActions(actions)),
      validateAdviceInput: (invocation, inputHandle) => bound().validateAdviceInput(invocation, inputHandle)
    })
    const ledger = residentStateFacades(providerTransaction(guarded, bridge))
    resources.binding = bind(ledger, bridge)
    return { ...ledger, reviewPreparation: resources.binding }
  }).pipe(Effect.withSpan("ResidentState.makeReview"))
