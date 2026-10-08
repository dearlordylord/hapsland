import { expect, it } from "@effect/vitest"
import {
  verificationAttemptBucket,
  verificationNavigationIndex,
  getVerificationNavigationRoutes,
  verificationSourceId,
  verificationResultId,
  verificationCommandKind,
  type VerificationSourceName,
  type VerificationResultName,
  type VerificationPhase,
  type VerificationActionKind
} from "@hapsland/canonical-policy/canonical/verification-adapter"

it("verification classification preserves natural counts and rejects invalid representations", () => {
  for (const count of [0, 1, 2]) expect(verificationAttemptBucket(count)).toBe(count)
  for (const count of [3, 4, 31, 2 ** 32, Number.MAX_SAFE_INTEGER]) expect(verificationAttemptBucket(count)).toBe(3)
  for (const count of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    expect(() => verificationAttemptBucket(count)).toThrow("natural number")
})

it("verification fact and command boundaries reject foreign enum values", () => {
  expect(verificationSourceId(undefined)).toBe(0)
  for (const foreign of ["constructor", "__proto__", "unknown"]) {
    expect(() => verificationSourceId(foreign as VerificationSourceName)).toThrow("Unknown verification source")
    expect(() => verificationResultId(foreign as VerificationResultName)).toThrow("Unknown verification result")
    expect(() => verificationCommandKind(foreign as VerificationPhase)).toThrow("Unknown verification phase")
    expect(() => verificationNavigationIndex("Checking", foreign as VerificationActionKind)).toThrow(
      "Unknown verification action"
    )
  }
})

it("verification tables expose immutable source-free axes and plans", () => {
  const verificationNavigationRoutes = getVerificationNavigationRoutes()
  expect(getVerificationNavigationRoutes()).toBe(verificationNavigationRoutes)
  expect(Object.isFrozen(verificationNavigationRoutes)).toBe(true)
  for (const route of verificationNavigationRoutes) {
    expect(Object.isFrozen(route)).toBe(true)
    expect(Object.isFrozen(route.axes)).toBe(true)
    expect(Object.isFrozen(route.plans)).toBe(true)
    for (const axis of route.axes) expect(Object.isFrozen(axis)).toBe(true)
    for (const plan of route.plans) {
      expect(Object.isFrozen(plan)).toBe(true)
      expect(Object.keys(plan).sort()).toEqual(plan.kind === "hold" ? ["kind"] : ["kind", "patch", "phase"])
    }
  }
})
