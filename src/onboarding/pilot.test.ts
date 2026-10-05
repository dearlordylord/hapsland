import * as Effect from "effect/Effect"
import { expect, it, vi } from "vitest"
import { runPilotSetup, type PilotOptions, type PilotPorts } from "./pilot.ts"
import { profileFields } from "./client-command.ts"
import type { runSetup } from "./setup.ts"
import type { HostProcessResult } from "./host-process.ts"

type Result = Effect.Success<ReturnType<typeof runSetup>>
type Stage = Result["stages"][number]
const stageNames: ReadonlyArray<Stage["stage"]> = ["compatibility", "installation", "credential", "repository"]
const complete: Result = {
  version: 1,
  operation: "setup",
  status: "completed",
  host: { adapter: "claude" },
  scope: { repository: "/repo", review: "enabled" },
  providerCalls: 0,
  paidVerificationPerformed: false,
  stages: stageNames.map((stage) => ({ stage, status: "complete", summary: `${stage} ready` })) satisfies Stage[],
  completed: [],
  pending: [],
  actions: []
}
const stageResult = (
  name: Stage["stage"],
  status: Stage["status"],
  resultStatus: Result["status"] = "needs-user-action"
): Result => ({
  ...complete,
  status: resultStatus,
  stages: complete.stages.map((stage) => (stage.stage === name ? { ...stage, status } : stage)),
  actions: [{ stage: name, code: "resolve-stage", action: "resolve the selected stage" }]
})
const fixture = (
  settings: {
    results?: Effect.Effect<Result, unknown>[]
    enterCredential?: boolean
    confirmation?: Effect.Effect<boolean, unknown>
    activation?: Effect.Effect<void, unknown>
    doctor?: Partial<HostProcessResult>
  } = {}
) => {
  const results = [...(settings.results ?? [Effect.succeed(complete), Effect.succeed(complete)])]
  const output: string[] = []
  const exits: number[] = []
  const events: string[] = []
  const options: PilotOptions = {
    terminal: true,
    host: "claude",
    fields: profileFields("claude", new Map()),
    cwd: "/repo",
    platform: "linux"
  }
  const ports: PilotPorts = {
    run: vi.fn<PilotPorts["run"]>((request, entered) => {
      if (request.interactive && settings.enterCredential) entered()
      return results.shift() ?? Effect.fail(new Error("unexpected setup call"))
    }),
    activate: Effect.sync(() => events.push("activate")).pipe(Effect.andThen(settings.activation ?? Effect.void)),
    verifyCredential: Effect.sync(() => events.push("verify")),
    doctor: Effect.sync(() => {
      events.push("doctor")
      return {
        stdout: JSON.stringify({ status: "ready" }),
        stderr: "",
        succeeded: true,
        timedOut: false,
        exitCode: 0,
        ...settings.doctor
      }
    }),
    confirm: vi.fn(() => settings.confirmation ?? Effect.succeed(true)),
    write: (text) => output.push(text),
    exitCode: (code) => exits.push(code)
  }
  return { options, ports, output, exits, events }
}

it("runs an initial noninteractive check before activation and offline readiness", async () => {
  const f = fixture()
  await Effect.runPromise(runPilotSetup(f.options, f.ports))
  const requests = vi.mocked(f.ports.run).mock.calls.map((call) => call[0])
  expect(requests).toHaveLength(2)
  expect(requests[0]).toMatchObject({
    version: 1,
    operation: "setup",
    credential: "saved",
    scope: { cwd: "/repo", review: "enabled" }
  })
  expect(requests[0]?.interactive).toBeUndefined()
  expect(requests[1]?.interactive).toBe(true)
  expect(f.events).toEqual(["activate", "verify", "doctor"])
  expect(f.output.join("")).not.toContain("Compatibility:")
  expect(f.ports.confirm).not.toHaveBeenCalled()
  expect(f.output.join("")).toContain("[OK] Setup: offline readiness: ready.")
  expect(f.output.join("")).not.toContain("Jev key saved")
  expect(f.exits).toEqual([])
})

it("requires a terminal before reading setup dependencies", async () => {
  const f = fixture()
  await Effect.runPromise(runPilotSetup({ ...f.options, terminal: false }, f.ports))
  expect(f.ports.run).not.toHaveBeenCalled()
  expect(f.events).toEqual([])
  expect(f.exits).toEqual([6])
})

