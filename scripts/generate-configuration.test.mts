import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fromJSONSchema } from "zod/v4";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { decodeConfigurationText } from "../src/configuration/decode.ts";
import { decodeRulePackText } from "../src/rules/schema.ts";
import { renderConfigurationArtifacts } from "./generate-configuration.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generator = join(repositoryRoot, "scripts/generate-configuration.ts");

const withFixture = (run: (root: string) => void): void => {
  const root = mkdtempSync(join(tmpdir(), "configuration-generator-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(
    join(root, "README.md"),
    "Authored README before.\n\n<!-- configuration-readme:start -->\nold\n<!-- configuration-readme:end -->\n\nAuthored README after.\n",
  );
  writeFileSync(
    join(root, "docs/configuration.md"),
    "# Configuration\n\nAuthored guide before.\n\n<!-- configuration-guide:start -->\nold\n<!-- configuration-guide:end -->\n\nAuthored pack notes before.\n\n<!-- rule-pack-guide:start -->\nold\n<!-- rule-pack-guide:end -->\n\nAuthored guide after.\n",
  );
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const runGenerator = (root: string, mode: "--update" | "--check") =>
  spawnSync(
    process.execPath,
    ["--experimental-strip-types", generator, mode, "--root", root],
    { cwd: repositoryRoot, encoding: "utf8" },
  );

const generatedFiles = (root: string): ReadonlyArray<string> => [
  join(root, "README.md"),
  join(root, "docs/configuration.md"),
  join(root, "schemas/review-config-v1.schema.json"),
  join(root, "schemas/review-rule-pack-v1.schema.json"),
];

const codeBlocks = (markdown: string): ReadonlyArray<string> =>
  [...markdown.matchAll(/```(?:jsonc|json)\n([\s\S]*?)\n```/gu)].map((match) => match[1] ?? "");

describe("configuration documentation generator", () => {
  it("reflects a changed Effect Schema field in both generated outputs", () => {
    const changedSchema = Schema.Struct({
      version: Schema.Literal(1),
      reviewWindow: Schema.Finite.check(
        Schema.isBetween({ minimum: 2, maximum: 9 }),
      ).annotate({
        description: "Declared on the Effect Schema for this test.",
      }),
    });
    const generated = renderConfigurationArtifacts(changedSchema);
    const properties = generated.jsonSchema.properties as Record<string, unknown>;

    expect(properties.reviewWindow).toMatchObject({
      minimum: 2,
      maximum: 9,
      description: "Declared on the Effect Schema for this test.",
    });
    expect(generated.documentation).toContain("`reviewWindow` | number (2–9) | Required");
    expect(generated.documentation).toContain("Declared on the Effect Schema for this test.");
  });

  it("updates the four artifacts deterministically and preserves authored guide text", () => {
    withFixture((root) => {
      const first = runGenerator(root, "--update");
      expect(first.status, first.stderr).toBe(0);
      const files = generatedFiles(root);
      const initial = files.map((path) => readFileSync(path, "utf8"));

      const readme = initial[0] ?? "";
      const guide = initial[1] ?? "";
      expect(readme).toContain("Configure file selection");
      expect(readme).toContain("local rule packs");
      expect(guide).toContain("ruleOverrides.<key>.threshold");
      expect(guide).toContain("`packs[].path` | non-empty string | Required (path form)");
      expect(guide).toContain("`includes` | array of non-empty string (may be empty)");
      expect(guide).toContain("`includes[]` | non-empty string | Array item (array may be empty)");
      expect(guide).toContain("`ruleOverrides` | map of object (may be empty)");
      expect(guide).toContain("`ruleOverrides.<key>` | object | Map value (map may be empty)");
      expect(guide).toContain("`rules` | array of object (may be empty) | Required");
      expect(guide).toContain("`rules[]` | object | Array item (array may be empty)");
      expect(guide.match(/`packs\[\]\.enabled`/gu)).toHaveLength(1);
      expect(readme).toContain("Authored README before.");
      expect(readme).toContain("Authored README after.");
      expect(guide).toContain("Authored guide before.");
      expect(guide).toContain("Authored pack notes before.");
      expect(guide).toContain("Authored guide after.");

      expect(codeBlocks(readme).map((example) =>
        decodeConfigurationText(example, "README configuration example").version,
      )).toEqual([1]);
      const configurationGuideExample = codeBlocks(guide).find((example) => example.includes("\"version\""));
      expect(configurationGuideExample).toBeDefined();
      expect(decodeConfigurationText(configurationGuideExample ?? "", "configuration guide example").version)
        .toBe(1);
      const packExample = codeBlocks(guide).find((example) => example.includes("schemaVersion"));
      expect(packExample).toBeDefined();
      expect(decodeRulePackText(packExample ?? "", "rule-pack guide example").rules[0]?.threshold)
        .toBe(0.7);

      const configurationSchema = JSON.parse(readFileSync(files[2]!, "utf8")) as Record<string, unknown>;
      const rulePackSchema = JSON.parse(readFileSync(files[3]!, "utf8")) as Record<string, unknown>;
      const configurationValidator = fromJSONSchema(configurationSchema);
      const rulePackValidator = fromJSONSchema(rulePackSchema);
      expect(configurationSchema).toMatchObject({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        required: ["version"],
        additionalProperties: false,
        properties: {
          packs: { items: { $ref: "#/$defs/RulePackReference" } },
        },
        $defs: {
          RuleOverride: {
            properties: {
              threshold: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
            },
          },
          RulePackReference: { anyOf: expect.any(Array) },
        },
      });
      expect(rulePackSchema).toMatchObject({
        $ref: "#/$defs/RulePackDocument",
        $defs: {
          RulePackDocument: {
            properties: {
              rules: { items: { $ref: "#/$defs/RuleDefinition" } },
            },
          },
          RuleDefinition: {
            properties: {
              criteria: { $ref: "#/$defs/RuleCriteria" },
              threshold: { minimum: 0, maximum: 1, default: 0.7 },
            },
          },
        },
      });
      expect(configurationValidator.safeParse({ version: 1 }).success).toBe(true);
      expect(configurationValidator.safeParse({
        version: 1,
        includes: [],
        excludes: [],
        packs: [],
        ruleOverrides: {},
      }).success).toBe(true);
      expect(configurationValidator.safeParse({
        version: 1,
        ruleOverrides: { "team/check": { threshold: 0.5 } },
        packs: [{ path: "rules.jsonc", enabled: true }],
      }).success).toBe(true);
      expect(configurationValidator.safeParse({ version: 1, consent: true }).success).toBe(false);
      for (const identity of ["team/name", "team:name", "team\\name", "team name"]) {
        const configuration = { version: 1, packs: [{ id: identity }] };
        expect(configurationValidator.safeParse(configuration).success).toBe(false);
        expect(() => decodeConfigurationText(JSON.stringify(configuration), "invalid-pack-reference.jsonc"))
          .toThrow();
      }
      expect(configurationValidator.safeParse({
        version: 1,
        settings: { deadlineMs: 60_001 },
      }).success).toBe(false);
      expect(configurationValidator.safeParse({
        version: 1,
        ruleOverrides: { "team/check": { threshold: 1.1 } },
      }).success).toBe(false);
      expect(configurationValidator.safeParse({
        version: 1,
        packs: [{ path: "rules.jsonc", id: "team" }],
      }).success).toBe(false);
      expect(rulePackValidator.safeParse({
        schemaVersion: 1,
        id: "team",
        contentVersion: "1.0.0",
        rules: [],
      }).success).toBe(true);
      expect(rulePackValidator.safeParse({
        schemaVersion: 1,
        id: "team",
        contentVersion: "1.0.0",
        rules: [{
          id: "check",
          question: "Is the rule satisfied?",
          criteria: { false: "No", true: "Yes" },
          message: "Check this rule.",
        }],
      }).success).toBe(true);
      expect(rulePackValidator.safeParse({
        version: 1,
        packId: "team",
        packVersion: "1.0.0",
        rules: [],
      }).success).toBe(false);
      for (const identity of ["team/name", "team:name", "team\\name", "team name"]) {
        expect(rulePackValidator.safeParse({
          schemaVersion: 1,
          id: identity,
          contentVersion: "1.0.0",
          rules: [],
        }).success).toBe(false);
        expect(() => decodeRulePackText(JSON.stringify({
          schemaVersion: 1,
          id: identity,
          contentVersion: "1.0.0",
          rules: [],
        }), "invalid-identity.jsonc")).toThrow();
        expect(rulePackValidator.safeParse({
          schemaVersion: 1,
          id: "team",
          contentVersion: "1.0.0",
          rules: [{
            id: identity,
            question: "Is the rule satisfied?",
            criteria: { false: "No", true: "Yes" },
            message: "Check this rule.",
          }],
        }).success).toBe(false);
        expect(() => decodeRulePackText(JSON.stringify({
          schemaVersion: 1,
          id: "team",
          contentVersion: "1.0.0",
          rules: [{
            id: identity,
            question: "Is the rule satisfied?",
            criteria: { false: "No", true: "Yes" },
            message: "Check this rule.",
          }],
        }), "invalid-rule-identity.jsonc")).toThrow();
      }
      expect(rulePackValidator.safeParse({
        schemaVersion: 1,
        id: "team",
        contentVersion: "1.0.0",
        rules: [{
          id: "check",
          question: "Is the rule satisfied?",
          criteria: { false: "No", true: "Yes" },
          message: "Check this rule.",
          threshold: 1.1,
        }],
      }).success).toBe(false);
      expect(readFileSync(files[2]!, "utf8")).toContain("\"$defs\"");

      const second = runGenerator(root, "--update");
      expect(second.status, second.stderr).toBe(0);
      expect(files.map((path) => readFileSync(path, "utf8"))).toEqual(initial);
      expect(runGenerator(root, "--check").status).toBe(0);
    });
  });

  it("reports all stale or missing artifacts in read-only check mode", () => {
    withFixture((root) => {
      expect(runGenerator(root, "--update").status).toBe(0);
      const readme = join(root, "README.md");
      const schema = join(root, "schemas/review-config-v1.schema.json");
      writeFileSync(
        readme,
        readFileSync(readme, "utf8").replace("Configure file selection", "Stale generated text"),
      );
      rmSync(schema);
      const before = generatedFiles(root)
        .filter((path) => path !== schema)
        .map((path) => [path, readFileSync(path, "utf8")] as const);

      const checked = runGenerator(root, "--check");
      expect(checked.status).toBe(1);
      expect(checked.stdout).toContain("README.md");
      expect(checked.stdout).toContain("review-config-v1.schema.json");
      expect(before.map(([path]) => readFileSync(path, "utf8"))).toEqual(
        before.map(([, contents]) => contents),
      );
      expect(() => readFileSync(schema, "utf8")).toThrow();
    });
  });

  it("refuses malformed documentation boundaries without partially updating files", () => {
    withFixture((root) => {
      const readme = join(root, "README.md");
      const guide = join(root, "docs/configuration.md");
      const originalReadme = readFileSync(readme, "utf8");
      const malformedGuide = readFileSync(guide, "utf8").replace("<!-- rule-pack-guide:start -->", "");
      writeFileSync(guide, malformedGuide);

      const updated = runGenerator(root, "--update");
      expect(updated.status).toBe(1);
      expect(readFileSync(readme, "utf8")).toBe(originalReadme);
      expect(readFileSync(guide, "utf8")).toBe(malformedGuide);
      expect(() => readFileSync(join(root, "schemas/review-config-v1.schema.json"), "utf8"))
        .toThrow();
    });
  });
});
