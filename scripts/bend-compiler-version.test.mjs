import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test } from "node:test"

const root = resolve(import.meta.dirname, "..")
for (const [name, artifact] of [
  ["canonical", "src/canonical/canonical.generated.js"],
  ["import-graph", "packages/agent-flow-bend/import-graph.generated.js"],
  ["lifecycle", "packages/agent-flow-bend/lifecycle.generated.js"]
]) {
  test(`${name} refuses an unvalidated compiler before replacing the checked artifact`, () => {
    const directory = mkdtempSync(join(tmpdir(), "hapsland-bend-version-"))
    const before = readFileSync(join(root, artifact))
    try {
      writeFileSync(
        join(directory, "bend"),
        '#!/bin/sh\nif [ "$1" = "version" ]; then\n  echo "bend 2.0.36"\n  exit 0\nfi\necho "unexpected compilation" >&2\nexit 99\n',
        { mode: 0o700 }
      )
      const result = spawnSync(process.execPath, [join(root, `packages/agent-flow-bend/scripts/build-${name}.mjs`)], {
        cwd: root,
        env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
        encoding: "utf8",
        timeout: 10_000
      })
      assert.equal(result.error, undefined)
      assert.equal(result.status, 1)
      assert.match(result.stderr, /requires exact Bend 2\.0\.35; observed bend 2\.0\.36/)
      assert.doesNotMatch(result.stderr, /unexpected compilation/)
      assert.deepEqual(readFileSync(join(root, artifact)), before)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
}
