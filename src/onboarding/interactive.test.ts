import { ConfigProvider, Effect } from "effect"
import { previewClaudeInstallation, installClaudeIntegration } from "./claude-installation.ts"
import { previewCodexInstallation, installCodexIntegration } from "./codex-installation.ts"
import { DEFAULT_CHILD_TIMEOUT_MS } from "../../scripts/test-harness/policy.mjs"
import { createInstallationPackageFixture } from "../test-support/installation-package.ts"
import { spawn } from "node:child_process"
import { execFileSync } from "../../scripts/test-harness/process.mjs"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, expect, it } from "vitest"
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-interactive-"))
  roots.push(root)
  const repository = join(root, "repo")
  mkdirSync(repository)
  execFileSync("git", ["init", "--quiet", repository])
  const environment = {
    ...process.env,
    REVIEW_INSTALL_ENTRYPOINT: createInstallationPackageFixture(root),
    HOME: root,
    TYPESAFE_API_KEY: "interactive-test-key",
    REVIEW_USER_CONFIG_PATH: join(root, "user.jsonc"),
    REVIEW_STATE_PATH: join(root, "state")
  }
  return { root, repository, environment }
}
const terminal = async (test: ReturnType<typeof fixture>, args: string[], answer: "y" | "n", selection?: string) => {
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  const command = [process.execPath, join(process.cwd(), "src/cli.ts"), ...args].map(quote).join(" ")
  const child = spawn("script", ["-qfec", command, "/dev/null"], {
    cwd: test.repository,
    env: test.environment,
    stdio: ["pipe", "pipe", "pipe"]
  })
  let output = ""
  let answered = false
  let selectionSent = false
  let confirmationsSent = 0
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString()
    if (
      selection !== undefined &&
      !selectionSent &&
      output.includes("Unchecking a client keeps its existing installation.")
    ) {
      selectionSent = true
      child.stdin.write(selection)
    }
    const confirmations = output.match(/\[y\/N\]/g)?.length ?? 0
    if (confirmations > confirmationsSent) {
      confirmationsSent = confirmations
      answered = true
      child.stdin.write(`${answer}\n`)
    }
  })
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString()
  })
  const code = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      reject(new Error(`interactive command timed out: ${output.slice(-1500)}`))
    }, DEFAULT_CHILD_TIMEOUT_MS)
    child.once("close", (code) => {
      clearTimeout(timer)
      resolve(code)
    })
    child.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
  expect(output).not.toContain("interactive-test-key")
  return { code, output, answered }
}
it.skipIf(process.platform !== "linux")("declining guided setup leaves Claude settings absent", async () => {
  const test = fixture()
  const home = join(test.root, "claude-home")
  const host = join(test.root, "claude")
  writeFileSync(host, "#!/bin/sh\nprintf '2.1.218\\n'\n", { mode: 0o700 })
  const result = await terminal(test, ["setup", "claude", `--claude-home=${home}`, `--claude-executable=${host}`], "n")
  expect(result.code).toBe(0)
  expect(existsSync(join(home, "settings.json"))).toBe(false)
})
const updaterFixture = (
  test: ReturnType<typeof fixture>,
  options: {
    failHost?: "claude" | "codex"
    failOperation?: "update-preview" | "update"
    currentHost?: "claude" | "codex"
  } = {}
) => {
  const target = join(test.root, "target")
  const requests = join(test.root, "requests.jsonl")
  writeFileSync(
    target,
    `#!/usr/bin/env node
const fs=require('node:fs');
if(process.argv.includes('--package-identity')) { console.log(JSON.stringify({name:'@hapsland/hapsland',executable:process.execPath,args:[${JSON.stringify(join(process.cwd(), "src/cli.ts"))}]})); process.exit(0); }
const r=JSON.parse(fs.readFileSync(0,'utf8'));
fs.appendFileSync(${JSON.stringify(requests)},JSON.stringify(r)+'\\n');
const options=${JSON.stringify(options)};
if(r.host===options.failHost && r.operation===options.failOperation){console.log(JSON.stringify({status:'conflict',error:{message:'owned hook conflict'}}));process.exitCode=4;}
else if(r.operation==='update-preview')console.log(JSON.stringify({status:'preview',proposal:{digest:(r.host==='claude'?'a':'b').repeat(64),changes:r.host===options.currentHost?[]:[{description:'owned hook update'}]}}));
else console.log(JSON.stringify({status:'complete'}));
`,
    { mode: 0o700 }
  )
  return { target, requests }
}

