import {
  draftDelivery,
  deliveryOperations,
  deliveryView,
  assertDeliveryState,
  type ComposedDelivery,
  type RepeatEditDiagnostic
} from "../delivery/operations.ts"
import * as Effect from "effect/Effect"
import { type ResidentTransaction } from "./transaction.ts"
import { capacityOperations } from "../capacity/operations.ts"

import { draftCapacity } from "../capacity/model.ts"

export const residentDelivery =
  <Pending, DispatchKey, DispatchValue>({
    read,
    commitAllEffect,
    residentLifetime
  }: ResidentTransaction<Pending, DispatchKey, DispatchValue>) =>
  (reportRepeat: (diagnostic: RepeatEditDiagnostic) => void = () => {}) => {
    const deliveryCommitEffect = <A>(operation: (operations: ComposedDelivery) => A): Effect.Effect<A> =>
      Effect.gen(function* () {
        const [value, diagnostics] = yield* commitAllEffect((draft, records) => {
          const current = records.delivery
          const delivery = draftDelivery(current)
          const diagnostics: RepeatEditDiagnostic[] = []
          const owner = capacityOperations(
            (run) => run(draft),
            (run) => run(draft),
            residentLifetime
          )
          const operations = deliveryOperations(delivery, owner, (diagnostic) => diagnostics.push(diagnostic))
          const value = operation(operations)
          assertDeliveryState(delivery, owner)
          return [[value, diagnostics] as const, { ...records, delivery }]
        })
        // Diagnostics run after publication, outside the atomic commit. A
        // diagnostic failure cannot undo admission or change policy decisions.
        for (const diagnostic of diagnostics) {
          try {
            reportRepeat(diagnostic)
          } catch {
            /* diagnostic sink unavailable */
          }
        }
        return value
      }).pipe(Effect.uninterruptible)
    const deliveryRead = <A>(operation: (view: ReturnType<typeof deliveryView>) => A): Effect.Effect<A> =>
      read.pipe(
        Effect.map((snapshot) => {
          const draft = draftCapacity(snapshot)
          const owner = capacityOperations(
            (run) => run(draft),
            (run) => run(draft),
            residentLifetime
          )
          return operation(deliveryView(snapshot.records.delivery, owner))
        })
      )
    return {
      claimBackground: Effect.fn("ComposedDelivery.claimBackground")(
        (...args: Parameters<ComposedDelivery["claimBackground"]>) =>
          deliveryCommitEffect((operations) => operations.claimBackground(...args))
      ),
      releaseBackground: Effect.fn("ComposedDelivery.releaseBackground")(
        (...args: Parameters<ComposedDelivery["releaseBackground"]>) =>
          deliveryCommitEffect((operations) => operations.releaseBackground(...args))
      ),
      advance: Effect.fn("ComposedDelivery.advance")((...args: Parameters<ComposedDelivery["advance"]>) =>
        deliveryCommitEffect((operations) => operations.advance(...args))
      ),
      recentEditCount: Effect.fn("ComposedDelivery.recentEditCount")(
        (...args: Parameters<ComposedDelivery["recentEditCount"]>) =>
          deliveryRead((view) => view.recentEditCount(...args))
      ),
      editIdentityMappingCount: Effect.fn("ComposedDelivery.editIdentityMappingCount")(
        (...args: Parameters<ComposedDelivery["editIdentityMappingCount"]>) =>
          deliveryRead((view) => view.editIdentityMappingCount(...args))
      ),
      liveCollectionTokenKeys: Effect.fn("ComposedDelivery.liveCollectionTokenKeys")(
        (...args: Parameters<ComposedDelivery["liveCollectionTokenKeys"]>) =>
          deliveryRead((view) => view.liveCollectionTokenKeys(...args))
      ),
      ensureFromHostTurn: Effect.fn("ComposedDelivery.ensureFromHostTurn")(
        (...args: Parameters<ComposedDelivery["ensureFromHostTurn"]>) =>
          deliveryCommitEffect((operations) => operations.ensureFromHostTurn(...args))
      ),
      registeredEditSettings: Effect.fn("ComposedDelivery.registeredEditSettings")(
        (...args: Parameters<ComposedDelivery["registeredEditSettings"]>) =>
          deliveryRead((view) => view.registeredEditSettings(...args))
      ),
      registerEdit: Effect.fn("ComposedDelivery.registerEdit")(
        (...args: Parameters<ComposedDelivery["registerEdit"]>) =>
          deliveryCommitEffect((operations) => operations.registerEdit(...args))
      ),
      retireEdit: Effect.fn("ComposedDelivery.retireEdit")((...args: Parameters<ComposedDelivery["retireEdit"]>) =>
        deliveryCommitEffect((operations) => operations.retireEdit(...args))
      ),
      registerEditDecision: Effect.fn("ComposedDelivery.registerEditDecision")(
        (...args: Parameters<ComposedDelivery["registerEditDecision"]>) =>
          deliveryCommitEffect((operations) => operations.registerEditDecision(...args))
      ),
      admitEditObservation: Effect.fn("ComposedDelivery.admitEditObservation")(
        (...args: Parameters<ComposedDelivery["admitEditObservation"]>) =>
          deliveryCommitEffect((operations) => operations.admitEditObservation(...args))
      ),
      admitEdit: Effect.fn("ComposedDelivery.admitEdit")((...args: Parameters<ComposedDelivery["admitEdit"]>) =>
        deliveryCommitEffect((operations) => operations.admitEdit(...args))
      ),
      expirePermits: Effect.fn("ComposedDelivery.expirePermits")(
        (...args: Parameters<ComposedDelivery["expirePermits"]>) =>
          deliveryCommitEffect((operations) => operations.expirePermits(...args))
      ),
      hasPendingEdits: Effect.fn("ComposedDelivery.hasPendingEdits")(
        (...args: Parameters<ComposedDelivery["hasPendingEdits"]>) =>
          deliveryCommitEffect((operations) => operations.hasPendingEdits(...args))
      ),
      isActive: Effect.fn("ComposedDelivery.isActive")((...args: Parameters<ComposedDelivery["isActive"]>) =>
        deliveryCommitEffect((operations) => operations.isActive(...args))
      ),
      beginStop: Effect.fn("ComposedDelivery.beginStop")((...args: Parameters<ComposedDelivery["beginStop"]>) =>
        deliveryCommitEffect((operations) => operations.beginStop(...args))
      ),
      ownsStop: Effect.fn("ComposedDelivery.ownsStop")((...args: Parameters<ComposedDelivery["ownsStop"]>) =>
        deliveryCommitEffect((operations) => operations.ownsStop(...args))
      ),
      finishGate: Effect.fn("ComposedDelivery.finishGate")((...args: Parameters<ComposedDelivery["finishGate"]>) =>
        deliveryCommitEffect((operations) => operations.finishGate(...args))
      ),
      reserveFinishOutput: Effect.fn("ComposedDelivery.reserveFinishOutput")(
        (...args: Parameters<ComposedDelivery["reserveFinishOutput"]>) =>
          deliveryCommitEffect((operations) => operations.reserveFinishOutput(...args))
      ),
      decideFinishOutput: Effect.fn("ComposedDelivery.decideFinishOutput")(
        (...args: Parameters<ComposedDelivery["decideFinishOutput"]>) =>
          deliveryCommitEffect((operations) => operations.decideFinishOutput(...args))
      ),
      revokeProvisionalFinishOutput: Effect.fn("ComposedDelivery.revokeProvisionalFinishOutput")(
        (...args: Parameters<ComposedDelivery["revokeProvisionalFinishOutput"]>) =>
          deliveryCommitEffect((operations) => operations.revokeProvisionalFinishOutput(...args))
      ),
      hasFinishPermit: Effect.fn("ComposedDelivery.hasFinishPermit")(
        (...args: Parameters<ComposedDelivery["hasFinishPermit"]>) =>
          deliveryRead((view) => view.hasFinishPermit(...args))
      ),
      isFinishAuthorized: Effect.fn("ComposedDelivery.isFinishAuthorized")(
        (...args: Parameters<ComposedDelivery["isFinishAuthorized"]>) =>
          deliveryRead((view) => view.isFinishAuthorized(...args))
      ),
      finishSelectionMatches: Effect.fn("ComposedDelivery.finishSelectionMatches")(
        (...args: Parameters<ComposedDelivery["finishSelectionMatches"]>) =>
          deliveryCommitEffect((operations) => operations.finishSelectionMatches(...args))
      ),
      authorizeFinishOutput: Effect.fn("ComposedDelivery.authorizeFinishOutput")(
        (...args: Parameters<ComposedDelivery["authorizeFinishOutput"]>) =>
          deliveryCommitEffect((operations) => operations.authorizeFinishOutput(...args))
      ),
      finishStop: Effect.fn("ComposedDelivery.finishStop")((...args: Parameters<ComposedDelivery["finishStop"]>) =>
        deliveryCommitEffect((operations) => operations.finishStop(...args))
      ),
      tickQuietRound: Effect.fn("ComposedDelivery.tickQuietRound")(
        (...args: Parameters<ComposedDelivery["tickQuietRound"]>) =>
          deliveryCommitEffect((operations) => operations.tickQuietRound(...args))
      ),
      closureCounts: Effect.fn("ComposedDelivery.closureCounts")(
        (...args: Parameters<ComposedDelivery["closureCounts"]>) =>
          deliveryCommitEffect((operations) => operations.closureCounts(...args))
      ),
      expireStop: Effect.fn("ComposedDelivery.expireStop")((...args: Parameters<ComposedDelivery["expireStop"]>) =>
        deliveryCommitEffect((operations) => operations.expireStop(...args))
      ),
      isDeciding: Effect.fn("ComposedDelivery.isDeciding")((...args: Parameters<ComposedDelivery["isDeciding"]>) =>
        deliveryCommitEffect((operations) => operations.isDeciding(...args))
      ),
      canSubmit: Effect.fn("ComposedDelivery.canSubmit")((...args: Parameters<ComposedDelivery["canSubmit"]>) =>
        deliveryCommitEffect((operations) => operations.canSubmit(...args))
      ),
      canBeginSubmission: Effect.fn("ComposedDelivery.canBeginSubmission")(
        (...args: Parameters<ComposedDelivery["canBeginSubmission"]>) =>
          deliveryCommitEffect((operations) => operations.canBeginSubmission(...args))
      ),
      canBeginExistingToken: Effect.fn("ComposedDelivery.canBeginExistingToken")(
        (...args: Parameters<ComposedDelivery["canBeginExistingToken"]>) =>
          deliveryCommitEffect((operations) => operations.canBeginExistingToken(...args))
      ),
      generation: Effect.fn("ComposedDelivery.generation")((...args: Parameters<ComposedDelivery["generation"]>) =>
        deliveryCommitEffect((operations) => operations.generation(...args))
      ),
      consumeStop: Effect.fn("ComposedDelivery.consumeStop")((...args: Parameters<ComposedDelivery["consumeStop"]>) =>
        deliveryCommitEffect((operations) => operations.consumeStop(...args))
      ),
      hasVirtualRoundContinuationBudget: Effect.fn("ComposedDelivery.hasVirtualRoundContinuationBudget")(
        (...args: Parameters<ComposedDelivery["hasVirtualRoundContinuationBudget"]>) =>
          deliveryCommitEffect((operations) => operations.hasVirtualRoundContinuationBudget(...args))
      ),
      beginSubmission: Effect.fn("ComposedDelivery.beginSubmission")(
        (...args: Parameters<ComposedDelivery["beginSubmission"]>) =>
          deliveryCommitEffect((operations) => operations.beginSubmission(...args))
      ),
      markSubmitted: Effect.fn("ComposedDelivery.markSubmitted")(
        (...args: Parameters<ComposedDelivery["markSubmitted"]>) =>
          deliveryCommitEffect((operations) => operations.markSubmitted(...args))
      ),
      markUncertain: Effect.fn("ComposedDelivery.markUncertain")(
        (...args: Parameters<ComposedDelivery["markUncertain"]>) =>
          deliveryCommitEffect((operations) => operations.markUncertain(...args))
      ),
      release: Effect.fn("ComposedDelivery.release")((...args: Parameters<ComposedDelivery["release"]>) =>
        deliveryCommitEffect((operations) => operations.release(...args))
      ),
      forget: Effect.fn("ComposedDelivery.forget")((...args: Parameters<ComposedDelivery["forget"]>) =>
        deliveryCommitEffect((operations) => operations.forget(...args))
      ),
      suppresses: Effect.fn("ComposedDelivery.suppresses")((...args: Parameters<ComposedDelivery["suppresses"]>) =>
        deliveryCommitEffect((operations) => operations.suppresses(...args))
      ),
      backgroundReofferable: Effect.fn("ComposedDelivery.backgroundReofferable")(
        (...args: Parameters<ComposedDelivery["backgroundReofferable"]>) =>
          deliveryCommitEffect((operations) => operations.backgroundReofferable(...args))
      ),
      hasToken: Effect.fn("ComposedDelivery.hasToken")((...args: Parameters<ComposedDelivery["hasToken"]>) =>
        deliveryRead((view) => view.hasToken(...args))
      ),
      expire: Effect.fn("ComposedDelivery.expire")((...args: Parameters<ComposedDelivery["expire"]>) =>
        deliveryCommitEffect((operations) => operations.expire(...args))
      )
    }
  }