it.each([true, false])(
  "reports incompatible profiles with an authored action or fallback (action=%s)",
  async (hasAction) => {
    const result = stageResult("compatibility", "unsupported", "unsupported")
    const f = fixture({ results: [Effect.succeed({ ...result, actions: hasAction ? result.actions : [] })] })
    await Effect.runPromise(runPilotSetup(f.options, f.ports))
    expect(f.ports.run).toHaveBeenCalledOnce()
    expect(f.exits).toEqual([3])
    expect(f.output.join("")).toContain(hasAction ? "resolve the selected stage" : "Use a declared Claude Code profile")
  }
)

it.each(["conflict", "partial"] as const)("stops an unavailable installation preview (%s)", async (status) => {
  const result = stageResult("installation", "conflict", status)
  const f = fixture({ results: [Effect.succeed(result)] })
  await Effect.runPromise(runPilotSetup(f.options, f.ports))
  expect(f.exits).toEqual([status === "partial" ? 5 : 4])
  expect(f.ports.run).toHaveBeenCalledOnce()
})

const approvalResult = (code: string, authorized = true): Result => ({
  ...stageResult("installation", "pending"),
  stages: complete.stages.map((stage) =>
    stage.stage === "installation"
      ? { ...stage, status: "pending", observed: { proposal: { changes: ["owned hook"] } } }
      : stage
  ),
  actions: [
    {
      stage: "installation",
      code,
      action: "approve owned hooks",
      ...(authorized ? { authorization: { installProposalDigest: "a".repeat(64) } } : {})
    }
  ]
})
it.each(["approve-installation", "resume-installation"])(
  "passes the explicitly approved digest for %s",
  async (code) => {
    const f = fixture({ results: [Effect.succeed(approvalResult(code)), Effect.succeed(complete)] })
    await Effect.runPromise(runPilotSetup(f.options, f.ports))
    expect(f.ports.confirm).toHaveBeenCalledOnce()
    expect(vi.mocked(f.ports.run).mock.calls[1]?.[0]).toMatchObject({
      interactive: true,
      installProposalDigest: "a".repeat(64)
    })
  }
)

it("stops a declined installation without reading credentials or activating", async () => {
  const f = fixture({
    results: [Effect.succeed(approvalResult("approve-installation"))],
    confirmation: Effect.succeed(false)
  })
  await Effect.runPromise(runPilotSetup(f.options, f.ports))
  expect(f.ports.run).toHaveBeenCalledOnce()
  expect(f.events).toEqual([])
  expect(f.exits).toEqual([])
  expect(f.output.join("")).toContain("Run hapsland setup claude to resume")
})

it("rejects an approval without a frozen digest", async () => {
  const f = fixture({ results: [Effect.succeed(approvalResult("approve-installation", false))] })
  await expect(Effect.runPromise(runPilotSetup(f.options, f.ports))).rejects.toThrow("approval digest")
  expect(f.ports.run).toHaveBeenCalledOnce()
})

it.each(["linux", "darwin"] as const)(
  "reports newly saved credentials on %s only after a complete credential stage",
  async (platform) => {
    const f = fixture({ enterCredential: true })
    await Effect.runPromise(runPilotSetup({ ...f.options, platform }, f.ports))
    expect(f.output.join("")).toContain(
      platform === "darwin" ? "Jev key saved in Keychain" : "Jev key saved in Secret Service"
    )
  }
)

it.each([
  { stage: "credential", status: "pending", resultStatus: "needs-user-action", exit: 6, activated: true },
  { stage: "installation", status: "partial", resultStatus: "partial", exit: 5, activated: true },
  { stage: "installation", status: "conflict", resultStatus: "conflict", exit: 6, activated: false },
  { stage: "repository", status: "unknown", resultStatus: "needs-user-action", exit: 6, activated: true }
] satisfies Array<{
  stage: Stage["stage"]
  status: Stage["status"]
  resultStatus: Result["status"]
  exit: number
  activated: boolean
}>)("stops after the unfinished $stage stage", async (entry) => {
  const f = fixture({
    results: [Effect.succeed(complete), Effect.succeed(stageResult(entry.stage, entry.status, entry.resultStatus))]
  })
  await Effect.runPromise(runPilotSetup(f.options, f.ports))
  expect(f.events).toEqual(entry.activated ? ["activate"] : [])
  expect(f.exits).toEqual([entry.exit])
  expect(f.output.join("")).toContain("Next: resolve the selected stage")
})

