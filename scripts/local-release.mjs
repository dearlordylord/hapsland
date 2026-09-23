import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

if (process.argv.length > 2) throw new Error("release coordinates are pinned in scripts/npm-release-pin.json; this command takes no arguments");
const releasePin = JSON.parse(readFileSync("scripts/npm-release-pin.json", "utf8"));
if (releasePin.packageName !== "@jevs/jevs" || releasePin.version !== "0.1.0" ||
    !/^[0-9a-f]{40}$/.test(releasePin.sourceCommit ?? "") ||
    !/^[0-9a-f]{64}$/.test(releasePin.archiveSha256 ?? "")) {
  throw new Error("scripts/npm-release-pin.json does not contain the reviewed 0.1.0 release coordinates");
}

const registry = "https://registry.npmjs.org/";
const packageName = releasePin.packageName;
const version = releasePin.version;
const run = (command, args, { stdio = "pipe" } = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8", stdio, timeout: 300_000,
  });
  if (result.error) throw result.error;
  return result;
};
const output = (command, args) => {
  const result = run(command, args);
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ""} failed: ${result.stderr?.trim() ?? ""}`);
  return result.stdout.trim();
};
const checked = (command, args, options) => {
  const result = run(command, args, options);
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ""} exited ${result.status}`);
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const clean = () => output("git", ["status", "--porcelain", "--untracked-files=normal"]) === "";
const head = output("git", ["rev-parse", "HEAD"]);
if (output("git", ["branch", "--show-current"]) !== "master" ||
    head !== output("git", ["rev-parse", "origin/master"]) || !clean() ||
    run("git", ["merge-base", "--is-ancestor", releasePin.sourceCommit, head]).status !== 0) {
  throw new Error("release requires clean master equal to origin/master and containing the pinned release commit");
}
if (!/(?:github\.com[:/])dearlordylord\/jevs(?:\.git)?$/.test(output("git", ["remote", "get-url", "origin"]))) {
  throw new Error("origin is not the reviewed Jevs repository");
}
if (!(["linux", "darwin"].includes(process.platform) && process.arch === "arm64") ||
    process.version !== "v24.20.0") {
  throw new Error("release assembly requires Linux/macOS arm64 and Node 24.20.0");
}
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
if (manifest.name !== packageName || manifest.version !== version || manifest.private === true) {
  throw new Error("release manifest does not match @jevs/jevs@0.1.0");
}
const identity = output("npm", ["whoami", `--registry=${registry}`]);
process.stdout.write(`npm identity: ${identity}\n`);
checked("npm", ["run", "build"], { stdio: "inherit" });
checked("npm", ["run", "verify:release-native"], { stdio: "inherit" });
if (!clean()) throw new Error("release build changed tracked or untracked files");

const destination = mkdtempSync(join(tmpdir(), "jevs-release-"));
const packed = JSON.parse(output("npm", ["pack", "--ignore-scripts=true", "--json", "--pack-destination", destination]));
if (!Array.isArray(packed) || packed.length !== 1 || packed[0]?.name !== packageName ||
    packed[0]?.version !== version || basename(packed[0]?.filename ?? "") !== "jevs-jevs-0.1.0.tgz") {
  throw new Error("npm pack did not produce the expected scoped archive");
}
const archive = join(destination, packed[0].filename);
const digest = sha256(readFileSync(archive));
if (digest !== releasePin.archiveSha256) {
  throw new Error(`archive checksum differs from the reviewed release pin: ${digest}`);
}
checked(process.execPath, ["scripts/audit-release-tarball.mjs", archive, head], { stdio: "inherit" });
process.stdout.write(`Release artifact: ${archive}\nSHA-256: ${digest}\n`);

const tarballUrl = () => {
  const result = run("npm", ["view", `${packageName}@${version}`, "dist.tarball", "--json", `--registry=${registry}`]);
  if (result.status !== 0) {
    if (result.stderr?.includes("E404")) return undefined;
    throw new Error(`npm view failed: ${result.stderr?.trim() ?? "unknown error"}`);
  }
  return JSON.parse(result.stdout);
};
let publishedUrl = tarballUrl();
if (publishedUrl === undefined) {
  checked("npm", ["publish", archive, "--access=public", "--tag=latest", "--ignore-scripts=true", `--registry=${registry}`],
    { stdio: "inherit" });
  for (let attempt = 0; attempt < 6 && publishedUrl === undefined; attempt += 1) {
    publishedUrl = tarballUrl();
    if (publishedUrl === undefined) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5_000);
  }
}
if (typeof publishedUrl !== "string" || !publishedUrl.startsWith(registry)) {
  throw new Error("registry did not return the public package tarball URL");
}
const response = await fetch(publishedUrl);
if (!response.ok) throw new Error(`registry tarball download failed: ${response.status}`);
const registryDigest = sha256(Buffer.from(await response.arrayBuffer()));
if (registryDigest !== digest) throw new Error(`registry artifact differs from the reviewed archive: ${registryDigest}`);
const latest = output("npm", ["view", `${packageName}@latest`, "version", `--registry=${registry}`]);
if (latest !== version) throw new Error(`latest tag does not point to ${version}: ${latest}`);
process.stdout.write(`${packageName}@${version} is published as latest; registry SHA-256 matches ${digest}\n`);
