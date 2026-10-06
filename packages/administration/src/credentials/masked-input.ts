import { Cause, Deferred, Duration, Effect, Schedule, Schema } from "effect"
import { execFileClosedStdin } from "@hapsland/runtime-environment/process/closed-stdin"
import { closeSync, constants, openSync, readSync } from "node:fs"
import { terminalModeArguments } from "./terminal.ts"
import { JEV_KEY_ENTRY_GUIDANCE } from "../onboarding/credential-guidance.ts"
import { JEV_PROVIDER } from "@hapsland/runtime-environment/runtime/backend"

export class MaskedInputError extends Schema.TaggedError<MaskedInputError>()("MaskedInputError", {
  message: Schema.String
}) {}
const unavailable = () =>
  new MaskedInputError({ message: "masked terminal input is unavailable; retry with --credential-stdin" })

const RetryableRead = Schema.Struct({ code: Schema.Literal("EAGAIN") })
const retryableRead = (cause: unknown): boolean => Schema.decodeUnknownOption(RetryableRead)(cause)._tag === "Some"
const terminalMode = Effect.fn("CredentialTerminal.mode")((...args: ReadonlyArray<string>) =>
  execFileClosedStdin("stty", terminalModeArguments(process.platform, ...args), {
    env: process.env,
    timeout: 2_000,
    maxBuffer: 65_536
  })
)

export const readMaskedCredential = Effect.fn("CredentialTerminal.readMasked")(function* () {
  return yield* Effect.acquireUseRelease(
    Effect.try({
      try: () => ({
        descriptor: openSync("/dev/tty", constants.O_RDONLY | constants.O_NONBLOCK),
        mode: "",
        prompted: false,
        value: Buffer.alloc(0),
        handlers: new Map<NodeJS.Signals, () => void>(),
        cancelled: Deferred.makeUnsafe<never, MaskedInputError>()
      }),
      catch: unavailable
    }),
    (owned) =>
      Effect.gen(function* () {
        yield* Effect.sync(() => {
          for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
            const handler = () => {
              Deferred.doneUnsafe(
                owned.cancelled,
                Effect.fail(new MaskedInputError({ message: "credential input cancelled" }))
              )
            }
            owned.handlers.set(signal, handler)
            process.once(signal, handler)
          }
        })
        const original = yield* terminalMode("-g")
        owned.mode = original.succeeded ? original.stdout.trim() : ""
        if (owned.mode.length === 0) return yield* Effect.fail(unavailable())
        const disabled = yield* terminalMode("-echo")
        if (!disabled.succeeded) return yield* Effect.fail(unavailable())
        owned.prompted = true
        yield* Effect.try({
          try: () =>
            process.stderr.write(
              `${JEV_KEY_ENTRY_GUIDANCE}The key will be saved in ${process.platform === "darwin" ? "login Keychain" : "Secret Service (login keyring)"}.\n${JEV_PROVIDER.name} API key: `
            ),
          catch: unavailable
        })
        const cancelled = Deferred.await(owned.cancelled)
        const poll = Effect.fn("CredentialTerminal.poll")(() =>
          Effect.try({
            try: () => {
              const chunk = Buffer.alloc(256)
              try {
                const count = readSync(owned.descriptor, chunk, 0, chunk.length, null)
                if (count === 0) return undefined
                const previous = owned.value
                owned.value = Buffer.concat([previous, chunk.subarray(0, count)])
                previous.fill(0)
                if (owned.value.length > 32_768) throw new MaskedInputError({ message: "credential input is too long" })
                const newline = owned.value.findIndex((byte) => byte === 0x0a || byte === 0x0d)
                return newline < 0 ? undefined : owned.value.subarray(0, newline).toString("utf8")
              } catch (cause) {
                if (retryableRead(cause)) return undefined
                throw cause
              } finally {
                chunk.fill(0)
              }
            },
            catch: (cause) =>
              cause instanceof MaskedInputError
                ? cause
                : new MaskedInputError({ message: "credential input unavailable" })
          })
        )
        const schedule = Schedule.fromStep(
          Effect.succeed((_now: number, value: string | undefined) =>
            value === undefined
              ? Effect.succeed([undefined, Duration.millis(10)] as [string | undefined, Duration.Duration])
              : Cause.done(value)
          )
        )
        const reading = Effect.sleep("10 millis").pipe(Effect.andThen(poll().pipe(Effect.repeat(schedule))))
        const value = yield* Effect.raceFirst(reading, cancelled)
        if (value === undefined) return yield* Effect.fail(unavailable())
        return value
      }),
    (owned) =>
      Effect.gen(function* () {
        for (const [signal, handler] of owned.handlers) process.off(signal, handler)
        owned.value.fill(0)
        const closed = yield* Effect.try({ try: () => closeSync(owned.descriptor), catch: unavailable }).pipe(
          Effect.result
        )
        let restored = true
        if (owned.mode.length > 0) {
          const attempt = Effect.fn("CredentialTerminal.restoreAttempt")(function* () {
            yield* terminalMode(owned.mode)
            const observed = yield* terminalMode("-g")
            return observed.succeeded && observed.stdout.trim() === owned.mode
          })
          const policy = Schedule.fromStep(
            Effect.sync(() => {
              let attempts = 0
              return (_now: number, success: boolean) => {
                attempts += 1
                return success || attempts >= 5
                  ? Cause.done(success)
                  : Effect.succeed([false, Duration.zero] as [boolean, Duration.Duration])
              }
            })
          )
          restored = yield* attempt().pipe(Effect.repeat(policy))
        }
        const newline = owned.prompted
          ? yield* Effect.try({ try: () => process.stderr.write("\n"), catch: unavailable }).pipe(Effect.result)
          : undefined
        if (closed._tag === "Failure" || !restored || newline?._tag === "Failure") {
          return yield* Effect.fail(new MaskedInputError({ message: "credential terminal restoration failed" }))
        }
      })
  )
})
