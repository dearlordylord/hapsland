import * as Effect from "effect/Effect"
import { ConfigurationError } from "@hapsland/runtime-inputs/configuration/errors"
import { expect, it, vi } from "vitest"
import {
  runPilotSetup,
  type PilotOptions,
  type SetupOwner,
  SetupOwnerService,
  type SetupTransition
} from "@hapsland/administration/onboarding/pilot"
import { profileFields } from "@hapsland/administration/onboarding/client-command"
import type { runSetup } from "@hapsland/administration/onboarding/setup"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import { initialVerification } from "@hapsland/administration/onboarding/verification-model"
import { scriptedInteraction, type ScriptStep } from "../../scripts/test-support/scripted-interaction.ts"
import { initialSetup, reduceSetup } from "@hapsland/administration/onboarding/setup-model"
import type { HostProcessResult } from "@hapsland/runtime-environment/process/closed-stdin"

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
    script?: ScriptStep[]
    verificationCancelled?: boolean
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
  const transitions: SetupTransition[] = []
  const scripted = settings.script === undefined ? undefined : scriptedInteraction(settings.script)
  const ports = {
    run: vi.fn<SetupOwner["run"]>((request, entered) => {
      if (request.interactive && settings.enterCredential) entered()
      return results.shift() ?? Effect.fail(new Error("unexpected setup call"))
    }),
    activate: Effect.sync(() => events.push("activate")).pipe(Effect.andThen(settings.activation ?? Effect.void)),
    verifyCredential: Effect.sync(() => {
      events.push("verify")
      return {
        kind: settings.verificationCancelled ? ("cancelled" as const) : ("completed" as const),
        model: initialVerification()
      }
    }),
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
    write: (text: string) => output.push(text),
    exitCode: (code: number) => exits.push(code)
  }
  const run = (selected: PilotOptions = options) =>
    runPilotSetup(selected, {
      observe: (transition) =>
        Effect.sync(() => {
          transitions.push(transition)
        })
    }).pipe(
      Effect.provideService(SetupOwnerService, ports),
      Effect.provideService(InteractionService, {
        ...(scripted?.interaction ?? scriptedInteraction([]).interaction),
        present: (text) =>
          Effect.sync(() => {
            output.push(text)
          }),
        confirm: (view) =>
          scripted
            ? scripted.interaction.confirm(view)
            : ports.confirm().pipe(
                Effect.orDie,
                Effect.map((yes) => ({ kind: "confirmed" as const, yes }))
              )
      }),
      Effect.tap((outcome) =>
        Effect.sync(() => {
          if (outcome.exitCode) exits.push(outcome.exitCode)
        })
      )
    )
  return { options, ports, output, exits, events, run, transitions, scripted }
}

it("runs an initial noninteractive check before activation and offline readiness", async () => {
  const f = fixture()
  await Effect.runPromise(f.run())
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
  await Effect.runPromise(f.run({ ...f.options, terminal: false }))
  expect(f.ports.run).not.toHaveBeenCalled()
  expect(f.events).toEqual([])
  expect(f.exits).toEqual([6])
})

it.each([true, false])(
  "reports incompatible profiles with an authored action or fallback (action=%s)",
  async (hasAction) => {
    const result = stageResult("compatibility", "unsupported", "unsupported")
    const f = fixture({ results: [Effect.succeed({ ...result, actions: hasAction ? result.actions : [] })] })
    await Effect.runPromise(f.run())
    expect(f.ports.run).toHaveBeenCalledOnce()
    expect(f.exits).toEqual([3])
    expect(f.output.join("")).toContain(hasAction ? "resolve the selected stage" : "Use a declared Claude Code profile")
  }
)

it.each(["conflict", "partial"] as const)("stops an unavailable installation preview (%s)", async (status) => {
  const result = stageResult("installation", "conflict", status)
  const f = fixture({ results: [Effect.succeed(result)] })
  await Effect.runPromise(f.run())
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
    await Effect.runPromise(f.run())
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
  await Effect.runPromise(f.run())
  expect(f.ports.run).toHaveBeenCalledOnce()
  expect(f.events).toEqual([])
  expect(f.exits).toEqual([])
  expect(f.output.join("")).toContain("Run hapsland setup claude to resume")
})

it("rejects an approval without a frozen digest", async () => {
  const f = fixture({ results: [Effect.succeed(approvalResult("approve-installation", false))] })
  await expect(Effect.runPromise(f.run())).rejects.toThrow("approval digest")
  expect(f.ports.run).toHaveBeenCalledOnce()
})

