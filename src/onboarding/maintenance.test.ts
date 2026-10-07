import { profileFields } from "@hapsland/administration/onboarding/client-command"
import * as Effect from "effect/Effect"
import { expect, it, vi } from "vitest"
import {
  maintainClients,
  MaintenanceOwnerService,
  type MaintenanceOwner,
  type MaintenanceCommand,
  type MaintenanceTransition
} from "@hapsland/administration/onboarding/maintenance"
import { type invokeLifecycle } from "@hapsland/administration/onboarding/client-lifecycle"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import { scriptedInteraction, type ScriptStep } from "../../scripts/test-support/scripted-interaction.ts"
import { reduceMaintenance } from "@hapsland/administration/onboarding/maintenance-model"
import type { SetupClient } from "@hapsland/administration/onboarding/client-selection"

type Result = Effect.Success<ReturnType<typeof invokeLifecycle>>
const digest = "a".repeat(64)
const preview: Result = { status: "preview", proposal: { digest, changes: ["owned hook"] } }
const fixture = (
  options: {
    installed?: boolean
    inspection?: Effect.Effect<unknown, unknown>
    responses?: Array<Effect.Effect<Result, unknown>>
    confirmation?: Effect.Effect<boolean, unknown>
    activation?: Effect.Effect<void, unknown>
    steps?: ScriptStep[]
  } = {}
) => {
  const responses = [...(options.responses ?? [Effect.succeed(preview), Effect.succeed({ status: "complete" })])]
  const activations: string[] = []
  const failures: Array<{ host: SetupClient; cause: unknown }> = []
  const transitions: MaintenanceTransition[] = []
  const script = scriptedInteraction(
    options.steps ?? [
      { kind: "choose", index: 0 },
      { kind: "confirm", line: "y" }
    ]
  )
  const confirm = vi.fn((view: Parameters<typeof script.interaction.confirm>[0]) =>
    options.confirmation
      ? options.confirmation.pipe(
          Effect.orDie,
          Effect.map((yes) => ({ kind: "confirmed" as const, yes }))
        )
      : script.interaction.confirm(view)
  )
  const owner: MaintenanceOwner = {
    discover: Effect.succeed({ hosts: [], failures: [] }),
    fields: (host) => profileFields(host, new Map([[`--${host}-home`, "/selected/profile"]])),
    inspect: () =>
      (options.inspection ?? Effect.succeed({})).pipe(
        Effect.map((inspection) => ({ installed: options.installed ?? false, inspection }))
      ),
    invoke: vi.fn(() => responses.shift() ?? Effect.fail(new Error("unexpected invocation"))),
    activate: Effect.sync(() => activations.push("activate")).pipe(Effect.andThen(options.activation ?? Effect.void))
  }
  const conversation = (
    command: MaintenanceCommand,
    host: SetupClient | undefined,
    terminal = true,
    selectedOwner = owner
  ) =>
    maintainClients(command, {
      terminal,
      host,
      reportFailure: (host, cause) =>
        Effect.sync(() => {
          failures.push({ host, cause })
        }),
      observe: (transition) =>
        Effect.sync(() => {
          transitions.push(transition)
        })
    }).pipe(
      Effect.provideService(MaintenanceOwnerService, selectedOwner),
      Effect.provideService(InteractionService, { ...script.interaction, confirm })
    )
  return {
    owner,
    confirm,
    output: script.transcript,
    activations,
    failures,
    transitions,
    script,
    conversation,
    run: (command: MaintenanceCommand, host: SetupClient | undefined, terminal = true, selectedOwner = owner) =>
      Effect.runPromise(conversation(command, host, terminal, selectedOwner))
  }
}

it.each([
  { command: "repair" as const, host: "codex" as const, installed: true, operation: "install" },
  { command: "repair" as const, host: "claude" as const, installed: true, operation: "update" },
  { command: "repair" as const, host: "claude" as const, installed: false, operation: "install" },
  { command: "reinstall" as const, host: "claude" as const, installed: true, operation: "install" },
  { command: "reinstall" as const, host: "codex" as const, installed: true, operation: "install" },
  { command: "uninstall" as const, host: "codex" as const, installed: true, operation: "uninstall" }
])(
  "previews and applies $command for $host as $operation with the approved digest",
  async ({ command, host, installed, operation }) => {
    const f = fixture({ installed })
    await f.run(command, host)
    const fields = profileFields(host, new Map([[`--${host}-home`, "/selected/profile"]]))
    const reinstall = command === "reinstall" ? { reinstall: true } : {}
    expect(f.owner.invoke).toHaveBeenNthCalledWith(1, host, {
      version: 1,
      ...fields,
      operation: operation === "uninstall" ? operation : `${operation}-preview`,
      ...reinstall
    })
    expect(f.owner.invoke).toHaveBeenNthCalledWith(2, host, {
      version: 1,
      ...fields,
      operation,
      proposalDigest: digest,
      ...reinstall
    })
    expect(f.activations).toHaveLength(operation === "uninstall" ? 0 : 1)
    expect(f.failures).toEqual([])
    expect(f.output.join("")).toContain("User settings and credentials preserved.")
  }
)

