import assert from "node:assert/strict"
import { cpSync, mkdtempSync, realpathSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { test } from "node:test"
import { checkUiFlows } from "./check-ui-flows.mjs"

const repository = resolve(import.meta.dirname, "..")
const fixture = (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hapsland-ui-contract-")))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const directory of ["packages", "scripts", "docs/cli-interactions"])
    cpSync(join(repository, directory), join(root, directory), {
      recursive: true,
      filter: (path) => !/(?:^|\/)(?:dist|node_modules|artifacts)(?:\/|$)/.test(path)
    })
  cpSync(join(repository, "package.json"), join(root, "package.json"))
  symlinkSync(join(repository, "node_modules"), join(root, "node_modules"), "dir")
  return root
}

test("the production registry covers its owners and replay generators", () => {
  assert.deepEqual(checkUiFlows(), { workflows: 7, fragments: 2, exceptions: 5 })
})

test("a new unregistered prompt fails the real compiler entry before compilation", (t) => {
  const root = fixture(t)
  writeFileSync(
    join(root, "packages/administration/src/onboarding/unregistered.ts"),
    `import { InteractionService as Input } from "../interaction/interaction.ts"; export function* ask() { const input = yield* Input; yield* input.confirm({}); }`
  )
  for (const entry of ["pinned-typescript.mjs", "compile-package.mjs", "build-workspaces.mjs"]) {
    const result = spawnSync(process.execPath, [join(root, "scripts", entry)], {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000
    })
    assert.notEqual(result.status, 0, entry)
    assert.match(result.stderr, /UI owner bypasses registered dispatch|Unregistered UI input/, entry)
    assert.doesNotMatch(result.stderr, /Missing declared compiler|Compiler owner must/, entry)
  }
})

test("a new registered flow without a generator or document is rejected", (t) => {
  const root = fixture(t)
  const registry = join(root, "packages/administration/src/interaction/flow-registry.ts")
  const source = readFileSync(registry, "utf8")
  writeFileSync(
    registry,
    source.replace(
      "export const uiFlows = {",
      `export const uiFlows = { added: { owner: "packages/administration/src/onboarding/added.ts", entry: "added", diagram: "docs/cli-interactions/added.md", inputs: ["confirm"], composes: [] },`
    )
  )
  writeFileSync(
    join(root, "packages/administration/src/onboarding/added.ts"),
    `import { flowInteraction } from "../interaction/flow-input.ts"; export function* added() { const input = yield* flowInteraction("added"); yield* input.confirm({}); }`
  )
  const result = spawnSync(process.execPath, [join(root, "scripts/check-ui-flows.mjs")], {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Missing UI diagram: added/)
  assert.match(result.stderr, /Missing UI replay generator: added/)
})

test("an extra prompt kind and an undeclared transport cannot bypass registration", (t) => {
  const root = fixture(t)
  const owner = join(root, "packages/administration/src/onboarding/pilot.ts")
  writeFileSync(
    owner,
    readFileSync(owner, "utf8") + '\nconst extra = (interaction) => interaction["hidden"]("Unregistered key:");\n'
  )
  assert.throws(() => checkUiFlows(root), /Undeclared UI input kind/)
  writeFileSync(
    join(root, "packages/administration/src/onboarding/raw-input.ts"),
    'import { createInterface } from "node:readline/promises"; export const raw = createInterface;\n'
  )
  assert.throws(() => checkUiFlows(root), /Unregistered terminal adapter/)
})

test("the real replay check rejects a stale Markdown diagram", (t) => {
  const root = fixture(t)
  const diagram = join(root, "docs/cli-interactions/login.md")
  writeFileSync(diagram, readFileSync(diagram, "utf8") + "\nStale diagram fixture.\n")
  const result = spawnSync(process.execPath, [join(root, "scripts/generate-interaction-diagrams.mts"), "--check"], {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /login diagram is stale/)
})

test("aliased and destructured low-level input capabilities cannot bypass registration", (t) => {
  const root = fixture(t)
  const file = join(root, "packages/administration/src/onboarding/bypass.ts")
  for (const source of [
    'import { Effect } from "effect"; import { InteractionService as Input } from "../interaction/interaction.ts"; export const ask = Effect.flatMap(Input, ({ confirm }) => confirm({}));',
    'import { runPrompt as ask } from "../interaction/interaction.ts"; export const prompt = ask({});',
    'import * as Input from "../interaction/interaction.ts"; export const prompt = Input.runPrompt({});',
    'export const raw = import("node:readline/promises");',
    'export const raw = process.stdin.on("data", () => {});',
    'import { Effect } from "effect"; import * as Flows from "../interaction/flow-input.ts"; export const ask = Effect.flatMap(Flows.flowInteraction("login"), ({ confirm }) => confirm({}));',
    'export const dispatch = import("../interaction/flow-input.ts");'
  ]) {
    writeFileSync(file, source)
    assert.throws(
      () => checkUiFlows(root),
      /UI owner bypasses registered dispatch|Unregistered terminal capability|Unregistered terminal adapter|UI dispatch must use named imports/
    )
  }
})

test("production child dispatch and the generated composition graph must agree", (t) => {
  const root = fixture(t)
  const pilot = join(root, "packages/administration/src/onboarding/pilot.ts")
  const source = readFileSync(pilot, "utf8")
  writeFileSync(
    pilot,
    source +
      '\nimport { runRuleConversation } from "../rules/conversation.ts"; const extraChild = runRuleConversation();\n'
  )
  assert.throws(() => checkUiFlows(root), /Undeclared UI composition: setup -> rules/)
  writeFileSync(
    pilot,
    source.replace('childFlow("setup", "verification", owner.verifyCredential)', "owner.verifyCredential")
  )
  assert.throws(() => checkUiFlows(root), /UI composition has no production dispatch: setup -> verification/)
})
