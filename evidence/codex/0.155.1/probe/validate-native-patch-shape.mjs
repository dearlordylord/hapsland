import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";

const repoRoot = resolve(new URL("../../../../", import.meta.url).pathname);
const probePath = join(repoRoot, "evidence/codex/0.155.1/probe/native-patch-emission.mjs");
const evidencePath = join(repoRoot, "evidence/codex/0.155.1/native-interface-edit-emission-2026-09-20.json");
const validationPath = join(repoRoot, "evidence/codex/0.155.1/native-interface-edit-validation-2026-09-20.json");

const run = (command, args) => new Promise((resolvePromise, reject) => {
  const child = spawn(command, args, { cwd: repoRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code, signal) => resolvePromise({ code, signal, stdout, stderr }));
});

const expectedCommand = [
  "*** Begin Patch",
  "*** Update File: <WORKSPACE>/baseline.ts",
  "@@",
  "-  email?: string;",
  "+  email: string;",
  "*** End Patch",
].join("\n");

const probe = await run(process.execPath, [probePath, "--interface"]);
const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
const assertions = {
  probeExitCode: probe.code === 0,
  verdict: evidence.verdict === "runtime-tested",
  toolName: evidence.request.toolName === "apply_patch",
  onePostToolUseEvent: evidence.result.postToolUseEvents === 1,
  exactCommand: evidence.request.command === expectedCommand,
  noFullInterfaceInPatch: !evidence.request.command.includes("export interface Delivery"),
  noUnexpectedContextLines: evidence.request.command.split("\n").filter(line => line.startsWith(" ")).length === 0,
  fileChanged: evidence.result.fileChanged === true,
};
const failures = Object.entries(assertions).filter(([, passed]) => !passed).map(([name]) => name);
const validation = {
  evidenceVersion: 1,
  date: "2026-09-20",
  purpose: "Validate the real Codex patch shape for a one-line replacement in a 10-line interface.",
  probe: "native-patch-emission.mjs --interface",
  fixture: {
    file: "baseline.ts",
    interfaceLineCount: 10,
    edit: "email?: string; -> email: string;",
  },
  observedCommand: evidence.request.command,
  expectedCommand,
  assertions,
  verdict: failures.length === 0 ? "validated" : "failed",
  failures,
};
await writeFile(validationPath, `${JSON.stringify(validation, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ verdict: validation.verdict, assertions, observedCommand: evidence.request.command })}\n`);
if (failures.length > 0) process.exitCode = 1;
