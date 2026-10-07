import { documentationFacts } from "./documentation-facts.ts"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { spawnSync } from "./test-harness/process.mjs"
import { fileURLToPath } from "node:url"
import { fromJSONSchema } from "zod/v4"
import * as Schema from "effect/Schema"
import * as Effect from "effect/Effect"
import { rm } from "node:fs/promises"
import {
  authoringCommandExamples,
  authoringRuleExample,
  authoringSelections,
  authoringSourceExample,
  authoringSourcePath
} from "./rule-authoring-example.ts"
import { parseInvocation as parseInvocationEffect } from "@hapsland/administration/cli-command"
import { makeGitFixture, put } from "@hapsland/build-tooling/test-support/test-fixtures"
import { discoverPhysicalWorkingTreeRoot } from "@hapsland/native-observation/repository/root"
import { loadReviewSettings } from "@hapsland/review-definition/runtime/review-config"
import { prepareSourceLine, preparedProviderInput } from "@hapsland/review-execution/direct-event/pipeline"
import { describe, expect, it } from "vitest"
import { decodeConfigurationText } from "@hapsland/runtime-inputs/configuration/decode"
import { decodeRuleText } from "@hapsland/review-definition/rules/schema"
import { renderConfigurationArtifacts, renderInspectionArtifacts } from "./generate-configuration.ts"

import { AnalyticsRecordingEnabled, InspectionRecordingEnabled } from "@hapsland/runtime-inputs/configuration/types"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const generator = join(repositoryRoot, "scripts/generate-configuration.ts")

