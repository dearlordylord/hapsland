import { instrumentCodexHooks } from "./native-codex-hook-observation.mjs"
import { callableInspectionProfile } from "./native-callable-inspection.mjs"
import { runCodexInspectionProfile } from "./native-codex-inspection.mjs"
import { cleanupOwnedResident } from "./test-harness/cleanup-owned-resident.mjs"
import {
  validateClaudeArchiveProfile,
  installNativeArchive,
  setupClaudeNativeArchive,
  instrumentClaudeRegistrations
} from "./native-claude-package.mjs"
import { NATIVE_AGENT_PROFILES, resolveNativeAgentProfile } from "./native-agent-profiles.mjs"
import { resolveBunRuntime } from "./pinned-bun.mjs"
import { runClient } from "@hapsland/build-tooling/test-support/client-runtime"
// Bounded real-host observation of TypeScript, Rust and Bend cross-file review.
// Raw host streams, source, provider bodies, and credentials stay in a disposable directory.
import { spawnSync } from "node:child_process"
import { executeNative } from "./native-process.mjs"
import { createHash } from "node:crypto"
import {
  symlinkSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  watch,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { residentRequestEffect as residentRequest } from "@hapsland/resident-transport/resident/client"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"
import * as Effect from "effect/Effect"
import { addEvent } from "@hapsland/build-tooling/test-support/test-fixtures"
import { adaptCodexDirectEvent, adaptClaudeDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import { prepareObservation } from "@hapsland/review-execution/direct-event/pipeline"
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "@hapsland/review-definition/runtime/review-config"
import { configuredRules, connectDefaultRuleFixture } from "@hapsland/build-tooling/test-support/default-rules"
import { TYPE_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { verifyCodexPostEditHunks } from "@hapsland/native-observation/direct-event/codex-patch-hunks"
import { COEXISTENCE_CASES, TASK_CANARY, setupAbideCoexistence } from "./native-abide-coexistence.mjs"

import { faultProfile, assessPreFault } from "./native-hook-faults.mjs"
import { runPiNativeProfile } from "./native-pi-profile.mjs"

const project = resolve(import.meta.dirname, "..")
const requestedModel = process.argv.find((argument) => argument.startsWith("--model="))?.slice(8)
const requestedProvider = process.argv.find((argument) => argument.startsWith("--provider="))?.slice(11)
if (requestedModel !== undefined && !/^[a-zA-Z0-9_.:/-]{1,120}$/.test(requestedModel))
  throw new Error("Invalid native model identifier")
const host = process.argv.find((arg) => arg.startsWith("--host="))?.slice(7)
if (requestedProvider !== undefined && requestedProvider !== (host === "claude" ? "anthropic" : "openai"))
  throw new Error("Native provider must match the selected host profile")
if (host === "pi" && requestedModel !== undefined && requestedModel !== "gpt-6-luna")
  throw new Error("Pi native checks require the existing gpt-6-luna profile")
const language = process.argv.find((arg) => arg.startsWith("--language="))?.slice(11) ?? "typescript"
if (!["typescript", "rust", "bend", "python"].includes(language)) throw new Error("Choose a supported source language")
const scenario = process.argv.find((arg) => arg.startsWith("--scenario="))?.slice(11) ?? "adoption"
if (
  ![
    "adoption",
    "reviewer-unavailable",
    "hook-crash",
    "hook-timeout",
    "stale-result",
    "pre-delay",
    "pre-timeout",
    "pre-crash",
    "unsupported-write",
    "unicode-edit",
    "inspection-exclusions",
    "callable-review"
  ].includes(scenario)
)
  throw new Error("Choose an adoption, reviewer, POST-hook or PRE-hook scenario")
resolveNativeAgentProfile({
  host,
  provider: requestedProvider ?? NATIVE_AGENT_PROFILES[host]?.provider,
  model: requestedModel ?? NATIVE_AGENT_PROFILES[host]?.model ?? "default",
  scenario
})
const unicodeUpdate = process.argv.includes("--unicode-update")
if (unicodeUpdate && (language !== "typescript" || scenario !== "adoption"))
  throw new Error("--unicode-update requires TypeScript adoption")
const unicodePrefix = "// 注文を処理する\n"
const unicodeSuffix = "// 結果を保存する 😀\n"
const fault = faultProfile(scenario)
const preFault = fault?.phase === "pre"
const suppliedStaleDelay = process.argv.find((arg) => arg.startsWith("--controlled-delay-ms="))?.slice(22)
if (suppliedStaleDelay !== undefined && scenario !== "stale-result")
  throw new Error("Controlled delay override requires stale-result")
const staleDelayMs = suppliedStaleDelay === undefined ? 9000 : Number(suppliedStaleDelay)
if (!Number.isInteger(staleDelayMs) || staleDelayMs < 1000 || staleDelayMs > 14000)
  throw new Error("Controlled stale delay must be 1000–14000 ms")
const pythonCrossfile = process.argv.includes("--python-crossfile")
if (pythonCrossfile && (language !== "python" || scenario !== "adoption" || host !== "codex"))
  throw new Error("--python-crossfile requires Codex Python adoption")
const pythonSupport =
  "from dataclasses import dataclass\nfrom typing import TypeAlias\n@dataclass\nclass Receipt:\n    value: str\n@dataclass\nclass Pending:\n    pass\n@dataclass\nclass Succeeded:\n    receipt: Receipt\n@dataclass\nclass Failed:\n    failure_reason: str\n"
const fixtures = {
  python: {
    entry: "payment.py",
    support: "support.txt",
    supportSource: "Same-file Python model evidence; no imported user declarations.\n",
    initial:
      pythonSupport +
      "@dataclass\nclass PaymentState:\n    status: str\n    receipt: Receipt | None\n    failure_reason: str | None\n",
    good: pythonSupport + "PaymentState: TypeAlias = Pending | Succeeded | Failed\n"
  },
  typescript: {
    entry: "payment.ts",
    support: "support.ts",
    supportSource:
      'export type PaymentStatus = "pending" | "succeeded" | "failed";\nexport interface Receipt { value: string }\n',
    initial:
      "import type { PaymentStatus, Receipt } from './support';\nexport interface PaymentState { status: PaymentStatus; receipt: Receipt | null; failure_reason: string | null }\n",
    good: "import type { PaymentStatus, Receipt } from './support';\nexport type PaymentState = { status: 'pending' } | { status: 'succeeded'; receipt: Receipt } | { status: 'failed'; failure_reason: string };\n"
  },
  rust: {
    entry: "src/lib.rs",
    support: "src/support.rs",
    supportSource: "pub enum PaymentStatus { Pending, Succeeded, Failed }\npub struct Receipt { pub value: String }\n",
    initial:
      "mod support; use self::support::PaymentStatus; use self::support::Receipt;\npub struct PaymentState { pub status: PaymentStatus, pub receipt: Option<Receipt>, pub failure_reason: Option<String> }\n",
    good: "mod support; use self::support::PaymentStatus; use self::support::Receipt;\npub enum PaymentState { Pending, Succeeded { receipt: Receipt }, Failed { failure_reason: String } }\n"
  },
  bend: {
    entry: "payment.bend",
    support: "support.bend",
    supportSource:
      "import Base\ntype PaymentStatus is Data:\n  Pending{}\n  Succeeded{}\n  Failed{}\ntype Receipt is Data:\n  Receipt{value: String}\ntype OptionalReceipt is Data:\n  Absent{}\n  Present{value: Receipt}\ntype OptionalString is Data:\n  AbsentText{}\n  PresentText{value: String}\n",
    initial:
      "import Base\nimport ./support.bend as M\ntype PaymentState is Data:\n  PaymentState{status: M.PaymentStatus, receipt: M.OptionalReceipt, failure_reason: M.OptionalString}\n",
    good: "import Base\nimport ./support.bend as M\ntype PaymentState is Data:\n  Pending{}\n  Succeeded{receipt: M.Receipt}\n  Failed{failure_reason: String}\n"
  }
}
const pythonCrossfileImports =
  "from dataclasses import dataclass\nfrom typing import TypeAlias\nfrom domain import Receipt, Pending, Succeeded, Failed, PaymentBase\n"
const baseFixture = pythonCrossfile
  ? {
      entry: "payment.py",
      support: "domain/__init__.py",
      supportSource: "from .models import Receipt, Pending, Succeeded, Failed, PaymentBase\n",
      extraFiles: { "domain/models.py": pythonSupport + "class PaymentBase:\n    order_id: str\n" },
      initial:
        pythonCrossfileImports +
        "@dataclass\nclass PaymentState(PaymentBase):\n    status: str\n    receipt: Receipt | None\n    failure_reason: str | None\n",
      good: pythonCrossfileImports + "PaymentState: TypeAlias = Pending | Succeeded | Failed\n"
    }
  : fixtures[language]
const fixture = unicodeUpdate
  ? {
      ...baseFixture,
      initial: unicodePrefix + baseFixture.initial + unicodeSuffix,
      good: unicodePrefix + baseFixture.good + unicodeSuffix
    }
  : baseFixture
const coexistence = process.argv.find((arg) => arg.startsWith("--coexistence="))?.slice(14)
const abidePrefix = process.argv.find((arg) => arg.startsWith("--abide-prefix="))?.slice(15)
const hookOrder = process.argv.find((arg) => arg.startsWith("--hook-order="))?.slice(13) ?? "hapsland-first"
const claudeFeedback =
  process.argv.find((arg) => arg.startsWith("--claude-feedback="))?.slice(18) ?? "block-current-findings"
if (!["advisory", "block-current-findings"].includes(claudeFeedback)) throw new Error("Unknown Claude feedback mode")
if (
  coexistence !== undefined &&
  (!COEXISTENCE_CASES.includes(coexistence) || !abidePrefix || language !== "typescript" || scenario !== "adoption")
)
  throw new Error("Coexistence requires a named case, --abide-prefix, TypeScript, and adoption")
if (!["hapsland-first", "abide-first"].includes(hookOrder)) throw new Error("Unknown hook order")
const initialSourceMarker =
  language === "typescript"
    ? "interface PaymentState"
    : language === "rust"
      ? "struct PaymentState"
      : language === "python"
        ? "class PaymentState"
        : "PaymentState{status:"
const feedbackMessages = Object.fromEntries(configuredRules.map((rule) => [rule.id, rule.message]))
const mode = process.argv.includes("--live") ? "live-jev" : "controlled-offline"
const archiveArgument = process.argv.find((argument) => argument.startsWith("--archive="))
if (scenario === "inspection-exclusions" || scenario === "callable-review") {
  if (
    host !== "codex" ||
    language !== "typescript" ||
    mode !== "controlled-offline" ||
    coexistence !== undefined ||
    unicodeUpdate
  )
    throw new Error("Codex inspection requires controlled TypeScript without coexistence or Unicode mutation")
  await runCodexInspectionProfile({
    project,
    archivePath: archiveArgument?.slice("--archive=".length),
    profile: scenario === "callable-review" ? callableInspectionProfile : undefined,
    model: requestedModel
  })
  process.exit(0)
}
if (archiveArgument !== undefined && (!["pi", "claude", "codex"].includes(host) || archiveArgument === "--archive="))
  throw new Error("--archive=PATH requires a local production tarball and a supported native profile")
if (
  host === "codex" &&
  archiveArgument &&
  (language !== "python" || scenario !== "adoption" || mode !== "controlled-offline" || coexistence || unicodeUpdate)
)
  throw new Error("Codex archive adoption requires controlled Python models without coexistence or Unicode mutation")
if (host === "claude")
  validateClaudeArchiveProfile({
    host,
    language,
    scenario,
    mode,
    coexistence,
    unicodeUpdate,
    archivePath: archiveArgument?.slice("--archive=".length)
  })
if (host === "pi") {
  await runPiNativeProfile({
    project,
    fixture,
    language,
    scenario,
    mode,
    messages: feedbackMessages,
    runnerPath: new URL(import.meta.url),
    archivePath: archiveArgument?.slice("--archive=".length)
  })
  process.exit(process.exitCode ?? 0)
}
if (host !== "codex" && host !== "claude") throw new Error("Choose --host=codex, --host=claude or --host=pi")
if (["unsupported-write", "unicode-edit"].includes(scenario)) throw new Error("This native scenario is Pi-specific")
if (mode === "live-jev" && !process.argv.includes("--execute-paid")) throw new Error("Live Jev requires --execute-paid")
if (mode === "live-jev" && coexistence && coexistence !== "both")
  throw new Error("Live coexistence is bounded to the both-reviewers case")
if (scenario !== "adoption" && mode === "live-jev")
  throw new Error("Fault scenarios use the controlled offline reviewer")
const codexBinary = process.env.HAPSLAND_TEST_CODEX ?? "/tmp/hapsland-codex-01551/node_modules/.bin/codex"
const claudeBinary = process.env.HAPSLAND_TEST_CLAUDE ?? "/home/node/.local/share/claude/versions/2.1.218"
const binary = host === "codex" ? codexBinary : claudeBinary
const version = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 10_000 }).stdout?.trim()
if (version !== NATIVE_AGENT_PROFILES[host].version)
  throw new Error(`Unsupported native test profile: ${version ?? "unavailable"}`)

const temp = mkdtempSync(join(tmpdir(), "hapsland-crossfile-native-"))
const repo = join(temp, "repo"),
  runtime = join(temp, "resident"),
  activity = join(temp, "activity")
const log = join(temp, "hooks.jsonl"),
  summaries = join(temp, "requests.jsonl"),
  calls = join(temp, "calls.jsonl")
const outcomes = join(temp, "outcomes.jsonl")
const nativeEvents = join(temp, "native-edits.jsonl")
const rootFile = join(repo, fixture.entry),
  supportFile = join(repo, fixture.support)
const started = Date.now()
const startedMono = Number(process.hrtime.bigint()) / 1_000_000
let firstMutation
let mutationWatcher
let observerArmedMono
const runId = `${host}-${language}-${coexistence ? `coexistence-${coexistence}-${hookOrder}` : scenario}${unicodeUpdate ? "-unicode-update" : ""}-${mode}-${started}`
const evidenceRoot = coexistence
  ? resolve(project, "../hapsland-research/evidence/native-coexistence")
  : join(project, "evidence", scenario === "adoption" ? "native-languages" : "native-negative")
const declaration = {
  scenario,
  maximumProviderRequests: mode === "live-jev" ? 6 : 0,
  automaticHostRetries: 0,
  hostCeilingMs: 240000,
  syntheticRepositoryOnly: true,
  maximumSourceEditCalls: scenario === "stale-result" || scenario === "adoption" ? 2 : 1,
  sourceProfile: "bounded local cross-file types",
  runtimeVersion: version,
  runtimeSurface: archiveArgument ? "installed-artifact" : "source-checkout",
  ...(coexistence
    ? {
        coexistence,
        hookOrder,
        abideVersion: "0.0.7",
        maximumAbideLocalRequests: mode === "controlled-offline" ? 8 : 0,
        hapslandFileExcluded: coexistence === "privacy",
        normalTrustValidated: false,
        ...(host === "claude" ? { claudeFeedbackMode: claudeFeedback } : {}),
        precompiledHandAuthoredRubric: true,
        sourceCheckoutHapsland: true
      }
    : {}),
  ...(unicodeUpdate
    ? {
        firstOperation: "update",
        unchangedUnicodeComments: true,
        asciiReplacement: { before: "failure_reason: number | null", after: "failure_reason: string | null" }
      }
    : {}),
  ...(preFault
    ? {
        hookPhase: "PRE",
        injectedDelayMs: fault.delayMs,
        nativePreHookDeadlineMs: fault.timeoutSeconds * 1000,
        permitRegistrationBypassed: true,
        productionPreAdmissionConformance: false,
        maximumReviewerRequests: 0,
        actualNativeToolStartObservable: false,
        holdSampleIntervalMs: 50,
        onePersistentFixtureCreation: true,
        mutationLandmark: "filesystem observer proxy"
      }
    : {}),
  ...(scenario === "hook-timeout" ? { nativeEditHookDeadlineMs: 2000, injectedHookSleepMs: 10000 } : {}),
  ...(scenario === "stale-result"
    ? { controlledReviewDelayMs: staleDelayMs, oldResult: "finding", newResult: "clear" }
    : {})
}
mkdirSync(evidenceRoot, { recursive: true })
writeFileSync(
  join(evidenceRoot, `${runId}-declaration.json`),
  JSON.stringify(
    { schemaVersion: 1, declaredAt: new Date().toISOString(), host, language, mode, scenario, declaration },
    null,
    2
  ) + "\n",
  { flag: "wx" }
)
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`
const lines = (path) =>
  readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
const safeLines = (path) => {
  try {
    return lines(path)
  } catch {
    return []
  }
}
const run = (command, args, env, cwd, timeout = 240000) => executeNative(command, args, { env, cwd, timeout })
const initial = fixture.initial
const answers = Object.fromEntries(
  [
    "meaningless_combinations",
    "split_correlations",
    "absence_confusion",
    "bare_domain_value",
    "name_wider_than_type",
    "name_claims_resource",
    "body_reaches_undeclared"
  ].map((id) => [id, { _tag: "Probability", probability: 0 }])
)
const hookScript = join(temp, "hook.mjs")
const observer = join(temp, "observe-fetch.mjs")
let owner
let abide
let installedClaude
let installedCodex
let installedClaudeSetup
const installedCommandsPath = join(temp, "installed-claude-commands.json")
const installedClaudeHome = join(temp, "claude-home")
try {
  mkdirSync(repo)
  const init = spawnSync("git", ["init", "--quiet", "--initial-branch=master", repo])
  if (init.status !== 0) throw new Error("Disposable Git setup failed")
  mkdirSync(join(repo, "src"), { recursive: true })
  mkdirSync(dirname(supportFile), { recursive: true })
  writeFileSync(supportFile, fixture.supportSource)
  for (const [path, source] of Object.entries(fixture.extraFiles ?? {})) {
    const target = join(repo, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, source)
  }
  if (unicodeUpdate)
    writeFileSync(rootFile, initial.replace("failure_reason: string | null", "failure_reason: number | null"))
  if (language === "rust")
    writeFileSync(join(repo, "Cargo.toml"), '[package]\nname="synthetic_payment"\nversion="0.1.0"\nedition="2021"\n')
  writeFileSync(
    join(repo, "README.md"),
    "# Order count\nA payment is pending, succeeded with a receipt, or failed with a failure reason. Pending has neither result; success and failure are mutually exclusive.\n"
  )
  writeFileSync(
    join(repo, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        types: [],
        skipLibCheck: true
      },
      include: ["*.ts"]
    })
  )
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify({
      private: true,
      scripts: {
        test:
          language === "typescript"
            ? `${quote(process.execPath)} ${quote(join(project, "node_modules/typescript/bin/tsc"))} -p tsconfig.json`
            : language === "rust"
              ? "rustc --edition=2021 --crate-type=lib src/lib.rs -o fixture.rlib"
              : language === "python"
                ? "python3 -m py_compile payment.py"
                : "bend payment.bend --check-only"
      }
    })
  )
  spawnSync("git", ["-C", repo, "add", "README.md", "support.ts", "tsconfig.json", "package.json"])

  if (host === "claude" && archiveArgument)
    installedClaude = await installNativeArchive({
      project,
      archivePath: archiveArgument.slice("--archive=".length),
      installation: join(temp, "installed-package")
    })

  if (host === "codex" && archiveArgument)
    installedCodex = await installNativeArchive({
      project,
      archivePath: archiveArgument.slice("--archive=".length),
      installation: join(temp, "installed-package")
    })

  writeFileSync(
    hookScript,
    `import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { observeHold } from ${JSON.stringify(new URL("./native-hook-faults.mjs", import.meta.url).href)};
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
${
  installedClaude
    ? `const registeredCommands=JSON.parse(readFileSync(${JSON.stringify(installedCommandsPath)},'utf8'));
if(typeof registeredCommands[kind]!=='string')throw new Error('Unaccounted installed Claude hook kind');
const result=spawnSync('/bin/sh',['-c',registeredCommands[kind]+' --controlled-reviewer'],`
    : installedCodex
      ? `const result=spawnSync(${JSON.stringify(installedCodex.hook)},flags,`
      : `const result=spawnSync(${JSON.stringify(resolveBunRuntime().executable)},[${JSON.stringify(join(project, "packages/hook-entry/src/hook-main.ts"))},...flags],`
}
  {input,encoding:'utf8',env:process.env,timeout:30000,maxBuffer:1048576});
