import { it, expect } from "@effect/vitest"
import { Deferred, Effect, Fiber } from "effect"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import {
  LoginOwnerService,
  runLoginConversation,
  type LoginTransition
} from "@hapsland/administration/credentials/login-conversation"
import { initialLogin, reduceLogin } from "@hapsland/administration/credentials/login-model"
import type { CredentialOwner } from "@hapsland/credential-storage/credentials/owner"
import { makeInitialCredentialState } from "@hapsland/runtime-inputs/credentials/state"
import { scriptedInteraction, type ScriptStep } from "../../scripts/test-support/scripted-interaction.ts"

const proposal = {
  id: "owner-proposal",
  availability: "available" as const,
  plan: {
    destination: "user" as const,
    target: "/controlled/user/.env",
    scope: "user",
    storage: "Local plaintext file"
  },
  reason: undefined,
  activeSource: "environment" as const,
  activeFile: undefined
}
const stored = {
  status: "stored" as const,
  state: { ...makeInitialCredentialState(), generation: 1 },
  stateLock: "acquired" as const
}

it.effect("entry requires a separate decline-default confirmation and reports saved versus active sources", () =>
  Effect.gen(function* () {
    const script = scriptedInteraction([
      { kind: "choose", index: 0 },
      { kind: "hidden", value: "private-guided-key" },
      { kind: "confirm", line: "y" }
    ])
    const transitions: LoginTransition[] = []
    let saves = 0
    const owner: CredentialOwner = {
      prepare: (destination) => {
        expect(destination).toBe("user")
        return Effect.succeed(proposal)
      },
      save: (id, value) =>
        Effect.sync(() => {
          expect(id).toBe(proposal.id)
          expect(value).toBe("private-guided-key")
          saves++
          return stored
        }),
      active: () => Effect.succeed({ status: "present", source: "environment", generation: 1 }),
      discard: () => Effect.void
    }
    const model = yield* runLoginConversation({
      observe: (transition) =>
        Effect.sync(() => {
          transitions.push(transition)
        })
    }).pipe(
      Effect.provideService(LoginOwnerService, owner),
      Effect.provideService(InteractionService, script.interaction)
    )
    expect(model.storage?.status).toBe("stored")
    expect(model.active?.source).toBe("environment")
    expect(saves).toBe(1)
    expect(script.remaining()).toBe(0)
    expect(script.transcript.join("\n")).toContain("/controlled/user/.env")
    expect(JSON.stringify({ transitions, model, transcript: script.transcript })).not.toContain("private-guided-key")
  })
)

it.effect.each(["", "yes", "n"])("confirmation %s preserves the previous key", (line) =>
  Effect.gen(function* () {
    const script = scriptedInteraction([
      { kind: "choose", index: 0 },
      { kind: "hidden", value: "discard-fixture" },
      { kind: "confirm", line }
    ])
    let saves = 0
    const model = yield* runLoginConversation().pipe(
      Effect.provideService(InteractionService, script.interaction),
      Effect.provideService(LoginOwnerService, {
        prepare: () => Effect.succeed(proposal),
        save: () =>
          Effect.sync(() => {
            saves++
            return stored
          }),
        active: () => Effect.succeed({ status: "present", source: "user", generation: 1 }),
        discard: () => Effect.void
      })
    )
    expect(model.phase).toBe("Cancelled")
    expect(saves).toBe(0)
  })
)

it.effect("Back discards input and stale replacement requires a fresh preview, entry and approval", () =>
  Effect.gen(function* () {
    const steps: ScriptStep[] = [
      { kind: "choose", index: 0 },
      { kind: "hidden", value: "discarded" },
      { kind: "back" },
      { kind: "choose", index: 0 },
      { kind: "hidden", value: "stale-input" },
      { kind: "confirm", line: "y" },
      { kind: "hidden", value: "fresh-input" },
      { kind: "confirm", line: "y" }
    ]
    const script = scriptedInteraction(steps)
    const values: string[] = []
    let prepares = 0
    const discarded: string[] = []
    const model = yield* runLoginConversation().pipe(
      Effect.provideService(InteractionService, script.interaction),
      Effect.provideService(LoginOwnerService, {
        prepare: () => Effect.sync(() => ({ ...proposal, id: `proposal-${++prepares}` })),
        save: (id, value) =>
          Effect.sync(() => {
            values.push(value)
            expect(id).toBe(`proposal-${prepares}`)
            return values.length === 1 ? { ...stored, status: "stale" as const } : stored
          }),
        active: () => Effect.succeed({ status: "present", source: "user", generation: 1 }),
        discard: (id) =>
          Effect.sync(() => {
            discarded.push(id)
          })
      })
    )
    expect(values).toEqual(["stale-input", "fresh-input"])
    expect(discarded).toContain("proposal-1")
    expect(prepares).toBe(3)
    expect(model.storage?.status).toBe("stored")
    expect(script.remaining()).toBe(0)
  })
)