it.each([
  { succeeded: false, stdout: "", message: "Readiness check could not complete" },
  { succeeded: true, stdout: "{", message: "Readiness result was unreadable" },
  { succeeded: true, stdout: JSON.stringify({ status: 123 }), message: "Readiness result was unreadable" }
])("reports an unsuccessful or malformed doctor result (%j)", async (entry) => {
  const f = fixture({ doctor: entry })
  await Effect.runPromise(runPilotSetup(f.options, f.ports))
  expect(f.output.join("")).toContain(entry.message)
  expect(f.exits).toEqual([6])
})

it("prints doctor actions and incomplete checks while omitting ready checks", async () => {
  const f = fixture({
    doctor: {
      stdout: JSON.stringify({
        status: "not-ready",
        nextSteps: [{ action: "approve native trust" }],
        checks: [
          { stage: "profile", status: "ready" },
          { stage: "trust", status: "unknown" }
        ]
      })
    }
  })
  await Effect.runPromise(
    runPilotSetup({ ...f.options, host: "codex", fields: profileFields("codex", new Map()) }, f.ports)
  )
  expect(f.output.join("")).toContain("Next: approve native trust")
  expect(f.output.join("")).toContain("trust: unknown")
  expect(f.output.join("")).not.toContain("profile: ready")
  expect(f.output.join("")).toContain("Next: restart Codex, complete native repository and hook trust")
  expect(f.exits).toEqual([])
})

it("propagates activation failure before starting the doctor", async () => {
  const f = fixture({ activation: Effect.fail(new Error("activation unavailable")) })
  await expect(Effect.runPromise(runPilotSetup(f.options, f.ports))).rejects.toThrow("activation unavailable")
  expect(f.events).toEqual(["activate"])
})

it("carries new-key through preview and approved interactive setup", async () => {
  const f = fixture()
  await Effect.runPromise(runPilotSetup({ ...f.options, newKey: true }, f.ports))
  const requests = vi.mocked(f.ports.run).mock.calls.map((call) => call[0])
  expect(requests).toHaveLength(2)
  expect(requests[0]).toMatchObject({ newKey: true })
  expect(requests[0]?.interactive).toBeUndefined()
  expect(requests[1]).toMatchObject({ newKey: true, interactive: true })
})

it("marks unknown offline readiness as incomplete and keeps native trust and review actions visible", async () => {
  const f = fixture({
    doctor: { stdout: JSON.stringify({ status: "unknown", checks: [{ stage: "host-trust", status: "unknown" }] }) }
  })
  await Effect.runPromise(runPilotSetup(f.options, f.ports))
  const output = f.output.join("")
  expect(output).toContain("[OK] Installation:")
  expect(output).toContain("[WARN] Setup: offline readiness: unknown.")
  expect(output).toContain("host-trust: unknown")
  expect(output).toContain("Next: restart Claude Code")
  expect(output).toContain("A real review was not verified by setup.")
  expect(output).not.toContain("[OK] Setup:")
  expect(f.exits).toEqual([])
})

it("marks a missing credential as incomplete even after successful installation", async () => {
  const f = fixture({ results: [Effect.succeed(complete), Effect.succeed(stageResult("credential", "pending"))] })
  await Effect.runPromise(runPilotSetup(f.options, f.ports))
  expect(f.output.join("")).toContain("[OK] Installation:")
  expect(f.output.join("")).toContain("[WARN] Credential:")
  expect(f.output.join("")).toContain("[WARN] Setup incomplete:")
  expect(f.output.join("")).not.toContain("[OK] Setup:")
  expect(f.events).toEqual(["activate"])
  expect(f.exits).toEqual([6])
})

it("names Pi in setup and next actions rather than labeling it as Codex", async () => {
  const f = fixture()
  await Effect.runPromise(runPilotSetup({ ...f.options, host: "pi", fields: profileFields("pi", new Map()) }, f.ports))
  expect(f.output.join("")).toContain("Pi review integration setup")
  expect(f.output.join("")).toContain("Next: restart Pi")
  expect(f.output.join("")).not.toContain("Codex")
})

it("reports a newly saved key losing to a project file without duplicating source guidance", async () => {
  const result: Result = {
    ...complete,
    stages: complete.stages.map((stage) =>
      stage.stage === "credential"
        ? {
            ...stage,
            observed: {
              source: "environment",
              file: "/repo/.env.local",
              envVar: "TYPESAFE_API_KEY",
              environmentOnly: false,
              provider: "jev"
            }
          }
        : stage
    )
  }
  const f = fixture({ enterCredential: true, results: [Effect.succeed(complete), Effect.succeed(result)] })
  await Effect.runPromise(runPilotSetup(f.options, f.ports))
  const output = f.output.join("")
  expect(output).toContain("The newly saved key is not active")
  expect(output).not.toContain("Selected key source:")
})
