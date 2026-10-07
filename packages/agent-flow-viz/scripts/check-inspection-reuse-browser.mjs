import assert from "node:assert/strict"
import { writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { chromium } from "playwright"
import { Effect, Scope, Exit } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { makeResidentRuntime } from "@hapsland/resident-runtime/resident/server"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"
import { adaptCodexDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import { addEvent, makeGitFixture, put } from "@hapsland/build-tooling/test-support/test-fixtures"
import { makeInspectionStorage } from "@hapsland/inspection-records/inspection/storage"
import { makeInspectionHttpServer } from "@hapsland/administration/inspection/http"
import { configuredRules, connectDefaultRuleFixture } from "@hapsland/build-tooling/test-support/default-rules"
import { readCredentialState } from "@hapsland/credential-storage/credentials/owner"
import { nativeDeferred } from "@hapsland/build-tooling/test-support/native-deferred"

const root = await makeGitFixture()
const scope = await Effect.runPromise(Scope.make())
let browser
let phase = "startup"
const deadline = setTimeout(() => {
  console.error("inspection reuse browser deadline expired at", phase)
  process.exit(1)
}, 45000)
const release = nativeDeferred()
try {
  await writeFile(
    join(root, ".hapsland.jsonc"),
    JSON.stringify({ version: 1, rules: connectDefaultRuleFixture(root), sessionInspection: true })
  )
  await put(root, "type.ts", "type OrderCount = number;\n")
  const history = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 4 * 1048576 })
  const started = nativeDeferred()
  let routeStored = nativeDeferred()
  let outcomeStored = nativeDeferred()
  let expectedRoute = "joined-pending"
  const dispatched = []
  const resident = await Effect.runPromise(
    makeResidentRuntime(residentPaths(join(root, "runtime")), undefined, {
      inspectionPersistence: {
        write: (record, encoded, publication) =>
          history.write(record, encoded, publication).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (record.fact.kind === "evaluation-route" && record.fact.route === expectedRoute)
                  routeStored.resolve()
                if (record.fact.kind === "evaluation-outcome") outcomeStored.resolve()
              })
            )
          )
      },
      offlineHttpClient: HttpClient.make((request) => {
        assert.equal(request.body._tag, "Uint8Array")
        dispatched.push(Buffer.from(request.body.body))
        started.resolve()
        return Effect.promise(() => release.promise).pipe(
          Effect.as(
            HttpClientResponse.fromWeb(
              request,
              new Response(
                JSON.stringify({
                  model: "jev-latest",
                  answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { type: "noul", noul: 0 }])),
                  usage: { input_tokens: 1, output_tokens: 1 }
                }),
                { status: 200, headers: { "content-type": "application/json" } }
              )
            )
          )
        )
      })
    }).pipe(Effect.provideService(Scope.Scope, scope))
  )
  const dispatch = {
    statePath: join(root, "consent"),
    userConfigPath: join(root, "absent-user"),
    controlled: null,
    credential: {
      name: "TYPESAFE_API_KEY",
      environmentValue: "OFFLINE_REUSE_KEY",

      generation: readCredentialState(join(root, "credential-state")).generation,
      statePath: join(root, "credential-state")
    }
  }
  const admit = async (path, tool_use_id, context = dispatch) => {
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, [path], { tool_use_id })))
    assert.ok(observation)
    assert.equal((await Effect.runPromise(resident.admit(observation, context))).status, "accepted")
  }
  phase = "join"
  await admit("type.ts", "owner")
  await started.promise
  await admit("type.ts", "join")
  await routeStored.promise
  assert.equal(dispatched.length, 1, "Joined work does not dispatch another request")
  release.resolve()
  await outcomeStored.promise
  await Effect.runPromise(resident.whenIdle())
  phase = "cache"
  expectedRoute = "cached"
  routeStored = nativeDeferred()
  await admit("type.ts", "cached")
  await routeStored.promise
  await Effect.runPromise(resident.whenIdle())
  assert.equal(dispatched.length, 1, "Cached work does not dispatch another request")
  phase = "controlled"
  outcomeStored = nativeDeferred()
  await put(root, "controlled.ts", "type ControlledCount = number;\n")
  await admit("controlled.ts", "controlled", {
    ...dispatch,
    credential: null,
    controlled: {
      answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0 }]))
    }
  })
  await outcomeStored.promise
  await Effect.runPromise(resident.whenIdle())
  assert.equal(dispatched.length, 1, "Controlled DecisionModel work does not invoke live HTTP transport")
  phase = "browser"
  let historyUnavailable = false
  const server = await Effect.runPromise(
    makeInspectionHttpServer({
      snapshot: () =>
        historyUnavailable ? Effect.fail(new Error("history temporarily unavailable")) : history.snapshot()
    }).pipe(Effect.provideService(Scope.Scope, scope))
  )
  const snapshot = await (await fetch(`${server.url}snapshot`)).json()
  assert.deepEqual(
    snapshot.records.filter((record) => record.fact.kind === "evaluation-route").map((record) => record.fact.route),
    ["fresh", "joined-pending", "cached", "fresh"]
  )
  assert.equal(snapshot.records.filter((record) => record.fact.kind === "model-input").length, 2)
  assert.equal(snapshot.records.filter((record) => record.fact.kind === "transport-invoked").length, 1)
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    permissions: ["clipboard-read", "clipboard-write"]
  })
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(server.url)
  await page.waitForFunction(() => document.querySelectorAll("#edits li").length === 4)
  historyUnavailable = true
  await page.waitForFunction(() =>
    document.querySelector("#history-status").textContent.includes("temporarily unavailable")
  )
  assert.equal(await page.locator("#edits li").count(), 4, "Temporary read failure preserves pre-existing edits")
  historyUnavailable = false
  await page.waitForFunction(
    () => !document.querySelector("#history-status").textContent.includes("temporarily unavailable")
  )
  const totals = {
    modelInvocations: { live: 1, controlled: 1, unknown: 0 },
    httpAttempts: { live: 1, controlled: 0, unknown: 0 }
  }
  assert.deepEqual(JSON.parse(await page.locator("#request-totals").textContent()), totals)
  for (const [index, route] of [
    [2, "joined-pending"],
    [1, "cached"]
  ]) {
    await page.locator("#edits button").nth(index).focus()
    await page.keyboard.press("Enter")
    await page.waitForFunction((expected) => document.querySelector("#routes").textContent.includes(expected), route)
    assert.equal(await page.locator("#requests button").count(), 0)
    assert.equal(await page.locator("#copy").isDisabled(), true)
    await page.getByRole("button", { name: "Inspect original evaluation", exact: true }).focus()
    await page.keyboard.press("Enter")
    assert.equal(await page.locator("#exact").textContent(), dispatched[0].toString("utf8"))
    const wire = JSON.parse(dispatched[0].toString("utf8"))
    assert.equal(await page.locator("#request-view").isVisible(), true)
    assert.equal(await page.locator("#exact").isVisible(), false, "Raw JSON remains secondary")
    assert.equal(await page.locator("#request-artifact code").textContent(), wire.state.artifact.source)
    assert.ok((await page.locator("#request-view").textContent()).includes(wire.model))
    const questionText = await page.locator("#request-questions").textContent()
    for (const [id, question] of Object.entries(wire.questions)) {
      assert.ok(questionText.includes(id), "Captured rule identity is preserved")
      assert.ok(questionText.includes(question.instructions), "Question comes from captured HTTP bytes")
      if (question.criteria) {
        assert.ok(questionText.includes(question.criteria.false))
        assert.ok(questionText.includes(question.criteria.true))
      }
    }
    assert.equal(await page.locator("#request-view script, #request-view img").count(), 0)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    if (process.env.HAPSLAND_UX_SCREENSHOTS === "1" && route === "cached") {
      await page.screenshot({ path: "/tmp/hapsland-request-ux-mobile.png", fullPage: true })
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.screenshot({ path: "/tmp/hapsland-request-ux-desktop.png", fullPage: true })
      await page.setViewportSize({ width: 375, height: 812 })
    }

    assert.deepEqual(JSON.parse(await page.locator("#request-totals").textContent()), totals)
  }
  await page.locator("#filter").fill("controlled.ts")
  assert.deepEqual(JSON.parse(await page.locator("#request-totals").textContent()), {
    modelInvocations: { live: 0, controlled: 1, unknown: 0 },
    httpAttempts: { live: 0, controlled: 0, unknown: 0 }
  })
  await page.locator("#filter").fill("")
  for (const repeat of [1, 2]) {
    // Observe the public DOM update from the new feed, rather than accepting
    // the previous connection's already-recovered label as readiness.
    await page.evaluate(() => {
      window.inspectionRecoveryObserved = false
      const label = document.querySelector("#history-status")
      const observer = new MutationObserver(() => {
        if (label.textContent.includes("Recovered retained history")) {
          window.inspectionRecoveryObserved = true
          observer.disconnect()
        }
      })
      observer.observe(label, { childList: true, characterData: true, subtree: true })
    })
    await page.getByRole("button", { name: "Reconnect", exact: true }).focus()
    await page.keyboard.press("Enter")
    await page.waitForFunction(() => window.inspectionRecoveryObserved)
    assert.deepEqual(
      JSON.parse(await page.locator("#request-totals").textContent()),
      totals,
      `Replay ${repeat} keeps observed totals idempotent`
    )
    assert.equal(await page.locator("#edits button").count(), 4)
  }
  phase = "missing policy activity"
  const livePolicy = snapshot.records.find(
    (record) => record.fact.kind === "unit-policy" && record.fact.activity === "live"
  )
  assert.ok(livePolicy)
  await rm(join(root, "inspection", `${livePolicy.source.id}-${String(livePolicy.sequence).padStart(16, "0")}.json`))
  await page.waitForFunction(
    () => JSON.parse(document.querySelector("#request-totals").textContent).modelInvocations.unknown === 1
  )
  assert.deepEqual(
    JSON.parse(await page.locator("#request-totals").textContent()),
    { modelInvocations: { live: 0, controlled: 1, unknown: 1 }, httpAttempts: { live: 0, controlled: 0, unknown: 1 } },
    "Missing policy does not invent live or controlled activity"
  )
  assert.deepEqual(errors, [])
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  console.log(
    "inspection reuse browser: real pending join and clear cache, original request provenance, controlled/live model and transport totals, filtered totals and idempotent replay, keyboard and narrow layout passed"
  )
} finally {
  clearTimeout(deadline)
  release.resolve()
  if (browser) await browser.close()
  await Effect.runPromise(Scope.close(scope, Exit.void))
}
