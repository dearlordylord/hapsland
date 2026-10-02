import type { Effect } from "effect";
import type { DirectObservation } from "../direct-event/model.ts";
import type { TicketReason } from "../canonical/adapter.ts";
import type { CapacityLedger } from "./capacity.ts";
import type { WorkRevision, RevisionOperations } from "./revision.ts";
import type { TicketUnit, ticketUnitOperations } from "./ticket-units.ts";

export type JoinedReview = {
  readonly admission: number;
  readonly evaluationKey: string;
  readonly observation: Pick<DirectObservation, "root" | "advicee">;
  readonly activityPath: string | undefined;
  readonly ticketUnit?: TicketUnit;
  readonly revision?: WorkRevision;
};
export type JoinedReviewOutcome = { readonly review: JoinedReview; readonly stage: "clear" | "findings" | "unavailable" };
export type JoinedReviewsState = { readonly entries: ReadonlyMap<string, ReadonlyArray<JoinedReview>> };
export const initialJoinedReviews = (): JoinedReviewsState => ({ entries: new Map() });
export const draftJoinedReviews = (state: JoinedReviewsState) => ({ entries: new Map(state.entries) });
export const joinedReviewOperations = (
  draft: ReturnType<typeof draftJoinedReviews>, owner: Pick<CapacityLedger, "transition">,
  units: ReturnType<typeof ticketUnitOperations>, revisions: Pick<RevisionOperations, "superseded">,
) => {
  const unavailable = (unit: TicketUnit, reason: TicketReason): void => {
    const stage = units.stage(unit);
    if (stage === undefined || stage.stage === "unavailable") return;
    if (!units.step(unit, "failUnit", reason, {})) throw new Error("canonical joined ticket failure refused");
  };
  return {
    append: (review: JoinedReview): void => {
      if (review.revision !== undefined && review.ticketUnit !== undefined) {
        units.step(review.ticketUnit, "revise", "lost", { revision: review.revision });
      }
      draft.entries.set(review.evaluationKey, Object.freeze([
        ...(draft.entries.get(review.evaluationKey) ?? []), Object.freeze({
          ...review,
          observation: Object.freeze({ root: review.observation.root, advicee: Object.freeze({ ...review.observation.advicee }) }),
        }),
      ]));
    },
    attach: (key: string, revision: WorkRevision): void => {
      const reviews = draft.entries.get(key);
      if (reviews === undefined) return;
      draft.entries.set(key, Object.freeze(reviews.map((review) => {
        if (review.revision !== undefined) return review;
        if (review.ticketUnit !== undefined && units.stage(review.ticketUnit)?.stage === "pending") {
          units.step(review.ticketUnit, "revise", "lost", { revision });
        }
        return Object.freeze({ ...review, revision });
      })));
    },
    releaseUnattached: (key: string, reason: TicketReason): ReadonlyArray<JoinedReview> => {
      const reviews = draft.entries.get(key) ?? [];
      const removed = reviews.filter((review) => review.revision === undefined);
      for (const review of removed) if (review.ticketUnit !== undefined) unavailable(review.ticketUnit, reason);
      const retained = reviews.filter((review) => review.revision !== undefined);
      if (retained.length === 0) draft.entries.delete(key);
      else draft.entries.set(key, Object.freeze(retained));
      return removed;
    },
    retireSuperseded: (subject: string): ReadonlyArray<JoinedReview> => {
      const removed: JoinedReview[] = [];
      for (const [key, reviews] of draft.entries) {
        const retained = reviews.filter((review) => {
          if (review.revision === undefined || !revisions.superseded(subject, review.revision)) return true;
          if (review.ticketUnit !== undefined) unavailable(review.ticketUnit, "stale");
          removed.push(review);
          return false;
        });
        if (retained.length === 0) draft.entries.delete(key);
        else draft.entries.set(key, Object.freeze(retained));
      }
      return removed;
    },
    settle: (key: string, state: "pending" | "clear" | "finding" | "unavailable", reason: TicketReason = "lost", adviceId?: string): ReadonlyArray<JoinedReviewOutcome> => {
      const reviews = draft.entries.get(key) ?? [];
      draft.entries.delete(key);
      const outcomes: JoinedReviewOutcome[] = [];
      for (const review of reviews) {
        const unit = review.ticketUnit;
        const revision = review.revision;
        const stage = unit === undefined ? undefined : units.stage(unit);
        let outcome: JoinedReviewOutcome["stage"] | undefined;
        if (unit !== undefined && stage !== undefined) {
          const disposition = owner.transition({ kind: "ticketJoinedCheck", state,
            staleUnavailable: stage.stage === "unavailable" && stage.reason === "stale",
            hasRevision: revision !== undefined, hasAdviceId: adviceId !== undefined }).commands[0]?.kind;
          switch (disposition) {
            case "ticketKeepJoined": break;
            case "ticketSetJoinedUnavailable": unavailable(unit, reason); outcome = "unavailable"; break;
            case "ticketSetJoinedLost": unavailable(unit, "lost"); outcome = "unavailable"; break;
            case "ticketSetJoinedClear":
              if (revision === undefined) throw new Error("Bend joined clear lacks revision");
              units.step(unit, "clearResult", "lost", { revision }); outcome = "clear"; break;
            case "ticketSetJoinedFinding":
              if (revision === undefined || adviceId === undefined) throw new Error("Bend joined finding lacks identity");
              units.step(unit, "findingResult", "lost", { revision, adviceId }); outcome = "findings"; break;
            default: throw new Error("Bend denied joined ticket disposition");
          }
        } else if (state === "clear" || state === "finding") {
          outcome = revision === undefined ? "unavailable" : state === "clear" ? "clear" : "findings";
        } else if (state === "unavailable") outcome = "unavailable";
        if (outcome !== undefined) outcomes.push({ review, stage: outcome });
      }
      return outcomes;
    },
  };
};
export interface JoinedReviews<Pending> {
  readonly append: (review: JoinedReview) => Effect.Effect<void>;
  readonly hasAdmission: (admission: number) => Effect.Effect<boolean>;
  readonly attachOwner: (key: string, pending: Pending, revision: WorkRevision) => Effect.Effect<boolean>;
  readonly releaseOwner: (key: string, reason: TicketReason) => Effect.Effect<ReadonlyArray<JoinedReview>>;
  readonly retireSuperseded: (subject: string) => Effect.Effect<ReadonlyArray<JoinedReview>>;
  readonly settle: (...args: Parameters<ReturnType<typeof joinedReviewOperations>["settle"]>) => Effect.Effect<ReadonlyArray<JoinedReviewOutcome>>;
}
