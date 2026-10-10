import assert from "node:assert/strict"
import { chromium } from "playwright"
import { createServer } from "vite"
import { readFileSync } from "node:fs"
const recording = JSON.parse(readFileSync(new URL("../src/preparation-resolver.generated.json", import.meta.url)))
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage(),
    errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(server.resolvedUrls.local[0] + "#import-graph")
  const section = page.locator("#import-graph")
  await section.getByRole("heading", { name: "Import exploration", exact: true }).waitFor()
  assert.equal(
    await page
      .locator("#preparation-resolver,#import-policy-fixtures,.resolver-boundaries,.resolver-policy-fixtures")
      .count(),
    0
  )
  assert.ok(
    await page.evaluate(
      () =>
        (document.querySelector("#canonical-replay").compareDocumentPosition(document.querySelector("#import-graph")) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
        0
    )
  )
  assert.equal(await section.locator(".trace-options button").count(), 2)
  assert.equal(await section.locator(".resolver-construction-node").count(), 4)
  assert.match(await section.locator(".resolver-construction").textContent(), /Expand declarations.*Build ReviewUnit/s)
  assert.equal(await section.locator("svg.resolver-process").count(), 1)
  for (const link of [
    "capture-to-inspect",
    "root-to-imports",
    "measure-to-accept",
    "complete-finalize",
    "incomplete-finalize",
    "finalize-result"
  ])
    assert.equal(await section.locator(`svg.resolver-process .resolver-link.${link}`).count(), 1)
  assert.match(
    await section.locator(".resolver-legend").textContent(),
    /ImportGraph.*declaration expansion.*external services/s
  )
  const slider = section.getByRole("slider", { name: "Resolver behavior timeline" })
  await slider.focus()
  await slider.press("ArrowRight")
  await page.waitForFunction(() =>
    document.querySelector(".import-graph-progress").textContent.includes("FindingRootLanguage")
  )
  await slider.press("ArrowLeft")
  await page.waitForFunction(() => document.querySelector(".import-graph-progress").textContent.includes("Starting"))

  assert.ok(await section.locator(".import-graph-diagram svg").count())
  const next = section.getByRole("button", { name: "Next import step", exact: true }),
    previous = section.getByRole("button", { name: "Previous import step", exact: true })
  assert.ok(await previous.isDisabled())
  await next.click()
  await page.waitForFunction(() =>
    document.querySelector(".import-graph-progress").textContent.includes("FindingRootLanguage")
  )
  await previous.click()
  await page.waitForFunction(() => document.querySelector(".import-graph-progress").textContent.includes("Starting"))
  const frames = recording.scenarios[0].frames
  assert.equal(frames.filter((frame) => frame.kind === "graph").length, recording.scenarios[0].history.length)
  for (const kind of ["graph", "local", "product", "continuation"]) {
    const index = frames.findIndex((frame) => frame.kind === kind)
    assert.ok(index >= 0, kind)
    await slider.fill(String(index))
    await page.waitForFunction(
      (expected) => document.querySelector(".resolver-current-stage").textContent === expected,
      frames[index].stage
    )
    assert.match(await section.locator(".resolver-step-kind").textContent(), new RegExp(kind))
    assert.ok(await section.getByText("Current internal transition · input / output", { exact: true }).count())
  }
  await section.getByRole("button", { name: "Result", exact: true }).click()
  await section.getByRole("heading", { name: "Returned ReviewUnit", exact: true }).waitFor()
  assert.match(await section.locator(".import-graph-facts").innerText(), /incomplete.*Excluded/)
  await section.getByText("Bend transition trace", { exact: true }).click()
  assert.match(await section.locator(".import-graph-log").innerText(), /skipImport.*Excluded/)
  assert.ok(await next.isDisabled())
  await section.getByRole("button", { name: "Branching tree budget", exact: true }).click()
  await page.waitForFunction(() =>
    document.querySelector(".import-graph-progress").textContent.includes("Resolver step 1")
  )
  await section.getByRole("button", { name: "Result", exact: true }).click()
  await section.getByRole("heading", { name: "Returned ReviewUnit", exact: true }).waitFor()
  assert.match(await section.locator(".import-graph-facts").innerText(), /TreeLimit/)
  assert.match(await section.locator(".import-graph-log").textContent(), /TreeLimit/)
  assert.ok(await section.locator(".import-graph-diagram svg rect").count())
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  assert.ok(await section.locator(".resolver-construction").evaluate((node) => node.scrollWidth > node.clientWidth))
  await section.locator(".resolver-construction").evaluate((node) => {
    node.scrollLeft = 250
  })
  assert.ok(await section.locator(".resolver-construction").evaluate((node) => node.scrollLeft > 0))

  await page.setViewportSize({ width: 1440, height: 1000 })
  await section.scrollIntoViewIfNeeded()
  await section.screenshot({ path: "/tmp/hapsland-current-import-exploration.png" })
  assert.deepEqual(errors, [])
  console.log(
    "Current resolver browser passed: one bottom section, familiar import diagram, both full resolver scenarios, shared history/tree/commands, rewind, source/result and narrow layout."
  )
} finally {
  await browser?.close()
  await server.close()
}
