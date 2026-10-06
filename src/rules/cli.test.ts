import { bunExecutable } from "../runtime/bun-runtime.ts"
import { Effect } from "effect"
import { loadReviewSettings } from "../runtime/review-config.ts"
import { reviewCodexDirectEvent } from "../direct-event/pipeline.ts"
import { addEvent, advicee } from "../direct-event/test-fixtures.ts"
import { controlledDecisionModelLayer } from "../review-execution/controlled-decision-model.ts"
import {
  mkdirSync,
  writeFileSync,
  symlinkSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { execFileSync, spawnSync } from "../../scripts/test-harness/process.mjs"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

it("creates, inspects, disables and reconnects a project rule through the CLI", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hapsland-rules-cli-")))
  roots.push(root)
  execFileSync("git", ["init", "--quiet", root])
  const run = (...args: string[]) =>
    spawnSync(bunExecutable(), [join(process.cwd(), "src/cli.ts"), "rules", ...args], {
      cwd: root,
      env: { ...process.env, REVIEW_USER_CONFIG_PATH: join(root, "personal/config.jsonc") },
      encoding: "utf8",
      timeout: 20_000
    })
  const empty = run("list", "--json")
  expect(empty.status).toBe(0)
  expect(JSON.parse(empty.stdout)).toMatchObject({ enabledCount: 0, rules: [] })
  const missing = run("create", "--id", "team")
  expect(missing.status).not.toBe(0)
  expect(existsSync(join(root, ".hapsland.jsonc"))).toBe(false)
  const created = run("create", "--id", "team", "--scope", "project", "--json")
  expect(created.stderr).toBe("")
  expect(created.status).toBe(0)
  const path = join(root, ".hapsland/rules/custom/team.json")
  const authored = readFileSync(path, "utf8")
  writeFileSync(join(root, "type.ts"), "type OrderCount = number")
  let calls = 0
  const model = controlledDecisionModelLayer({
    answers: { team: { _tag: "Probability", probability: 0.9 } },
    onRequest: Effect.sync(() => {
      calls += 1
    })
  })
  const settings = await Effect.runPromise(
    loadReviewSettings(root, { userConfigPath: join(root, "personal/config.jsonc") })
  )
  const reviewed = await Effect.runPromise(
    reviewCodexDirectEvent(addEvent(root), { settings, advicee: advicee(), controlledWriter: true }).pipe(
      Effect.provide(model)
    )
  )
  expect(reviewed).toMatchObject({ status: "ready", findings: [{ message: "Review the authored domain constraint." }] })
  expect(calls).toBe(1)

  const listed = run("list", "--json")
  expect(JSON.parse(listed.stdout)).toMatchObject({
    enabledCount: 1,
    rules: [{ id: "team", origin: { layer: "project" }, source: path, enabled: true }]
  })
  const details = run("show", "--id", "team", "--json")
  expect(JSON.parse(details.stdout)).toMatchObject({
    question: expect.any(String),
    criteria: { true: expect.any(String), false: expect.any(String) },
    inputs: [{ kind: "type" }]
  })
  expect(run("list").stdout).toContain(`Scope: project; configuration: ${join(root, ".hapsland.jsonc")}`)
  const readable = run("show", "--id", "team")
  expect(readable.stdout).toContain("Criteria true:")
  expect(readable.stdout).toContain("Input: type; languages:")
  const explained = JSON.parse(run("explain", "--id", "team", "--path", "vendor/type.ts", "--json").stdout)
  expect(explained).toMatchObject({
    language: "typescript",
    globalSelection: { selected: false, reason: "protected", gate: "generated-or-vendor" }
  })
  expect(explained.reasons.join(" ")).toContain("No source was parsed")
  expect(run("disable", "--id", "team", "--scope", "project").status).toBe(0)
  expect(JSON.parse(run("list", "--json").stdout)).toMatchObject({ enabledCount: 0, rules: [{ enabled: false }] })
  const disabled = await Effect.runPromise(
    loadReviewSettings(root, { userConfigPath: join(root, "personal/config.jsonc") })
  )
  const quiet = await Effect.runPromise(
    reviewCodexDirectEvent(addEvent(root), { settings: disabled, advicee: advicee(), controlledWriter: true }).pipe(
      Effect.provide(model)
    )
  )
  expect(quiet.status).toBe("no-advice")
  expect(calls).toBe(1)

  expect(run("enable", "--id", "team", "--scope", "project").status).toBe(0)
  expect(run("create", "--id", "team", "--scope", "project").status).toBe(0)
  expect(readFileSync(path, "utf8")).toBe(authored)
  expect(run("connect", "--path", path, "--scope", "project").status).toBe(0)
  expect(JSON.parse(run("list", "--json").stdout).rules).toHaveLength(1)
})

