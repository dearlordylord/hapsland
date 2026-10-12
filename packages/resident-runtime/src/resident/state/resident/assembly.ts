import resolverOwner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { residentCapacity } from "./capacity.ts"
import { residentLifecycle } from "./lifecycle.ts"

import { initialRuntimeRecords } from "../runtime-records.ts"
import { initialAdviceRecords } from "../advice-records.ts"
import { initialNoticeRecords } from "../notice-records.ts"
import { initialRoundRecords } from "../round-records.ts"
import { initialJoinedReviews } from "../joined-reviews.ts"
import { initialRevision } from "../revision.ts"
import { initialDispatchRegistry } from "../dispatch.ts"
import { initialDelivery } from "../delivery/operations.ts"
import { initialEvaluationReuse } from "../evaluation-reuse.ts"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import { initialCanonical } from "@hapsland/canonical-policy/canonical/adapter"
import { randomUUID } from "node:crypto"
import { type CapacityLimits, defaultLimits, type CapacityState } from "../capacity/model.ts"
import { type ResidentRecords } from "./model.ts"

import { residentTransaction, type ResidentTransaction } from "./transaction.ts"
import { residentRounds } from "./rounds.ts"

import { residentRuntime } from "./runtime.ts"
import { residentRevision } from "./revision.ts"
import { residentDispatch } from "./dispatch.ts"
import { residentDelivery } from "./delivery.ts"
import { residentAdvice } from "./advice.ts"
import { residentAdviceCaptures } from "./captures.ts"
import { residentNotices } from "./notices.ts"
import { residentJoinedReviews } from "./joined-reviews.ts"
import { residentReuse } from "./reuse.ts"

/** One commit owner for canonical state, capacity identities and native domain records.
 * Draft validation can fail without publishing a partial canonical transition.
 * All record operations receive their draft explicitly; callers compose Effects
 * through the same transaction and completed snapshot.
 */
export const makeResidentTransaction = <Pending, DispatchKey, DispatchValue>(
  limits: CapacityLimits = defaultLimits,
  requestedLifetime?: string
) =>
  Effect.gen(function* () {
    const residentLifetime = requestedLifetime ?? (yield* Effect.sync(randomUUID))
    const state = yield* Ref.make<
      CapacityState & { readonly records: ResidentRecords<Pending, DispatchKey, DispatchValue> }
    >({
      residentLifetime,
      limits,
      canonical: initialCanonical(limits),
      resolverCustody: resolverOwner.initial_custody(),
      reservations: new Map(),
      partitionIds: new Map(),
      partitionIdentityBytes: 0,
      roundIds: new Map(),
      requestRounds: new Map(),
      collectionTokens: new Map(),
      nextCollectionToken: 1,
      nextPartitionId: 1,
      minimumFreshStart: 0,
      records: {
        runtime: initialRuntimeRecords(),
        adviceCaptures: new Map(),
        advice: initialAdviceRecords(),
        reuse: initialEvaluationReuse<Pending>(),
        delivery: initialDelivery(),
        dispatch: initialDispatchRegistry<DispatchKey, DispatchValue>(),
        revision: initialRevision(),
        joined: initialJoinedReviews(),
        rounds: initialRoundRecords(),
        notices: initialNoticeRecords()
      }
    })
    return residentTransaction(state, residentLifetime)
  })

export const residentStateFacades = <Pending, DispatchKey, DispatchValue>(
  transaction: ResidentTransaction<Pending, DispatchKey, DispatchValue>
) => ({
  residentLifetime: transaction.residentLifetime,
  canonicalLifetime: 1,
  ...residentCapacity(transaction),
  runtime: residentRuntime(transaction),
  rounds: residentRounds(transaction),
  ...residentLifecycle(transaction),
  revision: residentRevision(transaction),
  dispatch: residentDispatch(transaction),
  delivery: residentDelivery(transaction),
  advice: residentAdvice(transaction),
  adviceCaptures: residentAdviceCaptures(transaction),
  notices: residentNotices(transaction),
  joinedReviews: residentJoinedReviews(transaction),
  reuse: residentReuse(transaction)
})
