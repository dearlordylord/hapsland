import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { checkerPath, root, verifyChecker } from "./install-doc-link-checker.mjs";

const binary = checkerPath();
verifyChecker(binary);
// Include new documents locally, as well as tracked provenance and fixture copies.
// Deleted files are not inputs; links pointing at them must still fail.
const inventory = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.md"], {
  cwd: root,
  encoding: "utf8",
});
if (inventory.status !== 0) throw new Error(`Could not list repository Markdown: ${inventory.stderr}`);
const files = [...new Set(inventory.stdout.split("\0").filter(Boolean))]
  .filter((file) => existsSync(join(root, file))).sort();
if (files.some((file) => /[\r\n]/.test(file))) throw new Error("Link checker input paths cannot contain newlines");
const temporary = await mkdtemp(join(tmpdir(), "hapsland-doc-links-input-"));
let status;
try {
  const inputs = join(temporary, "files.txt");
  await writeFile(inputs, files.map((file) => join(root, file)).join("\n") + "\n");
  console.log(`Checking local paths, HTML images, and heading anchors in ${files.length} Markdown documents.`);
  const result = spawnSync(binary, [
    "--offline", "--include-fragments=anchor-only", "--root-dir", root,
    "--no-progress", "--files-from", inputs,
  ], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  status = result.status ?? 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
process.exitCode = status;
