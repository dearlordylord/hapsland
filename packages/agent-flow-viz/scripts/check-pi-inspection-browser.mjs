import assert from "node:assert/strict"
import { revealInspection } from "@hapsland/build-tooling/test-harness/inspection-browser-controls"
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import { Effect, Scope, Exit } from "effect"
import { connectDefaultRuleFixture } from "@hapsland/build-tooling/test-support/default-rules"
import { makeInspectionStorage } from "@hapsland/inspection-records/inspection/storage"
import { makeInspectionHttpServer } from "@hapsland/administration/inspection/http"
import {
  setupInstalledPi,
  cleanupInstalledPi,
  cleanupPiFixtures,
  fixture,
  before,
  result
} from "@hapsland/build-tooling/test-support/pi-installed"

process.chdir(fileURLToPath(new URL("../../../", import.meta.url)))
const stateHome = realpathSync(mkdtempSync(join(tmpdir(), "hapsland-pi-browser-")))
const scope = await Effect.runPromise(Scope.make())
let browser
const errors = []
let expired = false
let deadline
try {
  // Package preparation has its own finite build/pack bounds; the interaction clock starts afterwards.
  await setupInstalledPi("installed")
  deadline = setTimeout(() => {
    expired = true
    console.error("Pi inspection browser deadline expired")
    void (async () => {
      try {
        await browser?.close()
        await cleanupPiFixtures()
      } catch (error) {
        console.error("Pi inspection browser cleanup failed:", error.message)
      } finally {
        process.exit(1)
      }
    })()
  }, 45000)
  const outputs = []
  for (const variant of ["edit", "unavailable", "oversized", "lost-ack"]) {
    if (expired) throw new Error("Pi inspection browser deadline expired")
    const ackGate = join(stateHome, "ack-reply")
    if (variant === "lost-ack") writeFileSync(`${ackGate}.enabled`, "enabled\n")
    const f = fixture(
      true,
      {},
      {
        env: {
          XDG_STATE_HOME: stateHome,
          ...(variant === "lost-ack" ? { REVIEW_RESIDENT_ACK_RESPONSE_GATE_PATH: ackGate } : {})
        }
      }
    )
    const context = { ...f.context, cwd: realpathSync(f.root) }
    const rulePaths = connectDefaultRuleFixture(f.root)
    writeFileSync(join(f.root, ".hapsland.jsonc"), JSON.stringify({ version: 1, rules: [rulePaths[0]] }))
    writeFileSync(join(f.root, "user.json"), JSON.stringify({ version: 1, sessionInspection: true }))
    await f.prepareResident()
    await f.call("tool_call", before, context)
    writeFileSync(join(f.root, "type.ts"), "type OrderCount = number\n")
    let editCount = 1
    let output = await f.call("tool_result", result, context)
    if (variant === "edit" && output === undefined) {
      await f.waitForWork(1)
      writeFileSync(join(f.root, "backend.gate"), "release\n")
      await f.waitForAdvice()
      await unlink(join(f.root, "backend.gate"))
      const later = await f.offerOnLaterEdits(context)
      editCount += later.editCount
      output = later.output
    }
    if (variant === "edit") {
      writeFileSync(join(f.root, "backend.gate"), "release\n")
      if (output?.content === undefined) {
        const journal = makeInspectionStorage(join(stateHome, "hapsland", "inspection"), {
          retentionMs: 86400000,
          storageBytes: 134217728
        })
        const retained = await Effect.runPromise(journal.snapshot()).catch(() => undefined)
        const observations = (retained?.records ?? [])
          .slice(-64)
          .map(({ capturedAt, fact }) => ({
            capturedAt,
            kind: fact.kind,
            ...(typeof fact.status === "string" ? { status: fact.status } : {}),
            ...(typeof fact.outcome === "string" ? { outcome: fact.outcome } : {}),
            ...(typeof fact.reason === "string" ? { reason: fact.reason } : {})
          }))
        assert.fail(
          `native edit offer missing; journal ${retained === undefined ? "unavailable" : "available"}; last 64 retained lifecycle observations: ${JSON.stringify(observations)}`
        )
      }
    }
    if (variant !== "edit") {
      if (variant !== "edit") {
        assert.equal(output, undefined)
        await f.waitForWork(1)
        writeFileSync(join(f.root, "backend.gate"), "release\n")
      }
      output = await f.call(
        "agent_before_settle",
        {
          entries:
            variant === "oversized"
              ? [{ type: "custom_message", customType: "original", content: "λ".repeat(9000), display: false }]
              : variant === "unavailable"
                ? [{ type: "custom_message", customType: "original", content: new Date(0), display: false }]
                : [],
          continue: false,
          context: { canContinue: true },
          outcome: "completed"
        },
        context
      )
    }
    assert.ok(output, variant)
    if (variant === "lost-ack") assert.equal(existsSync(`${ackGate}.entered`), true)
    outputs.push({ root: context.cwd, encoded: JSON.stringify(output), variant, editCount })
  }
  const history = makeInspectionStorage(join(stateHome, "hapsland", "inspection"), {
    retentionMs: 86400000,
    storageBytes: 134217728
  })
  const server = await Effect.runPromise(
    makeInspectionHttpServer(history).pipe(Effect.provideService(Scope.Scope, scope))
  )
  if (expired) throw new Error("Pi inspection browser deadline expired")
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    permissions: ["clipboard-read", "clipboard-write"]
  })
  const page = await context.newPage()
  page.setDefaultTimeout(5000)
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(server.url)
  await page.waitForFunction(() => document.querySelectorAll("#handoffs button").length === 4)
  const expectedEdits = outputs.reduce((sum, output) => sum + output.editCount, 0)
  await page.waitForFunction((count) => document.querySelectorAll("#edits button").length === count, expectedEdits)
  assert.equal(await page.locator("#current-recording").count(), 1)
  const recording = JSON.parse(await page.locator("#current-recording").textContent())
  for (const output of outputs) {
    const state = recording.sources.find((entry) => entry.roots.some((root) => root.root === output.root))
    assert.equal(state?.status, "observed")
    assert.ok(state.roots.some((root) => root.root === output.root && root.state === "enabled"))
  }
  const sources = JSON.parse(await page.locator("#sources").textContent())
  for (const output of outputs) {
    const entry = sources.find((entry) => entry.source.endpoint === output.root + "/runtime/resident.sock")
    assert.ok(entry)
    assert.equal(entry.registered, true)
    assert.equal(entry.health, "connected")
    assert.ok(entry.lastObservation)
  }
  const clear = async () => {
    await page.locator("#clear-filters").focus()
    await page.keyboard.press("Enter")
    assert.equal(await page.locator("#edits button").count(), expectedEdits)
  }
  await revealInspection(page, "#root-filter")
  await page.locator("#root-filter").focus()
  for (const id of [
    "root-filter",
    "runtime-filter",
    "session-filter",
    "child-filter",
    "resident-filter",
    "clear-filters"
  ]) {
    if (id !== "root-filter") await page.keyboard.press("Tab")
    assert.equal(await page.evaluate(() => document.activeElement.id), id)
    assert.equal(await page.locator("#" + id).isEnabled(), true)
  }
  const rootFilter = page.getByRole("combobox", { name: "Project", exact: true })
  await rootFilter.selectOption({ index: 1 })
  const filteredRoot = JSON.parse(await rootFilter.inputValue())
  assert.equal(
    await page.locator("#edits button").count(),
    outputs.find((output) => output.root === filteredRoot).editCount
  )
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await clear()
  const residentFilter = page.getByRole("combobox", { name: "Resident", exact: true })
  await residentFilter.selectOption({ index: 1 })
  const filteredSource = JSON.parse(await residentFilter.inputValue())
  const endpoint = sources.find((entry) => entry.source.id === filteredSource).source.endpoint
  const owned = outputs.find((output) => endpoint === output.root + "/runtime/resident.sock")
  assert.equal(await page.locator("#edits button").count(), owned ? owned.editCount : 0)
  await clear()
  for (const id of ["runtime-filter", "session-filter", "child-filter"]) {
    await page.locator("#" + id).selectOption({ index: 1 })
    assert.equal(await page.locator("#edits button").count(), expectedEdits)
    await clear()
  }
  await page.locator("#edits button").first().click()
  await revealInspection(page, "#handoffs")
  await page.locator("#all-handoffs").click()
  for (const [index, output] of outputs.entries()) {
    const button = page.locator("#handoffs button").nth(index)
    await button.focus()
    await page.keyboard.press("Enter")
    const metadata = JSON.parse(await page.locator("#handoff-summary").textContent())
    assert.equal(metadata.scope.runtime, "pi")
    assert.equal(metadata.scope.root, output.root)
    assert.equal(metadata.scope.sessionId, "pi-boundary-session")
    assert.ok(metadata.findingIds.length > 0)
    assert.ok(metadata.evaluations.length > 0)
    assert.ok(metadata.batchId)
    assert.ok((await page.locator("#handoff-edits button").count()) >= 1)
    const text = await page.locator("#handoff-message").textContent()
    assert.match(text, /Hapsland/)
    output.message = text
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  }
  const edit = page.locator("#handoff-edits button")
  await edit.focus()
  await page.keyboard.press("Enter")
  await page.waitForFunction(() => document.querySelector("#files").textContent.includes("type.ts"))
  assert.equal(await page.locator("#panel-files").evaluate((panel) => panel.open), true)
  assert.equal(await page.locator("#handoff-message").textContent(), outputs.at(-1).message)
  await cleanupPiFixtures()
  await page.waitForFunction(
    (roots) => {
      const entries = JSON.parse(document.querySelector("#sources").textContent)
      return roots.every(
        (root) =>
          entries.find((entry) => entry.source.endpoint === root + "/runtime/resident.sock")?.health === "disconnected"
      )
    },
    outputs.map((output) => output.root)
  )
  assert.equal(await page.locator("#edits button").count(), expectedEdits)
  assert.equal(await page.locator("#handoff-message").textContent(), outputs.at(-1).message)
  assert.deepEqual(errors, [])
  const disconnectedRecording = JSON.parse(await page.locator("#current-recording").textContent())
  assert.equal(disconnectedRecording.sources.filter((entry) => entry.status === "disconnected").length, 4)
  assert.ok(disconnectedRecording.sources.every((entry) => entry.roots.length === 0))
  console.log(
    "Pi inspection browser: native fixtures, resident messages independent of native output and lost ACK, original edit links, verified multi-source health and exit history, identity filters, keyboard controls and 375px layout passed"
  )
} finally {
  clearTimeout(deadline)
  await browser?.close()
  await Effect.runPromise(Scope.close(scope, Exit.void))
  await cleanupPiFixtures()
  cleanupInstalledPi()
  rmSync(stateHome, { recursive: true, force: true })
}
