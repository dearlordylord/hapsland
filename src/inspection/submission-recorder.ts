import { createHash } from "node:crypto"
import type { DirectAdvicee } from "../direct-event/model.ts"
import { Schema } from "effect"
import { InspectionWriterState, type InspectionFact, type InspectionScope } from "./contract.ts"
import type { InspectionRecorder } from "./recorder.ts"
import { InspectionSubmissionObservation } from "./writer.ts"

const isWriterState = Schema.is(InspectionWriterState)

type Membership = { readonly semanticIdentity: string; readonly evaluationId?: string }
type Batch = {
  readonly root: string
  readonly advicee: DirectAdvicee
  readonly findingIds: readonly string[]
  readonly evaluations: readonly Membership[]
}
type Ticket = {
  readonly batch: Batch
  readonly epoch: number
  readonly expires: number
  readonly bytes: number
  readonly attempts: Map<string, Set<string>>
}

/** Separate bounded observation ownership; it never holds review source or controls delivery. */
export const makeInspectionSubmissionRecorder = (
  recorder: InspectionRecorder,
  source: { readonly endpoint: string; readonly lifetime: string },
  now: () => number = Date.now
) => {
  const identity = { ...source }
  const tickets = new Map<string, Ticket>()
  let bytes = 0
  const prune = () => {
    for (const [token, ticket] of tickets) {
      if (ticket.expires <= now() || recorder.consentEpoch(ticket.batch.root) !== ticket.epoch) {
        tickets.delete(token)
        bytes -= ticket.bytes
      }
    }
  }
  const register = (token: string, batch: Batch): void => {
    prune()
    const epoch = recorder.consentEpoch(batch.root)
    if (epoch === undefined || token.length > 256 || batch.findingIds.length > 128 || batch.evaluations.length > 128)
      return
    const encoded = JSON.stringify(batch)
    const size = Buffer.byteLength(encoded) + Buffer.byteLength(token)
    if (size > 65536) return
    const prior = tickets.get(token)
    if (prior !== undefined) {
      tickets.delete(token)
      bytes -= prior.bytes
    }
    if (tickets.size >= 128 || bytes + size > 65536) return
    // Metadata is detached from review ownership; no findings, source or credentials are retained.
    const copy: Batch = JSON.parse(encoded)
    tickets.set(token, { batch: copy, epoch, expires: now() + 30000, bytes: size, attempts: new Map() })
    bytes += size
  }
  const observation = InspectionSubmissionObservation.of({
    forAttempt: (attempt) => {
      prune()
      const ticket = tickets.get(attempt.batchId)
      if (
        ticket === undefined ||
        attempt.endpoint !== identity.endpoint ||
        attempt.lifetime !== identity.lifetime ||
        attempt.root !== ticket.batch.root ||
        attempt.advicee.host !== ticket.batch.advicee.host ||
        attempt.advicee.hostVersion !== ticket.batch.advicee.hostVersion ||
        attempt.advicee.sessionId !== ticket.batch.advicee.sessionId ||
        attempt.advicee.subagentId !== ticket.batch.advicee.subagentId ||
        attempt.advicee.turnId !== ticket.batch.advicee.turnId ||
        attempt.advicee.toolUseId !== ticket.batch.advicee.toolUseId ||
        attempt.findingCount !== ticket.batch.findingIds.length ||
        attempt.noticeOnly !== (ticket.batch.findingIds.length === 0) ||
        !/^[a-f0-9-]{36}$/.test(attempt.attemptId)
      )
        return undefined
      let states = ticket.attempts.get(attempt.attemptId)
      if (states === undefined) {
        if (ticket.attempts.size >= 8) return undefined
        states = new Set()
        ticket.attempts.set(attempt.attemptId, states)
      }
      const seen = states
      const correlation = { batchId: attempt.batchId, attemptId: attempt.attemptId }
      const noticeOnly = attempt.noticeOnly
      const { root, advicee, findingIds, evaluations } = ticket.batch
      const scope: InspectionScope = {
        root,
        runtime: advicee.host,
        runtimeVersion: advicee.hostVersion,
        sessionId: advicee.sessionId,
        subagentId: advicee.subagentId
      }
      return {
        observe: (event) => {
          if (
            !isWriterState(event.state) ||
            tickets.get(correlation.batchId) !== ticket ||
            ticket.expires <= now() ||
            recorder.consentEpoch(root) !== ticket.epoch ||
            seen.has(event.state)
          )
            return
          seen.add(event.state)
          const byteLength = event.encoded === undefined ? undefined : Buffer.byteLength(event.encoded)
          const body =
            event.encoded === undefined || byteLength === undefined || byteLength > 16384
              ? undefined
              : Buffer.from(event.encoded)
          const output: Extract<InspectionFact, { kind: "writer-evidence" }>["output"] =
            byteLength === undefined
              ? { status: "missing", reason: "not-captured" }
              : body === undefined
                ? { status: "missing", reason: "oversized" }
                : {
                    status: "available",
                    representation: "host-jsonl-base64",
                    encoded: body.toString("base64"),
                    byteLength: body.byteLength,
                    sha256: createHash("sha256").update(body).digest("hex")
                  }
          recorder.offer(scope, correlation, {
            kind: "writer-evidence",
            state: event.state,
            noticeOnly,
            findingIds: [...findingIds],
            recipient: { turnId: advicee.turnId, toolUseId: advicee.toolUseId },
            evaluations: [...evaluations],
            output
          })
        }
      }
    }
  })
  return { register, observation }
}
