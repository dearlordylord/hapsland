import { Deferred, Effect, Fiber } from "effect"
import { expect, it, vi } from "vitest"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  updateClients,
  updateOwnerLayer,
  UpdateOwnerService,
  type UpdateOwner,
  type UpdateTransition
} from "@hapsland/administration/onboarding/update"
import {
  initialUpdate,
  reduceUpdate,
  updateCommand,
  type UpdateScope
} from "@hapsland/administration/onboarding/update-model"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import { scriptedInteraction, type ScriptStep } from "@hapsland/build-tooling/test-support/scripted-interaction"

type Result = Effect.Success<ReturnType<UpdateOwner["preview"]>>
const digest = "a".repeat(64)
const otherDigest = "b".repeat(64)
const preview: Result = { status: "preview", proposal: { digest, changes: ["owned hook"] } }
const fixture = (
  settings: {
    hosts?: UpdateScope[]
    discoveryFailure?: boolean
    previews?: Partial<Record<UpdateScope, Effect.Effect<Result, unknown>>>
    applies?: Partial<Record<UpdateScope, Effect.Effect<Result, unknown>>>
    steps?: ScriptStep[]
    activation?: Effect.Effect<void, unknown>
    target?: Effect.Effect<string, unknown>
  } = {}
) => {
  const script = scriptedInteraction(
    settings.steps ?? [
      { kind: "choose", index: 0 },
      { kind: "confirm", line: "y" }
    ]
  )
  const calls: string[] = []
  const failures: { host: UpdateScope; cause: unknown }[] = []
  const transitions: UpdateTransition[] = []
  const owner: UpdateOwner = {
    discover: Effect.sync(() => {
      calls.push("discover")
      return {
        hosts: settings.hosts ?? ["claude", "codex"],
        failures: settings.discoveryFailure
          ? [{ host: "claude" as const, cause: new Error("registration unreadable") }]
          : []
      }
    }),
    target: Effect.sync(() => {
      calls.push("target")
    }).pipe(Effect.andThen(settings.target ?? Effect.succeed("/verified/hapsland"))),
    preview: vi.fn((_, host: UpdateScope) =>
      Effect.sync(() => {
        calls.push(`preview:${host}`)
      }).pipe(
        Effect.andThen(
          settings.previews?.[host] ??
            Effect.succeed(
              host === "codex" ? { ...preview, proposal: { ...preview.proposal!, digest: otherDigest } } : preview
            )
        )
      )
    ),
    apply: vi.fn((_, host: UpdateScope, approved: string) =>
      Effect.sync(() => {
        calls.push(`apply:${host}:${approved}`)
      }).pipe(Effect.andThen(settings.applies?.[host] ?? Effect.succeed({ status: "updated" })))
    ),
    activate: () =>
      Effect.sync(() => {
        calls.push("activate")
      }).pipe(Effect.andThen(settings.activation ?? Effect.void))
  }
  const conversation = (options: { terminal?: boolean; host?: UpdateScope } = {}) =>
    updateClients({
      terminal: options.terminal ?? true,
      host: options.host,
      reportFailure: (host, cause) =>
        Effect.sync(() => {
          failures.push({ host, cause })
        }),
      observe: (transition) =>
        Effect.sync(() => {
          transitions.push(transition)
        })
    }).pipe(
      Effect.provideService(UpdateOwnerService, owner),
      Effect.provideService(InteractionService, script.interaction)
    )
  const run = (options: { terminal?: boolean; host?: UpdateScope } = {}) => Effect.runPromise(conversation(options))
  return { owner, run, conversation, calls, failures, transitions, script, output: () => script.transcript.join("") }
}
it("derives the current update command only for phases with a valid target", () => {
  const initial = initialUpdate()
  expect(updateCommand(initial)).toEqual({ kind: "discover", id: 0 })
  expect(updateCommand({ ...initial, phase: "Targeting", revision: 1 })).toEqual({ kind: "target", id: 1 })
  const target = { host: "claude" as const, digest }
  expect(updateCommand({ ...initial, phase: "Previewing", revision: 2, agents: [target] })).toEqual({
    kind: "preview",
    id: 2,
    host: "claude"
  })
  expect(updateCommand({ ...initial, phase: "Activating", revision: 3, agents: [target] })).toEqual({
    kind: "activate",
    id: 3,
    host: "claude"
  })
  expect(updateCommand({ ...initial, phase: "Applying", revision: 4, agents: [target] })).toEqual({
    kind: "apply",
    id: 4,
    host: "claude",
    digest
  })
  for (const phase of ["Review", "Approval", "Done", "Cancelled"] as const) {
    expect(updateCommand({ ...initial, phase, agents: [target] })).toBeUndefined()
  }
  expect(updateCommand({ ...initial, phase: "Previewing", agents: [], cursor: 0 })).toBeUndefined()
  expect(updateCommand({ ...initial, phase: "Activating", agents: [], cursor: 0 })).toBeUndefined()
  expect(updateCommand({ ...initial, phase: "Applying", agents: [{ host: "claude" }], cursor: 0 })).toBeUndefined()
})
it("previews every client before grouped approval and forwards each actual digest once", async () => {
  const f = fixture()
  const model = await f.run()
  expect(f.calls).toEqual([
    "discover",
    "target",
    "preview:claude",
    "preview:codex",
    `apply:claude:${digest}`,
    "activate",
    `apply:codex:${otherDigest}`,
    "activate"
  ])
  expect(model.agents.map((agent) => agent.outcome)).toEqual(["updated", "updated"])
  expect(f.transitions.filter((transition) => transition.event.action.kind === "approve")).toHaveLength(1)
  expect(f.script.remaining()).toBe(0)
  expect(f.failures).toEqual([])
})
it("explicit update skips registration discovery", async () => {
  const f = fixture()
  await f.run({ host: "codex" })
  expect(f.calls).not.toContain("discover")
  expect(f.owner.preview).toHaveBeenCalledOnce()
})
it.each([false, true])("no registrations avoid acquiring a target (discovery failure=%s)", async (discoveryFailure) => {
  const f = fixture({ hosts: [], discoveryFailure, steps: [] })
  const model = await f.run()
  expect(f.calls).toEqual(["discover"])
  expect(model.discoveryFailures).toEqual(discoveryFailure ? ["claude"] : [])
  expect(f.output()).toContain(discoveryFailure ? "Resolve the reported discovery errors" : "Run hapsland setup first")
})
it("nonterminal update refuses before discovery", async () => {
  const f = fixture()
  await expect(f.run({ terminal: false })).rejects.toThrow("needs a terminal")
  expect(f.calls).toEqual([])
})
it.each([
  { ...preview, alreadyCurrent: true },
  { status: "preview", proposal: { digest, changes: [] } }
] satisfies Result[])("current preview activates without approval or mutation (%j)", async (result) => {
  const f = fixture({ hosts: ["claude"], previews: { claude: Effect.succeed(result) }, steps: [] })
  const model = await f.run()
  expect(f.calls).toEqual(["discover", "target", "preview:claude", "activate"])
  expect(model.agents[0]).toMatchObject({ outcome: "already current", activation: "complete" })
})
it.each([
  Effect.fail(new Error("preview unavailable")),
  Effect.succeed<Result>({ status: "conflict", proposal: { digest, changes: [] } }),
  Effect.succeed<Result>({ status: "preview" })
])("rejected preview does not prevent updating the other client", async (response) => {
  const f = fixture({ previews: { claude: response } })
  const model = await f.run()
  expect(model.agents.map((agent) => agent.outcome)).toEqual(["failed", "updated"])
  expect(f.failures.map((failure) => failure.host)).toEqual(["claude"])
})
it("non-y approval skips every proposed mutation", async () => {
  const f = fixture({
    steps: [
      { kind: "choose", index: 0 },
      { kind: "confirm", line: "yes" }
    ]
  })
  const model = await f.run()
  expect(f.owner.apply).not.toHaveBeenCalled()
  expect(model.agents.map((agent) => agent.outcome)).toEqual(["skipped", "skipped"])
})
it.each(["updated", "complete", "already-current", "partial", "conflict", "busy", "indeterminate"])(
  "records apply status %s before deciding activation",
  async (status) => {
    const f = fixture({ hosts: ["claude"], applies: { claude: Effect.succeed({ status }) } })
    const model = await f.run()
    expect(model.agents[0]?.outcome).toBe(
      status === "complete"
        ? "updated"
        : status === "already-current"
          ? "already current"
          : status === "conflict"
            ? "failed"
            : status
    )
    expect(f.calls.filter((call) => call === "activate")).toHaveLength(
      ["updated", "complete", "already-current", "partial"].includes(status) ? 1 : 0
    )
    if (status === "partial") expect(String(f.failures[0]?.cause)).toContain("hapsland repair claude")
  }
)
it("recoverable partial preview can be explicitly approved", async () => {
  const f = fixture({ hosts: ["claude"], previews: { claude: Effect.succeed({ ...preview, status: "partial" }) } })
  const model = await f.run()
  expect(model.agents[0]?.outcome).toBe("updated")
})
it("apply failure is independent and does not stop the other approved client", async () => {
  const f = fixture({ applies: { claude: Effect.fail(new Error("apply unavailable")) } })
  const model = await f.run()
  expect(model.agents.map((agent) => agent.outcome)).toEqual(["failed", "updated"])
})
it.each(["current", "partial", "updated"])(
  "activation failure retains the observed %s profile result",
  async (stage) => {
    const failure = new Error("activation unavailable")
    const f = fixture({
      hosts: ["claude"],
      previews: stage === "current" ? { claude: Effect.succeed({ ...preview, alreadyCurrent: true }) } : {},
      applies: { claude: Effect.succeed({ status: stage }) },
      activation: Effect.fail(failure),
      ...(stage === "current" ? { steps: [] } : {})
    })
    const model = await f.run()
    expect(model.agents[0]).toMatchObject({
      outcome: stage === "current" ? "already current" : stage,
      activation: "failed"
    })
    expect(f.failures.at(-1)).toEqual({ host: "claude", cause: failure })
    expect(f.output()).toContain("observed profile result above is retained")
    expect(f.output()).not.toContain("claude update: failed")
  }
)
it.each(["back", "eof", "exit"] as const)(
  "approval %s never writes and retains already-current observations",
  async (kind) => {
    const steps: ScriptStep[] = [
      { kind: "choose", index: 0 },
      { kind },
      ...(kind === "back" ? [{ kind: "exit" } as const] : [])
    ]
    const f = fixture({ previews: { claude: Effect.succeed({ ...preview, alreadyCurrent: true }) }, steps })
    const model = await f.run()
    expect(model.phase).toBe("Cancelled")
    expect(model.agents[0]?.outcome).toBe("already current")
    expect(f.owner.apply).not.toHaveBeenCalled()
  }
)
it("target failure propagates without mutation", async () => {
  const f = fixture({ target: Effect.fail(new Error("target unavailable")) })
  await expect(f.run()).rejects.toThrow("target unavailable")
  expect(f.owner.apply).not.toHaveBeenCalled()
})
it("rejects stale, foreign-host and changed-digest approval events", () => {
  const initial = initialUpdate()
  expect(
    reduceUpdate(initial, {
      revision: 1,
      action: { kind: "discovered", commandId: 0, hosts: ["claude"], failures: [] }
    })
  ).toBe(initial)
  let model = reduceUpdate(initial, {
    revision: 0,
    action: { kind: "discovered", commandId: 0, hosts: ["claude"], failures: [] }
  })
  model = reduceUpdate(model, { revision: 1, action: { kind: "targeted", commandId: 1 } })
  expect(
    reduceUpdate(model, {
      revision: 2,
      action: { kind: "previewed", commandId: 2, host: "codex", result: { kind: "proposal", digest } }
    })
  ).toBe(model)
  model = reduceUpdate(model, {
    revision: 2,
    action: { kind: "previewed", commandId: 2, host: "claude", result: { kind: "proposal", digest } }
  })
  model = reduceUpdate(model, { revision: 3, action: { kind: "continue" } })
  expect(
    reduceUpdate(model, {
      revision: 4,
      action: { kind: "approve", yes: true, proposals: [{ host: "claude", digest: otherDigest }] }
    })
  ).toBe(model)
  model = reduceUpdate(model, {
    revision: 4,
    action: { kind: "approve", yes: true, proposals: [{ host: "claude", digest }] }
  })
  expect(reduceUpdate(model, { revision: 5, action: { kind: "exit" } })).toBe(model)
})

