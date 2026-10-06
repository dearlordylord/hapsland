import { DEFAULT_RULE_MESSAGES } from "@hapsland/review-definition/rules/shipped"
import { runClient } from "../src/test-support/client-runtime.ts"
// Opt-in real Codex + real Jev demonstration. Retains only source-free evidence.
import { spawn, execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, readFile, copyFile, chmod, rm, readdir } from "node:fs/promises"
import { tmpdir, homedir } from "node:os"
import { join, resolve } from "node:path"
import { residentRequestEffect as residentRequest } from "@hapsland/resident-transport/resident/client"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"
const root = resolve(new URL("../", import.meta.url).pathname)
const declaration = {
  attempt: 3,
  priorAttemptProviderRequests: 2,
  fixtureIds: ["rust-payment-edit-repair"],
  maximumProviderRequests: 6,
  deadlineMs: 15000,
  hostDeadlineMs: 240000,
  automaticHostRetries: 0,
  productionTransientRetries: 2,
  maximumFixtureFileBytes: 4096,
  syntheticRepositoryOnly: true,
  model: "gpt-6-luna",
  reasoningEffort: "max",
  expectedCodexVersion: "0.156.0"
}
const codexExecutable = process.env.RUST_CODEX_EXECUTABLE ?? "/tmp/hapsland-rust-codex-01560/node_modules/.bin/codex"
const actualCodexVersion = execFileSync(codexExecutable, ["--version"], { encoding: "utf8" }).trim()
if (actualCodexVersion !== "codex-cli 0.156.0") throw new Error("Expected actual Codex CLI 0.156.0")
const prepareOnly = process.argv.includes("--prepare-only")
if (!process.argv.includes("--execute-paid") && !prepareOnly) {
  console.error("Pass --execute-paid to run the declared live demonstration.")
  process.exit(2)
}
console.log(JSON.stringify({ milestone: "real-codex-real-jev-repair", declaration }))
const run = (cmd, args, options = {}) =>
  new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd: options.cwd, env: options.env ?? process.env, stdio: ["pipe", "pipe", "pipe"] })
    let stdout = "",
      stderr = ""
    const timer = setTimeout(() => p.kill("SIGTERM"), options.timeout ?? 240000)
    p.stdout.on("data", (c) => (stdout += c))
    p.stderr.on("data", (c) => (stderr += c))
    p.on("error", rej)
    p.on("close", (code) => {
      clearTimeout(timer)
      res({ code, stdout, stderr })
    })
    p.stdin.end(options.input)
  })
