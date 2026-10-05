import assert from "node:assert/strict"
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import { Effect, Scope, Exit } from "effect"
import { configuredRules } from "../../../src/policy/rules.ts"
import { makeInspectionStorage } from "../../../src/inspection/storage.ts"
import { makeInspectionHttpServer } from "../../../src/inspection/http.ts"
import {
  setupInstalledPi,
  cleanupInstalledPi,
  cleanupPiFixtures,
  fixture,
  before,
  result
} from "../../../src/test-support/pi-installed.ts"

process.chdir(fileURLToPath(new URL("../../../", import.meta.url)))
const stateHome = realpathSync(mkdtempSync(join(tmpdir(), "hapsland-pi-browser-")))
const scope = await Effect.runPromise(Scope.make())
let browser
const errors = []
let expired = false
const deadline = setTimeout(() => {
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
try {
  await setupInstalledPi("source")
  const outputs = []
  for (const variant of ["edit", "oversized", "lost-ack"]) {
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
    writeFileSync(
      join(f.root, "user.json"),
      JSON.stringify({
        version: 1,
        sessionInspection: true,
        ruleOverrides: Object.fromEntries(configuredRules.map((rule, index) => [rule.id, { enabled: index === 0 }]))
      })
    )
    if (variant === "edit") writeFileSync(join(f.root, "backend.gate"), "release\n")
    await f.prepareResident()
    await f.call("tool_call", before, context)
    writeFileSync(join(f.root, "type.ts"), "type OrderCount = number\n")
    let output = await f.call("tool_result", result, context)
    if (variant === "edit" && output === undefined) {
      await f.waitForWork(0)
      const next = {
        ...before,
        toolCallId: "native-edit-2",
        input: { path: "other.ts", edits: [{ oldText: "type Before = string", newText: "type OtherCount = number" }] }
      }
      writeFileSync(join(f.root, "other.ts"), "type Before = string\n")
      await f.call("tool_call", next, context)
      writeFileSync(join(f.root, "other.ts"), "type OtherCount = number\n")
      output = await f.call(
        "tool_result",
        {
          ...result,
          ...next,
          details: {
            patch: "--- other.ts\n+++ other.ts\n@@ -1 +1 @@\n-type Before = string\n+type OtherCount = number\n"
          }
        },
        context
      )
    }
    if (variant === "edit") assert.ok(output?.content, "native edit offer")
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
    outputs.push({ root: context.cwd, encoded: JSON.stringify(output), variant })
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
  await page.waitForFunction(() => document.querySelectorAll("#handoffs button").length === 3)
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
    assert.ok(metadata.attemptId)
    assert.equal(
      metadata.events.some((event) => event.state === "written"),
      false
    )
    assert.equal(
      metadata.events.some((event) => event.state === "uncertain"),
      true
    )
    assert.equal(
      metadata.events.some((event) => event.state === "acknowledged"),
      output.variant !== "lost-ack"
    )
    assert.ok((await page.locator("#handoff-edits button").count()) >= 1)
    if (output.variant === "oversized") {
      assert.equal(await page.locator("#handoff-copy").isDisabled(), true)
      assert.equal(await page.locator("#handoff-exact").textContent(), "Exact output unavailable: oversized.")
    } else {
      assert.equal(await page.locator("#handoff-copy").isEnabled(), true)
      await page.locator("#handoff-copy").focus()
      await page.keyboard.press("Enter")
      await page.waitForFunction(
        () => document.querySelector("#handoff-copy-status").textContent === "Exact output copied"
      )
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), output.encoded)
      assert.equal(await page.locator("#handoff-exact").textContent(), output.encoded)
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  }
  const edit = page.locator("#handoff-edits button")
  await edit.focus()
  await page.keyboard.press("Enter")
  await page.waitForFunction(() => document.querySelector("#files").textContent.includes("type.ts"))
  assert.equal(await page.locator("#handoff-exact").textContent(), outputs[2].encoded)
  assert.deepEqual(errors, [])
  console.log(
    "Pi inspection browser: native fixtures, exact offer copy, oversized absence, lost ACK, original edit links, keyboard controls and 375px layout passed"
  )
} finally {
  clearTimeout(deadline)
  await browser?.close()
  await Effect.runPromise(Scope.close(scope, Exit.void))
  await cleanupPiFixtures()
  cleanupInstalledPi()
  rmSync(stateHome, { recursive: true, force: true })
}