it("creates personal rules, connects a custom rule in defaults and rejects invalid inputs before writes", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-personal-rules-"))
  roots.push(root)
  execFileSync("git", ["init", "--quiet", root])
  const configurationPath = join(root, "personal/config.jsonc")
  const run = (...args: string[]) =>
    spawnSync(bunExecutable(), [join(process.cwd(), "src/cli.ts"), "rules", ...args], {
      cwd: root,
      env: { ...process.env, REVIEW_USER_CONFIG_PATH: configurationPath },
      encoding: "utf8",
      timeout: 20_000
    })
  expect(run("create", "--id", "mine", "--scope", "personal", "--json").status).toBe(0)
  const original = join(root, "personal/rules/custom/mine.json")
  const document = JSON.parse(readFileSync(original, "utf8"))
  expect(JSON.parse(run("list", "--json").stdout)).toMatchObject({
    enabledCount: 1,
    rules: [{ origin: { layer: "user" }, id: "mine" }]
  })
  const defaults = join(root, "personal/rules/defaults")
  mkdirSync(defaults)
  const custom = join(defaults, "custom.json")
  writeFileSync(custom, JSON.stringify({ ...document, id: "another" }))
  expect(JSON.parse(run("list", "--json").stdout).enabledCount).toBe(1)
  expect(run("connect", "--path", custom, "--scope", "personal").status).toBe(0)
  expect(JSON.parse(run("list", "--json").stdout).enabledCount).toBe(2)
  const before = readFileSync(configurationPath, "utf8")
  const conflict = join(root, "conflict.json")
  writeFileSync(conflict, JSON.stringify(document))
  expect(run("connect", "--path", conflict, "--scope", "personal").status).not.toBe(0)
  const invalid = join(root, "invalid.json")
  writeFileSync(invalid, '{"version":1,"question":null}')
  expect(run("connect", "--path", invalid, "--scope", "personal").status).not.toBe(0)
  expect(run("create", "--id", "../escape", "--scope", "project").status).not.toBe(0)
  const outside = mkdtempSync(join(tmpdir(), "hapsland-outside-rules-"))
  roots.push(outside)
  symlinkSync(outside, join(root, ".hapsland"), "dir")
  expect(run("create", "--id", "escaped", "--scope", "project").status).not.toBe(0)
  expect(existsSync(join(outside, "rules/custom/escaped.json"))).toBe(false)
  expect(readFileSync(configurationPath, "utf8")).toBe(before)
  expect(existsSync(join(root, ".hapsland.jsonc"))).toBe(false)
  expect(run("list").stdout).toContain(original)
})

it("binds all connected authored sources to previews and rejects unsupported active schema rules before writes", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-rule-preview-"))
  roots.push(root)
  execFileSync("git", ["init", "--quiet", root])
  const { previewRuleChange, applyRuleChange } = await import("./management.ts")
  const options = { userConfigPath: join(root, "personal.jsonc") }
  const create = { action: "create", scope: "project", id: "domain/count" } as const
  const initial = await Effect.runPromise(previewRuleChange(root, create, options))
  await Effect.runPromise(applyRuleChange(root, create, initial.digest, options))
  const { formatRuleChangePreview } = await import("./command.ts")
  expect(formatRuleChangePreview(initial)).toContain(
    `This will connect the rule in ${join(root, ".hapsland.jsonc")}. The rule will be enabled.`
  )
  expect(initial.path).toBe(join(root, ".hapsland/rules/custom/domain%2Fcount.json"))
  const toggle = { action: "disable", scope: "project", id: "domain/count" } as const
  const plan = await Effect.runPromise(previewRuleChange(root, toggle, options))
  expect(formatRuleChangePreview(plan)).toContain("The rule will be disabled.")
  const path = initial.path
  if (path === undefined) throw new Error("missing authored file")
  const document = JSON.parse(readFileSync(path, "utf8"))
  writeFileSync(path, JSON.stringify({ ...document, question: "Edited after preview" }))
  const stale = await Effect.runPromise(applyRuleChange(root, toggle, plan.digest, options).pipe(Effect.result))
  expect(stale).toMatchObject({ _tag: "Failure", failure: { reason: expect.stringContaining("stale") } })
  const schema = join(root, "schema.json")
  writeFileSync(
    schema,
    JSON.stringify({
      ...document,
      id: "schema-check",
      inputs: [{ kind: "schema", languages: ["typescript"], requires: [], dialect: "json-schema" }]
    })
  )
  const before = readFileSync(join(root, ".hapsland.jsonc"), "utf8")
  const rejected = await Effect.runPromise(
    previewRuleChange(root, { action: "connect", scope: "project", path: schema }, options).pipe(Effect.result)
  )
  expect(rejected).toMatchObject({
    _tag: "Failure",
    failure: { reason: expect.stringContaining("unsupported selected input") }
  })
  expect(readFileSync(join(root, ".hapsland.jsonc"), "utf8")).toBe(before)
})

