import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { chromium } from "playwright"
import { createServer } from "vite"

const root = resolve(import.meta.dirname, "../../..")
const temporary = mkdtempSync(join(tmpdir(), "hapsland-alternate-canonical-"))
let server
let browser
try {
  const sourceBend = join(root, "packages/agent-flow-bend")
  const alternateBend = join(temporary, "packages/agent-flow-bend")
  cpSync(sourceBend, alternateBend, { recursive: true })
  writeFileSync(join(temporary, "package.json"), '{"type":"module"}\n')
  mkdirSync(join(temporary, "src/canonical"), { recursive: true })
  const dispatchFile = join(alternateBend, "Dispatch.bend")
  const original = readFileSync(dispatchFile, "utf8")
  const alternate = original
    .replace("def max_running() -> Nat:\n  8n", "def max_running() -> Nat:\n  3n")
    .replace("def max_requests() -> Nat:\n  8n", "def max_requests() -> Nat:\n  5n")
  assert.notEqual(alternate, original)
  assert.match(alternate, /def max_running\(\) -> Nat:\n  3n/)
  assert.match(alternate, /def max_requests\(\) -> Nat:\n  5n/)
  writeFileSync(dispatchFile, alternate)
  execFileSync("node", [join(alternateBend, "scripts/build-canonical.mjs")], { cwd: temporary, stdio: "pipe" })
  const alternateGenerated = join(temporary, "packages/canonical-policy/src/canonical/canonical.generated.js")
  const stockGenerated = join(root, "packages/canonical-policy/src/canonical/canonical.generated.js")
  const stock = await import(pathToFileURL(stockGenerated))
  const compiled = await import(pathToFileURL(alternateGenerated))
  assert.equal(stock.bendPreparationLimit(), 8)
  assert.equal(stock.bendJevRequestLimit(), 8)
  assert.equal(compiled.bendPreparationLimit(), 3)
  assert.equal(compiled.bendJevRequestLimit(), 5)

  server = await createServer({
    root: resolve(root, "packages/agent-flow-viz"),
    resolve: { alias: [{ find: "./canonical.generated.js", replacement: alternateGenerated }] },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [root, temporary] } }
  })
  const canonical = await server.ssrLoadModule("/src/canonical-replay.ts")
  const projection = canonical.replayCanonical([], 0).projection
  assert.deepEqual(projection.executionLimits, { preparation: 3, jevRequests: 5 })
  await server.listen()
  const url = server.resolvedUrls?.local[0]
  assert.ok(url)
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(url)
  const topology = page.locator(".topology-capacities")
  assert.ok((await topology.innerText()).includes(`Preparation running: 0/${projection.executionLimits.preparation}`))
  assert.ok(
    (await topology.innerText()).includes(
      `Jev in-flight: 0/${projection.executionLimits.jevRequests} · no Jev wait queue`
    )
  )
  assert.doesNotMatch(await topology.innerText(), /Preparation running: 0\/8|Jev in-flight: 0\/8/)
  const clear = canonical.CANONICAL_SCENARIOS.find(
    (scenario) => scenario.name === "clear is a distinct observed request result and duplicate is rejected"
  )
  assert.ok(clear)
  await page
    .locator("#canonical-replay")
    .getByLabel("Guided scenario", { exact: true })
    .selectOption({ label: clear.name })
  for (let step = 1; step <= 6; step++) {
    await page
      .locator("#canonical-replay")
      .getByRole("button", { name: /^Next:/ })
      .click()
    await page.waitForFunction(
      (expected) => document.querySelector(".canonical-progress")?.textContent?.includes(expected),
      `Guided step ${step} of 8`
    )
  }
  const occupied = canonical.replayCanonical(
    clear.events.slice(0, 6).map((event) => ({ event, origin: "guided" })),
    6,
    clear.limits
  ).projection
  assert.equal(occupied.dispatch.requests.length, 1)
  assert.deepEqual(occupied.executionLimits, projection.executionLimits)
  assert.ok(
    (await topology.innerText()).includes(
      `Jev in-flight: ${occupied.dispatch.requests.length}/${occupied.executionLimits.jevRequests} · no Jev wait queue`
    )
  )
  console.log(
    "Alternate compiled Bend execution limits reached the checked projection and browser topology: preparation 3, Jev 5."
  )
} finally {
  await browser?.close()
  await server?.close()
  rmSync(temporary, { recursive: true, force: true })
}
