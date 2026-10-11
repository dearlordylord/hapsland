import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { deriveLookupPlan, deriveSavePlan } from "./credential-reference.ts"
const directory = mkdtempSync(join(tmpdir(), "hapsland-credential-"))
try {
  const output = join(directory, "core.mjs")
  execFileSync("bend", ["packages/agent-flow-bend/credential-policy/core.bend", "-o", output], {
    timeout: 5000,
    stdio: "pipe"
  })
  const { default: core } = await import(pathToFileURL(output))
  const names = {
    Environment: "environment",
    ProjectLocal: "project-local",
    Project: "project",
    User: "user",
    Native: "native"
  }
  let cases = 0
  for (let bits = 0; bits < 32; bits++) {
    const explicit = Boolean(bits & 1),
      captured = Boolean(bits & 2),
      root = Boolean(bits & 4)
    const local = Boolean(bits & 8),
      project = Boolean(bits & 16)
    const context = {
      envVar: "KEY",
      referenceExplicit: explicit,
      captured,
      root: root ? "/root" : undefined,
      userFile: "/user",
      nativeTarget: "hapsland",
      projectLocalFile: local ? "/local" : undefined,
      projectFile: project ? "/project" : undefined
    }
    const actual = []
    for (let list = core.lookup(explicit, captured, root, local, project); list.$ === "Con"; list = list.tail)
      actual.push(names[list.head.$])
    assert.deepEqual(
      actual,
      deriveLookupPlan(context).map((step) => step.kind),
      `lookup flags ${bits}`
    )
    for (const [constructor, destination] of [
      ["User", "user"],
      ["Native", "native"],
      ["ProjectLocal", "project-local"]
    ])
      assert.equal(
        core.save_available({ $: constructor }, local),
        deriveSavePlan(context, destination) !== undefined,
        `save ${destination}, flags ${bits}`
      )
    cases++
  }
  const record = {
    at: new Date().toISOString(),
    cases,
    lookupComparisons: cases,
    saveComparisons: cases * 3,
    result: "pass",
    scope: "exhaustive Boolean planning domain against current TypeScript; not a proof or IO qualification"
  }
  writeFileSync(new URL("./candidate-parity.json", import.meta.url), JSON.stringify(record, null, 2) + "\n")
  console.log(JSON.stringify(record))
} finally {
  rmSync(directory, { recursive: true, force: true })
}
