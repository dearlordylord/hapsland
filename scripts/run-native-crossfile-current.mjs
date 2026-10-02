// Bounded real-host observation of TypeScript, Rust and Bend cross-file review.
// Raw host streams, source, provider bodies, and credentials stay in a disposable directory.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, watch, writeFileSync } from "node:fs";
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

import { faultProfile, assessPreFault } from './native-hook-faults.mjs';

const project = resolve(import.meta.dirname, "..");
const host = process.argv.find((arg) => arg.startsWith("--host="))?.slice(7);
const language = process.argv.find(arg => arg.startsWith('--language='))?.slice(11) ?? 'typescript';
if (!['typescript','rust','bend'].includes(language)) throw new Error('Choose a supported source language');
const scenario = process.argv.find(arg => arg.startsWith('--scenario='))?.slice(11) ?? 'adoption';
if (!['adoption','reviewer-unavailable','hook-crash','hook-timeout','stale-result','pre-delay','pre-timeout','pre-crash'].includes(scenario))
  throw new Error('Choose an adoption, reviewer, POST-hook or PRE-hook scenario');
const fault = faultProfile(scenario);
const preFault = fault?.phase === 'pre';
const suppliedStaleDelay = process.argv.find(arg => arg.startsWith('--controlled-delay-ms='))?.slice(22);
if (suppliedStaleDelay !== undefined && scenario !== 'stale-result') throw new Error('Controlled delay override requires stale-result');
const staleDelayMs = suppliedStaleDelay === undefined ? 9000 : Number(suppliedStaleDelay);
if (!Number.isInteger(staleDelayMs) || staleDelayMs < 1000 || staleDelayMs > 14000)
  throw new Error('Controlled stale delay must be 1000–14000 ms');
const fixtures = {
 typescript: {entry:'payment.ts',support:'support.ts',supportSource:'export type PaymentStatus = "pending" | "succeeded" | "failed";\nexport interface Receipt { value: string }\n',initial:"import type { PaymentStatus, Receipt } from './support';\nexport interface PaymentState { status: PaymentStatus; receipt: Receipt | null; failure_reason: string | null }\n",good:"import type { PaymentStatus, Receipt } from './support';\nexport type PaymentState = { status: 'pending' } | { status: 'succeeded'; receipt: Receipt } | { status: 'failed'; failure_reason: string };\n"},
 rust: {entry:'src/lib.rs',support:'src/support.rs',supportSource:'pub enum PaymentStatus { Pending, Succeeded, Failed }\npub struct Receipt { pub value: String }\n',initial:'mod support; use self::support::PaymentStatus; use self::support::Receipt;\npub struct PaymentState { pub status: PaymentStatus, pub receipt: Option<Receipt>, pub failure_reason: Option<String> }\n',good:'mod support; use self::support::PaymentStatus; use self::support::Receipt;\npub enum PaymentState { Pending, Succeeded { receipt: Receipt }, Failed { failure_reason: String } }\n'},
 bend: {entry:'payment.bend',support:'support.bend',supportSource:'import Base\ntype PaymentStatus is Data:\n  Pending{}\n  Succeeded{}\n  Failed{}\ntype Receipt is Data:\n  Receipt{value: String}\ntype OptionalReceipt is Data:\n  Absent{}\n  Present{value: Receipt}\ntype OptionalString is Data:\n  AbsentText{}\n  PresentText{value: String}\n',initial:'import Base\nimport ./support.bend as M\ntype PaymentState is Data:\n  PaymentState{status: M.PaymentStatus, receipt: M.OptionalReceipt, failure_reason: M.OptionalString}\n',good:'import Base\nimport ./support.bend as M\ntype PaymentState is Data:\n  Pending{}\n  Succeeded{receipt: M.Receipt}\n  Failed{failure_reason: String}\n'},
};
const fixture = fixtures[language];
const initialSourceMarker = language === 'typescript' ? 'interface PaymentState'
  : language === 'rust' ? 'struct PaymentState' : 'PaymentState{status:';
