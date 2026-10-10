import { findingCollectionOutcome } from "./collection-decisions.ts"
import type { CanonicalFindingOffer } from "../state/collection-facts.ts"
import type { ResidentLedger } from "../work-ownership/jobs.ts"
import * as Effect from "effect/Effect"

export const makeCollectionFindingOffer = (
  residentLedger: Pick<ResidentLedger, "transition">
): CanonicalFindingOffer => {
  return Effect.fn("ResidentRuntime.collectionFindingOffer")(function* (input) {
    const facts = input.facts
    const result = yield* residentLedger.transition({
      kind: "collectionFindingCheck",
      selectionPartition: input.selectionPartition,
      selectionRound: input.selectionRound,
      unit: facts.unit,
      partition: facts.partition,
      round: facts.round,
      snapshot: facts.snapshot,
      currentSnapshot: facts.currentSnapshot,
      credential: facts.credential,
      currentCredential: facts.currentCredential,
      ageMs: facts.ageMs,
      soloBytes: input.soloBytes,
      collectionReady: facts.collectionReady,
      selectedCount: input.selectedCount,
      prospectiveBytes: input.prospectiveBytes
    })
    if (result.rejection !== undefined) throw new Error("canonical finding fit refused")
    return findingCollectionOutcome(result.outputs[0]?.kind)
  })
}
