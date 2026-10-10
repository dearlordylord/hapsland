import { revealInspection } from "./test-harness/inspection-browser-controls.mjs"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { executeNative } from "./native-process.mjs"
import { preparePackageInstall } from "./test-harness/package-install.mjs"
import { cleanupOwnedResident } from "./test-harness/cleanup-owned-resident.mjs"
import { nativePackageAssetsDigest } from "./native-package-assets.mjs"
import { resolveBunRuntime } from "./pinned-bun.mjs"
import { NATIVE_AGENT_PROFILES } from "./native-agent-profiles.mjs"
import { configuredRules, connectDefaultRuleFixture } from "@hapsland/build-tooling/test-support/default-rules"

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const pause = () => new Promise((done) => setTimeout(done, 100))
const bounded = async (action, label, duration = 15000) => {
  const stop = Date.now() + duration
  while (Date.now() < stop) {
    const result = await action()
    if (result !== undefined) return result
    await pause()
  }
  throw new Error(`Installed inspection deadline: ${label}`)
}

const assertExcludedSourceAbsent = (packet) => {
  assert.ok(
    !JSON.stringify(packet).includes("PRIVATE_NATIVE_MJS_256"),
    "Excluded source must never reach the public feed"
  )
  for (const record of packet.records ?? []) {
    if (record.fact.kind !== "transport-invoked" || record.fact.payload.status !== "available") continue
    assert.ok(
      !Buffer.from(record.fact.payload.encoded, "base64").includes(Buffer.from("PRIVATE_NATIVE_MJS_256")),
      "Excluded source must not appear in captured HTTP bytes"
    )
  }
}

