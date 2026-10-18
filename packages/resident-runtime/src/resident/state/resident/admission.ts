import * as Effect from "effect/Effect"
import type { IngressJob, UnitJob, Job } from "../../work-ownership/jobs.ts"
import { workView } from "../../bend-work.ts"
import { draftCapacity, type CapacityDraft } from "../capacity/model.ts"
import { capacityOperations } from "../capacity/operations.ts"
import {
  draftDelivery,
  deliveryOperations,
  assertDeliveryState,
  type RepeatEditDiagnostic
} from "../delivery/operations.ts"
import { draftRoundRecords, roundRecordOperations } from "../round-records.ts"
import { commitDispatchRecords } from "../dispatch-records.ts"
import type { ResidentTransaction } from "./transaction.ts"

type AdmissionInput = Pick<
  IngressJob,
  "observation" | "dispatch" | "settings" | "partition" | "reservation" | "inspectionReceipt"
> & {
  readonly mode:
    | { readonly kind: "direct" }
    | {
        readonly kind: "composed"
        readonly requirePermit: boolean
        readonly eventId: string
        readonly now: number
        readonly cohortId: string
      }
}
type AdmissionPublication =
  | { readonly kind: "stale" }
  | { readonly kind: "capacity" }
  | { readonly kind: "accepted"; readonly job: IngressJob }

// Canonical publication reconciles resolver custody through the transaction's
// setter. Publish only capacity-owned fields, with Canonical last.
const publishCapacity = (draft: CapacityDraft, tentative: CapacityDraft): void => {
  draft.reservations = tentative.reservations
  draft.partitionIds = tentative.partitionIds
  draft.partitionIdentityBytes = tentative.partitionIdentityBytes
  draft.roundIds = tentative.roundIds
  draft.requestRounds = tentative.requestRounds
  draft.collectionTokens = tentative.collectionTokens
  draft.nextCollectionToken = tentative.nextCollectionToken
  draft.nextPartitionId = tentative.nextPartitionId
  draft.minimumFreshStart = tentative.minimumFreshStart
  draft.canonical = tentative.canonical
}

/** One publication owns permit consumption, observation, native pin and dispatch custody.
 * Refusal keeps the caller's reservation but publishes no tentative successful admission.
 * This operation starts no fibers; the dispatcher executes its retained starts after commit.
 */
export const residentAdmissionPublication =
  ({ commitAllEffect, residentLifetime }: ResidentTransaction<UnitJob, string, Job>) =>
  (reportRepeat: (diagnostic: RepeatEditDiagnostic) => void = () => {}) =>
    Effect.fn("ResidentState.publishAdmission")(function* (
      input: AdmissionInput
    ): Effect.fn.Return<AdmissionPublication> {
      const [publication, diagnostics] = yield* commitAllEffect<
        readonly [AdmissionPublication, readonly RepeatEditDiagnostic[]]
      >((draft, records) => {
        const tentative = draftCapacity(draft)
        const delivery = draftDelivery(records.delivery)
        const rounds = draftRoundRecords(records.rounds)
        const diagnostics: RepeatEditDiagnostic[] = []
        const owner = capacityOperations(
          (run) => run(tentative),
          (run) => run(tentative),
          residentLifetime
        )
        const admission = deliveryOperations(delivery, owner, (diagnostic) => diagnostics.push(diagnostic))
        const mode = input.mode
        const edit =
          mode.kind === "composed"
            ? admission.admitEditObservation(input.partition, mode.eventId, mode.now, mode.requirePermit)
            : undefined
        if (mode.kind === "composed" && edit === undefined) {
          assertDeliveryState(delivery, owner)
          publishCapacity(draft, tentative)
          return [[{ kind: "stale" }, diagnostics] as const, { ...records, delivery }]
        }
        const canonicalRound = edit?.canonicalRound ?? owner.roundId(input.partition)
        const canonicalObservationId =
          edit?.canonicalObservationId ?? owner.admitObservation(input.partition, canonicalRound)
        const round =
          mode.kind === "composed" && edit !== undefined
            ? roundRecordOperations(rounds, owner).bind(
                input.partition,
                edit.generation,
                {
                  root: input.observation.root,
                  rootIdentity: input.observation.rootIdentity,
                  advicee: input.observation.advicee,
                  activityPath: input.dispatch.activityPath
                },
                (issuedRound) => ({
                  capability: Object.freeze({
                    group: input.partition,
                    generation: edit.generation,
                    canonicalRound: issuedRound,
                    controller: new AbortController()
                  }),
                  work: Object.freeze({ id: mode.cohortId, controller: new AbortController() }),
                  discarded: Object.freeze({ queued: 0, running: 0 })
                })
              )
            : undefined
        const record = round === undefined ? undefined : rounds.entries.get(input.partition)
        if (round !== undefined && record?.capability !== round) throw new Error("admission lost its draft round")
        const roundFields =
          record === undefined
            ? {}
            : {
                round: record.capability,
                work: record.work,
                workObservationId: workView(
                  owner.canonicalProjection(),
                  owner.partitionId(input.partition),
                  canonicalRound
                ).admit(canonicalObservationId)
              }
        const job: IngressJob = {
          kind: "ingress",
          ...roundFields,
          ...(input.inspectionReceipt === undefined ? {} : { inspectionReceipt: input.inspectionReceipt }),
          settings: edit?.settings ?? input.settings,
          canonicalRound,
          canonicalObservationId,
          observation: input.observation,
          partition: input.partition,
          reservation: input.reservation,
          dispatch: input.dispatch
        }
        const identity = owner.dispatchIdentity(input.partition, canonicalRound)
        const [queued, dispatch] = commitDispatchRecords(
          records.dispatch,
          owner,
          {
            kind: "queueDispatch",
            partition: identity.partition,
            lifetime: 1,
            round: canonicalRound,
            operation: canonicalObservationId
          },
          { key: input.partition, value: job, operation: canonicalObservationId, ...identity }
        )
        if (queued === undefined) {
          // Release a registered permit on the original drafts; the attempted
          // successful admission and all its native capabilities remain private.
          const rejectedDelivery = draftDelivery(records.delivery)
          const currentOwner = capacityOperations(
            (run) => run(draft),
            (run) => run(draft),
            residentLifetime
          )
          if (mode.kind === "composed")
            deliveryOperations(rejectedDelivery, currentOwner, (diagnostic) => diagnostics.push(diagnostic)).retireEdit(
              input.partition,
              mode.eventId
            )
          assertDeliveryState(rejectedDelivery, currentOwner)
          return [[{ kind: "capacity" }, diagnostics] as const, { ...records, delivery: rejectedDelivery }]
        }
        assertDeliveryState(delivery, owner)
        publishCapacity(draft, tentative)
        return [[{ kind: "accepted", job }, diagnostics] as const, { ...records, delivery, rounds, dispatch }]
      })
      for (const diagnostic of diagnostics) {
        try {
          reportRepeat(diagnostic)
        } catch {
          /* diagnostics cannot undo a published admission */
        }
      }
      return publication
    }, Effect.uninterruptible)
