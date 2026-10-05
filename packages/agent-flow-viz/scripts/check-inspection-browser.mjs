import assert from "node:assert/strict"
import { writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { chromium } from "playwright"
import { Effect, Scope, Exit } from "effect"
import { makeResidentRuntime } from "../../../src/resident/server.ts"
import { residentPaths } from "../../../src/resident/paths.ts"
import { adaptCodexDirectEvent } from "../../../src/direct-event/adapter.ts"
import { addEvent, makeGitFixture, put } from "../../../src/direct-event/test-fixtures.ts"
import { makeInspectionStorage } from "../../../src/inspection/storage.ts"
import { makeInspectionHttpServer } from "../../../src/inspection/http.ts"
import { nativeDeferred } from "../../../src/test-support/native-deferred.ts"

const root = await makeGitFixture()
const scope = await Effect.runPromise(Scope.make())
let browser
const deadline = setTimeout(() => {
  console.error("inspection browser deadline expired")
  process.exit(1)
}, 45000)
try {
  await put(root, "type.ts", "type OrderCount = number\n")
  await writeFile(join(root, ".hapsland.jsonc"), JSON.stringify({ version: 1, sessionInspection: true }))
  const history = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
  let published = nativeDeferred()
  const resident = await Effect.runPromise(
    makeResidentRuntime(residentPaths(join(root, "runtime")), undefined, {
      inspectionPersistence: {
        write: (record, encoded, allowed) =>
          history.write(record, encoded, allowed).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (record.fact.kind === "edit-admission") published.resolve()
              })
            )
          )
      }
    }).pipe(Effect.provideService(Scope.Scope, scope))
  )
  const dispatch = {
    statePath: join(root, "consent"),
    userConfigPath: join(root, "absent-user"),
    credential: null,
    controlled: { answers: {} }
  }
  const edit = async (path, toolUseId) => {
    const observation = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, [path], { tool_use_id: toolUseId }))
    )
    assert.ok(observation)
    published = nativeDeferred()
    assert.equal(Effect.runSync(resident.admit(observation, dispatch)).status, "accepted")
    await published.promise
  }
  await edit("type.ts", "before-dashboard")
  const server = await Effect.runPromise(
    makeInspectionHttpServer(history).pipe(Effect.provideService(Scope.Scope, scope))
  )
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(server.url)
  const row = page.getByRole("button", { name: /type\.ts/ })
  await row.waitFor()
  await row.focus()
  await page.keyboard.press("Enter")
  await page.waitForFunction(() => document.querySelector("#detail").textContent.includes("edit-admission"))
  const selection = await page.locator("#detail").textContent()
  await page.getByRole("button", { name: "Pause", exact: true }).click()
  const hostile = "<img onerror=alert(1)>.ts"
  await put(root, hostile, "type OtherCount = number\n")
  await edit(hostile, "while-paused")
  await page.getByRole("status").filter({ hasText: "Paused" }).waitFor()
  assert.equal(await page.locator("#edits li").count(), 1)
  assert.equal(await page.locator("#detail").textContent(), selection)
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
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  assert.deepEqual(errors, [])
  console.log(
    "inspection browser: real resident history, keyboard selection, pause/resume, safe text and narrow layout passed"
  )
} finally {
  clearTimeout(deadline)
  await browser?.close()
  await Effect.runPromise(Scope.close(scope, Exit.void))
  await rm(root, { recursive: true, force: true })
}