const finishWithin = async (action, label, duration = 5000) => {
  let timer
  try {
    return await Promise.race([
      action,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Installed inspection cleanup deadline: ${label}`)), duration)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Real installed Codex ingress; only sanitized assertions leave the disposable fixture. */
export async function runCodexInspectionProfile({ project, archivePath, model, profile }) {
  if (!archivePath) throw new Error("Codex inspection requires --archive=PATH")
  const binary = process.env.HAPSLAND_TEST_CODEX ?? "/tmp/hapsland-codex-01551/node_modules/.bin/codex"
  const version = await executeNative(binary, ["--version"], { timeout: 10000 })
  assert.equal(version.stdout.trim(), NATIVE_AGENT_PROFILES.codex.version)
  const archive = resolve(archivePath)
  const archiveSha256 = hash(readFileSync(archive))
  const expectedAssets = nativePackageAssetsDigest(project)
  const sourceCommit = (
    await executeNative("git", ["-C", project, "rev-parse", "HEAD"], { timeout: 5000 })
  ).stdout.trim()
  const runnerSha256 = hash(readFileSync(new URL(import.meta.url)))
  const profileSha256 = profile?.source ? hash(readFileSync(profile.source)) : undefined
  const scenario = profile?.scenario ?? "inspection-exclusions"
  const prompts = profile?.prompts ?? [
    profile?.prompt ??
      "Add types.ts exporting type OrderCount = number. Add helper.mjs exporting function nextId(value) { return value + 1; } and const marker = 'PRIVATE_NATIVE_MJS_256'. Keep the two modules separate and leave README.md unchanged."
  ]
  const runId = `codex-${scenario}-${Date.now()}`
  const evidence = join(project, "evidence", "inspection")
  mkdirSync(evidence, { recursive: true })
  writeFileSync(
    join(evidence, `${runId}-declaration.json`),
    JSON.stringify(
      {
        schemaVersion: 1,
        declaredAt: new Date().toISOString(),
        scenario,
        runtime: version.stdout.trim(),
        archiveSha256,
        sourceCommit,
        runnerSha256,
        profileSha256,
        mode: "controlled-offline",
        hostCeilingMs: 240000,
        nativeTasks: prompts.length,
        residentPreparation: profile?.prepareResident ? "installed-resident-before-native-tasks" : "native-startup",
        nativeColdStartupValidation: false,
        runtimeIdentityPreparation: profile?.prepareRuntime === true,
        diagnosticOnly: profile?.diagnosticOnly === true,
        installationProbeRuntime: profile?.prepareRuntime
          ? "pinned-bun-with-packaged-native-entrypoint"
          : "packaged-native-runtime",
        maximumJevRequests: 0,
        automaticHostRetries: 0,
        syntheticRepositoryOnly: true,
        ordinaryTaskInstructions: true,
        hookTrustBypass: true,
        sandboxAndApprovalBypass: true,
        interactiveTrustValidation: false,
        requiredSeam:
          profile?.browser === false
            ? "installed native hooks -> prepared resident -> controlled provider -> delivered advice -> clear follow-up"
            : profile
              ? "installed native hooks -> resident -> private journal -> public HTTP -> browser -> replay"
              : "installed native hooks -> resident -> private journal -> public HTTP/SSE -> browser"
      },
      null,
      2
    ) + "\n",
    { flag: "wx" }
  )
  const temporary = mkdtempSync(join(tmpdir(), "hapsland-codex-inspection-"))
  const repo = join(temporary, "repo")
  const home = join(temporary, "codex")
  const userHome = join(temporary, "user-home")
  const runtime = join(temporary, "resident")
  const installation = join(temporary, "installation")
  let dashboard
  let browser
  let browserServer
  let report
  let diagnostics
  let failure
  let installed
  let phase = "installation"
  try {
    mkdirSync(repo)
    mkdirSync(home, { mode: 0o700 })
    mkdirSync(userHome, { mode: 0o700 })
    copyFileSync(join(process.env.CODEX_HOME ?? "/home/node/.codex", "auth.json"), join(home, "auth.json"))
    chmodSync(join(home, "auth.json"), 0o600)
    writeFileSync(join(home, "config.toml"), "[features]\nhooks = true\n")
    writeFileSync(join(repo, "README.md"), "Small standalone modules.\n")
    profile?.seed(repo)
    await executeNative("git", ["init", "-q", repo], { timeout: 10000 })
    writeFileSync(join(repo, ".hapsland.jsonc"), JSON.stringify({ version: 1, sessionInspection: true }))
    connectDefaultRuleFixture(repo)
    const env = {
      ...process.env,
      HOME: userHome,
      CODEX_HOME: home,
      XDG_STATE_HOME: join(temporary, "state"),
      XDG_CONFIG_HOME: join(temporary, "config"),
      REVIEW_RESIDENT_DIR: runtime,
      REVIEW_ACTIVITY_PATH: join(temporary, "activity"),
      REVIEW_STATE_PATH: join(temporary, "review-state"),
      REVIEW_USER_CONFIG_PATH: join(temporary, "absent-user.jsonc"),
      REVIEW_CREDENTIAL_STATE_PATH: join(temporary, "credential-state.json"),
      HAPSLAND_ACTIVE_DISPATCH: "1",
      HAPSLAND_BUILD_BUN: resolveBunRuntime().executable,
      REVIEW_CONTROL_JSON: JSON.stringify(
        profile?.control?.(repo) ?? {
          answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0 }]))
        }
      )
    }
    if (profile?.prepareRuntime) {
      env.REVIEW_INSTALL_RUNTIME = resolveBunRuntime().executable
      delete env.REVIEW_INSTALL_ENTRYPOINT
    }
    delete env.TYPESAFE_API_KEY
    const installer = await preparePackageInstall(installation, archive, env)
    assert.equal(
      (await executeNative(installer.executable, installer.args, { cwd: installation, env, timeout: 240000 })).code,
      0
    )
    installed = join(installation, "node_modules", "@hapsland", "hapsland")
    phase = "installed-assets"
    const cli = join(installation, "node_modules", ".bin", "hapsland")
    const assets = nativePackageAssetsDigest(installed)
    assert.equal(assets.sha256, expectedAssets.sha256, "Installed runtime must match the acceptance candidate")
    assert.equal(hash(readFileSync(archive)), archiveSha256)
    if (profile?.prepareRuntime) {
      phase = "installed-runtime-preparation"
      const identity = await executeNative(
        join(installed, "dist", "bin", `${process.platform}-${process.arch}`, "hapsland-hook"),
        ["--runtime-identity"],
        { cwd: repo, env, timeout: 10000 }
      )
      assert.equal(identity.code, 0)
      assert.deepEqual(JSON.parse(identity.stdout), {
        version: resolveBunRuntime().version,
        platform: process.platform,
        architecture: process.arch
      })
    }
    const json = async (flag, request) => {
      const result = await executeNative(cli, [flag], {
        cwd: repo,
        env,
        input: JSON.stringify(request),
        timeout: 30000
      })
      const value = JSON.parse(result.stdout)
      if (result.code !== 0)
        diagnostics = {
          operation: flag,
          exitCode: result.code,
          status: value.status,
          codexSupported: value.host?.compatibility?.codex?.supported ?? null,
          pinnedProbeSelected: value.host?.compatibility?.runtime?.checks?.runtime?.path === env.REVIEW_INSTALL_RUNTIME,
          runtimeChecks: Object.fromEntries(
            Object.entries(value.host?.compatibility?.runtime?.checks ?? {}).map(([name, check]) => [
              name,
              { ready: check.ready, timedOut: check.observed === "timed-out" }
            ])
          )
        }
      assert.equal(result.code, 0, `Installed ${flag} failed`)
      return value
    }
    phase = "install-preview"
    const preview = await json("--install-preview", {
      version: 1,
      operation: "install-preview",
      codexHome: home,
      codexExecutable: binary
    })
    phase = "hook-installation"
    const result = await json("--install", {
      version: 1,
      operation: "install",
      codexHome: home,
      codexExecutable: binary,
      proposalDigest: preview.proposal.digest
    })
    assert.equal(result.status, "installed")
    phase = "hook-registration"
    const settingsPath = join(home, "hooks.json")
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"))
    const commands = Object.values(settings.hooks).flatMap((groups) =>
      groups.flatMap((group) => group.hooks.map((hook) => hook.command))
    )
    assert.ok(commands.length >= 4)
    const bindingPath = join(home, ".hapsland", "codex-hook-launcher.sh")
    assert.ok(
      commands.every((command) => command.includes(bindingPath)),
      "All hooks must execute the installed launcher binding"
    )
    assert.ok(
      readFileSync(bindingPath, "utf8").includes(
        join(installed, "dist", "bin", `${process.platform}-${process.arch}`, "hapsland-hook")
      ),
      "Launcher binding must execute the reviewed installed hook"
    )
    // Keep the installed registrations and deadlines; select the supported offline reviewer.
    for (const groups of Object.values(settings.hooks))
      for (const group of groups) for (const hook of group.hooks) hook.command += " --controlled-reviewer"
    await profile?.instrumentHooks?.({ settings, repository: repo, temporary, installed })
    writeFileSync(settingsPath, JSON.stringify(settings), { mode: 0o600 })
    let preparedResidentPid
    if (profile?.prepareResident) {
      phase = "resident-preparation"
      const worker = spawn(
        join(installed, "dist", "bin", `${process.platform}-${process.arch}`, "hapsland-resident"),
        [runtime],
        { cwd: repo, env, stdio: "ignore" }
      )
      await bounded(
        () => {
          if (worker.exitCode !== null || worker.signalCode !== null)
            throw new Error("Installed resident startup failed")
          try {
            const owner = JSON.parse(readFileSync(join(runtime, "owner.json"), "utf8"))
            return owner.pid === worker.pid ? Promise.resolve(true) : undefined
          } catch {
            return undefined
          }
        },
        "installed resident preparation",
        15000
      )
      preparedResidentPid = worker.pid
    }
    phase = "native-session"
    const hostDeadline = Date.now() + 240000
    for (const prompt of prompts) {
      const remaining = hostDeadline - Date.now()
      if (remaining <= 0) throw new Error("Native tasks exhausted the declared host deadline")
      const native = await executeNative(
        binary,
        [
          "exec",
          ...(model && model !== "default" ? ["--model", model] : []),
          "--ephemeral",
          "--json",
          "--dangerously-bypass-hook-trust",
          "--dangerously-bypass-approvals-and-sandbox",
          "--ignore-rules",
          "-C",
          repo,
          prompt
        ],
        { cwd: repo, env, timeout: remaining }
      )
      assert.equal(native.code, 0, "Real Codex session failed")
      profile?.observeNative?.(native.stdout)
    }
    phase = "resident-selection"
    if (preparedResidentPid !== undefined) {
      const owner = JSON.parse(readFileSync(join(runtime, "owner.json"), "utf8"))
      assert.equal(owner.pid, preparedResidentPid, "Native review must retain the prepared installed resident")
    } else {
      const selectedResident = JSON.parse(
        readFileSync(join(userHome, ".local/share/hapsland/resident-target.json"), "utf8")
      )
      assert.equal(
        selectedResident.command.executable,
        join(installed, "dist", "bin", `${process.platform}-${process.arch}`, "hapsland-resident"),
        "Native review must use the reviewed installed resident"
      )
      assert.deepEqual(selectedResident.command.args, [])
    }
    if (profile === undefined) {
      assert.ok(readFileSync(join(repo, "helper.mjs"), "utf8").includes("PRIVATE_NATIVE_MJS_256"))
      assert.ok(readFileSync(join(repo, "types.ts"), "utf8").includes("OrderCount"))
    }
    phase = "public-feed"
    let output = ""
    dashboard = spawn(cli, ["dashboard", "--port=0"], { cwd: repo, env, stdio: ["ignore", "pipe", "ignore"] })
    dashboard.stdout.on("data", (chunk) => {
      output += chunk.toString()
      if (output.length > 8192) dashboard.kill()
    })
    const url = await bounded(
      () => Promise.resolve(output.match(/http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]+\//)?.[0]),
      "dashboard startup"
    )
    if (profile !== undefined) {
      const errors = []
      let page
      if (profile.browser !== false) {
        phase = "browser-launch"
        const { chromium } = createRequire(new URL("../packages/agent-flow-viz/package.json", import.meta.url))(
          "playwright"
        )
        browserServer = await chromium.launchServer({ headless: true, timeout: 15000 })
        browser = await chromium.connect(browserServer.wsEndpoint(), { timeout: 15000 })
        page = await browser.newPage()
        page.on("pageerror", (error) => errors.push(error.message))
      }
      const verified = await profile.verify({
        url,
        page,
        repository: repo,
        bounded,
        reportDiagnostic: (value) => {
          diagnostics = value
        },
        setPhase: (value) => {
          phase = value
        }
      })
      assert.deepEqual(errors, [])
      report = {
        schemaVersion: 1,
        observedAt: new Date().toISOString(),
        scenario,
        runtime: version.stdout.trim(),
        mode: "controlled-offline",
        archiveSha256,
        runtimeAssets: assets,
        sourceCommit,
        runnerSha256,
        profileSha256,
        operatingSystem: process.platform,
        architecture: process.arch,
        ...verified
      }
    } else {
      const snapshot = await bounded(async () => {
        const value = await (await fetch(`${url}snapshot`, { signal: AbortSignal.timeout(10000) })).json()
        const candidates = value.records
          .filter((record) => record.fact.kind === "edit-received")
          .flatMap((record) => record.fact.candidates)
        return candidates.some((candidate) => candidate.path === "helper.mjs") &&
          candidates.some((candidate) => candidate.path === "types.ts") &&
          value.records.some((record) => record.fact.kind === "model-input")
          ? value
          : undefined
      }, "retained native receipts")
      const receipts = snapshot.records.filter((record) => record.fact.kind === "edit-received")
      const excluded = receipts.find((record) =>
        record.fact.candidates.some((candidate) => candidate.path === "helper.mjs")
      )
      const supported = receipts.find((record) =>
        record.fact.candidates.some((candidate) => candidate.path === "types.ts")
      )
      assert.equal(excluded.scope.runtime, "codex-cli")
      assert.equal(excluded.scope.sessionId, supported.scope.sessionId, "Both edits must come from one native session")
      const candidate = excluded.fact.candidates.find((candidate) => candidate.path === "helper.mjs")
      assert.deepEqual(candidate.selection, {
        status: "excluded",
        diagnostic: { stage: "selection", code: "file-extension", args: { extension: ".mjs" } }
      })
      assert.equal(
        supported.fact.candidates.find((candidate) => candidate.path === "types.ts").selection.status,
        "selected"
      )
      assert.ok(
        snapshot.records.some(
          (record) =>
            record.correlation.receiptId === supported.correlation.receiptId && record.fact.kind === "unit-prepared"
        )
      )
      assert.ok(
        snapshot.records.some(
          (record) =>
            record.correlation.receiptId === supported.correlation.receiptId && record.fact.kind === "model-input"
        )
      )
      assert.ok(
        !snapshot.records.some((record) => record.fact.kind === "preparation-read" && record.fact.path === "helper.mjs")
      )
      assertExcludedSourceAbsent(snapshot)
      if (excluded.correlation.receiptId !== supported.correlation.receiptId)
        assert.ok(
          !snapshot.records.some(
            (record) =>
              record.correlation.receiptId === excluded.correlation.receiptId &&
              ["model-input", "transport-invoked", "unit-prepared"].includes(record.fact.kind)
          )
        )
      const sseAbort = new AbortController()
      const sseTimeout = setTimeout(() => sseAbort.abort(), 15000)
      let sse
      try {
        const stream = await fetch(`${url}events`, { signal: sseAbort.signal })
        const reader = stream.body.getReader()
        let frame = ""
        while (!frame.includes("\n\n")) {
          const packet = await reader.read()
          assert.equal(packet.done, false, "SSE closed before its initial retained snapshot")
          frame += new TextDecoder().decode(packet.value)
        }
        sse = JSON.parse(
          frame
            .split("\n")
            .find((line) => line.startsWith("data: "))
            .slice(6)
        )
        assert.ok(JSON.stringify(sse).includes(excluded.correlation.receiptId))
        assertExcludedSourceAbsent(sse)
        await reader.cancel()
      } finally {
        clearTimeout(sseTimeout)
        sseAbort.abort()
      }
      const { chromium } = createRequire(new URL("../packages/agent-flow-viz/package.json", import.meta.url))(
        "playwright"
      )
      phase = "browser"
      browserServer = await chromium.launchServer({ headless: true, timeout: 15000 })
      browser = await chromium.connect(browserServer.wsEndpoint(), { timeout: 15000 })
      const page = await browser.newPage()
      const errors = []
      page.on("pageerror", (error) => errors.push(error.message))
      await page.goto(url)
      await page.waitForFunction(
        (receiptId) =>
          current?.records.some(
            (record) => record.fact.kind === "edit-received" && record.correlation.receiptId === receiptId
          ),
        excluded.correlation.receiptId
      )
      assert.equal(await page.locator("#hide-unreviewed").isChecked(), true)
      for (const [receipt, path] of [
        [excluded, "helper.mjs"],
        [supported, "types.ts"]
      ]) {
        const invoked = snapshot.records.some(
          (record) =>
            record.correlation.receiptId === receipt.correlation.receiptId && record.fact.kind === "transport-invoked"
        )
        assert.equal(
          (await page.locator("#edits button").filter({ hasText: path }).count()) > 0,
          invoked,
          "Default visibility follows receipt-correlated transport evidence, including mixed patches"
        )
      }
      await page.locator("#hide-unreviewed").uncheck()
      await page.locator("#edits button").filter({ hasText: "helper.mjs" }).first().click()
      await revealInspection(page, "#routes")
      await page
        .locator("#routes")
        .getByText(/Unsupported extension.*\.mjs/)
        .waitFor()
      assert.ok(
        !(await page
          .locator("body")
          .textContent()
          .then((text) => text.includes("PRIVATE_NATIVE_MJS_256")))
      )
      await page.locator("#routes").screenshot({ path: join(evidence, `${runId}-selection.png`) })
      await page.reload()
      await page.locator("#hide-unreviewed").uncheck()
      await page.locator("#edits button").filter({ hasText: "helper.mjs" }).first().click()
      await revealInspection(page, "#routes")
      await page
        .locator("#routes")
        .getByText(/Unsupported extension.*\.mjs/)
        .waitFor()
      const replay = await (
        await fetch(`${url}snapshot?cursor=${encodeURIComponent(snapshot.watermark.cursor)}`, {
          signal: AbortSignal.timeout(10000)
        })
      ).json()
      assertExcludedSourceAbsent(replay)
      const replayed = replay.records.find(
        (record) =>
          record.fact.kind === "edit-received" && record.correlation.receiptId === excluded.correlation.receiptId
      )
      assert.deepEqual(
        replayed?.fact.candidates,
        excluded.fact.candidates,
        "Replay preserves the original exclusion facts"
      )
      assert.deepEqual(errors, [])
      const facts = snapshot.records.map((record) => ({
        kind: record.fact.kind,
        receiptId: record.correlation.receiptId ?? null,
        ...(record.fact.kind === "edit-received" ? { candidates: record.fact.candidates } : {}),
        ...(record.fact.kind === "edit-admission" ? { outcome: record.fact.outcome } : {})
      }))
      report = {
        schemaVersion: 1,
        observedAt: new Date().toISOString(),
        scenario,
        runtime: version.stdout.trim(),
        mode: "controlled-offline",
        archiveSha256,
        runtimeAssets: assets,
        hookRegistrationSha256: hash(JSON.stringify(commands)),
        operatingSystem: process.platform,
        architecture: process.arch,
        checks: {
          nativeSession: true,
          publicHttp: true,
          publicSse: true,
          browser: true,
          reload: true,
          replay: true,
          excludedSourceAbsent: true
        },
        facts,
        modelInvocations: snapshot.records.filter((record) => record.fact.kind === "model-input").length,
        httpAttempts: snapshot.records.filter((record) => record.fact.kind === "transport-invoked").length
      }
    }
  } catch {
    writeFileSync(
      join(evidence, `${runId}-result.json`),
      JSON.stringify(
        {
          schemaVersion: 1,
          observedAt: new Date().toISOString(),
          scenario,
          runtime: version.stdout.trim(),
          archiveSha256,
          status: "incomplete",
          phase,
          diagnostics
        },
        null,
        2
      ) + "\n",
      { flag: "wx" }
    )
    failure = new Error(`Installed inspection failed at ${phase}; sanitized evidence: ${runId}`)
  } finally {
    const cleanupFailures = []
    if (browser) await finishWithin(browser.close(), "browser").catch((error) => cleanupFailures.push(error))
    if (browserServer)
      await finishWithin(browserServer.kill(), "browser process").catch((error) => cleanupFailures.push(error))
    if (dashboard && dashboard.exitCode === null && dashboard.signalCode === null) {
      const closed = new Promise((done) => dashboard.once("close", done))
      dashboard.kill()
      await finishWithin(closed, "dashboard", 3000).catch(async () => {
        dashboard.kill("SIGKILL")
        await finishWithin(closed, "dashboard forced stop", 3000).catch((error) => cleanupFailures.push(error))
      })
    }
    if (installed)
      await cleanupOwnedResident(runtime, [
        {
          executable: join(installed, "dist", "bin", `${process.platform}-${process.arch}`, "hapsland-resident"),
          args: []
        }
      ]).catch((error) => cleanupFailures.push(error))
    if (cleanupFailures.length) {
      writeFileSync(
        join(evidence, `${runId}-result.json`),
        JSON.stringify(
          { schemaVersion: 1, scenario, archiveSha256, status: "incomplete", phase: "cleanup", fixtureRetained: true },
          null,
          2
        ) + "\n"
      )
      failure = new Error(`Installed inspection cleanup incomplete; sanitized evidence: ${runId}`, { cause: failure })
    } else rmSync(temporary, { recursive: true, force: true })
  }
  if (failure) throw failure
  writeFileSync(join(evidence, `${runId}-result.json`), JSON.stringify(report, null, 2) + "\n", { flag: "wx" })
  console.log(JSON.stringify({ scenario: report.scenario, archiveSha256, checks: report.checks }))
}
