import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeConfigurationText } from "../configuration/decode.ts";
import { resolveConfiguration, type ConfigurationLayer } from "../configuration/resolve.ts";
import { ConfigurationError } from "../configuration/errors.ts";
import { BUNDLED_NOUL_PACK } from "./bundled.ts";
import { compileRules, selectApplicableRules } from "./compiler.ts";
import { loadRulePacks } from "./loader.ts";
import { decodeRulePackText, digestRulePack } from "./schema.ts";
import { selectGlobalPath } from "../policy/file-policy.ts";

const origin = (layer: ConfigurationLayer["name"], source: string) => ({
  layer,
  source,
  field: "packs",
});

const packText = (id = "team", version = "1.0.0") => JSON.stringify({
  schemaVersion: 1,
  id,
  contentVersion: version,
  rules: [{
    id: "has-question",
    question: "Does the artifact contain the authored problem?",
    criteria: { false: "The problem is absent.", true: "The problem is present." },
    threshold: 0.7,
    message: "Review the authored problem.",
    applicability: { includes: ["src/**"], excludes: ["src/generated/**"] },
  }],
});

describe("rule-pack schema and identity", () => {
  it("decodes JSONC, criteria objects, defaults and stable digests", () => {
    const one = decodeRulePackText(`{
      // content meaning is independent from schema version
      "schemaVersion": 1,
      "id": "team",
      "contentVersion": "1.0.0",
      "rules": [{
        "id": "r",
        "question": "Q",
        "criteria": {
          "false": { "what": "No", "examples": ["clear"] },
          "true": { "what": "Yes", "examples": ["violation"] }
        },
        "message": "M"
      }]
    }`, "pack.jsonc");
    const two = decodeRulePackText(JSON.stringify({
      rules: [{
        id: "r",
        question: "Q",
        criteria: { false: "No\n\nExamples:\n- clear", true: "Yes\n\nExamples:\n- violation" },
        threshold: 0.7,
        message: "M",
      }],
      contentVersion: "1.0.0",
      id: "team",
      schemaVersion: 1,
    }), "pack.jsonc");
    expect(one.rules[0]?.threshold).toBe(0.7);
    expect(one.rules[0]?.criteria).toEqual(two.rules[0]?.criteria);
    expect(one.contentDigest).toBe(two.contentDigest);
    expect(digestRulePack(one)).toBe(one.contentDigest);
    expect(() => decodeRulePackText('{"schemaVersion":2}', "bad.jsonc")).toThrow(ConfigurationError);
    expect(() => decodeRulePackText('{"schemaVersion":1,"id":"x","contentVersion":"1","rules":[],"other":true}', "bad.jsonc")).toThrow(ConfigurationError);
  });

  it("rejects duplicate rule IDs before compilation", () => {
    expect(() => decodeRulePackText(JSON.stringify({
      schemaVersion: 1,
      id: "team",
      contentVersion: "1",
      rules: [
        { id: "same", question: "Q", criteria: { false: "F", true: "T" }, message: "M" },
        { id: "same", question: "Q", criteria: { false: "F", true: "T" }, message: "M" },
      ],
    }), "duplicate.jsonc")).toThrow(ConfigurationError);
  });
});

