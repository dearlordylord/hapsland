import type * as Effect from "effect/Effect"

export type OperationalNoticeKind = "capacity" | "backend" | "credential" | "output-limit"

export type OperationalNotice = { readonly kind: OperationalNoticeKind; readonly suppressedCount: number }

/** The exact host encoding is measured here; Bend owns the inclusion rule. */
export type FindingSelectionFacts = {
  readonly partition: number
  readonly round: number
  readonly unit: number
  readonly snapshot: number
  readonly currentSnapshot: number
  readonly credential: number
  readonly currentCredential: number
  readonly ageMs: number
  readonly collectionReady: boolean
}

export type CanonicalFindingOffer = (input: {
  readonly selectionPartition: number
  readonly selectionRound: number
  readonly facts: FindingSelectionFacts
  readonly selectedCount: number
  readonly soloBytes: number
  readonly prospectiveBytes: number
}) => Effect.Effect<"selected" | "retained" | "limited" | "expired">