const withFixture = (run: (root: string) => void): void => {
  const root = mkdtempSync(join(tmpdir(), "configuration-generator-"))
  mkdirSync(join(root, "docs"), { recursive: true })
  writeFileSync(
    join(root, "docs/installation-workflows.md"),
    "Authored setup guide.\n<!-- cli-reference:start -->\nold\n<!-- cli-reference:end -->\n<!-- unattended-setup-commands:start -->\nold\n<!-- unattended-setup-commands:end -->\n"
  )
  writeFileSync(
    join(root, "README.md"),
    "Authored README before.\n\n<!-- configuration-readme:start -->\nold\n<!-- configuration-readme:end -->\n\nAuthored README after.\n"
  )
  writeFileSync(
    join(root, "docs/configuration.md"),
    "# Configuration\n\nAuthored guide before.\n\n<!-- configuration-guide:start -->\nold\n<!-- configuration-guide:end -->\n\nAuthored pack notes before.\n\n<!-- rule-guide:start -->\nold\n<!-- rule-guide:end -->\n\nAuthored guide after.\n"
  )
  for (const name of ["README.md", "docs/installation-workflows.md", "docs/status.md"]) {
    const path = join(root, name)
    const text = name === "docs/status.md" ? "Authored status guide.\n" : readFileSync(path, "utf8")
    writeFileSync(path, text + "\n<!-- inspection-recording:start -->\nold\n<!-- inspection-recording:end -->\n")
  }
  for (const fact of documentationFacts()) {
    const path = join(root, fact.path)
    let text = "Authored facts document.\n"
    try {
      text = readFileSync(path, "utf8")
    } catch {}
    writeFileSync(path, text + `\n<!-- ${fact.name}:start -->\nold\n<!-- ${fact.name}:end -->\n`)
  }
  try {
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const runGenerator = (root: string, mode: "--update" | "--check") =>
  spawnSync(process.execPath, ["--experimental-strip-types", generator, mode, "--root", root], {
    cwd: repositoryRoot,
    encoding: "utf8"
  })

const generatedFiles = (root: string): ReadonlyArray<string> => [
  join(root, "README.md"),
  join(root, "docs/configuration.md"),
  join(root, "docs/installation-workflows.md"),
  join(root, "schemas/review-config-v1.schema.json"),
  join(root, "schemas/review-rule-v1.schema.json"),
  join(root, "docs/status.md"),
  join(root, "docs/examples/session-inspection.jsonc"),
  join(root, "docs/pi-installation.md"),
  join(root, "docs/review-providers.md"),
  join(root, "docs/review-resources.md"),
  join(root, "packages/administration/src/inspection/brand.ts")
]

const codeBlocks = (markdown: string): ReadonlyArray<string> =>
  [...markdown.matchAll(/```(?:jsonc|json)\n([\s\S]*?)\n```/gu)].map((match) => match[1] ?? "")

describe("configuration documentation generator", () => {
  it("keeps the authoring commands and source selections executable through runtime owners", async () => {
    for (const command of authoringCommandExamples)
      expect(await parseInvocation(command.split(" ").slice(1))).toMatchObject({ kind: "rules" })
    const root = await makeGitFixture()
    try {
      await put(root, "rule.json", JSON.stringify(authoringRuleExample))
      await put(root, "user.json", JSON.stringify({ version: 1 }))
      await put(root, ".hapsland.jsonc", JSON.stringify({ version: 1, rules: ["rule.json"] }))
      await put(root, authoringSourcePath, authoringSourceExample)
      const settings = await Effect.runPromise(loadReviewSettings(root, { userConfigPath: join(root, "user.json") }))
      const repository = await Effect.runPromise(discoverPhysicalWorkingTreeRoot(root))
      for (const selection of authoringSelections) {
        const result = await Effect.runPromise(
          prepareSourceLine({ ...repository, path: authoringSourcePath, line: selection.line }, { settings })
        )
        const ready = result.outcomes.flatMap((outcome) => (outcome.status === "ready" ? [outcome.prepared] : []))
        expect(ready).toHaveLength(1)
        expect(ready[0]!.input.declaration.name).toBe(selection.declaration)
        expect(ready[0]!.input.rules.map((rule) => rule.id)).toEqual([authoringRuleExample.id])
        if (selection.declaration === "Order") {
          const input = JSON.stringify(preparedProviderInput(ready[0]!))
          expect(input).toContain("customer-id")
          expect(input).toContain("order-id")
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("reflects a changed Effect Schema field in both generated outputs", () => {
    const changedSchema = Schema.Struct({
      version: Schema.Literal(1),
      reviewWindow: Schema.Finite.check(Schema.isBetween({ minimum: 2, maximum: 9 })).annotate({
        description: "Declared on the Effect Schema for this test."
      })
    })
    const generated = renderConfigurationArtifacts(changedSchema)
    const properties = generated.jsonSchema.properties as Record<string, unknown>

    expect(properties.reviewWindow).toMatchObject({
      minimum: 2,
      maximum: 9,
      description: "Declared on the Effect Schema for this test."
    })
    expect(generated.documentation).toContain("`reviewWindow` | number (2–9) | Required")
    expect(generated.documentation).toContain("Declared on the Effect Schema for this test.")
  })

  it("renames the inspection field in every generated template and notice from the schema", () => {
    const renamed = Schema.Struct({
      version: Schema.Literal(1),
      renamedRecording: Schema.optionalKey(InspectionRecordingEnabled)
    })
    const artifacts = renderInspectionArtifacts(renamed)
    for (const text of [artifacts.template, artifacts.documentation, artifacts.notice("template.jsonc")]) {
      expect(text).toContain("renamedRecording")
      expect(text).not.toContain("sessionInspection")
    }
    expect(
      Schema.decodeUnknownSync(renamed)(
        JSON.parse(
          artifacts.template
            .split("\n")
            .filter((line) => !line.startsWith("//"))
            .join("\n")
        )
      )
    ).toEqual({ version: 1, renamedRecording: true })
    expect(() => renderInspectionArtifacts(Schema.Struct({ version: Schema.Literal(1) }))).toThrow(
      "expected one inspection recording field"
    )
  })

  it("propagates renamed recording settings into all fact sections", () => {
    const renamed = Schema.Struct({
      version: Schema.Literal(1),
      analyticsRenamed: Schema.optionalKey(AnalyticsRecordingEnabled),
      inspectionRenamed: Schema.optionalKey(InspectionRecordingEnabled)
    })
    const facts = documentationFacts(renamed)
    const text = facts.map((fact) => fact.text).join("\n")
    expect(text).toContain("analyticsRenamed")
    expect(text).toContain("inspectionRenamed")
    expect(text).not.toContain("sessionAnalytics")
    expect(text).not.toContain("sessionInspection")
    for (const example of codeBlocks(facts.find((fact) => fact.name === "analytics-recording")!.text)) {
      expect(Schema.decodeUnknownSync(renamed)(JSON.parse(example))).toEqual({ version: 1, analyticsRenamed: true })
    }
  })

  it("updates all artifacts deterministically and preserves authored guide text", () => {
    withFixture((root) => {
      const first = runGenerator(root, "--update")
      expect(first.status, first.stderr).toBe(0)
      const files = generatedFiles(root)
      const initial = files.map((path) => readFileSync(path, "utf8"))

      const readme = initial[0] ?? ""
      const guide = initial[1] ?? ""
      expect(readme).toContain("Configure file selection")
      expect(readme).toContain("individual local rules")
      expect(guide).toContain("`rules[].path`")
      expect(guide).toContain("`rules[].threshold`")
      expect(guide).toContain("`inputs[].languages`")
      expect(readme).toContain("Authored README before.")
      expect(readme).toContain("Authored README after.")
      expect(guide).toContain("Authored guide before.")
      expect(guide).toContain("Authored guide after.")
      const examples = codeBlocks(guide)
      const ruleExample = examples.find((example) => example.includes('"question"'))
      expect(ruleExample).toBeDefined()
      expect(decodeRuleText(ruleExample ?? "{}", "guide example").inputs[0]).toMatchObject({
        kind: "type",
        languages: ["typescript", "rust", "bend"]
      })
      expect(codeBlocks(readme).map((example) => decodeConfigurationText(example, "readme").version)).toEqual([1])
      const configurationSchema = JSON.parse(readFileSync(files[3]!, "utf8"))
      const ruleSchema = JSON.parse(readFileSync(files[4]!, "utf8"))
      const configurationValidator = fromJSONSchema(configurationSchema)
      const ruleValidator = fromJSONSchema(ruleSchema)
      expect(
        configurationValidator.safeParse({ version: 1, rules: [{ path: "rule.json", threshold: 0.5 }] }).success
      ).toBe(true)
      expect(
        configurationValidator.safeParse({ version: 1, rules: [{ path: "rule.json", id: "namespace/check" }] }).success
      ).toBe(false)
      expect(configurationValidator.safeParse({ version: 1, packs: [] }).success).toBe(false)
      expect(
        configurationValidator.safeParse({ version: 1, rules: [{ id: "namespace/check", threshold: 1.1 }] }).success
      ).toBe(false)
      const authored = JSON.parse(ruleExample ?? "{}")
      expect(ruleValidator.safeParse(authored).success).toBe(true)
      for (const invalid of [
        { ...authored, version: 2 },
        { ...authored, inputs: [] },
        { ...authored, minimumRung: 1 },
        { ...authored, inputs: [{ languages: ["typescript"], kind: "value", requires: [] }] },
        { ...authored, inputs: [{ languages: [], kind: "type", requires: [] }] }
      ]) {
        expect(ruleValidator.safeParse(invalid).success).toBe(false)
        expect(() => decodeRuleText(JSON.stringify(invalid), "invalid.json")).toThrow()
      }
      for (const identity of ["team:name", "team\\name", "team name", "../rule", "namespace/../rule"]) {
        expect(ruleValidator.safeParse({ ...authored, id: identity }).success).toBe(false)
        expect(() => decodeRuleText(JSON.stringify({ ...authored, id: identity }), "invalid.json")).toThrow()
      }
      expect(
        ruleValidator.safeParse({
          ...authored,
          inputs: [{ languages: ["typescript"], kind: "schema", dialect: "effect", requires: [] }]
        }).success
      ).toBe(true)

      const second = runGenerator(root, "--update")
      expect(second.status, second.stderr).toBe(0)
      expect(files.map((path) => readFileSync(path, "utf8"))).toEqual(initial)
      expect(runGenerator(root, "--check").status).toBe(0)
    })
  })

  it("reports all stale or missing artifacts in read-only check mode", () => {
    withFixture((root) => {
      expect(runGenerator(root, "--update").status).toBe(0)
      const readme = join(root, "README.md")
      const schema = join(root, "schemas/review-config-v1.schema.json")
      writeFileSync(readme, readFileSync(readme, "utf8").replace("Configure file selection", "Stale generated text"))
      rmSync(schema)
      const template = join(root, "docs/examples/session-inspection.jsonc")
      writeFileSync(template, readFileSync(template, "utf8").replace(": true", ": false"))
      const factPaths = [...new Set(documentationFacts().map((fact) => fact.path))]
      for (const name of factPaths) {
        const path = join(root, name)
        const fact = documentationFacts().find((fact) => fact.path === name)!
        writeFileSync(path, readFileSync(path, "utf8").replace(fact.text, "Stale fact"))
      }
      const before = generatedFiles(root)
        .filter((path) => path !== schema)
        .map((path) => [path, readFileSync(path, "utf8")] as const)

      const checked = runGenerator(root, "--check")
      expect(checked.status).toBe(1)
      for (const name of factPaths) expect(checked.stdout).toContain(name)
      expect(checked.stdout).toContain("README.md")
      expect(checked.stdout).toContain("review-config-v1.schema.json")
      expect(checked.stdout).toContain("docs/examples/session-inspection.jsonc")
      expect(before.map(([path]) => readFileSync(path, "utf8"))).toEqual(before.map(([, contents]) => contents))
      expect(() => readFileSync(schema, "utf8")).toThrow()
    })
  })

  it("refuses malformed documentation boundaries without partially updating files", () => {
    withFixture((root) => {
      const readme = join(root, "README.md")
      const guide = join(root, "docs/configuration.md")
      const originalReadme = readFileSync(readme, "utf8")
      const malformedGuide = readFileSync(guide, "utf8").replace("<!-- rule-guide:start -->", "")
      writeFileSync(guide, malformedGuide)

      const updated = runGenerator(root, "--update")
      expect(updated.status).toBe(1)
      expect(readFileSync(readme, "utf8")).toBe(originalReadme)
      expect(readFileSync(guide, "utf8")).toBe(malformedGuide)
      expect(() => readFileSync(join(root, "schemas/review-config-v1.schema.json"), "utf8")).toThrow()
    })
  })
})

const parseInvocation = (args: ReadonlyArray<string>) => Effect.runPromise(parseInvocationEffect(args))