it.skipIf(process.platform !== "linux")(
  "interactive update carries the exact preview digest and selected home to the target",
  async () => {
    const test = fixture()
    const target = updaterFixture(test)
    const home = join(test.root, "claude-home")
    const result = await terminal(test, ["update", "claude", `--target=${target.target}`, `--claude-home=${home}`], "y")
    expect(result.code).toBe(0)
    const requests = readFileSync(target.requests, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(requests).toEqual([
      { version: 1, operation: "update-preview", host: "claude", claudeHome: home },
      { version: 1, operation: "update", host: "claude", claudeHome: home, proposalDigest: "a".repeat(64) }
    ])
    expect(result.output).toContain("restart claude")
  }
)
it.skipIf(process.platform !== "linux")("declining update performs only a read-only preview", async () => {
  const test = fixture()
  const target = updaterFixture(test)
  const result = await terminal(test, ["update", "codex", `--target=${target.target}`], "n")
  expect(result.code).toBe(0)
  expect(readFileSync(target.requests, "utf8").trim().split("\n")).toHaveLength(1)
})
it.skipIf(process.platform !== "linux")("guided Codex setup installs through the named client command", async () => {
  const test = fixture()
  const home = join(test.root, "codex-home")
  const host = join(test.root, "codex")
  writeFileSync(
    host,
    "#!/bin/sh\nif [ \"$1\" = features ]; then printf 'hooks stable true\\n'; exit 0; fi\nprintf 'codex-cli 0.155.1\\n'\n",
    { mode: 0o700 }
  )
  const result = await terminal(test, ["setup", "codex", `--codex-home=${home}`, `--codex-executable=${host}`], "y")
  expect(result.code).toBe(0)
  expect(result.answered).toBe(true)
  expect(readFileSync(join(home, "hooks.json"), "utf8")).toContain("--composed-host=codex-cli")
  expect(result.output).toContain("restart Codex")
})
const bothClients = (test: ReturnType<typeof fixture>) => {
  const claudeHome = join(test.root, "claude-home")
  const codexHome = join(test.root, "codex-home")
  const claudeExecutable = join(test.root, "claude")
  const codexExecutable = join(test.root, "codex")
  writeFileSync(claudeExecutable, "#!/bin/sh\nprintf '2.1.218\\n'\n", { mode: 0o700 })
  writeFileSync(
    codexExecutable,
    "#!/bin/sh\nif [ \"$1\" = features ]; then printf 'hooks stable true\\n'; exit 0; fi\nprintf 'codex-cli 0.155.1\\n'\n",
    { mode: 0o700 }
  )
  const piExecutable = join(test.root, "pi")
  writeFileSync(piExecutable, "#!/bin/sh\nprintf 'unsupported-fixture\\n'\n", { mode: 0o700 })
  return {
    claudeHome,
    codexHome,
    claudeExecutable,
    codexExecutable,
    flags: [
      `--pi-executable=${piExecutable}`,
      `--pi-home=${join(test.root, "pi-home")}`,
      `--claude-home=${claudeHome}`,
      `--claude-executable=${claudeExecutable}`,
      `--codex-home=${codexHome}`,
      `--codex-executable=${codexExecutable}`
    ]
  }
}
it.skipIf(process.platform !== "linux")(
  "bare setup selects and installs both clients with independent confirmation",
  async () => {
    const test = fixture()
    const clients = bothClients(test)
    const result = await terminal(test, ["setup", ...clients.flags], "y", " \x1b[B \r")
    expect(result.code).toBe(0)
    expect(result.output).toContain("[ ] Claude Code — not installed")
    expect(result.output).toContain("[ ] Codex CLI — not installed")
    expect(result.output.match(/Install these entries/g)).toHaveLength(2)
    expect(readFileSync(join(clients.claudeHome, "settings.json"), "utf8")).toContain("--composed-host=claude-code")
    expect(readFileSync(join(clients.codexHome, "hooks.json"), "utf8")).toContain("--composed-host=codex-cli")
  }
)
it.skipIf(process.platform !== "linux")(
  "existing clients are checked and deselecting them preserves their registrations",
  async () => {
    const test = fixture()
    const clients = bothClients(test)
    await installBothClients(test, clients)
    const claude = readFileSync(join(clients.claudeHome, "settings.json"), "utf8")
    const codex = readFileSync(join(clients.codexHome, "hooks.json"), "utf8")
    const resumed = await terminal(test, ["setup", ...clients.flags], "y", "\r")
    expect(resumed.code).toBe(0)
    expect(resumed.answered).toBe(false)
    expect(readFileSync(join(clients.claudeHome, "settings.json"), "utf8")).toBe(claude)
    expect(readFileSync(join(clients.codexHome, "hooks.json"), "utf8")).toBe(codex)
    const result = await terminal(test, ["setup", ...clients.flags], "y", " \x1b[B \r")
    expect(result.code).toBe(0)
    expect(result.output).toContain("[x] Claude Code — installed")
    expect(result.output).toContain("[x] Codex CLI — installed")
    expect(result.output).toContain("No clients selected. No changes made.")
    expect(result.answered).toBe(false)
    expect(readFileSync(join(clients.claudeHome, "settings.json"), "utf8")).toBe(claude)
    expect(readFileSync(join(clients.codexHome, "hooks.json"), "utf8")).toBe(codex)
  }
)
it.skipIf(process.platform !== "linux")("cancelling client selection writes no registrations", async () => {
  const test = fixture()
  const clients = bothClients(test)
  const result = await terminal(test, ["setup", ...clients.flags], "y", "\x1b")
  expect(result.code).toBe(0)
  expect(existsSync(join(clients.claudeHome, "settings.json"))).toBe(false)
  expect(existsSync(join(clients.codexHome, "hooks.json"))).toBe(false)
})
// Update's TTY boundary starts with installed clients; setup has its own TTY canaries.
const installBothClients = async (test: ReturnType<typeof fixture>, clients: ReturnType<typeof bothClients>) => {
  const run = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromUnknown(test.environment, { preserveEmptyStrings: true }))
        )
      )
    )
  const claudeRequest = { claudeHome: clients.claudeHome, claudeExecutable: clients.claudeExecutable }
  const claudePreview = await run(previewClaudeInstallation(claudeRequest))
  expect(claudePreview.status).toBe("preview")
  if (!("proposal" in claudePreview)) throw new Error("Claude preview has no proposal")
  expect(
    (await run(installClaudeIntegration({ ...claudeRequest, proposalDigest: claudePreview.proposal.digest }))).status
  ).toBe("complete")
  const codexRequest = { codexHome: clients.codexHome, codexExecutable: clients.codexExecutable }
  const codexPreview = await run(previewCodexInstallation(codexRequest))
  expect(codexPreview.status).toBe("preview")
  if (!("proposal" in codexPreview)) throw new Error("Codex preview has no proposal")
  expect(
    (await run(installCodexIntegration({ ...codexRequest, proposalDigest: codexPreview.proposal.digest }))).status
  ).toBe("installed")
}
const recordedRequests = (path: string) =>
  readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
