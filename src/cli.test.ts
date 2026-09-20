import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { configuredRules } from "./policy/rules.ts";

const roots: Array<string> = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const initializeRepository = (root: string) => {
  execFileSync("git", ["init", "--quiet", root]);
  const statePath = join(root, ".consent-state.json");
  const enabled = spawnSync(process.execPath, ["src/cli.ts", "--enable"], {
    cwd: process.cwd(),
    input: JSON.stringify({ version: 1, operation: "enable", cwd: root }),
    encoding: "utf8",
    env: { ...process.env, REVIEW_STATE_PATH: statePath },
  });
  expect(enabled.status).toBe(0);
  expect(JSON.parse(enabled.stdout)).toMatchObject({ status: "enabled" });
  return statePath;
};

describe("JSON subprocess contract", () => {
  it("reviews a completed edit and reserves stdout for one protocol response", () => {
    const root = mkdtempSync(join(tmpdir(), "review-cli-"));
    roots.push(root);
    const statePath = initializeRepository(root);
    mkdirSync(join(root, "src"));
    const content = "export type Counter = { count: number };\n";
    const path = join(root, "src/counter.ts");
    writeFileSync(path, content);
    const input = {
      version: 1,
      event: {
        id: "subprocess-1",
        kind: "successful-edit",
        host: "test",
        cwd: root,
        paths: ["src/counter.ts"],
      },
    };
    const child = spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
      cwd: process.cwd(),
      input: JSON.stringify(input),
      encoding: "utf8",
      env: { ...process.env, REVIEW_CONTROL_JSON: "{}", REVIEW_STATE_PATH: statePath },
    });

    expect(child.status).toBe(0);
    expect(child.stderr).toBe("");
    expect(child.stdout.trim().split("\n")).toHaveLength(1);
    const output = JSON.parse(child.stdout) as {
      results: Array<{ status: string; snapshot?: { contentHash: string } }>;
    };
    expect(output.results[0]).toMatchObject({
      status: "reviewed",
      snapshot: {
        contentHash: createHash("sha256").update(content).digest("hex"),
      },
    });
    expect(readFileSync(path, "utf8")).toBe(content);
  });

  it("returns a bounded protocol error for malformed input", () => {
    const child = spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
      cwd: process.cwd(),
      input: '{"version":2,"unexpected":true}',
      encoding: "utf8",
    });
    const output = JSON.parse(child.stdout) as { error: { code: string; message: string } };
    expect(output.error.code).toBe("invalid_request");
    expect(output.error.message.length).toBeLessThanOrEqual(300);
  });

  it("does not emit duplicate advice for the same event and snapshot", () => {
    const root = mkdtempSync(join(tmpdir(), "review-cli-dedupe-"));
    roots.push(root);
    const statePath = initializeRepository(root);
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src/example.ts"),
      "export type Delivery = { email?: string; phone?: string };\n",
    );
    const input = JSON.stringify({
      version: 1,
      event: {
        id: `dedupe-${root}`,
        kind: "successful-edit",
        host: "test",
        cwd: root,
        paths: ["src/example.ts"],
      },
    });
    const control = JSON.stringify({
      answers: Object.fromEntries(
        configuredRules.map((rule) => [
          rule.id,
          { _tag: "Probability", probability: 0.9 },
        ]),
      ),
    });
    const invoke = () =>
      spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
        cwd: process.cwd(),
        input,
        encoding: "utf8",
        env: { ...process.env, REVIEW_CONTROL_JSON: control, REVIEW_STATE_PATH: statePath },
      });

    const first = JSON.parse(invoke().stdout) as { advice: Array<unknown> };
    const second = JSON.parse(invoke().stdout) as { advice: Array<unknown> };
    expect(first.advice.length).toBeGreaterThan(0);
    expect(second.advice).toEqual([]);
  });

  it("preserves the completed edit and reports unavailable without credentials", () => {
    const root = mkdtempSync(join(tmpdir(), "review-cli-no-credential-"));
    roots.push(root);
    const statePath = initializeRepository(root);
    mkdirSync(join(root, "src"));
    const content = "export type Counter = { count: number };\n";
    const path = join(root, "src/counter.ts");
    writeFileSync(path, content);
    const input = JSON.stringify({
      version: 1,
      event: {
        id: "missing-credential-1",
        kind: "successful-edit",
        host: "test",
        cwd: root,
        paths: ["src/counter.ts"],
      },
    });
    const environment = { ...process.env };
    delete environment.TYPESAFE_API_KEY;
    const child = spawnSync(process.execPath, ["src/cli.ts"], {
      cwd: process.cwd(),
      input,
      encoding: "utf8",
      env: { ...environment, REVIEW_STATE_PATH: statePath },
    });

    expect(child.status).toBe(0);
    expect(child.stderr).toBe("");
    expect(JSON.parse(child.stdout).results[0]).toMatchObject({
      status: "unavailable",
      path: "src/counter.ts",
    });
    expect(readFileSync(path, "utf8")).toBe(content);
  });

  it("reuses a grant, isolates destinations and revokes future dispatch", () => {
    const root = mkdtempSync(join(tmpdir(), "review-cli-consent-"));
    roots.push(root);
    const statePath = initializeRepository(root);
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/example.ts"), "export type Example = string;\n");
    const enableAgain = spawnSync(process.execPath, ["src/cli.ts", "--enable"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "enable", cwd: root }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(enableAgain.stdout)).toMatchObject({ status: "enabled" });

    const request = (id: string) =>
      JSON.stringify({
        version: 1,
        event: {
          id,
          kind: "successful-edit",
          host: "test",
          cwd: root,
          paths: ["src/example.ts"],
        },
      });
    const approved = spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
      cwd: process.cwd(),
      input: request("approved"),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(approved.stdout).results[0]).toMatchObject({ status: "reviewed" });

    writeFileSync(
      join(root, ".review.jsonc"),
      '{ "version": 1, "destination": "https://other.example/v1", "consent": true }',
    );
    const differentDestination = spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
      cwd: process.cwd(),
      input: request("different-destination"),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(differentDestination.stdout).results[0]).toMatchObject({
      status: "skipped",
      code: "missing_consent",
    });
    expect(differentDestination.stdout).not.toContain("Example");

    const enableOther = spawnSync(process.execPath, ["src/cli.ts", "--enable"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "enable", cwd: root }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(enableOther.stdout)).toMatchObject({
      backend: { destination: "https://other.example/v1" },
      projectAuthorizationIgnored: true,
    });
    const approvedOther = spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
      cwd: process.cwd(),
      input: request("approved-other"),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(approvedOther.stdout).results[0]).toMatchObject({ status: "reviewed" });

    const disabled = spawnSync(process.execPath, ["src/cli.ts", "--disable"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "disable", cwd: root }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(disabled.stdout)).toMatchObject({ status: "disabled" });
    const revoked = spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
      cwd: process.cwd(),
      input: request("revoked"),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(revoked.stdout).results[0]).toMatchObject({
      status: "skipped",
      code: "missing_consent",
    });
  }, 20_000);

  it("does not inherit consent across working trees", () => {
    const first = mkdtempSync(join(tmpdir(), "review-cli-root-a-"));
    const second = mkdtempSync(join(tmpdir(), "review-cli-root-b-"));
    roots.push(first, second);
    const statePath = initializeRepository(first);
    execFileSync("git", ["init", "--quiet", second]);
    mkdirSync(join(second, "src"));
    writeFileSync(join(second, "src/example.ts"), "export type Other = string;\n");
    const child = spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
      cwd: process.cwd(),
      input: JSON.stringify({
        version: 1,
        event: {
          id: "other-root",
          kind: "successful-edit",
          host: "test",
          cwd: second,
          paths: ["src/example.ts"],
        },
      }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(child.stdout).results[0]).toMatchObject({
      status: "skipped",
      code: "missing_consent",
    });
    expect(child.stdout).not.toContain("Other");
  });

  it("inspects credential presence without exposing the value", () => {
    const root = mkdtempSync(join(tmpdir(), "review-cli-credential-"));
    roots.push(root);
    const statePath = initializeRepository(root);
    const secret = "CREDENTIAL-SENTINEL";
    const child = spawnSync(process.execPath, ["src/cli.ts", "--inspect-credentials"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "credentials", cwd: root }),
      encoding: "utf8",
      env: {
        ...process.env,
        REVIEW_STATE_PATH: statePath,
        TYPESAFE_API_KEY: secret,
      },
    });
    expect(JSON.parse(child.stdout)).toEqual({
      version: 1,
      operation: "credentials",
      credentialEnvVar: "TYPESAFE_API_KEY",
      present: true,
    });
    expect(child.stdout).not.toContain(secret);
  });
});
