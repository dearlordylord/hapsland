import assert from "node:assert/strict"
import { writeFile, rm, lstat, readdir, statfs } from "node:fs/promises"
import { join } from "node:path"
import { chromium } from "playwright"
import { Effect, Scope, Exit, Fiber } from "effect"
import { Writable } from "node:stream"
import { submitDirectHookOutput, DirectHookSubmission } from "../../../src/resident/direct-hook-output.ts"
import { HookOutput, makeWritableHookOutput } from "../../../src/resident/hook-output.ts"
import { hookMonotonicMillis } from "../../../src/resident/hook-clock.ts"
import { InspectionSubmissionObservation, InspectionWriterObservation } from "../../../src/inspection/writer.ts"
import { attemptCodexHostOutput } from "../../../src/direct-event/writer.ts"
import { makeResidentRuntime } from "../../../src/resident/server.ts"
import { residentPaths } from "../../../src/resident/paths.ts"
import { adaptCodexDirectEvent } from "../../../src/direct-event/adapter.ts"
import { addEvent, makeGitFixture, put, advicee } from "../../../src/direct-event/test-fixtures.ts"
import { makeInspectionStorage } from "../../../src/inspection/storage.ts"
import { makeInspectionHttpServer } from "../../../src/inspection/http.ts"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { configuredRules } from "../../../src/policy/rules.ts"
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
    ruleOverrides: { r1_inferred_case: { threshold: 0.6, message: "Inspect browser 日本語 cases" } }
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
  const writerPublished = new Map(
    ["failed-before-write", "uncertain", "written"].map((state) => [state, nativeDeferred()])
  )
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
                if (record.fact.kind === "writer-evidence") writerPublished.get(record.fact.state)?.resolve()
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
      environmentOnly: true,
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
    assert.equal(Effect.runSync(resident.admit(observation, dispatch)).status, "accepted")
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
  await row.focus()
  await page.keyboard.press("Enter")
  await page.waitForFunction(() => document.querySelector("#detail").textContent.includes("edit-admission"))
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
  assert.match(await page.locator("#files").textContent(), /Recorded physical preparation reads:[\s\S]*support\.ts/)
  assert.match(await page.locator("#files").textContent(), /Source actually included[\s\S]*support\.ts · Amount/)
  assert.match(await page.locator("#source").textContent(), /日本語/)
  assert.match(await page.locator("#source").textContent(), /export type Amount = number;/)
  assert.match(await page.locator("#results").textContent(), /Effective threshold: 0.6/)
  assert.match(await page.locator("#results").textContent(), /Validated backend answers:[\s\S]*0.7/)
  assert.match(await page.locator("#results").textContent(), /Interpreted findings:[\s\S]*Inspect browser 日本語 cases/)
  const selection = await page.locator("#detail").textContent()
  await page.getByRole("button", { name: "Pause", exact: true }).click()
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
  await page.getByRole("button", { name: "Resume", exact: true }).click()
  await page.getByRole("button", { name: /<img onerror/ }).waitFor()
  assert.equal(await page.locator("#edits img").count(), 0)
  assert.equal(await page.locator("#detail").textContent(), selection)
  await page.waitForFunction(() => document.querySelector("#recording").textContent.includes("enabled"))
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
  await page
    .getByRole("button", { name: /type\.ts/ })
    .first()
    .click()
  await page.waitForFunction(() => document.querySelector("#input").textContent.includes("No retained model input"))
  assert.equal(await page.locator("#requests button").count(), 2, "Transport evidence survives model-input loss")
  await edit("type.ts", "reuse-existing-advice")
  await page.waitForFunction(() => document.querySelectorAll("#edits li").length === 4)
  assert.equal(dispatched.length, 4, "existing advice must not create another classifier invocation")
  const reused = page.getByRole("button", { name: /type\.ts/ }).last()
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
  phase = "mixed outcomes and native handoffs"
  await put(root, "mixed.ts", "type MixedCount = number;\n")
  await put(root, "bad.ts", 'import { Amount } from "./support";\ntype BadCount = Amount;\n')
  await edit(["mixed.ts", "bad.ts"], "mixed-preparation")
  await page.waitForFunction(() => document.querySelectorAll("#edits li").length === 5)
  await page.getByRole("button", { name: /mixed\.ts, bad\.ts/ }).click()
  await page.waitForFunction(() => document.querySelector("#routes").textContent.includes("Mixed recorded outcomes"))
  assert.match(await page.locator("#files").textContent(), /Recorded skipped preparation paths:[\s\S]*bad\.ts/)
  assert.match(await page.locator("#files").textContent(), /Recorded omissions:[\s\S]*bad\.ts[\s\S]*import/)
  assert.equal(dispatched.length, 5, "failed preparation must not create a classifier request")
  await put(root, "type.ts", "type OrderCount = string;\n")
  const response = await Effect.runPromise(resident.collect(root, advicee(), dispatch))
  await retired.promise
  await page
    .getByRole("button", { name: /type\.ts/ })
    .first()
    .click()
  await page.waitForFunction(() => document.querySelector("#results").textContent.includes('"fate": "stale"'))
  assert.match(await page.locator("#results").textContent(), /Observed finding fates \(independent of submission\)/)
  assert.match(await page.locator("#results").textContent(), /"fate": "retained"/)
  assert.equal(dispatched.length, 5, "advice revalidation must not invent another classifier request")
  assert.equal(response.status, "advice")
  assert.equal(response.findingCount, 3)
  const collected = {
    output: response.output,
    token: response.token,
    lifetime: resident.lifetime,
    paths: resident.paths,
    root,
    advicee: advicee(),
    activityPath: undefined,
    findingCount: response.findingCount
  }
  const submission = {
    begin: () => Effect.die("unexpected composed admission"),
    release: () => Effect.die("unexpected composed release"),
    writeCodex: () => Effect.die("unexpected synchronous writer"),
    record: () => Effect.void,
    acknowledge: () => resident.acknowledge(response.token).pipe(Effect.as(false))
  }
  const submit = (stream, deadlineAt) =>
    submitDirectHookOutput({ value: response.output, collected }, { composed: false, claude: true, deadlineAt }).pipe(
      Effect.provideService(HookOutput, makeWritableHookOutput(stream)),
      Effect.provideService(DirectHookSubmission, submission),
      Effect.provideService(InspectionSubmissionObservation, resident.inspectionSubmissionObservation)
    )
  let refusedWrites = 0
  const refused = new Writable({
    write: (_chunk, _encoding, complete) => {
      refusedWrites++
      complete()
    }
  })
  assert.equal(await Effect.runPromise(submit(refused, await Effect.runPromise(hookMonotonicMillis))), "timed-out")
  assert.equal(refusedWrites, 0)
  refused.end()
  await writerPublished.get("failed-before-write").promise
  const started = nativeDeferred()
  const interruptedBytes = []
  const interrupted = new Writable({
    write: (chunk) => {
      interruptedBytes.push(Buffer.from(chunk))
      started.resolve()
    }
  })
  const writing = await Effect.runPromise(
    Effect.forkIn(submit(interrupted, (await Effect.runPromise(hookMonotonicMillis)) + 5000), scope)
  )
  await started.promise
  await Effect.runPromise(Fiber.interrupt(writing))
  interrupted.destroy()
  await writerPublished.get("uncertain").promise
  const nativeBytes = []
  const native = new Writable({
    write: (chunk, _encoding, complete) => {
      nativeBytes.push(Buffer.from(chunk))
      complete()
    }
  })
  assert.equal(
    await Effect.runPromise(submit(native, (await Effect.runPromise(hookMonotonicMillis)) + 5000)),
    "written"
  )
  native.end()
  await writerPublished.get("written").promise
  const synchronousBytes = []
  const synchronous = new Writable({
    write: (chunk, _encoding, complete) => {
      synchronousBytes.push(Buffer.from(chunk))
      complete()
    }
  })
  const synchronousPublished = nativeDeferred()
  writerPublished.set("uncertain", synchronousPublished)
  const observing = resident.inspectionSubmissionObservation
  assert.equal(
    await Effect.runPromise(
      submitDirectHookOutput(
        { value: response.output, collected },
        { composed: false, claude: false, deadlineAt: (await Effect.runPromise(hookMonotonicMillis)) + 5000 }
      ).pipe(
        Effect.provideService(HookOutput, makeWritableHookOutput(synchronous)),
        Effect.provideService(InspectionSubmissionObservation, observing),
        Effect.provideService(DirectHookSubmission, {
          ...submission,
          acknowledge: () => Effect.succeed(false),
          writeCodex: (value) =>
            Effect.gen(function* () {
              const observer = yield* InspectionWriterObservation
              yield* Effect.sync(() =>
                attemptCodexHostOutput(
                  value,
                  (encoded) => {
                    synchronous.write(encoded)
                  },
                  observer
                )
              )
            })
        })
      )
    ),
    "written"
  )
  synchronous.end()
  await synchronousPublished.promise
  assert.equal(await page.locator("#handoffs").count(), 1)
  const allHandoffs = page.getByRole("button", { name: "Show all handoffs", exact: true })
  await allHandoffs.focus()
  await page.keyboard.press("Enter")
  await page.waitForFunction(() => document.querySelectorAll("#handoffs button").length === 4)
  const failed = page.getByRole("button", { name: /Handoff .*Failed before write/ })
  await failed.focus()
  await page.keyboard.press("Enter")
  await page.waitForFunction(() =>
    document.querySelector("#handoff-summary").textContent.includes("failed-before-write")
  )
  assert.match(await page.locator("#handoff-output-status").textContent(), /Failed before write/)
  const uncertain = page.getByRole("button", { name: /Handoff .*Uncertain output/ }).first()
  await uncertain.focus()
  await page.keyboard.press("Enter")
  await page.waitForFunction(() =>
    document.querySelector("#handoff-summary").textContent.includes('"state": "uncertain"')
  )
  await page.evaluate(() => {
    document.querySelector("#handoff-copy-status").textContent = ""
  })
  await page.getByRole("button", { name: "Copy exact output", exact: true }).click()
  await page.waitForFunction(() => document.querySelector("#handoff-copy-status").textContent === "Exact output copied")
  assert.ok(
    Buffer.from(await page.evaluate(() => navigator.clipboard.readText())).equals(Buffer.concat(interruptedBytes))
  )
  const synchronousHandoff = page.getByRole("button", { name: /Handoff .*Uncertain output/ }).last()
  await synchronousHandoff.focus()
  await page.keyboard.press("Enter")
  await page.waitForFunction(() =>
    document.querySelector("#handoffs button[aria-pressed=true]").textContent.startsWith("Handoff 4")
  )
  const synchronousEvidence = JSON.parse(await page.locator("#handoff-summary").textContent())
  assert.ok(synchronousEvidence.events.some((event) => event.state === "uncertain"))
  assert.ok(!synchronousEvidence.events.some((event) => event.state === "written"))
  await page.evaluate(() => {
    document.querySelector("#handoff-copy-status").textContent = ""
  })
  await page.getByRole("button", { name: "Copy exact output", exact: true }).click()
  await page.waitForFunction(() => document.querySelector("#handoff-copy-status").textContent === "Exact output copied")
  assert.ok(
    Buffer.from(await page.evaluate(() => navigator.clipboard.readText())).equals(Buffer.concat(synchronousBytes))
  )
  const written = page.getByRole("button", { name: /Handoff .*Output written/ })
  await written.focus()
  await page.keyboard.press("Enter")
  await page.waitForFunction(() =>
    document.querySelector("#handoff-summary").textContent.includes('"state": "written"')
  )
  const membership = JSON.parse(await page.locator("#handoff-summary").textContent())
  assert.equal(membership.findingIds.length, 3)
  assert.equal(membership.evaluations.length, 3)
  assert.equal(membership.recipient.toolUseId, advicee().toolUseId)
  assert.ok(!membership.events.some((event) => event.state === "acknowledged"))
  await page.evaluate(() => {
    document.querySelector("#handoff-copy-status").textContent = ""
  })
  await page.getByRole("button", { name: "Copy exact output", exact: true }).click()
  await page.waitForFunction(() => document.querySelector("#handoff-copy-status").textContent === "Exact output copied")
  assert.ok(Buffer.from(await page.evaluate(() => navigator.clipboard.readText())).equals(Buffer.concat(nativeBytes)))
  assert.equal(await page.locator("#handoff-exact").textContent(), Buffer.concat(nativeBytes).toString("utf8"))
  assert.equal(await page.locator("#handoff-edits button").count(), 3)
  const batchEdit = page.getByRole("button", { name: /Inspect batch edit · mixed\.ts/ })
  await batchEdit.focus()
  await page.keyboard.press("Enter")
  await page.waitForFunction(() => document.querySelector("#files").textContent.includes("mixed.ts"))
  assert.equal(await page.locator("#handoff-exact").textContent(), Buffer.concat(nativeBytes).toString("utf8"))
  await page.evaluate(() => {
    const output = document.querySelector("#handoff-exact")
    const range = document.createRange()
    range.setStart(output.firstChild, 0)
    range.setEnd(output.firstChild, 20)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    output.scrollTop = 30
  })
  const outputPosition = await page.locator("#handoff-exact").evaluate((element) => element.scrollTop)
  await put(root, "after-handoff.ts", "type LaterCount = number;\n")
  await edit("after-handoff.ts", "while-reading-output")
  await page.waitForFunction(() => document.querySelectorAll("#edits li").length === 6)
  assert.equal(await page.evaluate(() => getSelection().toString().length), 20)
  assert.equal(await page.locator("#handoff-exact").evaluate((element) => element.scrollTop), outputPosition)
  assert.equal(await page.locator("#handoff-exact img").count(), 0)
  assert.equal(dispatched.length, 6)
  phase = "recording periods"
  for (const cycle of [1, 2]) {
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
  await page.locator("#recording-periods").waitFor({ timeout: 2000 })
  await page.waitForFunction(() => JSON.parse(document.querySelector("#recording-periods").textContent).length === 5)
  const periods = JSON.parse(await page.locator("#recording-periods").textContent())
  assert.deepEqual(
    periods.map((period) => period.state),
    ["enabled", "disabled", "enabled", "disabled", "enabled"]
  )
  assert.deepEqual(
    periods.map((period) => period.consentEpoch),
    [1, 1, 2, 2, 3]
  )
  assert.deepEqual(
    periods.map((period) => period.nextObservedTransition?.state ?? null),
    ["disabled", "enabled", "disabled", "enabled", null]
  )
  assert.ok(periods.every((period) => period.root === root && period.sourceId === periods[0].sourceId))
  assert.ok(
    periods.slice(0, -1).every((period) => period.nextObservedTransition.sequence > period.observedStart.sequence)
  )
  const retainedPeriods = await (await fetch(`${server.url}snapshot`)).json()
  assert.equal(retainedPeriods.records.filter((record) => record.fact.kind === "recording-state").length, 5)
  assert.ok(!JSON.stringify(retainedPeriods.records).includes("disabled-1.ts"))
  assert.ok(!JSON.stringify(retainedPeriods.records).includes("disabled-2.ts"))
  await page.waitForFunction(() => document.querySelectorAll("#edits li").length === 8)
  assert.equal(dispatched.length, 10)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.getByRole("button", { name: "Pause", exact: true }).click()
  const frozen = await page.locator("#detail").textContent()
  const copiedBeforeExpiry = await page.evaluate(() => navigator.clipboard.readText())
  phase = "capacity eviction and payload expiry"
  const journal = join(root, "inspection")
  const allocation = (value) => Math.max(value.size, value.blocks * 512)
  let allocated = allocation(await lstat(journal))
  for (const name of await readdir(journal)) allocated += allocation(await lstat(join(journal, name)))
  const block = (await statfs(journal)).bsize
  historyLimits.storageBytes = Math.max(block * 16, allocated - block * 4)
  const evicted = await (await fetch(`${server.url}snapshot`)).json()
  assert.ok(evicted.losses.some((loss) => loss.reason === "capacity-evicted"))
  assert.ok(
    evicted.records.some(
      (record) =>
        record.fact.kind === "writer-evidence" &&
        record.fact.state === "written" &&
        record.fact.output.status === "available" &&
        record.fact.output.encoded === Buffer.concat(nativeBytes).toString("base64")
    )
  )
  await page.waitForFunction(() =>
    document.querySelector("#history-status").textContent.includes("Known capacity eviction")
  )
  assert.equal(await page.locator("#detail").textContent(), frozen)
  historyLimits.storageBytes = 4 * 1048576
  historyNow += 2 * 86400000
  await page.evaluate(() => {
    document.querySelector("#handoff-copy-status").textContent = ""
  })
  await page.getByRole("button", { name: "Copy exact output", exact: true }).click()
  await page.waitForFunction(
    () =>
      document.querySelector("#handoff-copy-status").textContent.length > 0 &&
      document.querySelector("#handoff-copy-status").textContent !== "Retrieving selected output"
  )
  assert.match(await page.locator("#handoff-copy-status").textContent(), /expired/)
  await page.waitForFunction(() =>
    document.querySelector("#history-status").textContent.includes("Retained records expired")
  )
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), copiedBeforeExpiry)
  assert.equal(await page.locator("#detail").textContent(), frozen)
  assert.deepEqual(errors, [])
  console.log(
    "inspection browser: real review history, per-unit request selection and exact copy, native writer attempts and exact copy, batch edit links, keyboard controls, live reading stability, paused reconnect and recovery gaps, observed recording periods, known capacity eviction, paused payload expiry and narrow layout passed"
  )
} finally {
  clearTimeout(deadline)
  await browser?.close()
  await Effect.runPromise(Scope.close(scope, Exit.void))
  await rm(root, { recursive: true, force: true })
}
