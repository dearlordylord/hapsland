import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ConfigurationError } from "./errors.ts";
import { decodeConfigurationText, serializeConfigurationDocument } from "./decode.ts";
import { effectiveGraphLimits, resolveConfiguration, stableConfigurationValue } from "./resolve.ts";
import type { ConfigurationLayer } from "./resolve.ts";
import { selectGlobalPath } from "../policy/file-policy.ts";
import { explainPath } from "../explanation/index.ts";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCurrentClaudeFeedbackAuthority } from "./current-claude-authority.ts";

const source = (name: string, value: string): ConfigurationLayer => ({
  name: name as ConfigurationLayer["name"],
  source: `${name}.jsonc`,
  document: decodeConfigurationText(value, `${name}.jsonc`),
});

const builtIn = (): ConfigurationLayer => ({
  name: "built-in",
  source: "built-in",
  document: decodeConfigurationText('{"version":1}', "built-in"),
});

describe("configuration v1 decoding", () => {
  it("keeps old layered documents valid while rejecting undeclared branch and form controls", () => {
    const user = source("user", '{"version":1,"includes":["src/**"],"privacyExcludes":["src/private/**"],"ruleOverrides":{"team/check":{"threshold":0.5}}}');
    const project = source("project", '{"version":1,"excludes":["src/generated/**"],"packs":[{"id":"team","enabled":false}]}');
    const policy = resolveConfiguration([user, project], "/repo");
    expect(selectGlobalPath(policy, "src/ok.ts").selected).toBe(true);
    expect(selectGlobalPath(policy, "src/private/secret.ts").selected).toBe(false);
    expect(selectGlobalPath(policy, "src/generated/a.ts").selected).toBe(false);
    expect(project.document.packs).toEqual([{ id: "team", enabled: false }]);
    for (const [field, value] of [
      ["artifactKinds", ["function"]],
      ["resultForms", ["choice"]],
      ["ruleOverrides", { "team/check": { resultForm: "score" } }],
    ] as const) {
      expect(() => decodeConfigurationText(JSON.stringify({ version: 1, [field]: value }), "future-config.jsonc"))
        .toThrow(ConfigurationError);
    }
  });

  it("accepts comments and trailing commas but rejects duplicate keys", () => {
    expect(
      decodeConfigurationText(
        `{
          // repository source layout
          "version": 1,
          "includes": ["src/**",],
        }`,
        "project.jsonc",
      ).includes,
    ).toEqual(["src/**"]);
    expect(() => decodeConfigurationText('{"version":1,"version":1}', "x.jsonc"))
      .toThrow(ConfigurationError);
  });

  it.each([
    ["unsupported version", '{"version":2}', "version"],
    ["unknown field", '{"version":1,"nope":true}', "nope"],
    ["configuration cannot grant consent", '{"version":1,"consent":true}', "consent"],
    ["configuration cannot enable review", '{"version":1,"enabled":true}', "enabled"],
    ["invalid environment reference", '{"version":1,"credentialEnvVar":"secret"}', "credentialEnvVar"],
    ["undocumented credential object", '{"version":1,"credentials":{"envVar":"ALT_KEY"}}', "credentials"],
    ["credential value", '{"version":1,"credentials":{"value":"secret"}}', "credentials"],
    ["invalid pattern array", '{"version":1,"includes":"src/**"}', "includes"],
    ["retired runtime settings", '{"version":1,"settings":{"deadlineMs":0}}', "settings"],
    ["invalid graph version", '{"version":1,"graphLimits":{"version":2}}', "graphLimits.version"],
    ["zero graph file cap", '{"version":1,"graphLimits":{"version":1,"files":0}}', "graphLimits.files"],
    ["oversized graph tree cap", '{"version":1,"graphLimits":{"version":1,"treeBytes":20481}}', "graphLimits.treeBytes"],
    ["fractional graph work cap", '{"version":1,"graphLimits":{"version":1,"work":1.5}}', "graphLimits.work"],
    ["undocumented flat runtime field", '{"version":1,"adviceBudget":101}', "adviceBudget"],
    ["undocumented include alias", '{"version":1,"include":["src/**"]}', "include"],
    ["undocumented exclude alias", '{"version":1,"exclude":["src/**"]}', "exclude"],
    ["pack reference without locator", '{"version":1,"packs":[{}]}', "packs[0]"],
    ["pack reference with path and id", '{"version":1,"packs":[{"path":"rules.jsonc","id":"team"}]}', "packs[0]"],
    ["negated include", '{"version":1,"includes":["!src/**"]}', "includes[0]"],
    ["traversal include", '{"version":1,"includes":["../src/**"]}', "includes[0]"],
    ["reversed glob range", '{"version":1,"includes":["[z-a]"]}', "includes[0]"],
    ["removed rule surface", '{"version":1,"rules":{"r2_meaningless_combinations":{"threshold":0.8}}}', "rules"],
    ["array rule override shorthand", '{"version":1,"ruleOverrides":[{"ruleId":"team/check","enabled":true}]}', "ruleOverrides"],
  ])("reports bounded errors for %s", (_label, text, field) => {
    try {
      decodeConfigurationText(text, "project.jsonc");
      throw new Error("expected configuration error");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).source).toBe("project.jsonc");
      expect((error as ConfigurationError).field).toContain(field);
      expect((error as ConfigurationError).reason).not.toContain("secret");
    }
  });

  it("accepts only canonical fields at the configuration boundary", () => {
    expect(decodeConfigurationText(
      '{"version":1,"includes":["src/**"],"credentialEnvVar":"ALT_KEY","graphLimits":{"version":1,"files":2}}',
      "canonical.jsonc",
    )).toEqual({
      version: 1,
      includes: ["src/**"],
      credentialEnvVar: "ALT_KEY",
      graphLimits: { version: 1, files: 2 },
    });
    for (const [field, text] of [
      ["include", '{"version":1,"include":["src/**"]}'],
      ["exclude", '{"version":1,"exclude":["src/**"]}'],
      ["credentials", '{"version":1,"credentials":{"envVar":"ALT_KEY"}}'],
      ["deadlineMs", '{"version":1,"deadlineMs":9}'],
    ] as const) {
      expect(() => decodeConfigurationText(text, "noncanonical.jsonc")).toThrowError(
        expect.objectContaining({ field }),
      );
    }
  });

  it("accepts fractional rule-override thresholds from the Effect schema", () => {
    expect(decodeConfigurationText(
      '{"version":1,"ruleOverrides":{"team/check":{"threshold":0.5}}}',
      "fractional.jsonc",
    ).ruleOverrides).toEqual({ "team/check": { threshold: 0.5 } });
  });
});

