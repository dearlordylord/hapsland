import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const version = "0.24.2";
export const root = resolve(import.meta.dirname, "..");
// First-party release asset digests, pinned rather than fetched at installation.
// https://github.com/lycheeverse/lychee/releases/tag/lychee-v0.24.2
const releases = {
  "linux-x64": ["x86_64-unknown-linux-musl", "73657a111819a30c47c08352896796f23d64e4eb2b3ed39b6d32149241566fc5"],
  "linux-arm64": ["aarch64-unknown-linux-musl", "5d0b0e3aeab240f41920c633a6eaf97599be6eedda034b36e858ede7dba5e535"],
  "darwin-x64": ["x86_64-apple-darwin", "887503a9cff667d322b8d0892b40bf49976eb9507af8483220a3706cdad55978"],
  "darwin-arm64": ["aarch64-apple-darwin", "c9d3740ea2d891854d37116c9fba840f37b6e7c89d330e7db84ac333631c4977"],
};

export function checkerPath() {
  const release = releases[`${process.platform}-${process.arch}`];
  if (!release) throw new Error(`No pinned documentation checker for ${process.platform}/${process.arch}`);
  return join(root, ".tools/lychee", `${version}-${release[0]}`, "lychee");
}

export function verifyChecker(binary) {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8" });
  if (result.status !== 0 || result.stdout.trim() !== `lychee ${version}`) {
    throw new Error(`Install the pinned link checker with npm run docs:install (expected lychee ${version})`);
  }
}

async function install() {
  const [target, expected] = releases[`${process.platform}-${process.arch}`] ?? [];
  const binary = checkerPath();
  try {
    verifyChecker(binary);
    console.log(`Lychee ${version} is already installed.`);
    return;
  } catch {
    // Missing or wrong-version binary: replace it from a verified archive.
  }
  const name = `lychee-${target}`;
  const url = `https://github.com/lycheeverse/lychee/releases/download/lychee-v${version}/${name}.tar.gz`;
  const temporary = await mkdtemp(join(tmpdir(), "hapsland-doc-links-"));
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Link checker download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== expected) throw new Error(`Link checker archive failed SHA256 verification for ${target}`);
    const archive = join(temporary, "lychee.tar.gz");
    await writeFile(archive, bytes);
    const result = spawnSync("tar", ["-xzf", archive, "-C", temporary, "--strip-components=1", `${name}/lychee`], { stdio: "inherit" });
    if (result.status !== 0) throw new Error("Could not extract the verified link checker archive");
    verifyChecker(join(temporary, "lychee"));
    await mkdir(dirname(binary), { recursive: true });
    // Copy through a sibling file so the final binary is never partially written.
    const staged = `${binary}.${process.pid}.tmp`;
    try {
      await writeFile(staged, await readFile(join(temporary, "lychee")), { mode: 0o755 });
      await rename(staged, binary);
    } finally {
      await rm(staged, { force: true });
    }
    console.log(`Installed checksum-verified Lychee ${version} for ${target}.`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await install();
}
