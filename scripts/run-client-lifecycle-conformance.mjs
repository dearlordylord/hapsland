import { createHash } from "node:crypto"
import { commandHooks } from "@hapsland/runtime-environment/runtime/hook-catalog"
import { resolveBunRuntime } from "./pinned-bun.mjs"
import { standaloneEnvironment } from "./test-harness/standalone-environment.mjs"
import { offlineSetupAnswers } from "./test-harness/offline-setup-answers.mjs"
// Offline regression for the public multi-client lifecycle. Uses isolated homes and a local registry fixture.
import assert from "node:assert/strict"
import { spawn, execFileSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs"
import { dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
const checkout = process.cwd()
const archiveArgumentIndex = process.argv.indexOf("--archive")
const suppliedArchive =
  process.argv.find((argument) => argument.startsWith("--archive="))?.slice("--archive=".length) ??
  (archiveArgumentIndex < 0 ? undefined : process.argv[archiveArgumentIndex + 1])
if (archiveArgumentIndex >= 0 && (!suppliedArchive || suppliedArchive.startsWith("--")))
  throw new Error("--archive requires a local archive path")
const root = mkdtempSync(join(tmpdir(), "hapsland-lifecycle-smoke-"))
let registrySource = checkout
if (suppliedArchive !== undefined) {
  const unpacked = join(root, "reviewed-archive")
  mkdirSync(unpacked)
  execFileSync("tar", ["-xzf", resolve(suppliedArchive), "-C", unpacked])
  registrySource = join(unpacked, "package")
}
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`
const env = {
  ...process.env,
  HOME: root,
  HAPSLAND_BUILD_BUN: resolveBunRuntime().executable,
  TYPESAFE_API_KEY: "offline-fixture-key",
  REVIEW_USER_CONFIG_PATH: join(root, "review.jsonc"),
  REVIEW_STATE_PATH: join(root, "state"),
  PATH: `${root}:${standaloneEnvironment(join(root, "standalone-path")).PATH}`
}
delete env.REVIEW_INSTALL_ENTRYPOINT
delete env.REVIEW_INSTALL_RUNTIME
delete env.HAPSLAND_ACTIVE_DISPATCH
const repository = join(root, "repository")
mkdirSync(repository)
execFileSync("git", ["init", "--quiet", repository])
const claudeHome = join(root, ".claude")
const codexHome = join(root, ".codex")
writeFileSync(join(root, "claude"), "#!/bin/sh\nprintf '2.1.218\\n'\n", { mode: 0o700 })
writeFileSync(
  join(root, "codex"),
  "#!/bin/sh\nif [ \"$1\" = features ]; then printf 'hooks stable true\\n'; exit 0; fi\nprintf 'codex-cli 0.155.1\\n'\n",
  { mode: 0o700 }
)
writeFileSync(
  join(root, "npm"),
  `#!${process.execPath}
const fs=require('node:fs'); const path=require('node:path');
const args=process.argv.slice(2);
if(args[0]==='view'){process.stdout.write('"0.1.0"');process.exit(0);}
if(args[0]!=='install') throw Error('unexpected npm operation');
const prefix=args[args.indexOf('--prefix')+1]; const pkg=path.join(prefix,'lib/node_modules/@hapsland/hapsland');
fs.mkdirSync(pkg,{recursive:true}); fs.cpSync(${JSON.stringify(join(registrySource, "dist"))},path.join(pkg,'dist'),{recursive:true});
for(const name of ['package.json','package-runtime.json'])fs.copyFileSync(path.join(${JSON.stringify(registrySource)},name),path.join(pkg,name));
for(const name of ['bin','native','schemas'])fs.cpSync(path.join(${JSON.stringify(registrySource)},name),path.join(pkg,name),{recursive:true});
fs.mkdirSync(path.join(prefix,'bin'));
for(const name of ['hapsland','hapsland-hook','hapsland-doctor','hapsland-parser','hapsland-resident'])fs.symlinkSync(path.join(pkg,'bin','launch.sh'),path.join(prefix,'bin',name));
`,
  { mode: 0o700 }
)
const assertDedicatedRegistrations = (home, file, retained) => {
  const settings = JSON.parse(readFileSync(join(home, file), "utf8"))
  const definitions = Object.values(commandHooks[file === "settings.json" ? "claude" : "codex"])
  for (const event of new Set(definitions.map((definition) => definition.event))) {
    const handlers = settings.hooks?.[event]?.flatMap((group) => group.hooks ?? []) ?? []
    const expected = definitions.filter((definition) => definition.event === event)
    assert.equal(handlers.length, expected.length, `${event} registration is incomplete or duplicated`)
    for (const definition of expected) {
      const matches = handlers.filter((handler) =>
        definition.flags.every((flag) => handler.command?.split(" ").includes(flag))
      )
      assert.equal(
        matches.length,
        1,
        `${event} catalog variant is missing or duplicated: ${definition.flags.join(" ")}`
      )
      assert.equal(matches[0].timeout, definition.timeout)
      assert.equal(matches[0].async === true, definition.async === true)
    }
    for (const handler of handlers) {
      assert.equal(handler.type, "command")
      assert.equal(typeof handler.command, "string")
      assert(!handler.command.includes("/hapsland'"), `${event} targets the administrative CLI`)
      if (retained) {
        assert(handler.command.includes("/candidates/snapshot-"), `${event} escaped the retained release`)
        assert(handler.command.includes("/hapsland-hook'"), `${event} lacks the dedicated executable`)
      } else {
        assert(
          handler.command.includes("packages/hook-entry/dist/hook-main.js"),
          `${event} lacks the source hook entry`
        )
      }
    }
  }
}
const terminal = async (args, entrypoint = join(checkout, "packages/cli-entry/src/cli.ts")) => {
  const command = [...(entrypoint.endsWith(".ts") ? [process.execPath, entrypoint] : [entrypoint]), ...args]
    .map(quote)
    .join(" ")
  const child = spawn("script", ["-qfec", command, "/dev/null"], {
    env,
    cwd: repository,
    stdio: ["pipe", "pipe", "pipe"]
  })
  let output = ""
  let sent = 0
  let answered = 0
  let declinedVerifications = 0
  child.stdout.on("data", (chunk) => {
    output += chunk
    const prompts = offlineSetupAnswers(output)
    for (const prompt of prompts.slice(answered)) {
      answered++
      if (prompt.verification) declinedVerifications++
      else if (!prompt.navigation) sent++
      child.stdin.write(`${prompt.answer}\n`)
    }
  })
  child.stderr.on("data", (chunk) => {
    output += chunk
  })
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      reject(Error(output.slice(-1500)))
    }, 45000)
    child.on("error", reject)
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
  assert(!output.includes("offline-fixture-key"))
  if (declinedVerifications > 0) assert(output.includes("Key validity: not checked for this request."))
  return { code, output, confirmations: sent, declinedVerifications }
}
try {
  for (const host of ["claude", "codex"]) {
    const initial = await terminal(["setup", host])
    assert.equal(initial.code, 0, `${host} source setup: ${initial.output}`)
    assert.equal(initial.declinedVerifications, 1, initial.output)
  }
  const originalClaude = readFileSync(join(claudeHome, "settings.json"), "utf8")
  assert(originalClaude.includes(join(checkout, "packages/hook-entry/dist/hook-main.js")))
  assertDedicatedRegistrations(claudeHome, "settings.json", false)
  assertDedicatedRegistrations(codexHome, "hooks.json", false)
  env.REVIEW_INSTALL_FAIL_AFTER_WRITES = "1"
  const interrupted = await terminal(["update", "codex"])
  assert.notEqual(interrupted.code, 0, interrupted.output)
  assert(interrupted.output.includes("hapsland repair codex"), interrupted.output)
  delete env.REVIEW_INSTALL_FAIL_AFTER_WRITES
  const resumed = await terminal(["repair", "codex"])
  assert.equal(resumed.code, 0, resumed.output)
  const update = await terminal(["update"])
  assert.equal(update.code, 0, update.output)
  assert.equal(update.confirmations, 1)
  const updatedClaude = readFileSync(join(claudeHome, "settings.json"), "utf8")
  assert.notEqual(updatedClaude, originalClaude)
  assertDedicatedRegistrations(claudeHome, "settings.json", true)
  assertDedicatedRegistrations(codexHome, "hooks.json", true)
  const active = JSON.parse(readFileSync(join(root, ".local/share/hapsland/active.json"), "utf8"))
  assert(active.executable.includes("/candidates/snapshot-"))
  assert.deepEqual(active.args, [])
  const retainedHook = join(dirname(active.executable), "hapsland-hook")
  const hookBackup = join(root, "retained-hook-backup")
  cpSync(retainedHook, hookBackup)
  rmSync(retainedHook)
  try {
    const damagedDoctor = await terminal(["doctor", "codex"])
    assert(damagedDoctor.output.includes("not-ready"), damagedDoctor.output)
    assert(
      damagedDoctor.output.includes("missing") || damagedDoctor.output.includes("unavailable"),
      damagedDoctor.output
    )
    assert(damagedDoctor.output.includes("hapsland-hook"), damagedDoctor.output)
    const registrationsBefore = readFileSync(join(codexHome, "hooks.json"), "utf8")
    const damagedRepair = await terminal(["repair", "codex"])
    assert.notEqual(damagedRepair.code, 0, damagedRepair.output)
    assert.equal(readFileSync(join(codexHome, "hooks.json"), "utf8"), registrationsBefore)
  } finally {
    cpSync(hookBackup, retainedHook)
  }
  const restoredDoctor = await terminal(["doctor", "codex"])
  assert(restoredDoctor.output.includes("configuration-ownership: ready"), restoredDoctor.output)
  assert(!restoredDoctor.output.includes("not-ready"), restoredDoctor.output)
  const repeated = await terminal(["update"])
  assert.equal(repeated.code, 0, repeated.output)
  assert.equal(repeated.confirmations, 0)
  assert(repeated.output.includes("claude update: already current"), repeated.output)
  assert(repeated.output.includes("codex update: already current"), repeated.output)
  assert.equal(
    readdirSync(join(root, ".local/share/hapsland/candidates")).filter((name) => name.startsWith("snapshot-")).length,
    1
  )
  const setup = await terminal(["setup", "claude"])
  assert.equal(setup.code, 0, setup.output)
  assert.equal(setup.confirmations, 0)
  assert.equal(setup.declinedVerifications, 1)
  assert.equal(readFileSync(join(claudeHome, "settings.json"), "utf8"), updatedClaude)
  const doctor = await terminal(["doctor"])
  assert(doctor.output.includes("configuration-ownership: ready"), doctor.output)
  assert(!doctor.output.includes("installation damaged"), doctor.output)
  for (const [home, file] of [
    [claudeHome, "settings.json"],
    [codexHome, "hooks.json"]
  ]) {
    const path = join(home, file)
    const settings = JSON.parse(readFileSync(path, "utf8"))
    delete settings.hooks.Stop
    settings.userSetting = "preserved"
    writeFileSync(path, JSON.stringify(settings))
  }
  const repair = await terminal(["repair"])
  assert.equal(repair.code, 0, repair.output)
  for (const [home, file] of [
    [claudeHome, "settings.json"],
    [codexHome, "hooks.json"]
  ]) {
    const value = JSON.parse(readFileSync(join(home, file), "utf8"))
    assert.equal(value.userSetting, "preserved")
    assert.equal(value.hooks.Stop.length, 1)
    assertDedicatedRegistrations(home, file, true)
  }
  rmSync(active.executable)
  const fallback = await terminal(["reinstall"])
  assert.equal(fallback.code, 0, fallback.output)
  assert(fallback.output.includes("reinstalling from the package in PATH"), fallback.output)
  const fallbackActive = JSON.parse(readFileSync(join(root, ".local/share/hapsland/active.json"), "utf8"))
  assert.deepEqual(fallbackActive.args, [join(checkout, "packages/cli-entry/dist/cli.js")])
  assert.equal(fallbackActive.executable, realpathSync(env.HAPSLAND_BUILD_BUN))
  for (const [home, file] of [
    [claudeHome, "settings.json"],
    [codexHome, "hooks.json"]
  ])
    assert.equal(JSON.parse(readFileSync(join(home, file), "utf8")).userSetting, "preserved")
  const removal = await terminal(["uninstall"])
  assert.equal(removal.code, 0, removal.output)
  // Restore the deliberately removed retained CLI for the independent Pi workflow.
  const standaloneCli = join(registrySource, "dist/bin", `${process.platform}-${process.arch}`, "hapsland")
  cpSync(standaloneCli, active.executable)
  // The Pi lifecycle runs the built package CLI, preserving an isolated custom profile.
  const piHome = join(root, "pi-custom")
  const pi = join(root, "pi-selected")
  writeFileSync(pi, "#!/bin/sh\nprintf '1.0.0\\n'\n", { mode: 0o700 })
  mkdirSync(join(piHome, "extensions"), { recursive: true })
  const piSettings = '{"model":"gpt-6-luna","provider":"fixture","extensions":["unrelated"]}'
  writeFileSync(join(piHome, "settings.json"), piSettings)
  writeFileSync(join(piHome, "extensions/other.ts"), "preserved unrelated extension")
  env.HAPSLAND_ACTIVE_DISPATCH = "1"
  const piFlags = [`--pi-home=${piHome}`, `--pi-executable=${pi}`]
  const piRun = (args) => terminal([...args, ...piFlags], standaloneCli)
  const piSetup = await piRun(["setup", "pi"])
  assert.equal(piSetup.code, 0, piSetup.output)
  assert.equal(piSetup.confirmations, 1)
  assert.equal(piSetup.declinedVerifications, 1)
  const piExtension = join(piHome, "extensions/hapsland.ts")
  const firstPi = readFileSync(piExtension, "utf8")
  assert(firstPi.includes("/dist/pi/extension.js"))
  const piRepeated = await piRun(["setup", "pi"])
  assert.equal(piRepeated.code, 0, piRepeated.output)
  assert.equal(piRepeated.confirmations, 0)
  assert.equal(piRepeated.declinedVerifications, 1)
  const piDoctor = await piRun(["doctor", "pi"])
  assert.equal(piDoctor.code, 0, piDoctor.output)
  assert(piDoctor.output.includes("review-support: unknown"), piDoctor.output)
  assert.equal(readFileSync(piExtension, "utf8"), firstPi)
  const piUpdate = await piRun(["update", "pi"])
  assert.equal(piUpdate.code, 0, piUpdate.output)
  const updatedPi = readFileSync(piExtension, "utf8")
  assert(updatedPi.includes("/candidates/"))
  const piUpdateAgain = await piRun(["update", "pi"])
  assert.equal(piUpdateAgain.code, 0, piUpdateAgain.output)
  assert.equal(piUpdateAgain.confirmations, 0)
  rmSync(piExtension)
  const piRepair = await piRun(["repair", "pi"])
  assert.equal(piRepair.code, 0, piRepair.output)
  const piReinstall = await piRun(["reinstall", "pi"])
  assert.equal(piReinstall.code, 0, piReinstall.output)
  assert(readFileSync(piExtension, "utf8").includes("/dist/pi/extension.js"))
  writeFileSync(piExtension, "local edit")
  const piConflict = await piRun(["uninstall", "pi"])
  assert.notEqual(piConflict.code, 0, piConflict.output)
  assert.equal(readFileSync(piExtension, "utf8"), "local edit")
  writeFileSync(piExtension, firstPi)
  const piRemoval = await piRun(["uninstall", "pi"])
  assert.equal(piRemoval.code, 0, piRemoval.output)
  assert(!existsSync(piExtension))
  const piRemovalAgain = await piRun(["uninstall", "pi"])
  assert.equal(piRemovalAgain.code, 0, piRemovalAgain.output)
  assert.equal(piRemovalAgain.confirmations, 0)
  assert.equal(readFileSync(join(piHome, "settings.json"), "utf8"), piSettings)
  assert.equal(readFileSync(join(piHome, "extensions/other.ts"), "utf8"), "preserved unrelated extension")
  console.log(
    JSON.stringify({
      version: 1,
      operation: "client-lifecycle-conformance",
      status: "passed",
      archiveSha256:
        suppliedArchive === undefined
          ? null
          : createHash("sha256")
              .update(readFileSync(resolve(suppliedArchive)))
              .digest("hex"),
      operatingSystem: process.platform,
      architecture: process.arch,
      cliSha256: createHash("sha256").update(readFileSync(standaloneCli)).digest("hex"),
      hookSha256: createHash("sha256")
        .update(readFileSync(join(dirname(standaloneCli), "hapsland-hook")))
        .digest("hex"),
      catalogRegistrations: "claude-codex-all-maintained-events-and-variants",
      missingHookDiagnostics: "actionable-refusal-without-registration-mutation",
      nativeAgentExecution: "not-exercised-offline-fixtures"
    })
  )
  console.log(
    "PASS: ordinary registry update twice, one snapshot, no repeated approval, active CLI dispatch, no setup rollback, partial update resumed through public repair, both-client doctor/repair/reinstall/uninstall, missing active-package recovery; Pi custom-profile standalone/retained package setup/update/doctor/repair/reinstall/uninstall, repeat idempotency, modified-owned conflict and unrelated settings/extensions preserved; offline fixtures only."
  )
} finally {
  rmSync(root, { recursive: true, force: true })
}
