// One bounded real Claude Code + Jev observation. Raw host and backend data stay temporary.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { residentRequest } from "../src/resident/client.ts";
import { residentPaths } from "../src/resident/paths.ts";

const project = resolve(import.meta.dirname, "..");
const key = process.env.TYPESAFE_API_KEY;
if (!process.argv.includes("--execute-paid") || !key) throw new Error("Explicit live selection and Jev credential required");
const ceiling = 8;
const root = mkdtempSync(join(tmpdir(), "hapsland-native-136-claude-"));
const repo = join(root, "repo"), runtime = join(root, "resident");
const events = join(root, "events.jsonl"), calls = join(root, "calls.jsonl");
const activity = join(root, "activity"), observer = join(root, "observe-fetch.mjs");
const bridge = join(root, "hook.mjs"), composedBridge = join(root, "composed-hook.mjs");
const sourcePath = join(repo, "payment.ts");
const claudeBinary = "/home/node/.local/share/claude/versions/2.1.218";
const started = Date.now();
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const readLines = (path) => {
  try { return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
  catch { return []; }
};
const stages = (path) => {
  const found = [];
  const visit = (next) => {
    if (!existsSync(next)) return;
    for (const entry of readdirSync(next, { withFileTypes: true })) {
      const child = join(next, entry.name);
      if (entry.isDirectory()) visit(child);
      else {
        try {
          const stage = JSON.parse(readFileSync(child, "utf8")).stage;
          if (typeof stage === "string") found.push({ stage, atMs: Math.round(statSync(child).mtimeMs - started) });
        } catch { /* only source-free activity markers count */ }
      }
    }
  };
  visit(path);
  return found.sort((a, b) => a.atMs - b.atMs);
};
const run = (command, args, env, cwd, timeoutMs) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderrBytes = 0;
  const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderrBytes += chunk.length; });
  child.once("error", reject);
  child.once("close", (code, signal) => {
    clearTimeout(timer);
    resolveRun({ code, signal, stdout, stderrBytes });
  });
});
let owner;
try {
  mkdirSync(repo);
  const init = spawnSync("git", ["init", "--quiet", "--initial-branch=main", repo], { encoding: "utf8" });
  if (init.status !== 0) throw new Error("Temporary Git repository setup failed");
  writeFileSync(join(repo, "README.md"), "# Payment state example\nA payment is pending, succeeded with a receipt, or failed with a failure reason. Pending has neither result; success and failure are mutually exclusive.\n");
  writeFileSync(join(repo, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", types: [], skipLibCheck: true }, include: ["*.ts"] }));
  const tsc = join(project, "node_modules/typescript/bin/tsc");
  writeFileSync(join(repo, "package.json"), JSON.stringify({ private: true, scripts: { test: `${quote(process.execPath)} ${quote(tsc)} -p tsconfig.json` } }));
  writeFileSync(observer, `import {appendFileSync,mkdirSync,readFileSync,rmdirSync} from 'node:fs';
const original=globalThis.fetch;
globalThis.fetch=async (...args)=>{
  const url=String(args[0]?.url??args[0]);
  if(!url.includes('/v1/systemone')) return original(...args);
  const lock=process.env.HAPSLAND_136_CALLS+'.lock';
  let acquired=false;
  for(let i=0;i<100;i++){
    try{mkdirSync(lock);acquired=true;break}catch{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10)}
  }
  if(!acquired)throw new Error('Jev budget lock unavailable');
  let count=0;
  try{
    try{count=readFileSync(process.env.HAPSLAND_136_CALLS,'utf8').trim().split('\\n').filter(Boolean).length}catch{}
    if(count>=8)throw new Error('Jev request ceiling reached');
    appendFileSync(process.env.HAPSLAND_136_CALLS,JSON.stringify({kind:'request',at:Date.now()})+'\\n',{mode:0o600});
  }finally{rmdirSync(lock)}
  const at=Date.now();
  try{
    const response=await original(...args);
    appendFileSync(process.env.HAPSLAND_136_EVENTS,JSON.stringify({kind:'provider-response',at:Date.now(),durationMs:Date.now()-at,status:response.status})+'\\n',{mode:0o600});
    return response;
  }catch{
    appendFileSync(process.env.HAPSLAND_136_EVENTS,JSON.stringify({kind:'provider-failure',at:Date.now()})+'\\n',{mode:0o600});
    throw new Error('Jev request failed');
  }
};
`);
  writeFileSync(bridge, `import {readFileSync,appendFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const input=readFileSync(0,'utf8');let event;try{event=JSON.parse(input)}catch{}
const at=Date.now();
const result=spawnSync(process.execPath,[${JSON.stringify(join(project, "src/cli.ts"))},'--claude-hook','--controlled-writer','--composed-edit-hook'],{input,encoding:'utf8',env:process.env,timeout:30000,maxBuffer:1048576});
let out;try{out=JSON.parse(result.stdout)}catch{}
const reason=out?.reason??out?.hookSpecificOutput?.additionalContext??'';
const source=${JSON.stringify(sourcePath)};
const value=existsSync(source)?readFileSync(source,'utf8'):'';
appendFileSync(process.env.HAPSLAND_136_EVENTS,JSON.stringify({kind:'hook',at,doneAt:Date.now(),tool:event?.tool_name??'unknown',exitCode:result.status,decision:out?.decision??null,finding:(out?.decision==='block'||reason.includes('[r6_bare_domain_value, p=')||reason.includes('Hapsland found a current rule finding'))&&!reason.includes('Operational notice:'),notice:reason.includes('Operational notice:'),sourceHash:value?createHash('sha256').update(value).digest('hex'):null,sourceBytes:Buffer.byteLength(value),draft:value.includes('receipt: string | null')&&value.includes('failureReason: string | null')})+'\\n',{mode:0o600});
if(result.status===0)process.stdout.write(result.stdout??'');
process.exitCode=result.status??1;
`);
  writeFileSync(composedBridge, `import {readFileSync,appendFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const kind=process.argv[2];
const input=readFileSync(0,'utf8');
const at=Date.now();
const result=spawnSync(process.execPath,[${JSON.stringify(join(project, "src/cli.ts"))},'--composed-'+kind+'-hook','--composed-host=claude-code'],{input,encoding:'utf8',env:process.env,timeout:30000,maxBuffer:1048576});
let output;try{output=JSON.parse(result.stdout)}catch{}
const message=output?.reason??output?.hookSpecificOutput?.additionalContext??output?.systemMessage??'';
appendFileSync(process.env.HAPSLAND_136_EVENTS,JSON.stringify({kind:'composed-'+kind,at,doneAt:Date.now(),exitCode:result.status,decision:output?.decision??null,finding:output?.decision==='block'||message.includes('[r6_bare_domain_value, p='),notice:message.includes('Operational notice:')})+'\\n',{mode:0o600});
if(result.status===0)process.stdout.write(result.stdout??'');
process.exitCode=result.status??1;
`);
  mkdirSync(join(repo, ".claude"));
  const composed = (kind) => `${quote(process.execPath)} ${quote(composedBridge)} ${kind}`;
  writeFileSync(join(repo, ".claude", "settings.json"), JSON.stringify({ hooks: {
    PreToolUse: [{ matcher: "Edit|Write", hooks: [{ type: "command", command: composed("before-edit"), timeout: 5 }] }],
    PostToolUse: [{ matcher: "Edit|Write", hooks: [
      { type: "command", command: `${quote(process.execPath)} ${quote(bridge)}`, timeout: 5 },
      { type: "command", command: composed("background"), timeout: 25, async: true },
    ] }],
    Stop: [{ hooks: [{ type: "command", command: composed("stop"), timeout: 5 }] }],
    UserPromptSubmit: [{ hooks: [{ type: "command", command: composed("prompt"), timeout: 4 }] }],
  } }));
  const userConfigPath = join(root, "user-config.jsonc");
  writeFileSync(userConfigPath, JSON.stringify({ version: 1, claudeFeedbackMode: "block-current-findings" }));
  const env = { ...process.env, TYPESAFE_API_KEY: key, REVIEW_RESIDENT_DIR: runtime,
    REVIEW_ACTIVITY_PATH: activity, REVIEW_USER_CONFIG_PATH: userConfigPath,
    HAPSLAND_136_EVENTS: events, HAPSLAND_136_CALLS: calls,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${observer}`.trim() };
  delete env.REVIEW_CONTROL_JSON;
  const prompt = `Implement the payment-state example in README.md. First use the native Write tool to create payment.ts with this initial draft exactly:
export interface PaymentState {
  status: "pending" | "succeeded" | "failed";
  receipt: string | null;
  failureReason: string | null;
}
After that first Write, finish your turn immediately without running tests or making another edit. Do not repair this initial draft before Hapsland feedback. If an actionable Hapsland finding is returned by the Stop hook, repair the type using Edit or Write so invalid combinations are impossible, then run npm test and finish. If no finding arrives, leave the draft unchanged and say so truthfully. Stay in this repository; do not inspect integration configuration, credentials, or environment variables. Make at most two source edits. In your final reply state whether automated review affected the change; do not invent feedback.`;
  const host = await run(claudeBinary, ["-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence",
    "--allowedTools", "Read,Edit,Write,Bash", "--permission-mode", "acceptEdits", prompt], env, repo, 240_000);
  const timeline = readLines(events).map((entry) => ({ ...entry, atMs: entry.at - started, at: undefined, doneAt: undefined }));
  const activityStages = stages(activity);
  const source = existsSync(sourcePath) ? readFileSync(sourcePath, "utf8") : "";
  const finding = timeline.find((entry) => entry.finding);
  const editedAfterFinding = !!finding && timeline.some((entry) => entry.kind === "hook" && entry.atMs > finding.atMs && !entry.draft);
  const compile = spawnSync("npm", ["test"], { cwd: repo, env, encoding: "utf8", timeout: 30_000 });
  let invalidStatesRejected = false;
  if (source) {
    writeFileSync(join(repo, "invalid-states.ts"), `import type { PaymentState } from './payment.js';
// @ts-expect-error success requires receipt
const missing: PaymentState = { status: 'succeeded', receipt: null, failureReason: null };
// @ts-expect-error pending cannot contain success
const premature: PaymentState = { status: 'pending', receipt: 'r', failureReason: null };
// @ts-expect-error success cannot also carry failure
const contradictory: PaymentState = { status: 'succeeded', receipt: 'r', failureReason: 'failed' };
`);
    invalidStatesRejected = spawnSync("npm", ["test"], { cwd: repo, env, encoding: "utf8", timeout: 30_000 }).status === 0;
  }
  let resident = null;
  try {
    owner = JSON.parse(readFileSync(residentPaths(runtime).owner, "utf8"));
    const result = await residentRequest(residentPaths(runtime), { version: 1, operation: "stats", lifetime: owner.lifetime });
    if (result?.status === "stats") resident = { queued: result.queued, running: result.running,
      pendingFindingBatches: result.pendingFindingBatches, pendingOperationalNotices: result.pendingOperationalNotices };
  } catch { /* native path may not start a resident */ }
  const record = { schemaVersion: 1, runtime: "Claude Code", version: spawnSync(claudeBinary, ["--version"], { encoding: "utf8" }).stdout.trim(),
    recordedAt: new Date().toISOString(), declaration: { maximumProviderRequests: ceiling, automaticRetries: 0, sessionCeilingMs: 240_000,
      claudeFeedbackMode: "block-current-findings" },
    hostExitCode: host.code, hostSignal: host.signal, elapsedMs: Date.now() - started, providerRequests: readLines(calls).length,
    timeline, activityStages, checks: { initialDraftObserved: timeline.some((entry) => entry.draft), realFindingSubmitted: !!finding,
      editAfterFinding: editedAfterFinding, finalSourceChanged: !!source && !source.includes("receipt: string | null"),
      validSourceCompiles: compile.status === 0, invalidStatesRejected,
      followupClearObserved: activityStages.some((entry) => entry.stage === "clear") },
    resident, rawHostOutputRetained: false, rawBackendMaterialRetained: false, credentialRetained: false,
    hostOutputBytesDiscarded: Buffer.byteLength(host.stdout) + host.stderrBytes };
  record.verdict = host.code === 0 && Object.values(record.checks).every(Boolean) ? "demonstrated" : "incomplete";
  mkdirSync(join(project, "evidence/native-136"), { recursive: true });
  writeFileSync(join(project, "evidence/native-136/claude-configured.json"), JSON.stringify(record, null, 2) + "\n");
  console.log(JSON.stringify(record, null, 2));
  if (record.verdict !== "demonstrated") process.exitCode = 1;
} finally {
  try {
    owner ??= JSON.parse(readFileSync(residentPaths(runtime).owner, "utf8"));
    await residentRequest(residentPaths(runtime), { version: 1, operation: "cleanup", lifetime: owner.lifetime }).catch(() => {});
    try { process.kill(owner.pid, "SIGTERM"); } catch {}
  } catch {}
  rmSync(root, { recursive: true, force: true });
}
