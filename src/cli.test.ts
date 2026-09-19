import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { configuredRules } from "./policy/rules.ts";

const roots: Array<string> = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("JSON subprocess contract", () => {
  it("reviews a completed edit and reserves stdout for one protocol response", () => {
    const root = mkdtempSync(join(tmpdir(), "review-cli-"));
    roots.push(root);
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
      env: { ...process.env, REVIEW_CONTROL_JSON: "{}" },
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
        env: { ...process.env, REVIEW_CONTROL_JSON: control },
      });

    const first = JSON.parse(invoke().stdout) as { advice: Array<unknown> };
    const second = JSON.parse(invoke().stdout) as { advice: Array<unknown> };
    expect(first.advice.length).toBeGreaterThan(0);
    expect(second.advice).toEqual([]);
  });

  it("preserves the completed edit and reports unavailable without credentials", () => {
    const root = mkdtempSync(join(tmpdir(), "review-cli-no-credential-"));
    roots.push(root);
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
      env: environment,
    });

    expect(child.status).toBe(0);
    expect(child.stderr).toBe("");
    expect(JSON.parse(child.stdout).results[0]).toMatchObject({
      status: "unavailable",
      path: "src/counter.ts",
    });
    expect(readFileSync(path, "utf8")).toBe(content);
  });
});
