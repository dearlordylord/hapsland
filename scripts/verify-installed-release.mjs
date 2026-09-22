import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  inspectRetainedEvidence,
  releaseReadiness,
  validateInstalledReleaseManifest,
  verifyOfflineReplay,
} from "./installed-release-policy.mjs";

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "conformance/installed-release-v1.json");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const run = async (command, args, label, options = {}) => {
  try {
    return await execute(command, args, {
      cwd: root,
      env: process.env,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: options.timeout ?? 300_000,
    });
  } catch (cause) {
    const output = [cause?.stderr, cause?.stdout].filter(Boolean).join("\n").slice(-4_000);
    throw new Error(`${label} failed${output.length === 0 ? "" : `: ${output}`}`);
  }
};
const parseJson = (value, label) => {
  try { return JSON.parse(value); } catch { throw new Error(`${label} did not emit JSON`); }
};

const manifest = validateInstalledReleaseManifest(parseJson(await readFile(manifestPath, "utf8"), "installed-release manifest"));
const ancestry = await run("git", ["merge-base", "--is-ancestor", manifest.subject.assembledCommit, "HEAD"], "assembled commit ancestry");
void ancestry;
const artifacts = new Map();
for (const declaration of manifest.evidence) {
  const current = await readFile(resolve(root, declaration.path));
  const retained = (await run("git", ["show", `${declaration.provenance.commit}:${declaration.path}`],
    `${declaration.id} provenance`)).stdout;
  if (sha256(retained) !== declaration.sha256) {
    throw new Error(`${declaration.id} provenance commit does not contain the declared artifact`);
  }
  artifacts.set(declaration.id, { sha256: sha256(current), payload: parseJson(current.toString("utf8"), declaration.id) });
}
const evidence = inspectRetainedEvidence(manifest, artifacts);

if (!(["linux", "darwin"].includes(platform()) && arch() === "arm64" && process.version === manifest.ordinaryReplay.node)) {
  throw new Error(`offline replay requires Linux/macOS arm64 with ${manifest.ordinaryReplay.node}; observed ${platform()} ${arch()} ${process.version}`);
}

const setupRun = await run(process.execPath, ["scripts/run-setup-package-conformance.mjs"], "installed setup replay");
const packageArgs = ["scripts/run-clean-package-conformance.mjs"];
if (platform() === "linux") packageArgs.push("--credential-fixture");
const packageRun = await run(process.execPath, packageArgs, "installed lifecycle replay", { timeout: 600_000 });
await run("npm", ["exec", "--", "vitest", "run", "--maxWorkers=1",
  "src/credentials/secret-service.test.ts", "src/resident/server.test.ts"], "credential/server fixtures", { timeout: 600_000 });
const replay = verifyOfflineReplay(manifest, {
  environment: { operatingSystem: platform(), architecture: arch(), node: process.version },
  setup: parseJson(setupRun.stdout, "installed setup replay"),
  package: parseJson(packageRun.stdout, "installed lifecycle replay"),
  credentialFixtures: "passed",
});
const readiness = releaseReadiness(manifest);
if (readiness.status !== manifest.expectedVerdict) {
  throw new Error(`computed ${readiness.status} but the reviewed manifest declares ${manifest.expectedVerdict}`);
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  operation: "verify-installed-release",
  subject: manifest.subject,
  environment: { operatingSystem: platform(), architecture: arch(), node: process.version },
  evidence,
  replay,
  compatibility: readiness,
  releaseReady: readiness.status === "release-ready",
  publicNameSelected: false,
  registrySelected: false,
}, null, 2)}\n`);
process.exitCode = readiness.status === "release-ready" ? 0 : 2;