it.each(["linux", "darwin"] as const)(
  "reports newly saved credentials on %s only after a complete credential stage",
  async (platform) => {
    const f = fixture({ enterCredential: true })
    await Effect.runPromise(f.run({ ...f.options, platform }))
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
  await Effect.runPromise(f.run())
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
  await Effect.runPromise(f.run())
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
  await Effect.runPromise(f.run({ ...f.options, host: "codex", fields: profileFields("codex", new Map()) }))
  expect(f.output.join("")).toContain("Next: approve native trust")
  expect(f.output.join("")).toContain("trust: unknown")
  expect(f.output.join("")).not.toContain("profile: ready")
  expect(f.output.join("")).toContain("Next: restart Codex, complete native repository and hook trust")
  expect(f.exits).toEqual([])
})

it("propagates activation failure before starting the doctor", async () => {
  const f = fixture({ activation: Effect.fail(new Error("activation unavailable")) })
  await expect(Effect.runPromise(f.run())).rejects.toThrow("activation unavailable")
  expect(f.events).toEqual(["activate"])
})

it("carries new-key through preview and approved interactive setup", async () => {
  const f = fixture()
  await Effect.runPromise(f.run({ ...f.options, newKey: true }))
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
  await Effect.runPromise(f.run())
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
  await Effect.runPromise(f.run())
  expect(f.output.join("")).toContain("[OK] Installation:")
  expect(f.output.join("")).toContain("[WARN] Credential:")
  expect(f.output.join("")).toContain("[WARN] Setup incomplete:")
  expect(f.output.join("")).not.toContain("[OK] Setup:")
  expect(f.events).toEqual(["activate"])
  expect(f.exits).toEqual([6])
})

it("names Pi in setup and next actions rather than labeling it as Codex", async () => {
  const f = fixture()
  await Effect.runPromise(f.run({ ...f.options, host: "pi", fields: profileFields("pi", new Map()) }))
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
  await Effect.runPromise(f.run())
  const output = f.output.join("")
  expect(output).toContain("The newly saved key is not active")
  expect(output).not.toContain("Selected key source:")
})