it("provisions seven separate defaults, preserves edits and binds every authored file", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-default-rule-plan-"))
  roots.push(root)
  execFileSync("git", ["init", "--quiet", root])
  const { previewDefaultRules, applyDefaultRules } = await import("../onboarding/default-rules.ts")
  const configurationPath = join(root, "personal/config.jsonc")
  const plan = await Effect.runPromise(previewDefaultRules(configurationPath, root))
  expect(plan.files).toHaveLength(7)
  expect(existsSync(configurationPath)).toBe(false)
  await Effect.runPromise(applyDefaultRules(configurationPath, plan.digest, root))
  const last = plan.files.at(-1)
  if (last === undefined) throw new Error("missing final default")
  const edited = JSON.stringify({ ...JSON.parse(readFileSync(last.path, "utf8")), question: "User authored last rule" })
  writeFileSync(last.path, edited)
  const repeat = await Effect.runPromise(previewDefaultRules(configurationPath, root))
  expect(repeat.changed).toBe(false)
  await Effect.runPromise(applyDefaultRules(configurationPath, repeat.digest, root))
  expect(readFileSync(last.path, "utf8")).toBe(edited)
  const stale = await Effect.runPromise(previewDefaultRules(configurationPath, root))
  writeFileSync(last.path, edited + " ")
  expect(
    await Effect.runPromise(applyDefaultRules(configurationPath, stale.digest, root).pipe(Effect.result))
  ).toMatchObject({ _tag: "Failure", failure: { reason: expect.stringContaining("stale") } })
  rmSync(last.path)
  expect(await Effect.runPromise(previewDefaultRules(configurationPath, root).pipe(Effect.result))).toMatchObject({
    _tag: "Failure",
    failure: { reason: expect.stringContaining("does not exist") }
  })
  expect(existsSync(last.path)).toBe(false)
})

it("preserves an existing authored selection with a retired numbered identity", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-authored-default-selection-"))
  roots.push(root)
  execFileSync("git", ["init", "--quiet", root])
  const { previewDefaultRules, applyDefaultRules } = await import("../onboarding/default-rules.ts")
  const configurationPath = join(root, "config.jsonc")
  const rulePath = join(root, "r1_inferred_case.json")
  const authored = JSON.stringify({
    version: 1,
    id: "r1_inferred_case",
    question: "An existing user-authored concern",
    criteria: { true: "present", false: "absent" },
    message: "User-authored feedback",
    inputs: [{ languages: ["typescript"], kind: "type", requires: [] }]
  })
  writeFileSync(rulePath, authored)
  const selected = JSON.stringify({ version: 1, rules: [rulePath] })
  writeFileSync(configurationPath, selected)
  const plan = await Effect.runPromise(previewDefaultRules(configurationPath, root))
  expect(plan).toMatchObject({ changed: false, files: [], paths: [] })
  await Effect.runPromise(applyDefaultRules(configurationPath, plan.digest, root))
  expect(readFileSync(rulePath, "utf8")).toBe(authored)
  expect(readFileSync(configurationPath, "utf8")).toBe(selected)
})

it("preserves explicit empty, reduced and project selections during repeated default setup", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-explicit-default-selection-"))
  roots.push(root)
  execFileSync("git", ["init", "--quiet", root])
  const { previewDefaultRules, applyDefaultRules } = await import("../onboarding/default-rules.ts")
  const configurationPath = join(root, "personal/config.jsonc")
  mkdirSync(join(root, "personal"))
  writeFileSync(configurationPath, JSON.stringify({ version: 1, rules: [] }))
  const empty = await Effect.runPromise(previewDefaultRules(configurationPath, root))
  expect(empty).toMatchObject({ changed: false, files: [], paths: [] })
  await Effect.runPromise(applyDefaultRules(configurationPath, empty.digest, root))
  expect(JSON.parse(readFileSync(configurationPath, "utf8")).rules).toEqual([])
  rmSync(configurationPath)
  const initial = await Effect.runPromise(previewDefaultRules(configurationPath, root))
  await Effect.runPromise(applyDefaultRules(configurationPath, initial.digest, root))
  const document = JSON.parse(readFileSync(configurationPath, "utf8"))
  document.rules.pop()
  writeFileSync(configurationPath, JSON.stringify(document))
  const reduced = await Effect.runPromise(previewDefaultRules(configurationPath, root))
  expect(reduced).toMatchObject({ changed: false, files: [] })
  await Effect.runPromise(applyDefaultRules(configurationPath, reduced.digest, root))
  expect(JSON.parse(readFileSync(configurationPath, "utf8")).rules).toHaveLength(6)
  rmSync(configurationPath)
  writeFileSync(join(root, ".hapsland.jsonc"), JSON.stringify({ version: 1, rules: [] }))
  const project = await Effect.runPromise(previewDefaultRules(configurationPath, root))
  expect(project).toMatchObject({ changed: false, files: [], paths: [] })
  await Effect.runPromise(applyDefaultRules(configurationPath, project.digest, root))
  expect(existsSync(configurationPath)).toBe(false)
})
