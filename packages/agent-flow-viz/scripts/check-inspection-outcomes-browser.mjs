import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { chromium } from "playwright"
import { Effect, Scope, Exit } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { makeResidentRuntime } from "../../../src/resident/server.ts"
import { residentPaths } from "../../../src/resident/paths.ts"
import { adaptCodexDirectEvent } from "../../../src/direct-event/adapter.ts"
import { addEvent, makeGitFixture, put } from "../../../src/direct-event/test-fixtures.ts"
import { makeInspectionStorage } from "../../../src/inspection/storage.ts"
import { makeInspectionHttpServer } from "../../../src/inspection/http.ts"
import { configuredRules } from "../../../src/policy/rules.ts"
import { readCredentialState } from "../../../src/credentials/secret-service.ts"
import { nativeDeferred } from "../../../src/test-support/native-deferred.ts"

const root = await makeGitFixture()
const scope = await Effect.runPromise(Scope.make())
let browser
let phase = "startup"
const deadline = setTimeout(() => {
  console.error("inspection outcomes browser deadline expired at", phase)
  process.exit(1)
}, 45000)
try {
  await writeFile(
    join(root, ".hapsland.jsonc"),
    JSON.stringify({
      version: 1,
      sessionInspection: true,
      ruleOverrides: { r1_inferred_case: { threshold: 0.6, message: "Configured finding message" } }
    })
  )
  const history = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 4 * 1048576 })
  let mode = "clear"
  let published = nativeDeferred()
  let started = nativeDeferred()
  const dispatched = []
  const secretMarker = "PRIVATE_PROVIDER_ERROR_BODY_MUST_NOT_BE_RETAINED"
  const resident = await Effect.runPromise(
    makeResidentRuntime(residentPaths(join(root, "runtime")), undefined, {
      inspectionPersistence: {
        write: (record, encoded, publication) =>
          history.write(record, encoded, publication).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (record.fact.kind === "evaluation-outcome") {
                  published.resolve()
                }
              })
            )
          )
      },
      offlineHttpClient: HttpClient.make((request) => {
        assert.equal(request.body._tag, "Uint8Array")
        dispatched.push(Buffer.from(request.body.body))
        started.resolve()
        if (mode === "timeout" || mode === "interrupted") return Effect.never
        const answers = Object.fromEntries(
          configuredRules.map((rule) => [
            rule.id,
            {
              type: "noul",
              noul: mode === "invalid-response" ? 2 : rule.id === "r1_inferred_case" && mode !== "clear" ? 0.7 : 0
            }
          ])
        )
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(
              mode === "backend"
                ? secretMarker
                : JSON.stringify({ model: "jev-latest", answers, usage: { input_tokens: 1, output_tokens: 1 } }),
              { status: mode === "backend" ? 503 : 200, headers: { "content-type": "application/json" } }
            )
          )
        )
      })
    }).pipe(Effect.provideService(Scope.Scope, scope))
  )
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
  const dispatch = {
    statePath: join(root, "consent"),
    userConfigPath: join(root, "absent-user"),
    controlled: null,
    credential: {
      name: "TYPESAFE_API_KEY",
      environmentValue: "OFFLINE_INSPECTION_CREDENTIAL_MUST_NOT_BE_RETAINED",
      environmentOnly: true,
      generation: readCredentialState(join(root, "credential-state")).generation,
      statePath: join(root, "credential-state")
    }
  }
  const cases = ["clear", "findings", "invalid-response", "backend", "oversized", "timeout", "interrupted"]
  for (const [index, name] of cases.entries()) {
    phase = name
    mode = name
    started = nativeDeferred()
    published = nativeDeferred()
    const path = `${name}.ts`
    await put(
      root,
      path,
      `type Case${index}Count = ${name === "oversized" ? '{ value: "' + "x".repeat(9000) + '" }' : "number"};\n`
    )
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, [path], { tool_use_id: name })))
    assert.ok(observation)
    assert.equal(Effect.runSync(resident.admit(observation, dispatch)).status, "accepted")
    if (name === "interrupted") {
      await started.promise
      await Effect.runPromise(resident.close)
    }
    phase = name + ": persistence"
    await published.promise
    phase = name + ": idle"
    await Effect.runPromise(resident.whenIdle())
    assert.equal(dispatched.length, index + 1, "Exactly one real transport invocation per unit")
    const row = page.getByRole("button", { name: new RegExp(name + "\\.ts") })
    await row.waitFor()
    await row.focus()
    await page.keyboard.press("Enter")
    const outcome = name === "oversized" ? "findings" : name
    phase = name + ": browser outcome"
    await page.waitForFunction(
      (expected) => document.querySelector("#results").textContent.includes(" · " + expected),
      outcome
    )
    const snapshot = await (await fetch(`${server.url}snapshot`)).json()
    const ingress = snapshot.records.find(
      (record) =>
        record.fact.kind === "edit-received" && record.fact.candidates.some((candidate) => candidate.path === path)
    )
    assert.ok(ingress)
    const records = snapshot.records.filter(
      (record) =>
        record.source.id === ingress.source.id && record.correlation.receiptId === ingress.correlation.receiptId
    )
    const outcomes = records
      .filter((record) => record.fact.kind === "evaluation-outcome")
      .map((record) => record.fact.outcome)
    assert.deepEqual(outcomes, [outcome], "Failure is distinct from clear and findings")
    assert.equal(
      records.some((record) => record.fact.kind === "validated-answers"),
      ["clear", "findings", "oversized"].includes(name)
    )
    const transport = records.find((record) => record.fact.kind === "transport-invoked")
    assert.ok(transport)
    const payload = await (await fetch(`${server.url}payload/${transport.source.id}/${transport.sequence}`)).json()
    if (name === "oversized") {
      assert.ok(dispatched[index].byteLength > 16384)
      assert.deepEqual(transport.fact.payload, { status: "missing", reason: "oversized" })
      assert.equal(payload.reason, "oversized")
      assert.equal(await page.locator("#copy").isDisabled(), true)
      assert.match(await page.locator("#exact").textContent(), /oversized/)
    } else {
      assert.equal(payload.status, "available")
      assert.ok(Buffer.from(payload.encoded, "base64").equals(dispatched[index]))
      await page.getByRole("button", { name: "Copy exact request", exact: true }).focus()
      await page.keyboard.press("Enter")
      await page.waitForFunction(() => document.querySelector("#copy-status").textContent === "Exact request copied")
      assert.ok(Buffer.from(await page.evaluate(() => navigator.clipboard.readText())).equals(dispatched[index]))
    }
    assert.equal(JSON.stringify(snapshot).includes(secretMarker), false)
    assert.equal(JSON.stringify(snapshot).includes(dispatch.credential.environmentValue), false)
    assert.equal(await page.locator("#handoffs li").count(), 0, "Classification does not invent a handoff")
  }
  assert.deepEqual(errors, [])
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  console.log(
    "inspection outcomes browser: real clear/findings, invalid response, backend error, timeout, interruption and oversized request absence; exact transport copies, private error/credential exclusion, keyboard and narrow layout passed"
  )
} finally {
  clearTimeout(deadline)
  if (browser) await browser.close()
  await Effect.runPromise(Scope.close(scope, Exit.void))
}