const withRules = (result: Result): Result => ({
  ...result,
  actions: [
    ...result.actions,
    {
      stage: "rules",
      code: "approve-default-rules",
      action: "connect editable rules",
      authorization: { rulesProposalDigest: "rules-current" }
    }
  ]
})
it("requires separate current hook and default-rules approvals before passing either digest", async () => {
  const f = fixture({
    results: [Effect.succeed(withRules(approvalResult("approve-installation"))), Effect.succeed(complete)],
    script: [
      { kind: "confirm", line: "y" },
      { kind: "confirm", line: "y" }
    ]
  })
  await Effect.runPromise(f.run())
  expect(f.ports.run.mock.calls[1]?.[0]).toMatchObject({
    installProposalDigest: "a".repeat(64),
    rulesProposalDigest: "rules-current"
  })
  expect(f.scripted?.remaining()).toBe(0)
  expect(f.scripted?.transcript.join("\n")).toContain("Rules preview")
})
it("declining default rules does not apply a previously approved hook proposal", async () => {
  const f = fixture({
    results: [Effect.succeed(withRules(approvalResult("approve-installation")))],
    script: [
      { kind: "confirm", line: "y" },
      { kind: "confirm", line: "n" }
    ]
  })
  await Effect.runPromise(f.run())
  expect(f.ports.run).toHaveBeenCalledOnce()
  expect(f.events).toEqual([])
})
it("Back from rules reloads current proposals and invalidates prior hook consent", async () => {
  const first = withRules(approvalResult("approve-installation"))
  const changed: Result = {
    ...first,
    actions: first.actions.map((item) =>
      item.code === "approve-installation"
        ? { ...item, authorization: { installProposalDigest: "changed-hooks" } }
        : item
    )
  }
  const f = fixture({
    results: [Effect.succeed(first), Effect.succeed(changed), Effect.succeed(complete)],
    script: [
      { kind: "confirm", line: "y" },
      { kind: "back" },
      { kind: "confirm", line: "y" },
      { kind: "confirm", line: "y" }
    ]
  })
  await Effect.runPromise(f.run())
  expect(f.ports.run.mock.calls[1]?.[0].interactive).toBeUndefined()
  expect(f.ports.run.mock.calls[2]?.[0].installProposalDigest).toBe("changed-hooks")
})
it.each(["back", "exit", "eof"] as const)("first approval %s ends input without owner writes", async (kind) => {
  const f = fixture({ results: [Effect.succeed(approvalResult("approve-installation"))], script: [{ kind }] })
  const outcome = await Effect.runPromise(f.run())
  expect(outcome.kind).toBe(kind === "back" ? "back" : "cancelled")
  expect(outcome.model.observations).toHaveLength(1)
  expect(f.ports.run).toHaveBeenCalledOnce()
})
it("verification cancellation preserves completed setup but does not run doctor or another input", async () => {
  const f = fixture({ verificationCancelled: true })
  const outcome = await Effect.runPromise(f.run())
  expect(outcome.kind).toBe("cancelled")
  expect(outcome.model.activation).toBe("completed")
  expect(outcome.model.observations.at(-1)?.stages).toContainEqual({ stage: "installation", status: "complete" })
  expect(f.events).toEqual(["activate", "verify"])
})
it.each(["complete", "partial"] as const)(
  "hidden cancellation activates observed %s installation and ends before verification",
  async (installation) => {
    const cancelled: Result = {
      ...complete,
      status: installation === "partial" ? "partial" : "completed",
      stages: complete.stages.map((item) =>
        item.stage === "credential"
          ? { ...item, status: "pending", observed: { status: "cancelled" } }
          : item.stage === "installation"
            ? { ...item, status: installation }
            : item
      )
    }
    const f = fixture({ results: [Effect.succeed(complete), Effect.succeed(cancelled)] })
    const outcome = await Effect.runPromise(f.run())
    expect(outcome.kind).toBe("cancelled")
    expect(outcome.model.observations.at(-1)?.credential?.status).toBe("cancelled")
    expect(f.events).toEqual(["activate"])
    expect(outcome.model.activation).toBe("completed")
  }
)
it("retains completed stages and distinct failed activation in the safe transition model", async () => {
  const f = fixture({ activation: Effect.fail(new Error("activation failed")) })
  await expect(Effect.runPromise(f.run())).rejects.toThrow("activation failed")
  expect(f.transitions.at(-1)?.after.activation).toBe("failed")
  expect(f.transitions.at(-1)?.after.observations.at(-1)?.stages).toContainEqual({
    stage: "installation",
    status: "complete"
  })
  expect(f.output.join("")).toContain("Previously observed changes remain")
})
it("excludes raw owner payloads and credentials from safe models and transitions", async () => {
  const raw = {
    ...complete,
    stages: complete.stages.map((item) => ({
      ...item,
      observed: { value: "private-key", payload: "raw-provider-body" }
    }))
  }
  const f = fixture({ results: [Effect.succeed(raw), Effect.succeed(raw)] })
  const outcome = await Effect.runPromise(f.run())
  expect(JSON.stringify({ outcome, transitions: f.transitions, output: f.output })).not.toMatch(
    /private-key|raw-provider-body/
  )
})
it("ignores stale approvals and repeated owner completions without replaying commands", async () => {
  const f = fixture({ results: [Effect.succeed(approvalResult("approve-installation"))], script: [{ kind: "exit" }] })
  await Effect.runPromise(f.run())
  const preview = f.transitions[0]!
  expect(reduceSetup(preview.after, preview.event)).toBe(preview.after)
  expect(
    reduceSetup(preview.after, { revision: 0, action: { kind: "approveHooks", digest: "a".repeat(64), yes: true } })
  ).toBe(preview.after)
  expect(
    reduceSetup(preview.after, {
      revision: preview.after.revision,
      action: { kind: "approveHooks", digest: "old", yes: true }
    })
  ).toBe(preview.after)
  expect(
    reduceSetup(initialSetup(), {
      revision: 0,
      action: {
        kind: "previewed",
        commandId: 999,
        observation:
          preview.event.action.kind === "previewed"
            ? preview.event.action.observation
            : { status: "unused", stages: [] }
      }
    })
  ).toEqual(initialSetup())
})
it("strips unattended authorization from explicitly interactive setup's initial preview", async () => {
  const f = fixture()
  await Effect.runPromise(
    f.run({
      ...f.options,
      request: {
        version: 1,
        operation: "setup",
        host: "claude",
        scope: { cwd: "/repo", review: "enabled" },
        credential: "saved",
        interactive: true,
        installProposalDigest: "unattended",
        rulesProposalDigest: "unattended"
      }
    })
  )
  expect(f.ports.run.mock.calls[0]?.[0]).not.toHaveProperty("installProposalDigest")
  expect(f.ports.run.mock.calls[0]?.[0]).not.toHaveProperty("rulesProposalDigest")
  expect(f.ports.run.mock.calls[0]?.[0]).not.toHaveProperty("interactive")
})

