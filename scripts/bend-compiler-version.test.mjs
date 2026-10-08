import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test } from "node:test"

const root = resolve(import.meta.dirname, "..")
for (const [name, artifact] of [
  ["request-content", "request-content.generated.js"],
  ["canonical", "canonical.generated.js"],
  ["import-graph", "import-graph.generated.js"],
  ["lifecycle", "packages/agent-flow-bend/lifecycle.generated.js"]
]) {
  test(`${name} refuses an unvalidated compiler before replacing the checked artifact`, () => {
    const directory = mkdtempSync(join(tmpdir(), "hapsland-bend-version-"))
    const output = join(directory, "output")
    const artifactPath = name === "lifecycle" ? join(root, artifact) : join(output, artifact)
    if (name !== "lifecycle") {
      mkdirSync(output)
      writeFileSync(artifactPath, "retained owned output\n")
    }
    const before = readFileSync(artifactPath)
    try {
      writeFileSync(
        join(directory, "bend"),
        '#!/bin/sh\nif [ "$1" = "version" ]; then\n  echo "bend 2.0.35"\n  exit 0\nfi\necho "unexpected compilation" >&2\nexit 99\n',
        { mode: 0o700 }
      )
      const result = spawnSync(
        process.execPath,
        [join(root, `packages/agent-flow-bend/scripts/build-${name}.mjs`), output],
        {
          cwd: root,
          env: {
            ...process.env,
            HAPSLAND_CONTENT_BEND: join(directory, "bend"),
            PATH: `${directory}:${process.env.PATH}`
          },
          encoding: "utf8",
          timeout: 10_000
        }
      )
      assert.equal(result.error, undefined)
      assert.equal(result.status, 1)
      assert.match(result.stderr, /requires exact Bend 2\.0\.36; observed bend 2\.0\.35/)
      assert.doesNotMatch(result.stderr, /unexpected compilation/)
      assert.deepEqual(readFileSync(artifactPath), before)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
}

for (const [name, generator, artifacts] of [
  [
    "shared Engine",
    "packages/monkey-business-bend/build.mjs",
    ["packages/monkey-business-bend/engine.mjs", "packages/monkey-business-bend/generated.json"]
  ],
  [
    "headless game",
    "scripts/build-game-lab.mjs",
    ["prototypes/canonical-defense/lab/game.generated.mjs", "prototypes/canonical-defense/lab/game.generated.json"]
  ]
]) {
  test(`${name} rejects an older compiler before compilation or artifact writes`, (t) => {
    const directory = mkdtempSync(join(tmpdir(), "hapsland-optional-bend-version-"))
    t.after(() => rmSync(directory, { recursive: true, force: true }))
    const before = artifacts.map((file) => readFileSync(join(root, file)))
    writeFileSync(
      join(directory, "bend"),
      '#!/bin/sh\nif [ "$1" = "version" ]; then echo "bend 2.0.35"; exit 0; fi\necho "unexpected compilation" >&2\nexit 99\n',
      { mode: 0o700 }
    )
    for (const args of [[], ["--check"]]) {
      const result = spawnSync(process.execPath, [join(root, generator), ...args], {
        cwd: root,
        env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
        encoding: "utf8",
        timeout: 5000
      })
      assert.ifError(result.error)
      assert.equal(result.status, 1)
      assert.match(result.stderr, /requires exact bend 2\.0\.36; observed bend 2\.0\.35/)
      assert.doesNotMatch(result.stderr, /unexpected compilation/)
      artifacts.forEach((file, index) => assert.deepEqual(readFileSync(join(root, file)), before[index]))
    }
  })
}
