import { ConfigProvider, Effect } from "effect"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it, vi } from "vitest"
import { currentCommand } from "../runtime/package-runtime.ts"
import { dispatchActivePackage } from "./client-lifecycle.ts"

it("keeps the current CLI local and forwards other active packages with the recursion guard", async () => {
  const root = mkdtempSync(join(tmpdir(), "active-package-dispatch-"))
  const directory = join(root, ".local", "share", "hapsland")
  const record = join(directory, "active.json")
  const receipt = join(root, "receipt.json")
  const executable = join(root, "active")
  vi.stubEnv("HOME", root)
  const dispatch = () =>
    Effect.runPromise(
      dispatchActivePackage(["doctor", "codex"]).pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ HAPSLAND_ACTIVE_DISPATCH: "0" })))
      )
    )
  try {
    mkdirSync(directory, { recursive: true })
    writeFileSync(record, JSON.stringify({ version: 1, ...currentCommand() }))
    expect(await dispatch()).toBeUndefined()
    writeFileSync(
      executable,
      `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(receipt)},JSON.stringify({args:process.argv.slice(2),guard:process.env.HAPSLAND_ACTIVE_DISPATCH}));process.exitCode=7;\n`,
      { mode: 0o700 }
    )
    writeFileSync(record, JSON.stringify({ version: 1, executable, args: ["selected"] }))
    expect(await dispatch()).toBe(7)
    expect(JSON.parse(readFileSync(receipt, "utf8"))).toEqual({ args: ["selected", "doctor", "codex"], guard: "1" })
  } finally {
    vi.unstubAllEnvs()
    rmSync(root, { recursive: true, force: true })
  }
})
