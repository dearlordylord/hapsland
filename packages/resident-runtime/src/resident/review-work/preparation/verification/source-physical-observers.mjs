import fs from "node:fs"
import { syncBuiltinESMExports } from "node:module"
import assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import { projectCanonical } from "@hapsland/canonical-policy/canonical/adapter"

// Observe successful physical marker publication, without using a workflow
// selector. The consumer supplies an explicit wall-clock sample.
let activityCaptureActive = false
export function captureActivityPublications(statePath, trace, now = 1000) {
  assert.equal(activityCaptureActive, false, "activity worlds must run sequentially")
  activityCaptureActive = true
  const rename = fs.renameSync,
    clock = Date.now,
    errors = []
  fs.renameSync = function (source, target, ...args) {
    const result = rename.call(this, source, target, ...args)
    if (typeof target === "string" && target.startsWith(statePath + "/")) {
      try {
        trace.push({ kind: "activity", marker: JSON.parse(fs.readFileSync(target, "utf8")) })
      } catch (error) {
        errors.push(error)
      }
    }
    return result
  }
  Date.now = () => now
  syncBuiltinESMExports()
  let closed = false
  return {
    close() {
      if (closed) return
      closed = true
      fs.renameSync = rename
      Date.now = clock
      syncBuiltinESMExports()
      activityCaptureActive = false
      assert.deepEqual(errors, [], "physical activity observer must not lose publications")
    }
  }
}

export const snapshotReservationCustody = (snapshot) => ({
  reservations: [...snapshot.reservations].map(([id, value]) => ({ id, bytes: value.bytes, purpose: value.purpose })),
  bytes: projectCanonical(snapshot.canonical).global.bytes
})

// Mechanical observation of real pointers, preserving dispatch order and IDs.
export function snapshotSourceOwnership(snapshot) {
  const owners = [...snapshot.records.dispatch.entries.values()].map((entry) => {
    const unit = entry.value,
      reservation = snapshot.reservations.get(unit.reservation.id),
      revision = snapshot.records.revision.current.get(unit.revision.subject)
    assert.strictEqual(reservation?.capability, unit.reservation)
    assert.strictEqual(snapshot.records.reuse.pending.get(unit.evaluationKey), unit)
    assert.equal(revision?.token, unit.revision.token)
    assert.equal(revision.generation, unit.revision.generation)
    return {
      operation: unit.canonicalOperationId,
      round: unit.canonicalRound,
      reservation: unit.reservation.id,
      reservationBytes: reservation.bytes,
      purpose: reservation.purpose,
      evaluationKey: unit.evaluationKey,
      revisionSubject: unit.revision.subject,
      revisionGeneration: unit.revision.generation,
      inputIdentity: revision.inputIdentity
    }
  })
  return {
    owners,
    reservations: snapshot.reservations.size,
    revisions: snapshot.records.revision.current.size,
    pending: snapshot.records.reuse.pending.size,
    dispatch: snapshot.records.dispatch.entries.size,
    bytes: projectCanonical(snapshot.canonical).global.bytes
  }
}

// Cancel the real work signal only after the dispatcher has accepted a unit.
// This observes acceptance at the real dispatcher boundary.
export function cancelSourceAfterFirstEnqueue(
  context,
  trace,
  controller = context.job.work.controller,
  event = "source-work-aborted"
) {
  const dispatcher = context.deps.residentDispatcher
  let cancelled = false
  context.deps.residentDispatcher = {
    ...dispatcher,
    enqueue: (...args) =>
      dispatcher.enqueue(...args).pipe(
        Effect.tap((accepted) =>
          Effect.sync(() => {
            if (accepted && !cancelled) {
              cancelled = true
              trace.push({ kind: event })
              controller.abort()
            }
          })
        )
      )
  }
}
