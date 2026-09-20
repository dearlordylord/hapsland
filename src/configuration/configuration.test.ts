import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ConfigurationError } from "./errors.ts";
import { decodeConfigurationText } from "./decode.ts";
import { resolveConfiguration, stableConfigurationValue } from "./resolve.ts";
import type { ConfigurationLayer } from "./resolve.ts";
import { selectGlobalPath } from "../policy/file-policy.ts";
import { explainPath } from "../explanation/index.ts";

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
    ["invalid environment reference", '{"version":1,"credentialEnvVar":"secret"}', "$"],
    ["credential value", '{"version":1,"credentials":{"value":"secret"}}', "credentials.value"],
    ["negated include", '{"version":1,"includes":["!src/**"]}', "includes[0]"],
    ["traversal include", '{"version":1,"includes":["../src/**"]}', "includes[0]"],
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
});

describe("layered selection and provenance", () => {
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
});

const paths = ["src/a.ts", "lib/a.ts", "docs/a.md", "src/private/a.ts"] as const;
const patternArb = fc.constantFrom("src/**", "lib/**", "docs/**", "**/*.ts", "**/*.md");

describe("configuration composition properties", () => {
  it("separate invalid generators always fail without falling back", () => {
    const invalidText = fc.oneof(
      fc.constant('{"version":2}'),
      fc.constant('{"version":1,"unknown":true}'),
      fc.constant('{"version":1,"includes":["!src/**"]}'),
      fc.constant('{"version":1,"includes":["../src/**"]}'),
      fc.constant('{"version":1,"credentials":{"value":"secret"}}'),
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
});
