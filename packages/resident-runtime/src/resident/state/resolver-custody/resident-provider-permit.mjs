import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
// Effect authority follows all provider descendants. Only an accepted dispatch
// execution explicitly replaces this reference with its independent unit scope.
export const ResidentProviderPermit = Context.Reference("Hapsland.ResidentProviderPermit", {
  /** @returns {import("./provider-authority.ts").ProviderPermit | undefined} */
  defaultValue: () => undefined
})
// Resource finalization receives commit receipts without reviving provider authority.
export const ResidentResourceReceipt = Context.Reference("Hapsland.ResidentResourceReceipt", {
  /** @returns {import("./provider-authority.ts").CommitReceipt | undefined} */
  defaultValue: () => undefined
})
/**
 * @template A, E, R
 * @param {Effect.Effect<A, E, R>} effect
 * @returns {Effect.Effect<A, E, R>}
 */
export const dispatchExecutionBoundary = (effect) =>
  effect.pipe(
    Effect.provideService(ResidentProviderPermit, undefined),
    Effect.provideService(ResidentResourceReceipt, undefined)
  )
/**
 * @param {import("./provider-authority.ts").NativeTransaction} transaction
 * @param {import("./provider-authority.ts").ProviderCommitBridge} bridge
 * @returns {import("./provider-authority.ts").NativeTransaction}
 */
export const providerTransaction = (transaction, bridge) => ({
  ...transaction,
  commitAllEffect: (operation) =>
    Effect.flatMap(ResidentProviderPermit, (permit) =>
      Effect.flatMap(ResidentResourceReceipt, (receipt) =>
        (permit
          ? permit.pendingRestore
            ? bridge.nativeRestorePending(permit.credential, permit.pendingRestore, operation, permit.committed)
            : bridge.nativeScoped(permit.credential, operation, permit.committed)
          : bridge.native(operation, receipt)
        ).pipe(Effect.map((publication) => publication.value))
      )
    )
})
