import { describe, expect, it } from "vitest"
import { Decision } from "effect/ai"
import { PROVIDER_LIMITS } from "./catalog.ts"
import { probabilityRequest, requestLimitViolation } from "./request.ts"

const decision = Decision.probability({ instructions: "check" })
describe("provider request limits", () => {
  it("keeps unknown Jev count/byte limits distinct from declared token budgets", () => {
    expect(PROVIDER_LIMITS["jev-latest"].questions).toBeUndefined()
    expect(PROVIDER_LIMITS["jev-latest"].httpBodyBytes).toBeUndefined()
    expect(PROVIDER_LIMITS["jev-latest"].stateAndLongestQuestionTokens).toBe(32_000)
    expect(PROVIDER_LIMITS.clef.questions).toBe(64)
  })
  it("measures multibyte UTF-8 and JSON escaping at the exact body boundary", () => {
    const base = probabilityRequest("clef", "", [{ id: "namespace/rule", decision }])
    if (base === undefined) throw new Error("invalid fixture")
    const limit = PROVIDER_LIMITS.clef.httpBodyBytes
    if (limit === undefined) throw new Error("missing byte limit")
    const state = "я\n" + "x".repeat(limit - base.bytes - Buffer.byteLength("я\\n"))
    const exact = probabilityRequest("clef", state, [{ id: "namespace/rule", decision }])
    expect(exact?.bytes).toBe(limit)
    expect(requestLimitViolation("clef", exact)).toBeUndefined()
    const over = probabilityRequest("clef", state + "x", [{ id: "namespace/rule", decision }])
    expect(requestLimitViolation("clef", over)).toBe("http-body-bytes")
  })
  it("does not collapse qualified IDs or permit duplicate IDs", () => {
    const request = probabilityRequest("clef", {}, [
      { id: "a/b", decision },
      { id: "a_b", decision },
      { id: "q0", decision }
    ])
    expect(request?.ids).toEqual({ q0: "a/b", q1: "a_b", q2: "q0" })
    expect(
      probabilityRequest("clef", {}, [
        { id: "a/b", decision },
        { id: "a/b", decision }
      ])
    ).toBeUndefined()
  })
})