let output; try { output=JSON.parse(result.stdout) } catch {}
const message=output?.reason??output?.hookSpecificOutput?.additionalContext??output?.systemMessage??'';
const {findingRuleIds}=await import(${JSON.stringify(join(project, "scripts/native-rule-observation.mjs"))});
const ruleIds=findingRuleIds(message,${JSON.stringify(feedbackMessages)});
const source=${JSON.stringify(rootFile)};
const value=existsSync(source)?readFileSync(source,'utf8'):'';
if(kind==='edit' && native)appendFileSync(process.env.HAPSLAND_NATIVE_EDITS,JSON.stringify(native)+'\\n',{mode:0o600});
appendFileSync(process.env.HAPSLAND_NATIVE_LOG,JSON.stringify({kind,at,...identity,monoMs:entryMono,doneAt:Date.now(),
  event:native?.hook_event_name??null,tool:native?.tool_name??null,exitCode:result.status,
  toolUseHash:native?.tool_use_id?createHash('sha256').update(native.tool_use_id).digest('hex'):null,
  decision:output?.decision??null, finding:ruleIds.length>0, ruleIds,
  sourceHash:value?createHash('sha256').update(value).digest('hex'):null,
  initial:value===${JSON.stringify(initial)}, sourceBytes:Buffer.byteLength(value),
  ...( ${JSON.stringify(unicodeUpdate)} ? {unicodeCommentsPreserved:value.startsWith(${JSON.stringify(unicodePrefix)})&&value.endsWith(${JSON.stringify(unicodeSuffix)})} : {})})+'\\n',{mode:0o600});
