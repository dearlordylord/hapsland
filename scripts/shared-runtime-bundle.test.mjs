import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { resolveBunRuntime } from "./pinned-bun.mjs"
import { sharedRuntimeBundle, sharedRuntimeLauncher } from "./shared-runtime-bundle.mjs"

for (const prefix of ["", "#!/usr/bin/env node\n", "#!/usr/bin/env bun\n"])
  test(`shared runtime executes bundled shebang ${JSON.stringify(prefix)} and clears child runtime mode`, (t) => {
    const directory = mkdtempSync(join(tmpdir(), "hapsland-shared-command-"))
    t.after(() => rmSync(directory, { recursive: true, force: true }))
    const file = join(directory, "command.js")
    writeFileSync(
      file,
      sharedRuntimeBundle(
        `${prefix}console.log(JSON.stringify({mode:process.env.BUN_BE_BUN??null,arg:process.argv[2]}))`
      )
    )
    const result = spawnSync(
      resolveBunRuntime().executable,
      ["--no-install", "--no-env-file", "--config=/dev/null", file, "space argument"],
      { env: { ...process.env, BUN_BE_BUN: "1" }, encoding: "utf8", timeout: 5000 }
    )
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), { mode: null, arg: "space argument" })
  })

test("shared launcher does not depend on Bun or Node on PATH and preserves argv", (t) => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "hapsland-shared-launcher-")))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  writeFileSync(join(directory, "hapsland"), '#!/bin/sh\nprintf "%s\\n" "$BUN_BE_BUN" "$@"\n', { mode: 0o755 })
  const launcher = join(directory, "hapsland-hook")
  writeFileSync(launcher, sharedRuntimeLauncher("hapsland-hook"), { mode: 0o755 })
  const result = spawnSync(launcher, ["space argument", "--flag"], {
    encoding: "utf8",
    timeout: 5000,
    env: { PATH: "/usr/bin:/bin" }
  })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.stdout.trim().split("\n"), [
    "1",
    "--no-install",
    "--no-env-file",
    "--config=/dev/null",
    join(directory, "hapsland-hook.js"),
    "space argument",
    "--flag"
  ])
})