const mode = process.argv.includes("--live") ? "live-jev" : "controlled-offline";
if (host !== "codex" && host !== "claude") throw new Error("Choose --host=codex or --host=claude");
if (mode === "live-jev" && !process.argv.includes("--execute-paid")) throw new Error("Live Jev requires --execute-paid");
if (scenario !== 'adoption' && mode === 'live-jev') throw new Error('Fault scenarios use the controlled offline reviewer');
const codexBinary = process.env.HAPSLAND_TEST_CODEX ?? "/tmp/hapsland-codex-01551/node_modules/.bin/codex";
const claudeBinary = "/home/node/.local/share/claude/versions/2.1.218";
const binary = host === "codex" ? codexBinary : claudeBinary;
const version = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 10_000 }).stdout?.trim();
if (version !== (host === "codex" ? "codex-cli 0.155.1" : "2.1.218 (Claude Code)"))
  throw new Error(`Unsupported native test profile: ${version ?? "unavailable"}`);

const temp = mkdtempSync(join(tmpdir(), "hapsland-crossfile-native-"));
const repo = join(temp, "repo"), runtime = join(temp, "resident"), activity = join(temp, "activity");
const log = join(temp, "hooks.jsonl"), summaries = join(temp, "requests.jsonl"), calls = join(temp, "calls.jsonl");
const outcomes = join(temp, "outcomes.jsonl");
const nativeEvents = join(temp, "native-edits.jsonl");
const rootFile = join(repo, fixture.entry), supportFile = join(repo, fixture.support);
const started = Date.now();
const startedMono = Number(process.hrtime.bigint()) / 1_000_000;
let firstMutation;
let mutationWatcher;
let observerArmedMono;
const runId = `${host}-${language}-${scenario}-${mode}-${started}`;
const evidenceRoot = join(project, 'evidence', scenario === 'adoption' ? 'native-languages' : 'native-negative');
const declaration = {scenario,maximumProviderRequests:mode === 'live-jev' ? 6 : 0,automaticHostRetries:0,
  hostCeilingMs:240000,syntheticRepositoryOnly:true,maximumSourceEditCalls:scenario === 'stale-result' || scenario === 'adoption' ? 2 : 1,
  sourceProfile:'bounded local cross-file types',runtimeVersion:version,
  ...(preFault ? {hookPhase:'PRE',injectedDelayMs:fault.delayMs,nativePreHookDeadlineMs:fault.timeoutSeconds*1000,
    permitRegistrationBypassed:true,productionPreAdmissionConformance:false,maximumReviewerRequests:0,
    actualNativeToolStartObservable:false,holdSampleIntervalMs:50,onePersistentFixtureCreation:true,mutationLandmark:'filesystem observer proxy'} : {}),
  ...(scenario === 'hook-timeout' ? {nativeEditHookDeadlineMs:2000,injectedHookSleepMs:10000} : {}),
  ...(scenario === 'stale-result' ? {controlledReviewDelayMs:staleDelayMs,oldResult:'finding',newResult:'clear'} : {})};
