import { expect, it } from "@effect/vitest"
import {
  loginCommandKind,
  loginNavigationIndex,
  loginNavigationPlans,
  type LoginPhase,
  type LoginActionKind
} from "@hapsland/canonical-policy/canonical/login-adapter"

it("checked login navigation rejects foreign phases and actions", () => {
  for (const phase of ["constructor", "unknown", "__proto__"]) {
    expect(() => loginCommandKind(phase as LoginPhase)).toThrow("Unknown login phase")
    expect(() => loginNavigationIndex(phase as LoginPhase, "exit")).toThrow("Unknown login phase")
  }
  expect(() => loginNavigationIndex("SavingKey", "constructor" as LoginActionKind)).toThrow("Unknown login action")
})

it("login navigation plans expose only immutable source-free decisions", () => {
  expect(Object.isFrozen(loginNavigationPlans)).toBe(true)
  for (const options of loginNavigationPlans) {
    expect(Object.isFrozen(options)).toBe(true)
    expect([1, 16]).toContain(options.length)
    for (const plan of options) {
      expect(Object.isFrozen(plan)).toBe(true)
      expect(Object.keys(plan).sort()).toEqual(plan.kind === "advance" ? ["kind", "patch", "phase"] : ["kind"])
    }
  }
})