it.each(["install", "update", "uninstall"])(
  "repairs an interrupted %s using its retained operation",
  async (operation) => {
    const f = fixture({ inspection: Effect.succeed({ recovery: { operation } }) })
    await f.run("repair", "codex")
    expect(f.owner.invoke).toHaveBeenNthCalledWith(
      2,
      "codex",
      expect.objectContaining({ operation, proposalDigest: digest })
    )
    expect(f.output.join("")).toContain(`Resume interrupted ${operation}`)
  }
)

it("keeps unrecognized recovery metadata out of the requested mutation", async () => {
  const f = fixture({ inspection: Effect.succeed({ recovery: { operation: "other" } }), installed: true })
  await f.run("repair", "claude")
  expect(f.owner.invoke).toHaveBeenNthCalledWith(2, "claude", expect.objectContaining({ operation: "update" }))
})

it.each(["repair", "uninstall"] as const)(
  "stops %s without confirmation when the preview has no changes",
  async (command) => {
    const f = fixture({ responses: [Effect.succeed({ ...preview, proposal: { digest, changes: [] } })] })
    await f.run(command, "codex")
    expect(f.owner.invoke).toHaveBeenCalledTimes(1)
    expect(f.confirm).not.toHaveBeenCalled()
    expect(f.output.join("")).toContain(command === "uninstall" ? "already removed" : "integration intact")
  }
)
it("reports an already removed integration without requesting approval", async () => {
  const f = fixture({ responses: [Effect.succeed({ status: "already-uninstalled" })] })
  await f.run("uninstall", "codex")
  expect(f.confirm).not.toHaveBeenCalled()
  expect(f.output.join("")).toContain("codex uninstall: already removed.")
})
it("honors a declined mutation", async () => {
  const f = fixture({ confirmation: Effect.succeed(false) })
  await f.run("repair", "codex")
  expect(f.owner.invoke).toHaveBeenCalledTimes(1)
  expect(f.output.join("")).toContain("codex repair: skipped.")
  expect(f.activations).toEqual([])
})

it.each(["inspect", "preview", "apply", "activate"] as const)(
  "reports a failed %s and stops the host operation",
  async (stage) => {
    const failure = new Error(stage)
    const f = fixture({
      ...(stage === "inspect" ? { inspection: Effect.fail(failure) } : {}),
      ...(stage === "preview" ? { responses: [Effect.fail(failure)] } : {}),
      ...(stage === "apply" ? { responses: [Effect.succeed(preview), Effect.fail(failure)] } : {}),
      ...(stage === "activate" ? { activation: Effect.fail(failure) } : {})
    })
    await f.run("repair", "codex")
    expect(f.failures).toEqual([{ host: "codex", cause: failure }])
    expect(f.output.join("")).not.toContain("User settings and credentials preserved.")
  }
)

it.each([{ status: "conflict" }, { status: "preview" }])("rejects invalid preview %j", async (response) => {
  const f = fixture({ responses: [Effect.succeed(response)] })
  await f.run("repair", "codex")
  expect(f.failures).toHaveLength(1)
  expect(f.confirm).not.toHaveBeenCalled()
})
it("rejects malformed inspection recovery before invoking a mutation", async () => {
  const f = fixture({ inspection: Effect.succeed({ recovery: { operation: 1 } }) })
  await f.run("repair", "codex")
  expect(f.failures).toHaveLength(1)
  expect(f.owner.invoke).not.toHaveBeenCalled()
})

it.each([
  { command: "repair" as const, status: "partial", activationFailure: false, activations: 1 },
  { command: "repair" as const, status: "partial", activationFailure: true, activations: 1 },
  { command: "uninstall" as const, status: "partial", activationFailure: false, activations: 0 },
  { command: "repair" as const, status: "conflict", activationFailure: false, activations: 0 }
])(
  "retains uncertain $command results without reporting success: $status",
  async ({ command, status, activationFailure, activations }) => {
    const f = fixture({
      responses: [Effect.succeed(preview), Effect.succeed({ status })],
      ...(activationFailure ? { activation: Effect.fail(new Error("activation failed")) } : {})
    })
    await f.run(command, "codex")
    expect(f.activations).toHaveLength(activations)
    expect(f.failures).toHaveLength(activationFailure ? 2 : 1)
    expect(f.output.join("")).not.toContain("User settings and credentials preserved.")
  }
)

