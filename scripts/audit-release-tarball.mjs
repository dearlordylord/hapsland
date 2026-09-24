import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [archiveArgument, commit] = process.argv.slice(2);
if (!archiveArgument || !/^[0-9a-f]{40}$/.test(commit ?? "")) {
  throw new Error("usage: node scripts/audit-release-tarball.mjs ARCHIVE.tgz RELEASE_COMMIT_SHA");
}
const archive = resolve(archiveArgument);
const command = (tool, args) => execFileSync(tool, args, { maxBuffer: 32 * 1024 * 1024 });
const head = command("git", ["rev-parse", "HEAD"]).toString().trim();
if (head !== commit || command("git", ["status", "--porcelain", "--untracked-files=normal"]).toString().trim()) {
  throw new Error("release audit requires the exact pinned commit in a clean worktree");
}
const archiveFile = (path) => command("tar", ["-xOzf", archive, `package/${path}`]);
const gitFile = (path) => command("git", ["show", `${commit}:${path}`]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const files = command("tar", ["-tzf", archive]).toString().trim().split("\n");
if (files.length !== new Set(files).size) throw new Error("tarball has duplicate entries");
const names = files.filter((name) => !name.endsWith("/")).map((name) => {
  if (!name.startsWith("package/") || name.includes("..") || name.includes("\\")) {
    throw new Error(`unsafe tarball path: ${name}`);
  }
  return name.slice("package/".length);
});
const allowed = (name) => name === "package.json" || name === "package-runtime.json" ||
  name === "README.md" || name === "bin/launch.sh" ||
  ["docs/codex-installation.md", "docs/npm-quickstart.md", "docs/direct-event-v1-supported-profile.md",
    "docs/installed-release-compatibility.md", "docs/status.md"].includes(name) ||
  /^dist\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.js$/i.test(name) ||
  /^native\/prebuilt\/(?:linux|darwin)-arm64\//.test(name);
for (const name of names) {
  if (!allowed(name)) throw new Error(`unexpected registry tarball file: ${name}`);
  if (/^dist\/(?:conformance\/|direct-event\/test-fixtures\.js$|(?:e0|hello|prcheck|r[67][a-z0-9-]*|scan(?:-files)?)\.js$)/.test(name) ||
      (name.startsWith("dist/test-support/") && name !== "dist/test-support/controlled-decision-model.js")) {
    throw new Error(`development or conformance artifact in release tarball: ${name}`);
  }
}
const manifest = JSON.parse(archiveFile("package.json"));
if (JSON.stringify(manifest) !== JSON.stringify(JSON.parse(gitFile("package.json")))) {
  throw new Error("tarball manifest differs from the pinned release commit");
}
if (manifest.name !== "@hapsland/hapsland" || manifest.version !== "0.1.0" || manifest.private === true ||
    manifest.bin?.hapsland !== "bin/launch.sh" ||
    Object.keys(manifest.bin ?? {}).some((name) => name.startsWith("review-tool")) ||
    manifest.scripts?.postinstall !== undefined ||
    manifest.optionalDependencies?.["node-bin-darwin-arm64"] !== "24.20.0" ||
    manifest.optionalDependencies?.["node-linux-arm64"] !== "24.20.0") {
  throw new Error("release package manifest differs from reviewed 0.1.0 coordinates or runtime contract");
}
const required = ["package.json", "package-runtime.json", "README.md", "bin/launch.sh",
  "docs/npm-quickstart.md", "dist/cli.js", "dist/package-doctor.js", "dist/parser-main.js",
  "dist/resident/main.js"];
for (const profile of ["linux-arm64", "darwin-arm64"]) {
  for (const artifact of ["credential-secret-service", "tree-sitter/build/Release/tree_sitter_runtime_binding.node",
    "tree-sitter-typescript/build/Release/tree_sitter_typescript_binding.node",
    ...(profile === "darwin-arm64" ? ["capture-open"] : [])]) {
    const path = `native/prebuilt/${profile}/${artifact}`;
    required.push(path);
    if (sha256(archiveFile(path)) !== sha256(gitFile(path))) {
      throw new Error(`native artifact differs from pinned release commit: ${path}`);
    }
  }
}
for (const name of required) if (!names.includes(name)) throw new Error(`release tarball is missing ${name}`);
for (const name of names.filter((name) => /^(?:dist\/.*\.js|docs\/.*\.md|README\.md|package-runtime\.json|bin\/launch\.sh)$/.test(name))) {
  const contents = archiveFile(name).toString("utf8");
  if (/\/workspace\/|\/home\/node\/|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY|TYPESAFE_API_KEY\s*=\s*["'][^"']{16,}/.test(contents)) {
    throw new Error(`release tarball contains a private path or credential marker: ${name}`);
  }
}
const archiveHash = sha256(readFileSync(archive));
process.stdout.write(JSON.stringify({ package: `${manifest.name}@${manifest.version}`, commit,
  archiveSha256: archiveHash, files: names.length, nativeArtifacts: required.filter((name) => name.startsWith("native/")).length,
  status: "audited" }, null, 2) + "\n");
