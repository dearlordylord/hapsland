import { installedResidentUpdateJourney } from "./test-support/installed-resident-update.mjs"
import { createHash } from "node:crypto"
import { zstdDecompressSync } from "node:zlib"
import { terminalModesEquivalent } from "@hapsland/administration/credentials/terminal"
import { commandHooks } from "@hapsland/runtime-environment/runtime/hook-catalog"
import { isDeepStrictEqual } from "node:util"
import { standaloneEnvironment } from "./test-harness/standalone-environment.mjs"
import { preparePackageInstall } from "./test-harness/package-install.mjs"
import { spawn } from "node:child_process"
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const archiveArgumentIndex = process.argv.indexOf("--archive")
const suppliedArchive =
  process.argv.find((argument) => argument.startsWith("--archive="))?.slice("--archive=".length) ??
  (archiveArgumentIndex < 0 ? undefined : process.argv[archiveArgumentIndex + 1])
if (archiveArgumentIndex >= 0 && (!suppliedArchive || suppliedArchive.startsWith("--")))
  throw new Error("--archive requires a local archive path")
const developmentCheckout = process.argv
  .find((argument) => argument.startsWith("--development-checkout="))
  ?.slice("--development-checkout=".length)
const selectedProfile = process.argv.find((argument) => argument.startsWith("--profile="))?.slice("--profile=".length)
if (selectedProfile !== undefined && !["linux-arm64", "darwin-arm64"].includes(selectedProfile))
  throw new Error("--profile requires linux-arm64 or darwin-arm64")
const archiveProfiles = selectedProfile === undefined ? ["linux-arm64", "darwin-arm64"] : [selectedProfile]
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const run = (command, args, options = {}) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"]
    })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 120_000)
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.once("error", rejectRun)
    child.once("close", (code, signal) => {
      clearTimeout(timer)
      resolveRun({ code, signal, stdout, stderr })
    })
    if (options.input !== undefined) child.stdin.end(options.input)
  })

