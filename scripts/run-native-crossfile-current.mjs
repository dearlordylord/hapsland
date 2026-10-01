// Bounded real-host observation of the current cross-file review path.
// Raw host streams, source, provider bodies, and credentials stay in a disposable directory.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { residentRequest } from "../src/resident/client.ts";
import { residentPaths } from "../src/resident/paths.ts";
import * as Effect from "effect/Effect";
import { addEvent } from "../src/direct-event/test-fixtures.ts";
import { adaptCodexAdd, adaptCodexDirectEvent, adaptClaudeDirectEvent } from "../src/direct-event/adapter.ts";
import { prepareObservation } from "../src/direct-event/pipeline.ts";
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../src/runtime/review-config.ts";
import { configuredRules } from "../src/policy/rules.ts";
import { TYPE_INPUT_CONTRACT } from "../src/rules/targets.ts";
import { verifyCodexPostEditHunks } from "../src/direct-event/codex-patch-hunks.ts";

const project = resolve(import.meta.dirname, "..");
const host = process.argv.find((arg) => arg.startsWith("--host="))?.slice(7);
const mode = process.argv.includes("--live") ? "live-jev" : "controlled-offline";
if (host !== "codex" && host !== "claude") throw new Error("Choose --host=codex or --host=claude");
if (mode === "live-jev" && !process.argv.includes("--execute-paid")) throw new Error("Live Jev requires --execute-paid");
const codexBinary = process.env.HAPSLAND_TEST_CODEX ?? "/tmp/hapsland-codex-01551/node_modules/.bin/codex";
const claudeBinary = "/home/node/.local/share/claude/versions/2.1.218";
const binary = host === "codex" ? codexBinary : claudeBinary;
const version = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 10_000 }).stdout?.trim();
if (version !== (host === "codex" ? "codex-cli 0.155.1" : "2.1.218 (Claude Code)"))
  throw new Error(`Unsupported native test profile: ${version ?? "unavailable"}`);

