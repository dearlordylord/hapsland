import { describe, expect, it } from "vitest"
import { Decision } from "effect/ai"
import { reviewModelDefinition } from "@hapsland/runtime-environment/runtime/backend"
import { probabilityRequest, requestLimitViolation } from "@hapsland/review-execution/review-providers/request"

const decision = Decision.probability({ instructions: "check" })
describe("provider request limits", () => {
  it("keeps unknown Jev count/byte limits distinct from declared token budgets", () => {
    expect(reviewModelDefinition("jev-latest").limits.questions).toBeUndefined()
    expect(reviewModelDefinition("jev-latest").limits.httpBodyBytes).toBeUndefined()
    expect(reviewModelDefinition("jev-latest").limits.stateAndLongestQuestionTokens).toBe(32_000)
    expect(reviewModelDefinition("clef").limits.questions).toBe(64)
  })
  it("measures multibyte UTF-8 and JSON escaping at the exact body boundary", () => {
    const base = probabilityRequest("clef", "", [{ id: "namespace/rule", decision }])
    if (base === undefined) throw new Error("invalid fixture")
    const limit = reviewModelDefinition("clef").limits.httpBodyBytes
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
