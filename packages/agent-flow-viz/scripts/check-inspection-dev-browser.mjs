import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { chromium } from "playwright"
import { Effect, Scope, Exit } from "effect"
import { makeDevelopmentInspectionPage } from "../../../scripts/dev-inspection.mjs"
import { makeInspectionHttpServer } from "../../../src/inspection/http.ts"

const fixture = await mkdtemp(join(tmpdir(), "hapsland-inspection-dev-"))
const source = join(fixture, "page.ts")
const original = await readFile(new URL("../../../src/inspection/page.ts", import.meta.url), "utf8")
const scope = await Effect.runPromise(Scope.make())
let browser
let phase = "server startup"
const deadline = setTimeout(() => {
  console.error("inspection development browser deadline at", phase)
  process.exit(1)
}, 45_000)
try {
  await writeFile(source, original)
  const loadPage = makeDevelopmentInspectionPage(pathToFileURL(source))
  const server = await Effect.runPromise(
    makeInspectionHttpServer(
      { snapshot: () => Effect.succeed({ records: [], losses: [] }) },
      { page: Effect.tryPromise({ try: loadPage, catch: (error) => error }) }
    ).pipe(Effect.provideService(Scope.Scope, scope))
  )
  phase = "browser launch"
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (error) => {
    errors.push(error.message)
    console.error("inspection dev page error:", error.message)
  })
  page.on("console", (message) => {
    if (message.type() === "error") console.error("inspection dev console:", message.text())
  })
  phase = "initial page"
  assert.equal((await page.goto(server.url)).status(), 200)
  await page.getByRole("heading", { name: "Hapsland inspection", exact: true }).waitFor()
  assert.equal(await page.getByRole("button", { name: "Copy message", exact: true }).count(), 0)
  phase = "automatic reload"
  assert.equal(await page.evaluate(() => document.hidden), false)
  await writeFile(source, original.replaceAll("Hapsland inspection", "Inspection dev reload"))
  assert.ok(
    (await (await fetch(server.url)).text()).includes("Inspection dev reload"),
    "server must load changed page source"
  )
  await page.getByRole("heading", { name: "Inspection dev reload", exact: true }).waitFor({ timeout: 5000 })
  assert.equal(page.url(), server.url, "page edits must keep the same capability URL")
  phase = "syntax error"
  await writeFile(source, "This is intentionally invalid JavaScript!")
  assert.equal((await fetch(server.url)).status, 503)
  phase = "syntax recovery"
  await writeFile(source, original.replaceAll("Hapsland inspection", "Inspection dev recovered"))
  await page.getByRole("heading", { name: "Inspection dev recovered", exact: true }).waitFor({ timeout: 5000 })
  assert.equal(page.url(), server.url)
  assert.deepEqual((await (await fetch(`${server.url}snapshot`)).json()).records, [])
  phase = "route protection"
  assert.equal((await fetch(server.url, { headers: { Origin: "https://example.com" } })).status, 403)
  assert.equal((await fetch(`${server.origin}/`)).status, 404)
  assert.deepEqual(errors, [])
  console.log(
    "inspection dev: real page reload, stable private URL, syntax-error recovery and protected journal routes passed"
  )
} finally {
  clearTimeout(deadline)
  await browser?.close()
  await Effect.runPromise(Scope.close(scope, Exit.void))
  await rm(fixture, { recursive: true, force: true })
}