describe("layered local pack loading and compilation", () => {
  it("resolves project references from the originating config and matches from repository root", async () => {
    const root = mkdtempSync(join(tmpdir(), "review-rules-root-"));
    try {
      const configPath = join(root, ".review.jsonc");
      const packPath = join(root, "rules", "team.jsonc");
      const source = join(root, "rules");
      const { mkdirSync } = await import("node:fs");
      mkdirSync(source);
      writeFileSync(packPath, packText());
      const layer: ConfigurationLayer = {
        name: "project",
        source: configPath,
        document: decodeConfigurationText('{"version":1,"packs":["rules/team.jsonc"]}', configPath),
      };
      const packs = await loadRulePacks({ root, layers: [layer] });
      const rules = compileRules({ packs, layers: [layer] });
      expect(rules.map((rule) => rule.qualifiedId)).toContain("team/has-question");
      const localRules = rules.filter((rule) => rule.packId === "team");
      expect(selectApplicableRules(localRules, "const x = 1", "src/a.ts")).toHaveLength(1);
      expect(selectApplicableRules(localRules, "const x = 1", "src/generated/a.ts")).toHaveLength(0);
      expect(selectApplicableRules(localRules, "const x = 1", "docs/a.ts")).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps repository-relative matching stable when a pack is relocated", async () => {
    const root = mkdtempSync(join(tmpdir(), "review-rules-relocated-"));
    try {
      const configDirectory = join(root, "config");
      const packDirectory = join(configDirectory, "rules");
      const configPath = join(configDirectory, "review.jsonc");
      const packPath = join(packDirectory, "team.jsonc");
      const { mkdirSync } = await import("node:fs");
      mkdirSync(packDirectory, { recursive: true });
      writeFileSync(packPath, packText());
      const layer: ConfigurationLayer = {
        name: "project",
        source: configPath,
        document: decodeConfigurationText('{"version":1,"packs":["rules/team.jsonc"]}', configPath),
      };
      const packs = await loadRulePacks({ root, layers: [layer] });
      const rules = compileRules({ packs, layers: [layer] });
      const localRules = rules.filter((rule) => rule.packId === "team");
      expect(localRules).toHaveLength(1);
      expect(localRules[0]?.source).toBe(packPath);
      expect(selectApplicableRules(localRules, "const x = 1", "src/relocated.ts")).toHaveLength(1);
      expect(selectApplicableRules(localRules, "const x = 1", "config/src/relocated.ts")).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects project path escapes, rebinding, and unknown overrides", async () => {
    const root = mkdtempSync(join(tmpdir(), "review-rules-root-"));
    const outside = mkdtempSync(join(tmpdir(), "review-rules-outside-"));
    try {
      const configPath = join(root, ".review.jsonc");
      const outsidePack = join(outside, "team.jsonc");
      writeFileSync(outsidePack, packText());
      const escapeLayer: ConfigurationLayer = {
        name: "project",
        source: configPath,
        document: decodeConfigurationText(JSON.stringify({ version: 1, packs: [outsidePack] }), configPath),
      };
      await expect(loadRulePacks({ root, layers: [escapeLayer] })).rejects.toThrow(ConfigurationError);

      const first = join(root, "first.jsonc");
      const second = join(root, "second.jsonc");
      writeFileSync(first, packText("same", "1.0.0"));
      writeFileSync(second, packText("same", "2.0.0"));
      const rebindLayer: ConfigurationLayer = {
        name: "project",
        source: configPath,
        document: decodeConfigurationText(JSON.stringify({ version: 1, packs: ["first.jsonc", "second.jsonc"] }), configPath),
      };
      await expect(loadRulePacks({ root, layers: [rebindLayer] })).rejects.toThrow(ConfigurationError);

      const pack = decodeRulePackText(packText(), first);
      const loaded = [{
        ...pack,
        path: first,
        enabled: true,
        origin: origin("project", configPath),
      }];
      expect(() => compileRules({
        packs: loaded,
        overrides: { "unknown/rule": { enabled: false } },
      })).toThrow(ConfigurationError);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("lets pack disable veto an enabled rule and keeps distinct local IDs separate", () => {
    const team = decodeRulePackText(packText("team"), "team.jsonc");
    const other = decodeRulePackText(packText("other"), "other.jsonc");
    const layers: ConfigurationLayer[] = [{
      name: "project",
      source: ".review.jsonc",
      document: decodeConfigurationText(JSON.stringify({
        version: 1,
        ruleOverrides: {
          team: { enabled: false },
          "team/has-question": { enabled: true },
        },
      }), ".review.jsonc"),
    }];
    const packs = [
      { ...team, path: "team.jsonc", enabled: true, origin: origin("project", ".review.jsonc") },
      { ...other, path: "other.jsonc", enabled: true, origin: origin("project", ".review.jsonc") },
      { ...BUNDLED_NOUL_PACK, path: "built-in:noul", enabled: false, origin: origin("built-in", "built-in:noul") },
    ];
    const rules = compileRules({ packs, layers });
    expect(rules.map((rule) => rule.qualifiedId)).toContain("other/has-question");
    expect(rules.map((rule) => rule.qualifiedId)).not.toContain("team/has-question");
  });
});

describe("bounded rule selection combinations", () => {
  it("executes all 128 Boolean gates through production configuration, compilation, and selection", () => {
    const pack = decodeRulePackText(JSON.stringify({
      schemaVersion: 1,
      id: "selection",
      contentVersion: "1",
      rules: [{
        id: "candidate",
        question: "Does this candidate require review?",
        criteria: { false: "No.", true: "Yes." },
        message: "Review this candidate.",
      }],
    }), "selection.jsonc");
    const source = "const candidate = true;";
    const path = "src/candidate.ts";
    for (let mask = 0; mask < 128; mask += 1) {
      const consent = (mask & 1) !== 0;
      const globalInclude = (mask & 2) !== 0;
      const globalExclude = (mask & 4) !== 0;
      const packEnabled = (mask & 8) !== 0;
      const ruleEnabled = (mask & 16) !== 0;
      const ruleInclude = (mask & 32) !== 0;
      const ruleExclude = (mask & 64) !== 0;
      const layer: ConfigurationLayer = {
        name: "project",
        source: "selection.jsonc",
        document: decodeConfigurationText(JSON.stringify({
          version: 1,
          ...(globalInclude ? { includes: ["src/**"] } : { includes: [] }),
          ...(globalExclude ? { excludes: ["src/**"] } : {}),
          ruleOverrides: {
            "selection/candidate": {
              enabled: ruleEnabled,
              includes: ruleInclude ? ["src/**"] : ["never/**"],
              excludes: ruleExclude ? ["src/**"] : [],
            },
          },
        }), "selection.jsonc"),
      };
      const compiled = compileRules({
        packs: [{
          ...pack,
          path: "selection.jsonc",
          enabled: packEnabled,
          origin: origin("project", "selection.jsonc"),
        }],
        layers: [layer],
      });
      const policy = resolveConfiguration([layer], "/repo");
      const globallySelected = selectGlobalPath(policy, path).selected;
      const selected = selectApplicableRules(compiled, source, path).length > 0;
      // The mask with every positive gate set and both exclusion gates clear is
      // the only complete dispatch case. This expected
      // value is independent of the helper that used to mirror the gate
      // expression and is now checked against the production seams above.
      expect(consent && globallySelected && selected, `mask ${mask}`).toBe(mask === 59);
    }
  });
});
