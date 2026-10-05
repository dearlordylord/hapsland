import { randomUUID } from "node:crypto"
import type { DirectAdvicee } from "../direct-event/model.ts"
import type { ResidentWriterEvidence } from "../resident/protocol.ts"

/** Pi's handler offers a return value; neither the resident ACK nor this port observes native acceptance. */
export const piOfferReports = (
  offer: {
    readonly inspection?: { readonly root: string; readonly advicee: DirectAdvicee }
    readonly findingCount?: number
  },
  output: unknown
): ReadonlyArray<ResidentWriterEvidence> | undefined => {
  try {
    const findingCount = offer.findingCount
    if (
      offer.inspection === undefined ||
      findingCount === undefined ||
      !Number.isSafeInteger(findingCount) ||
      findingCount < 0 ||
      findingCount > 128
    )
      return undefined
    const encoded = JSON.stringify(output)
    if (typeof encoded !== "string") return undefined
    const payload = Buffer.byteLength(encoded, "utf8") > 16384 ? { outputMissing: "oversized" as const } : { encoded }
    const binding = {
      root: offer.inspection.root,
      advicee: { ...offer.inspection.advicee },
      findingCount,
      noticeOnly: findingCount === 0,
      attemptId: randomUUID()
    }
    const states: ReadonlyArray<ResidentWriterEvidence["state"]> = ["ready", "authorized", "write-started", "uncertain"]
    return states.map((state) => ({ ...binding, state, ...payload }))
  } catch {
    return undefined
  }
}