it("interruption while activating retains the already observed mutation and reports no rollback", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const ready = yield* Deferred.make<void>()
        const f = fixture({
          hosts: ["claude"],
          activation: Deferred.succeed(ready, undefined).pipe(Effect.andThen(Effect.never))
        })
        const fiber = yield* Effect.forkChild(f.conversation())
        yield* Deferred.await(ready)
        yield* Fiber.interrupt(fiber)
        expect(f.transitions.at(-1)?.after.phase).toBe("Activating")
        expect(f.transitions.at(-1)?.after.agents[0]?.outcome).toBe("updated")
        expect(f.output()).toContain("claude update: updated")
        expect(f.output()).toContain("No rollback is implied")
      })
    )
  )
})

it("resident-only updates use the grouped preview approval without applying runtime hooks", async () => {
  const f = fixture({ hosts: ["resident"] })
  const model = await f.run()
  expect(model.agents).toMatchObject([{ host: "resident", outcome: "updated" }])
  expect(f.owner.apply).toHaveBeenCalledWith("/verified/hapsland", "resident", digest)
  expect(f.calls).not.toContain("apply:codex:" + digest)
})

it("resident updates use the selected package's public transport and captured environment", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "hapsland-update-transport-"))
  const executable = join(temporary, "hapsland")
  const requests = join(temporary, "requests")
  writeFileSync(
    executable,
    `#!/bin/sh\ncat >> "$UPDATE_FIXTURE_REQUESTS"\nprintf '\\n' >> "$UPDATE_FIXTURE_REQUESTS"\ncase "$1" in\n--update-preview) printf '%s' '{"status":"preview","proposal":{"digest":"${digest}"}}';;\n--update) printf '%s' '{"status":"updated"}';;\n*) exit 23;;\nesac\n`,
    { mode: 0o700 }
  )
  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        const owner = yield* UpdateOwnerService
        expect((yield* owner.preview(executable, "resident")).status).toBe("preview")
        expect((yield* owner.apply(executable, "resident", digest)).status).toBe("updated")
      }).pipe(
        Effect.provide(
          updateOwnerLayer({
            flags: new Map(),
            environment: { ...process.env, UPDATE_FIXTURE_REQUESTS: requests },
            target: Effect.succeed(executable)
          })
        )
      )
    )
    expect(
      readFileSync(requests, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
    ).toEqual([
      { version: 1, operation: "update-preview", host: "resident" },
      { version: 1, operation: "update", host: "resident", proposalDigest: digest }
    ])
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
