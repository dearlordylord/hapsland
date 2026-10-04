import type { Effect } from "effect"
import type { DirectObservation } from "../direct-event/model.ts"
import type { CollectorReason } from "../canonical/adapter.ts"
import type { CapacityLedger } from "./capacity.ts"
import type { WorkRevision, RevisionOperations } from "./revision.ts"

export type JoinedReview = {
  readonly admission: number
  readonly evaluationKey: string
  readonly observation: Pick<DirectObservation, "root" | "advicee">
  readonly activityPath: string | undefined
  readonly revision?: WorkRevision
}
export type JoinedReviewOutcome = {
  readonly review: JoinedReview
  readonly stage: "clear" | "findings" | "unavailable"
}
export type JoinedReviewsState = { readonly entries: ReadonlyMap<string, ReadonlyArray<JoinedReview>> }
export const initialJoinedReviews = (): JoinedReviewsState => ({ entries: new Map() })
export const draftJoinedReviews = (state: JoinedReviewsState) => ({ entries: new Map(state.entries) })
export const joinedReviewOperations = (
  draft: ReturnType<typeof draftJoinedReviews>,
  owner: Pick<CapacityLedger, "transition">,
  revisions: Pick<RevisionOperations, "superseded" | "generation">,
  hasAdvice: (id: string) => boolean
) => {
  const memberOutcomes = {
    reuseKeepMember: undefined,
    reuseSetMemberUnavailable: "unavailable",
    reuseSetMemberLost: "unavailable",
    reuseSetMemberClear: "clear",
    reuseSetMemberFinding: "findings"
  } as const
  const memberKind = (kind: string | undefined): kind is keyof typeof memberOutcomes =>
    kind !== undefined && Object.hasOwn(memberOutcomes, kind)
  const memberDisposition = (
    review: JoinedReview,
    state: "pending" | "clear" | "finding" | "unavailable",
    adviceId: string | undefined
  ): JoinedReviewOutcome["stage"] | undefined => {
    const revision = review.revision
    const disposition = owner.transition({
      kind: "reuseMemberCheck",
      state,
      staleUnavailable: revision !== undefined && revisions.generation(revision.subject) !== revision.generation,
      hasRevision: revision !== undefined,
      hasAdviceId: adviceId !== undefined && hasAdvice(adviceId)
    }).commands[0]?.kind
    if (!memberKind(disposition)) throw new Error("canonical reuse member disposition refused")
    return memberOutcomes[disposition]
  }
  return {
    append: (review: JoinedReview): void => {
      draft.entries.set(
        review.evaluationKey,
        Object.freeze([
          ...(draft.entries.get(review.evaluationKey) ?? []),
          Object.freeze({
            ...review,
            observation: Object.freeze({
              root: review.observation.root,
              advicee: Object.freeze({ ...review.observation.advicee })
            })
          })
        ])
      )
    },
    attach: (key: string, revision: WorkRevision): void => {
      const reviews = draft.entries.get(key)
      if (reviews === undefined) return
      draft.entries.set(
        key,
        Object.freeze(
          reviews.map((review) => {
            if (review.revision !== undefined) return review
            return Object.freeze({ ...review, revision })
          })
        )
      )
    },
    releaseUnattached: (key: string, _reason: CollectorReason): ReadonlyArray<JoinedReview> => {
      const reviews = draft.entries.get(key) ?? []
      const removed = reviews.filter((review) => review.revision === undefined)
      const retained = reviews.filter((review) => review.revision !== undefined)
      if (retained.length === 0) draft.entries.delete(key)
      else draft.entries.set(key, Object.freeze(retained))
      return removed
    },
    retireSuperseded: (subject: string): ReadonlyArray<JoinedReview> => {
      const removed: JoinedReview[] = []
      for (const [key, reviews] of draft.entries) {
        const retained = reviews.filter((review) => {
          if (review.revision === undefined || !revisions.superseded(subject, review.revision)) return true
          removed.push(review)
          return false
        })
        if (retained.length === 0) draft.entries.delete(key)
        else draft.entries.set(key, Object.freeze(retained))
      }
      return removed
    },
    settle: (
      key: string,
      state: "pending" | "clear" | "finding" | "unavailable",
      adviceId?: string
    ): ReadonlyArray<JoinedReviewOutcome> => {
      const reviews = draft.entries.get(key) ?? []
      draft.entries.delete(key)
      const outcomes: JoinedReviewOutcome[] = []
      for (const review of reviews) {
        const outcome = memberDisposition(review, state, adviceId)
        if (outcome !== undefined) outcomes.push({ review, stage: outcome })
      }
      return outcomes
    }
  }
}
export interface JoinedReviews<Pending> {
  readonly append: (review: JoinedReview) => Effect.Effect<void>
  readonly hasAdmission: (admission: number) => Effect.Effect<boolean>
  readonly attachOwner: (key: string, pending: Pending, revision: WorkRevision) => Effect.Effect<boolean>
  readonly releaseOwner: (key: string, reason: CollectorReason) => Effect.Effect<ReadonlyArray<JoinedReview>>
  readonly retireSuperseded: (subject: string) => Effect.Effect<ReadonlyArray<JoinedReview>>
  readonly settle: (
    ...args: Parameters<ReturnType<typeof joinedReviewOperations>["settle"]>
  ) => Effect.Effect<ReadonlyArray<JoinedReviewOutcome>>
}
