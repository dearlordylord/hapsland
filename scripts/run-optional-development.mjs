import { resolvePinnedTypeScript } from "./pinned-typescript.mjs"
import { readdirSync } from "node:fs"
import { resolve, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { createRun } from "./test-harness/run-checks.mjs"

const root = resolve(fileURLToPath(new URL("../", import.meta.url)))
const [scope, ...extra] = process.argv.slice(2)
if (extra.length || !["game", "simulation"].includes(scope)) throw new Error("Expected game or simulation")
const files = []
if (scope === "game") files.push("scripts/game-balance-lab.test.mts")
else {
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile() && entry.name.endsWith(".test.ts")) files.push(relative(root, path).replaceAll("\\", "/"))
    }
  }
  visit(resolve(root, "packages/monkey-business/src"))
}
files.sort()
if (!files.length) throw new Error("Optional test scope must contain explicit test files")
const run = await createRun({
  root,
  mode: "focused",
  timeoutMs: 1500000,
  inherited: process.env.HAPSLAND_CHECK_CONTEXT,
  scope: `optional-${scope}`,
  selectedTestFiles: files
})
try {
  const generated = await run.runStage({
    name: `${scope}-generated`,
    command: process.execPath,
    args:
      scope === "game"
        ? ["scripts/build-game-lab.mjs", "--check"]
        : ["packages/monkey-business-bend/build.mjs", "--check"]
  })
  const runner =
    scope === "simulation" && generated.state === "passed"
      ? await run.runStage({
          name: "simulation-runner-generated",
          command: process.execPath,
          args: ["packages/monkey-business-bend/build-run.mjs", "--check"]
        })
      : undefined
  if (generated.state === "passed" && (runner === undefined || runner.state === "passed")) {
    const types =
      scope === "game"
        ? await run.runStage({
            name: "game-lab-types",
            command: (await resolvePinnedTypeScript()).executable,
            args: ["-p", "prototypes/canonical-defense/lab/tsconfig.json", "--noEmit"]
          })
        : undefined
    if (types === undefined || types.state === "passed")
      await run.runStage({
        name: `${scope}-tests`,
        command: process.execPath,
        args: ["scripts/test-harness/run-checks.mjs", "focused", "--timeout-ms=1500000", ...files]
      })
  }
} finally {
  process.exitCode = await run.finish()
}
