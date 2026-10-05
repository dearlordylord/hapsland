import { Effect } from "effect"
import { loadReviewSettings } from "../runtime/review-config.ts"
import { reviewCodexDirectEvent } from "../direct-event/pipeline.ts"
import { addEvent, advicee } from "../direct-event/test-fixtures.ts"
import { controlledDecisionModelLayer } from "../test-support/controlled-decision-model.ts"
import { mkdirSync, writeFileSync, symlinkSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { execFileSync, spawnSync } from "../../scripts/test-harness/process.mjs"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

it("creates, inspects, disables and reconnects a project pack through the CLI", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-rules-cli-"))
  roots.push(root)
  execFileSync("git", ["init", "--quiet", root])
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [join(process.cwd(), "src/cli.ts"), "rules", ...args], {
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
    answers: { "team/concern": { _tag: "Probability", probability: 0.9 } },
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
    rules: [{ qualifiedId: "team/concern", scope: "project", source: path, enabled: true }]
  })
  const details = run("show", "--id", "team/concern", "--json")
  expect(JSON.parse(details.stdout)).toMatchObject({
    question: expect.any(String),
    criteria: { true: expect.any(String), false: expect.any(String) },
    reviewTargets: [{ artifactKind: "typeShape" }]
  })
  expect(run("disable", "--id", "team/concern", "--scope", "project").status).toBe(0)
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

  expect(run("enable", "--id", "team/concern", "--scope", "project").status).toBe(0)
  expect(run("create", "--id", "team", "--scope", "project").status).toBe(0)
  expect(readFileSync(path, "utf8")).toBe(authored)
  expect(run("connect", "--path", path, "--scope", "project").status).toBe(0)
  expect(JSON.parse(run("list", "--json").stdout).rules).toHaveLength(1)
})

it("creates personal rules, connects a custom pack in defaults and rejects invalid inputs before writes", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-personal-rules-"))
  roots.push(root)
  execFileSync("git", ["init", "--quiet", root])
  const configurationPath = join(root, "personal/config.jsonc")
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [join(process.cwd(), "src/cli.ts"), "rules", ...args], {
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
    rules: [{ scope: "user", packId: "mine" }]
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
  writeFileSync(invalid, '{"schemaVersion":1,"rules":[{"question":null}]}')
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
