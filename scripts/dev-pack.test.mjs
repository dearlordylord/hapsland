import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packDevelopmentArchive } from "./dev-pack.mjs";
const npmEntrypoint = realpathSync(execFileSync("npm", ["exec", "-c", "node -p process.env.npm_execpath"], { encoding: "utf8" }).trim());

test("fast dev archive respects npm file selection, package prefix and executable bins", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-fast-pack-"));
  try {
    mkdirSync(join(root, "bin"));
    mkdirSync(join(root, "archives"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@hapsland/hapsland", version: "0.1.0", files: ["bin"], bin: { hapsland: "bin/launch.js" } }));
    writeFileSync(join(root, "bin/launch.js"), "#!/usr/bin/env node\n", { mode: 0o644 });
    writeFileSync(join(root, "README.md"), "included");
    writeFileSync(join(root, ".env"), "must not be packaged");
    writeFileSync(join(root, "unshipped.txt"), "excluded");
    const archive = await packDevelopmentArchive({ root, destination: join(root, "archives"), npmEntrypoint });
    const entries = [];
    await createRequire(npmEntrypoint)("tar").t({ file: archive, onReadEntry: entry => entries.push({ path: entry.path, mode: entry.mode }) });
    assert.deepEqual(entries.map(entry => entry.path).sort(), ["package/README.md", "package/bin/launch.js", "package/package.json"]);
    assert.equal(entries.find(entry => entry.path === "package/bin/launch.js").mode & 0o111, 0o111);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