describe("layered selection and provenance", () => {
  it("captures bounded graph limits with field origins and lower-only project policy", () => {
    const original = effectiveGraphLimits(resolveConfiguration([], "/repo"));
    expect(original).toMatchObject({ version: 1, sourceBytes: 262144, treeBytes: 20480, readBytes: 1572864 });
    const user = source("user", '{"version":1,"graphLimits":{"version":1,"sourceBytes":100,"readBytes":200,"treeBytes":1000}}');
    const captured = resolveConfiguration([user], "/repo");
    expect(effectiveGraphLimits(captured)).toMatchObject({ sourceBytes: 100, readBytes: 200, treeBytes: 1000 });
    expect(captured.graphLimits.sourceBytes.origin.layer).toBe("user");
    const project = source("project", '{"version":1,"graphLimits":{"version":1,"treeBytes":500}}');
    const changed = resolveConfiguration([user, project], "/repo");
    expect(effectiveGraphLimits(changed).treeBytes).toBe(500);
    expect(changed.graphLimits.treeBytes.origin.layer).toBe("project");
    expect(effectiveGraphLimits(captured).treeBytes).toBe(1000);
    expect(() => resolveConfiguration([user, source("project", '{"version":1,"graphLimits":{"version":1,"treeBytes":1001}}')], "/repo"))
      .toThrowError(expect.objectContaining({ field: "graphLimits.treeBytes" }));
    expect(() => resolveConfiguration([source("user", '{"version":1,"graphLimits":{"version":1,"sourceBytes":100,"readBytes":99}}')], "/repo"))
      .toThrowError(expect.objectContaining({ field: "graphLimits.readBytes" }));
  });
  it("requires a user owned Claude opt-in and lets a project restrict it", () => {
    const user = source("user", '{"version":1,"claudeFeedbackMode":"block-current-findings"}');
    expect(resolveConfiguration([], "/repo").claudeFeedbackMode).toMatchObject({ value: "advisory", origin: { layer: "built-in" } });
    expect(resolveConfiguration([user], "/repo").claudeFeedbackMode).toMatchObject({ value: "block-current-findings", origin: { layer: "user" } });
    expect(resolveConfiguration([user, source("project", '{"version":1,"claudeFeedbackMode":"advisory"}')], "/repo").claudeFeedbackMode).toMatchObject({ value: "advisory", origin: { layer: "project" } });
    expect(resolveConfiguration([source("user", '{"version":1,"claudeFeedbackMode":"advisory"}')], "/repo").claudeFeedbackMode.value).toBe("advisory");
    expect(() => resolveConfiguration([source("project", '{"version":1,"claudeFeedbackMode":"block-current-findings"}')], "/repo")).toThrow(ConfigurationError);
  });

  it("strictly rejects malformed Claude feedback modes", () => {
    for (const mode of ["block", "BLOCK-CURRENT-FINDINGS", true, null, 1]) {
      expect(() => decodeConfigurationText(JSON.stringify({ version: 1, claudeFeedbackMode: mode }), "user.jsonc")).toThrow(ConfigurationError);
    }
  });

  it("rechecks current user and project mode synchronously and fails closed", () => {
    const root = mkdtempSync(join(tmpdir(), "hapsland-claude-mode-"));
    const userPath = join(root, "user.jsonc");
    const projectPath = join(root, ".review.jsonc");
    try {
      expect(readCurrentClaudeFeedbackAuthority(root, userPath)).toMatchObject({ valid: true, mode: "advisory", origin: { layer: "built-in" } });
      writeFileSync(userPath, '{"version":1,"claudeFeedbackMode":"block-current-findings"}');
      expect(readCurrentClaudeFeedbackAuthority(root, userPath)).toMatchObject({ valid: true, mode: "block-current-findings", origin: { layer: "user" } });
      writeFileSync(projectPath, '{"version":1,"claudeFeedbackMode":"advisory"}');
      expect(readCurrentClaudeFeedbackAuthority(root, userPath)).toMatchObject({ valid: true, mode: "advisory", origin: { layer: "project" } });
      writeFileSync(projectPath, '{"version":1,"claudeFeedbackMode":"block-current-findings"}');
      expect(readCurrentClaudeFeedbackAuthority(root, userPath)).toEqual({ valid: false });
      rmSync(projectPath);
      writeFileSync(userPath, '{"version":1,"claudeFeedbackMode":');
      expect(readCurrentClaudeFeedbackAuthority(root, userPath)).toEqual({ valid: false });
      rmSync(userPath);
      expect(readCurrentClaudeFeedbackAuthority(root, userPath)).toMatchObject({ valid: true, mode: "advisory" });
      writeFileSync(projectPath, '{"version":1}');
      writeFileSync(join(root, ".realtime-review.jsonc"), '{"version":1}');
      expect(readCurrentClaudeFeedbackAuthority(root, userPath)).toEqual({ valid: false });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("replaces includes at the highest supplied layer and accumulates exclusions", () => {
    const policy = resolveConfiguration(
      [
        builtIn(),
        source("user", '{"version":1,"includes":["src/**"],"excludes":["lib/private/**"]}'),
        source("project", '{"version":1,"includes":["lib/**"],"excludes":[]}'),
      ],
      "/repo",
    );
    expect(selectGlobalPath(policy, "src/a.ts").selected).toBe(false);
    expect(selectGlobalPath(policy, "lib/a.ts").selected).toBe(true);
    expect(selectGlobalPath(policy, "lib/private/a.ts").selected).toBe(false);
    const explanation = explainPath(policy, "lib/private/a.ts");
    expect(explanation.effectiveIncludes.map((entry) => entry.value)).toEqual(["lib/**"]);
    expect(explanation.overriddenIncludes.map((entry) => entry.value)).toContain("src/**");
    expect(explanation.matchingExcludes.map((entry) => entry.value)).toContain("lib/private/**");
    expect(explanation.policyDigest).toBe(policy.digest);
  });

  it("distinguishes omitted and empty includes", () => {
    const inherited = resolveConfiguration(
      [builtIn(), source("user", '{"version":1,"includes":["src/**"]}')],
      "/repo",
    );
    const omitted = resolveConfiguration(
      [builtIn(), source("user", '{"version":1}')],
      "/repo",
    );
    const empty = resolveConfiguration(
      [builtIn(), source("user", '{"version":1,"includes":[]}')],
      "/repo",
    );
    expect(selectGlobalPath(inherited, "src/a.ts").selected).toBe(true);
    expect(selectGlobalPath(inherited, "lib/a.ts").selected).toBe(false);
    expect(selectGlobalPath(omitted, "lib/a.ts").selected).toBe(true);
    expect(selectGlobalPath(empty, "src/a.ts")).toMatchObject({
      selected: false,
      reason: "empty-includes",
    });
  });

  it("keeps an identical captured policy for explanation and runtime", () => {
    const policy = resolveConfiguration(
      [builtIn(), source("project", '{"version":1,"includes":["src/**"]}')],
      "/repo",
    );
    const runtime = selectGlobalPath(policy, "src/a.ts");
    const explained = explainPath(policy, "src/a.ts");
    expect(explained.selected).toBe(runtime.selected);
    expect(explained.reason).toBe(runtime.reason);
    expect(explained.matchingIncludes).toEqual(runtime.matchingIncludes);
    expect(explained.matchingExcludes).toEqual(runtime.matchingExcludes);
  });

  it("retains configured provenance before protected gates", () => {
    const policy = resolveConfiguration(
      [builtIn(), source("project", '{"version":1,"includes":["**/.env"],"excludes":["**/.env"]}')],
      "/repo",
    );
    const decision = selectGlobalPath(policy, ".env");
    expect(decision).toMatchObject({ selected: false, reason: "protected", gate: "sensitive" });
    expect(decision.matchingIncludes.map((entry) => entry.value)).toContain("**/.env");
    expect(decision.matchingExcludes.map((entry) => entry.value)).toContain("**/.env");
    expect(explainPath(policy, ".env").matchingIncludes.map((entry) => entry.value)).toContain("**/.env");
  });
});

const paths = ["src/a.ts", "lib/a.ts", "docs/a.md", "src/private/a.ts"] as const;
const patternArb = fc.constantFrom("src/**", "lib/**", "docs/**", "**/*.ts", "**/*.md");

describe("configuration composition properties", () => {
  it("separate invalid generators always fail without falling back", () => {
    const malformedGlob = fc.oneof(
      fc.constant("[z-a]"),
      fc.constant("[a--]"),
      fc.constant("src/[unterminated"),
      fc.array(fc.constantFrom("a", "!", "[", "-"), { minLength: 0, maxLength: 8 })
        .map((parts) => `src/[${parts.join("")}`),
    );
    const invalidText = fc.oneof(
      fc.constant('{"version":2}'),
      fc.constant('{"version":1,"unknown":true}'),
      fc.constant('{"version":1,"includes":["!src/**"]}'),
      fc.constant('{"version":1,"includes":["../src/**"]}'),
      fc.constant('{"version":1,"credentials":{"value":"secret"}}'),
      malformedGlob.map((pattern) => JSON.stringify({ version: 1, includes: [pattern] })),
      fc.integer({ min: 60_001, max: 100_000 }).map((deadlineMs) =>
        JSON.stringify({ version: 1, deadlineMs })),
      fc.integer({ min: -100, max: -1 }).map((adviceBudget) =>
        JSON.stringify({ version: 1, settings: { adviceBudget } })),
    );
    fc.assert(
      fc.property(invalidText, (text) => {
        try {
          decodeConfigurationText(text, "generated-invalid.jsonc");
          return false;
        } catch (error) {
          return error instanceof ConfigurationError;
        }
      }),
      { seed: 10_013, numRuns: 25 },
    );
  });

  it("exclusion monotonicity holds for bounded generated policies", () => {
    fc.assert(
      fc.property(fc.array(patternArb, { maxLength: 3 }), (excludes) => {
        const baseline = resolveConfiguration(
          [builtIn(), source("user", '{"version":1,"includes":["**/*"]}')],
          "/repo",
        );
        const changed = resolveConfiguration(
          [
            builtIn(),
            source("user", '{"version":1,"includes":["**/*"]}'),
            source("project", JSON.stringify({ version: 1, excludes })),
          ],
          "/repo",
        );
        return paths.every((path) => {
          const before = selectGlobalPath(baseline, path).selected;
          const after = selectGlobalPath(changed, path).selected;
          return !after || before;
        });
      }),
      { seed: 10_010, numRuns: 40 },
    );
  });

  it("project include replacement is independent of lower-layer include choices", () => {
    fc.assert(
      fc.property(fc.array(patternArb, { minLength: 0, maxLength: 3 }), (userIncludes) => {
        const project = source("project", '{"version":1,"includes":["lib/**"]}');
        const left = resolveConfiguration(
          [builtIn(), source("user", JSON.stringify({ version: 1, includes: userIncludes })), project],
          "/repo",
        );
        const right = resolveConfiguration(
          [builtIn(), source("user", '{"version":1,"includes":["src/**"]}'), project],
          "/repo",
        );
        return paths.every((path) =>
          selectGlobalPath(left, path).selected === selectGlobalPath(right, path).selected,
        );
      }),
      { seed: 10_011, numRuns: 40 },
    );
  });

  it("object-key and duplicate-pattern changes preserve canonical meaning", () => {
    fc.assert(
      fc.property(fc.array(patternArb, { maxLength: 3 }), (patterns) => {
        const first = resolveConfiguration(
          [builtIn(), source("project", JSON.stringify({ version: 1, excludes: patterns }))],
          "/repo",
        );
        const second = resolveConfiguration(
          [builtIn(), source("project", JSON.stringify({ excludes: [...patterns, ...patterns], version: 1 }))],
          "/repo",
        );
        return paths.every((path) =>
          selectGlobalPath(first, path).selected === selectGlobalPath(second, path).selected,
        ) && stableConfigurationValue(first.excludes) === stableConfigurationValue(second.excludes);
      }),
      { seed: 10_012, numRuns: 40 },
    );
  });

  it("adding an empty layer preserves effective selection", () => {
    fc.assert(
      fc.property(fc.array(patternArb, { maxLength: 3 }), (includes) => {
        const withoutEmpty = resolveConfiguration(
          [builtIn(), source("user", JSON.stringify({ version: 1, includes }))],
          "/repo",
        );
        const withEmpty = resolveConfiguration(
          [
            builtIn(),
            source("user", JSON.stringify({ version: 1, includes })),
            source("project", '{"version":1}'),
          ],
          "/repo",
        );
        return paths.every((path) => {
          const left = selectGlobalPath(withoutEmpty, path);
          const right = selectGlobalPath(withEmpty, path);
          return left.selected === right.selected && left.reason === right.reason;
        });
      }),
      { seed: 10_014, numRuns: 40 },
    );
  });

  it("round-trips canonical serialized documents", () => {
    fc.assert(
      fc.property(
        fc.array(patternArb, { maxLength: 3 }),
        fc.array(patternArb, { maxLength: 3 }),
        (includes, excludes) => {
          const document = decodeConfigurationText(
            JSON.stringify({ version: 1, includes, excludes, graphLimits: { version: 1, files: 2 } }),
            "roundtrip.jsonc",
          );
          const serialized = serializeConfigurationDocument(document);
          expect(serialized).not.toContain('"include":');
          expect(decodeConfigurationText(serialized, "roundtrip.jsonc")).toEqual(document);
        },
      ),
      { seed: 10_015, numRuns: 40 },
    );
  });

  it("keeps explanation and runtime decisions identical for generated paths", () => {
    fc.assert(
      fc.property(
        fc.array(patternArb, { maxLength: 3 }),
        fc.array(patternArb, { maxLength: 3 }),
        fc.constantFrom(...paths),
        (includes, excludes, path) => {
          const policy = resolveConfiguration(
            [builtIn(), source("project", JSON.stringify({ version: 1, includes, excludes }))],
            "/repo",
          );
          const runtime = selectGlobalPath(policy, path);
          const explained = explainPath(policy, path);
          expect(explained.selected).toBe(runtime.selected);
          expect(explained.reason).toBe(runtime.reason);
          expect(explained.matchingIncludes).toEqual(runtime.matchingIncludes);
          expect(explained.matchingExcludes).toEqual(runtime.matchingExcludes);
        },
      ),
      { seed: 10_016, numRuns: 40 },
    );
  });
});
