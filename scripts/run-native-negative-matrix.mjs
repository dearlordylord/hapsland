// Runs the controlled fault scenarios through the one native host runner.
// Each child writes its own pre-execution declaration and source-free evidence.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const project = resolve(import.meta.dirname, "..");
const evidenceRoot = join(project, "evidence", "native-negative");
const scenarios = ["reviewer-unavailable", "hook-crash", "hook-timeout", "stale-result"];
const languages = ["typescript", "rust", "bend"];
const hosts = ["codex", "claude"];
const cells = scenarios.flatMap((scenario) => languages.flatMap((language) =>
  hosts.map((host) => ({ scenario, language, host }))));
const batchId = `batch-${Date.now()}`;
mkdirSync(evidenceRoot, { recursive: true });
writeFileSync(join(evidenceRoot, `${batchId}-declaration.json`), `${JSON.stringify({
  schemaVersion: 1, declaredAt: new Date().toISOString(),
  purpose: "One bounded pass over real Codex and Claude fault scenarios for TypeScript, Rust, and Bend.",
  cells, maximumProviderRequests: 0, automaticRetries: 0, maximumConcurrentHosts: 3,
}, null, 2)}\n`, { flag: "wx" });

const runCell = (cell) => new Promise((resolveCell) => {
  const args = [join(project, "scripts/run-native-crossfile-current.mjs"),
    `--host=${cell.host}`, `--language=${cell.language}`, `--scenario=${cell.scenario}`];
  const child = spawn(process.execPath, args, { cwd: project, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output = `${output}${chunk}`.slice(-8192); });
  child.stderr.on("data", () => {});
  child.once("error", () => resolveCell({ ...cell, verdict: "runner-error", evidence: null }));
  child.once("close", (code) => {
    let report;
    try { report = JSON.parse(output.trim().split("\n").at(-1)); } catch { /* child may fail before evidence */ }
    resolveCell({ ...cell, verdict: report?.verdict ?? "runner-error",
      evidence: report?.evidence ? report.evidence.replace(`${evidenceRoot}/`, "") : null,
      exitCode: code });
  });
});

let next = 0;
const results = [];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (next < cells.length) {
    const cell = cells[next++];
    const result = await runCell(cell);
    results.push(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
}));
results.sort((a, b) => cells.findIndex((cell) => cell.host === a.host && cell.language === a.language && cell.scenario === a.scenario) -
  cells.findIndex((cell) => cell.host === b.host && cell.language === b.language && cell.scenario === b.scenario));
writeFileSync(join(evidenceRoot, `${batchId}.json`), `${JSON.stringify({ schemaVersion: 1,
  declaredBy: `${batchId}-declaration.json`, recordedAt: new Date().toISOString(), results,
  demonstrated: results.filter((result) => result.verdict === "demonstrated").length,
  incomplete: results.filter((result) => result.verdict !== "demonstrated").length,
}, null, 2)}\n`);
if (results.some((result) => result.verdict !== "demonstrated")) process.exitCode = 1;
