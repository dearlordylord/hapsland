import { Effect } from "effect"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { decodeConfigurationText } from "../configuration/decode.ts"
import { resolveConfiguration, type ConfigurationLayer } from "../configuration/resolve.ts"
import { ConfigurationError } from "../configuration/errors.ts"
import { SHIPPED_DEFAULT_PACK } from "./shipped.ts"
import { compileRules, selectApplicableRules } from "./compiler.ts"
import { loadRulePacks } from "./loader.ts"
import { decodeRulePackText, digestRulePack } from "./schema.ts"
import { selectGlobalPath } from "../policy/file-policy.ts"
import { TYPE_INPUT_CONTRACT } from "./targets.ts"

const origin = (layer: ConfigurationLayer["name"], source: string) => ({ layer, source, field: "packs" })

const packText = (id = "team", version = "1.0.0") =>
  JSON.stringify({
    schemaVersion: 1,
    id,
    contentVersion: version,
    rules: [
      {
        id: "has-question",
        question: "Does the artifact contain the authored problem?",
        criteria: { false: "The problem is absent.", true: "The problem is present." },
        threshold: 0.7,
        message: "Review the authored problem.",
        applicability: { includes: ["src/**"], excludes: ["src/generated/**"] },
        reviewTargets: [
          {
            artifactKind: "typeShape",
            inputContract: TYPE_INPUT_CONTRACT,
            capabilities: ["root-declaration", "resolved-outbound-types", "selected-source-type-closure"]
          }
        ]
      }
    ]
  })