const temp = mkdtempSync(join(tmpdir(), "hapsland-crossfile-native-"));
const repo = join(temp, "repo"), runtime = join(temp, "resident"), activity = join(temp, "activity");
const log = join(temp, "hooks.jsonl"), summaries = join(temp, "requests.jsonl"), calls = join(temp, "calls.jsonl");
const nativeEvents = join(temp, "native-edits.jsonl");
const rootFile = join(repo, "order-count.ts"), supportFile = join(repo, "support.ts");
const started = Date.now();
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const lines = (path) => readFileSync(path, "utf8").trim().split("\n").filter(Boolean).flatMap((line) => {
  try { return [JSON.parse(line)]; } catch { return []; }
});
const safeLines = (path) => { try { return lines(path); } catch { return []; } };
const run = (command, args, env, cwd, timeoutMs = 240_000) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderrBytes = 0;
  const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderrBytes += chunk.length; });
  child.once("error", reject);
  child.once("close", (code, signal) => { clearTimeout(timer); resolveRun({ code, signal, stdout, stderrBytes }); });
});
const initial = "import type { RawCount } from './support';\nexport type OrderCount = RawCount;\n";
const answers = Object.fromEntries([
  "r1_inferred_case", "r2_meaningless_combinations", "r3_split_correlations",
  "r4_duplicate_encoding", "r5_absence_confusion", "r6_bare_domain_value",
  "r7_name_wider_than_type", "r8_name_claims_resource", "r9_body_reaches_undeclared",
].map((id) => [id, { _tag: "Probability", probability: id === "r6_bare_domain_value" ? 0.91 : 0 }]));
const hookScript = join(temp, "hook.mjs");
const observer = join(temp, "observe-fetch.mjs");
let owner;
try {
  mkdirSync(repo);
  const init = spawnSync("git", ["init", "--quiet", "--initial-branch=master", repo]);
  if (init.status !== 0) throw new Error("Disposable Git setup failed");
  writeFileSync(supportFile, "export type RawCount = number;\n");
  writeFileSync(join(repo, "README.md"), "# Order count\nAn OrderCount must reject an arbitrary number after review.\n");
  writeFileSync(join(repo, "tsconfig.json"), JSON.stringify({ compilerOptions: {
    strict: true, noEmit: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", types: [], skipLibCheck: true,
  }, include: ["*.ts"] }));
  writeFileSync(join(repo, "package.json"), JSON.stringify({ private: true, scripts: {
    test: `${quote(process.execPath)} ${quote(join(project, "node_modules/typescript/bin/tsc"))} -p tsconfig.json`,
  } }));
  spawnSync("git", ["-C", repo, "add", "README.md", "support.ts", "tsconfig.json", "package.json"]);

  writeFileSync(hookScript, `import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const kind=process.argv[2], input=readFileSync(0,'utf8');
let native; try { native=JSON.parse(input) } catch {}
const at=Date.now();
const flags=kind==='edit' ? ['--${host === "codex" ? "codex" : "claude"}-hook','--controlled-writer','--composed-edit-hook']
  : ['--composed-'+kind+'-hook','--composed-host=${host === "codex" ? "codex-cli" : "claude-code"}'];
${mode === "controlled-offline" ? "flags.push('--controlled-reviewer');" : ""}
const result=spawnSync(process.execPath,[${JSON.stringify(join(project, "src/cli.ts"))},...flags],
  {input,encoding:'utf8',env:process.env,timeout:30000,maxBuffer:1048576});
let output; try { output=JSON.parse(result.stdout) } catch {}
const message=output?.reason??output?.hookSpecificOutput?.additionalContext??output?.systemMessage??'';
const ruleIds=[...message.matchAll(/\\[([a-z0-9_]+), p=/g)].map(match=>match[1]);
const source=${JSON.stringify(rootFile)};
const value=existsSync(source)?readFileSync(source,'utf8'):'';
if(kind==='edit' && native)appendFileSync(process.env.HAPSLAND_NATIVE_EDITS,JSON.stringify(native)+'\\n',{mode:0o600});
appendFileSync(process.env.HAPSLAND_NATIVE_LOG,JSON.stringify({kind,at,doneAt:Date.now(),
  event:native?.hook_event_name??null,tool:native?.tool_name??null,exitCode:result.status,
  decision:output?.decision??null, finding:ruleIds.length>0, ruleIds,
  sourceHash:value?createHash('sha256').update(value).digest('hex'):null,
  initial:value===${JSON.stringify(initial)}, sourceBytes:Buffer.byteLength(value)})+'\\n',{mode:0o600});
if(result.status===0)process.stdout.write(result.stdout??'');
process.exitCode=result.status??1;
`, { mode: 0o600 });

  writeFileSync(observer, `import {appendFileSync,readFileSync} from 'node:fs';
const original=globalThis.fetch;
globalThis.fetch=async (...args)=>{
  const url=String(args[0]?.url??args[0]);
  if(!url.includes('/v1/systemone'))return original(...args);
  const path=process.env.HAPSLAND_NATIVE_CALLS;
  let count=0;try{count=readFileSync(path,'utf8').trim().split('\\n').filter(Boolean).length}catch{}
  if(count>=6)throw new Error('native milestone provider ceiling reached');
  appendFileSync(path,JSON.stringify({at:Date.now(),kind:'request'})+'\\n',{mode:0o600});
  const body=String(args[1]?.body??args[0]?.body??'');
  appendFileSync(process.env.HAPSLAND_NATIVE_SUMMARIES,JSON.stringify({provider:true,
    expandedEvidence:body.includes('expanded'),supportDeclarationPresent:body.includes('export type RawCount = number'),
    bytes:Buffer.byteLength(body)})+'\\n',{mode:0o600});
  return original(...args);
};
`, { mode: 0o600 });

  const command = (kind) => `${quote(process.execPath)} ${quote(hookScript)} ${kind}`;
  const editTools = host === "codex" ? "apply_patch" : "Edit|Write";
  const settings = { hooks: {
    PreToolUse: [{ matcher: editTools, hooks: [{ type: "command", command: command("before-edit"), timeout: 5 }] }],
    PostToolUse: [{ matcher: editTools, hooks: [
      { type: "command", command: command("edit"), timeout: 10 },
      { type: "command", command: command("background"), timeout: 25, async: true },
    ] }],
    Stop: [{ hooks: [{ type: "command", command: command("stop"), timeout: 5 }] }],
    UserPromptSubmit: [{ hooks: [{ type: "command", command: command("prompt"), timeout: 4 }] }],
  } };
  const config = join(temp, "user-config.jsonc");
  writeFileSync(config, JSON.stringify({ version: 1, claudeFeedbackMode: "block-current-findings" }));
  const home = join(temp, "codex-home");
  if (host === "codex") {
    mkdirSync(home, { mode: 0o700 });
    copyFileSync(join(process.env.CODEX_HOME ?? "/home/node/.codex", "auth.json"), join(home, "auth.json"));
    chmodSync(join(home, "auth.json"), 0o600);
    writeFileSync(join(home, "config.toml"), "[features]\nhooks = true\n");
    writeFileSync(join(home, "hooks.json"), JSON.stringify(settings));
  } else {
    mkdirSync(join(repo, ".claude"));
    writeFileSync(join(repo, ".claude", "settings.json"), JSON.stringify(settings));
  }
  const env = { ...process.env, REVIEW_RESIDENT_DIR: runtime, REVIEW_ACTIVITY_PATH: activity,
    REVIEW_USER_CONFIG_PATH: config, HAPSLAND_NATIVE_LOG: log, HAPSLAND_NATIVE_SUMMARIES: summaries,
    HAPSLAND_NATIVE_CALLS: calls, HAPSLAND_NATIVE_EDITS: nativeEvents,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${observer}`.trim(),
    ...(host === "codex" ? { CODEX_HOME: home } : {}),
  };
  if (mode === "controlled-offline") {
    delete env.TYPESAFE_API_KEY;
    env.REVIEW_CONTROL_JSON = JSON.stringify({ answers, requestSummaryPath: summaries });
  } else {
    delete env.REVIEW_CONTROL_JSON;
    if (!env.TYPESAFE_API_KEY) {
      const text = readFileSync(join(project, ".env"), "utf8");
      const raw = text.match(/^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/m)?.[1];
      env.TYPESAFE_API_KEY = raw?.replace(/^(['"])(.*)\1$/, "$2");
    }
    if (!env.TYPESAFE_API_KEY) throw new Error("Jev credential unavailable");
  }
  delete env.OPENAI_API_KEY;
  const prompt = `Use ${host === "codex" ? "apply_patch" : "Write"} to create order-count.ts with exactly these two lines:\n${initial}\n` +
    "After that edit, finish immediately. Do not repair before Hapsland feedback. If Hapsland gives actionable advice, repair OrderCount so an arbitrary number cannot be assigned to it. Then run npm test and finish. If no advice arrives, leave the draft unchanged. Use at most two source-edit tool calls. Stay in this repository; do not inspect integration settings, credentials or environment variables. In your final reply include HAPSLAND_ADVICE_APPLIED only if you received actionable Hapsland advice and used it; otherwise include HAPSLAND_ADVICE_NOT_APPLIED. Name the delivered rule ID if you saw one. Be truthful.";
  const args = host === "codex"
    ? ["exec", "--ephemeral", "--json", "--dangerously-bypass-hook-trust", "--dangerously-bypass-approvals-and-sandbox", "--ignore-rules", "-C", repo, prompt]
    : ["-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence",
      "--allowedTools", "Read,Edit,Write,Bash", "--permission-mode", "acceptEdits", prompt];
  const result = await run(binary, args, env, repo);
  const native = safeLines(log);
  const requestShapes = safeLines(summaries);
  const providerCalls = safeLines(calls).length;
  const messages = result.stdout.split("\n").filter(Boolean).flatMap((line) => {
    try {
      const item = JSON.parse(line);
      if (host === "claude" && item.type === "result" && typeof item.result === "string") return [item.result];
      if (host === "codex" && item.item?.type === "agent_message" && typeof item.item.text === "string") return [item.item.text];
    } catch { /* raw host stream discarded below */ }
    return [];
  });
  const text = messages.at(-1) ?? "";
  const finding = native.find((event) => event.finding && (event.kind === "edit" || event.kind === "stop")) ??
    native.find((event) => event.finding);
  const repair = finding && native.find((event) => event.kind === "edit" && event.at > finding.at &&
    event.sourceHash && event.sourceHash !== finding.sourceHash);
  const source = existsSync(rootFile) ? readFileSync(rootFile, "utf8") : "";
  const diagnosticObservation = await Effect.runPromise(adaptCodexAdd(addEvent(repo, ["order-count.ts"])));
  const postEditPreparation = diagnosticObservation === undefined ? { status: "adaptation-failed" } :
    await Effect.runPromise(prepareObservation(diagnosticObservation, {
      controlledWriter: true, advicee: diagnosticObservation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
      rules: configuredRules, inputContract: TYPE_INPUT_CONTRACT,
    })).then((prepared) => ({ status: prepared.observation.status,
      pathReasons: prepared.observation.outcomes.filter((item) => item.status === "incomplete").map((item) => item.reason),
      analysisFailures: prepared.observation.outcomes.flatMap((item) => item.status === "observed" && item.analysis.status === "incomplete"
        ? item.analysis.failures.map((failure) => failure.reason) : []),
      readyUnits: prepared.outcomes.filter((item) => item.status === "ready").length,
    }));
  const lastNativeEdit = safeLines(nativeEvents).at(-1);
  const nativeResponse = lastNativeEdit?.tool_response;
  const nativePatchPath = typeof lastNativeEdit?.tool_input?.command === "string"
    ? /^\*\*\* Update File: (.+)$/m.exec(lastNativeEdit.tool_input.command)?.[1] : undefined;
  const nativeObservation = lastNativeEdit === undefined ? undefined : await Effect.runPromise(
    host === "codex" ? adaptCodexDirectEvent(lastNativeEdit) : adaptClaudeDirectEvent(lastNativeEdit));
  const nativeResponseShape = host === "codex" ? {
    responseType: typeof nativeResponse,
    responseKeys: nativeResponse !== null && typeof nativeResponse === "object" ? Object.keys(nativeResponse) : [],
    explicitSuccess: nativeResponse?.success === true,
    successWord: typeof nativeResponse === "string" && /success|updated|done|patch applied/i.test(nativeResponse),
    startsSuccessDot: typeof nativeResponse === "string" && /^Success\./u.test(nativeResponse),
    containsSuccessDot: typeof nativeResponse === "string" && /Success\./u.test(nativeResponse),
    startsPatchApplied: typeof nativeResponse === "string" && /^Patch applied/iu.test(nativeResponse),
    failureWord: typeof nativeResponse === "string" && /error|failed|could not|not found/i.test(nativeResponse),
    verifiedHunks: typeof lastNativeEdit?.tool_input?.command === "string"
      ? verifyCodexPostEditHunks(lastNativeEdit.tool_input.command, "order-count.ts", source)?.length ?? null : null,
    normalizedPatchPresent: typeof nativeObservation?.nativePatchCommand === "string",
    normalizedVerifiedHunks: typeof nativeObservation?.nativePatchCommand === "string"
      ? verifyCodexPostEditHunks(nativeObservation.nativePatchCommand, "order-count.ts", source)?.length ?? null : null,
    patchPathAbsolute: nativePatchPath?.startsWith("/") ?? false,
    patchPathRelativeMatch: nativePatchPath === "order-count.ts",
    patchPathInsideRepo: nativePatchPath?.startsWith(`${repo}/`) ?? false,
    patchHasCarriageReturn: lastNativeEdit?.tool_input?.command?.includes("\r") ?? false,
  } : undefined;
  const nativeUpdatePreparation = nativeObservation === undefined ? { status: "adaptation-failed" } :
    await Effect.runPromise(prepareObservation(nativeObservation, {
      controlledWriter: true, advicee: nativeObservation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
      rules: configuredRules, inputContract: TYPE_INPUT_CONTRACT,
    })).then((prepared) => ({ status: prepared.observation.status,
      pathReasons: prepared.observation.outcomes.filter((item) => item.status === "incomplete").map((item) => item.reason),
      analysisFailures: prepared.observation.outcomes.flatMap((item) => item.status === "observed" && item.analysis.status === "incomplete"
        ? item.analysis.failures.map((failure) => failure.reason) : []),
      readyUnits: prepared.outcomes.filter((item) => item.status === "ready").length,
      operations: nativeObservation.candidates.map((item) => item.operation),
    }));
  const check = spawnSync("npm", ["test"], { cwd: repo, env, encoding: "utf8", timeout: 30_000 });
  writeFileSync(join(repo, "invalid.ts"), "import type { OrderCount } from './order-count';\n// @ts-expect-error raw numbers must not be OrderCount\nconst invalid: OrderCount = 2;\n");
  const invalid = spawnSync("npm", ["test"], { cwd: repo, env, encoding: "utf8", timeout: 30_000 });
  const stages = [];
  const visit = (path) => {
    if (!existsSync(path)) return;
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, item.name);
      if (item.isDirectory()) visit(child);
      else {
        try {
          const marker = JSON.parse(readFileSync(child, "utf8"));
          if (typeof marker.stage === "string") stages.push({ stage: marker.stage, atMs: Math.round(statSync(child).mtimeMs - started) });
        } catch { /* source-free markers only */ }
      }
    }
  };
  visit(activity);
  stages.sort((a, b) => a.atMs - b.atMs);
  const record = { schemaVersion: 1, recordedAt: new Date().toISOString(), commit: spawnSync("git", ["-C", project, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(),
    sourceWorktreeDirty: spawnSync("git", ["-C", project, "diff", "--quiet", "--", "src", "scripts"], { encoding: "utf8" }).status !== 0,
    runtime: host === "codex" ? "Codex CLI" : "Claude Code", version, mode,
    declaration: { maximumProviderRequests: 6, automaticRetries: 0, hostCeilingMs: 240_000, syntheticRepositoryOnly: true },
    hostExitCode: result.code, hostSignal: result.signal, elapsedMs: Date.now() - started, providerCalls,
    requestShapes, postEditPreparation, nativeUpdatePreparation, nativeResponseShape,
    activityStages: stages, hookEvents: native.map((item) => ({
      kind: item.kind, atMs: item.at - started, durationMs: item.doneAt - item.at, event: item.event,
      tool: item.tool, exitCode: item.exitCode, decision: item.decision, finding: item.finding,
      ruleIds: item.ruleIds, initial: item.initial, sourceBytes: item.sourceBytes,
    })),
    checks: { initialDraftObserved: native.some((item) => item.initial),
      crossFileExpanded: requestShapes.some((item) => item.expandedEdges > 0 || item.expandedEvidence && item.supportDeclarationPresent),
      findingDelivered: !!finding, editAfterFinding: !!repair, agentAcknowledgesAdvice: text.includes("HAPSLAND_ADVICE_APPLIED") && !text.includes("HAPSLAND_ADVICE_NOT_APPLIED"),
      agentNamesRule: !!finding && finding.ruleIds.some((id) => text.includes(id)),
      sourceChanged: !!source && source !== initial, sourceCompiles: check.status === 0,
      rawNumberRejected: invalid.status === 0,
      followupObserved: !!repair && stages.some((item) => item.atMs > repair.at - started && (item.stage === "clear" || item.stage === "findings")),
    },
    rawHostStreamRetained: false, sourceRetained: false, providerBodyRetained: false, credentialsRetained: false,
    hostBytesDiscarded: Buffer.byteLength(result.stdout) + result.stderrBytes };
  record.verdict = result.code === 0 && Object.entries(record.checks)
    .filter(([name]) => name !== "agentNamesRule").every(([, value]) => value) ? "demonstrated" : "incomplete";
  const output = join(project, "evidence", "native-current", `${host}-${mode}-${Date.now()}.json`);
  mkdirSync(join(project, "evidence", "native-current"), { recursive: true });
  writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify({ evidence: output, verdict: record.verdict, checks: record.checks, providerCalls }));
  if (record.verdict !== "demonstrated") process.exitCode = 1;
} finally {
  try {
    owner = JSON.parse(readFileSync(residentPaths(runtime).owner, "utf8"));
    await residentRequest(residentPaths(runtime), { requestRoute: "shared", operation: "cleanup", lifetime: owner.lifetime }).catch(() => {});
    process.kill(owner.pid, "SIGTERM");
  } catch { /* resident may never have started */ }
  rmSync(temp, { recursive: true, force: true });
}