it.each(["busy", "indeterminate"] as const)(
  "preserves installation %s without activation or verification",
  async (status) => {
    const result: Result = {
      ...complete,
      status,
      stages: complete.stages.map((item) => (item.stage === "installation" ? { ...item, status } : item))
    }
    const f = fixture({ results: [Effect.succeed(complete), Effect.succeed(result)] })
    const outcome = await Effect.runPromise(f.run())
    expect(outcome.kind).toBe("completed")
    expect(outcome.exitCode).toBe(6)
    expect(outcome.model.observations.at(-1)?.status).toBe(status)
    expect(outcome.model.observations.at(-1)?.stages).toContainEqual({ stage: "installation", status })
    expect(f.events).toEqual([])
  }
)
it("reports a failed capture as incomplete rather than cancellation and retains installation", async () => {
  const failed: Result = {
    ...complete,
    stages: complete.stages.map((item) =>
      item.stage === "credential" ? { ...item, status: "pending", observed: { status: "failed" } } : item
    )
  }
  const f = fixture({ results: [Effect.succeed(complete), Effect.succeed(failed)] })
  const outcome = await Effect.runPromise(f.run())
  expect(outcome.kind).toBe("completed")
  expect(outcome.exitCode).toBe(6)
  expect(outcome.model.observations.at(-1)?.credential?.status).toBe("failed")
  expect(outcome.model.observations.at(-1)?.stages).toContainEqual({ stage: "installation", status: "complete" })
  expect(f.events).toEqual(["activate"])
})
it("stale rules authorization reloads the preview and requires both consents again", async () => {
  const first = withRules(approvalResult("approve-installation"))
  const f = fixture({
    results: [
      Effect.succeed(first),
      Effect.fail(
        new ConfigurationError({
          source: "/controlled",
          field: "rulesProposalDigest",
          reason: "default rules plan is stale; preview again before applying"
        })
      ),
      Effect.succeed(first),
      Effect.succeed(complete)
    ],
    script: [
      { kind: "confirm", line: "y" },
      { kind: "confirm", line: "y" },
      { kind: "confirm", line: "y" },
      { kind: "confirm", line: "y" }
    ]
  })
  await Effect.runPromise(f.run())
  expect(f.ports.run.mock.calls.map((call) => call[0].interactive)).toEqual([undefined, true, undefined, true])
  expect(f.scripted?.remaining()).toBe(0)
  expect(f.events).toEqual(["activate", "verify", "doctor"])
})

it("keeps a partial default-rules write incomplete even when hooks and credentials are ready", async () => {
  const partial: Result = {
    ...complete,
    status: "partial",
    stages: [...complete.stages, { stage: "rules", status: "partial", summary: "default rules application stopped" }]
  }
  const f = fixture({ results: [Effect.succeed(complete), Effect.succeed(partial)] })
  const outcome = await Effect.runPromise(f.run())
  expect(outcome.exitCode).toBe(5)
  expect(outcome.model.observations.at(-1)?.stages).toContainEqual({ stage: "rules", status: "partial" })
  expect(f.events).toEqual(["activate"])
  expect(f.output.join("")).toContain("Setup incomplete")
  expect(f.output.join("")).toContain("[WARN] Rules: default rules application stopped.")
})

it("retains observed installation when the owner is interrupted before returning its final result", async () => {
  const f = fixture()
  f.ports.run.mockImplementation((request, _entered, progress) =>
    request.interactive
      ? progress({
          stages: [
            {
              stage: "installation",
              status: "complete",
              summary: "hooks installed",
              observed: { value: "private-key" }
            }
          ]
        }).pipe(Effect.andThen(Effect.interrupt))
      : Effect.succeed(complete)
  )
  const exit = await Effect.runPromiseExit(f.run())
  expect(exit._tag).toBe("Failure")
  const latest = f.transitions.at(-1)!
  expect(latest.event.action.kind).toBe("progressed")
  expect(latest.after.observations.at(-1)?.stages).toEqual([{ stage: "installation", status: "complete" }])
  expect(latest.before.revision).toBe(latest.after.revision)
  expect(f.output.join("")).toContain("installation=complete")
  expect(f.events).toEqual([])
  expect(JSON.stringify(f.transitions)).not.toContain("private-key")
  expect(reduceSetup(latest.after, latest.event)).toBe(latest.after)
  if (latest.event.action.kind === "progressed") {
    expect(
      reduceSetup(latest.after, { ...latest.event, action: { ...latest.event.action, commandId: 999, sequence: 2 } })
    ).toBe(latest.after)
  }
})
it("progress observations cannot supply consent and ordered completion runs once", async () => {
  const f = fixture()
  f.ports.run.mockImplementation((request, _entered, progress) =>
    request.interactive
      ? Effect.gen(function* () {
          yield* progress({ stages: [{ stage: "installation", status: "complete", summary: "hooks installed" }] })
          yield* progress({ stages: complete.stages })
          return complete
        })
      : Effect.succeed(complete)
  )
  const outcome = await Effect.runPromise(f.run())
  const progress = f.transitions.filter((item) => item.event.action.kind === "progressed")
  expect(progress.map((item) => item.after.progressSequence)).toEqual([1, 2])
  expect(progress.every((item) => item.before.revision === item.after.revision)).toBe(true)
  expect(outcome.model.installApproved).toBeUndefined()
  expect(outcome.model.rulesApproved).toBeUndefined()
  expect(f.events).toEqual(["activate", "verify", "doctor"])
})