const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}
const parse = (result, label, expectedExit) => {
  expect(result.code === expectedExit, `${label} exited ${result.code}: ${result.stderr || result.stdout}`)
  try {
    return JSON.parse(result.stdout)
  } catch {
    throw new Error(`${label} did not return versioned JSON: ${result.stdout}`)
  }
}
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`
const actionDigest = (output, code, field) =>
  output.actions.find((action) => action.code === code)?.authorization?.[field]
const assertNoProviderCall = async (capturePath) => {
  try {
    const contents = await readFile(capturePath, "utf8")
    throw new Error(`setup unexpectedly performed provider work: ${contents.length} captured bytes`)
  } catch (cause) {
    if (cause?.code !== "ENOENT") throw cause
  }
}
const invokeSetup = async (cli, cwd, env, request, expectedExit, label) => {
  const result = await run(cli, ["--setup"], { cwd, env, input: JSON.stringify(request), timeoutMs: 20_000 })
  const output = parse(result, label, expectedExit)
  expect(output.version === 1 && output.operation === "setup", `${label} did not use setup-v1`)
  expect(output.providerCalls === 0 && output.paidVerificationPerformed === false, `${label} claimed provider work`)
  return output
}
const invokeDemo = async (cli, cwd, env, request, expectedExit, label) => {
  const result = await run(cli, ["--demo"], { cwd, env, input: JSON.stringify(request), timeoutMs: 20_000 })
  const output = parse(result, label, expectedExit)
  expect(output.version === 1 && output.operation === "demo", `${label} did not use demo-v1`)
  return output
}

// Observe the installed command's cleanup before the enclosing PTY exits.
// Preserve its exit status so the existing journey assertions remain independent.
const observeTerminalModes = (command) =>
  `trap 'true' INT; before=$(stty -g < /dev/tty) || exit 98; ${command}; code=$?; after=$(stty -g < /dev/tty) || exit 99; printf '\\nMODEBEFORE:%s\\nMODEAFTER:%s\\nEXIT:%s\\n' "$before" "$after" "$code"; exit "$code"`
const expectRestoredTerminal = (output, expectedExit) => {
  const modes = /MODEBEFORE:([^\r\n]+)\r?\nMODEAFTER:([^\r\n]+)\r?\nEXIT:(\d+)/.exec(output)
  expect(modes !== null, "installed terminal command omitted its before/after mode observation")
  expect(
    terminalModesEquivalent(process.platform, modes[1], modes[2]),
    "installed terminal command changed terminal settings"
  )
  expect(Number(modes[3]) === expectedExit, "terminal observation disagreed with the installed command exit")
}

const runMaskedSetup = (cli, cwd, env, requestPath, marker) =>
  new Promise((resolveRun, rejectRun) => {
    const command = observeTerminalModes(`${quote(cli)} --setup < ${quote(requestPath)}`)
    const terminal =
      process.platform === "darwin"
        ? ["python3", [join(projectRoot, "scripts/pty-bridge.py"), "/bin/sh", "-c", command]]
        : ["script", ["-qefc", command, "/dev/null"]]
    const child = spawn(terminal[0], terminal[1], { cwd, env, stdio: ["pipe", "pipe", "pipe"] })
    let output = ""
    let supplied = false
    let selected = false
    let approved = false
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      rejectRun(new Error(`masked packaged setup timed out: ${output}`))
    }, 10_000)
    const observe = (chunk) => {
      output += chunk
      if (!selected && output.includes("Where should Hapsland save your Jev key?")) {
        selected = true
        child.stdin.write("\n")
      }
      if (!approved && output.includes("Save this key? [y/N]")) {
        approved = true
        child.stdin.write("y\n")
      }
      if (!supplied && output.includes("Jev API key:")) {
        supplied = true
        child.stdin.write(`${marker}\n`)
      }
    }
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", observe)
    child.stderr.on("data", observe)
    child.once("error", (cause) => {
      clearTimeout(timer)
      rejectRun(cause)
    })
    child.once("close", (code) => {
      clearTimeout(timer)
      try {
        const expectedExit = 6
        expect(code === expectedExit, `masked packaged setup exited ${code}: ${output}`)
        expectRestoredTerminal(output, expectedExit)
        expect(supplied, "masked packaged setup never requested terminal input")
        expect(!output.includes(marker), "masked packaged setup echoed the credential")
        const encoded = output.split(/\r?\n/).find((line) => line.startsWith('{"version":1,"operation":"setup"'))
        expect(encoded !== undefined, `masked packaged setup omitted JSON: ${output}`)
        resolveRun(JSON.parse(encoded))
      } catch (cause) {
        rejectRun(cause)
      }
    })
  })

const runGuidedPilot = (
  cli,
  cwd,
  env,
  codexHome,
  codexExecutable,
  answers,
  commandOverride,
  expectedExit = 0,
  timeoutMs = 20_000
) =>
  new Promise((resolveRun, rejectRun) => {
    const callSite = new Error("terminal fixture invocation").stack
    const command = observeTerminalModes(
      commandOverride ??
        `${quote(cli)} setup codex --codex-home=${quote(codexHome)} --codex-executable=${quote(codexExecutable)}`
    )
    const terminal =
      process.platform === "darwin"
        ? ["python3", [join(projectRoot, "scripts/pty-bridge.py"), "/bin/sh", "-c", command]]
        : ["script", ["-qefc", command, "/dev/null"]]
    const child = spawn(terminal[0], terminal[1], {
      cwd,
      env,
      detached: timeoutMs > 20_000,
      stdio: ["pipe", "pipe", "pipe"]
    })
    let output = ""
    let answered = 0
    let timedOut = false
    let escalation
    const timer = setTimeout(() => {
      timedOut = true
      if (timeoutMs > 20_000) {
        // The macOS PTY bridge forwards SIGTERM to its controlling session.
        process.kill(-child.pid, "SIGTERM")
        escalation = setTimeout(() => {
          try {
            process.kill(-child.pid, "SIGKILL")
          } catch {}
        }, 5_000)
      } else child.kill("SIGKILL")
    }, timeoutMs)
    const observe = (chunk) => {
      output += chunk
      while (answered < answers.length && output.includes(answers[answered].prompt)) {
        child.stdin.write(answers[answered].raw ?? `${answers[answered].value}\n`)
        answered += 1
      }
    }
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", observe)
    child.stderr.on("data", observe)
    child.once("error", (cause) => {
      clearTimeout(timer)
      clearTimeout(escalation)
      rejectRun(cause)
    })
    child.once("close", (code) => {
      clearTimeout(timer)
      clearTimeout(escalation)
      try {
        expect(!timedOut, "guided pilot timed out")
        const diagnostic = answers.reduce(
          (text, answer) =>
            typeof answer.value === "string" && answer.value.length > 3
              ? text.replaceAll(answer.value, "[fixture input]")
              : text,
          output.slice(-6000)
        )
        expect(
          code === expectedExit,
          `terminal command exited ${code} instead of ${expectedExit}; answered ${answered}/${answers.length}; ${callSite}: ${diagnostic}`
        )
        expectRestoredTerminal(output, expectedExit)
        expect(answered === answers.length, `guided pilot answered ${answered} of ${answers.length} prompts`)
        resolveRun(output)
      } catch (cause) {
        rejectRun(cause)
      }
    })
  })

// Observe the real profile without changing it; every journey must use fixture HOME.
// Exercise update selection through installed public commands and actual IPC.

const outsideActivePath = join(homedir(), ".local", "share", "hapsland", "active.json")
const readOptional = async (path) => {
  try {
    return await readFile(path, "utf8")
  } catch (cause) {
    if (cause?.code === "ENOENT") return undefined
    throw cause
  }
}
const outsideActiveBefore = await readOptional(outsideActivePath)
const temporary = await realpath(await mkdtemp(join(tmpdir(), "review-setup-package-")))
try {
  const artifacts = join(temporary, "artifacts")
  const installation = join(temporary, "installation")
  const repository = join(temporary, "repository")
  const codexHome = join(temporary, "codex-home")
  const stateRoot = join(temporary, "state")
  const publicHome = join(temporary, "home")
  const capturePath = join(stateRoot, "provider-calls.jsonl")
  await mkdir(artifacts, { recursive: true })
  await mkdir(installation, { recursive: true })
  await mkdir(repository, { recursive: true })
  await mkdir(codexHome, { recursive: true })
  await mkdir(stateRoot, { recursive: true })
  await mkdir(publicHome, { recursive: true })

  let result
  if (suppliedArchive !== undefined) {
    await copyFile(resolve(suppliedArchive), join(artifacts, "reviewed-local.tgz"))
  } else {
    result = await run("npm", ["pack", "--pack-destination", artifacts], { cwd: projectRoot, timeoutMs: 120_000 })
    expect(result.code === 0, `npm pack failed: ${result.stderr || result.stdout}`)
  }
  const artifact = (await readdir(artifacts)).find((entry) => entry.endsWith(".tgz"))
  expect(artifact !== undefined, "npm pack did not produce a tarball")
  const archiveContents = await run("tar", ["-tzf", join(artifacts, artifact)], { cwd: temporary })
  expect(archiveContents.code === 0, "packed archive could not be listed")
  expect(
    !archiveContents.stdout.split("\n").some((entry) => entry.startsWith("package/dist/native/")),
    "packed archive contains a build-machine native helper"
  )
  expect(
    archiveContents.stdout.includes(
      `package/native/prebuilt/${process.platform}-${process.arch}/credential-secret-service`
    ),
    "packed archive lacks the selected platform's credential helper"
  )
  for (const profile of archiveProfiles) {
    for (const role of ["hapsland", "hapsland-hook", "hapsland-doctor", "hapsland-parser", "hapsland-resident"]) {
      expect(
        archiveContents.stdout.includes(`package/dist/bin/${profile}/${role}\n`),
        `packed archive lacks standalone ${profile}/${role}`
      )
    }
  }
  const packedManifest = await run("tar", ["-xOf", join(artifacts, artifact), "package/package.json"], {
    cwd: temporary
  })
  expect(
    packedManifest.code === 0 && !Object.hasOwn(JSON.parse(packedManifest.stdout).scripts ?? {}, "postinstall"),
    "packed archive still depends on a postinstall script"
  )
  const installer = await preparePackageInstall(installation, join(artifacts, artifact))
  result = await run(installer.executable, installer.args, { cwd: temporary, timeoutMs: 120_000 })
  expect(result.code === 0, `packed install failed: ${result.stderr || result.stdout}`)
  const cli = join(installation, "node_modules", ".bin", "hapsland")

  result = await run("git", ["init", "--quiet", repository], { cwd: temporary })
  expect(result.code === 0, `fixture repository initialization failed: ${result.stderr}`)
  const codexExecutable = join(temporary, "codex")
  await writeFile(
    codexExecutable,
    "#!/bin/sh\nif [ \"$1\" = features ]; then printf 'hooks stable true\\n'; exit 0; fi\nprintf 'codex-cli 0.155.1\\n'\n",
    { mode: 0o700 }
  )
  await chmod(codexExecutable, 0o700)
  const baseRequest = {
    version: 1,
    operation: "setup",
    host: "codex",
    scope: { cwd: repository, review: "enabled" },
    credential: "environment",
    codexHome,
    codexExecutable
  }
  const baseEnvironment = {
    ...standaloneEnvironment(join(temporary, "standalone-path")),
    HOME: publicHome,
    XDG_CONFIG_HOME: join(publicHome, ".config"),
    XDG_STATE_HOME: join(publicHome, ".local", "state"),
    REVIEW_STATE_PATH: join(stateRoot, "consent"),
    REVIEW_RESIDENT_DIR: join(temporary, "resident"),
    REVIEW_USER_CONFIG_PATH: join(stateRoot, "user.jsonc"),
    REVIEW_CREDENTIAL_STATE_PATH: join(stateRoot, "credential-state.json"),
    REVIEW_CONTROL_JSON: JSON.stringify({ capturePath })
  }
  for (const name of ["TYPESAFE_API_KEY", "OPENAI_API_KEY"]) delete baseEnvironment[name]

  const foreignHelper = join(temporary, "foreign-credential-helper")
  await writeFile(foreignHelper, Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x00, 0x00, 0x00, 0x00]), { mode: 0o700 })
  await chmod(foreignHelper, 0o700)
  const unavailableHelper = await invokeSetup(
    cli,
    repository,
    { ...baseEnvironment, REVIEW_CREDENTIAL_HELPER: foreignHelper },
    baseRequest,
    6,
    "foreign native credential helper"
  )
  expect(
    unavailableHelper.stages.some((entry) => entry.stage === "credential" && entry.status === "pending"),
    "unexecutable credential helper did not produce a bounded setup result"
  )

  const handoff = await invokeSetup(cli, repository, baseEnvironment, baseRequest, 6, "noninteractive handoff")
  expect(handoff.status === "needs-user-action", "missing secret or installation approval did not need user action")
  expect(
    handoff.actions.some((action) => action.code === "provide-credential"),
    "missing secret handoff was absent"
  )
  expect(handoff.actions.length <= 4, "noninteractive handoff was unbounded")
  const installationProposal = handoff.stages.find((stage) => stage.stage === "installation")?.observed?.proposal
  expect(
    Array.isArray(installationProposal?.changes) &&
      installationProposal.changes.every(
        (change) =>
          typeof change.file === "string" &&
          typeof change.beforeDigest === "string" &&
          typeof change.afterDigest === "string"
      ),
    "setup omitted exact installation paths or before/after digests"
  )
  expect(
    Array.isArray(installationProposal?.ownedChanges?.runtime?.args) &&
      installationProposal.ownedChanges.runtime.args.length === 0 &&
      typeof installationProposal?.ownedChanges?.runtime?.executable === "string" &&
      typeof installationProposal?.ownedChanges?.hook?.matcher === "string" &&
      typeof installationProposal?.ownedChanges?.hook?.handlers?.[0]?.command === "string" &&
      typeof installationProposal?.ownedChanges?.hook?.handlers?.[0]?.timeout === "number" &&
      typeof installationProposal?.ownedChanges?.ownership?.file === "string",
    "setup omitted exact owned runtime, hook, or ownership changes"
  )
  const installProposalDigest = actionDigest(handoff, "approve-installation", "installProposalDigest")
  expect(typeof installProposalDigest === "string", "installation approval was absent")

  const rulesProposalDigest = actionDigest(handoff, "approve-default-rules", "rulesProposalDigest")
  expect(typeof rulesProposalDigest === "string", "editable defaults approval was absent")
  const authorizedRequest = { ...baseRequest, installProposalDigest, rulesProposalDigest }
  const authorizedEnvironment = { ...baseEnvironment, TYPESAFE_API_KEY: "package-setup-environment-secret" }
  const interrupted = await invokeSetup(
    cli,
    repository,
    { ...authorizedEnvironment, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    authorizedRequest,
    5,
    "interrupted setup"
  )
  expect(interrupted.status === "partial", "interrupted setup did not expose partial completion")
  expect(
    actionDigest(interrupted, "resume-installation", "installProposalDigest") === installProposalDigest,
    "resume changed the approved installation digest"
  )

  const resumed = await invokeSetup(cli, repository, authorizedEnvironment, authorizedRequest, 6, "resumed setup")
  expect(
    resumed.stages.some((stage) => stage.stage === "installation" && stage.status === "complete"),
    "installation did not resume"
  )
  expect(
    resumed.stages.some((stage) => stage.stage === "repository" && stage.status === "complete"),
    "file settings were not loaded"
  )
  const shippedDirectory = join(installation, "node_modules/@hapsland/hapsland/dist/rules/defaults")
  const filenames = (await readdir(shippedDirectory)).filter((name) => name.endsWith(".json")).sort()
  expect(filenames.length === 7, "installed package must contain seven individual default rules")
  const editablePaths = filenames.map((name) => join(stateRoot, "rules/defaults", name))
  for (const [index, filename] of filenames.entries()) {
    const shippedDocument = JSON.parse(await readFile(join(shippedDirectory, filename), "utf8"))
    const editableDocument = JSON.parse(await readFile(editablePaths[index], "utf8"))
    expect(
      shippedDocument.version === 1 && shippedDocument.id === filename.slice(0, -5),
      "installed rule asset is malformed"
    )
    expect(isDeepStrictEqual(editableDocument, shippedDocument), "materialized default disagrees with installed asset")
  }
  const inventory = parse(
    await run(cli, ["rules", "list", "--json"], { cwd: repository, env: authorizedEnvironment }),
    "installed rule inventory",
    0
  )
  expect(
    inventory.enabledCount === 7 && inventory.rules.every((rule) => editablePaths.includes(rule.source)),
    "installed rules did not use editable source paths"
  )
  const editablePath = editablePaths[0]
  const editableDocument = JSON.parse(await readFile(editablePath, "utf8"))
  editableDocument.question = "Is the installed edited concern present?"
  await writeFile(editablePath, JSON.stringify(editableDocument))
  const detail = parse(
    await run(cli, ["rules", "show", "--id", editableDocument.id, "--json"], {
      cwd: repository,
      env: authorizedEnvironment
    }),
    "installed edited rule",
    0
  )
  expect(
    detail.question === "Is the installed edited concern present?",
    "installed loader ignored the edited JSON question"
  )
  const repeated = await invokeSetup(
    cli,
    repository,
    authorizedEnvironment,
    { ...baseRequest, installProposalDigest },
    6,
    "repeated setup"
  )
  expect(
    !JSON.stringify([interrupted, resumed, repeated]).includes("package-setup-environment-secret"),
    "setup disclosed the environment credential"
  )
  expect(
    repeated.stages.some((stage) => stage.stage === "installation" && stage.summary.includes("already installed")),
    "repeat setup did not reuse installation"
  )
  expect(
    repeated.stages.some((stage) => stage.stage === "repository" && stage.summary.includes("file settings loaded")),
    "repeat setup did not reload file settings"
  )
  const hooks = JSON.parse(await readFile(join(codexHome, "hooks.json"), "utf8"))
  expect(hooks.hooks.PostToolUse.length === 1, "repeat setup duplicated the owned hook")
  expect(
    (await readFile(join(codexHome, ".hapsland/codex-hook-launcher.sh"), "utf8")).includes("/hapsland-hook"),
    "scoped launcher did not select the dedicated hook executable"
  )
  const definitions = Object.values(commandHooks.codex)
  for (const event of new Set(definitions.map((definition) => definition.event))) {
    const handlers = hooks.hooks[event]?.flatMap((group) => group.hooks ?? []) ?? []
    expect(
      handlers.length === definitions.filter((definition) => definition.event === event).length,
      `installed Codex ${event} registration is incomplete or duplicated`
    )
    expect(
      handlers.every(
        (handler) =>
          typeof handler.command === "string" &&
          handler.command.includes("/codex-hook-launcher.sh'") &&
          !handler.command.includes("/hapsland'")
      ),
      `installed Codex ${event} did not target the scoped hook launcher`
    )
    for (const definition of definitions.filter((definition) => definition.event === event)) {
      const matches = handlers.filter((handler) =>
        definition.flags.every((flag) => handler.command.split(" ").includes(flag))
      )
      expect(
        matches.length === 1 &&
          matches[0].timeout === definition.timeout &&
          (matches[0].async === true) === (definition.async === true),
        `installed Codex ${event} catalog variant is missing, duplicated or changed: ${definition.flags.join(" ")}`
      )
    }
  }
  expect(
    JSON.parse(await readFile(editablePath, "utf8")).question === "Is the installed edited concern present?",
    "repeat setup overwrote authored JSON"
  )

  const demoPreview = await invokeDemo(
    cli,
    repository,
    { ...authorizedEnvironment, REVIEW_DEMO_STATE_PATH: join(stateRoot, "demos") },
    { version: 1, operation: "demo", selection: "preview", codexHome, codexExecutable },
    0,
    "offline first-review demo preview"
  )
  expect(
    demoPreview.status === "preview" &&
      demoPreview.liveSelected === false &&
      demoPreview.paidVerificationPerformed === false,
    "demo preview was not offline"
  )
  expect(
    demoPreview.demo?.syntheticOnly === true &&
      demoPreview.demo.disposableRoot !== repository &&
      demoPreview.demo.disclosure?.deliberatelyFlawed === true &&
      demoPreview.demo.disclosure?.repairPrescribed === false &&
      typeof demoPreview.demo.disclosure?.source === "string",
    "demo did not disclose its separate synthetic input"
  )
  expect(
    demoPreview.budget?.sourceBytes === 4_096 &&
      demoPreview.budget?.providerCalls === 2 &&
      demoPreview.budget?.timeMs === 180_000,
    "demo preview changed its declared budgets"
  )
  const mismatchedDemo = await invokeDemo(
    cli,
    repository,
    { ...authorizedEnvironment, REVIEW_DEMO_STATE_PATH: join(stateRoot, "demos") },
    {
      version: 1,
      operation: "demo",
      selection: "live",
      demoId: demoPreview.demo.id,
      selectionDigest: "0".repeat(64),
      codexHome,
      codexExecutable
    },
    4,
    "mismatched disposable-root selection"
  )
  expect(
    mismatchedDemo.status === "proposal-mismatch" &&
      mismatchedDemo.providerCalls === 0 &&
      mismatchedDemo.paidVerificationPerformed === false,
    "mismatched demo selection crossed the live boundary"
  )
  const cancelledDemo = await invokeDemo(
    cli,
    repository,
    { ...authorizedEnvironment, REVIEW_DEMO_STATE_PATH: join(stateRoot, "demos") },
    { version: 1, operation: "demo", selection: "cancel", demoId: demoPreview.demo.id },
    0,
    "cancelled first-review demo"
  )
  expect(
    cancelledDemo.status === "cleaned" && cancelledDemo.cleaned === true && cancelledDemo.providerCalls === 0,
    "cancelled demo did not clean up offline"
  )
  await access(demoPreview.demo.disposableRoot).then(
    () => {
      throw new Error("cancelled demo retained its disposable root")
    },
    () => undefined
  )
  await writeFile(join(stateRoot, "user.jsonc"), JSON.stringify({ version: 1, excludes: ["**/*"] }))

  const partialHome = join(temporary, "partial-codex-home")
  await mkdir(partialHome, { recursive: true })
  const partialDisabledRequest = {
    ...baseRequest,
    scope: { cwd: repository, review: "disabled" },
    credential: "skip",
    codexHome: partialHome
  }
  const partialPreview = await invokeSetup(
    cli,
    repository,
    authorizedEnvironment,
    partialDisabledRequest,
    6,
    "partial-disable preview"
  )
  const partialDigest = actionDigest(partialPreview, "approve-installation", "installProposalDigest")
  expect(typeof partialDigest === "string", "partial-disable preview omitted installation approval")
  const partialDisabled = await invokeSetup(
    cli,
    repository,
    { ...authorizedEnvironment, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    { ...partialDisabledRequest, installProposalDigest: partialDigest },
    5,
    "partial installation disable"
  )
  expect(
    partialDisabled.stages.some((stage) => stage.stage === "installation" && stage.status === "partial"),
    "partial installation was not reported"
  )
  expect(
    partialDisabled.stages.some((stage) => stage.stage === "repository" && stage.status === "complete"),
    "user exclude-all was not preserved during partial installation"
  )

  const disabled = await invokeSetup(
    cli,
    repository,
    authorizedEnvironment,
    { ...baseRequest, scope: { cwd: repository, review: "disabled" }, credential: "skip" },
    0,
    "disabled setup"
  )
  expect(disabled.status === "completed", "setup did not complete with repository review disabled")
  expect(
    disabled.stages.some((stage) => stage.stage === "execution-context" && stage.status === "unknown"),
    "disabled setup overstated execution-context readiness"
  )

  const helper = join(temporary, "secret-helper.mjs")
  const vault = join(stateRoot, "vault")
  await writeFile(
    helper,
    `#!${process.execPath}
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const operation = process.argv[2]; const vault = process.env.TEST_SECRET_VAULT;
if (operation === "get") process.stdout.write(existsSync(vault) ? '{"status":"present"}\\n' + readFileSync(vault) : '{"status":"missing"}\\n');
else if (operation === "set") { const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); writeFileSync(vault, Buffer.concat(chunks), {mode:0o600}); console.log('{"status":"stored"}'); }
else if (operation === "probe") console.log('{"status":"available"}');
`,
    { mode: 0o700 }
  )
  await chmod(helper, 0o700)
  const requestPath = join(temporary, "interactive-setup.json")
  await writeFile(requestPath, JSON.stringify({ ...baseRequest, credential: "saved", interactive: true }))
  const interactiveEnvironment = {
    ...baseEnvironment,
    TERM: "xterm-256color",
    REVIEW_CREDENTIAL_HELPER: helper,
    TEST_SECRET_VAULT: vault
  }
  const marker = "package-interactive-setup-secret"
  const interactive = await runMaskedSetup(cli, repository, interactiveEnvironment, requestPath, marker)
  expect(
    interactive.providerCalls === 0 && interactive.paidVerificationPerformed === false,
    "interactive setup performed provider work"
  )
  expect(
    interactive.stages.some((stage) => stage.stage === "credential" && stage.status === "complete"),
    "interactive setup did not store the credential"
  )
  expect(
    interactive.stages.some((stage) => stage.stage === "host-trust" && stage.status === "unknown"),
    "interactive setup overstated native trust"
  )
  expect(
    (await readFile(join(publicHome, ".config", "hapsland", ".env"), "utf8")).includes(marker),
    "masked credential was not passed to owned file storage"
  )

  const pilotRepository = join(temporary, "pilot-repository")
  const pilotHome = join(temporary, "pilot-codex-home")
  await mkdir(pilotRepository)
  await mkdir(pilotHome)
  result = await run("git", ["init", "--quiet", pilotRepository], { cwd: temporary })
  expect(result.code === 0, "guided pilot fixture repository initialization failed")
  const pilotVault = join(stateRoot, "pilot-vault")
  const pilotState = join(stateRoot, "pilot-consent")
  const pilotEnvironment = {
    ...interactiveEnvironment,
    TEST_SECRET_VAULT: pilotVault,
    XDG_CONFIG_HOME: join(stateRoot, "pilot-config"),
    REVIEW_STATE_PATH: pilotState,
    REVIEW_USER_CONFIG_PATH: join(stateRoot, "pilot-user.jsonc"),
    REVIEW_CREDENTIAL_STATE_PATH: join(stateRoot, "pilot-credential-state.json")
  }
  const pilotMarker = "package-guided-pilot-secret"
  const pilotCodexExecutable = process.env.REVIEW_PILOT_CODEX_EXECUTABLE ?? codexExecutable
  const declinedPilot = await runGuidedPilot(cli, pilotRepository, pilotEnvironment, pilotHome, pilotCodexExecutable, [
    { prompt: "Apply these setup changes for Codex CLI? [y/N]", value: "y" },
    { prompt: "Apply these default rule changes? [y/N]", value: "y" },
    { prompt: "Where should Hapsland save your Jev key?", value: "" },
    { prompt: "Jev API key:", value: pilotMarker },
    { prompt: "Save this key? [y/N]", value: "y" },
    { prompt: "Verify this key with one request", value: "n" }
  ])
  expect(declinedPilot.includes("key saved"), "guided login did not confirm credential storage")
  expect(declinedPilot.includes("No real verification or review was sent"), "guided login overstated verification")
  expect(
    declinedPilot.includes("Key validity: not checked for this request."),
    "guided setup did not decline key verification"
  )
  expect(!declinedPilot.includes(pilotMarker), "guided credential appeared in terminal output")
  expect(
    (await readFile(join(stateRoot, "pilot-config", "hapsland", ".env"), "utf8")).includes(pilotMarker),
    "guided credential was not saved"
  )
  const approvedPilot = await runGuidedPilot(cli, pilotRepository, pilotEnvironment, pilotHome, pilotCodexExecutable, [
    { prompt: "Verify this key with one request", value: "n" }
  ])
  expect(approvedPilot.includes("Setup: offline readiness: unknown"), "guided pilot overstated native trust")
  expect(approvedPilot.includes("native trust or hook review prompt"), "guided pilot omitted trust handoff")
  expect(!approvedPilot.includes(pilotMarker), "guided rerun disclosed saved credential")
  const pilotHooks = JSON.parse(await readFile(join(pilotHome, "hooks.json"), "utf8"))
  expect(pilotHooks.hooks.PostToolUse.length === 1, "guided rerun duplicated the owned hook")
  const invalidLogin = await runGuidedPilot(
    cli,
    pilotRepository,
    pilotEnvironment,
    pilotHome,
    pilotCodexExecutable,
    [
      { prompt: "Where should Hapsland save your Jev key?", value: "" },
      { prompt: "Jev API key:", value: "" },
      { prompt: "Save this key? [y/N]", value: "y" }
    ],
    `${quote(cli)} --login`,
    6
  )
  expect(
    invalidLogin.includes("Enter a nonempty Jev key"),
    "interactive invalid login omitted a concrete recovery step"
  )

  const cancelledLogin = await runGuidedPilot(
    cli,
    pilotRepository,
    pilotEnvironment,
    pilotHome,
    pilotCodexExecutable,
    [
      { prompt: "Where should Hapsland save your Jev key?", value: "" },
      { prompt: "Jev API key:", raw: "\x1b" }
    ],
    `${quote(cli)} --login`,
    6
  )
  expect(cancelledLogin.includes("Login: cancelled."), "hidden-input Escape did not cancel installed login")
  expect(!cancelledLogin.includes(pilotMarker), "cancelled login disclosed the previous credential")
  expect(
    (await readFile(join(stateRoot, "pilot-config", "hapsland", ".env"), "utf8")).includes(pilotMarker),
    "cancelled login changed the previous credential"
  )

  // Exercise explicit replacement through the same packaged setup consumer used
  // by dev-install. A saved user file remains selected across package activation.
  const replacedMarker = "package-replacement-fixture"
  const replacement = await runGuidedPilot(
    cli,
    pilotRepository,
    pilotEnvironment,
    pilotHome,
    pilotCodexExecutable,
    [
      { prompt: "Where should Hapsland save your Jev key?", value: "" },
      { prompt: "Jev API key:", value: replacedMarker },
      { prompt: "Save this key? [y/N]", value: "y" },
      { prompt: "Verify this key with one request", value: "n" }
    ],
    `${quote(cli)} setup codex --new-key --codex-home=${quote(pilotHome)} --codex-executable=${quote(pilotCodexExecutable)}`
  )
  const userFile = join(stateRoot, "pilot-config", "hapsland", ".env")
  expect(
    (await readFile(userFile, "utf8")).includes(replacedMarker),
    "explicit new-key did not replace the approved user file"
  )
  expect(!replacement.includes(replacedMarker), "replacement disclosed the entered key")
  const preserved = await readFile(userFile, "utf8")
  await runGuidedPilot(cli, pilotRepository, pilotEnvironment, pilotHome, pilotCodexExecutable, [
    { prompt: "Verify this key with one request", value: "n" }
  ])
  expect((await readFile(userFile, "utf8")) === preserved, "setup activation replaced a saved credential")

  await writeFile(join(pilotRepository, ".gitignore"), ".env.local\n")
  const projectMarker = "package-project-fixture"
  const projectLogin = await runGuidedPilot(
    cli,
    pilotRepository,
    pilotEnvironment,
    pilotHome,
    pilotCodexExecutable,
    [
      { prompt: "Where should Hapsland save your Jev key?", raw: "\x1b[B\r" },
      { prompt: "Jev API key:", value: projectMarker },
      { prompt: "Save this key? [y/N]", value: "y" }
    ],
    `${quote(cli)} --login`
  )
  expect(
    (await readFile(join(pilotRepository, ".env.local"), "utf8")).includes(projectMarker),
    "project login wrote outside the reviewed repository"
  )
  expect(
    projectLogin.includes("Effective credential: project-local"),
    "project login did not report the effective project source"
  )
  expect((await readFile(userFile, "utf8")) === preserved, "project saving changed the user file")
  expect(!projectLogin.includes(projectMarker), "project login disclosed the key")

  const nativeMarker = "package-native-fixture"
  const nativeLogin = await runGuidedPilot(
    cli,
    pilotRepository,
    pilotEnvironment,
    pilotHome,
    pilotCodexExecutable,
    [
      { prompt: "Where should Hapsland save your Jev key?", raw: "\x1b[B\x1b[B\r" },
      { prompt: "Jev API key:", value: nativeMarker },
      { prompt: "Save this key? [y/N]", value: "y" }
    ],
    `${quote(cli)} --login`
  )
  expect(
    (await readFile(pilotVault, "utf8")) === nativeMarker,
    "explicit native selection did not reach the native adapter"
  )
  expect(nativeLogin.includes("Effective credential: project-local"), "native saving changed file lookup precedence")
  expect(!nativeLogin.includes(nativeMarker), "native login disclosed the key")

  // Opt-in because this drives three real dev-install builds. The caller supplies
  // a separate candidate worktree with the pinned dependencies/toolchain ready.
  if (developmentCheckout !== undefined) {
    const developmentRoot = await realpath(resolve(developmentCheckout))
    expect(developmentRoot !== projectRoot, "development acceptance requires a separate candidate checkout")
    const rootProbe = await run("git", ["rev-parse", "--show-toplevel"], { cwd: developmentRoot })
    expect(
      rootProbe.code === 0 && (await realpath(rootProbe.stdout.trim())) === developmentRoot,
      "development checkout is not a repository root"
    )
    for (const name of [".env", ".env.local"])
      expect(
        (await readOptional(join(developmentRoot, name))) === undefined,
        "candidate checkout copied an ignored credential"
      )
    const devHome = join(temporary, "development-home")
    const devConfig = join(temporary, "development-config")
    const devCodexHome = join(temporary, "development-codex")
    await mkdir(devHome)
    await mkdir(devCodexHome)
    const devEnvironment = {
      ...interactiveEnvironment,
      PATH: process.env.PATH,
      HOME: devHome,
      XDG_CONFIG_HOME: devConfig,
      XDG_STATE_HOME: join(devHome, "state"),
      REVIEW_USER_CONFIG_PATH: join(devConfig, "hapsland", "config.jsonc"),
      REVIEW_STATE_PATH: join(devHome, "consent"),
      REVIEW_CREDENTIAL_STATE_PATH: join(devHome, "credential-state.json")
    }
    const entry = `${quote(process.execPath)} ${quote(join(developmentRoot, "scripts", "dev-install.mjs"))}`
    const flags = `--host=codex --codex-home=${quote(devCodexHome)} --codex-executable=${quote(pilotCodexExecutable)}`
    const markers = ["development-user-", "development-project-before-", "development-project-after-"].map(
      (prefix) => prefix + createHash("sha256").update(temporary).digest("hex")
    )
    const launch = (mode, answers) =>
      runGuidedPilot(
        cli,
        developmentRoot,
        devEnvironment,
        devCodexHome,
        pilotCodexExecutable,
        answers,
        `${entry} ${flags} ${mode}`,
        0,
        300_000
      )
    const keyAnswers = (marker, project = false) => [
      { prompt: "Where should Hapsland save your Jev key?", raw: project ? "\x1b[B\r" : "\r" },
      { prompt: "Jev API key:", value: marker },
      { prompt: "Save this key? [y/N]", value: "y" },
      { prompt: "Verify this key with one request", value: "n" }
    ]
    const activePath = join(devHome, ".local", "share", "hapsland", "active.json")
    const userPath = join(devConfig, "hapsland", ".env")
    const mutationPath = join(developmentRoot, "packages", "administration", "src", "cli-help.ts")
    const original = await readFile(mutationPath, "utf8")
    const outputs = []
    try {
      outputs.push(
        await launch("", [
          { prompt: "Apply these setup changes for Codex CLI? [y/N]", value: "y" },
          { prompt: "Apply these default rule changes? [y/N]", value: "y" },
          ...keyAnswers(markers[0])
        ])
      )
      const before = JSON.parse(await readFile(activePath, "utf8"))
      const saved = await readFile(userPath, "utf8")
      expect(saved.includes(markers[0]), "dev-install did not save the approved user credential")
      outputs.push(
        await runGuidedPilot(
          before.executable,
          developmentRoot,
          devEnvironment,
          devCodexHome,
          pilotCodexExecutable,
          keyAnswers(markers[1], true).slice(0, 3),
          `${quote(before.executable)} --login`
        )
      )
      const projectPath = join(developmentRoot, ".env.local")
      const projectBefore = await readFile(projectPath, "utf8")
      expect(projectBefore.includes(markers[1]), "development project login wrote outside the source repository")
      // Change actual packaged behavior, rather than only snapshot metadata.
      expect(original.includes("no Jev call"), "development mutation anchor is absent")
      await writeFile(mutationPath, original.replace("no Jev call", "no Jev call (development acceptance fixture)"))
      outputs.push(
        await launch("--update", [
          { prompt: "Review all update previews", value: "" },
          { prompt: "Apply these changes to codex profiles? [y/N]", value: "y" }
        ])
      )
      const after = JSON.parse(await readFile(activePath, "utf8"))
      expect(after.executable !== before.executable, "changed development inputs did not activate a new snapshot")
      expect((await readFile(userPath, "utf8")) === saved, "development update changed credential bytes")
      expect(!outputs.at(-1).includes("Jev API key:"), "development update requested credential replacement")
      expect(
        (await readFile(projectPath, "utf8")) === projectBefore,
        "development update changed project credential bytes"
      )
      outputs.push(await launch("--new-key", keyAnswers(markers[2], true)))
      expect(
        (await readFile(projectPath, "utf8")).includes(markers[2]),
        "development project credential escaped the source repository"
      )
      expect((await readFile(userPath, "utf8")) === saved, "project replacement changed the user credential")
      const active = JSON.parse(await readFile(activePath, "utf8"))
      const observation = await run(active.executable, ["--credentials"], {
        cwd: developmentRoot,
        env: devEnvironment,
        input: JSON.stringify({ version: 1, operation: "credentials", cwd: developmentRoot })
      })
      expect(observation.code === 0, "development credential inspection failed")
      const inspected = JSON.parse(observation.stdout)
      expect(inspected.status === "present" && inspected.present === true, "development credential is unavailable")
      expect(inspected.file === projectPath, "rebuilt installed command changed project lookup coordinates")
      for (const output of [...outputs, observation.stdout, observation.stderr])
        expect(
          markers.every((marker) => !output.includes(marker)),
          "development workflow disclosed a credential"
        )
      const inspectTree = async (directory) => {
        for (const item of await readdir(directory, { withFileTypes: true })) {
          const path = join(directory, item.name)
          expect(item.name !== ".env" && item.name !== ".env.local", "credential file entered a build or snapshot")
          if (item.isDirectory()) await inspectTree(path)
          else if (item.isFile()) {
            const bytes = await readFile(path)
            expect(
              markers.every((marker) => !bytes.includes(Buffer.from(marker))),
              "credential entered build or snapshot bytes"
            )
            if (item.name.endsWith(".tar.zst")) {
              const unpacked = zstdDecompressSync(bytes)
              expect(
                markers.every((marker) => !unpacked.includes(Buffer.from(marker))),
                "credential entered cached task bytes"
              )
            }
            if (item.name.endsWith(".tgz")) {
              const entries = await run("tar", ["-tzf", path])
              expect(
                entries.code === 0 &&
                  !entries.stdout.split("\n").some((name) => /(?:^|\/)\.env(?:\.local)?$/.test(name)),
                "credential entered an archive"
              )
              const unpacked = await run("tar", ["-xOf", path])
              expect(
                unpacked.code === 0 && markers.every((marker) => !unpacked.stdout.includes(marker)),
                "credential entered archived bytes"
              )
            }
          }
        }
      }
      await inspectTree(join(devHome, ".local", "share", "hapsland", "candidates"))
      await inspectTree(join(developmentRoot, "dist"))
      for (const item of await readdir(join(developmentRoot, "packages"), { withFileTypes: true })) {
        if (!item.isDirectory()) continue
        const output = join(developmentRoot, "packages", item.name, "dist")
        try {
          await access(output)
        } catch (error) {
          if (error.code === "ENOENT") continue
          throw error
        }
        await inspectTree(output)
      }
      await inspectTree(join(developmentRoot, ".test-runs", "turbo-cache"))
      const common = await run("git", ["rev-parse", "--git-common-dir"], { cwd: developmentRoot })
      await inspectTree(resolve(developmentRoot, common.stdout.trim(), "hapsland-artifacts"))
      await assertNoProviderCall(capturePath)
    } finally {
      await writeFile(mutationPath, original)
      await rm(join(developmentRoot, ".env.local"), { force: true })
    }
  }

  await installedResidentUpdateJourney(
    {
      cli,
      archive: join(artifacts, artifact),
      temporary,
      repository,
      codexHome,
      codexExecutable,
      environment: baseEnvironment
    },
    { run, parse, expect, quote }
  )

  await assertNoProviderCall(capturePath)
  const fixtureActive = JSON.parse(
    await readFile(join(publicHome, ".local", "share", "hapsland", "active.json"), "utf8")
  )
  expect(
    fixtureActive.executable.startsWith(installation + "/"),
    "guided setup activated a package outside the fixture HOME"
  )
  expect(
    Array.isArray(fixtureActive.args) && fixtureActive.args.length === 0,
    "guided setup retained an interpreter entrypoint"
  )
  expect(
    (await readOptional(outsideActivePath)) === outsideActiveBefore,
    "setup-package changed the caller's active-package record"
  )
  process.stdout.write(
    `${JSON.stringify({
      version: 1,
      operation: "setup-package-conformance",
      status: "passed",
      packageManager: installer.manager,
      archiveSha256: createHash("sha256")
        .update(await readFile(join(artifacts, artifact)))
        .digest("hex"),
      inspectedArchiveProfiles: archiveProfiles,
      operatingSystem: process.platform,
      architecture: process.arch,
      providerCalls: 0,
      journeys: [
        "installed-resident-idle-busy-replacement-and-retained-hook-resolution",
        "failed-resident-launch-retains-selection",
        "resident-only-preserves-native-hook-files",
        "compatible-codex-hook-update-preserves-claude-and-resident-selection",
        "noninteractive-handoff",
        "interruption-resume",
        "idempotent-repeat",
        "offline-first-review-demo",
        "disabled-completion",
        "interactive-masked-terminal",
        "guided-pilot",
        "installed-hidden-input-terminal-restoration",
        "installed-hidden-input-cancellation-preserves-credential",
        ...(developmentCheckout === undefined ? [] : ["development-install-rebuild-update-new-key-artifact-exclusion"])
      ]
    })}\n`
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
  expect(
    (await readOptional(outsideActivePath)) === outsideActiveBefore,
    "setup-package changed the caller's active-package record"
  )
}
