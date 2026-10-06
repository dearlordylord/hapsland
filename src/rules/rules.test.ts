import { Effect } from "effect"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { decodeConfigurationDocument } from "../configuration/decode.ts"
import { compileRule, compileRules, selectApplicableRules } from "./compiler.ts"
import { loadRules } from "./loader.ts"
import { decodeRuleDocument, digestRuleDefinition } from "./schema.ts"
import { SHIPPED_DEFAULT_RULES } from "./shipped.ts"
import { TYPE_INPUT_CONTRACT, TYPE_CAPABILITIES } from "./targets.ts"
const rule = {
  version: 1,
  id: "team/state",
  question: "Is state invalid?",
  criteria: { false: "valid", true: "invalid" },
  message: "Fix state",
  inputs: [{ languages: ["typescript"], kind: "type", requires: ["root-declaration"] }]
}
describe("individual rules", () => {
  it("requires a known path when configuration restricts file selection", () => {
    const compiled = compileRule(rule, "rule.json")
    for (const applicability of [{ includes: [] }, { includes: ["src/**"] }, { excludes: ["private/**"] }]) {
      expect(selectApplicableRules([{ ...compiled, applicability }], "")).toEqual([])
    }
    expect(selectApplicableRules([{ ...compiled, applicability: { excludes: [] } }], "")).toHaveLength(1)
    expect(selectApplicableRules([{ ...compiled, applicability: { includes: [] } }], "", "src/state.ts")).toEqual([])
    expect(
      selectApplicableRules([{ ...compiled, applicability: { includes: ["src/**"] } }], "", "src/state.ts")
    ).toHaveLength(1)
  })
  it("preserves default identities and semantic definition digests", () => {
    expect(SHIPPED_DEFAULT_RULES.map((rule) => rule.id)).toEqual([
      "meaningless_combinations",
      "split_correlations",
      "absence_confusion",
      "bare_domain_value",
      "name_wider_than_type",
      "name_claims_resource",
      "body_reaches_undeclared"
    ])
    expect(digestRuleDefinition(decodeRuleDocument(rule, "a"))).toBe(
      digestRuleDefinition(decodeRuleDocument({ ...rule }, "b"))
    )
    expect(compileRule(rule, "a").id).toBe("team/state")
  })
  it("rejects removed fields and malformed input pairs", () => {
    for (const field of ["minimumRung", "applicability", "contentVersion", "reviewTargets"])
      expect(() => decodeRuleDocument({ ...rule, [field]: 1 }, "rule.json")).toThrow()
    expect(() => decodeRuleDocument({ ...rule, inputs: [] }, "rule.json")).toThrow()
    expect(() => decodeRuleDocument({ ...rule, inputs: [...rule.inputs, ...rule.inputs] }, "rule.json")).toThrow(
      expect.objectContaining({ reason: expect.stringContaining("duplicate input") })
    )
    expect(() => decodeConfigurationDocument({ version: 1, rules: [{ path: "a", id: "b" }] }, "config")).toThrow()
  })
  it("reports unsupported selected schema inputs explicitly", () => {
    expect(() =>
      compileRule(
        { ...rule, inputs: [{ languages: ["typescript"], kind: "schema", dialect: "effect", requires: [] }] },
        "a"
      )
    ).toThrow(
      expect.objectContaining({ reason: expect.stringContaining("unsupported selected input 'typescript:schema'") })
    )
  })
  it("matches language and kind as an authored pair", () => {
    const compiled = compileRule(
      {
        ...rule,
        inputs: [
          { languages: ["rust"], kind: "type", requires: [] },
          { languages: ["typescript"], kind: "function", requires: [] }
        ]
      },
      "a"
    )
    const target = {
      language: "typescript",
      artifactKind: "typeShape",
      inputContract: TYPE_INPUT_CONTRACT,
      complete: true,
      capabilities: TYPE_CAPABILITIES
    } as const
    expect(selectApplicableRules([compiled], "", "a.ts", target)).toHaveLength(0)
    expect(selectApplicableRules([compiled], "", "a.rs", { ...target, language: "rust" })).toHaveLength(1)
  })
  it("merges inherited settings and accumulates excludes while replacing includes", async () => {
    const root = mkdtempSync(join(tmpdir(), "rules-"))
    try {
      const path = join(root, "rule.json")
      writeFileSync(path, JSON.stringify(rule))
      const layers = [
        {
          name: "user",
          source: join(root, "user.json"),
          document: decodeConfigurationDocument(
            { version: 1, rules: [{ path, includes: ["old/**"], excludes: ["**/old.ts"], threshold: 0.2 }] },
            "user"
          )
        },
        {
          name: "project",
          source: join(root, "project.json"),
          document: decodeConfigurationDocument(
            { version: 1, rules: [{ id: rule.id, includes: ["src/**"], excludes: ["**/new.ts"], message: "Updated" }] },
            "project"
          )
        }
      ] as const
      const loaded = await Effect.runPromise(loadRules({ root, layers }))
      const compiled = compileRules({ rules: loaded })[0]
      expect(compiled?.applicability).toEqual({ includes: ["src/**"], excludes: ["**/old.ts", "**/new.ts"] })
      expect(compiled?.threshold).toBe(0.2)
      expect(compiled?.message).toBe("Updated")
      writeFileSync(join(root, "other.json"), JSON.stringify(rule))
      await expect(
        Effect.runPromise(
          loadRules({
            root,
            layers: [{ ...layers[0], document: { version: 1, rules: [path, join(root, "other.json")] } }]
          })
        )
      ).rejects.toThrow(expect.objectContaining({ reason: expect.stringMatching(/rule.json.*other.json/) }))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
