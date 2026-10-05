import { expect, it } from "vitest"
import { formatOutcome, formatPackageDoctor, formatStatusOutcome } from "./human-output.ts"

it.each([
  ["success", "[OK]"],
  ["warning", "[WARN]"],
  ["error", "[FAIL]"],
  ["info", "[INFO]"]
] as const)("renders %s without color or Unicode dependencies", (level, marker) => {
  expect(formatOutcome(level, "Scope: result.")).toBe(`${marker} Scope: result.`)
})

it.each([
  ["ready", "[OK]"],
  ["complete", "[OK]"],
  ["completed", "[OK]"],
  ["updated", "[OK]"],
  ["already current", "[OK]"],
  ["unknown", "[WARN]"],
  ["pending", "[WARN]"],
  ["partial", "[WARN]"],
  ["skipped", "[INFO]"],
  ["conflict", "[FAIL]"],
  ["unrecognized", "[FAIL]"]
])("distinguishes the %s outcome", (status, marker) => {
  expect(formatStatusOutcome(status, "Local check.")).toBe(`${marker} Local check.`)
})

it("identifies successful package checks without claiming integration or real-review success", () => {
  expect(
    formatPackageDoctor({
      schemaVersion: 1,
      status: "ready",
      checks: [{ name: "runtime", status: "ready", observed: "1.3.14", required: "bun 1.3.14" }]
    })
  ).toEqual([
    "[OK] Package doctor: package checks passed.",
    "  [OK] runtime: 1.3.14.",
    "[INFO] Package checks only; agent setup and a real review were not verified."
  ])
})

it("retains failed-check observations, requirements and recovery actions", () => {
  expect(
    formatPackageDoctor({
      schemaVersion: 1,
      status: "unsupported",
      checks: [
        {
          name: "git",
          status: "unsupported",
          observed: "unavailable",
          required: "git available",
          action: "install git"
        },
        { name: "runtime", status: "unsupported", observed: "v24", required: "bun 1.3.14" }
      ]
    })
  ).toEqual([
    "[FAIL] Package doctor: package checks failed.",
    "  [FAIL] git: unavailable.",
    "    Required: git available.",
    "    Next: install git.",
    "  [FAIL] runtime: v24.",
    "    Required: bun 1.3.14.",
    "[INFO] Package checks only; agent setup and a real review were not verified."
  ])
})
