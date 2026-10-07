import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { spawnSync } from "node:child_process"
import { resolveBunRuntime } from "../pinned-bun.mjs"
import { standaloneEnvironment } from "./standalone-environment.mjs"

test("compiled commands exclude only the owned source preload; source commands retain it", { timeout: 60000 }, () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-compiled-preload-"))
  try {
    const bun = resolveBunRuntime().executable
    const source = join(root, "main.mjs")
    const compiled = join(root, "main")
    const owned = join(root, "source-coverage.mjs")
    const unrelated = join(root, "user-preload.mjs")
    writeFileSync(source, "console.log(globalThis.userPreload)\n")
    writeFileSync(owned, "throw new Error('owned-source-preload-ran')\n")
    writeFileSync(unrelated, "globalThis.userPreload = 'preserved'\n")
    const build = spawnSync(bun, ["build", source, "--compile", "--outfile", compiled], {
      env: { ...process.env, BUN_OPTIONS: "" },
      encoding: "utf8",
      timeout: 15000
    })
    assert.equal(build.status, 0, build.stderr)
    const flag = `--preload=${pathToFileURL(owned).href}`
    const environment = {
      ...process.env,
      BUN_OPTIONS: `--smol --preload=${pathToFileURL(unrelated).href} ${flag}`,
      HAPSLAND_BUN_COVERAGE_PRELOAD_FLAG: flag
    }
    const native = spawnSync(compiled, [], {
      env: standaloneEnvironment(join(root, "path"), environment),
      encoding: "utf8",
      timeout: 10000
    })
    assert.equal(native.status, 0, native.stderr)
    assert.equal(native.stdout.trim(), "preserved")
    const raw = spawnSync(bun, [source], { env: environment, encoding: "utf8", timeout: 10000 })
    assert.notEqual(raw.status, 0)
    assert.match(raw.stderr, /owned-source-preload-ran/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
