import { it, expect } from "@effect/vitest"
import { Effect, Terminal } from "effect"
import {
  DirectLoginOwnerService,
  runDirectCredentialInput,
  type DirectLoginTransition
} from "@hapsland/administration/credentials/direct-input"
import { MaskedInputError } from "@hapsland/administration/credentials/masked-input-error"
import { initialLogin, reduceLogin } from "@hapsland/administration/credentials/direct-login-model"
import { makeInitialCredentialState } from "@hapsland/runtime-inputs/credentials/state"
import type { CredentialLifecycleResult } from "@hapsland/credential-storage/credentials/owner"

const stored: CredentialLifecycleResult = {
  status: "stored",
  state: { ...makeInitialCredentialState(), generation: 8 },
  stateLock: "acquired"
}

it.effect("login checks availability before input and saves once without putting the key in transitions", () =>
  Effect.gen(function* () {
    const calls: string[] = []
    const transitions: DirectLoginTransition[] = []
    const key = "controlled-private-login-key"
    const result = yield* runDirectCredentialInput({
      input: Effect.sync(() => {
        calls.push("input")
        return key
      }),
      inputKind: "stdin",
      observe: (transition) =>
        Effect.sync(() => {
          transitions.push(transition)
        })
    }).pipe(
      Effect.provideService(DirectLoginOwnerService, {
        probe: Effect.sync(() => {
          calls.push("probe")
          return "available" as const
        }),
        save: (value) =>
          Effect.sync(() => {
            expect(value).toBe(key)
            calls.push("save")
            return stored
          })
      })
    )
    expect(calls).toEqual(["probe", "input", "save"])
    expect(result.outcome).toEqual({ kind: "observed", result: stored })
    expect(result.model.storage).toEqual({ status: "stored", generation: 8, stateLock: "acquired", savedUse: "active" })
    expect(JSON.stringify(transitions)).not.toContain(key)
    expect(JSON.stringify(result.model)).not.toContain(key)
  })
)

it.effect.each(["locked", "interaction-required", "unavailable"] as const)(
  "an unavailable native store (%s) never requests input or saves",
  (status) =>
    Effect.gen(function* () {
      let inputs = 0
      let saves = 0
      const result = yield* runDirectCredentialInput({
        input: Effect.sync(() => {
          inputs++
          return "unused"
        }),
        inputKind: "stdin"
      }).pipe(
        Effect.provideService(DirectLoginOwnerService, {
          probe: Effect.succeed(status),
          save: () =>
            Effect.sync(() => {
              saves++
              return stored
            })
        })
      )
      expect(result.outcome).toEqual({ kind: "unavailable", status })
      expect(inputs).toBe(0)
      expect(saves).toBe(0)
    })
)

it.effect.each([
  new Terminal.QuitError({}),
  new MaskedInputError({ message: "credential input cancelled", reason: "cancelled" })
])("hidden cancellation preserves the previous credential by never calling its mutation owner", (failure) =>
  Effect.gen(function* () {
    let saves = 0
    const result = yield* runDirectCredentialInput({ input: Effect.fail(failure), inputKind: "stdin" }).pipe(
      Effect.provideService(DirectLoginOwnerService, {
        probe: Effect.succeed("available" as const),
        save: () =>
          Effect.sync(() => {
            saves++
            return stored
          })
      })
    )
    expect(result.model.phase).toBe("Cancelled")
    expect(result.outcome.kind).toBe("cancelled")
    expect(saves).toBe(0)
  })
)

it.effect.each(["busy", "indeterminate"] as const)("login retains the owner's %s result", (status) =>
  Effect.gen(function* () {
    const observed: CredentialLifecycleResult = {
      status,
      state: { ...makeInitialCredentialState(), generation: 3, savedUseSuspended: true },
      stateLock: status === "busy" ? "busy" : "acquired"
    }
    const result = yield* runDirectCredentialInput({ input: Effect.succeed("private"), inputKind: "stdin" }).pipe(
      Effect.provideService(DirectLoginOwnerService, {
        probe: Effect.succeed("available" as const),
        save: () => Effect.succeed(observed)
      })
    )
    expect(result.outcome).toEqual({ kind: "observed", result: observed })
    expect(result.model.storage?.status).toBe(status)
    expect(result.model.storage?.savedUse).toBe("suspended")
    expect(reduceLogin(result.model, { revision: result.model.revision, action: { kind: "exit" } })).toBe(result.model)
  })
)

it.effect("a storage owner failure propagates without becoming input cancellation or a fabricated storage result", () =>
  Effect.gen(function* () {
    const transitions: DirectLoginTransition[] = []
    const failure = new Error("controlled storage failure")
    const result = yield* runDirectCredentialInput({
      input: Effect.succeed("private"),
      inputKind: "stdin",
      observe: (transition) =>
        Effect.sync(() => {
          transitions.push(transition)
        })
    }).pipe(
      Effect.provideService(DirectLoginOwnerService, {
        probe: Effect.succeed("available" as const),
        save: () => Effect.fail(failure)
      }),
      Effect.result
    )
    expect(result._tag).toBe("Failure")
    expect(transitions.at(-1)?.after.phase).toBe("SavingKey")
    expect(transitions.at(-1)?.after.storage).toBeUndefined()
    expect(transitions.some((transition) => transition.after.phase === "Cancelled")).toBe(false)
    expect(JSON.stringify(transitions)).not.toContain(failure.message)
  })
)

it("login rejects stale and foreign completions and does not abandon an in-flight save", () => {
  const initial = initialLogin("stdin")
  expect(reduceLogin(initial, { revision: 1, action: { kind: "checked", commandId: 0, status: "available" } })).toBe(
    initial
  )
  expect(reduceLogin(initial, { revision: 0, action: { kind: "checked", commandId: 1, status: "available" } })).toBe(
    initial
  )
  const entering = reduceLogin(initial, { revision: 0, action: { kind: "checked", commandId: 0, status: "available" } })
  const saving = reduceLogin(entering, { revision: 1, action: { kind: "entered", commandId: 1 } })
  expect(saving.phase).toBe("SavingKey")
  expect(reduceLogin(saving, { revision: 2, action: { kind: "exit" } })).toBe(saving)
  expect(reduceLogin(saving, { revision: 2, action: { kind: "entered", commandId: 2 } })).toBe(saving)
  expect(reduceLogin(saving, { revision: 1, action: { kind: "input-ended", commandId: 1 } })).toBe(saving)
})

it.effect.each([
  new MaskedInputError({ message: "credential input is too long", reason: "invalid" }),
  new Error("controlled stdin read failure")
])("input errors propagate instead of being described as cancellation", (failure) =>
  Effect.gen(function* () {
    let saves = 0
    const transitions: DirectLoginTransition[] = []
    const result = yield* runDirectCredentialInput({
      input: Effect.fail(failure),
      inputKind: "stdin",
      observe: (transition) =>
        Effect.sync(() => {
          transitions.push(transition)
        })
    }).pipe(
      Effect.provideService(DirectLoginOwnerService, {
        probe: Effect.succeed("available" as const),
        save: () =>
          Effect.sync(() => {
            saves++
            return stored
          })
      }),
      Effect.result
    )
    expect(result._tag).toBe("Failure")
    expect(saves).toBe(0)
    expect(transitions.at(-1)?.after.phase).toBe("EnteringKey")
    expect(transitions.some((transition) => transition.after.phase === "Cancelled")).toBe(false)
  })
)
