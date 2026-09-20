import {
  execFileSync,
  spawnSync,
} from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configuredRules } from "../policy/rules.ts";

const roots: Array<string> = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const processRoot = process.cwd();

const run = (
  args: ReadonlyArray<string>,
  input: unknown,
  env: Record<string, string | undefined> = {},
) => {
  const child = spawnSync(process.execPath, ["src/cli.ts", ...args], {
    cwd: processRoot,
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  expect(child.status, child.stderr).toBe(0);
  expect(child.stderr).toBe("");
  return JSON.parse(child.stdout) as Record<string, unknown>;
};

const enable = (root: string, statePath: string): void => {
  const preview = run(["--enable"], { version: 1, operation: "enable", cwd: root }, {
    REVIEW_STATE_PATH: statePath,
    REVIEW_USER_CONFIG_PATH: join(root, "missing-user.jsonc"),
  }) as { proposal: { digest: string } };
  run(
    ["--enable-confirm"],
    {
      version: 1,
      operation: "enable-confirm",
      cwd: root,
      proposalDigest: preview.proposal.digest,
    },
    { REVIEW_STATE_PATH: statePath, REVIEW_USER_CONFIG_PATH: join(root, "missing-user.jsonc") },
  );
};

const request = (cwd: string, paths: ReadonlyArray<string>, id = "configuration-test") => ({
  version: 1,
  event: { id, kind: "successful-edit", host: "test", cwd, paths },
});

describe("configuration v1 subprocess contract", () => {
  it("discovers the root from a subdirectory and keeps includes root-relative", () => {
    const root = mkdtempSync(join(tmpdir(), "review-config-root-"));
    roots.push(root);
    execFileSync("git", ["init", "--quiet", root]);
    const subdirectory = join(root, "packages", "one");
    mkdirSync(subdirectory, { recursive: true });
    const path = join(root, "src", "example.ts");
    mkdirSync(join(root, "src"));
    writeFileSync(path, "export type Example = string;\n");
    writeFileSync(join(root, ".review.jsonc"), '{"version":1,"includes":["src/**"]}\n');
    const statePath = join(root, "state");
    enable(root, statePath);
    const capturePath = join(root, "calls.log");
    const output = run(
      ["--controlled"],
      request(subdirectory, ["../../src/example.ts"]),
      {
        REVIEW_STATE_PATH: statePath,
        REVIEW_CONTROL_JSON: JSON.stringify({ capturePath }),
        REVIEW_USER_CONFIG_PATH: join(root, "missing-user.jsonc"),
      },
    ) as { results: Array<{ status: string; snapshot?: { path: string } }> };
    expect(output.results[0]).toMatchObject({ status: "reviewed", snapshot: { path: "src/example.ts" } });
    expect(readFileSync(path, "utf8")).toContain("Example");
    expect(readFileSync(capturePath, "utf8").trim()).toBe("called");
  });

  it("applies captured runtime limits to deadline and one event-wide advice budget", () => {
    const root = mkdtempSync(join(tmpdir(), "review-config-runtime-limits-"));
    roots.push(root);
    execFileSync("git", ["init", "--quiet", root]);
    mkdirSync(join(root, "src"));
    const content = "export type Count = { value: number; unit: string };\n";
    writeFileSync(join(root, "src", "a.ts"), content);
    writeFileSync(join(root, "src", "b.ts"), content);
    writeFileSync(
      join(root, ".review.jsonc"),
      '{"version":1,"settings":{"deadlineMs":50,"concurrency":1,"adviceBudget":1,"transientRetries":0}}\n',
    );
    const statePath = join(root, "state");
    enable(root, statePath);
    const input = request(root, ["src/a.ts", "src/b.ts"], `runtime-limits-timeout-${root}`);
    const delayed = run(
      ["--controlled"],
      input,
      {
        REVIEW_STATE_PATH: statePath,
        REVIEW_CONTROL_JSON: JSON.stringify({
          delayMs: 100,
          answers: Object.fromEntries(
            configuredRules.map((rule) => [
              rule.id,
              { _tag: "Probability", probability: 0.9 },
            ]),
          ),
        }),
        REVIEW_USER_CONFIG_PATH: join(root, "missing-user.jsonc"),
      },
    ) as { results: Array<{ status: string; code?: string }>; advice: Array<unknown> };
    expect(delayed.results).toHaveLength(2);
    expect(delayed.results.every((result) => result.status === "unavailable")).toBe(true);
    expect(delayed.results.every((result) => result.code === "review_timeout")).toBe(true);
    expect(delayed.advice).toEqual([]);
    expect(readFileSync(join(root, "src", "a.ts"), "utf8")).toBe(content);
    expect(readFileSync(join(root, "src", "b.ts"), "utf8")).toBe(content);

    writeFileSync(
      join(root, ".review.jsonc"),
      '{"version":1,"settings":{"deadlineMs":1000,"concurrency":1,"adviceBudget":1,"transientRetries":0}}\n',
    );
    const reviewed = run(
      ["--controlled"],
      request(root, ["src/a.ts", "src/b.ts"], `runtime-limits-budget-${root}`),
      {
        REVIEW_STATE_PATH: statePath,
        REVIEW_CONTROL_JSON: JSON.stringify({
          answers: Object.fromEntries(
            configuredRules.map((rule) => [
              rule.id,
              { _tag: "Probability", probability: 0.9 },
            ]),
          ),
        }),
        REVIEW_USER_CONFIG_PATH: join(root, "missing-user.jsonc"),
      },
    ) as { results: Array<{ status: string }>; advice: Array<unknown> };
    expect(reviewed.results.every((result) => result.status === "reviewed")).toBe(true);
    expect(reviewed.advice).toHaveLength(1);
  });

  it("applies exclusions before dispatch for traversal, symlink, generated and oversized paths", () => {
    const root = mkdtempSync(join(tmpdir(), "review-config-gates-"));
    roots.push(root);
    execFileSync("git", ["init", "--quiet", root]);
    mkdirSync(join(root, "src", "private"), { recursive: true });
    writeFileSync(join(root, ".review.jsonc"), '{"version":1,"excludes":["src/private/**"]}\n');
    writeFileSync(join(root, "src", "private", "secret.ts"), "export type Secret = string;\n");
    writeFileSync(join(root, "src", "large.ts"), Buffer.alloc(262145, 65));
    writeFileSync(join(root, "src", "real.ts"), "export type Real = string;\n");
    mkdirSync(join(root, "src", "directory.ts"));
    symlinkSync(join(root, "src", "real.ts"), join(root, "src", "link.ts"));
    const statePath = join(root, "state");
    enable(root, statePath);
    const capturePath = join(root, "calls.log");
    const output = run(
      ["--controlled"],
      request(root, [
        "src/private/secret.ts",
        "src/large.ts",
        "src/directory.ts",
        "src/link.ts",
        "../outside.ts",
        ".env",
        "missing.ts",
      ]),
      {
        REVIEW_STATE_PATH: statePath,
        REVIEW_CONTROL_JSON: JSON.stringify({ capturePath }),
        REVIEW_USER_CONFIG_PATH: join(root, "missing-user.jsonc"),
      },
    ) as { results: Array<{ status: string; code?: string }> };
    expect(output.results).toHaveLength(7);
    expect(output.results.every((result) => result.status === "skipped")).toBe(true);
    expect(existsSync(capturePath)).toBe(false);
  });

  it("rejects a similar-prefix sibling root before snapshot or dispatch", () => {
    const root = mkdtempSync(join(tmpdir(), "review-config-prefix-"));
    const sibling = `${root}-other`;
    roots.push(root, sibling);
    execFileSync("git", ["init", "--quiet", root]);
    mkdirSync(join(sibling, "src"), { recursive: true });
    writeFileSync(join(sibling, "src", "outside.ts"), "export type Outside = string;\n");
    writeFileSync(join(root, ".review.jsonc"), '{"version":1,"includes":["src/**"]}\n');
    const statePath = join(root, "state");
    enable(root, statePath);
    const capturePath = join(root, "calls.log");
    const siblingName = sibling.slice(sibling.lastIndexOf("/") + 1);
    const output = run(
      ["--controlled"],
      request(root, [`../${siblingName}/src/outside.ts`], "similar-prefix-boundary"),
      {
        REVIEW_STATE_PATH: statePath,
        REVIEW_CONTROL_JSON: JSON.stringify({ capturePath }),
        REVIEW_USER_CONFIG_PATH: join(root, "missing-user.jsonc"),
      },
    ) as { results: Array<{ status: string; code?: string }> };
    expect(output.results[0]).toMatchObject({ status: "skipped", code: "excluded" });
    expect(existsSync(capturePath)).toBe(false);
  });

  it("distinguishes inherited includes from an explicit empty project list", () => {
    const root = mkdtempSync(join(tmpdir(), "review-config-includes-"));
    roots.push(root);
    execFileSync("git", ["init", "--quiet", root]);
    mkdirSync(join(root, "src"));
    const path = join(root, "src", "example.ts");
    writeFileSync(path, "export type Example = string;\n");
    writeFileSync(join(root, ".review.jsonc"), '{"version":1}\n');
    const statePath = join(root, "state");
    enable(root, statePath);
    const inheritedCapture = join(root, "inherited-calls.log");
    const inherited = run(
      ["--controlled"],
      request(root, ["src/example.ts"], "inherited-includes"),
      {
        REVIEW_STATE_PATH: statePath,
        REVIEW_CONTROL_JSON: JSON.stringify({ capturePath: inheritedCapture }),
        REVIEW_USER_CONFIG_PATH: join(root, "missing-user.jsonc"),
      },
    ) as { results: Array<{ status: string }> };
    expect(inherited.results[0]?.status).toBe("reviewed");
    expect(readFileSync(inheritedCapture, "utf8").trim()).toBe("called");

    writeFileSync(join(root, ".review.jsonc"), '{"version":1,"includes":[]}\n');
    const emptyCapture = join(root, "empty-calls.log");
    const empty = run(
      ["--controlled"],
      request(root, ["src/example.ts"], "empty-includes"),
      {
        REVIEW_STATE_PATH: statePath,
        REVIEW_CONTROL_JSON: JSON.stringify({ capturePath: emptyCapture }),
        REVIEW_USER_CONFIG_PATH: join(root, "missing-user.jsonc"),
      },
    ) as { results: Array<{ status: string; reason?: string }> };
    expect(empty.results[0]).toMatchObject({ status: "skipped" });
    expect(empty.results[0]?.reason).toContain("no files are selected");
    expect(existsSync(emptyCapture)).toBe(false);
  });

  it("stops all dispatch on an invalid selected project document", () => {
    const root = mkdtempSync(join(tmpdir(), "review-config-invalid-"));
    roots.push(root);
    execFileSync("git", ["init", "--quiet", root]);
    mkdirSync(join(root, "src"));
    const path = join(root, "src", "example.ts");
    writeFileSync(path, "export type Example = string;\n");
    writeFileSync(join(root, ".review.jsonc"), '{"version":1}\n');
    const statePath = join(root, "state");
    enable(root, statePath);
    writeFileSync(join(root, ".review.jsonc"), '{"version":1,"unknown":true}\n');
    const capturePath = join(root, "calls.log");
    const output = run(
      ["--controlled"],
      request(root, ["src/example.ts"], "invalid-configuration"),
      {
        REVIEW_STATE_PATH: statePath,
        REVIEW_CONTROL_JSON: JSON.stringify({ capturePath }),
        REVIEW_USER_CONFIG_PATH: join(root, "missing-user.jsonc"),
      },
    ) as { results: Array<{ status: string; code: string; reason: string }> };
    expect(output.results[0]).toMatchObject({ status: "unavailable", code: "invalid_configuration" });
    expect(output.results[0]?.reason).toContain(".review.jsonc");
    expect(existsSync(capturePath)).toBe(false);
    expect(readFileSync(path, "utf8")).toContain("Example");
  });

  it("explains effective and overridden origins without a provider call", () => {
    const root = mkdtempSync(join(tmpdir(), "review-config-explain-"));
    roots.push(root);
    execFileSync("git", ["init", "--quiet", root]);
    mkdirSync(join(root, "lib"));
    writeFileSync(join(root, ".review.jsonc"), '{"version":1,"includes":["lib/**"]}\n');
    const user = join(root, "user.jsonc");
    writeFileSync(user, '{"version":1,"includes":["src/**"]}\n');
    const capturePath = join(root, "calls.log");
    const output = run(
      ["--explain"],
      { version: 1, operation: "explain", cwd: root, path: "lib/example.ts" },
      {
        REVIEW_USER_CONFIG_PATH: user,
        REVIEW_CONTROL_JSON: JSON.stringify({ capturePath }),
      },
    ) as { explanation: { selected: boolean; effectiveIncludes: Array<{ value: string }>; overriddenIncludes: Array<{ value: string }> } };
    expect(output.explanation.selected).toBe(true);
    expect(output.explanation.effectiveIncludes.map((entry) => entry.value)).toEqual(["lib/**"]);
    expect(output.explanation.overriddenIncludes.map((entry) => entry.value)).toContain("src/**");
    expect(existsSync(capturePath)).toBe(false);
  });

  it("loads a local pack through the review command and applies activation, filters and messages", () => {
    const root = mkdtempSync(join(tmpdir(), "review-config-pack-"));
    roots.push(root);
    execFileSync("git", ["init", "--quiet", root]);
    mkdirSync(join(root, "src"));
    const path = join(root, "src", "example.ts");
    writeFileSync(path, "export type Example = string;\n");
    writeFileSync(join(root, "rules.jsonc"), JSON.stringify({
      schemaVersion: 1,
      id: "team",
      contentVersion: "1.0.0",
      rules: [{
        id: "has-question",
        question: "Does the artifact contain the authored problem?",
        criteria: { false: "The problem is absent.", true: "The problem is present." },
        threshold: 0.7,
        message: "Custom authored advice.",
        applicability: { includes: ["src/**"] },
      }],
    }));
    writeFileSync(join(root, ".review.jsonc"), '{"version":1,"packs":["rules.jsonc"]}\n');
    const statePath = join(root, "state");
    enable(root, statePath);
    const answers = Object.fromEntries([
      ...configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0 }]),
      ["team/has-question", { _tag: "Probability", probability: 1 }],
    ]);
    const capturePath = join(root, "calls.log");
    const output = run(
      ["--controlled"],
      request(root, ["src/example.ts"], `local-pack-${Date.now()}`),
      {
        REVIEW_STATE_PATH: statePath,
        REVIEW_CONTROL_JSON: JSON.stringify({ answers, capturePath }),
        REVIEW_USER_CONFIG_PATH: join(root, "missing-user.jsonc"),
      },
    ) as { results: Array<{ status: string; assessment?: Record<string, number> }>; advice: Array<{ ruleId: string; message: string }> };
    expect(output.results[0]?.status).toBe("reviewed");
    expect(output.results[0]?.assessment).toHaveProperty("team/has-question", 1);
    expect(output.advice).toEqual([
      expect.objectContaining({ ruleId: "team/has-question", message: "Custom authored advice." }),
    ]);
    expect(readFileSync(capturePath, "utf8").trim()).toBe("called");

    writeFileSync(join(root, ".review.jsonc"), JSON.stringify({
      version: 1,
      packs: ["rules.jsonc"],
      ruleOverrides: { "team/has-question": { enabled: false } },
    }));
    const disabledCapture = join(root, "disabled-calls.log");
    const disabled = run(
      ["--controlled"],
      request(root, ["src/example.ts"], "local-pack-disabled"),
      {
        REVIEW_STATE_PATH: statePath,
        REVIEW_CONTROL_JSON: JSON.stringify({ answers, capturePath: disabledCapture }),
        REVIEW_USER_CONFIG_PATH: join(root, "missing-user.jsonc"),
      },
    ) as { results: Array<{ status: string; assessment?: Record<string, number> }> };
    expect(disabled.results[0]?.status).toBe("reviewed");
    expect(disabled.results[0]?.assessment).not.toHaveProperty("team/has-question");
    expect(readFileSync(disabledCapture, "utf8").trim()).toBe("called");
  });

  it("rejects a malformed selected pack beside a valid one before dispatch", () => {
    const root = mkdtempSync(join(tmpdir(), "review-config-pack-invalid-"));
    roots.push(root);
    execFileSync("git", ["init", "--quiet", root]);
    mkdirSync(join(root, "src"));
    const path = join(root, "src", "example.ts");
    writeFileSync(path, "export type Example = string;\n");
    writeFileSync(join(root, "valid.jsonc"), JSON.stringify({
      schemaVersion: 1,
      id: "valid",
      contentVersion: "1.0.0",
      rules: [{ id: "r", question: "Q", criteria: { false: "F", true: "T" }, message: "M" }],
    }));
    writeFileSync(join(root, "invalid.jsonc"), '{"schemaVersion":2}\n');
    writeFileSync(join(root, ".review.jsonc"), '{"version":1,"packs":["valid.jsonc"]}\n');
    const statePath = join(root, "state");
    enable(root, statePath);
    writeFileSync(join(root, ".review.jsonc"), '{"version":1,"packs":["valid.jsonc","invalid.jsonc"]}\n');
    const capturePath = join(root, "calls.log");
    const output = run(
      ["--controlled"],
      request(root, ["src/example.ts"], "invalid-pack"),
      {
        REVIEW_STATE_PATH: statePath,
        REVIEW_CONTROL_JSON: JSON.stringify({ capturePath }),
        REVIEW_USER_CONFIG_PATH: join(root, "missing-user.jsonc"),
      },
    ) as { results: Array<{ status: string; code: string; reason: string }> };
    expect(output.results[0]).toMatchObject({ status: "unavailable", code: "invalid_configuration" });
    expect(output.results[0]?.reason).toContain("invalid.jsonc");
    expect(existsSync(capturePath)).toBe(false);
  });
});