if(result.status===0)process.stdout.write(result.stdout??'');
process.exitCode=result.status??1;
`,
    { mode: 0o600 }
  )

  if (spawnSync(process.execPath, ["--check", hookScript], { encoding: "utf8" }).status !== 0)
    throw new Error("Generated native hook failed syntax validation before host execution")

  writeFileSync(
    observer,
    `import {appendFileSync,readFileSync} from 'node:fs';
const original=globalThis.fetch;
appendFileSync(process.env.HAPSLAND_NATIVE_CALLS,JSON.stringify({at:Date.now(),kind:'observer-ready'})+'\\n',{mode:0o600});
globalThis.fetch=async (...args)=>{
  const url=String(args[0]?.url??args[0]);
  if(!url.includes('/v1/systemone'))return original(...args);
  if(url.startsWith('http://127.0.0.1:'))return original(...args);
  const path=process.env.HAPSLAND_NATIVE_CALLS;
  let count=0;try{count=readFileSync(path,'utf8').trim().split('\\n').filter(Boolean).map(line=>JSON.parse(line)).filter(item=>item.kind==='request'||item.kind==='blocked-attempt').length}catch{}
  if(count>=${mode === "live-jev" ? 6 : 0}){
    appendFileSync(path,JSON.stringify({at:Date.now(),kind:'blocked-attempt'})+'\\n',{mode:0o600});
    throw new Error('native milestone provider ceiling reached');
  }
  const body=String(args[1]?.body??args[0]?.body??'');
  const reviewer=body.includes('payment-state-combinations')?'abide':'hapsland';
  appendFileSync(path,JSON.stringify({at:Date.now(),kind:'request',reviewer})+'\\n',{mode:0o600});
  if(reviewer==='abide'&&process.env.HAPSLAND_ABIDE_SUMMARIES){
    let parsed;try{parsed=JSON.parse(body)}catch{}
    appendFileSync(process.env.HAPSLAND_ABIDE_SUMMARIES,JSON.stringify({at:Date.now(),localEndpoint:false,
      requestBytes:Buffer.byteLength(body),stateKeys:Object.keys(parsed?.state??{}).sort(),
      questionIds:Object.keys(parsed?.questions??{}),taskCanaryPresent:body.includes(${JSON.stringify(TASK_CANARY)}),
      sourcePresent:body.includes('PaymentState')})+'\\n',{mode:0o600});
  }
  appendFileSync(process.env.HAPSLAND_NATIVE_SUMMARIES,JSON.stringify({provider:true,
    reviewer,taskCanaryPresent:body.includes(${JSON.stringify(TASK_CANARY)}),
    expandedEvidence:body.includes('expanded'),supportDeclarationPresent:body.includes(${JSON.stringify(language === "typescript" ? "export interface Receipt" : language === "rust" ? "pub struct Receipt" : "type Receipt is Data:")}),
    bytes:Buffer.byteLength(body)})+'\\n',{mode:0o600});
  return original(...args);
};
`,
    { mode: 0o600 }
  )

  const command = (kind) =>
    `${kind === "before-edit" ? "exec " : ""}${quote(process.execPath)} ${quote(hookScript)} ${kind}`
  const editTools = host === "codex" ? "apply_patch" : "Edit|Write"
  const settings = {
    hooks: {
      PreToolUse: [
        {
          matcher: editTools,
          hooks: [{ type: "command", command: command("before-edit"), timeout: preFault ? fault.timeoutSeconds : 5 }]
        }
      ],
      PostToolUse: [
        {
          matcher: editTools,
          hooks: [
            { type: "command", command: command("edit"), timeout: scenario === "hook-timeout" ? 2 : 10 },
            {
              type: "command",
              command: command("background"),
              timeout: scenario === "hook-timeout" ? 2 : 25,
              async: true
            }
          ]
        }
      ],
      Stop: [{ hooks: [{ type: "command", command: command("stop"), timeout: 5 }] }],
      UserPromptSubmit: [{ hooks: [{ type: "command", command: command("prompt"), timeout: 4 }] }]
    }
  }
  const config = join(temp, "user-config.jsonc")
  writeFileSync(
    config,
    JSON.stringify({
      version: 1,
      claudeFeedbackMode: claudeFeedback,
      ...(coexistence === "privacy" ? { excludes: ["payment.ts"] } : {})
    })
  )
  connectDefaultRuleFixture(repo, config)
  const home = coexistence ? join(temp, "profile", ".codex") : join(temp, "codex-home")
  let codexSubmissionObservations
  if (host === "codex") {
    if (pythonCrossfile)
      codexSubmissionObservations = instrumentCodexHooks({
        settings,
        temporary: temp,
        repository: repo,
        finding: feedbackMessages.meaningless_combinations,
        entry: fixture.entry,
        sourceMarker: initialSourceMarker
      })
    mkdirSync(home, { mode: 0o700, recursive: true })
    symlinkSync(join(process.env.CODEX_HOME ?? "/home/node/.codex", "auth.json"), join(home, "auth.json"))
    writeFileSync(join(home, "config.toml"), "[features]\nhooks = true\n")
    writeFileSync(join(home, "hooks.json"), JSON.stringify(settings))
  } else if (!installedClaude) {
    mkdirSync(join(repo, ".claude"))
    writeFileSync(join(repo, ".claude", "settings.json"), JSON.stringify(settings))
  }
  const env = {
    ...process.env,
    REVIEW_RESIDENT_DIR: runtime,
    REVIEW_ACTIVITY_PATH: activity,
    REVIEW_USER_CONFIG_PATH: config,
    ...(installedClaude || installedCodex
      ? {
          HOME: join(temp, "installed-home"),
          REVIEW_STATE_PATH: join(temp, "setup-state"),
          REVIEW_CREDENTIAL_STATE_PATH: join(temp, "credential-state.json"),
          HAPSLAND_ACTIVE_DISPATCH: "1"
        }
      : {}),
    HAPSLAND_NATIVE_LOG: log,
    HAPSLAND_NATIVE_SUMMARIES: summaries,
    HAPSLAND_NATIVE_CALLS: calls,
    HAPSLAND_NATIVE_EDITS: nativeEvents,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${observer}`.trim(),
    ...(coexistence ? { HAPSLAND_ABIDE_SUMMARIES: join(temp, "abide-requests.jsonl") } : {}),
    ...(host === "codex" ? { CODEX_HOME: home } : {})
  }
  if (mode === "controlled-offline") {
    delete env.TYPESAFE_API_KEY
    env.REVIEW_CONTROL_JSON = JSON.stringify({
      answers,
      requestSummaryPath: summaries,
      outcomePath: outcomes,
      ...(scenario === "reviewer-unavailable" || coexistence === "hapsland-unavailable"
        ? { failure: "controlled reviewer unavailable" }
        : {}),
      ...(scenario === "stale-result" ? { delayMs: staleDelayMs, findingOnSourceIncludes: initialSourceMarker } : {}),
      ...(scenario === "adoption" && coexistence !== "privacy" ? { findingOnSourceIncludes: initialSourceMarker } : {})
    })
  } else {
    delete env.REVIEW_CONTROL_JSON
    if (!env.TYPESAFE_API_KEY) {
      const text = readFileSync(join(project, ".env"), "utf8")
      const raw = text.match(/^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/m)?.[1]
      env.TYPESAFE_API_KEY = raw?.replace(/^(['"])(.*)\1$/, "$2")
    }
    if (!env.TYPESAFE_API_KEY) throw new Error("Jev credential unavailable")
  }
  if (installedClaude) {
    installedClaudeSetup = await setupClaudeNativeArchive({
      installed: installedClaude,
      repository: repo,
      claudeHome: installedClaudeHome,
      binary,
      env
    })
    writeFileSync(installedCommandsPath, JSON.stringify(installedClaudeSetup.commands), { mode: 0o600 })
    const instrumented = instrumentClaudeRegistrations(
      installedClaudeSetup.settings,
      installedClaudeSetup.commands,
      command
    )
    writeFileSync(installedClaudeSetup.settingsPath, JSON.stringify(instrumented), { mode: 0o600 })
  }
  delete env.OPENAI_API_KEY
  if (coexistence)
    abide = await setupAbideCoexistence({
      prefix: abidePrefix,
      testCase: coexistence,
      order: hookOrder,
      mode,
      host,
      temp,
      repo,
      home,
      settingsPath: host === "codex" ? join(home, "hooks.json") : join(repo, ".claude", "settings.json"),
      initial,
      good: fixture.good,
      rootFile,
      runtime,
      activity,
      env
    })
  const prompt = coexistence
    ? `${TASK_CANARY}. Use ${host === "codex" ? "apply_patch" : "Write"} to create payment.ts with exactly this initial draft:\n${initial}\nRun npm test. Only if you actually receive actionable advice from Hapsland or Abide, repair PaymentState using exactly this final design:\n${fixture.good}\nKeep imports and support.ts unchanged; modify only the PaymentState declaration. ${host === "claude" ? "For repair use Edit with old_string containing only the interface declaration line, and new_string containing only the type declaration line. Do not include the import in either Edit string." : "For repair use apply_patch with a relative path and change only the declaration."} Use at most two source-edit calls. Run npm test after repair and again if review is pending. Stay in the repository and do not inspect integration settings, credentials, or environment variables. At the end report HAPSLAND_ADVICE_APPLIED only if you personally received and acted on Hapsland advice, otherwise HAPSLAND_ADVICE_NOT_APPLIED. Separately report ABIDE_ADVICE_APPLIED only if you personally received and acted on Abide advice, otherwise ABIDE_ADVICE_NOT_APPLIED. Quote one actual Hapsland finding sentence you received. Do not repair merely because this prompt supplies the final design.`
    : scenario === "adoption"
      ? `${unicodeUpdate ? `Use ${host === "codex" ? "apply_patch with a relative path" : "Edit"} to update the existing ${fixture.entry}: replace only failure_reason: number | null with failure_reason: string | null. Keep both Unicode comments and every other line unchanged.` : `Use ${host === "codex" ? "apply_patch" : "Write"} to create ${fixture.entry} with exactly this initial draft:\n${initial}`}\nAfter the edit run npm test. If Hapsland review is pending, run npm test again to receive advice. Only if Hapsland delivers actionable advice, repair PaymentState to constrain meaningless combinations, using this final design:\n${fixture.good}\nThen run npm test; if review is pending run npm test again. Keep the import/module lines exactly unchanged, including unused imported names; modify only the PaymentState declaration. For the repair use ${host === "codex" ? "apply_patch with relative paths" : "Edit"}. Leave the supporting file unchanged. Use at most two source-edit tool calls. Stay inside the repository; do not inspect integration settings, credentials or environment variables. Finish with HAPSLAND_ADVICE_APPLIED only if you personally received and used Hapsland advice, otherwise HAPSLAND_ADVICE_NOT_APPLIED. Quote one actual delivered finding sentence. Be truthful.`
      : scenario === "stale-result"
        ? `This is a controlled integration check. Use ${host === "codex" ? "apply_patch" : "Write"} to create ${fixture.entry} with exactly this first draft:\n${initial}\nImmediately make a second source edit, replacing only the PaymentState declaration with this exact final design and keeping imports unchanged:\n${fixture.good}\nDo not wait for or act on Hapsland advice between the two edits. After the second edit, run the shell command sleep 16, then npm test, and finish. The second edit is a planned user edit, not an advice-driven repair. Do not make further source edits. Do not inspect integration settings, credentials or environment variables. End with HAPSLAND_ADVICE_NOT_APPLIED.`
        : `This is a controlled integration check. Use ${host === "codex" ? "apply_patch" : "Write"} to create ${fixture.entry} with exactly this draft:\n${initial}\nThen run npm test. ${scenario === "reviewer-unavailable" ? "Run the shell command sleep 8 so the unavailable review can finish." : ""} Do not change the source again. Do not inspect integration settings, credentials or environment variables. If no actionable Hapsland advice reaches you, end with HAPSLAND_ADVICE_NOT_APPLIED. Report only what you actually received.`
  const args =
    host === "codex"
      ? [
          "exec",
          ...(requestedModel ? ["--model", requestedModel] : []),
          "--ephemeral",
          "--json",
          "--dangerously-bypass-hook-trust",
          "--dangerously-bypass-approvals-and-sandbox",
          "--ignore-rules",
          "-C",
          repo,
          prompt
        ]
      : [
          "-p",
          ...(requestedModel ? ["--model", requestedModel] : []),
          "--output-format",
          "stream-json",
          "--verbose",
          "--no-session-persistence",
          "--allowedTools",
          "Read,Edit,Write,Bash",
          "--permission-mode",
          "acceptEdits",
          ...(installedClaudeSetup
            ? ["--settings", installedClaudeSetup.settingsPath, "--setting-sources", "project,local"]
            : coexistence
              ? ["--setting-sources", "project,local"]
              : []),
          prompt
        ]
  const runnerHash = createHash("sha256")
    .update(readFileSync(new URL(import.meta.url)))
    .digest("hex")
  if (preFault)
    mutationWatcher = watch(join(repo, language === "rust" ? "src" : "."), () => {
      if (firstMutation || !existsSync(rootFile)) return
      const pending = safeLines(log).filter((e) => e.kind === "before-edit" && e.injectedFault === scenario)
      firstMutation = {
        at: Date.now(),
        monoMs: Number(process.hrtime.bigint()) / 1_000_000,
        preProcessAlive: pending.some((e) => {
          try {
            process.kill(e.pid, 0)
            return true
          } catch {
            return false
          }
        })
      }
    })
  if (preFault) observerArmedMono = Number(process.hrtime.bigint()) / 1_000_000
  const result = await run(binary, args, env, repo)
  // Observe natural completion independently. Timeout does not imply process death.
  if (preFault && fault.delayMs > 0) {
    const until = Date.now() + fault.delayMs + 1500
    while (
      Date.now() < until &&
      safeLines(log).some((e) => e.kind === "before-edit" && e.injectedFault === scenario) &&
      !safeLines(log).some((e) => e.kind === "fault-completed" && e.targetKind === "before-edit")
    )
      await new Promise((resolve) => setTimeout(resolve, 100))
  }
  mutationWatcher?.close()
  const native = safeLines(log)
  const requestShapes = safeLines(summaries)
  const outcomeSummaries = safeLines(outcomes).map((item) => ({
    outcome: item.outcome,
    toolUseHash: typeof item.toolUseId === "string" ? createHash("sha256").update(item.toolUseId).digest("hex") : null
  }))
  const providerCalls = safeLines(calls).filter(
    (item) => item.kind === "request" || item.kind === "blocked-attempt"
  ).length
  const providerObserverInstalled = safeLines(calls).some((item) => item.kind === "observer-ready")
  const messages = result.stdout
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const item = JSON.parse(line)
        if (host === "claude" && item.type === "result" && typeof item.result === "string") return [item.result]
        if (host === "codex" && item.item?.type === "agent_message" && typeof item.item.text === "string")
          return [item.item.text]
      } catch {
        /* raw host stream discarded below */
      }
      return []
    })
  const text = messages.at(-1) ?? ""
  const streamItems = result.stdout.split("\n").flatMap((line) => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  })
  const hostDiagnostics = {
    permissionDenials: streamItems
      .filter((item) => item.type === "result")
      .reduce((n, item) => n + (item.permission_denials?.length ?? 0), 0),
    finalMentionsPermission: /permission|denied|approval/i.test(text),
    finalMentionsEditLimit: /limit|two.*edit|tool.*call/i.test(text),
    toolErrors: streamItems
      .filter((item) => item.type === "user")
      .flatMap((item) => item.message?.content ?? [])
      .filter((item) => item.type === "tool_result" && item.is_error === true).length
  }
  const finding =
    native.find((event) => event.finding && (event.kind === "edit" || event.kind === "stop")) ??
    native.find((event) => event.finding)
  const repair =
    finding &&
    native.find(
      (event) =>
        event.kind === "edit" && event.at > finding.at && event.sourceHash && event.sourceHash !== finding.sourceHash
    )
  const source = existsSync(rootFile) ? readFileSync(rootFile, "utf8") : ""
  const diagnosticObservation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(repo, [fixture.entry])))
  const postEditPreparation =
    diagnosticObservation === undefined
      ? { status: "adaptation-failed" }
      : await Effect.runPromise(
          prepareObservation(diagnosticObservation, {
            controlledWriter: true,
            advicee: diagnosticObservation.advicee,
            settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
            rules: configuredRules,
            inputContract: TYPE_INPUT_CONTRACT
          })
        ).then((prepared) => ({
          status: prepared.observation.status,
          pathReasons: prepared.observation.outcomes
            .filter((item) => item.status === "incomplete")
            .map((item) => item.reason),
          analysisFailures: prepared.observation.outcomes.flatMap((item) =>
            item.status === "observed" && item.analysis.status === "incomplete"
              ? item.analysis.failures.map((failure) => failure.reason)
              : []
          ),
          readyUnits: prepared.outcomes.filter((item) => item.status === "ready").length
        }))
  const observedNativeEdits = safeLines(nativeEvents)
  const lastNativeEdit = observedNativeEdits.at(-1)
  const nativeResponse = lastNativeEdit?.tool_response
  const nativePatchPath =
    typeof lastNativeEdit?.tool_input?.command === "string"
      ? /^\*\*\* Update File: (.+)$/m.exec(lastNativeEdit.tool_input.command)?.[1]
      : undefined
  const nativeObservation =
    lastNativeEdit === undefined
      ? undefined
      : await Effect.runPromise(
          host === "codex" ? adaptCodexDirectEvent(lastNativeEdit) : adaptClaudeDirectEvent(lastNativeEdit)
        )
  const nativeResponseShape =
    host === "codex"
      ? {
          responseType: typeof nativeResponse,
          responseKeys:
            nativeResponse !== null && typeof nativeResponse === "object" ? Object.keys(nativeResponse) : [],
          explicitSuccess: nativeResponse?.success === true,
          successWord: typeof nativeResponse === "string" && /success|updated|done|patch applied/i.test(nativeResponse),
          startsSuccessDot: typeof nativeResponse === "string" && /^Success\./u.test(nativeResponse),
          containsSuccessDot: typeof nativeResponse === "string" && /Success\./u.test(nativeResponse),
          startsPatchApplied: typeof nativeResponse === "string" && /^Patch applied/iu.test(nativeResponse),
          failureWord: typeof nativeResponse === "string" && /error|failed|could not|not found/i.test(nativeResponse),
          verifiedHunks:
            typeof lastNativeEdit?.tool_input?.command === "string"
              ? (verifyCodexPostEditHunks(lastNativeEdit.tool_input.command, fixture.entry, source)?.length ?? null)
              : null,
          normalizedPatchPresent: typeof nativeObservation?.nativePatchCommand === "string",
          normalizedVerifiedHunks:
            typeof nativeObservation?.nativePatchCommand === "string"
              ? (verifyCodexPostEditHunks(nativeObservation.nativePatchCommand, fixture.entry, source)?.length ?? null)
              : null,
          patchPathAbsolute: nativePatchPath?.startsWith("/") ?? false,
          patchPathRelativeMatch: nativePatchPath === fixture.entry,
          patchPathInsideRepo: nativePatchPath?.startsWith(`${repo}/`) ?? false,
          patchHasCarriageReturn: lastNativeEdit?.tool_input?.command?.includes("\r") ?? false
        }
      : undefined
  const preparationReads = []
  const nativeUpdatePreparation =
    nativeObservation === undefined
      ? { status: "adaptation-failed" }
      : await Effect.runPromise(
          prepareObservation(nativeObservation, {
            captureHooks: { sourceRead: (path) => preparationReads.push({ bytes: statSync(join(repo, path)).size }) },
            controlledWriter: true,
            advicee: nativeObservation.advicee,
            settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
            rules: configuredRules,
            inputContract: TYPE_INPUT_CONTRACT
          })
        ).then((prepared) => ({
          status: prepared.observation.status,
          pathReasons: prepared.observation.outcomes
            .filter((item) => item.status === "incomplete")
            .map((item) => item.reason),
          analysisFailures: prepared.observation.outcomes.flatMap((item) =>
            item.status === "observed" && item.analysis.status === "incomplete"
              ? item.analysis.failures.map((failure) => failure.reason)
              : []
          ),
          readyUnits: prepared.outcomes.filter((item) => item.status === "ready").length,
          operations: nativeObservation.candidates.map((item) => item.operation),
          sourceReadCount: preparationReads.length,
          sourceReadBytes: preparationReads.reduce((sum, item) => sum + item.bytes, 0),
          canonicalTreeBytes: prepared.outcomes
            .filter((item) => item.status === "ready")
            .map((item) => Buffer.byteLength(JSON.stringify(item.prepared.input.unit), "utf8"))
        }))
  const check = spawnSync("npm", ["test"], { cwd: repo, env, encoding: "utf8", timeout: 30_000 })
  let invalid
  if (language === "typescript") {
    writeFileSync(
      join(repo, "invalid.ts"),
      "import type { PaymentState } from './payment';\n// @ts-expect-error success requires a receipt\nconst invalid: PaymentState = {status:'succeeded'};\n// @ts-expect-error pending cannot have both results\nconst contradictory: PaymentState = {status:'pending',receipt:{value:''},failure_reason:'failure'};\n"
    )
    invalid = spawnSync("npm", ["test"], { cwd: repo, env, encoding: "utf8", timeout: 30000 })
  } else if (language === "rust") {
    writeFileSync(
      join(repo, "invalid.rs"),
      '#[path="src/lib.rs"] mod payment; use payment::PaymentState; fn main() { let _ = PaymentState::Succeeded {}; }'
    )
    const probe = spawnSync("rustc", ["--edition=2021", "invalid.rs", "-o", "invalid"], {
      cwd: repo,
      env,
      encoding: "utf8",
      timeout: 30000
    })
    invalid = { status: probe.status !== null && probe.status !== 0 && probe.stderr.includes("error[E0063]") ? 0 : 1 }
  } else if (pythonCrossfile) {
    // Source-only fixture check; do not execute project imports, decorators or constructors.
    const support = readFileSync(join(repo, "domain/models.py"), "utf8")
    invalid = {
      status:
        support === fixture.extraFiles["domain/models.py"] && support.includes("class Succeeded:\n    receipt: Receipt")
          ? 0
          : 1
    }
  } else if (language === "python") {
    const probe = spawnSync("python3", ["-c", "from payment import Succeeded; Succeeded()"], {
      cwd: repo,
      env,
      encoding: "utf8",
      timeout: 30000
    })
    invalid = {
      status:
        probe.status !== null &&
        probe.status !== 0 &&
        probe.stderr.includes("TypeError") &&
        probe.stderr.includes("receipt")
          ? 0
          : 1
    }
  } else {
    writeFileSync(
      join(repo, "invalid.bend"),
      "import Base\nimport ./payment.bend as P\ndef invalid() -> P.PaymentState:\n  P.Succeeded{}\n"
    )
    const probe = spawnSync("bend", ["invalid.bend", "--check-only"], {
      cwd: repo,
      env,
      encoding: "utf8",
      timeout: 30000
    })
    invalid = {
      status:
        probe.status !== null && probe.status !== 0 && /receipt|field|argument/i.test(probe.stdout + probe.stderr)
          ? 0
          : 1
    }
  }
  const stages = []
  const visit = (path) => {
    if (!existsSync(path)) return
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, item.name)
      if (item.isDirectory()) visit(child)
      else {
        try {
          const marker = JSON.parse(readFileSync(child, "utf8"))
          if (typeof marker.stage === "string")
            stages.push({ stage: marker.stage, atMs: Math.round(statSync(child).mtimeMs - started) })
        } catch {
          /* source-free markers only */
        }
      }
    }
  }
  visit(activity)
  stages.sort((a, b) => a.atMs - b.atMs)
  const nativeEdits = native.filter((item) => item.kind === "edit")
  const latestEdit = nativeEdits.at(-1)
  const faultEvents = native.filter((item) => item.injectedFault === scenario && item.kind !== "fault-completed")
  const noAdviceDelivered = !native.some((item) => item.finding || (item.ruleIds?.length ?? 0) > 0)
  const agentDidNotApplyAdvice =
    text.includes("HAPSLAND_ADVICE_NOT_APPLIED") && !text.includes("HAPSLAND_ADVICE_APPLIED")
  const firstNativeEdit = observedNativeEdits[0]
  const firstOperationIsUpdate =
    host === "codex"
      ? typeof firstNativeEdit?.tool_input?.command === "string" &&
        firstNativeEdit.tool_input.command.includes("*** Update File:") &&
        !firstNativeEdit.tool_input.command.includes("*** Add File:")
      : firstNativeEdit?.tool_name === "Edit"
  const positiveChecks = {
    ...(unicodeUpdate
      ? {
          firstNativeOperationIsUpdate: firstOperationIsUpdate,
          unicodeCommentsPreservedInEveryEdit:
            nativeEdits.length === 2 && nativeEdits.every((item) => item.unicodeCommentsPreserved === true),
          unicodeCommentsPreservedInFinalSource: source.startsWith(unicodePrefix) && source.endsWith(unicodeSuffix),
          finalNativeUpdateAttributed:
            nativeUpdatePreparation.readyUnits > 0 &&
            nativeUpdatePreparation.operations?.every((operation) => operation === "update")
        }
      : {}),
    initialDraftObserved: native.some((item) => item.initial),
    [language === "python" && !pythonCrossfile ? "sameFileSupportingEvidenceExpanded" : "crossFileExpanded"]:
      requestShapes.some((item) => item.expandedEdges > 0 || (item.expandedEvidence && item.supportDeclarationPresent)),
    findingDelivered: !!finding,
    editAfterFinding: !!repair,
    agentAcknowledgesAdvice: text.includes("HAPSLAND_ADVICE_APPLIED") && !text.includes("HAPSLAND_ADVICE_NOT_APPLIED"),
    agentQuotesFinding: !!finding && finding.ruleIds.some((id) => text.includes(feedbackMessages[id])),
    sourceChanged: !!source && source !== initial,
    finalDesignConstrained:
      language === "typescript"
        ? source.includes("status: 'succeeded'") && !source.includes("receipt: Receipt | null")
        : language === "rust"
          ? source.includes("pub enum PaymentState")
          : language === "python"
            ? source.includes("PaymentState: TypeAlias = Pending | Succeeded | Failed") &&
              !source.includes("class PaymentState")
            : source.includes("Succeeded{receipt: M.Receipt}") && !source.includes("PaymentState{status:"),
    sourceCompiles: check.status === 0,
    [pythonCrossfile ? "declaredSuccessRequiresReceipt" : "missingReceiptRejected"]: invalid.status === 0,
    ...(pythonCrossfile
      ? {
          installedHookStdoutSubmittedAdvice:
            !!codexSubmissionObservations &&
            safeLines(codexSubmissionObservations).some(
              (item) => item.initialRoot && item.adviceSubmitted && item.exitCode === 0
            ),
          installedCrossFileEvidence: requestShapes.some((item) => item.crossFileEvidenceNodes >= 2),
          installedInputSizesRecorded:
            requestShapes.length > 0 && requestShapes.every((item) => item.inputBytes > 0 && item.evidenceBytes > 0),
          preparationReadVolumeRecorded:
            nativeUpdatePreparation.sourceReadCount > 0 &&
            nativeUpdatePreparation.sourceReadBytes > 0 &&
            nativeUpdatePreparation.canonicalTreeBytes?.every((bytes) => bytes <= 20480)
        }
      : {}),
    followupObserved:
      !!repair &&
      stages.some((item) => item.atMs > repair.at - started && (item.stage === "clear" || item.stage === "findings"))
  }
  const checks = preFault
    ? {
        ...assessPreFault({
          scenario,
          events: native,
          mutation: firstMutation,
          reviewerRequests: requestShapes.length,
          providerRequests: providerCalls,
          fixtureMatches: source === initial,
          observerInstalled: providerObserverInstalled
        }),
        noAdviceDelivered,
        agentDidNotApplyAdvice
      }
    : scenario === "adoption"
      ? positiveChecks
      : scenario === "reviewer-unavailable"
        ? {
            initialDraftObserved: nativeEdits.some((item) => item.initial),
            reviewAttempted: requestShapes.length > 0,
            unavailableRecorded: stages.some((item) => item.stage === "incomplete" || item.stage === "unavailable"),
            noAdviceDelivered,
            agentDidNotApplyAdvice,
            sourceLeftAtDraft: source === initial
          }
        : scenario === "stale-result"
          ? {
              initialDraftObserved: nativeEdits.some((item) => item.initial),
              laterEditObserved: nativeEdits.length >= 2 && latestEdit?.initial === false,
              separateReviewRequests:
                requestShapes.length >= 2 &&
                requestShapes[0]?.conditionalFindingSourceMatched === true &&
                requestShapes.at(-1)?.conditionalFindingSourceMatched === false,
              olderFindingCompleted:
                !!nativeEdits[0]?.toolUseHash &&
                outcomeSummaries.some(
                  (item) => item.toolUseHash === nativeEdits[0].toolUseHash && item.outcome === "completed-findings"
                ) &&
                stages.some((item) => item.stage === "findings" && item.atMs > latestEdit.at - started),
              newerClearCompleted:
                !!latestEdit?.toolUseHash &&
                outcomeSummaries.some(
                  (item) => item.toolUseHash === latestEdit.toolUseHash && item.outcome === "completed-clear"
                ),
              staleFindingNotDelivered: noAdviceDelivered,
              agentDidNotApplyAdvice,
              finalSourceCompiles: check.status === 0
            }
          : {
              initialDraftObserved: nativeEdits.some((item) => item.initial),
              injectedFaultObserved: faultEvents.some((item) => item.kind === "edit"),
              noReviewRequest: requestShapes.length === 0,
              noAdviceDelivered,
              agentDidNotApplyAdvice
            }
  const abideSummary = abide?.summary()
  const coexistenceChecks = coexistence
    ? {
        ...abideSummary.checks,
        initialDraftObserved: positiveChecks.initialDraftObserved,
        finalDesignConstrained: positiveChecks.finalDesignConstrained,
        sourceCompiles: positiveChecks.sourceCompiles,
        missingReceiptRejected: positiveChecks.missingReceiptRejected,
        ...(coexistence === "privacy" || coexistence === "hapsland-unavailable"
          ? {
              ...(coexistence === "privacy"
                ? { hapslandNoReviewRequest: requestShapes.length === 0 }
                : {
                    hapslandReviewAttempted: requestShapes.length > 0,
                    hapslandUnavailableObserved: stages.some(
                      (item) => item.stage === "unavailable" || item.stage === "incomplete"
                    )
                  }),
              hapslandNoAdviceDelivered: noAdviceDelivered,
              agentDidNotApplyHapslandAdvice: agentDidNotApplyAdvice,
              agentAcknowledgesAbideAdvice:
                text.includes("ABIDE_ADVICE_APPLIED") && !text.includes("ABIDE_ADVICE_NOT_APPLIED")
            }
          : {
              hapslandCrossFileExpanded: positiveChecks.crossFileExpanded,
              hapslandFindingDelivered: positiveChecks.findingDelivered,
              agentAcknowledgesHapslandAdvice: positiveChecks.agentAcknowledgesAdvice,
              hapslandFollowupObserved: positiveChecks.followupObserved
            }),
        ...(mode === "live-jev"
          ? {
              bothReviewersCalled:
                safeLines(calls).some((item) => item.reviewer === "hapsland") &&
                safeLines(calls).some((item) => item.reviewer === "abide"),
              abideFindingDelivered: abideSummary.hookEvents.some((item) => item.finding)
            }
          : { noExternalProviderRequests: providerCalls === 0 })
      }
    : undefined
  const resultChecks =
    coexistenceChecks ?? (scenario === "adoption" ? checks : { ...checks, noProviderRequests: providerCalls === 0 })
  const record = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    commit: spawnSync("git", ["-C", project, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(),
    sourceWorktreeDirty:
      spawnSync("git", ["-C", project, "diff", "--quiet", "--", "src", "scripts"], { encoding: "utf8" }).status !== 0,
    language,
    scenario,
    runnerHash,
    executionProfile: {
      runtime: installedClaude || installedCodex ? "installed-artifact" : "source-checkout",
      installedPackageValidated: installedClaudeSetup !== undefined || installedCodex !== undefined,
      ...(installedCodex ? { installedArchive: installedCodex.evidence } : {}),
      ...(installedClaude
        ? {
            installedArchive: installedClaude.evidence,
            installation: installedClaudeSetup?.evidence,
            observation:
              "native registration observer delegates installed dedicated hook commands with explicit controlled reviewer test selector"
          }
        : {}),
      normalTrustValidated: false,
      syntheticRepositoryOnly: true
    },
    runtime: host === "codex" ? "Codex CLI" : "Claude Code",
    version,
    mode,
    ...(host === "claude"
      ? {
          nativeRepairShape: {
            oldStringIncludesImport:
              typeof lastNativeEdit?.tool_input?.old_string === "string" &&
              lastNativeEdit.tool_input.old_string.includes("import "),
            oldStringBytes:
              typeof lastNativeEdit?.tool_input?.old_string === "string"
                ? Buffer.byteLength(lastNativeEdit.tool_input.old_string)
                : null,
            newStringBytes:
              typeof lastNativeEdit?.tool_input?.new_string === "string"
                ? Buffer.byteLength(lastNativeEdit.tool_input.new_string)
                : null
          }
        }
      : {}),
    declaration,
    ...(abideSummary
      ? {
          coexistence: abideSummary,
          hookOrder,
          coexistenceCase: coexistence,
          providerCallsByReviewer: {
            hapsland: safeLines(calls).filter((item) => item.reviewer === "hapsland").length,
            abide: safeLines(calls).filter((item) => item.reviewer === "abide").length
          },
          agentAcknowledgesAbideAdvice:
            text.includes("ABIDE_ADVICE_APPLIED") && !text.includes("ABIDE_ADVICE_NOT_APPLIED")
        }
      : {}),
    hostDiagnostics,
    hostExitCode: result.code,
    hostSignal: result.signal,
    elapsedMs: Date.now() - started,
    providerCalls,
    requestShapes,
    ...(pythonCrossfile
      ? {
          pythonCrossfile: true,
          readVolumeBoundary:
            "source preparation replay of the final native edit; installed provider input bytes are in requestShapes"
        }
      : {}),
    outcomeSummaries,
    postEditPreparation,
    nativeUpdatePreparation,
    nativeResponseShape,
    ...(fault
      ? {
          faultObservation: {
            phase: fault.phase,
            configuredDeadlineMs: fault.timeoutSeconds * 1000,
            naturalCompletionObserved: native.some((e) => e.kind === "fault-completed"),
            naturallyCompletedKinds: native.filter((e) => e.kind === "fault-completed").map((e) => e.targetKind),
            processTermination: "not inferred from hook deadline or missing log"
          }
        }
      : {}),
    ...(preFault
      ? {
          preObservation: {
            actualNativeToolStart: "not observed",
            permitRegistrationBypassed: true,
            observerArmedMonoMs: observerArmedMono - startedMono,
            transientWriteRevertAbsenceNotProven: true,
            firstMutation: firstMutation
              ? {
                  atMs: firstMutation.at - started,
                  monoMs: firstMutation.monoMs - startedMono,
                  preProcessAlive: firstMutation.preProcessAlive
                }
              : null
          }
        }
      : {}),
    activityStages: stages,
    hookEvents: native.map((item) => ({
      kind: item.kind,
      monoMs: item.monoMs === undefined ? null : item.monoMs - startedMono,
      atMs: item.at - started,
      durationMs: item.doneAt === null ? null : item.doneAt - item.at,
      event: item.event,
      tool: item.tool,
      exitCode: item.exitCode,
      decision: item.decision,
      finding: item.finding,
      ruleIds: item.ruleIds,
      initial: item.initial,
      sourceBytes: item.sourceBytes,
      ...(unicodeUpdate ? { unicodeCommentsPreserved: item.unicodeCommentsPreserved ?? null } : {}),
      sessionHash: item.sessionHash ?? null,
      rootHash: item.rootHash ?? null,
      toolUseHash: item.toolUseHash ?? null,
      injectedFault: item.injectedFault ?? null,
      targetKind: item.targetKind ?? null,
      hold: item.hold ?? null
    })),
    checks: resultChecks,
    rawHostStreamRetained: false,
    sourceRetained: false,
    providerBodyRetained: false,
    credentialsRetained: false,
    hostBytesDiscarded: Buffer.byteLength(result.stdout) + result.stderrBytes
  }
  record.verdict = result.code === 0 && Object.values(record.checks).every(Boolean) ? "demonstrated" : "incomplete"
  const output = join(evidenceRoot, `${runId}.json`)
  mkdirSync(evidenceRoot, { recursive: true })
  writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`)
  console.log(JSON.stringify({ evidence: output, verdict: record.verdict, checks: record.checks, providerCalls }))
  if (record.verdict !== "demonstrated") process.exitCode = 1
} finally {
  mutationWatcher?.close()
  await abide?.close()
  if (installedClaude || installedCodex) {
    await cleanupOwnedResident(runtime, [
      {
        executable: join(
          (installedClaude || installedCodex).root,
          "dist/bin",
          `${process.platform}-${process.arch}`,
          "hapsland-resident"
        ),
        args: []
      }
    ])
  } else {
    try {
      owner = JSON.parse(readFileSync(residentPaths(runtime).owner, "utf8"))
      await runClient(
        residentRequest(residentPaths(runtime), {
          requestRoute: "shared",
          operation: "cleanup",
          lifetime: owner.lifetime
        })
      ).catch(() => {})
      process.kill(owner.pid, "SIGTERM")
    } catch {
      /* resident may never have started */
    }
  }
  rmSync(temp, { recursive: true, force: true })
}
