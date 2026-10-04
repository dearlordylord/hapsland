import assert from "node:assert/strict"
import { chromium } from "playwright"
import { createServer } from "vite"

const server = await createServer({ logLevel: "silent", server: { host: "127.0.0.1", port: 0, hmr: false } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1512, height: 1100 } })
  await page.goto(server.resolvedUrls.local[0])
  const click = async (name) => {
    await page.getByRole("button", { name, exact: true }).click()
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  }
  await page.getByLabel("Agent count", { exact: true }).fill("6")
  await click("Start resident")
  await click("Select agent 2")
  await page.getByLabel("Playback speed (virtual ms / wall ms)", { exact: true }).fill("100")
  await click("Apply playback speed")
  await click("Play resident")
  const input = page.getByLabel("Simulated edit duration (virtual ms)", { exact: true })
  const countDraft = page.getByLabel("Agent count", { exact: true })
  await countDraft.focus()
  await page.keyboard.press("ControlOrMeta+A")
  await page.keyboard.press("Backspace")
  await page.keyboard.press("3")
  await page.waitForTimeout(180)
  assert.equal(await countDraft.inputValue(), "3")
  await page.keyboard.press("Backspace")
  await page.keyboard.press("6")
  await page.waitForTimeout(180)
  assert.equal(await countDraft.inputValue(), "6")
  await input.focus()
  await input.evaluate((node) => {
    window.draftInput = node
  })
  await page.keyboard.press("ControlOrMeta+A")
  await page.keyboard.press("Backspace")
  let expected = ""
  for (const key of "1234") {
    await page.keyboard.press(key)
    expected += key
    // Observe during playback, not only after all queued messages have settled.
    for (let sample = 0; sample < 3; sample++) {
      await page.waitForTimeout(60)
      assert.equal(await input.inputValue(), expected)
      assert.ok(await input.evaluate((node) => node === window.draftInput && node === document.activeElement))
    }
  }
  await page.keyboard.press("Backspace")
  assert.equal(await input.inputValue(), "123")
  await page.keyboard.press("ControlOrMeta+A")
  await page.keyboard.press("Backspace")
  // Number inputs retain an internal incomplete exponent even though .value is empty.
  for (const key of "1e3") {
    await page.keyboard.press(key)
    await page.waitForTimeout(180)
  }
  assert.equal(await input.inputValue(), "1e3")
  await page.keyboard.press("ControlOrMeta+A")
  await page.keyboard.type("456")
  await page.keyboard.press("Enter") // No wait between the last input and form submission.
  await click("Export replay")
  await page.waitForFunction(() => document.querySelector('[aria-label="Replay JSON"]').value.startsWith("{"))
  const replay = JSON.parse(await page.getByLabel("Replay JSON", { exact: true }).inputValue())
  assert.equal(replay.controls.findLast((entry) => entry.control.kind === "editDuration").control.durationMs, 456)
  assert.equal(replay.controls.findLast((entry) => entry.control.kind === "editDuration").control.agent, "agent-2")
  assert.equal(await input.inputValue(), "456")
  await input.focus()
  await page.keyboard.press("ControlOrMeta+A")
  await page.keyboard.type("789")
  await click("Apply edit duration") // Click also submits the latest draft without settling delay.
  assert.equal(await input.inputValue(), "789")
  await click("Select agent 1")
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Simulated edit duration (virtual ms)"]').value === "1"
  )
  await click("Select agent 2")
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Simulated edit duration (virtual ms)"]').value === "789"
  )
  const viewport = page.locator(".ensemble-viewport")
  await viewport.scrollIntoViewIfNeeded()
  const samples = await viewport.evaluate(async (node) => {
    const values = []
    for (let i = 0; i < 40; i++) {
      node.dispatchEvent(new WheelEvent("wheel", { deltaY: -20, bubbles: true, cancelable: true }))
      await new Promise((resolve) => requestAnimationFrame(resolve))
      values.push(Number(document.querySelector('[aria-label="Zoom"]').value))
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
    values.push(Number(document.querySelector('[aria-label="Zoom"]').value))
    return values
  })
  assert.ok(
    samples.every((value, index) => index === 0 || value >= samples[index - 1]),
    `Zoom rollback: ${samples}`
  )
  assert.ok(samples.at(-1) > samples[0], `No wheel progress: ${samples}`)
  assert.equal(await input.inputValue(), "789")
  const slider = page.getByLabel("Zoom", { exact: true })
  // Let the preceding wheel messages finish before testing a separate slider gesture.
  let priorZoom = "",
    stableZoom = 0
  for (let attempt = 0; attempt < 40 && stableZoom < 4; attempt++) {
    await page.waitForTimeout(100)
    const currentZoom = await slider.inputValue()
    stableZoom = currentZoom === priorZoom ? stableZoom + 1 : 0
    priorZoom = currentZoom
  }
  assert.equal(stableZoom, 4, "preceding wheel gesture settles while playback continues")
  await slider.evaluate((node) => node.scrollIntoView({ block: "center" }))
  const box = await slider.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
  const sliderSamples = []
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height / 2)
  await page.mouse.down()
  for (let i = 0; i < 16; i++) {
    await page.mouse.move(box.x + box.width * (0.35 + i * 0.025), box.y + box.height / 2)
    await page.waitForTimeout(40)
    sliderSamples.push(Number(await slider.inputValue()))
  }
  await page.mouse.up()
  assert.ok(sliderSamples.at(-1) > sliderSamples[0] + 30, `Slider pointer did not progress: ${sliderSamples}`)
  assert.ok(
    sliderSamples.every((value, index) => !index || value >= sliderSamples[index - 1]),
    `Slider rollback: ${sliderSamples}`
  )
  const releasedZoom = Number(await slider.inputValue())
  await page.waitForTimeout(350)
  assert.equal(Number(await slider.inputValue()), releasedZoom, "slider commit survives playback")
  await input.evaluate((node) => {
    window.preStartInput = node
  })
  await click("Start resident") // Same selected agent still replaces the draft explicitly.
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Simulated edit duration (virtual ms)"]') !== window.preStartInput
  )
  assert.equal(await input.inputValue(), "789")
  console.log(
    `Live draft browser passed: stable per-character edits, partial numeric buffer, immediate Enter/click Apply, agent scope and monotonic ${samples[0]}→${samples.at(-1)} wheel / ${sliderSamples[0]}→${sliderSamples.at(-1)} slider zoom during playback.`
  )
} finally {
  await browser?.close()
  await server.close()
}
