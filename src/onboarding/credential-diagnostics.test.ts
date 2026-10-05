import { expect, it } from "vitest"
import { credentialDiagnostic } from "./credential-diagnostics.ts"

it.each([
  {
    status: "present" as const,
    source: "saved" as const,
    expected: "ready",
    action: undefined,
    accessibility: "available-via-noninteractive-native-lookup"
  },
  {
    status: "present" as const,
    source: "environment" as const,
    expected: "ready",
    action: undefined,
    accessibility: "requires-host-environment-verification"
  },
  {
    status: "missing" as const,
    source: "saved" as const,
    expected: "missing",
    action: "store a credential",
    accessibility: "unavailable"
  },
  {
    status: "invalid" as const,
    source: "saved" as const,
    expected: "conflict",
    action: "store a credential",
    accessibility: "unavailable"
  },
  {
    status: "locked" as const,
    source: "saved" as const,
    expected: "missing",
    action: "unlock or approve",
    accessibility: "unavailable"
  },
  {
    status: "interaction-required" as const,
    source: "saved" as const,
    expected: "missing",
    action: "unlock or approve",
    accessibility: "unavailable"
  },
  {
    status: "timed-out" as const,
    source: "saved" as const,
    expected: "missing",
    action: "750 ms deadline",
    accessibility: "unavailable"
  },
  {
    status: "suspended" as const,
    source: "saved" as const,
    expected: "conflict",
    action: "reconcile the suspended credential",
    accessibility: "unavailable"
  },
  {
    status: "unavailable" as const,
    source: "saved" as const,
    expected: "missing",
    action: "native helper",
    accessibility: "unavailable"
  },
  {
    status: "missing" as const,
    source: "environment" as const,
    expected: "missing",
    action: "make CUSTOM_KEY available",
    accessibility: "unavailable"
  }
])(
  "reports $source credential $status without claiming host accessibility",
  ({ status, source, expected, action, accessibility }) => {
    const credential = { status, source, value: "synthetic-private-value", generation: 7 }
    const result = credentialDiagnostic(credential, "CUSTOM_KEY", false)
    expect(result.status).toBe(expected)
    if (action === undefined) expect(result.action).toBeUndefined()
    else expect(result.action).toContain(action)
    expect(result.observed).toMatchObject({
      actualHookAccessibility: accessibility,
      doctorProcessEnvironment: "absent",
      selectedSource: source
    })
    expect(JSON.stringify(result)).not.toContain("synthetic-private-value")
    expect(JSON.stringify(result)).not.toContain("generation")
  }
)

it("keeps doctor environment observation separate from selected saved storage", () => {
  const result = credentialDiagnostic({ source: "saved", status: "locked" }, "CUSTOM_KEY", true)
  expect(result.observed).toMatchObject({
    doctorProcessEnvironment: "present",
    actualHookAccessibility: "unavailable",
    savedCredentialAccessibility: "locked"
  })
})

it("reports a file source separately from installer environment without exposing its value", () => {
  const result = credentialDiagnostic(
    { status: "present", source: "environment", file: "/project/.env.local" },
    "TYPESAFE_API_KEY",
    false
  )
  expect(result.observed).toMatchObject({
    credentialFile: "/project/.env.local",
    doctorProcessEnvironment: "absent",
    actualHookAccessibility: "available-via-file-lookup"
  })
})

it("points to the rejected file instead of requesting native credential repair", () => {
  const result = credentialDiagnostic(
    { status: "unavailable", source: "environment", file: "/project/.env" },
    "TYPESAFE_API_KEY",
    false
  )
  expect(result.action).toContain("/project/.env")
  expect(result.action).not.toContain("native")
})