it.each(["repair", "reinstall", "uninstall"] as const)(
  "requires a terminal for %s before inspecting profiles",
  async (command) => {
    const f = fixture()
    await expect(f.run(command, undefined, false)).rejects.toThrow("needs a terminal")
    expect(f.owner.invoke).not.toHaveBeenCalled()
  }
)
it.each(["repair", "reinstall", "uninstall"] as const)("handles %s without registrations", async (command) => {
  const f = fixture()
  const model = await Effect.runPromise(f.conversation(command, undefined, true, f.owner).pipe())
  expect(f.activations).toHaveLength(command === "reinstall" ? 1 : 0)
  expect(f.output.join("")).toContain("No Hapsland integrations found")
  expect(model.emptyActivation).toBe(command === "reinstall" ? "complete" : undefined)
})
it("maintains only an explicitly selected host", async () => {
  const f = fixture()
  await f.run("repair", "codex", true, { ...f.owner, discover: Effect.die("must not discover") })
  expect(f.owner.invoke).toHaveBeenNthCalledWith(1, "codex", expect.anything())
})
it("continues to the next registered host after an inspection failure", async () => {
  const f = fixture()
  await Effect.runPromise(
    f.conversation("repair", undefined, true, {
      ...f.owner,
      discover: Effect.succeed({ hosts: ["claude", "codex"], failures: [] }),
      inspect: (fields) =>
        fields.host === "claude" ? Effect.fail(new Error("damaged profile")) : f.owner.inspect(fields)
    })
  )
  expect(f.failures).toHaveLength(1)
  expect(f.failures[0]?.host).toBe("claude")
  expect(f.output.join("")).toContain("[OK] codex integration: restored.")
})
it("propagates input failures without calling them cancellation", async () => {
  const f = fixture({ confirmation: Effect.fail(new Error("input broken")) })
  await expect(f.run("repair", "codex")).rejects.toThrow("input broken")
  expect(f.owner.invoke).toHaveBeenCalledTimes(1)
  expect(f.output.join("")).toContain("No rollback is implied")
})
it.each(["partial", "busy", "indeterminate"])("retains observed %s outcomes", async (status) => {
  const f = fixture({ responses: [Effect.succeed(preview), Effect.succeed({ status })] })
  const model = await f.run("repair", "codex")
  expect(model.agents[0]?.outcome).toBe(status)
  expect(f.activations).toHaveLength(status === "partial" ? 1 : 0)
})
it("keeps an observed mutation when activation fails", async () => {
  const f = fixture({ activation: Effect.fail(new Error("activation broken")) })
  const model = await f.run("repair", "codex")
  expect(model.agents[0]).toMatchObject({ outcome: "restored", activation: "failed" })
})
it.each(["exit", "eof"] as const)(
  "Back followed by %s preserves earlier completion and skips remaining agents",
  async (kind) => {
    const f = fixture({
      responses: [Effect.succeed(preview), Effect.succeed({ status: "complete" }), Effect.succeed(preview)],
      steps: [
        { kind: "choose", index: 0 },
        { kind: "confirm", line: "y" },
        { kind: "choose", index: 0 },
        { kind: "back" },
        { kind }
      ]
    })
    const model = await Effect.runPromise(
      f.conversation("repair", undefined, true, {
        ...f.owner,
        discover: Effect.succeed({ hosts: ["claude", "codex", "pi"], failures: [] })
      })
    )
    expect(model.phase).toBe("Cancelled")
    expect(model.agents.map((agent) => agent.outcome)).toEqual(["restored", "skipped", "skipped"])
    expect(f.owner.invoke).toHaveBeenCalledTimes(3)
    expect(f.script.remaining()).toBe(0)
  }
)
it("rejects stale answers, foreign-host consent, changed digests and duplicate completions", async () => {
  const f = fixture()
  await f.run("repair", "codex")
  const approval = f.transitions.find((t) => t.event.action.kind === "approve")!
  expect(reduceMaintenance(approval.before, { ...approval.event, revision: approval.event.revision - 1 })).toBe(
    approval.before
  )
  expect(
    reduceMaintenance(approval.before, {
      revision: approval.before.revision,
      action: { kind: "approve", host: "claude", digest, yes: true }
    })
  ).toBe(approval.before)
  expect(
    reduceMaintenance(approval.before, {
      revision: approval.before.revision,
      action: { kind: "approve", host: "codex", digest: "b".repeat(64), yes: true }
    })
  ).toBe(approval.before)
  const observed = f.transitions.find((t) => t.event.action.kind === "observed")!
  expect(reduceMaintenance(observed.after, observed.event)).toBe(observed.after)
})
