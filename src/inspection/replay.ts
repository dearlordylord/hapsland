import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import type { InspectionRecord } from "./contract.ts"

const MAX_SOURCES = 128
const ENTRY_BYTES = 40
const MAX_CURSOR_BYTES = 3 + MAX_SOURCES * ENTRY_BYTES + 32
export type InspectionReplayGap = {
  readonly sourceId?: string
  readonly reason: "invalid-cursor" | "cursor-anchor-not-retained" | "source-limit" | "view-limit"
}
type Position = { readonly sourceId: string; readonly sequence: number }

/** Stateless, bounded cursors identify retained per-lifetime positions, never a cross-source clock. */
export const makeInspectionReplay = () => {
  const secret = randomBytes(32)
  const sign = (bytes: Buffer) => createHmac("sha256", secret).update(bytes).digest()
  const encode = (positions: ReadonlyArray<Position>) => {
    const body = Buffer.alloc(3 + positions.length * ENTRY_BYTES)
    body[0] = 1
    body.writeUInt16BE(positions.length, 1)
    positions.forEach((position, index) => {
      const offset = 3 + index * ENTRY_BYTES
      Buffer.from(position.sourceId, "hex").copy(body, offset)
      body.writeBigUInt64BE(BigInt(position.sequence), offset + 32)
    })
    return Buffer.concat([body, sign(body)]).toString("base64url")
  }
  const decode = (cursor: string): ReadonlyArray<Position> | undefined => {
    if (cursor.length > Math.ceil((MAX_CURSOR_BYTES * 4) / 3) || !/^[A-Za-z0-9_-]+$/.test(cursor)) return undefined
    const bytes = Buffer.from(cursor, "base64url")
    if (bytes.toString("base64url") !== cursor || bytes.length < 35 || bytes[0] !== 1) return undefined
    const count = bytes.readUInt16BE(1)
    if (count > MAX_SOURCES || bytes.length !== 3 + count * ENTRY_BYTES + 32) return undefined
    const body = bytes.subarray(0, -32)
    if (!timingSafeEqual(sign(body), bytes.subarray(-32))) return undefined
    const positions: Position[] = []
    for (let index = 0; index < count; index++) {
      const offset = 3 + index * ENTRY_BYTES
      const sourceId = bytes.subarray(offset, offset + 32).toString("hex")
      const sequence = Number(bytes.readBigUInt64BE(offset + 32))
      if (!Number.isSafeInteger(sequence) || sequence < 1 || (index > 0 && positions[index - 1]!.sourceId >= sourceId))
        return undefined
      positions.push({ sourceId, sequence })
    }
    return positions
  }
  return {
    describe: (records: ReadonlyArray<InspectionRecord>, cursor: string | undefined, truncated: boolean) => {
      const sources = new Map<string, Set<number>>()
      for (const record of records) {
        let sequences = sources.get(record.source.id)
        if (sequences === undefined) {
          sequences = new Set()
          sources.set(record.source.id, sequences)
        }
        sequences.add(record.sequence)
      }
      const ordered = [...sources].sort(([a], [b]) => a.localeCompare(b)).slice(0, MAX_SOURCES)
      const positions = ordered.map(([sourceId, sequences]) => ({ sourceId, sequence: Math.max(...sequences) }))
      const previous = cursor === undefined ? [] : decode(cursor)
      const gaps: InspectionReplayGap[] = []
      if (previous === undefined) gaps.push({ reason: "invalid-cursor" })
      else
        for (const position of previous) {
          if (!sources.get(position.sourceId)?.has(position.sequence))
            gaps.push({ sourceId: position.sourceId, reason: "cursor-anchor-not-retained" })
        }
      if (sources.size > MAX_SOURCES) gaps.push({ reason: "source-limit" })
      if (truncated) gaps.push({ reason: "view-limit" })
      const prior = new Map((previous ?? []).map((position) => [position.sourceId, position.sequence]))
      return {
        watermark: { cursor: encode(positions), sources: positions, omittedSources: sources.size - positions.length },
        replay: {
          state: gaps.length ? ("reset" as const) : cursor === undefined ? ("fresh" as const) : ("resumed" as const),
          coverage: "retained-observations-only" as const,
          gaps,
          sources: ordered.map(([sourceId, sequences]) => {
            const after = prior.get(sourceId) ?? 0
            return {
              sourceId,
              after,
              through: Math.max(...sequences),
              retainedIncrements: [...sequences].filter((sequence) => sequence > after).length
            }
          })
        }
      }
    }
  }
}
