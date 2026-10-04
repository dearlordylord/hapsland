import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { prepareArchive, sourceIdentity } from "./prepare-archive.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "hapsland-archive-stage-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  await writeFile(join(root, ".gitignore"), "dist/\ncoverage/\n.test-runs/\n");
  await writeFile(join(root, "source.ts"), "before");
  execFileSync("git", ["add", "."], { cwd: root });
  const runDirectory = join(root, ".test-runs", "one");
  return { root, runDirectory };
}

test("source identity observes dirty, untracked and deleted files but excludes generated outputs", async (t) => {
  const { root } = await fixture(t);
  const original = await sourceIdentity(root);
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "dist", "generated.js"), "output");
  assert.equal(await sourceIdentity(root), original);
  await writeFile(join(root, "source.ts"), "after");
  const dirty = await sourceIdentity(root);
  assert.notEqual(dirty, original);
  await writeFile(join(root, "extra.ts"), "new input");
  const untracked = await sourceIdentity(root);
  assert.notEqual(untracked, dirty);
  await rm(join(root, "source.ts"));
  assert.notEqual(await sourceIdentity(root), untracked);
});

test("builds and packs once, records archive evidence, never accepts an old output", async (t) => {
  const settings = await fixture(t);
  const calls = [];
  const runStage = async (stage) => {
    calls.push(stage);
    if (stage.name === "package-pack") await writeFile(join(stage.args.at(-1), "fixture.tgz"), "archive bytes");
    return { exitCode: 0, signal: null, timedOut: false };
  };
  const result = await prepareArchive({ ...settings, runStage });
  assert.deepEqual(calls.map((stage) => stage.name), ["package-build", "package-pack"]);
  assert.ok(calls[1].args.includes("--ignore-scripts=true"));
  assert.equal(result.sourceDigest, await sourceIdentity(settings.root));
  assert.match(result.archiveDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(await readFile(join(settings.runDirectory, "archive.json"), "utf8")), result);
  await assert.rejects(prepareArchive({ ...settings, runStage }), /must be empty/);
  assert.equal(calls.length, 2);
});

test("source mutation during build rejects the archive before packing", async (t) => {
  const settings = await fixture(t);
  const calls = [];
  await assert.rejects(prepareArchive({ ...settings, runStage: async (stage) => {
    calls.push(stage.name);
    await writeFile(join(settings.root, "source.ts"), "concurrent change");
    return { exitCode: 0 };
  } }), /Source inputs changed/);
  assert.deepEqual(calls, ["package-build"]);
});

test("failed build stops packaging and points to its log", async (t) => {
  const settings = await fixture(t);
  const calls = [];
  await assert.rejects(prepareArchive({ ...settings, runStage: async (stage) => {
    calls.push(stage.name);
    return { exitCode: 1, logPath: "/tmp/build.log" };
  } }), /build.log/);
  assert.deepEqual(calls, ["package-build"]);
});

test("submodule identity includes checkout revision and dirty or untracked bytes", async (t) => {
  const { root } = await fixture(t);
  const upstream = await mkdtemp(join(tmpdir(), "hapsland-submodule-"));
  t.after(() => rm(upstream, { recursive: true, force: true }));
  const git = (directory, args) => execFileSync("git", args, { cwd: directory, stdio: "pipe" });
  git(upstream, ["init", "--quiet"]);
  await writeFile(join(upstream, "input.ts"), "initial");
  git(upstream, ["add", "."]);
  git(upstream, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "initial"]);
  git(root, ["-c", "protocol.file.allow=always", "submodule", "add", "--quiet", upstream, "vendor/module"]);
  const initial = await sourceIdentity(root);
  const checkout = join(root, "vendor/module");
  await writeFile(join(checkout, "input.ts"), "dirty");
  const dirty = await sourceIdentity(root);
  assert.notEqual(dirty, initial);
  await writeFile(join(checkout, "extra.ts"), "untracked");
  assert.notEqual(await sourceIdentity(root), dirty);
  await rm(join(checkout, "extra.ts"));
  git(checkout, ["add", "."]);
  git(checkout, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "next"]);
  assert.notEqual(await sourceIdentity(root), dirty);
  git(root, ["submodule", "deinit", "--force", "vendor/module"]);
  await assert.rejects(sourceIdentity(root), /submodule is missing or uninitialized/);
});
