// Abide's released handlers run unchanged beside the common real-host runner.
// Only source-free observations survive the disposable test repository.
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

export const COEXISTENCE_CASES = ["hapsland", "both", "abide-unavailable", "hapsland-unavailable", "privacy"]
export const TASK_CANARY = "COEXISTENCE_SYNTHETIC_TASK_CANARY"
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`
const hash = (value) => createHash("sha256").update(value).digest("hex")
const records = (path) => {
  try {
    return readFileSync(path, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

export async function setupAbideCoexistence({
  prefix,
  testCase,
  order,
  mode,
  host,
  temp,
  repo,
  home: _home,
  settingsPath,
  initial,
  good,
  rootFile,
  runtime,
  activity,
  env
}) {
  const packageRoot = join(resolve(prefix), "node_modules", "@coldtea", "abide")
  const helperSha256 = hash(readFileSync(new URL(import.meta.url)))
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))
  if (manifest.version !== "0.0.7") throw new Error("Coexistence requires @coldtea/abide@0.0.7")
  const bin = join(packageRoot, manifest.bin.abide)
  const originalHook = join(packageRoot, "dist", "abide-hook.js")
  if (!existsSync(bin) || !existsSync(originalHook)) throw new Error("Released Abide handlers unavailable")
  const abideHome = host === "codex" ? join(temp, "profile") : join(temp, "abide-home")
  mkdirSync(abideHome, { recursive: true })
  const hookLog = join(temp, "abide-hooks.jsonl")
  const requests = join(temp, "abide-requests.jsonl")
  const goodObjectId = spawnSync("git", ["hash-object", "--stdin"], {
    cwd: repo,
    input: good,
    encoding: "utf8"
  }).stdout.trim()
  const finalSourceWasInGitBeforeSession = Boolean(
    goodObjectId && spawnSync("git", ["cat-file", "-e", goodObjectId], { cwd: repo, stdio: "ignore" }).status === 0
  )
  const instruction =
    "Payment states must make contradictory combinations impossible: success requires a receipt; pending has neither receipt nor failure; success and failure are mutually exclusive.\n"
  writeFileSync(join(repo, "AGENTS.md"), instruction)
  mkdirSync(join(repo, ".abide"), { recursive: true })
  writeFileSync(
    join(repo, ".abide", "rubric.json"),
    JSON.stringify({
      version: 1,
      compiledAt: new Date().toISOString(),
      compiledBy: "coexistence-fixture",
      sources: [{ path: "AGENTS.md", sha: hash(instruction), scope: "**/*" }],
      rules: [
        {
          id: "payment-state-combinations",
          text: instruction.trim(),
          source: { path: "AGENTS.md", line: 1 },
          scope: ["payment.ts"],
          when: "edit",
          check: {
            type: "model",
            question: {
              type: "boolean",
              instructions:
                "Does this change define PaymentState with independently nullable receipt and failure_reason fields, so a pending payment can carry both or a succeeded payment can lack a receipt?",
              criteria: {
                true: "Independent status, receipt nullable, and failure_reason nullable fields.",
                false:
                  "A discriminated union: pending has no results, succeeded requires receipt, failed requires failure_reason."
              }
            }
          }
        }
      ]
    })
  )
  writeFileSync(join(repo, ".gitignore"), ".abide/\n.claude/\n.codex/\n")
  let server
  let baseURL
  if (mode === "controlled-offline") {
    server = createServer((request, response) => {
      let body = ""
      request.on("data", (chunk) => {
        body += chunk
        if (Buffer.byteLength(body) > 100_000) request.destroy()
      })
      request.on("end", () => {
        const seen = records(requests).length
        if (seen >= 8) {
          response.writeHead(429)
          response.end('{"message":"fixture request ceiling"}')
          return
        }
        let parsed
        try {
          parsed = JSON.parse(body)
        } catch {
          response.writeHead(400)
          response.end()
          return
        }
        // Judge only added lines, so a repair's deleted draft cannot keep firing.
        const additions = String(parsed.state?.diff ?? "")
          .split("\n")
          .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
          .join("\n")
        const finding = testCase !== "hapsland" && additions.includes("interface PaymentState")
        appendFileSync(
          requests,
          JSON.stringify({
            at: Date.now(),
            method: request.method,
            localEndpoint: true,
            requestBytes: Buffer.byteLength(body),
            stateKeys: Object.keys(parsed.state ?? {}).sort(),
            questionIds: Object.keys(parsed.questions ?? {}),
            initialDraftInAddedLines: additions.includes("interface PaymentState"),
            finding,
            taskCanaryPresent: body.includes(TASK_CANARY),
            sourcePresent: body.includes("PaymentState"),
            failed: testCase === "abide-unavailable"
          }) + "\n",
          { mode: 0o600 }
        )
        response.setHeader("content-type", "application/json")
        if (testCase === "abide-unavailable") {
          response.writeHead(503)
          response.end('{"message":"controlled Abide reviewer unavailable"}')
          return
        }
        response.end(
          JSON.stringify({
            model: "jev-latest",
            answers: Object.fromEntries(
              Object.keys(parsed.questions ?? {}).map((id) => [id, { type: "noul", noul: finding ? 0.99 : 0.01 }])
            ),
            usage: { input_tokens: 1, output_tokens: 1 }
          })
        )
      })
    })
    await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen))
    baseURL = `http://127.0.0.1:${server.address().port}/v1`
  }
  const abideEnv = {
    ...env,
    ABIDE_HOME_DIR: abideHome,
    TYPESAFE_AI_API_KEY: mode === "live-jev" ? env.TYPESAFE_API_KEY : "synthetic-fixture-key",
    ABIDE_DEBUG: ""
  }
  delete abideEnv.AI_GATEWAY_API_KEY
  delete abideEnv.TYPESAFE_AI_BASE_URL
  if (baseURL) abideEnv.TYPESAFE_AI_BASE_URL = baseURL
  const before = JSON.parse(readFileSync(settingsPath, "utf8"))
  const beforeCommands = Object.values(before.hooks).flatMap((groups) =>
    groups.flatMap((group) => group.hooks.map((hook) => hook.command))
  )
  const init = spawnSync(process.execPath, [bin, "init", host, ...(host === "claude" ? ["--project"] : [])], {
    cwd: repo,
    env: abideEnv,
    encoding: "utf8",
    timeout: 30_000
  })
  if (init.status !== 0) {
    await new Promise((resolveClose) => (server ? server.close(resolveClose) : resolveClose()))
    throw new Error(`Abide init failed (exit ${init.status}); output withheld`)
  }
  const installed = JSON.parse(readFileSync(settingsPath, "utf8"))
  const afterCommands = Object.values(installed.hooks).flatMap((groups) =>
    groups.flatMap((group) => group.hooks.map((hook) => hook.command))
  )
  const registration = {
    actualAbideInitExecuted: true,
    neighboringHooksPreserved: beforeCommands.every((command) => afterCommands.includes(command)),
    abideHandlersInstalled: afterCommands.filter((command) => command.includes("abide-hook.js")).length,
    executionOrder: order
  }
  const wrapper = join(temp, "observed-abide-hook.mjs")
  writeFileSync(
    wrapper,
    `import {spawnSync} from 'node:child_process';
import {appendFileSync,existsSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
const input=readFileSync(0,'utf8'), event=process.argv[2], at=Date.now();
const env={...process.env,ABIDE_HOME_DIR:${JSON.stringify(abideHome)},ABIDE_DEBUG:''};
delete env.AI_GATEWAY_API_KEY; delete env.TYPESAFE_AI_BASE_URL;
env.TYPESAFE_AI_API_KEY=${mode === "live-jev" ? "process.env.TYPESAFE_API_KEY" : JSON.stringify("synthetic-fixture-key")};
${baseURL ? `env.TYPESAFE_AI_BASE_URL=${JSON.stringify(baseURL)};` : ""}
const result=spawnSync(process.execPath,[${JSON.stringify(originalHook)},event],{input,env,encoding:'utf8',timeout:35000,maxBuffer:1048576});
let output;try{output=JSON.parse(result.stdout)}catch{}
let native;try{native=JSON.parse(input)}catch{}
const content=existsSync(${JSON.stringify(rootFile)})?readFileSync(${JSON.stringify(rootFile)},'utf8'):'';
const scan=(root)=>{let initial=false,good=false,prompt=false,promptDraft=false,originalDraft=false,files=0,bytes=0;
 const visit=(dir)=>{if(!existsSync(dir))return;for(const item of readdirSync(dir,{withFileTypes:true})){
 const path=join(dir,item.name);if(item.isDirectory())visit(path);else if(item.isFile()){
 let text;try{text=readFileSync(path,'utf8')}catch{continue} files++;bytes+=Buffer.byteLength(text);
 initial ||= text.includes(${JSON.stringify(initial.trim())}) || text.includes(${JSON.stringify(JSON.stringify(initial).slice(1, -1))});
 good ||= text.includes(${JSON.stringify(good.trim())}) || text.includes(${JSON.stringify(JSON.stringify(good).slice(1, -1))});
 prompt ||= text.includes(${JSON.stringify(TASK_CANARY)});
 if(item.name==='prompt')promptDraft ||= text.includes(${JSON.stringify(initial.trim())});
 if(dir.endsWith('/files')){let parsed;try{parsed=JSON.parse(text)}catch{} originalDraft ||= parsed?.original===${JSON.stringify(initial)};}
 }}};visit(root);return{initialSourcePresent:initial,finalSourcePresent:good,taskCanaryPresent:prompt,
 promptContainsDraft:promptDraft,originalRecordContainsDraft:originalDraft,files,bytes};};
appendFileSync(${JSON.stringify(hookLog)},JSON.stringify({event,at,doneAt:Date.now(),nativeEvent:native?.hook_event_name??null,
 exitCode:result.status,decision:output?.decision??null,finding:String(output?.reason??'').includes('payment-state-combinations'),
 initial:content===${JSON.stringify(initial)},final:content===${JSON.stringify(good)},
 disk:{abideSessions:scan(${JSON.stringify(join(abideHome, ".abide", "sessions"))}),hapslandResident:scan(${JSON.stringify(runtime)}),hapslandActivity:scan(${JSON.stringify(activity)})}})+'\\n',{mode:0o600});
if(result.stdout)process.stdout.write(result.stdout);process.exitCode=result.status??1;
`,
    { mode: 0o600 }
  )
  for (const groups of Object.values(installed.hooks)) {
    for (const group of groups)
      for (const hook of group.hooks) {
        if (!hook.command?.includes("abide-hook.js")) continue
        const event = hook.command.trim().split(/\s+/).at(-1)
        hook.command = `${quote(process.execPath)} ${quote(wrapper)} ${event}`
      }
    groups.sort((a, b) => {
      const aAbide = a.hooks.some((hook) => hook.command?.includes(wrapper))
      const bAbide = b.hooks.some((hook) => hook.command?.includes(wrapper))
      return order === "abide-first" ? Number(bAbide) - Number(aAbide) : Number(aAbide) - Number(bAbide)
    })
  }
  writeFileSync(settingsPath, JSON.stringify(installed))
  return {
    registration,
    hookLog,
    requests,
    package: {
      name: manifest.name,
      version: manifest.version,
      hookSha256: hash(readFileSync(originalHook)),
      dependencyLockSha256: hash(readFileSync(join(resolve(prefix), "package-lock.json")))
    },
    async close() {
      if (server) await new Promise((resolveClose) => server.close(resolveClose))
    },
    summary() {
      const events = records(hookLog),
        requestShapes = records(requests)
      const sessionsPersistedDraft = events.some((item) => item.disk.abideSessions.initialSourcePresent)
      const hapslandPersistedSource = events.some(
        (item) =>
          item.disk.hapslandResident.initialSourcePresent ||
          item.disk.hapslandResident.finalSourcePresent ||
          item.disk.hapslandActivity.initialSourcePresent ||
          item.disk.hapslandActivity.finalSourcePresent
      )
      const finalSource = existsSync(rootFile) ? readFileSync(rootFile, "utf8") : ""
      const objectId = spawnSync("git", ["hash-object", "--stdin"], {
        cwd: repo,
        input: finalSource,
        encoding: "utf8"
      }).stdout.trim()
      const finalSourceInGitObjectStore =
        objectId && spawnSync("git", ["cat-file", "-e", objectId], { cwd: repo }).status === 0
      return {
        registration,
        package: this.package,
        helperSha256,
        requestShapes,
        hookEvents: events.map(({ at, doneAt, ...item }) => ({ ...item, durationMs: doneAt - at })),
        checks: {
          actualAbideInitExecuted: registration.actualAbideInitExecuted,
          neighboringHooksPreserved: registration.neighboringHooksPreserved,
          fourAbideHandlersInstalled: registration.abideHandlersInstalled === 4,
          nativeAbideEditObserved: events.some((item) => item.event === "post-tool-use"),
          nativeAbideStopObserved: events.some((item) => item.event === "stop"),
          abideHandlerExitsSuccessful: events.every((item) => item.exitCode === 0),
          ...(mode === "controlled-offline"
            ? {
                abideReviewAttempted: requestShapes.length > 0,
                ...(testCase === "hapsland"
                  ? { abideQuiet: !events.some((item) => item.finding) }
                  : testCase === "abide-unavailable"
                    ? {
                        abideUnavailableObserved: requestShapes.some((item) => item.failed),
                        abideNoFindingOnFailure: !events.some((item) => item.finding)
                      }
                    : { abideFindingDelivered: events.some((item) => item.finding) })
              }
            : {})
        },
        dataObservations: {
          sessionsPersistedDraft,
          hapslandPersistedSource,
          ...(events.some((item) => typeof item.disk.abideSessions.promptContainsDraft === "boolean")
            ? {
                abideSessionPromptContainsDraft: events.some((item) => item.disk.abideSessions.promptContainsDraft),
                abideOriginalRecordContainsDraft: events.some(
                  (item) => item.disk.abideSessions.originalRecordContainsDraft
                )
              }
            : {}),
          abidePersistedTask: events.some((item) => item.disk.abideSessions.taskCanaryPresent),
          finalSourceWasInGitBeforeSession,
          finalSourceInGitObjectStore: Boolean(finalSourceInGitObjectStore),
          scope:
            "Exact synthetic source and task markers in product-owned files; no syscall trace, agent-transcript/OS audit, or universal confidentiality claim."
        }
      }
    }
  }
}
