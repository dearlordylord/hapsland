import { execFile } from "node:child_process";
import { mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { readdirSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { captureStable, MAX_SOURCE_BYTES } from "./capture.ts";
import { eligibleNamedPath } from "./selection.ts";
import { adaptCodexAdd } from "./adapter.ts";
import { addEvent, makeGitFixture, put } from "./test-fixtures.ts";

const execFileAsync = promisify(execFile);
const required = <A>(value: A | undefined): A => {
  if (value === undefined) throw new Error("expected fixture value");
  return value;
};

describe("direct-event named-path selection", () => {
  it("honors nested .gitignore for untracked files and tracked semantics", async () => {
    const root = await makeGitFixture();
    await put(root, ".gitignore", "ignored.ts\nsub/*.ts\n!sub/keep.ts\n");
    await put(root, "sub/.gitignore", "local.ts\n");
    for (const path of ["ignored.ts", "sub/drop.ts", "sub/keep.ts", "sub/local.ts"] ) {
      await put(root, path, "type A = number");
    }
    expect(await Effect.runPromise(eligibleNamedPath(root, "ignored.ts"))).toBeUndefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, "sub/drop.ts"))).toBeUndefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, "sub/local.ts"))).toBeUndefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, "sub/keep.ts"))).toBeDefined();
    await execFileAsync("git", ["-C", root, "add", "-f", "ignored.ts"]);
    expect(await Effect.runPromise(eligibleNamedPath(root, "ignored.ts"))).toBeDefined();
  });

  it("does not load .git/info/exclude or global excludes", async () => {
    const root = await makeGitFixture();
    await put(root, "local-info.ts", "type A = number");
    await writeFile(join(root, ".git/info/exclude"), "local-info.ts\n");
    const globalFile = await put(root, "global-ignore", "global.ts\n");
    await put(root, "global.ts", "type A = number");
    await execFileAsync("git", ["-C", root, "config", "core.excludesFile", globalFile]);
    expect(await Effect.runPromise(eligibleNamedPath(root, "local-info.ts"))).toBeDefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, "global.ts"))).toBeDefined();
  });

  it("applies replacement includes, accumulated exclusions, and the hard floor", async () => {
    const root = await makeGitFixture();
    for (const path of ["src/a.ts", "src/no.ts", "src/a.mts", "src/a.cts", "build/a.ts", "generated/a.ts", "vendor/a.ts", ".env.local", "node_modules/a.ts", "README.md", "program.exe"] ) {
      await put(root, path, "type A = number");
    }
    const policy = { includes: ["src/**"], excludes: ["src/no.ts"] };
    expect(await Effect.runPromise(eligibleNamedPath(root, "src/a.ts", policy))).toBeDefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, "src/a.mts", policy))).toBeDefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, "src/a.cts", policy))).toBeDefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, "src/a.ts", { includes: [], excludes: [] }))).toBeUndefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, "src/no.ts", policy))).toBeUndefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, "build/a.ts"))).toBeUndefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, "generated/a.ts"))).toBeUndefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, "vendor/a.ts"))).toBeUndefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, "README.md"))).toBeDefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, "program.exe"))).toBeUndefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, ".env.local"))).toBeUndefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, "node_modules/a.ts"))).toBeUndefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, ".git/config"))).toBeUndefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, "../outside.ts"))).toBeUndefined();
  });

  it("rejects symlink traversal and nonregular paths before capture", async () => {
    const root = await makeGitFixture();
    await put(root, "real/a.ts", "type A = number");
    await symlink(join(root, "real"), join(root, "link"));
    await mkdir(join(root, "directory"));
    expect(await Effect.runPromise(eligibleNamedPath(root, "link/a.ts"))).toBeUndefined();
    expect(await Effect.runPromise(eligibleNamedPath(root, "directory"))).toBeUndefined();
  });

  it("rejects the structured in-root Git directory without prefix overreach", async () => {
    const root = await makeGitFixture();
    const gitDirectory = join(root, "git-admin");
    await rename(join(root, ".git"), gitDirectory);
    await writeFile(join(root, ".git"), "gitdir: git-admin\n");
    await put(root, "git-admin/evidence.ts", "type Secret = string");
    await put(root, "git-admin-sibling/source.ts", "type Safe = string");
    const observation = await Effect.runPromise(adaptCodexAdd(addEvent(root, ["git-admin/evidence.ts"])));
    expect(observation?.rootIdentity.gitDirectory).toBe(gitDirectory);
    expect(await Effect.runPromise(eligibleNamedPath(
      root,
      "git-admin/evidence.ts",
      undefined,
      observation?.rootIdentity,
    ))).toBeUndefined();
    expect(await Effect.runPromise(eligibleNamedPath(
      root,
      "git-admin-sibling/source.ts",
      undefined,
      observation?.rootIdentity,
    ))).toBeDefined();
  });

  it("keeps an external Git directory distinct from all in-root source paths", async () => {
    const root = await makeGitFixture();
    const holder = await makeGitFixture();
    const gitDirectory = join(holder, "external-admin");
    await rename(join(root, ".git"), gitDirectory);
    await writeFile(join(root, ".git"), `gitdir: ${gitDirectory}\n`);
    await put(root, "source.ts", "type Safe = string");
    await put(holder, "external-admin/secret.ts", "type Secret = string");
    const observation = await Effect.runPromise(adaptCodexAdd(addEvent(root, ["source.ts"])));
    expect(observation?.rootIdentity.gitDirectory).toBe(gitDirectory);
    expect(await Effect.runPromise(eligibleNamedPath(
      root,
      "source.ts",
      undefined,
      observation?.rootIdentity,
    ))).toBeDefined();
    expect(await Effect.runPromise(eligibleNamedPath(
      root,
      join(gitDirectory, "secret.ts"),
      undefined,
      observation?.rootIdentity,
    ))).toBeUndefined();
  });
});