it.skipIf(process.platform !== "linux")(
  "bare update previews both installed clients, then applies both exact digests after one confirmation",
  async () => {
    const test = fixture()
    const clients = bothClients(test)
    await installBothClients(test, clients)
    const target = updaterFixture(test)
    const result = await terminal(test, ["update", ...clients.flags, `--target=${target.target}`], "y")
    expect(result.code).toBe(0)
    const requests = recordedRequests(target.requests)
    expect(requests.map((r) => `${r.host}:${r.operation}`)).toEqual([
      "claude:update-preview",
      "codex:update-preview",
      "claude:update",
      "codex:update"
    ])
    expect(requests[2].proposalDigest).toBe("a".repeat(64))
    expect(requests[3].proposalDigest).toBe("b".repeat(64))
    expect(requests[2].claudeHome).toBe(clients.claudeHome)
    expect(requests[3].codexHome).toBe(clients.codexHome)
    expect(result.output.match(/\[y\/N\]/g)).toHaveLength(1)
    expect(result.output).toContain("[OK] claude update: updated.")
    expect(result.output).toContain("[OK] codex update: updated.")
  }
)
it.skipIf(process.platform !== "linux")(
  "a failed client update reports failure and still updates the other installed client",
  async () => {
    const test = fixture()
    const clients = bothClients(test)
    await installBothClients(test, clients)
    const target = updaterFixture(test, { failHost: "claude", failOperation: "update" })
    const result = await terminal(test, ["update", ...clients.flags, `--target=${target.target}`], "y")
    expect(result.code).toBe(6)
    expect(recordedRequests(target.requests).map((r) => `${r.host}:${r.operation}`)).toEqual([
      "claude:update-preview",
      "codex:update-preview",
      "claude:update",
      "codex:update"
    ])
    expect(result.output).toContain("[FAIL] claude update: failed.")
    expect(result.output).toContain("[OK] codex update: updated.")
  }
)
it.skipIf(process.platform !== "linux")("bare update acquires one target for both installed clients", async () => {
  const test = fixture()
  const clients = bothClients(test)
  await installBothClients(test, clients)
  const target = updaterFixture(test)
  const npm = join(test.root, "npm")
  const npmCalls = join(test.root, "npm-calls.jsonl")
  writeFileSync(
    npm,
    `#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(npmCalls)},JSON.stringify(args)+'\\n');
if(args[0]==='view')console.log(JSON.stringify('0.2.0'));
else if(args[0]==='install'){
 const prefix=args[args.indexOf('--prefix')+1];
 const root=path.join(prefix,'lib/node_modules/@hapsland/hapsland');fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'@hapsland/hapsland',version:'0.2.0'}));
 fs.mkdirSync(path.join(prefix,'bin'));fs.copyFileSync(${JSON.stringify(target.target)},path.join(prefix,'bin/hapsland'));
 fs.writeFileSync(path.join(prefix,'bin/hapsland-doctor'),'#!/bin/sh\\nexit 0\\n',{mode:0o700});
}
`,
    { mode: 0o700 }
  )
  const stagedTest = { ...test, environment: { ...test.environment, PATH: `${test.root}:${process.env.PATH ?? ""}` } }
  const result = await terminal(stagedTest, ["update", ...clients.flags], "y")
  expect(result.code).toBe(0)
  expect(recordedRequests(npmCalls).map((args) => args[0])).toEqual(["view", "install"])
  expect(result.output.match(/\[y\/N\]/g)).toHaveLength(1)
  expect(recordedRequests(target.requests).map((r) => `${r.host}:${r.operation}`)).toEqual([
    "claude:update-preview",
    "codex:update-preview",
    "claude:update",
    "codex:update"
  ])
})

it.skipIf(process.platform !== "linux")(
  "public setup uses the active package and cannot silently revert to the command in PATH",
  async () => {
    const test = fixture()
    const clients = bothClients(test)
    const activeRoot = join(test.root, ".local", "share", "hapsland")
    mkdirSync(activeRoot, { recursive: true })
    const entrypoint = join(test.root, "active-cli.mjs")
    const capture = join(test.root, "active-args.json")
    writeFileSync(
      entrypoint,
      `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(capture)}, JSON.stringify(process.argv.slice(2))); console.log('active package setup');`
    )
    writeFileSync(
      join(activeRoot, "active.json"),
      JSON.stringify({ version: 1, executable: process.execPath, args: [entrypoint] })
    )
    const result = await terminal(test, ["setup", "claude", ...clients.flags], "y")
    expect(result.code).toBe(0)
    expect(result.answered).toBe(false)
    expect(JSON.parse(readFileSync(capture, "utf8"))[0]).toBe("setup")
    expect(existsSync(join(clients.claudeHome, "settings.json"))).toBe(false)
  }
)
