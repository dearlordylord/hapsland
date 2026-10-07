import { test } from "node:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { resolvePinnedTypeScript } from "./pinned-typescript.mjs"
import assert from "node:assert/strict"
import { resolutionAcceptanceCases } from "./build-resolution-acceptance-cases.mjs"

const originalSource = 'export const formatWorkerHelp = () => "Examples:"\n'
const manifestPath = "packages/runtime-environment/package.json"
const sourcePath = "packages/runtime-environment/src/runtime/cli-information.ts"
const targetPath = "packages/runtime-environment/src/runtime/acceptance-cli-information.ts"
const emittedTarget = targetPath.replace("/src/", "/dist/").replace(/\.ts$/, ".js")
const specifier = "@hapsland/runtime-environment/runtime/cli-information"
const marker = "Resolved subpath acceptance examples:"
const cell = (id) => resolutionAcceptanceCases.find((item) => item.id === id)
function fixture({ missingInput = false, staleBehavior = false, acceptsUnsupported = false } = {}) {
  const files = new Map([
    [
      manifestPath,
      JSON.stringify({
        exports: {
          "./runtime/cli-information": {
            types: "./dist/runtime/cli-information.d.ts",
            default: "./dist/runtime/cli-information.js"
          }
        }
      })
    ],
    [sourcePath, originalSource],
    ["packages/hook-entry/src/hook-main.ts", `import { handleWorkerInformation } from "${specifier}"\n`],
    ["packages/hook-entry/package.json", JSON.stringify({ name: "@hapsland/hook-entry" })],
    ["tsconfig.package.json", JSON.stringify({ compilerOptions: { strict: true } })]
  ])
  const calls = []
  const context = {
    profile: "linux-arm64",
    read(path) {
      assert(files.has(path), `Unexpected fixture read ${path}`)
      return files.get(path)
    },
    async mutate(path, transform) {
      files.set(path, transform(context.read(path)))
    },
    async create(path, text) {
      assert(!files.has(path))
      files.set(path, text)
    },
    assemblyReceipt(role) {
      return JSON.parse(files.get(`packages/${role}-entry/artifacts/linux-arm64/assembly-receipt.json`))
    },
    async build(label, expected = true) {
      calls.push({ label, expected })
      if (!expected)
        return {
          success: acceptsUnsupported,
          log: label.includes("condition") ? "Unsupported workspace export conditions" : "Undeclared dependency"
        }
      assert.equal(
        JSON.parse(files.get(manifestPath)).exports["./runtime/cli-information"].default,
        "./dist/runtime/acceptance-cli-information.js"
      )
      files.set(emittedTarget, files.get(targetPath))
      for (const role of ["hook", "resident", "parser", "doctor"])
        files.set(
          `packages/${role}-entry/artifacts/linux-arm64/assembly-receipt.json`,
          JSON.stringify({ inputs: missingInput ? [] : [{ path: emittedTarget }] })
        )
      return { success: true }
    },
    hasExecutable() {
      return false
    },
    async probe(role, args) {
      calls.push({ role, args })
      return { stdout: staleBehavior ? "Examples:" : marker }
    },
    async probeHook() {
      calls.push({ quietProbe: true })
    }
  }
  return { context, files, calls }
}

test("resolution cell identities remain unique and explicitly bounded", () => {
  assert.equal(resolutionAcceptanceCases.length, 4)
  assert.equal(new Set(resolutionAcceptanceCases.map((item) => item.id)).size, 4)
})
test("retarget definition requires emitted target evidence and all four actual help behaviors", async () => {
  const { context, calls, files } = fixture()
  await cell("exact-subpath-retarget-behavior").run(context)
  assert(files.get(targetPath).includes(marker))
  assert.equal(files.get(sourcePath), originalSource, "Local original import must remain intact")
  assert.deepEqual(
    calls.filter((item) => item.role).map((item) => item.role),
    ["hook", "resident", "parser", "doctor"]
  )
  assert(calls.some((item) => item.quietProbe))
})
test("retarget definition cannot accept correct logs with missing contributions or stale executable behavior", async () => {
  await assert.rejects(
    cell("exact-subpath-retarget-behavior").run(fixture({ missingInput: true }).context),
    /omitted the selected emitted/
  )
  await assert.rejects(
    cell("exact-subpath-retarget-behavior").run(fixture({ staleBehavior: true }).context),
    /previous subpath target/
  )
})
for (const id of [
  "unsupported-workspace-node-condition",
  "unsupported-typescript-module-alias",
  "unsupported-package-imports-alias"
]) {
  test(`${id} requires ordinary build refusal and no surviving hook`, async () => {
    const { context, calls } = fixture()
    await cell(id).run(context)
    assert.deepEqual(calls, [{ label: id, expected: false }])
    await assert.rejects(cell(id).run(fixture({ acceptsUnsupported: true }).context), /unexpectedly built/)
    const retained = fixture()
    retained.context.hasExecutable = () => true
    await assert.rejects(cell(id).run(retained.context), /publishable hook/)
  })
}
test("fixture anchors fail rather than silently weakening retarget evidence after source drift", async () => {
  const { context, files } = fixture()
  files.set(sourcePath, "export const changed = true\n")
  await assert.rejects(cell("exact-subpath-retarget-behavior").run(context), /fixture anchor/)
})

test("exact subpath ordinary repair rejects all removed emitted members", () => {
  const definition = cell("exact-subpath-retarget-behavior")
  definition.verifyRepair({
    inventory: () => [{ path: "packages/runtime-environment/dist/runtime/cli-information.js" }]
  })
  for (const suffix of ["js", "js.map", "d.ts", "d.ts.map"])
    assert.throws(
      () =>
        definition.verifyRepair({
          inventory: () => [{ path: `packages/runtime-environment/dist/runtime/acceptance-cli-information.${suffix}` }]
        }),
      /retained removed subpath/
    )
})

test("pinned compiler accepts declaration alias without removed options or outside-root source", async () => {
  const selected = await resolvePinnedTypeScript(import.meta.dirname)
  const root = mkdtempSync(join(tmpdir(), "hapsland-ts-alias-"))
  try {
    mkdirSync(join(root, "consumer"))
    mkdirSync(join(root, "producer"))
    writeFileSync(
      join(root, "consumer/main.ts"),
      'import { value } from "@acceptance/information"; export const result: number = value;\n'
    )
    writeFileSync(join(root, "producer/information.d.ts"), "export declare const value: number;\n")
    writeFileSync(join(root, "producer/information.ts"), "export const value = 1;\n")
    const configuration = {
      compilerOptions: {
        rootDir: "./consumer",
        outDir: "./output",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        paths: { "@acceptance/information": ["./producer/information.d.ts"] }
      },
      files: ["./consumer/main.ts"]
    }
    const compile = () => {
      writeFileSync(join(root, "tsconfig.json"), JSON.stringify(configuration))
      return spawnSync(selected.executable, ["--project", join(root, "tsconfig.json")], {
        encoding: "utf8",
        timeout: 10000
      })
    }
    const valid = compile()
    assert.equal(valid.status, 0, valid.stdout + valid.stderr)
    configuration.compilerOptions.paths["@acceptance/information"] = ["./producer/information.ts"]
    const outside = compile()
    assert.notEqual(outside.status, 0)
    assert.match(outside.stdout + outside.stderr, /TS6059/)
    configuration.compilerOptions.paths["@acceptance/information"] = ["./producer/information.d.ts"]
    configuration.compilerOptions.baseUrl = "."
    const obsolete = compile()
    assert.notEqual(obsolete.status, 0)
    assert.match(obsolete.stdout + obsolete.stderr, /TS5102/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