describe("rule-pack schema and identity", () => {
  it("keeps current identities stable and rejects unknown result forms", () => {
    const document = JSON.parse(packText()) as Record<string, unknown>
    const baseline = decodeRulePackText(JSON.stringify(document), "pack.jsonc")
    expect(decodeRulePackText(JSON.stringify(document), "pack.jsonc").contentDigest).toBe(baseline.contentDigest)
    expect(baseline.rules[0]?.threshold).toBe(0.7)
    const rule = (document.rules as Array<Record<string, unknown>>)[0]!
    for (const [field, declaration] of [
      ["resultForm", { kind: "choice", options: ["yes", "no"] }],
      ["resultForm", { kind: "score", range: [0, 5] }]
    ] as const) {
      const candidate = { ...document, rules: [{ ...rule, [field]: declaration }] }
      expect(() => decodeRulePackText(JSON.stringify(candidate), "future.jsonc")).toThrowError(
        expect.objectContaining({ source: "future.jsonc", field: `rules[0].${field}` })
      )
    }
    expect(() =>
      decodeRulePackText(JSON.stringify({ ...document, schemaVersion: "unsupported" }), "future.jsonc")
    ).toThrowError(expect.objectContaining({ source: "future.jsonc", field: "schemaVersion" }))
  })

  it("decodes canonical JSONC, inserts defaults and creates stable digests", () => {
    const one = decodeRulePackText(
      `{
      // content meaning is independent from JSONC formatting
      "schemaVersion": 1,
      "id": "team",
      "contentVersion": "1.0.0",
      "rules": [{
        "id": "r",
        "question": "Q",
        "criteria": { "false": "No", "true": "Yes" },
        "message": "M",
        "reviewTargets": [{"artifactKind":"typeShape","inputContract":"direct-event/type-shape/v1","capabilities":["root-declaration"]}]
      }]
    }`,
      "pack.jsonc"
    )
    const two = decodeRulePackText(
      JSON.stringify({
        rules: [
          {
            id: "r",
            question: "Q",
            criteria: { false: "No", true: "Yes" },
            threshold: 0.7,
            message: "M",
            reviewTargets: [
              { artifactKind: "typeShape", inputContract: TYPE_INPUT_CONTRACT, capabilities: ["root-declaration"] }
            ]
          }
        ],
        contentVersion: "1.0.0",
        id: "team",
        schemaVersion: 1
      }),
      "pack.jsonc"
    )
    expect(one.rules[0]?.threshold).toBe(0.7)
    expect(one.rules[0]?.criteria).toEqual(two.rules[0]?.criteria)
    expect(one.contentDigest).toBe(two.contentDigest)
    expect(digestRulePack(one)).toBe(one.contentDigest)
    expect(() => decodeRulePackText('{"schemaVersion":null}', "bad.jsonc")).toThrow(ConfigurationError)
    expect(() =>
      decodeRulePackText('{"schemaVersion":1,"id":"x","contentVersion":"1","rules":[],"other":true}', "bad.jsonc")
    ).toThrow(ConfigurationError)
    for (const alias of [
      '{"version":1,"id":"team","contentVersion":"1","rules":[]}',
      '{"schemaVersion":1,"packId":"team","contentVersion":"1","rules":[]}',
      '{"schemaVersion":1,"id":"team","packVersion":"1","rules":[]}',
      JSON.stringify({
        schemaVersion: 1,
        id: "team",
        contentVersion: "1",
        rules: [
          { id: "r", question: "Q", criteria: { false: "F", true: "T" }, defaultThreshold: 0.5, defaultMessage: "M" }
        ]
      }),
      JSON.stringify({
        schemaVersion: 1,
        id: "team",
        contentVersion: "1",
        rules: [{ id: "r", question: "Q", criteria: { false: { what: "F" }, true: "T" }, message: "M" }]
      })
    ]) {
      expect(() => decodeRulePackText(alias, "noncanonical.jsonc")).toThrow(ConfigurationError)
    }
    try {
      decodeRulePackText(
        JSON.stringify({
          schemaVersion: 1,
          id: "team",
          contentVersion: "1.0.0",
          rules: [
            {
              id: "check",
              question: "Q",
              criteria: { false: "F", true: "T" },
              message: 17,
              reviewTargets: [
                { artifactKind: "typeShape", inputContract: TYPE_INPUT_CONTRACT, capabilities: ["root-declaration"] }
              ]
            }
          ]
        }),
        "bounded-pack.jsonc"
      )
      throw new Error("expected schema failure")
    } catch (error) {
      expect(error).toMatchObject({ source: "bounded-pack.jsonc", field: "rules[0].message" })
    }
    expect(() =>
      decodeRulePackText(
        JSON.stringify({
          schemaVersion: 1,
          id: "team",
          contentVersion: "1.0.0",
          rules: [
            {
              id: "check",
              question: "Q",
              criteria: { false: "F", true: "T" },
              message: "M",
              reviewTargets: [
                { artifactKind: "typeShape", inputContract: TYPE_INPUT_CONTRACT, capabilities: ["root-declaration"] }
              ],
              applicability: { includes: ["../src/**"] }
            }
          ]
        }),
        "invalid-pattern.jsonc"
      )
    ).toThrowError(
      expect.objectContaining({ source: "invalid-pattern.jsonc", field: "rules[0].applicability.includes[0]" })
    )
  })

  it("rejects duplicate rule IDs before compilation", () => {
    expect(() =>
      decodeRulePackText(
        JSON.stringify({
          schemaVersion: 1,
          id: "team",
          contentVersion: "1",
          rules: [
            {
              id: "same",
              question: "Q",
              criteria: { false: "F", true: "T" },
              message: "M",
              reviewTargets: [
                { artifactKind: "typeShape", inputContract: TYPE_INPUT_CONTRACT, capabilities: ["root-declaration"] }
              ]
            },
            {
              id: "same",
              question: "Q",
              criteria: { false: "F", true: "T" },
              message: "M",
              reviewTargets: [
                { artifactKind: "typeShape", inputContract: TYPE_INPUT_CONTRACT, capabilities: ["root-declaration"] }
              ]
            }
          ]
        }),
        "duplicate.jsonc"
      )
    ).toThrow(ConfigurationError)
  })
})