const json = (s) => {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}
const lines = (s) => s.split("\n").filter(Boolean).map(json).filter(Boolean)
const _quote = (s) => `'${s.replaceAll("'", "'\\''")}'`
if (!prepareOnly) {
  await mkdir(join(root, "evidence/rust-support"), { recursive: true })
  await writeFile(
    join(root, "evidence/rust-support/native-declaration-3.json"),
    JSON.stringify({ declaredAt: new Date().toISOString(), declaration }, null, 2) + "\n"
  )
}
let key = process.env.TYPESAFE_API_KEY
if (!key && !prepareOnly) {
  const worktrees = execFileSync("git", ["-C", root, "worktree", "list", "--porcelain"], { encoding: "utf8" })
  const primary = worktrees
    .split("\n\n")
    .find((entry) => /branch refs\/heads\/(?:main|master)(?:\n|$)/.test(entry))
    ?.match(/^worktree (.+)$/m)?.[1]
  for (const path of [root, primary].filter(Boolean)) {
    const envText = await readFile(join(path, ".env"), "utf8").catch(() => "")
    const value = envText.match(/^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/m)?.[1]
    key = value?.replace(/^(['"])(.*)\1$/, "$2")
    if (key) break
  }
}
if (!key && !prepareOnly) throw new Error("Jev credential unavailable")
const temp = await mkdtemp(join(tmpdir(), "hapsland-rust-native-"))
const repo = join(temp, "repo"),
  home = join(temp, "codex"),
  runtime = join(temp, "runtime"),
  activity = join(temp, "activity"),
  events = join(temp, "events.jsonl"),
  calls = join(temp, "calls.jsonl")
const activityStages = async (path, started) => {
  const found = []
  const visit = async (next) => {
    for (const entry of await readdir(next, { withFileTypes: true }).catch(() => [])) {
      const child = join(next, entry.name)
      if (entry.isDirectory()) await visit(child)
      else {
        const marker = json(await readFile(child, "utf8").catch(() => ""))
        if (typeof marker?.stage === "string") {
          found.push({
            stage: marker.stage,
            eventKey: marker.eventKey,
            unitKey: marker.unitKey,
            expectedUnitKeys: marker.expectedUnitKeys,
            atMs: Math.round(marker.observedAt - started)
          })
        }
      }
    }
  }
  await visit(path)
  return found.sort((a, b) => a.atMs - b.atMs)
}
let owner, record
try {
  await mkdir(repo)
  await mkdir(home, { mode: 0o700 })
  if (!prepareOnly) {
    await copyFile(join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json"), join(home, "auth.json"))
    await chmod(join(home, "auth.json"), 0o600)
  }
  await run("git", ["init", "--quiet", "--initial-branch=master"], { cwd: repo })
  await writeFile(
    join(repo, "README.md"),
    "# Payment state example\nA payment is pending, succeeded with a receipt, or failed with a failure reason. Pending has neither result; success and failure are mutually exclusive.\n"
  )
  await writeFile(
    join(repo, "check.mjs"),
    `import {spawnSync} from 'node:child_process';
const p=spawnSync('rustc',['--edition=2024','--crate-type=lib','payment.rs','-o','payment.rlib'],{encoding:'utf8'});process.stdout.write(p.stdout??'');process.stderr.write(p.stderr??'');process.exitCode=p.status??1;
`
  )
  await writeFile(join(repo, "package.json"), JSON.stringify({ private: true, scripts: { test: "node check.mjs" } }))
  // Instrument the actual fetch boundary without reading requests or responses.
  const observer = join(temp, "observe-fetch.mjs")
  await writeFile(
    observer,
    `import {appendFileSync,readFileSync} from 'node:fs';\nconst original=globalThis.fetch; globalThis.fetch=async (...args)=>{const url=String(args[0]?.url??args[0]);if(!url.includes('/v1/systemone'))return original(...args);let count=0;try{count=readFileSync(process.env.DEMO_CALLS,'utf8').trim().split('\\n').filter(Boolean).length}catch{}if(count>=6)throw new Error('demo provider request budget exhausted');const started=Date.now();appendFileSync(process.env.DEMO_CALLS,JSON.stringify({kind:'request',at:started})+'\\n',{mode:0o600});try{const response=await original(...args);appendFileSync(process.env.DEMO_EVENTS,JSON.stringify({kind:'provider-response',at:Date.now(),durationMs:Date.now()-started,status:response.status})+'\\n',{mode:0o600});return response}catch(e){appendFileSync(process.env.DEMO_EVENTS,JSON.stringify({kind:'provider-failure',at:Date.now()})+'\\n',{mode:0o600});throw e}};\n`
  )
  await writeFile(
    observer,
    (await readFile(observer, "utf8")) +
      "\nimport fs from 'node:fs';\nimport {syncBuiltinESMExports} from 'node:module';\nimport {createHash} from 'node:crypto';\nconst hookProcess=process.argv.some(a=>a==='--codex-hook'||/^--composed-(?:before-edit|background|stop|prompt)-hook$/.test(a));\nif(hookProcess){\n  let nativeInput='',output='';\n  const read=fs.readFileSync;\n  fs.readFileSync=function(...args){const value=read.apply(this,args);if(args[0]===0)nativeInput+=String(value);return value;};\n  syncBuiltinESMExports();\n  const write=process.stdout.write;\n  process.stdout.write=function(chunk,...args){output+=String(chunk);return write.call(this,chunk,...args);};\n  const at=Date.now();\n  process.once('exit',code=>{\n    let event,out;try{event=JSON.parse(nativeInput)}catch{}try{out=JSON.parse(output)}catch{}\n    const context=out?.hookSpecificOutput?.additionalContext??out?.reason??out?.systemMessage??'';\n    const file=process.env.DEMO_SOURCE;\n    const source=file&&fs.existsSync(file)?read(file,'utf8'):'';\n    fs.appendFileSync(process.env.DEMO_EVENTS,JSON.stringify({kind:'hook',at,doneAt:Date.now(),hookKind:process.argv.find(a=>a==='--codex-hook'||a.startsWith('--composed-')&&a.endsWith('-hook')),hookEvent:event?.hook_event_name??'unknown',tool:event?.tool_name??'unknown',eventKey:event?createHash('sha256').update(['activity-v1:event',event.session_id,event.agent_id??'root',event.turn_id,event.tool_use_id].join(String.fromCharCode(0))).digest('hex'):null,exitCode:code,stdoutBytes:Buffer.byteLength(output),outputKeys:out?Object.keys(out):[],findings:context.split('\\n').some(line=>/^.+ :: .+: /.test(line)),notice:context.includes('Operational notice:'),ruleId:Object.entries(" +
      JSON.stringify(DEFAULT_RULE_MESSAGES) +
      ").find(([,text])=>context.includes(text))?.[0]??null,ruleIdSource:'configured-message-match',ruleIds:Object.entries(" +
      JSON.stringify(DEFAULT_RULE_MESSAGES) +
      ").filter(([,text])=>context.includes(text)).map(([id])=>id),sourceHash:source?createHash('sha256').update(source).digest('hex'):null,sourceBytes:Buffer.byteLength(source),draft:source.includes('receipt: Option<String>')&&source.includes('failure_reason: Option<String>')})+'\\n',{mode:0o600});\n  });\n}\n"
  )
  const env = {
    ...process.env,
    CODEX_HOME: home,
    TYPESAFE_API_KEY: key,
    REVIEW_RESIDENT_DIR: runtime,
    REVIEW_ACTIVITY_PATH: activity,
    REVIEW_USER_CONFIG_PATH: join(temp, "absent-user-config.jsonc"),
    DEMO_EVENTS: events,
    DEMO_CALLS: calls,
    DEMO_SOURCE: join(repo, "payment.rs"),
    NODE_OPTIONS: `--import=${observer}`
  }
  delete env.REVIEW_CONTROL_JSON
  delete env.OPENAI_API_KEY
  const cli = join(root, "packages/cli-entry/src/cli.ts")
  const preview = await run(process.execPath, [cli, "--install-preview"], {
    cwd: repo,
    env,
    input: JSON.stringify({ version: 1, operation: "install-preview", codexHome: home, codexExecutable })
  })
  const proposed = json(preview.stdout)
  if (preview.code !== 0 || proposed?.status !== "preview" || !proposed.proposal?.digest)
    throw new Error("Native source installer preview failed")
  const installed = await run(process.execPath, [cli, "--install"], {
    cwd: repo,
    env,
    input: JSON.stringify({
      version: 1,
      operation: "install",
      codexHome: home,
      codexExecutable,
      proposalDigest: proposed.proposal.digest
    })
  })
  if (installed.code !== 0 || json(installed.stdout)?.status !== "installed")
    throw new Error("Native source installation failed")
  const hooks = json(await readFile(join(home, "hooks.json"), "utf8"))
  if (prepareOnly) {
    console.log(
      JSON.stringify({
        installerPrepared: true,
        lifecycleEvents: Object.keys(hooks.hooks),
        actualCodexVersion,
        paidExecution: false
      })
    )
  } else {
    const prompt = `Implement the Rust payment-state example described in README.md. First use apply_patch to add payment.rs with this initial draft exactly:
pub enum PaymentStatus { Pending, Succeeded, Failed }
pub struct PaymentState {
  pub status: PaymentStatus,
  pub receipt: Option<String>,
  pub failure_reason: Option<String>,
}
After the initial apply_patch, run npm test as the next tool call before any other source edit. Read any Hapsland advice returned with that Bash tool result. If review is pending, run npm test again to receive completed advice before editing. Then repair payment.rs if actionable advice asks for it, preserving the business meaning. Use an enum PaymentState with Pending, Succeeded { receipt: String }, and Failed { failure_reason: String } variants when the advice recommends constraining meaningless combinations. Add valid_examples() with one value of each state in payment.rs. After the repair run npm test, then run npm test once more if review is pending to receive the followup result. Use apply_patch for source edits. Stay inside this repository; do not inspect integration configuration, environment variables, or credentials. Make at most three source-edit tool calls and keep each Rust file under 4 KiB. In your final reply include HAPSLAND_ADVICE_APPLIED only if you personally received and used actionable Hapsland advice; otherwise include HAPSLAND_ADVICE_NOT_APPLIED. If you received a finding, quote its exact finding message as shown in the advice. Be truthful. Work autonomously.`
    const start = Date.now()
    const host = await run(
      codexExecutable,
      [
        "exec",
        "--model",
        "gpt-6-luna",
        "-c",
        'model_reasoning_effort="max"',
        "--ephemeral",
        "--json",
        "--dangerously-bypass-hook-trust",
        "--dangerously-bypass-approvals-and-sandbox",
        "--ignore-rules",
        "-C",
        repo,
        prompt
      ],
      { cwd: repo, env }
    )
    const history = lines(await readFile(events, "utf8").catch(() => ""))
    const messages = lines(host.stdout)
      .filter((e) => e.item?.type === "agent_message")
      .map((e) => e.item.text ?? "")
    const source = await readFile(join(repo, "payment.rs"), "utf8").catch(() => "")
    await writeFile(
      join(repo, "valid.rs"),
      '#[path="payment.rs"] mod payment; use payment::PaymentState; fn main() { let _ = PaymentState::Pending; let _ = PaymentState::Succeeded { receipt: String::new() }; let _ = PaymentState::Failed { failure_reason: String::new() }; }'
    )
    const test = await run("rustc", ["--edition=2024", "valid.rs", "-o", "valid"], { cwd: repo, env })
    // Independently verify three forbidden combinations against the repaired API.
    const invalidOutcomes = []
    for (const [id, expression] of [
      ["missing-receipt", "PaymentState::Succeeded {}"],
      ["premature-receipt", "PaymentState::Pending { receipt: String::new() }"],
      ["contradictory-success", "PaymentState::Succeeded { receipt: String::new(), failure_reason: String::new() }"]
    ]) {
      await writeFile(
        join(repo, "invalid.rs"),
        `#[path="payment.rs"] mod payment; use payment::PaymentState; fn main() { let _ = ${expression}; }`
      )
      const check = await run("rustc", ["--edition=2024", "invalid.rs", "-o", "invalid"], { cwd: repo, env })
      invalidOutcomes.push({ id, rejected: check.code !== 0, compilerReportedError: check.stderr.includes("error[") })
    }
    const paths = residentPaths(runtime)
    owner = json(await readFile(paths.owner, "utf8").catch(() => ""))
    let stats
    const terminalDeadline = Date.now() + 15000
    do {
      stats = owner
        ? await runClient(
            residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime })
          ).catch(() => undefined)
        : undefined
      if (!owner || (stats?.status === "stats" && stats.queued === 0 && stats.running === 0)) break
      await new Promise((resolveWait) => setTimeout(resolveWait, 100))
    } while (Date.now() < terminalDeadline)
    const finding = history.find((e) => e.kind === "hook" && e.findings)
    const targetFinding = history.some((e) => e.kind === "hook" && e.ruleIds?.includes("r2_meaningless_combinations"))
    const changedAfterFinding =
      !!finding &&
      history.some(
        (e) =>
          e.kind === "hook" &&
          e.hookKind === "--codex-hook" &&
          e.hookEvent === "PostToolUse" &&
          e.tool === "apply_patch" &&
          e.sourceBytes > 0 &&
          e.at > finding.at &&
          e.sourceHash !== finding.sourceHash
      )
    const observedStages = await activityStages(activity, start)
    const repair = history.find(
      (e) =>
        e.kind === "hook" &&
        e.hookKind === "--codex-hook" &&
        e.hookEvent === "PostToolUse" &&
        e.tool === "apply_patch" &&
        e.sourceBytes > 0 &&
        e.at > (finding?.at ?? Infinity) &&
        e.sourceHash !== finding?.sourceHash
    )
    const repairPending = observedStages.find(
      (e) => e.eventKey === repair?.eventKey && e.stage === "pending" && e.expectedUnitKeys?.length === 1
    )
    const followup = observedStages.find(
      (e) =>
        e.eventKey === repair?.eventKey &&
        repairPending?.expectedUnitKeys?.includes(e.unitKey) &&
        (e.stage === "clear" || e.stage === "findings")
    )
    record = {
      schemaVersion: 1,
      recordedAt: new Date().toISOString(),
      declaration,
      codexVersion: actualCodexVersion,
      executionProfile: {
        runtime: "source-checkout",
        installerGeneratedLifecycle: true,
        observerWrappedEntrypoint: false,
        observation: "same-process-node-import",
        hookTrust: "bypassed-vetted-disposable-hook",
        installedPackageValidated: false,
        normalTrustValidated: false,
        platform: process.platform,
        architecture: process.arch
      },
      invalidOutcomes,
      hostExitCode: host.code,
      elapsedMs: Date.now() - start,
      providerRequests: lines(await readFile(calls, "utf8").catch(() => "")).length,
      timeline: history.map((e) => ({ ...e, atMs: e.at - start, at: undefined, doneAt: undefined })),
      activityStages: observedStages,
      checks: {
        boundedFixtureFiles: history.every(
          (e) => e.kind !== "hook" || e.sourceBytes <= declaration.maximumFixtureFileBytes
        ),
        initialDraftObserved: history.some((e) => e.draft),
        realFindingSubmitted: !!finding,
        targetRuleDelivered: targetFinding,
        editAfterFinding: changedAfterFinding,
        validExamplesCompile: test.code === 0,
        invalidStatesRejected: invalidOutcomes.every((x) => x.rejected && x.compilerReportedError),
        agentAcknowledgesAdvice:
          (messages.at(-1) ?? "").includes("HAPSLAND_ADVICE_APPLIED") &&
          !(messages.at(-1) ?? "").includes("HAPSLAND_ADVICE_NOT_APPLIED"),
        agentQuotesDeliveredFinding:
          !!finding?.ruleId && (messages.at(-1) ?? "").includes(DEFAULT_RULE_MESSAGES[finding.ruleId]),
        finalSourceChanged:
          source.length > 0 && !source.includes("receipt: Option<String>") && source.includes("pub enum PaymentState"),
        followupClearObserved: followup?.stage === "clear",
        followupFindingObserved: followup?.stage === "findings"
      },
      resident:
        stats?.status === "stats"
          ? {
              queued: stats.queued,
              running: stats.running,
              successfulCacheEntries: stats.successfulCacheEntries,
              pendingFindingBatches: stats.pendingFindingBatches,
              pendingOperationalNotices: stats.pendingOperationalNotices
            }
          : null,
      rawTranscriptRetained: false,
      rawBackendMaterialRetained: false
    }
    record.verdict =
      host.code === 0 &&
      Object.entries(record.checks)
        .filter(([name]) => !name.startsWith("followup") && name !== "agentQuotesDeliveredFinding")
        .every(([, value]) => value) &&
      (record.checks.followupClearObserved || record.checks.followupFindingObserved)
        ? "demonstrated"
        : "incomplete"
    await mkdir(join(root, "evidence/rust-support"), { recursive: true })
    await writeFile(join(root, "evidence/rust-support/native-codex.json"), JSON.stringify(record, null, 2) + "\n")
    console.log(JSON.stringify(record, null, 2))
  }
} finally {
  owner ??= json(await readFile(residentPaths(runtime).owner, "utf8").catch(() => ""))
  if (owner) {
    const paths = residentPaths(runtime)
    await runClient(
      residentRequest(paths, { requestRoute: "shared", operation: "cleanup", lifetime: owner.lifetime })
    ).catch(() => {})
    try {
      process.kill(owner.pid, "SIGTERM")
    } catch {}
  }
  await rm(temp, { recursive: true, force: true })
}
if (!prepareOnly && record?.verdict !== "demonstrated") process.exitCode = 1
