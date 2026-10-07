import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runtimeClockCommand } from "./check-runtime-clock.mjs"

test("clock witness invokes the declared installed hook launcher and preserves explicit historical CLI role", () => {
  const prefix = mkdtempSync(join(tmpdir(), "clock-command-"))
  try {
    const root = join(prefix, "node_modules/@hapsland/hapsland")
    const binaries = join(root, "dist/bin", `${process.platform}-${process.arch}`)
    mkdirSync(binaries, { recursive: true })
    mkdirSync(join(root, "bin"))
    mkdirSync(join(prefix, "node_modules/.bin"), { recursive: true })
    writeFileSync(
      join(root, "bin/launch.sh"),
      '#!/bin/sh\n[ "$1" = "--pi-hook" ] || exit 2\nprintf "%s" "${0##*/}"\n',
      { mode: 0o755 }
    )
    for (const name of ["hapsland", "hapsland-hook", "hapsland-resident"]) {
      writeFileSync(join(binaries, name), name)
      symlinkSync(join(root, "bin/launch.sh"), join(prefix, "node_modules/.bin", name))
    }
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ bin: { hapsland: "bin/launch.sh", "hapsland-hook": "bin/launch.sh" } })
    )
    writeFileSync(join(root, "package-runtime.json"), JSON.stringify({ runtime: { name: "bun" } }))
    for (const [hookRole, expected] of [
      ["hook", "hapsland-hook"],
      ["cli", "hapsland"]
    ]) {
      const command = runtimeClockCommand({ prefix, hookRole })
      const result = spawnSync(command.executable, command.args, { encoding: "utf8" })
      assert.equal(result.status, 0)
      assert.equal(result.stdout, expected)
    }
    assert.throws(() => runtimeClockCommand({ prefix }), /hookRole/)
    rmSync(join(binaries, "hapsland-hook"))
    assert.throws(() => runtimeClockCommand({ prefix, hookRole: "hook" }), /ENOENT/)
  } finally {
    rmSync(prefix, { recursive: true, force: true })
  }
})
