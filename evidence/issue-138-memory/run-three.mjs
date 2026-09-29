#!/usr/bin/env node
// Three fresh-process repetitions of the bounded offline benchmark.
// Run from the repository root:
// node evidence/issue-138-memory/run-three.mjs
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const evidenceDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(evidenceDirectory, "../..");
const sourceCommit = "55bddc26410b5bc54bea333dd94dffff4bb3a9c6";
const label = process.argv.length === 2 ? "three-process-20260929"
  : process.argv.length === 4 && process.argv[2] === "--label" ? process.argv[3] : undefined;
if (label === undefined || !/^[a-z0-9-]+$/u.test(label)) throw new Error("expected optional --label with lowercase letters, numbers, and hyphens");
const runDirectory = join(evidenceDirectory, "runs", label);
if (existsSync(runDirectory)) throw new Error("run directory already exists; choose a new --label to preserve prior evidence");

const runChild = (index) => new Promise((resolveChild, rejectChild) => {
  const outputName = `runs/${label}/run-${index}.json`;
  const child = spawn(process.execPath, ["--experimental-strip-types", join(evidenceDirectory, "benchmark.mjs"),
    "--output", outputName, "--source-commit", sourceCommit], {
    cwd: repoRoot,
    // Exclude ambient credentials from child environment. Git uses only the
    // local synthetic fixture configuration created by benchmark.mjs.
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: process.env.LANG },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let settled = false;
  let stderr = "";
  child.stdout.on("data", () => {});
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-4000); });
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
    if (!settled) { settled = true; rejectChild(new Error(`fresh process ${index} exceeded 20 seconds`)); }
  }, 20_000);
  child.on("error", (error) => {
    clearTimeout(timer);
    if (!settled) { settled = true; rejectChild(error); }
  });
  child.on("close", (code) => {
    clearTimeout(timer);
    if (settled) return;
    settled = true;
    if (code === 0) resolveChild(outputName);
    else rejectChild(new Error(`fresh process ${index} exited ${code}: ${stderr}`));
  });
});

const metric = (runs, pick) => {
  const values = runs.map(pick).sort((a, b) => a - b);
  if (values.length !== 3 || values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("benchmark metric was missing or invalid");
  }
  return { min: values[0], median: values[1], max: values[2] };
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
await mkdir(runDirectory, { recursive: true });
const outputNames = [];
for (let index = 1; index <= 3; index += 1) outputNames.push(await runChild(index));
const runs = await Promise.all(outputNames.map(async (name) => JSON.parse(await readFile(join(evidenceDirectory, name.replace(/^runs\//u, "runs/")), "utf8"))));
const first = runs[0];
if (first === undefined) throw new Error("missing first run");
for (const run of runs) {
  if (run.sourceCommit !== sourceCommit || run.host.platform !== first.host.platform ||
    run.host.arch !== first.host.arch || run.host.node !== first.host.node ||
    run.host.cpuCount !== first.host.cpuCount || run.benchmark.items !== 8 ||
    run.benchmark.sourceBytesPerItem !== 256 * 1024 ||
    run.resident.runningAtGate !== 8 || run.resident.captureGateEntered !== 8 ||
    run.resident.providerCalls !== 0 || run.candidate.enteredPreparationGate !== 8 ||
    run.candidate.readyUnits !== 8) throw new Error("fresh-process fixture or overlap contract changed");
}
const summary = {
  schemaVersion: 1,
  authority: "three fresh-process offline implementation measurements; not an accepted deployment memory floor",
  sourceCommit,
  benchmarkScriptSha256: sha256(await readFile(join(evidenceDirectory, "benchmark.mjs"))),
  runnerScriptSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  originalOneRunArtifact: "evidence/issue-138-memory/aggregate.json",
  originalRunExcludedFromSummary: true,
  repetitions: 3,
  runArtifacts: outputNames.map((name) => relative(repoRoot, join(evidenceDirectory, name))),
  fixture: { concurrentItems: 8, sourceBytesPerItem: 256 * 1024, noLiveJev: true, credentialUsed: false,
    host: { platform: first.host.platform, arch: first.host.arch, node: first.host.node,
      cpuCount: first.host.cpuCount, totalMemoryBytes: first.host.totalMemoryBytes,
      v8HeapLimitBytes: first.host.v8HeapLimitBytes } },
  residentV1: {
    peakRssBytes: metric(runs, (run) => run.resident.memory.peak.rssBytes),
    peakHeapUsedBytes: metric(runs, (run) => run.resident.memory.peak.heapUsedBytes),
    peakLogicalLedgerBytes: metric(runs, (run) => run.resident.peakLedgerBytes),
    peakLedgerAtGateBytes: metric(runs, (run) => run.resident.ledgerBytesAtGate),
  },
  candidateV2: {
    peakRssBytes: metric(runs, (run) => run.candidate.memory.peak.rssBytes),
    peakHeapUsedBytes: metric(runs, (run) => run.candidate.memory.peak.heapUsedBytes),
    residentLedger: "not measured; standalone prepareObservation has no resident ledger",
  },
  limitations: "One host, one fixture, three sequential fresh processes, 2 ms sampled process memory; candidate v2 runs after resident v1 within each process. No provider request or production adoption was tested. Min/median/max are observations, not a deployment floor.",
};
const summaryPath = join(runDirectory, "summary.json");
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ summaryArtifact: relative(repoRoot, summaryPath),
  residentPeakRssBytes: summary.residentV1.peakRssBytes,
  candidatePeakRssBytes: summary.candidateV2.peakRssBytes })}\n`);
