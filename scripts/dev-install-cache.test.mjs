import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { devBuildIdentity, readDevCandidate, writeDevCandidate, withDevInstallLock } from "./dev-install-cache.mjs";

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-dev-cache-test-"));
  for (const path of ["src", "scripts", "native", "packages/agent-flow-bend", "packages/agent-flow-viz/src", "node_modules", "docs", "quint-specs"]) mkdirSync(join(root, path), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ files: ["docs/shipped.md", "dist/bin"] }));
  writeFileSync(join(root, "src/code.ts"), "export const value = 1;");
  return root;
};
test("rebuild inputs include new, edited and deleted source, shipped docs, dependencies and tools", () => {
  const root = fixture();
  try {
    const toolchain = { profile: "linux-arm64", node: "24" };
    const identity = () => devBuildIdentity(root, toolchain);
    for (const path of ["src/code.ts", "src/new.ts", "docs/shipped.md", "bun.lock", "node_modules/dependency.js", "scripts/build-standalone.mjs", "native/credential-secret-service.c"]) {
      const before = identity();
      writeFileSync(join(root, path), "changed");
      assert.notEqual(identity(), before, path);
      const written = identity();
      rmSync(join(root, path));
      assert.notEqual(identity(), written, `deleted ${path}`);
    }
    assert.notEqual(identity(), devBuildIdentity(root, { ...toolchain, node: "25" }));
    assert.notEqual(identity(), devBuildIdentity(root, { ...toolchain, profile: "darwin-arm64" }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("unrelated checkout files, tests and generated native assembly do not invalidate", () => {
  const root = fixture();
  try {
    const identity = () => devBuildIdentity(root, { profile: "linux-arm64" });
    const before = identity();
    mkdirSync(join(root, "native/prebuilt/linux-arm64"), { recursive: true });
    for (const path of [".hapsland.jsonc", "docs/unshipped.md", "src/code.test.ts", "scripts/cache.test.mjs", "scripts/dev-install.mjs", "scripts/dev-install-cache.mjs", "scripts/dev-pack.mjs", "quint-specs/quint.lock", "native/prebuilt/linux-arm64/generated"]) writeFileSync(join(root, path), "changed");
    mkdirSync(join(root, "node_modules/.vite"), { recursive: true });
    writeFileSync(join(root, "node_modules/.vite/results.json"), "generated test results");
    symlinkSync(".", join(root, "node_modules/node_modules"));
    const withCycle = identity();
    writeFileSync(join(root, "node_modules/.vite/results.json"), "new test results");
    assert.equal(identity(), withCycle);
    rmSync(join(root, "node_modules/node_modules"));
    assert.equal(identity(), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("linked dependency edits invalidate and dependency link cycles terminate", () => {
  const root = fixture();
  const linked = mkdtempSync(join(tmpdir(), "hapsland-linked-dependency-"));
  try {
    writeFileSync(join(linked, "index.js"), "old");
    symlinkSync(join(linked, "index.js"), join(root, "src/linked.ts"));
    const sourceBefore = devBuildIdentity(root, { profile: "linux-arm64" });
    writeFileSync(join(linked, "index.js"), "updated source");
    assert.notEqual(devBuildIdentity(root, { profile: "linux-arm64" }), sourceBefore);
    symlinkSync(linked, join(root, "node_modules/linked"));
    symlinkSync(".", join(root, "node_modules/cycle"));
    const before = devBuildIdentity(root, { profile: "linux-arm64" });
    writeFileSync(join(linked, "index.js"), "new");
    assert.notEqual(devBuildIdentity(root, { profile: "linux-arm64" }), before);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(linked, { recursive: true, force: true }); }
});
test("cache checks archive content and misses on changed inputs, corruption or removal", () => {
  const root = fixture();
  try {
    const cache = join(root, "cache");
    const archive = join(root, "snapshot.tgz");
    writeFileSync(archive, "archive");
    assert.equal(readDevCandidate(cache, "identity"), undefined);
    writeDevCandidate(cache, "identity", archive);
    assert.equal(readDevCandidate(cache, "identity").archive, archive);
    assert.equal(readDevCandidate(cache, "changed"), undefined);
    writeFileSync(archive, "corrupt");
    assert.equal(readDevCandidate(cache, "identity"), undefined);
    rmSync(archive);
    assert.equal(readDevCandidate(cache, "identity"), undefined);
    for (const value of ["not JSON", "null", JSON.stringify({ identity: "identity" })]) {
      writeFileSync(join(cache, "candidate.json"), value);
      assert.equal(readDevCandidate(cache, "identity"), undefined);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("build lock rejects overlapping assembly and releases on failure", async () => {
  const root = fixture();
  try {
    await assert.rejects(withDevInstallLock(root, async () => {
      assert.equal(readFileSync(join(root, "build.lock"), "utf8"), String(process.pid));
      await assert.rejects(withDevInstallLock(root, async () => {}), /Another dev-install/);
      throw new Error("assembly failed");
    }), /assembly failed/);
    await withDevInstallLock(root, async () => {});
  } finally { rmSync(root, { recursive: true, force: true }); }
});
