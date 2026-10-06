import { BUN_VERSION, bunExecutable } from "./runtime/bun-runtime.ts"
import { spawnSync } from "../scripts/test-harness/process.mjs"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"

it("reports package readiness from individual checks and returns the matching exit status", () => {
  const result = spawnSync(
    bunExecutable(),
    [fileURLToPath(new URL("./package-doctor.ts", import.meta.url)), "--json"],
    { encoding: "utf8", env: process.env }
  )
  expect(result.error).toBeUndefined()
  const output = JSON.parse(result.stdout)
  expect(output.schemaVersion).toBe(1)
  const checks: Array<{ name: string; status: string; observed: string; required: string; action?: string }> =
    output.checks
  expect(checks.map((check) => check.name)).toEqual(
    expect.arrayContaining([
      "runtime",
      "platform-profile",
      "git",
      "parser-runtime-binding",
      "parser-typescript-binding",
      "parser-rust-binding",
      "stable-capture-facility",
      "resident-entry",
      "parser"
    ])
  )
  expect(new Set(checks.map((check) => check.name)).size).toBe(checks.length)
  for (const check of checks) {
    expect(["ready", "unsupported"]).toContain(check.status)
    expect(check.observed.length).toBeGreaterThan(0)
    expect(check.required.length).toBeGreaterThan(0)
    if (check.status === "ready") expect(check.action).toBeUndefined()
  }
  const allReady = checks.every((check) => check.status === "ready")
  expect(output.status).toBe(allReady ? "ready" : "unsupported")
  expect(result.status).toBe(allReady ? 0 : 1)
  const declaration = JSON.parse(readFileSync(new URL("../package-runtime.json", import.meta.url), "utf8"))
  expect(checks.find((check) => check.name === "runtime")).toMatchObject({
    observed: BUN_VERSION,
    required: `${declaration.runtime.name} ${declaration.runtime.version}`,
    status: "ready"
  })
  const profileDeclared = declaration.profiles.some(
    (profile: { operatingSystem: string; architecture: string }) =>
      profile.operatingSystem === process.platform && profile.architecture === process.arch
  )
  expect(checks.find((check) => check.name === "platform-profile")).toMatchObject({
    observed: `${process.platform}/${process.arch}`,
    status: profileDeclared ? "ready" : "unsupported"
  })
})

it("defaults to readable output even when stdout is piped, with the same exit status as JSON", () => {
  const entrypoint = fileURLToPath(new URL("./package-doctor.ts", import.meta.url))
  const human = spawnSync(bunExecutable(), [entrypoint], { encoding: "utf8", env: process.env })
  const machine = spawnSync(bunExecutable(), [entrypoint, "--json"], { encoding: "utf8", env: process.env })
  expect(human.error).toBeUndefined()
  expect(machine.error).toBeUndefined()
  expect(human.status).toBe(machine.status)
  const report = JSON.parse(machine.stdout)
  expect(human.stdout).toContain(report.status === "ready" ? "[OK] Package doctor:" : "[FAIL] Package doctor:")
  for (const check of report.checks) {
    expect(human.stdout).toContain(`${check.name}: ${check.observed}.`)
    if (check.action !== undefined) expect(human.stdout).toContain(`Next: ${check.action}.`)
  }
  expect(human.stdout).toContain("agent setup and a real review were not verified")
  expect(human.stdout).not.toContain('"schemaVersion"')
  expect(machine.stdout).not.toMatch(/\[(OK|WARN|FAIL|INFO)\]/)
})

it.each(["--help", "--unknown"])("handles %s without running package diagnostics", (arg) => {
  const result = spawnSync(bunExecutable(), [fileURLToPath(new URL("./package-doctor.ts", import.meta.url)), arg], {
    encoding: "utf8",
    env: process.env
  })
  expect(result.status).toBe(arg === "--help" ? 0 : 2)
  expect(result.stdout + result.stderr).toContain("Usage: hapsland-doctor [--json]")
  expect(result.stdout + result.stderr).not.toContain("package checks")
})
