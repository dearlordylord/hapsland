import { readCredentialState } from "@hapsland/runtime-inputs/credentials/state"
import { expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Fiber } from "effect"
import { existsSync, mkdtempSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runSecretServiceProcess } from "@hapsland/credential-storage/credentials/secret-service-process"
import {
  resolveCredential,
  runSecretService,
  saveCredential
} from "@hapsland/credential-storage/credentials/secret-service"

const fixture = (body: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const directory = mkdtempSync(join(tmpdir(), "hapsland-credential-process-"))
      const helper = join(directory, "helper.cjs")
      const pidPath = join(directory, "pid")
      writeFileSync(helper, `#!${process.execPath}\n${body}\n`, { mode: 0o700 })
      return { directory, helper, pidPath }
    }),
    ({ directory }) => Effect.sync(() => rmSync(directory, { recursive: true, force: true }))
  )

const runningPid = (directory: string, pidPath: string) =>
  Effect.callback<number>((resume) => {
    let finished = false
    const read = () => {
      if (finished) return
      try {
        const pid = Number(readFileSync(pidPath, "utf8"))
        if (!Number.isSafeInteger(pid) || pid <= 0) return
        finished = true
        observer.close()
        resume(Effect.succeed(pid))
      } catch {
        /* Creation and write notifications can arrive separately. */
      }
    }
    const observer = watch(directory, read)
    read()
    return Effect.sync(() => observer.close())
  })

const assertClosed = (pid: number) => {
  expect(() => process.kill(pid, 0)).toThrow()
}

it.live("decodes the native header and credential body without trimming", () =>
  Effect.gen(function* () {
    const { helper } = yield* fixture('process.stdout.write(JSON.stringify({status:"present"})+"\\n value ");')
    expect(yield* runSecretServiceProcess(helper, "get", { deadlineMs: 1_500 })).toEqual({
      status: "present",
      value: " value "
    })
  })
)

it.live("maps a failed spawn to a sanitized unavailable result after closure", () =>
  Effect.gen(function* () {
    const { directory } = yield* fixture("")
    expect(yield* runSecretServiceProcess(join(directory, "absent"), "get", { deadlineMs: 1_500 })).toEqual({
      status: "unavailable"
    })
  })
)

it.live("keeps mutation outcomes indeterminate when native output is malformed", () =>
  Effect.gen(function* () {
    const { helper } = yield* fixture('process.stdout.write("not-a-native-header\\n");')
    expect(yield* runSecretServiceProcess(helper, "set", { input: "synthetic", deadlineMs: 1_500 })).toEqual({
      status: "indeterminate"
    })
  })
)

const hangingBody =
  'require("node:fs").writeFileSync(require("node:path").join(__dirname,"pid"),String(process.pid));setInterval(()=>{},1000);'

it.live("timeout returns only after the native helper has physically closed", () =>
  Effect.gen(function* () {
    const { directory, helper, pidPath } = yield* fixture(hangingBody)
    const ready = yield* Effect.forkChild(runningPid(directory, pidPath), { startImmediately: true })
    const running = yield* Effect.forkChild(runSecretServiceProcess(helper, "get", { deadlineMs: 1_500 }), {
      startImmediately: true
    })
    const pid = yield* Fiber.join(ready)
    expect(yield* Fiber.join(running)).toEqual({ status: "timed-out" })
    assertClosed(pid)
  })
)

it.live("fiber interruption waits for physical closure without becoming a success result", () =>
  Effect.gen(function* () {
    const { directory, helper, pidPath } = yield* fixture(hangingBody)
    const ready = yield* Effect.forkChild(runningPid(directory, pidPath), { startImmediately: true })
    const running = yield* Effect.forkChild(runSecretServiceProcess(helper, "get", { deadlineMs: 5_000 }), {
      startImmediately: true
    })
    const pid = yield* Fiber.join(ready)
    yield* Fiber.interrupt(running)
    expect((yield* Fiber.await(running))._tag).toBe("Failure")
    assertClosed(pid)
  })
)

it.live("external abort preserves the cancelled domain result and waits for closure", () =>
  Effect.gen(function* () {
    const { directory, helper, pidPath } = yield* fixture(hangingBody)
    const controller = new AbortController()
    const ready = yield* Effect.forkChild(runningPid(directory, pidPath), { startImmediately: true })
    const running = yield* Effect.forkChild(
      runSecretServiceProcess(helper, "get", { deadlineMs: 5_000, signal: controller.signal }),
      { startImmediately: true }
    )
    const pid = yield* Fiber.join(ready)
    controller.abort()
    expect(yield* Fiber.join(running)).toEqual({ status: "cancelled" })
    assertClosed(pid)
  })
)

it.effect("credential resolution honors the caller provider and explicit hook absence", () =>
  Effect.gen(function* () {
    const { directory } = yield* fixture("")
    const options = { envVar: "FIXTURE_KEY", environmentOnly: true, statePath: join(directory, "state") }
    const provider = ConfigProvider.layer(ConfigProvider.fromUnknown({ FIXTURE_KEY: "synthetic-key" }))
    expect(yield* resolveCredential(options).pipe(Effect.provide(provider))).toEqual({
      status: "present",
      source: "environment",
      value: "synthetic-key",
      generation: 0
    })
    expect(yield* resolveCredential({ ...options, environmentValue: null }).pipe(Effect.provide(provider))).toEqual({
      status: "missing",
      source: "environment",
      generation: 0
    })
  })
)

it.effect("explicitly empty helper and state paths fail without using a default", () =>
  Effect.gen(function* () {
    const { directory, helper } = yield* fixture('process.stdout.write(JSON.stringify({status:"available"})+"\\n");')
    expect(
      yield* runSecretService("probe").pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({ REVIEW_CREDENTIAL_HELPER: "" }, { preserveEmptyStrings: true })
          )
        )
      )
    ).toEqual({ status: "unavailable" })
    expect(
      yield* saveCredential("synthetic-key").pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown(
              { REVIEW_CREDENTIAL_HELPER: helper, REVIEW_CREDENTIAL_STATE_PATH: "" },
              { preserveEmptyStrings: true }
            )
          )
        )
      )
    ).toMatchObject({ status: "unavailable", stateLock: "unavailable" })
    expect(existsSync(join(directory, "state"))).toBe(false)
  })
)

it.live("interrupted save closes the helper before releasing its lock and leaves generation suspended", () =>
  Effect.gen(function* () {
    const { directory, helper, pidPath } = yield* fixture(hangingBody)
    const statePath = join(directory, "state")
    const provider = ConfigProvider.layer(ConfigProvider.fromUnknown({ REVIEW_CREDENTIAL_HELPER: helper }))
    const ready = yield* Effect.forkChild(runningPid(directory, pidPath), { startImmediately: true })
    const saving = yield* Effect.forkChild(saveCredential("synthetic-key", statePath).pipe(Effect.provide(provider)), {
      startImmediately: true
    })
    const pid = yield* Fiber.join(ready)
    expect(existsSync(`${statePath}.lock`)).toBe(true)
    expect(readCredentialState(statePath)).toEqual({ version: 1, generation: 1, savedUseSuspended: true })
    yield* Fiber.interrupt(saving)
    expect((yield* Fiber.await(saving))._tag).toBe("Failure")
    assertClosed(pid)
    expect(existsSync(`${statePath}.lock`)).toBe(false)
    expect(readCredentialState(statePath)).toEqual({ version: 1, generation: 1, savedUseSuspended: true })
  })
)