mkdirSync(evidenceRoot,{recursive:true});
writeFileSync(join(evidenceRoot,`${runId}-declaration.json`),JSON.stringify({schemaVersion:1,declaredAt:new Date().toISOString(),host,language,mode,scenario,declaration},null,2)+'\n',{flag:'wx'});
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
const initial = fixture.initial;
const answers = Object.fromEntries([
  "r1_inferred_case", "r2_meaningless_combinations", "r3_split_correlations",
  "r4_duplicate_encoding", "r5_absence_confusion", "r6_bare_domain_value",
  "r7_name_wider_than_type", "r8_name_claims_resource", "r9_body_reaches_undeclared",
].map((id) => [id, { _tag: "Probability", probability: 0 }]));
const hookScript = join(temp, "hook.mjs");
const observer = join(temp, "observe-fetch.mjs");
let owner;
try {
  mkdirSync(repo);
  const init = spawnSync("git", ["init", "--quiet", "--initial-branch=master", repo]);
  if (init.status !== 0) throw new Error("Disposable Git setup failed");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(supportFile, fixture.supportSource);
  if(language === "rust") writeFileSync(join(repo,"Cargo.toml"), '[package]\nname="synthetic_payment"\nversion="0.1.0"\nedition="2021"\n');
  writeFileSync(join(repo, "README.md"), "# Order count\nA payment is pending, succeeded with a receipt, or failed with a failure reason. Pending has neither result; success and failure are mutually exclusive.\n");
  writeFileSync(join(repo, "tsconfig.json"), JSON.stringify({ compilerOptions: {
    strict: true, noEmit: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", types: [], skipLibCheck: true,
  }, include: ["*.ts"] }));
  writeFileSync(join(repo, "package.json"), JSON.stringify({ private: true, scripts: {
    test: language === "typescript" ? `${quote(process.execPath)} ${quote(join(project, "node_modules/typescript/bin/tsc"))} -p tsconfig.json` : language === "rust" ? "rustc --edition=2021 --crate-type=lib src/lib.rs -o fixture.rlib" : "bend payment.bend --check-only",
  } }));
  spawnSync("git", ["-C", repo, "add", "README.md", "support.ts", "tsconfig.json", "package.json"]);

  writeFileSync(hookScript, `import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { observeHold } from ${JSON.stringify(new URL('./native-hook-faults.mjs',import.meta.url).href)};
const kind=process.argv[2], input=readFileSync(0,'utf8');
let native; try { native=JSON.parse(input) } catch {}
const at=Date.now(), entryMono=Number(process.hrtime.bigint())/1000000;
const digest=value=>typeof value==='string'?createHash('sha256').update(value).digest('hex'):null;
const identity={sessionHash:digest(native?.session_id),rootHash:digest(${JSON.stringify(repo)})};
const fault=${JSON.stringify(fault ?? null)};
const mono=()=>Number(process.hrtime.bigint())/1000000;
if(fault && (fault.phase==='pre'?kind==='before-edit':kind==='edit'||kind==='background')) {
  const faultSource=${JSON.stringify(rootFile)};
  const faultValue=existsSync(faultSource)?readFileSync(faultSource,'utf8'):'';
  const toolUseHash=native?.tool_use_id?createHash('sha256').update(native.tool_use_id).digest('hex'):null;
  appendFileSync(process.env.HAPSLAND_NATIVE_LOG,JSON.stringify({kind,at,...identity,monoMs:mono(),pid:process.pid,doneAt:null,
    event:native?.hook_event_name??null,tool:native?.tool_name??null,toolUseHash,
    injectedFault:${JSON.stringify(scenario)},initial:faultValue===${JSON.stringify(initial)},
    sourceBytes:Buffer.byteLength(faultValue)})+'\\n',{mode:0o600});
  appendFileSync(process.env.HAPSLAND_NATIVE_LOG,JSON.stringify({kind:'hold-ready',at:Date.now(),monoMs:mono(),pid:process.pid,targetKind:kind,toolUseHash})+'\\n',{mode:0o600});
  const hold=await observeHold(faultSource,fault.delayMs);

  appendFileSync(process.env.HAPSLAND_NATIVE_LOG,JSON.stringify({kind:'fault-completed',at:Date.now(),monoMs:mono(),pid:process.pid,doneAt:Date.now(),
    targetKind:kind,toolUseHash,hold,injectedFault:${JSON.stringify(scenario)},exitCode:fault.exitCode})+'\\n',{mode:0o600});
  if(fault.exitCode===0)process.stdout.write('{}\\n');
  process.exit(fault.exitCode);
}
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
appendFileSync(process.env.HAPSLAND_NATIVE_LOG,JSON.stringify({kind,at,...identity,monoMs:entryMono,doneAt:Date.now(),
  event:native?.hook_event_name??null,tool:native?.tool_name??null,exitCode:result.status,
  toolUseHash:native?.tool_use_id?createHash('sha256').update(native.tool_use_id).digest('hex'):null,
  decision:output?.decision??null, finding:ruleIds.length>0, ruleIds,
  sourceHash:value?createHash('sha256').update(value).digest('hex'):null,
  initial:value===${JSON.stringify(initial)}, sourceBytes:Buffer.byteLength(value)})+'\\n',{mode:0o600});
if(result.status===0)process.stdout.write(result.stdout??'');
process.exitCode=result.status??1;
`, { mode: 0o600 });

  if(spawnSync(process.execPath,['--check',hookScript],{encoding:'utf8'}).status!==0)
    throw new Error('Generated native hook failed syntax validation before host execution');

  writeFileSync(observer, `import {appendFileSync,readFileSync} from 'node:fs';
const original=globalThis.fetch;
appendFileSync(process.env.HAPSLAND_NATIVE_CALLS,JSON.stringify({at:Date.now(),kind:'observer-ready'})+'\\n',{mode:0o600});
globalThis.fetch=async (...args)=>{
  const url=String(args[0]?.url??args[0]);
  if(!url.includes('/v1/systemone'))return original(...args);
  const path=process.env.HAPSLAND_NATIVE_CALLS;
  let count=0;try{count=readFileSync(path,'utf8').trim().split('\\n').filter(Boolean).map(line=>JSON.parse(line)).filter(item=>item.kind==='request'||item.kind==='blocked-attempt').length}catch{}
  if(count>=${mode === 'live-jev' ? 6 : 0}){
    appendFileSync(path,JSON.stringify({at:Date.now(),kind:'blocked-attempt'})+'\\n',{mode:0o600});
    throw new Error('native milestone provider ceiling reached');
  }
  appendFileSync(path,JSON.stringify({at:Date.now(),kind:'request'})+'\\n',{mode:0o600});
  const body=String(args[1]?.body??args[0]?.body??'');
  appendFileSync(process.env.HAPSLAND_NATIVE_SUMMARIES,JSON.stringify({provider:true,
    expandedEvidence:body.includes('expanded'),supportDeclarationPresent:body.includes(${JSON.stringify(language === "typescript" ? "export interface Receipt" : language === "rust" ? "pub struct Receipt" : "type Receipt is Data:")}),
    bytes:Buffer.byteLength(body)})+'\\n',{mode:0o600});
  return original(...args);
};
`, { mode: 0o600 });

  const command = (kind) => `${kind === 'before-edit' ? 'exec ' : ''}${quote(process.execPath)} ${quote(hookScript)} ${kind}`;
  const editTools = host === "codex" ? "apply_patch" : "Edit|Write";
  const settings = { hooks: {
    PreToolUse: [{ matcher: editTools, hooks: [{ type: "command", command: command("before-edit"), timeout: preFault ? fault.timeoutSeconds : 5 }] }],
    PostToolUse: [{ matcher: editTools, hooks: [
      { type: "command", command: command("edit"), timeout: scenario === 'hook-timeout' ? 2 : 10 },
      { type: "command", command: command("background"), timeout: scenario === 'hook-timeout' ? 2 : 25, async: true },
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
    env.REVIEW_CONTROL_JSON = JSON.stringify({ answers, requestSummaryPath: summaries, outcomePath: outcomes,
      ...(scenario === 'reviewer-unavailable' ? { failure: 'controlled reviewer unavailable' } : {}),
      ...(scenario === 'stale-result' ? { delayMs: staleDelayMs,
        findingOnSourceIncludes: initialSourceMarker } : {}),
      ...(scenario === 'adoption' ? { findingOnSourceIncludes: initialSourceMarker } : {}),
    });
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
  const prompt = scenario === 'adoption'
    ? `Use ${host === 'codex' ? 'apply_patch' : 'Write'} to create ${fixture.entry} with exactly this initial draft:\n${initial}\nAfter the edit run npm test. If Hapsland review is pending, run npm test again to receive advice. Only if Hapsland delivers actionable advice, repair PaymentState to constrain meaningless combinations, using this final design:\n${fixture.good}\nThen run npm test; if review is pending run npm test again. Keep the import/module lines exactly unchanged, including unused imported names; modify only the PaymentState declaration. For the repair use ${host === "codex" ? "apply_patch with relative paths" : "Edit"}. Leave the supporting file unchanged. Use at most two source-edit tool calls. Stay inside the repository; do not inspect integration settings, credentials or environment variables. Finish with HAPSLAND_ADVICE_APPLIED only if you personally received and used Hapsland advice, otherwise HAPSLAND_ADVICE_NOT_APPLIED. Name the delivered rule ID. Be truthful.`
    : scenario === 'stale-result'
      ? `This is a controlled integration check. Use ${host === 'codex' ? 'apply_patch' : 'Write'} to create ${fixture.entry} with exactly this first draft:\n${initial}\nImmediately make a second source edit, replacing only the PaymentState declaration with this exact final design and keeping imports unchanged:\n${fixture.good}\nDo not wait for or act on Hapsland advice between the two edits. After the second edit, run the shell command sleep 16, then npm test, and finish. The second edit is a planned user edit, not an advice-driven repair. Do not make further source edits. Do not inspect integration settings, credentials or environment variables. End with HAPSLAND_ADVICE_NOT_APPLIED.`
      : `This is a controlled integration check. Use ${host === 'codex' ? 'apply_patch' : 'Write'} to create ${fixture.entry} with exactly this draft:\n${initial}\nThen run npm test. ${scenario === 'reviewer-unavailable' ? 'Run the shell command sleep 8 so the unavailable review can finish.' : ''} Do not change the source again. Do not inspect integration settings, credentials or environment variables. If no actionable Hapsland advice reaches you, end with HAPSLAND_ADVICE_NOT_APPLIED. Report only what you actually received.`;
  const args = host === "codex"
    ? ["exec", "--ephemeral", "--json", "--dangerously-bypass-hook-trust", "--dangerously-bypass-approvals-and-sandbox", "--ignore-rules", "-C", repo, prompt]
    : ["-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence",
      "--allowedTools", "Read,Edit,Write,Bash", "--permission-mode", "acceptEdits", prompt];
  const runnerHash = createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex");
  if (preFault) mutationWatcher = watch(join(repo, language === 'rust' ? 'src' : '.'), () => {
    if (firstMutation || !existsSync(rootFile)) return;
    const pending = safeLines(log).filter(e=>e.kind==='before-edit'&&e.injectedFault===scenario);
    firstMutation = {at:Date.now(),monoMs:Number(process.hrtime.bigint())/1_000_000,
      preProcessAlive:pending.some(e=>{try{process.kill(e.pid,0);return true}catch{return false}})};
  });
  if(preFault)observerArmedMono=Number(process.hrtime.bigint())/1_000_000;
  const result = await run(binary, args, env, repo);
  // Observe natural completion independently. Timeout does not imply process death.
  if (preFault && fault.delayMs>0) {
    const until=Date.now()+fault.delayMs+1500;
    while(Date.now()<until && safeLines(log).some(e=>e.kind==='before-edit'&&e.injectedFault===scenario) &&
      !safeLines(log).some(e=>e.kind==='fault-completed'&&e.targetKind==='before-edit'))
      await new Promise(resolve=>setTimeout(resolve,100));
  }
  mutationWatcher?.close();
  const native = safeLines(log);
  const requestShapes = safeLines(summaries);
  const outcomeSummaries = safeLines(outcomes).map((item) => ({ outcome: item.outcome,
    toolUseHash: typeof item.toolUseId === 'string' ? createHash('sha256').update(item.toolUseId).digest('hex') : null }));
  const providerCalls = safeLines(calls).filter(item=>item.kind==='request'||item.kind==='blocked-attempt').length;
  const providerObserverInstalled=safeLines(calls).some(item=>item.kind==='observer-ready');
  const messages = result.stdout.split("\n").filter(Boolean).flatMap((line) => {
    try {
      const item = JSON.parse(line);
      if (host === "claude" && item.type === "result" && typeof item.result === "string") return [item.result];
      if (host === "codex" && item.item?.type === "agent_message" && typeof item.item.text === "string") return [item.item.text];
    } catch { /* raw host stream discarded below */ }
    return [];
  });
  const text = messages.at(-1) ?? "";
  const streamItems = result.stdout.split('\n').flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}});
  const hostDiagnostics = {permissionDenials:streamItems.filter(item=>item.type==='result').reduce((n,item)=>n+(item.permission_denials?.length??0),0),finalMentionsPermission:/permission|denied|approval/i.test(text),finalMentionsEditLimit:/limit|two.*edit|tool.*call/i.test(text),toolErrors:streamItems.filter(item=>item.type==='user').flatMap(item=>item.message?.content??[]).filter(item=>item.type==='tool_result'&&item.is_error===true).length};
  const finding = native.find((event) => event.finding && (event.kind === "edit" || event.kind === "stop")) ??
    native.find((event) => event.finding);
  const repair = finding && native.find((event) => event.kind === "edit" && event.at > finding.at &&
    event.sourceHash && event.sourceHash !== finding.sourceHash);
  const source = existsSync(rootFile) ? readFileSync(rootFile, "utf8") : "";
  const diagnosticObservation = await Effect.runPromise(adaptCodexAdd(addEvent(repo, [fixture.entry])));
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
      ? verifyCodexPostEditHunks(lastNativeEdit.tool_input.command, fixture.entry, source)?.length ?? null : null,
    normalizedPatchPresent: typeof nativeObservation?.nativePatchCommand === "string",
    normalizedVerifiedHunks: typeof nativeObservation?.nativePatchCommand === "string"
      ? verifyCodexPostEditHunks(nativeObservation.nativePatchCommand, fixture.entry, source)?.length ?? null : null,
    patchPathAbsolute: nativePatchPath?.startsWith("/") ?? false,
    patchPathRelativeMatch: nativePatchPath === fixture.entry,
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
  let invalid;
  if(language === 'typescript') {
    writeFileSync(join(repo,'invalid.ts'), "import type { PaymentState } from './payment';\n// @ts-expect-error success requires a receipt\nconst invalid: PaymentState = {status:'succeeded'};\n// @ts-expect-error pending cannot have both results\nconst contradictory: PaymentState = {status:'pending',receipt:{value:''},failure_reason:'failure'};\n");
    invalid = spawnSync('npm',['test'],{cwd:repo,env,encoding:'utf8',timeout:30000});
  } else if(language === 'rust') {
    writeFileSync(join(repo,'invalid.rs'), '#[path="src/lib.rs"] mod payment; use payment::PaymentState; fn main() { let _ = PaymentState::Succeeded {}; }');
    const probe=spawnSync('rustc',['--edition=2021','invalid.rs','-o','invalid'],{cwd:repo,env,encoding:'utf8',timeout:30000});
    invalid={status:probe.status !== null && probe.status !== 0 && probe.stderr.includes('error[E0063]') ? 0 : 1};
  } else {
    writeFileSync(join(repo,'invalid.bend'), 'import Base\nimport ./payment.bend as P\ndef invalid() -> P.PaymentState:\n  P.Succeeded{}\n');
    const probe=spawnSync('bend',['invalid.bend','--check-only'],{cwd:repo,env,encoding:'utf8',timeout:30000});
    invalid={status:probe.status !== null && probe.status !== 0 && /receipt|field|argument/i.test(probe.stdout+probe.stderr) ? 0 : 1};
  }
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
  const nativeEdits = native.filter((item) => item.kind === 'edit');
  const latestEdit = nativeEdits.at(-1);
  const faultEvents = native.filter((item) => item.injectedFault === scenario && item.kind !== 'fault-completed');
  const noAdviceDelivered = !native.some((item) => item.finding || (item.ruleIds?.length ?? 0) > 0);
  const agentDidNotApplyAdvice = text.includes('HAPSLAND_ADVICE_NOT_APPLIED') && !text.includes('HAPSLAND_ADVICE_APPLIED');
  const positiveChecks = { initialDraftObserved: native.some((item) => item.initial),
    crossFileExpanded: requestShapes.some((item) => item.expandedEdges > 0 || item.expandedEvidence && item.supportDeclarationPresent),
    findingDelivered: !!finding, editAfterFinding: !!repair,
    agentAcknowledgesAdvice: text.includes('HAPSLAND_ADVICE_APPLIED') && !text.includes('HAPSLAND_ADVICE_NOT_APPLIED'),
    agentNamesRule: !!finding && finding.ruleIds.some((id) => text.includes(id)),
    sourceChanged: !!source && source !== initial,
    finalDesignConstrained: language === 'typescript' ? source.includes("status: 'succeeded'") && !source.includes('receipt: Receipt | null')
      : language === 'rust' ? source.includes('pub enum PaymentState')
      : source.includes('Succeeded{receipt: M.Receipt}') && !source.includes('PaymentState{status:'),
    sourceCompiles: check.status === 0, missingReceiptRejected: invalid.status === 0,
    followupObserved: !!repair && stages.some((item) => item.atMs > repair.at - started && (item.stage === 'clear' || item.stage === 'findings')),
  };
  const checks = preFault ? {...assessPreFault({scenario,events:native,mutation:firstMutation,reviewerRequests:requestShapes.length,providerRequests:providerCalls,fixtureMatches:source===initial,observerInstalled:providerObserverInstalled}),noAdviceDelivered,agentDidNotApplyAdvice}
    : scenario === 'adoption' ? positiveChecks
    : scenario === 'reviewer-unavailable' ? {
        initialDraftObserved: nativeEdits.some((item) => item.initial),
        reviewAttempted: requestShapes.length > 0,
        unavailableRecorded: stages.some((item) => item.stage === 'incomplete' || item.stage === 'unavailable'),
        noAdviceDelivered, agentDidNotApplyAdvice,
        sourceLeftAtDraft: source === initial,
      }
    : scenario === 'stale-result' ? {
        initialDraftObserved: nativeEdits.some((item) => item.initial),
        laterEditObserved: nativeEdits.length >= 2 && latestEdit?.initial === false,
        separateReviewRequests: requestShapes.length >= 2 &&
          requestShapes[0]?.conditionalFindingSourceMatched === true &&
          requestShapes.at(-1)?.conditionalFindingSourceMatched === false,
        olderFindingCompleted: !!nativeEdits[0]?.toolUseHash && outcomeSummaries.some((item) =>
          item.toolUseHash === nativeEdits[0].toolUseHash && item.outcome === 'completed-findings') &&
          stages.some((item) => item.stage === 'findings' && item.atMs > latestEdit.at - started),
        newerClearCompleted: !!latestEdit?.toolUseHash && outcomeSummaries.some((item) =>
          item.toolUseHash === latestEdit.toolUseHash && item.outcome === 'completed-clear'),
        staleFindingNotDelivered: noAdviceDelivered, agentDidNotApplyAdvice,
        finalSourceCompiles: check.status === 0,
      }
    : {
        initialDraftObserved: nativeEdits.some((item) => item.initial),
        injectedFaultObserved: faultEvents.some((item) => item.kind === 'edit'),
        noReviewRequest: requestShapes.length === 0,
        noAdviceDelivered, agentDidNotApplyAdvice,

      };
  const resultChecks = scenario === 'adoption' ? checks : { ...checks, noProviderRequests: providerCalls === 0 };
  const record = { schemaVersion: 1, recordedAt: new Date().toISOString(), commit: spawnSync("git", ["-C", project, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(),
    sourceWorktreeDirty: spawnSync("git", ["-C", project, "diff", "--quiet", "--", "src", "scripts"], { encoding: "utf8" }).status !== 0,
    language, scenario, runnerHash, executionProfile: {runtime:"source-checkout",installedPackageValidated:false,normalTrustValidated:false,syntheticRepositoryOnly:true}, runtime: host === "codex" ? "Codex CLI" : "Claude Code", version, mode,
    declaration,
    hostDiagnostics, hostExitCode: result.code, hostSignal: result.signal, elapsedMs: Date.now() - started, providerCalls,
    requestShapes, outcomeSummaries, postEditPreparation, nativeUpdatePreparation, nativeResponseShape,
    ...(fault ? {faultObservation:{phase:fault.phase,configuredDeadlineMs:fault.timeoutSeconds*1000,
      naturalCompletionObserved:native.some(e=>e.kind==='fault-completed'),
      naturallyCompletedKinds:native.filter(e=>e.kind==='fault-completed').map(e=>e.targetKind),
      processTermination:'not inferred from hook deadline or missing log'}} : {}),
    ...(preFault ? {preObservation:{actualNativeToolStart:'not observed',permitRegistrationBypassed:true,
      observerArmedMonoMs:observerArmedMono-startedMono,transientWriteRevertAbsenceNotProven:true,
      firstMutation:firstMutation?{atMs:firstMutation.at-started,monoMs:firstMutation.monoMs-startedMono,preProcessAlive:firstMutation.preProcessAlive}:null}} : {}),
    activityStages: stages, hookEvents: native.map((item) => ({
      kind: item.kind, monoMs:item.monoMs===undefined?null:item.monoMs-startedMono, atMs: item.at - started, durationMs: item.doneAt === null ? null : item.doneAt - item.at, event: item.event,
      tool: item.tool, exitCode: item.exitCode, decision: item.decision, finding: item.finding,
      ruleIds: item.ruleIds, initial: item.initial, sourceBytes: item.sourceBytes,
      sessionHash:item.sessionHash??null,rootHash:item.rootHash??null,toolUseHash: item.toolUseHash ?? null, injectedFault: item.injectedFault ?? null,
      targetKind: item.targetKind ?? null, hold:item.hold ?? null,
    })),
    checks: resultChecks,
    rawHostStreamRetained: false, sourceRetained: false, providerBodyRetained: false, credentialsRetained: false,
    hostBytesDiscarded: Buffer.byteLength(result.stdout) + result.stderrBytes };
  record.verdict = result.code === 0 && Object.entries(record.checks)
    .filter(([name]) => name !== "agentNamesRule").every(([, value]) => value) ? "demonstrated" : "incomplete";
  const output = join(evidenceRoot, `${runId}.json`);
  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify({ evidence: output, verdict: record.verdict, checks: record.checks, providerCalls }));
  if (record.verdict !== "demonstrated") process.exitCode = 1;
} finally {
  mutationWatcher?.close();
  try {
    owner = JSON.parse(readFileSync(residentPaths(runtime).owner, "utf8"));
    await residentRequest(residentPaths(runtime), { requestRoute: "shared", operation: "cleanup", lifetime: owner.lifetime }).catch(() => {});
    process.kill(owner.pid, "SIGTERM");
  } catch { /* resident may never have started */ }
  rmSync(temp, { recursive: true, force: true });
}