it("the reducer rejects approval for another owner proposal and stale completions", () => {
  const initial = initialLogin()
  const selected = reduceLogin(initial, { revision: 0, action: { kind: "selected", destination: "user" } })
  const entering = reduceLogin(selected, { revision: 1, action: { kind: "prepared", commandId: 1, proposal } })
  const confirming = reduceLogin(entering, {
    revision: 2,
    action: { kind: "entered", commandId: 2, proposalId: proposal.id }
  })
  expect(reduceLogin(confirming, { revision: 3, action: { kind: "approved", yes: true, proposalId: "foreign" } })).toBe(
    confirming
  )
  expect(
    reduceLogin(confirming, { revision: 2, action: { kind: "approved", yes: true, proposalId: proposal.id } })
  ).toBe(confirming)
})

it.effect("interruption after mutation starts retains the known completed storage observation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>()
      const finish = yield* Deferred.make<void>()
      const script = scriptedInteraction([
        { kind: "choose", index: 0 },
        { kind: "hidden", value: "private" },
        { kind: "confirm", line: "y" }
      ])
      const transitions: LoginTransition[] = []
      const fiber = yield* runLoginConversation({
        observe: (transition) =>
          Effect.sync(() => {
            transitions.push(transition)
          })
      }).pipe(
        Effect.provideService(InteractionService, script.interaction),
        Effect.provideService(LoginOwnerService, {
          prepare: () => Effect.succeed(proposal),
          save: () =>
            Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(finish)), Effect.as(stored)),
          active: () => Effect.succeed({ status: "present", source: "user", generation: 1 }),
          discard: () => Effect.void
        }),
        Effect.forkScoped
      )
      yield* Deferred.await(entered)
      const interrupt = yield* Fiber.interrupt(fiber).pipe(Effect.forkScoped)
      yield* Effect.yieldNow
      yield* Deferred.succeed(finish, undefined)
      yield* Fiber.join(interrupt)
      expect(transitions.at(-1)?.after.storage?.status).toBe("stored")
      expect(transitions.some((transition) => transition.after.phase === "Cancelled")).toBe(false)
    })
  )
)

it("native callback fences preserve identity and reset drops every prior payload", () => {
  const model = {
    phase: "EnteringKey" as const,
    revision: 7,
    destination: "user" as const,
    proposal,
    storage: stored,
    active: { status: "present" as const, source: "user" as const, generation: 1 }
  }
  expect(reduceLogin(model, { revision: 7, action: { kind: "entered", commandId: 6, proposalId: proposal.id } })).toBe(
    model
  )
  expect(reduceLogin(model, { revision: 7, action: { kind: "back" } })).toEqual({
    phase: "SelectingDestination",
    revision: 8
  })
  const missing = { phase: "ConfirmingSave" as const, revision: 7 }
  expect(reduceLogin(missing, { revision: 7, action: { kind: "approved", proposalId: proposal.id, yes: true } })).toBe(
    missing
  )
})

it("stale saving preserves prior payloads while active completion patches only its observation", () => {
  const saving = { phase: "SavingKey" as const, revision: 7, destination: "user" as const, proposal, storage: stored }
  expect(reduceLogin(saving, { revision: 7, action: { kind: "exit" } })).toBe(saving)
  const stale = reduceLogin(saving, {
    revision: 7,
    action: { kind: "observed", commandId: 7, storage: { ...stored, status: "stale" } }
  })
  expect(stale).toEqual({ ...saving, phase: "PreparingTarget", revision: 8 })
  expect(stale.proposal).toBe(proposal)
  expect(stale.storage).toBe(stored)
  const checking = { ...saving, phase: "CheckingActive" as const }
  expect(reduceLogin(checking, { revision: 7, action: { kind: "exit" } })).toBe(checking)
  const active = { status: "present" as const, source: "user" as const, generation: 1 }
  const done = reduceLogin(checking, { revision: 7, action: { kind: "active", commandId: 7, active } })
  expect(done).toEqual({ ...checking, phase: "Done", revision: 8, active })
  expect(done.active).toBe(active)
  expect(reduceLogin(done, { revision: 8, action: { kind: "back" } })).toBe(done)
})
