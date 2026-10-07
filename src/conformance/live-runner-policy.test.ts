import { describe, expect, it } from "vitest"
import {
  PaidExecutionNotAuthorized,
  assertPaidExecutionAuthorized,
  providerCallCountForEvidence
} from "@hapsland/build-tooling/test-support/live-runner-policy"

describe("paid live runner policy", () => {
  it("refuses missing execute-paid before credential lookup or provider-capable commands", () => {
    let credentialLookups = 0
    let providerCapableCommands = 0
    const invoke = () => {
      assertPaidExecutionAuthorized(["node", "runner"])
      credentialLookups += 1
      providerCapableCommands += 1
    }
    expect(invoke).toThrow(PaidExecutionNotAuthorized)
    expect(credentialLookups).toBe(0)
    expect(providerCapableCommands).toBe(0)
  })
  it("keeps provider attempts unknown after accepted or rejected admission", () => {
    expect(providerCallCountForEvidence(true)).toBe("unknown")
    expect(providerCallCountForEvidence(false)).toBe("unknown")
  })
})
