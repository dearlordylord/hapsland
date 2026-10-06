import assert from "node:assert/strict"
import { revealInspection } from "./inspection-browser-controls.mjs"
import { writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { chromium } from "playwright"
import { Effect, Scope, Exit } from "effect"
import { makeResidentRuntime } from "../../../src/resident/server.ts"
import { residentRequestEffect } from "../../../src/resident/client.ts"
import { residentPaths } from "../../../src/resident/paths.ts"
import { adaptCodexDirectEvent } from "../../../src/direct-event/adapter.ts"
import { addEvent, makeGitFixture, put, advicee } from "../../../src/direct-event/test-fixtures.ts"
import { makeInspectionStorage } from "../../../src/inspection/storage.ts"
import { makeInspectionHttpServer } from "../../../src/inspection/http.ts"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { configuredRules, connectDefaultRuleFixture } from "../../../src/test-support/default-rules.ts"
import { readCredentialState } from "../../../src/credentials/secret-service.ts"
import { nativeDeferred } from "../../../src/test-support/native-deferred.ts"

const root = await makeGitFixture()
const scope = await Effect.runPromise(Scope.make())
let browser
let phase = "startup"
const deadline = setTimeout(() => {
  console.error("inspection browser deadline expired at", phase)
  process.exit(1)
}, 45000)
try {
  await put(
    root,
    "type.ts",
    'import type { Amount } from "./support";\r\ntype OrderCount = {\r\n\t/** 日本語 */\r\n\tvalue: Amount\r\n};\r\ntype ShipmentCount = number;\r\n'
  )
  await put(root, "support.ts", "export type Amount = number;\n")
  const inspectionConfig = {
    version: 1,
    sessionInspection: true,
    rules: connectDefaultRuleFixture(root).map((path, index) => ({
      path,
      ...(index === 0 ? { threshold: 0.6, message: "Inspect browser 日本語 cases" } : {})
    }))
  }
  await writeFile(join(root, ".hapsland.jsonc"), JSON.stringify(inspectionConfig))
  let historyNow = Date.now()
  // Keep the full bounded loss-marker window for the selected older handoff after recording-cycle fixtures.
  const historyLimits = { retentionMs: 86400000, storageBytes: 4 * 1048576, now: () => historyNow }
  const history = makeInspectionStorage(join(root, "inspection"), historyLimits)
  const dispatched = []
  let published = nativeDeferred()
  let recordingPublished = nativeDeferred()
  const retired = nativeDeferred()
  const messagePublished = nativeDeferred()
  const resident = await Effect.runPromise(
    makeResidentRuntime(residentPaths(join(root, "runtime")), undefined, {
      offlineHttpClient: HttpClient.make((request) => {
        assert.equal(request.body._tag, "Uint8Array")
        dispatched.push(Buffer.from(request.body.body))
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(
              JSON.stringify({
                model: "jev-latest",
                answers: Object.fromEntries(
                  configuredRules.map((rule) => [
                    rule.id,
                    { type: "noul", noul: rule.id === "r1_inferred_case" ? 0.7 : 0 }
                  ])
                ),
                usage: { input_tokens: 1, output_tokens: 1 }
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
          )
        )
      }),
      inspectionPersistence: {
        write: (record, encoded, publication) =>
          history.write(record, encoded, publication).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (record.fact.kind === "recording-state") recordingPublished.resolve()
                if (record.fact.kind === "finding-fate" && record.fact.fate === "stale") retired.resolve()
                if (record.fact.kind === "agent-message") messagePublished.resolve()
                if (
                  (record.fact.kind === "finding-fate" && record.fact.fate === "retained") ||
                  (record.fact.kind === "evaluation-route" && record.fact.route !== "fresh")
                )
                  published.resolve()
              })
            )
          )
      }
    }).pipe(Effect.provideService(Scope.Scope, scope))
  )
  const dispatch = {
    statePath: join(root, "consent"),
    userConfigPath: join(root, "absent-user"),
    credential: {
      name: "TYPESAFE_API_KEY",
      environmentValue: "INSPECTION_OFFLINE_KEY",

      generation: readCredentialState(join(root, "credential-state")).generation,
      statePath: join(root, "credential-state")
    },
    controlled: null
  }
  const edit = async (path, toolUseId, waitForCapture = true) => {
    const observation = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, Array.isArray(path) ? path : [path], { tool_use_id: toolUseId }))
    )
    assert.ok(observation)
    published = nativeDeferred()
    assert.equal((await Effect.runPromise(resident.admit(observation, dispatch, true))).status, "accepted")
    if (waitForCapture) await published.promise
    await Effect.runPromise(resident.whenIdle())
  }
  await edit("type.ts", "before-dashboard")
  const server = await Effect.runPromise(
    makeInspectionHttpServer(history).pipe(Effect.provideService(Scope.Scope, scope))
  )
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    permissions: ["clipboard-read", "clipboard-write"]
  })
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(server.url)
  const row = page.getByRole("button", { name: /type\.ts/ })
  await row.waitFor()
  const originalKey = await row.getAttribute("data-key")
  const originalRow = page.locator(`#edits button[data-key="${originalKey}"]`)
  assert.ok((await row.boundingBox()).y < 812, "Edits appear on the first narrow screen")
  assert.equal(await page.locator("#sources").isVisible(), false)
  assert.equal(await page.locator("#current-recording").isVisible(), false)
  assert.equal(await page.locator("#root-filter").isVisible(), false)
  await row.focus()
  await page.keyboard.press("Enter")
  await page.waitForFunction(() => document.querySelector("#detail").textContent.includes("edit-admission"))
  assert.equal(await page.locator("#review").isVisible(), true)
  assert.equal(await page.locator("#results").isVisible(), false)
  assert.equal(await page.locator("#exact").isVisible(), false)
  if (process.env.HAPSLAND_UX_SCREENSHOTS === "1") {
    await page.screenshot({ path: "/tmp/hapsland-inspection-ux-mobile.png", fullPage: true })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: "/tmp/hapsland-inspection-ux-desktop.png", fullPage: true })
    await page.setViewportSize({ width: 375, height: 812 })
  }
  await revealInspection(page, "#copy")
  await page.getByRole("button", { name: "Copy exact request", exact: true }).click()
  await page.waitForFunction(() => document.querySelector("#copy-status").textContent === "Exact request copied")
  assert.ok(Buffer.from(await page.evaluate(() => navigator.clipboard.readText())).equals(dispatched[0]))
  assert.equal(await page.locator("#exact").textContent(), dispatched[0].toString("utf8"))
  await page.waitForFunction(() => document.querySelectorAll("#requests button").length === 2)
  const copiedRequests = []
  const requestDeclarations = []
  const requestReferences = []
  for (const index of [0, 1]) {
    await page.locator("#requests button").nth(index).focus()
    await page.keyboard.press("Enter")
    const metadata = JSON.parse(await page.locator("#request-metadata").textContent())
    assert.ok(metadata.unitId && metadata.requestId && metadata.evaluationId)
    assert.ok(["OrderCount", "ShipmentCount"].includes(metadata.declaration))
    requestDeclarations.push(metadata.declaration)
    requestReferences.push({ sourceId: metadata.sourceId, sequence: metadata.sequence })
    assert.equal(metadata.payload.status, "available")
    await page.getByRole("button", { name: "Copy exact request", exact: true }).focus()
    await page.keyboard.press("Enter")
    await page.waitForFunction(() => document.querySelector("#copy-status").textContent === "Exact request copied")
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    assert.equal(JSON.parse(copied).state.artifact.name, metadata.declaration)
    assert.equal(Buffer.byteLength(copied), metadata.payload.byteLength)
    assert.equal(await page.locator("#exact").textContent(), copied)
    copiedRequests.push(copied)
  }
  assert.deepEqual(
    [...copiedRequests].sort(),
    dispatched
      .slice(0, 2)
      .map((body) => body.toString("utf8"))
      .sort()
  )
  assert.equal(new Set(copiedRequests).size, 2)
  await page.locator("#requests button").first().focus()
  await page.keyboard.press("Enter")
  assert.match(await page.locator("#files").textContent(), /Physically read:[\s\S]*support\.ts/)
  const includedFiles = await page.locator("#files").evaluate((element) => {
    const section = Array.from(element.querySelectorAll("section")).find(
      (group) => group.querySelector("h3")?.textContent === "Included in model input:"
    )
    return Array.from(section?.querySelectorAll("li") || []).map((item) => ({
      path: item.querySelector("span")?.textContent,
      declaration: item.querySelector("small")?.textContent,
      source: item.querySelector("pre")?.textContent
    }))
  })
  assert.ok(includedFiles.some((item) => item.path === "support.ts" && item.declaration === "Amount"))
  assert.ok(includedFiles.some((item) => item.path === "support.ts" && item.source === "export type Amount = number;"))
  assert.match(await page.locator("#source").textContent(), /日本語/)
  assert.match(await page.locator("#source").textContent(), /export type Amount = number;/)
  assert.match(await page.locator("#results").textContent(), /Effective threshold: 0.6/)
  assert.match(await page.locator("#results").textContent(), /Validated backend answers:[\s\S]*0.7/)
  assert.match(await page.locator("#results").textContent(), /Interpreted findings:[\s\S]*Inspect browser 日本語 cases/)
  const selection = await page.locator("#detail").textContent()
  await page.getByRole("button", { name: "Pause updates", exact: true }).click()
  const hostile = "<img onerror=alert(1)>.ts"
  await put(root, hostile, "type OtherCount = number\n")
  await edit(hostile, "while-paused")
  await page.locator("#status").filter({ hasText: "Paused" }).waitFor()
  assert.equal(await page.locator("#edits li").count(), 1)
  assert.equal(await page.locator("#detail").textContent(), selection)
  const recovery = page.waitForRequest((request) => request.url().includes("/events?cursor="))
  await page.getByRole("button", { name: "Reconnect", exact: true }).focus()
  await page.keyboard.press("Enter")
  const recoveryRequest = await recovery
  assert.ok(new URL(recoveryRequest.url()).searchParams.get("cursor"))
  await page.waitForFunction(() =>
    document.querySelector("#history-status").textContent.includes("Recovered retained history")
  )
  assert.equal(await page.locator("#detail").textContent(), selection)
  assert.equal(await page.locator("#edits li").count(), 1)
  await page.getByRole("button", { name: "Resume updates", exact: true }).click()
  await page.getByRole("button", { name: /<img onerror/ }).waitFor()
  assert.equal(await page.locator("#edits img").count(), 0)
  assert.equal(await page.locator("#detail").textContent(), selection)
  await page.waitForFunction(() => document.querySelector("#recording").textContent.includes("enabled"))
  await revealInspection(page, "#detail")
  await page.evaluate(() => {
    const detail = document.querySelector("#detail")
    const range = document.createRange()
    range.setStart(detail.firstChild, 0)
    range.setEnd(detail.firstChild, 20)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    detail.scrollTop = 30
  })
  const readingPosition = await page.locator("#detail").evaluate((element) => element.scrollTop)
  await put(root, "third.ts", "type ThirdCount = number\n")
  await edit("third.ts", "during-live-reading")
  await page.waitForFunction(() => document.querySelectorAll("#edits li").length === 3)
  assert.equal(await page.evaluate(() => getSelection().toString().length), 20)
  assert.equal(await page.locator("#detail").evaluate((element) => element.scrollTop), readingPosition)
  assert.equal(dispatched.length, 4)
  phase = "original model-input loss"
  const beforeInputLoss = await (await fetch(`${server.url}snapshot`)).json()
  const originalTransport = beforeInputLoss.records.find(
    (record) => record.source.id === requestReferences[0].sourceId && record.sequence === requestReferences[0].sequence
  )
  const originalInputs = beforeInputLoss.records.filter(
    (record) =>
      record.source.id === originalTransport.source.id &&
      record.correlation.receiptId === originalTransport.correlation.receiptId &&
      record.fact.kind === "model-input"
  )
  assert.equal(originalInputs.length, 2)
  for (const record of originalInputs) {
    await rm(join(root, "inspection", `${record.source.id}-${String(record.sequence).padStart(16, "0")}.json`))
  }
  await originalRow.click()
  await page.waitForFunction(() => document.querySelector("#input").textContent.includes("No retained model input"))
  assert.equal(await page.locator("#requests button").count(), 2, "Transport evidence survives model-input loss")
  await edit("type.ts", "reuse-existing-advice")
  await page.waitForFunction(() => document.querySelectorAll("#edits li").length === 4)
  assert.equal(dispatched.length, 4, "existing advice must not create another classifier invocation")
  const reused = page
    .locator("#edits")
    .getByRole("button", { name: /type\.ts/ })
    .first()
  await reused.focus()
  await page.keyboard.press("Enter")
  await page.waitForFunction(() => document.querySelector("#routes").textContent.includes("existing-advice"))
  const original = page
    .locator("#routes p")
    .filter({ hasText: requestDeclarations[0] })
    .getByRole("button", { name: "Inspect original evaluation", exact: true })
  await original.focus()
  await page.keyboard.press("Enter")
  await page.waitForFunction(() => document.querySelector("#routes").textContent.includes("fresh"))
  assert.equal(await page.locator("#exact").textContent(), dispatched[0].toString("utf8"))
  await reused.focus()
  await page.keyboard.press("Enter")
  await page.waitForFunction(() => document.querySelector("#routes").textContent.includes("existing-advice"))
  const secondOriginal = page
    .locator("#routes p")
    .filter({ hasText: requestDeclarations[1] })
    .getByRole("button", { name: "Inspect original evaluation", exact: true })
  await secondOriginal.focus()
  await page.keyboard.press("Enter")
  assert.equal(JSON.parse(await page.locator("#request-metadata").textContent()).declaration, requestDeclarations[1])
  assert.ok(
    Buffer.from(await page.locator("#exact").textContent()).equals(Buffer.from(copiedRequests[1])),
    "Original evaluation selects its own captured request bytes"
  )
  phase = "request loss"
  // Model unclassified loss of only this fixture's selected immutable request.
  const missingRequest = requestReferences[1]
  await rm(
    join(root, "inspection", `${missingRequest.sourceId}-${String(missingRequest.sequence).padStart(16, "0")}.json`)
  )
  const missingResponse = await (
    await fetch(`${server.url}payload/${missingRequest.sourceId}/${missingRequest.sequence}`)
  ).json()
  assert.equal(missingResponse.status, "missing")
  assert.equal(missingResponse.reason, "not-retained")
  phase = "request-loss replay"
  await page.waitForFunction(() => document.querySelectorAll("#requests button").length === 1)
  phase = "missing original request"
  assert.equal(await page.locator("#copy").isDisabled(), true)
  assert.match(await page.locator("#exact").textContent(), /unavailable.*cannot be reconstructed/)
  await reused.focus()
  await page.keyboard.press("Enter")
  await page.waitForFunction(() => document.querySelector("#routes").textContent.includes("existing-advice"))
  await page
    .locator("#routes p")
    .filter({ hasText: requestDeclarations[1] })
    .getByRole("button", { name: "Inspect original evaluation", exact: true })
    .focus()
  await page.keyboard.press("Enter")
  assert.equal(await page.locator("#requests button").count(), 1)
  assert.equal(await page.locator("#copy").isDisabled(), true)
  assert.match(await page.locator("#request-metadata").textContent(), /no retained transport evidence/)
  phase = "mixed outcomes and resident message"
  await put(root, "mixed.ts", "type MixedCount = number;\n")
  await put(root, "bad.ts", 'import { Amount } from "./support";\ntype BadCount = Amount;\n')
  await edit(["mixed.ts", "bad.ts"], "mixed-preparation")
  await page.waitForFunction(() => document.querySelectorAll("#edits li").length === 5)
  await page.getByRole("button", { name: /mixed\.ts, bad\.ts/ }).click()
  await page.waitForFunction(() => document.querySelector("#routes").textContent.includes("Mixed outcomes"))
  assert.match(await page.locator("#files").textContent(), /Skipped:[\s\S]*bad\.ts/)
  await page.waitForFunction(() =>
    /Omitted:[\s\S]*bad\.ts[\s\S]*import/.test(document.querySelector("#files").textContent)
  )
  assert.match(await page.locator("#files").textContent(), /Omitted:[\s\S]*bad\.ts[\s\S]*import/)
  assert.equal(dispatched.length, 5, "failed preparation must not create a classifier request")
  await put(root, "type.ts", "type OrderCount = string;\n")
  await Effect.runPromise(resident.listen())
  const response = await Effect.runPromise(
    residentRequestEffect(
      resident.paths,
      {
        requestRoute: "shared",
        operation: "collect",
        lifetime: resident.lifetime,
        root,
        advicee: advicee(),
        dispatch,
        composed: true
      },
      5000
    )
  )
  await retired.promise
  await originalRow.click()
  await page.waitForFunction(() => document.querySelector("#results").textContent.includes('"fate": "stale"'))
  assert.match(await page.locator("#results").textContent(), /Observed finding fates \(independent of submission\)/)
  assert.match(await page.locator("#results").textContent(), /"fate": "retained"/)
  assert.equal(dispatched.length, 5, "advice revalidation must not invent another classifier request")
  assert.equal(response.status, "advice")
  assert.equal(response.findingCount, 3)
  await messagePublished.promise
  await revealInspection(page, "#all-handoffs")
  await page.getByRole("button", { name: "Show all messages", exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll("#handoffs button").length === 1)
  const messages = (await (await fetch(`${server.url}snapshot`)).json()).records.filter(
    (record) => record.fact.kind === "agent-message"
  )
  const messageText = response.output.hookSpecificOutput.additionalContext
  assert.equal(await page.locator("#handoff-message").textContent(), messageText)
  assert.match(await page.locator("#handoff-output-status").textContent(), /Prepared by the resident/)
  assert.equal(await page.locator("#handoff-edits button").count(), 3)
  await page.getByRole("button", { name: /Open source edit · mixed\.ts/ }).click()
  await page.waitForFunction(() => document.querySelector("#files").textContent.includes("mixed.ts"))
  assert.equal(await page.locator("#panel-files").evaluate((panel) => panel.open), true)
  await page.evaluate(() => {
    const output = document.querySelector("#handoff-message")
    const range = document.createRange()
    range.setStart(output.firstChild, 0)
    range.setEnd(output.firstChild, 20)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    output.scrollTop = 30
  })
  const outputPosition = await page.locator("#handoff-message").evaluate((element) => element.scrollTop)
  await put(root, "after-handoff.ts", "type LaterCount = number;\n")
  await edit("after-handoff.ts", "while-reading-message")
  await page.waitForFunction(() => document.querySelectorAll("#edits li").length === 6)
  assert.equal(await page.evaluate(() => getSelection().toString().length), 20)
  assert.equal(await page.locator("#handoff-message").evaluate((element) => element.scrollTop), outputPosition)
  assert.equal(await page.locator("#handoff-message img").count(), 0)
  assert.equal(dispatched.length, 6)
  phase = "recording periods"
  for (const cycle of [1]) {
    phase = `recording disable ${cycle}`
    recordingPublished = nativeDeferred()
    await writeFile(join(root, ".hapsland.jsonc"), JSON.stringify({ ...inspectionConfig, sessionInspection: false }))
    await put(root, `disabled-${cycle}.ts`, `type Disabled${cycle}Count = number;\n`)
    await edit(`disabled-${cycle}.ts`, `disabled-${cycle}`, false)
    await recordingPublished.promise
    phase = `recording enable ${cycle}`
    recordingPublished = nativeDeferred()
    await writeFile(join(root, ".hapsland.jsonc"), JSON.stringify(inspectionConfig))
    await put(root, `enabled-${cycle}.ts`, `type Enabled${cycle}Count = number;\n`)
    await edit(`enabled-${cycle}.ts`, `enabled-${cycle}`)
    await recordingPublished.promise
  }
  phase = "recording periods display"
  await revealInspection(page, "#recording-periods")
  await page.waitForFunction(() => JSON.parse(document.querySelector("#recording-periods").textContent).length === 3)
  const periods = JSON.parse(await page.locator("#recording-periods").textContent())
  assert.deepEqual(
    periods.map((period) => period.state),
    ["enabled", "disabled", "enabled"]
  )
  assert.deepEqual(
    periods.map((period) => period.consentEpoch),
    [1, 1, 2]
  )
  assert.deepEqual(
    periods.map((period) => period.nextObservedTransition?.state ?? null),
    ["disabled", "enabled", null]
  )
  assert.ok(periods.every((period) => period.root === root && period.sourceId === periods[0].sourceId))
  assert.ok(
    periods.slice(0, -1).every((period) => period.nextObservedTransition.sequence > period.observedStart.sequence)
  )
  const retainedPeriods = await (await fetch(`${server.url}snapshot`)).json()
  assert.equal(retainedPeriods.records.filter((record) => record.fact.kind === "recording-state").length, 3)
  assert.ok(!JSON.stringify(retainedPeriods.records).includes("disabled-1.ts"))
  await page.waitForFunction(() => document.querySelectorAll("#edits li").length === 7)
  assert.equal(dispatched.length, 8)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.getByRole("button", { name: "Pause updates", exact: true }).click()
  const frozen = await page.locator("#detail").textContent()
  phase = "paused resident message expiry"
  historyNow += 2 * 86400000
  const expiredMessage = await (
    await fetch(`${server.url}payload/${messages[0].source.id}/${messages[0].sequence}`)
  ).json()
  assert.equal(expiredMessage.reason, "expired")
  await page.waitForFunction(() =>
    document.querySelector("#history-status").textContent.includes("Retained records expired")
  )
  assert.equal(await page.locator("#detail").textContent(), frozen)
  assert.deepEqual(errors, [])
  console.log(
    "inspection browser: real review history, per-unit request selection and exact copy, resident-owned messages, batch edit links, keyboard controls, live reading stability, paused reconnect and recovery gaps, observed recording periods, paused payload expiry and narrow layout passed"
  )
} finally {
  clearTimeout(deadline)
  await browser?.close()
  await Effect.runPromise(Scope.close(scope, Exit.void))
  await rm(root, { recursive: true, force: true })
}