describe("layered local pack loading and compilation", () => {
  it("resolves project references from the originating config and matches from repository root", async () => {
    const root = mkdtempSync(join(tmpdir(), "review-rules-root-"))
    try {
      const configPath = join(root, ".hapsland.jsonc")
      const packPath = join(root, "rules", "team.jsonc")
      const source = join(root, "rules")
      const { mkdirSync } = await import("node:fs")
      mkdirSync(source)
      writeFileSync(packPath, packText())
      const layer: ConfigurationLayer = {
        name: "project",
        source: configPath,
        document: decodeConfigurationText('{"version":1,"packs":["rules/team.jsonc"]}', configPath)
      }
      const packs = await Effect.runPromise(loadRulePacks({ root, layers: [layer] }))
      const rules = compileRules({ packs, layers: [layer] })
      expect(rules.map((rule) => rule.qualifiedId)).toContain("team/has-question")
      const localRules = rules.filter((rule) => rule.packId === "team")
      expect(selectApplicableRules(localRules, "const x = 1", "src/a.ts")).toHaveLength(1)
      expect(selectApplicableRules(localRules, "const x = 1", "src/generated/a.ts")).toHaveLength(0)
      expect(selectApplicableRules(localRules, "const x = 1", "docs/a.ts")).toHaveLength(0)
      expect(
        selectApplicableRules(localRules, "const x = 1", "src/a.ts", {
          artifactKind: "typeShape",
          inputContract: TYPE_INPUT_CONTRACT,
          complete: false
        })
      ).toHaveLength(0)
      expect(
        selectApplicableRules(localRules, "const x = 1", "src/a.ts", {
          artifactKind: "function",
          inputContract: "direct-event/function/v1",
          complete: true
        })
      ).toHaveLength(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("keeps repository-relative matching stable when a pack is relocated", async () => {
    const root = mkdtempSync(join(tmpdir(), "review-rules-relocated-"))
    try {
      const configDirectory = join(root, "config")
      const packDirectory = join(configDirectory, "rules")
      const configPath = join(configDirectory, "review.jsonc")
      const packPath = join(packDirectory, "team.jsonc")
      const { mkdirSync } = await import("node:fs")
      mkdirSync(packDirectory, { recursive: true })
      writeFileSync(packPath, packText())
      const layer: ConfigurationLayer = {
        name: "project",
        source: configPath,
        document: decodeConfigurationText('{"version":1,"packs":["rules/team.jsonc"]}', configPath)
      }
      const packs = await Effect.runPromise(loadRulePacks({ root, layers: [layer] }))
      const rules = compileRules({ packs, layers: [layer] })
      const localRules = rules.filter((rule) => rule.packId === "team")
      expect(localRules).toHaveLength(1)
      expect(localRules[0]?.source).toBe(packPath)
      expect(selectApplicableRules(localRules, "const x = 1", "src/relocated.ts")).toHaveLength(1)
      expect(selectApplicableRules(localRules, "const x = 1", "config/src/relocated.ts")).toHaveLength(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects project path escapes, rebinding, and unknown overrides", async () => {
    const root = mkdtempSync(join(tmpdir(), "review-rules-root-"))
    const outside = mkdtempSync(join(tmpdir(), "review-rules-outside-"))
    try {
      const configPath = join(root, ".hapsland.jsonc")
      const outsidePack = join(outside, "team.jsonc")
      writeFileSync(outsidePack, packText())
      const escapeLayer: ConfigurationLayer = {
        name: "project",
        source: configPath,
        document: decodeConfigurationText(JSON.stringify({ version: 1, packs: [outsidePack] }), configPath)
      }
      await expect(Effect.runPromise(loadRulePacks({ root, layers: [escapeLayer] }))).rejects.toThrow(
        ConfigurationError
      )

      const first = join(root, "first.jsonc")
      const second = join(root, "second.jsonc")
      writeFileSync(first, packText("same", "1.0.0"))
      writeFileSync(second, packText("same", "2.0.0"))
      const rebindLayer: ConfigurationLayer = {
        name: "project",
        source: configPath,
        document: decodeConfigurationText(
          JSON.stringify({ version: 1, packs: ["first.jsonc", "second.jsonc"] }),
          configPath
        )
      }
      await expect(Effect.runPromise(loadRulePacks({ root, layers: [rebindLayer] }))).rejects.toThrow(
        ConfigurationError
      )

      const pack = decodeRulePackText(packText(), first)
      const loaded = [{ ...pack, path: first, enabled: true, origin: origin("project", configPath) }]
      expect(() => compileRules({ packs: loaded, overrides: { "unknown/rule": { enabled: false } } })).toThrow(
        ConfigurationError
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it("lets pack disable veto an enabled rule and keeps distinct local IDs separate", () => {
    const team = decodeRulePackText(packText("team"), "team.jsonc")
    const other = decodeRulePackText(packText("other"), "other.jsonc")
    const layers: ConfigurationLayer[] = [
      {
        name: "project",
        source: ".hapsland.jsonc",
        document: decodeConfigurationText(
          JSON.stringify({
            version: 1,
            ruleOverrides: { team: { enabled: false }, "team/has-question": { enabled: true } }
          }),
          ".hapsland.jsonc"
        )
      }
    ]
    const packs = [
      { ...team, path: "team.jsonc", enabled: true, origin: origin("project", ".hapsland.jsonc") },
      { ...other, path: "other.jsonc", enabled: true, origin: origin("project", ".hapsland.jsonc") },
      { ...SHIPPED_DEFAULT_PACK, path: "built-in:noul", enabled: false, origin: origin("built-in", "built-in:noul") }
    ]
    const rules = compileRules({ packs, layers })
    expect(rules.map((rule) => rule.qualifiedId)).toContain("other/has-question")
    expect(rules.map((rule) => rule.qualifiedId)).not.toContain("team/has-question")
  })
})

describe("bounded rule selection combinations", () => {
  it("executes all 128 Boolean gates through production configuration, compilation, and selection", () => {
    const rawPack = {
      schemaVersion: 1,
      id: "selection",
      contentVersion: "1",
      rules: [
        {
          id: "candidate",
          question: "Does this candidate require review?",
          criteria: { false: "No.", true: "Yes." },
          message: "Review this candidate.",
          reviewTargets: [
            {
              artifactKind: "typeShape",
              inputContract: TYPE_INPUT_CONTRACT,
              capabilities: ["root-declaration", "resolved-outbound-types", "selected-source-type-closure"]
            }
          ]
        }
      ]
    }
    const pack = decodeRulePackText(JSON.stringify(rawPack), "selection.jsonc")
    const source = "const candidate = true;"
    const path = "src/candidate.ts"
    for (let mask = 0; mask < 128; mask += 1) {
      const consent = (mask & 1) !== 0
      const globalInclude = (mask & 2) !== 0
      const globalExclude = (mask & 4) !== 0
      const packEnabled = (mask & 8) !== 0
      const ruleEnabled = (mask & 16) !== 0
      const ruleInclude = (mask & 32) !== 0
      const ruleExclude = (mask & 64) !== 0
      const layer: ConfigurationLayer = {
        name: "project",
        source: "selection.jsonc",
        document: decodeConfigurationText(
          JSON.stringify({
            version: 1,
            ...(globalInclude ? { includes: ["src/**"] } : { includes: [] }),
            ...(globalExclude ? { excludes: ["src/**"] } : {}),
            ruleOverrides: {
              "selection/candidate": {
                enabled: ruleEnabled,
                includes: ruleInclude ? ["src/**"] : ["never/**"],
                excludes: ruleExclude ? ["src/**"] : []
              }
            }
          }),
          "selection.jsonc"
        )
      }
      const compiled = compileRules({
        packs: [
          { ...pack, path: "selection.jsonc", enabled: packEnabled, origin: origin("project", "selection.jsonc") }
        ],
        layers: [layer]
      })
      const policy = resolveConfiguration([layer], "/repo")
      const globallySelected = selectGlobalPath(policy, path).selected
      const selected = selectApplicableRules(compiled, source, path).length > 0
      // The mask with every positive gate set and both exclusion gates clear is
      // the only complete dispatch case. This expected
      // value is independent of the helper that used to mirror the gate
      // expression and is now checked against the production seams above.
      expect(consent && globallySelected && selected, `mask ${mask}`).toBe(mask === 59)
    }
  })
})

describe("rule-pack reference validation", () => {
  it("rejects malformed references with their exact configuration origin before reading files", async () => {
    const root = mkdtempSync(join(tmpdir(), "rule-reference-validation-"))
    const source = join(root, "review.jsonc")
    try {
      for (const [value, field] of [
        ["", "packs[0]"],
        [null, "packs[0]"],
        [42, "packs[0]"],
        [[], "packs[0]"],
        [{}, "packs[0]"],
        [{ path: "missing.json", id: "noul" }, "packs[0]"],
        [{ path: "" }, "packs[0].path"],
        [{ path: 42 }, "packs[0].path"],
        [{ id: "" }, "packs[0].id"],
        [{ id: 42 }, "packs[0].id"],
        [{ id: "noul", enabled: "yes" }, "packs[0].enabled"],
        [{ id: "noul", extra: true }, "packs[0].extra"]
      ] as const) {
        const result = await Effect.runPromise(
          loadRulePacks({
            root,
            layers: [{ name: "project", source, document: JSON.parse(JSON.stringify({ version: 1, packs: [value] })) }]
          }).pipe(Effect.result)
        )
        expect(result._tag).toBe("Failure")
        if (result._tag === "Failure") {
          expect(result.failure).toBeInstanceOf(ConfigurationError)
          expect(result.failure).toMatchObject({ source, field })
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("preserves omitted enablement when the same file is redeclared in a higher layer", async () => {
    const root = mkdtempSync(join(tmpdir(), "rule-reference-redeclaration-"))
    const path = join(root, "team.jsonc")
    writeFileSync(path, packText())
    try {
      for (const enabled of [undefined, true, false]) {
        const packs = await Effect.runPromise(
          loadRulePacks({
            root,
            layers: [
              {
                name: "user",
                source: join(root, "user.jsonc"),
                document: { version: 1, packs: [{ path, enabled: false }] }
              },
              {
                name: "project",
                source: join(root, "project.jsonc"),
                document: { version: 1, packs: [{ path, ...(enabled === undefined ? {} : { enabled }) }] }
              }
            ]
          })
        )
        expect(packs).toHaveLength(1)
        expect(packs[0]?.enabled).toBe(enabled ?? false)
        expect(packs[0]?.origin.layer).toBe("project")
        expect(packs[0]?.path).toBe(path)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("inherits pack enablement across layers and rejects an undeclared identity", async () => {
    const root = mkdtempSync(join(tmpdir(), "rule-reference-inheritance-"))
    const source = join(root, "review.jsonc")
    const defaults = join(root, "defaults.jsonc")
    writeFileSync(defaults, packText(SHIPPED_DEFAULT_PACK.id))
    try {
      for (const enabled of [undefined, true, false]) {
        const packs = await Effect.runPromise(
          loadRulePacks({
            root,
            layers: [
              { name: "project", source, document: { version: 1, packs: [{ path: defaults, enabled: false }] } },
              {
                name: "user",
                source: join(root, "user.jsonc"),
                document: {
                  version: 1,
                  packs: [{ id: SHIPPED_DEFAULT_PACK.id, ...(enabled === undefined ? {} : { enabled }) }]
                }
              }
            ]
          })
        )
        expect(packs.find((pack) => pack.id === SHIPPED_DEFAULT_PACK.id)?.enabled).toBe(enabled ?? false)
      }
      const result = await Effect.runPromise(
        loadRulePacks({
          root,
          layers: [{ name: "project", source, document: { version: 1, packs: [{ id: "undeclared" }] } }]
        }).pipe(Effect.result)
      )
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") expect(result.failure).toMatchObject({ source, field: "packs" })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