describe("stable bounded source capture", () => {
  it("accepts matching reads, BOM, and the exact byte limit", async () => {
    const root = await makeGitFixture();
    await put(root, "bom.ts", Buffer.from("\ufefftype A = number", "utf8"));
    const bom = await Effect.runPromise(eligibleNamedPath(root, "bom.ts"));
    expect(bom).toBeDefined();
    expect((await Effect.runPromise(captureStable(root, required(bom))))?.text).toContain("type A");
    await put(root, "limit.ts", "x".repeat(MAX_SOURCE_BYTES));
    const limit = await Effect.runPromise(eligibleNamedPath(root, "limit.ts"));
    expect((await Effect.runPromise(captureStable(root, required(limit))))?.byteLength).toBe(MAX_SOURCE_BYTES);
  });

  it("bounds each stable source read by a configured lower cap", async () => {
    const root = await makeGitFixture();
    await put(root, "exact.ts", "x".repeat(80));
    await put(root, "over.ts", "x".repeat(81));
    const exact = required(await Effect.runPromise(eligibleNamedPath(root, "exact.ts")));
    const over = required(await Effect.runPromise(eligibleNamedPath(root, "over.ts")));
    const reads: string[] = [];
    const captured = await Effect.runPromise(captureStable(root, exact,
      { sourceRead: (path) => { reads.push(path); } }, undefined, 80));
    expect(captured?.byteLength).toBe(80);
    expect(await Effect.runPromise(captureStable(root, over,
      { sourceRead: (path) => { reads.push(path); } }, undefined, 80))).toBeUndefined();
    expect(reads).toEqual(["exact.ts", "exact.ts"]);
  });

  it("contains oversize, malformed UTF-8, and NUL input", async () => {
    const root = await makeGitFixture();
    const fixtures: ReadonlyArray<[string, Uint8Array]> = [
      ["large.ts", Buffer.alloc(MAX_SOURCE_BYTES + 1, 0x61)],
      ["bad.ts", Buffer.from([0xc3, 0x28])],
      ["nul.ts", Buffer.from("type\0A = number")],
    ];
    for (const [path, bytes] of fixtures) {
      await put(root, path, bytes);
      const eligible = await Effect.runPromise(eligibleNamedPath(root, path));
      expect(eligible).toBeDefined();
      expect(await Effect.runPromise(captureStable(root, required(eligible)))).toBeUndefined();
    }
  });

  it("contains mutation and deletion/recreation between reads", async () => {
    const root = await makeGitFixture();
    await put(root, "race.ts", "type A = number");
    const eligible = await Effect.runPromise(eligibleNamedPath(root, "race.ts"));
    expect(await Effect.runPromise(captureStable(root, required(eligible), {
      betweenReads: () => Effect.promise(() => writeFile(join(root, "race.ts"), "type B = string")),
    }))).toBeUndefined();
    await put(root, "race.ts", "type A = number");
    expect(await Effect.runPromise(captureStable(root, required(eligible), {
      betweenReads: () => Effect.promise(async () => {
        await rm(join(root, "race.ts"));
        await put(root, "race.ts", "type A = number");
      }),
    }))).toBeUndefined();
  });

  it("contains disappearance and a change to nonregular after selection", async () => {
    const root = await makeGitFixture();
    await put(root, "gone.ts", "type A = number");
    const gone = required(await Effect.runPromise(eligibleNamedPath(root, "gone.ts")));
    await rm(join(root, "gone.ts"));
    expect(await Effect.runPromise(captureStable(root, gone))).toBeUndefined();
    await put(root, "directory.ts", "type A = number");
    const directory = required(await Effect.runPromise(eligibleNamedPath(root, "directory.ts")));
    await rm(join(root, "directory.ts"));
    await mkdir(join(root, "directory.ts"));
    expect(await Effect.runPromise(captureStable(root, directory))).toBeUndefined();
  });

  it("is interruptible without returning capture evidence", async () => {
    const root = await makeGitFixture();
    await put(root, "cancel.ts", "type A = number");
    const eligible = await Effect.runPromise(eligibleNamedPath(root, "cancel.ts"));
    const descriptorCount = () => readdirSync("/proc/self/fd").filter(fd => {
      try { return readlinkSync(`/proc/self/fd/${fd}`).startsWith(root); }
      catch { return false; }
    }).length;
    if (process.platform === "linux") expect(descriptorCount()).toBe(0);
    const controller = new AbortController();
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    let reads = 0;
    const running = Effect.runPromise(captureStable(root, required(eligible), {
      sourceRead: () => {
        reads += 1;
        markStarted?.();
        if (process.platform === "linux") expect(descriptorCount()).toBeGreaterThan(0);
      },
      betweenReads: () => Effect.never,
    }), { signal: controller.signal });
    await started;
    expect(reads).toBe(1);
    controller.abort();
    await expect(running).rejects.toBeDefined();
    if (process.platform === "linux") expect(descriptorCount()).toBe(0);
  });
});
