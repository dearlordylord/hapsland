import { expect, it } from "vitest"
import { initialCanonical, projectCanonical, stepCanonical, type CanonicalEvent } from "./adapter.ts"

const fixture = () => {
  let state = initialCanonical({ globalItems: 16, globalBytes: 1000, partitionItems: 16, partitionBytes: 1000 })
  const apply = (event: CanonicalEvent) => {
    const result = stepCanonical(state, event)
    expect(result.rejection).toBeUndefined()
    state = result.state
    return result.commands
  }
  apply({ kind: "openRound", partition: 1, lifetime: 1 })
  const round = projectCanonical(state).rounds[0]!.id
  const scope = { partition: 1, lifetime: 1, round }
  const unit = () => {
    const admitted = apply({ kind: "admitObservation", ...scope }).find((c) => c.kind === "observationAdmitted")
    if (admitted?.kind !== "observationAdmitted") throw new Error("missing observation")
    apply({ kind: "startObservation", ...scope, observation: admitted.id })
    const prep = apply({ kind: "beginObservedPreparation", ...scope, observation: admitted.id, bytes: 10 }).find(
      (c) => c.kind === "prepare"
    )
    if (prep?.kind !== "prepare") throw new Error("missing preparation")
    const child = apply({ kind: "preparationCompleted", ...scope, operation: prep.operation, unitBytes: [5] }).find(
      (c) => c.kind === "unitAdmitted"
    )
    if (child?.kind !== "unitAdmitted") throw new Error("missing unit")
    apply({ kind: "completeObservation", ...scope, observation: admitted.id })
    return { ...scope, operation: child.operation }
  }
  return { apply, unit, scope, state: () => state }
}

it.each([false, true])(
  "cancels running Reviewing before physical issue or AtJev after Started (started=%s)",
  (started) => {
    const f = fixture()
    const healthy = f.unit()
    f.apply({ kind: "startReview", ...healthy })
    f.apply({ kind: "reviewObserved", ...healthy, outcome: "finding", currentWork: true })
    const finding = projectCanonical(f.state()).pendingFindings
    const target = f.unit()
    f.apply({ kind: "queueDispatch", ...target })
    f.apply({ kind: "startReview", ...target })
    let request: number | undefined
    if (started) {
      const issued = f
        .apply({
          kind: "jevRequestReady",
          ...target,
          rootValid: true,
          configurationValid: true,
          credentialReady: true,
          selected: true,
          currentWork: true,
          physicalAvailable: true
        })
        .find((c) => c.kind === "jevRequestIssued")
      if (issued?.kind !== "jevRequestIssued") throw new Error("missing physical request")
      request = issued.request
      f.apply({ kind: "jevRequestStarted", ...target, request })
    }
    const before = projectCanonical(f.state())
    const charge = before.work.find((w) => w.operation === target.operation)!.reservation
    expect(charge).toBeGreaterThan(0)
    expect(before.dispatch.requests).toEqual(started ? [{ ...target, request, started: true, interrupted: false }] : [])
    expect(before.dispatch.running.some((entry) => entry.operation === target.operation)).toBe(true)
    for (const field of ["partition", "lifetime", "round", "operation"] as const) {
      const refused = stepCanonical(f.state(), { kind: "cancelReview", ...target, [field]: target[field] + 100 })
      expect(refused.rejection).toBeDefined()
      expect(refused.commands).toEqual([])
      expect(projectCanonical(refused.state)).toEqual(before)
    }
    const commands = f.apply({ kind: "cancelReview", ...target })
    expect(commands).toEqual([
      { kind: "reservationReleased", id: charge },
      { kind: "cancelWork", operation: target.operation },
      { kind: "dispatchDiscarded", operation: target.operation, running: true }
    ])
    const after = projectCanonical(f.state())
    expect(after.dispatch.requests).toEqual(before.dispatch.requests)
    expect(after.pendingFindings).toEqual(finding)
    expect(after.charges).toEqual(before.charges.filter((c) => c.id !== charge))
    const duplicateCancel = stepCanonical(f.state(), { kind: "cancelReview", ...target })
    expect(duplicateCancel.rejection).toBeDefined()
    expect(projectCanonical(duplicateCancel.state)).toEqual(after)
    if (request !== undefined) {
      const terminal: CanonicalEvent = {
        kind: "jevRequestSettled",
        ...target,
        request,
        outcome: "clear",
        currentWork: true
      }
      expect(f.apply(terminal)).toEqual([{ kind: "jevObservationIgnored" }])
      expect(projectCanonical(f.state()).dispatch.requests).toEqual([])
      expect(projectCanonical(f.state()).pendingFindings).toEqual(finding)
      const duplicate = stepCanonical(f.state(), terminal)
      expect(duplicate.rejection).toBeDefined()
      expect(duplicate.commands).toEqual([])
      expect(projectCanonical(duplicate.state)).toEqual(projectCanonical(f.state()))
    }
  }
)

it("refuses cancellation of observation work without changing any owner", () => {
  const f = fixture()
  const admission = f.apply({ kind: "admitObservation", ...f.scope }).find((c) => c.kind === "observationAdmitted")
  if (admission?.kind !== "observationAdmitted") throw new Error("missing observation")
  const target = { ...f.scope, operation: admission.id }
  const before = projectCanonical(f.state())
  const result = stepCanonical(f.state(), { kind: "cancelReview", ...target })
  expect(result.rejection).toBeDefined()
  expect(result.commands).toEqual([])
  expect(projectCanonical(result.state)).toEqual(before)
})
