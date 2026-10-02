// Executable validation evidence for #170; derived from the native #136 harness.
// This is a synthetic, bounded observation runner, not a product behavior contract.
// One bounded real Claude Code + Jev observation. Raw host and backend data stay temporary.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { residentRequest } from "../../src/resident/client.ts";
import { residentPaths } from "../../src/resident/paths.ts";

const project = resolve(import.meta.dirname, "../..");
const key = process.env.TYPESAFE_API_KEY;
const offlineControl = process.argv.includes("--offline-control");
const countFixture = process.argv.includes("--count-fixture");
if (!offlineControl && (!process.argv.includes("--execute-paid") || !key)) {
  throw new Error("Explicit live selection and Jev credential required");
}
const ceiling = 8;
const root = mkdtempSync(join(tmpdir(), "hapsland-native-170-claude-"));
const repo = join(root, "repo"), runtime = join(root, "resident");
const events = join(root, "events.jsonl"), calls = join(root, "calls.jsonl");
const activity = join(root, "activity"), observer = join(root, "observe-fetch.mjs");
const bridge = join(root, "hook.mjs"), composedBridge = join(root, "composed-hook.mjs");
const sourcePath = join(repo, countFixture ? "order-count.ts" : "payment.ts");
const claudeBinary = "/home/node/.local/share/claude/versions/2.1.218";
const responseDelayMs = Number(process.argv.find((arg) => arg.startsWith("--response-delay-ms="))?.split("=")[1] ?? 0);
if (![0, 5000].includes(responseDelayMs) || offlineControl || !countFixture) throw new Error("Choose a live count fixture with response delay 0 or 5000 ms");
const started = Date.now();
const runId = `claude-count-${responseDelayMs === 0 ? "normal" : "delayed"}-${started}`;
const evidenceDirectory = join(project, "evidence/issue-170");
mkdirSync(evidenceDirectory, { recursive: true });
writeFileSync(join(evidenceDirectory, `${runId}-declaration.json`), JSON.stringify({
  schemaVersion: 1, declaredAt: new Date().toISOString(), milestone: "issue-170 native Claude RPC validation",
  maximumProviderRequests: ceiling, automaticHostRetries: 0, hostCeilingMs: 240000,
  runtime: "Claude Code 2.1.218", realJev: true, syntheticRepositoryOnly: true,
  maximumSourceEdits: 2, claudeFeedbackMode: "block-current-findings", responseDelayMs,
  responseDelayPlacement: "after real Jev response, before response reaches Effect provider",
}, null, 2) + "\n", { flag: "wx" });
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
  writeFileSync(join(repo, "README.md"), countFixture ? "# Order count example\n" :
    "# Payment state example\nA payment is pending, succeeded with a receipt, or failed with a failure reason. Pending has neither result; success and failure are mutually exclusive.\n");
  writeFileSync(join(repo, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", types: [], skipLibCheck: true }, include: ["*.ts"] }));
  const tsc = join(project, "node_modules/typescript/bin/tsc");
  writeFileSync(join(repo, "package.json"), JSON.stringify({ private: true, scripts: { test: `${quote(process.execPath)} ${quote(tsc)} -p tsconfig.json` } }));
  writeFileSync(observer, `import {appendFileSync,mkdirSync,readFileSync,rmdirSync} from 'node:fs';
const original=globalThis.fetch;
globalThis.fetch=async (...args)=>{
  const url=String(args[0]?.url??args[0]);
  if(!url.includes('/v1/systemone')) return original(...args);
  const lock=process.env.HAPSLAND_170_CALLS+'.lock';
  let acquired=false;
  for(let i=0;i<100;i++){
    try{mkdirSync(lock);acquired=true;break}catch{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10)}
  }
  if(!acquired)throw new Error('Jev budget lock unavailable');
  let count=0;
  try{
    try{count=readFileSync(process.env.HAPSLAND_170_CALLS,'utf8').trim().split('\\n').filter(Boolean).length}catch{}
    if(count>=8)throw new Error('Jev request ceiling reached');
    appendFileSync(process.env.HAPSLAND_170_CALLS,JSON.stringify({kind:'request',at:Date.now()})+'\\n',{mode:0o600});
  }finally{rmdirSync(lock)}
  const at=Date.now();
  try{
    const response=await original(...args);
    appendFileSync(process.env.HAPSLAND_170_EVENTS,JSON.stringify({kind:'provider-response',at:Date.now(),durationMs:Date.now()-at,status:response.status})+'\\n',{mode:0o600});
    if (process.env.HAPSLAND_170_RESPONSE_DELAY_MS !== '0') await new Promise(resolve=>setTimeout(resolve,Number(process.env.HAPSLAND_170_RESPONSE_DELAY_MS)));
    return response;
  }catch{
    appendFileSync(process.env.HAPSLAND_170_EVENTS,JSON.stringify({kind:'provider-failure',at:Date.now()})+'\\n',{mode:0o600});
    throw new Error('Jev request failed');
  }
};
`);
  writeFileSync(bridge, `import {readFileSync,appendFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const input=readFileSync(0,'utf8');let event;try{event=JSON.parse(input)}catch{}
const at=Date.now();
const result=spawnSync(process.execPath,[${JSON.stringify(join(project, "src/cli.ts"))},'--claude-hook','--controlled-writer','--composed-edit-hook'${offlineControl ? ",'--controlled-reviewer'" : ""}],{input,encoding:'utf8',env:process.env,timeout:30000,maxBuffer:1048576});
let out;try{out=JSON.parse(result.stdout)}catch{}
const reason=out?.reason??out?.hookSpecificOutput?.additionalContext??'';
const source=${JSON.stringify(sourcePath)};
const value=existsSync(source)?readFileSync(source,'utf8'):'';
appendFileSync(process.env.HAPSLAND_170_EVENTS,JSON.stringify({kind:'hook',at,doneAt:Date.now(),tool:event?.tool_name??'unknown',exitCode:result.status,decision:out?.decision??null,finding:(out?.decision==='block'||reason.includes('[r6_bare_domain_value, p=')||reason.includes('Hapsland found a current rule finding'))&&!reason.includes('Operational notice:'),notice:reason.includes('Operational notice:'),ruleIds:[...reason.matchAll(/\\[([a-z0-9_]+), p=/g)].map(match=>match[1]),sourceHash:value?createHash('sha256').update(value).digest('hex'):null,sourceBytes:Buffer.byteLength(value),draft:${countFixture ? "value.trim()==='type OrderCount = number'" : "value.includes('receipt: string | null')&&value.includes('failureReason: string | null')"}})+'\\n',{mode:0o600});
if(result.status===0)process.stdout.write(result.stdout??'');
process.exitCode=result.status??1;
`);
  writeFileSync(composedBridge, `import {readFileSync,appendFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const kind=process.argv[2];
const input=readFileSync(0,'utf8');
const at=Date.now();
const result=spawnSync(process.execPath,[${JSON.stringify(join(project, "src/cli.ts"))},'--composed-'+kind+'-hook','--composed-host=claude-code'${offlineControl ? ",'--controlled-reviewer'" : ""}],{input,encoding:'utf8',env:process.env,timeout:30000,maxBuffer:1048576});
let output;try{output=JSON.parse(result.stdout)}catch{}
const message=output?.reason??output?.hookSpecificOutput?.additionalContext??output?.systemMessage??'';
appendFileSync(process.env.HAPSLAND_170_EVENTS,JSON.stringify({kind:'composed-'+kind,at,doneAt:Date.now(),exitCode:result.status,decision:output?.decision??null,finding:output?.decision==='block'||message.includes('[r6_bare_domain_value, p='),notice:message.includes('Operational notice:'),ruleIds:[...message.matchAll(/\\[([a-z0-9_]+), p=/g)].map(match=>match[1])})+'\\n',{mode:0o600});
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
  const env = { ...process.env, ...(offlineControl ? {} : { TYPESAFE_API_KEY: key }), REVIEW_RESIDENT_DIR: runtime,
    REVIEW_ACTIVITY_PATH: activity, REVIEW_USER_CONFIG_PATH: userConfigPath,
    HAPSLAND_170_EVENTS: events, HAPSLAND_170_CALLS: calls, HAPSLAND_170_RESPONSE_DELAY_MS: String(responseDelayMs),
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${observer}`.trim() };
  if (offlineControl) {
    delete env.TYPESAFE_API_KEY;
    env.REVIEW_CONTROL_JSON = JSON.stringify({ syntheticR6BrandedRepair: "finding" });
  } else delete env.REVIEW_CONTROL_JSON;
  const prompt = countFixture ? `Use native Write to create order-count.ts containing exactly this one line and a final newline: type OrderCount = number. Then finish your turn immediately. Do not repair before Hapsland feedback. If an actionable Hapsland finding is returned by the Stop hook, repair the type using Edit or Write so a raw number is not assignable to OrderCount; then finish. If no finding arrives, leave the draft unchanged. Stay in this repository and do not inspect integration configuration, credentials, or environment variables. Make at most two source edits. In your final reply include HAPSLAND_ADVICE_APPLIED only if you personally received actionable Hapsland advice and changed the type because of it; otherwise include HAPSLAND_ADVICE_NOT_APPLIED. State the rule ID from the advice if you received one. Be truthful.` : `Implement the payment-state example in README.md. First use the native Write tool to create payment.ts with this initial draft exactly:
export interface PaymentState {
  status: "pending" | "succeeded" | "failed";
  receipt: string | null;
  failureReason: string | null;
}
After that first Write, finish your turn immediately without running tests or making another edit. Do not repair this initial draft before Hapsland feedback. If an actionable Hapsland finding is returned by the Stop hook, repair the type using Edit or Write so invalid combinations are impossible, then run npm test and finish. If no finding arrives, leave the draft unchanged and say so truthfully. Stay in this repository; do not inspect integration configuration, credentials, or environment variables. Make at most two source edits. In your final reply state whether automated review affected the change; do not invent feedback.`;
  const host = await run(claudeBinary, ["--setting-sources", "project", "-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence",
    "--allowedTools", "Read,Edit,Write,Bash", "--permission-mode", "acceptEdits", prompt], env, repo, 240_000);
  const finalText = host.stdout.split("\n").filter(Boolean).flatMap((line) => {
    try {
      const event = JSON.parse(line);
      return event?.type === "result" && typeof event.result === "string" ? [event.result] : [];
    } catch { return []; }
  }).join("\n");
  const timeline = readLines(events).map((entry) => ({ ...entry, atMs: entry.at - started, hookDurationMs: entry.doneAt === undefined ? undefined : entry.doneAt - entry.at, at: undefined, doneAt: undefined }));
  const activityStages = stages(activity);
  const deliveredRuleIds = [...new Set(timeline.filter((entry) => entry.finding).flatMap((entry) => entry.ruleIds ?? []))];
  const agentAffirmsAdvice = finalText.includes("HAPSLAND_ADVICE_APPLIED");
  const agentDeniesAdvice = finalText.includes("HAPSLAND_ADVICE_NOT_APPLIED");
  const agentNamesDeliveredRule = deliveredRuleIds.some((ruleId) => finalText.includes(ruleId));
  const source = existsSync(sourcePath) ? readFileSync(sourcePath, "utf8") : "";
  const finding = timeline.find((entry) => entry.finding);
  const stopFindingDelivered = timeline.some((entry) => entry.kind === "composed-stop" && entry.decision === "block" && entry.finding);
  const editedAfterFinding = !!finding && timeline.some((entry) => entry.kind === "hook" && entry.atMs > finding.atMs && !entry.draft);
  const repairedAtMs = timeline.find((entry) => entry.kind === "hook" && entry.atMs > (finding?.atMs ?? Infinity) && !entry.draft)?.atMs;
  const followupStage = repairedAtMs === undefined ? undefined : activityStages.find((entry) =>
    entry.atMs > repairedAtMs && (entry.stage === "clear" || entry.stage === "findings"));
  const compile = spawnSync("npm", ["test"], { cwd: repo, env, encoding: "utf8", timeout: 30_000 });
  let invalidStatesRejected = false;
  if (source) {
    writeFileSync(join(repo, "invalid-states.ts"), countFixture ? `// @ts-expect-error a raw number is not a branded order count
const invalid: OrderCount = 2;
` : `import type { PaymentState } from './payment.js';
// @ts-expect-error success requires receipt
const missing: PaymentState = { status: 'succeeded', receipt: null, failureReason: null };
// @ts-expect-error pending cannot contain success
const premature: PaymentState = { status: 'pending', receipt: 'r', failureReason: null };
// @ts-expect-error success cannot also carry failure
const contradictory: PaymentState = { status: 'succeeded', receipt: 'r', failureReason: 'failed' };
`);
    // An unused @ts-expect-error is not reported by the installed native compiler.
    // Probe actual rejection without suppression; a successful baseline must precede it.
    const invalidPath = join(repo, "invalid-states.ts");
    writeFileSync(invalidPath, readFileSync(invalidPath, "utf8").replace(/^\/\/ @ts-expect-error[^\n]*\n/gm, ""));
    invalidStatesRejected = compile.status === 0 && spawnSync("npm", ["test"], { cwd: repo, env, encoding: "utf8", timeout: 30_000 }).status !== 0;
  }
  let resident = null;
  try {
    owner = JSON.parse(readFileSync(residentPaths(runtime).owner, "utf8"));
    const result = await residentRequest(residentPaths(runtime), { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime });
    if (result?.status === "stats") resident = { queued: result.queued, running: result.running,
      pendingFindingBatches: result.pendingFindingBatches, pendingOperationalNotices: result.pendingOperationalNotices };
  } catch { /* native path may not start a resident */ }
  const record = { schemaVersion: 1, runtime: "Claude Code", version: spawnSync(claudeBinary, ["--version"], { encoding: "utf8" }).stdout.trim(),
    recordedAt: new Date().toISOString(), declaration: { maximumProviderRequests: ceiling, automaticRetries: 0, sessionCeilingMs: 240_000,
      claudeFeedbackMode: "block-current-findings", mode: offlineControl ? "controlled-offline" : "real-jev", fixture: countFixture ? "order-count" : "payment-state" },
    hostExitCode: host.code, hostSignal: host.signal, elapsedMs: Date.now() - started, providerRequests: readLines(calls).length,
    responseDelayMs, timeline, activityStages, checks: { initialDraftObserved: timeline.some((entry) => entry.draft), findingSubmitted: !!finding,
      stopFindingDelivered, editAfterFinding: editedAfterFinding, finalSourceChanged: !!source && (countFixture ? source.trim() !== "type OrderCount = number" : !source.includes("receipt: string | null")),
      validSourceCompiles: compile.status === 0, invalidStatesRejected,
      agentAcknowledgesAdvice: agentAffirmsAdvice && !agentDeniesAdvice,
      agentNamesDeliveredRule,
      followupClearObserved: followupStage?.stage === "clear",
      followupFindingObserved: followupStage?.stage === "findings" },
    resident, visibilityBasis: agentAffirmsAdvice && !agentDeniesAdvice ? "agent-acknowledgement" :
      countFixture && stopFindingDelivered && editedAfterFinding ? "conditional-unprescribed-repair-after-stop" : "unconfirmed",
    acknowledgement: { agentAffirmsAdvice, agentDeniesAdvice, deliveredRuleIds, agentNamesDeliveredRule },
    rawHostOutputRetained: false, rawBackendMaterialRetained: false, credentialRetained: false,
    hostOutputBytesDiscarded: Buffer.byteLength(host.stdout) + host.stderrBytes };
  record.verdict = host.code === 0 && record.checks.initialDraftObserved && record.checks.findingSubmitted &&
    record.checks.editAfterFinding && record.checks.finalSourceChanged && record.checks.validSourceCompiles &&
    record.checks.invalidStatesRejected && record.visibilityBasis !== "unconfirmed" &&
    (record.checks.followupClearObserved || record.checks.followupFindingObserved)
    ? "demonstrated" : "incomplete";
  writeFileSync(join(evidenceDirectory, `${runId}.json`), JSON.stringify(record, null, 2) + "\n");
  console.log(JSON.stringify(record, null, 2));
  if (record.verdict !== "demonstrated") process.exitCode = 1;
} finally {
  try {
    owner ??= JSON.parse(readFileSync(residentPaths(runtime).owner, "utf8"));
    await residentRequest(residentPaths(runtime), { requestRoute: "shared", operation: "cleanup", lifetime: owner.lifetime }).catch(() => {});
    try { process.kill(owner.pid, "SIGTERM"); } catch {}
  } catch {}
  rmSync(root, { recursive: true, force: true });
}
