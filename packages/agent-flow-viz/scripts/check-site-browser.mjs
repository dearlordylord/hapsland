import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"
import { preview } from "astro"
import { networkInterfaces } from "node:os"
const server = await preview({ server: { host: "0.0.0.0", port: 0 } })
let browser
try {
  const url = `http://127.0.0.1:${server.port}/`
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.clock.install()
  await page.goto(url)
  await page.getByRole("heading", { name: /^IMMEDIATE CODE REVIEW for coding agents$/ }).waitFor()
  assert.deepEqual(await page.locator(".hero-intro strong").allTextContents(), [
    "Catch questionable decisions",
    "Stop context poisoning before it starts"
  ])
  assert.equal(await page.locator("#review-loop-canvas").isVisible(), true)
  assert.equal(await page.locator(".hero-illustration button").count(), 6)
  const activeComment = page.locator('.comment-card[aria-hidden="false"] blockquote')
  const progress = () =>
    page.locator(".card-position-0 .comment-progress-fill").evaluate((el) => Number(el.style.transform.slice(7, -1)))
  const waitForComment = async (text) => {
    await page.clock.runFor(32)
    await activeComment.filter({ hasText: text }).waitFor()
  }
  const swipeComment = async (dx, dy = 0, cancel = false) => {
    const stack = page.locator(".comment-stack")
    await stack.dispatchEvent("pointerdown", {
      pointerType: "touch",
      pointerId: 1,
      button: 0,
      screenX: 240,
      screenY: 200
    })
    await page.clock.runFor(32)
    await page.locator(".comment-stack.is-swiping").waitFor()
    if (cancel) await stack.dispatchEvent("pointercancel", { pointerType: "touch", pointerId: 1 })
    await stack.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 1, screenX: 240 + dx, screenY: 200 + dy })
    await page.clock.runFor(32)
    await page.locator(".comment-stack:not(.is-swiping)").waitFor()
  }
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  assert.match(await activeComment.textContent(), /field be set in a state/)
  assert.equal(await page.locator('.comment-card[aria-hidden="true"]').count(), 5)
  assert.equal(await page.locator(".comment-deck a").count(), 0, "cards no longer contain rule links")
  assert.deepEqual(
    await page.locator(".comment-code code").allTextContents(),
    [
      'type Order = {\n  status: "pending" | "delivered";\n  deliveredAt: Date | null;\n};\n\nconst order: Order = {\n  status: "pending",\n  deliveredAt: new Date()\n};',
      'type UserId = string;\ntype OrderId = string;\n\nfunction userPath(id: UserId) {\n  return `/users/${id}`;\n}\n\nconst orderId: OrderId = "order-42";\nuserPath(orderId);',
      "type MapPin = {\n  latitude?: number;\n  longitude?: number;\n};\n\nconst pin: MapPin = {\n  latitude: 51.5\n};",
      'type Person = {\n  middleName?: string | null;\n};\n\nconst people: Person[] = [\n  {},\n  { middleName: null },\n  { middleName: "" }\n];',
      "type Count = number;\n\nconst missing: Count = -1;\nconst partial: Count = 1.5;",
      "function isExpired(at: number): boolean {\n  return Date.now() > at;\n}"
    ],
    "syntax highlighting preserves every sample character"
  )
  const cardTitles = await page.locator(".comment-card blockquote").allTextContents()
  assert.deepEqual(await page.locator(".comment-card-heading .micro").allTextContents(), [
    "MEANINGLESS COMBINATIONS",
    "DOMAIN VALUES",
    "PARTS OF ONE FACT",
    "ABSENCE CONFUSION",
    "NAME AND TYPE",
    "VISIBLE DEPENDENCIES"
  ])
  assert.deepEqual(await page.locator(".code-conflict").allTextContents(), [
    "  deliveredAt: new Date()",
    "  latitude: 51.5",
    "-1",
    "1.5"
  ])
  assert.equal(await page.locator(".code-attention").textContent(), "  middleName?: string | null;")
  assert.equal(await page.locator(".comment-card").nth(3).locator(".code-conflict").count(), 0)
  const conflict = page.locator(".comment-card").first().locator(".code-conflict")
  assert.equal(await conflict.count(), 1, "only the contradictory assignment is marked")
  assert.equal(await conflict.textContent(), "  deliveredAt: new Date()")
  assert.equal(await conflict.evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(246, 221, 214)")
  assert.equal(await conflict.evaluate((el) => getComputedStyle(el, "::before").content), '"×"')
  assert.equal(
    await conflict.evaluate((el) => getComputedStyle(el).textDecorationLine),
    "none",
    "the code remains readable"
  )
  const tokenColors = await page
    .locator(".comment-code .code-keyword, .comment-code .code-type, .comment-code .code-string")
    .evaluateAll((tokens) => tokens.map((token) => getComputedStyle(token).color))
  assert.ok(new Set(tokenColors).size >= 3, "keywords, types and strings have distinct syntax colors")
  assert.equal(
    await page.locator(".comment-deck button, .comment-controls").count(),
    0,
    "the deck has no visible controls"
  )
  assert.doesNotMatch(await page.locator(".comment-deck").innerText(), /Swipe to explore|Manual cards|[1-6] \/ 6/)
  assert.equal(await page.locator(".comment-stack").evaluate((el) => getComputedStyle(el).touchAction), "pan-y")
  // A pointer click can focus the stack, but must not turn into a permanent keyboard pause.
  await page.locator(".comment-stack").click()
  await page.mouse.move(0, 0)
  const clickedComment = await activeComment.textContent()
  await page.clock.runFor(4300)
  assert.notEqual(await activeComment.textContent(), clickedComment, "autoplay resumes after a click and pointer leave")
  await page.keyboard.press("ArrowLeft")
  await waitForComment(/field be set in a state/)
  // Reset at a frozen clock boundary, then inspect one timer's progress and card switch.
  await page.locator(".comment-stack").focus()
  await page.keyboard.press("ArrowRight")
  await waitForComment(/different domain meanings/)
  await page.keyboard.press("ArrowLeft")
  await waitForComment(/field be set in a state/)
  assert.equal(await progress(), 0)
  await page.locator(".hero h1").click()
  await page.mouse.move(0, 0)
  await page.clock.runFor(32)
  await page.locator('.comment-stack[aria-live="off"]').waitFor()
  await page.clock.runFor(1500)
  assert.match(await activeComment.textContent(), /field be set in a state/)
  assert.ok((await progress()) >= 0.35 && (await progress()) <= 0.4, "bar tracks the four-second cycle")
  await page.clock.runFor(2000)
  assert.match(
    await activeComment.textContent(),
    /field be set in a state/,
    "card remains until its progress completes"
  )
  assert.ok((await progress()) >= 0.85 && (await progress()) <= 0.9)
  await page.clock.runFor(500)
  await waitForComment(/different domain meanings/)
  assert.ok((await progress()) <= 0.025, "progress resets with the card switch")
  await page.clock.runFor(1000)
  await page.locator(".comment-stack").hover()
  await page.clock.runFor(32)
  await page.locator('.comment-stack[aria-live="polite"]').waitFor()
  const pausedProgress = await progress()
  await page.clock.fastForward(8000)
  assert.equal(await progress(), pausedProgress, "hover freezes progress and card selection together")
  assert.match(await activeComment.textContent(), /different domain meanings/)
  await page.locator(".comment-stack").focus()
  await page.mouse.move(0, 0)
  await page.clock.fastForward(8000)
  assert.equal(await progress(), pausedProgress, "focus keeps elapsed progress")
  await page.locator(".hero h1").click()
  await page.clock.runFor(32)
  await page.locator('.comment-stack[aria-live="off"]').waitFor()
  await page.clock.runFor(1000)
  await page.locator(".comment-stack").focus()
  assert.ok((await progress()) >= pausedProgress + 0.225, "resume continues from the paused fraction")
  // Real mouse input must finish a drag even when release is outside the stack.
  const mouseDrag = async (direction) => {
    const box = await page.locator(".comment-stack").boundingBox()
    assert.ok(box)
    const y = box.y + box.height * 0.35
    await page.mouse.move(box.x + box.width * (direction === "left" ? 0.7 : 0.3), y)
    await page.mouse.down()
    await page.clock.runFor(32)
    await page.mouse.move(direction === "left" ? box.x - 30 : box.x + box.width + 30, y, { steps: 8 })
    await page.mouse.up()
    await page.clock.runFor(32)
    assert.equal(await page.locator(".comment-stack.is-swiping").count(), 0, "outside release completes the gesture")
  }
  await mouseDrag("left")
  await waitForComment(cardTitles[2])
  await mouseDrag("right")
  await waitForComment(/different domain meanings/)
  await page.mouse.move(0, 0)
  await page.clock.runFor(700)
  assert.ok((await progress()) > 0.1, "autoplay resumes after a mouse drag outside the stack")
  for (let index = 2; index < cardTitles.length; index++) {
    await swipeComment(-120)
    await waitForComment(cardTitles[index])
    assert.equal(await progress(), 0, "swiping starts a fresh reading interval")
  }
  await swipeComment(-120)
  await waitForComment(cardTitles[0])
  await swipeComment(120)
  await waitForComment(/body read or change/)
  await swipeComment(-15, 5)
  assert.match(await activeComment.textContent(), /body read or change/, "small movements are taps")
  await swipeComment(-80, 140)
  assert.match(await activeComment.textContent(), /body read or change/, "vertical scrolling must not change the card")
  await swipeComment(-120, 0, true)
  assert.match(await activeComment.textContent(), /body read or change/, "cancelled gestures must not change the card")
  await page.keyboard.press("ArrowRight")
  await waitForComment(/field be set in a state/)
  await page.keyboard.press("ArrowLeft")
  await waitForComment(/body read or change/)
  assert.equal(await progress(), 0, "keyboard navigation resets progress")
  await page.locator(".hero h1").click()
  await page.mouse.move(0, 0)
  await page.clock.runFor(4000)
  await waitForComment(/field be set in a state/)
  await page.clock.resume()
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.clock.runFor(32)
  await page.locator('.comment-stack[aria-live="polite"]').waitFor()
  const reducedProgress = await progress()
  await page.clock.fastForward(8000)
  assert.equal(await progress(), reducedProgress, "reduced motion freezes progress")
  assert.match(
    await activeComment.textContent(),
    /field be set in a state/,
    "changing motion preference stops autoplay"
  )
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.clock.resume()
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  const instruction = await page.locator(".agent-instruction").innerText()
  await page.getByRole("button", { name: "Copy instruction", exact: true }).click()
  await page.locator("#copy-instruction + .copy-status").getByText("Copied", { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), instruction)
  assert.equal(await page.locator(".hero-install-row code").isVisible(), true)
  await page.getByRole("button", { name: "Copy", exact: true }).click()
  await page.locator("#copy-install + .copy-status").getByText("Copied", { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "brew install dearlordylord/tap/hapsland")
  await page.getByText("Run setup manually after installing", { exact: true }).click()
  await page.getByRole("button", { name: "Copy setup command", exact: true }).click()
  await page.locator("#copy-setup + .copy-status").getByText("Copied", { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "hapsland setup")
  // Exercise the same selection path used on the HTTP/IP preview.
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error("unavailable"))
  })
  await page.getByRole("button", { name: "Copy instruction", exact: true }).click()
  await page.locator("#copy-instruction + .copy-status").getByText("Copied", { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), instruction)
  assert.equal(await page.locator("textarea[aria-hidden=true]").count(), 0)
  assert.equal(await page.evaluate(() => document.activeElement?.id), "copy-instruction")
  const address = Object.values(networkInterfaces())
    .flat()
    .find((entry) => entry?.family === "IPv4" && !entry.internal)
  assert.ok(address, "HTTP clipboard fallback requires a local network interface")
  const networkUrl = `http://${address.address}:${server.port}/`
  const httpPage = await page.context().newPage()
  await httpPage.goto(networkUrl)
  assert.equal(await httpPage.evaluate(() => window.isSecureContext), false)
  await httpPage.getByRole("button", { name: "Copy instruction", exact: true }).click()
  await httpPage.locator("#copy-instruction + .copy-status").getByText("Copied", { exact: true }).waitFor()
  await page.bringToFront()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), instruction)
  await httpPage.close()

  assert.deepEqual(await page.locator("#setup .setup-command code").allTextContents(), ["hapsland setup"])
  await page.reload()
  await page.locator(".hero-illustration.phase-0").waitFor()
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  assert.equal(await page.locator("#review-loop-canvas").isVisible(), true)
  assert.equal(await page.locator(".animation-controls, #example-starter").count(), 0)
  const stages = page.locator(".phase-steps button")
  assert.equal(await stages.count(), 6)
  assert.equal(await page.locator(".hero-illustration button").count(), 6, "stages are the sole animation controls")
  const selectStage = async (index) => {
    await stages.nth(index).click()
    await page.clock.runFor(32)
    await page.locator(`.hero-illustration.phase-${index}`).waitFor()
    assert.equal(await stages.nth(index).getAttribute("aria-current"), "step")
  }
  await mkdir("docs/assets", { recursive: true })
  await page.locator(".hero-illustration").screenshot({ path: "docs/assets/site-animation-starter.png" })
  for (const index of [5, 3, 1, 4, 2, 0]) await selectStage(index)
  await stages.nth(2).focus()
  await page.keyboard.press("Enter")
  await page.clock.runFor(32)
  await page.locator(".hero-illustration.phase-2").waitFor()
  await page.clock.runFor(3800)
  await page.locator(".hero-illustration.phase-2").waitFor()
  await selectStage(2)
  await page.clock.runFor(3800)
  await page.locator(".hero-illustration.phase-2").waitFor()
  await page.clock.runFor(300)
  await page.locator(".hero-illustration.phase-3").waitFor()
  // Selecting a stage restarts its four-second dwell and then keeps playing.
  await selectStage(0)
  await page.locator(".hero-illustration").screenshot({ path: "docs/assets/site-hero-edit.png" })
  assert.match(await page.locator("[data-site-frame]:not([hidden]) pre").textContent(), /\+  coverWidth: number;/)
  assert.doesNotMatch(await page.locator("[data-site-frame]:not([hidden]) pre").textContent(), /interface Gallery/)
  await selectStage(1)
  assert.equal(
    await page.locator("[data-site-frame]:not([hidden]) .hero-dependency-graph .example-code-card").count(),
    3
  )
  assert.equal(await page.locator("[data-site-frame]:not([hidden]) .hero-dependency-graph .dependency-edge").count(), 2)
  await page.locator(".hero-illustration").screenshot({ path: "docs/assets/site-hero-related.png" })
  await selectStage(2)
  assert.equal(
    await page.locator("[data-site-frame]:not([hidden]) .hero-dependency-graph .example-code-card").count(),
    3
  )
  assert.equal(await page.locator("[data-site-frame]:not([hidden]) .hero-dependency-graph .dependency-edge").count(), 2)
  await page.locator(".hero-illustration").screenshot({ path: "docs/assets/site-hero-context.png" })
  await selectStage(3)
  assert.doesNotMatch(await page.locator(".hero-illustration").innerText(), /\d+%|threshold|artifact/)
  assert.equal(await page.locator(".sample-feedback p").count(), 1)
  assert.equal(
    await page.locator(".sample-feedback p").textContent(),
    "The type appears to store the same fact in places that can disagree."
  )
  await page.locator(".hero-illustration").screenshot({ path: "docs/assets/site-hero-feedback.png" })
  await selectStage(4)
  await selectStage(5)
  await page.locator(".hero-illustration").screenshot({ path: "docs/assets/site-hero-recheck.png" })
  await page.clock.runFor(3800)
  await page.locator(".hero-illustration.phase-5").waitFor()
  await page.clock.runFor(300)
  await page.locator(".hero-illustration.phase-0").waitFor()
  assert.equal(await page.locator("#review-loop-canvas").isVisible(), true)
  await page.locator(".hero-illustration").screenshot({ path: "docs/assets/site-animation-complete.png" })
  for (let index = 1; index <= 5; index++) {
    await page.clock.runFor(4000)
    await page.locator(`.hero-illustration.phase-${index}`).waitFor()
  }
  await page.clock.runFor(4000)
  await page.locator(".hero-illustration.phase-0").waitFor()
  await page.clock.resume()
  await page.screenshot({ animations: "disabled", path: "docs/assets/site-desktop.png", fullPage: true })
  await page.setViewportSize({ width: 375, height: 812 })

  await page.locator("#setup").screenshot({ animations: "disabled", path: "docs/assets/site-setup-mobile.png" })
  assert.equal(
    await page
      .locator(".setup-command pre")
      .first()
      .evaluate((el) => getComputedStyle(el).color),
    await page
      .locator(".wordmark")
      .first()
      .evaluate((el) => getComputedStyle(el).color),
    "setup outputs use dark ink"
  )
  await page.screenshot({ animations: "disabled", path: "docs/assets/site-mobile.png", fullPage: true })
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    "mobile must not overflow horizontally"
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.reload()
  await waitForComment(/field be set in a state/)
  assert.equal(await page.getByRole("button", { name: /(?:Play|Pause) review comments/ }).count(), 0)
  await page.clock.fastForward(8000)
  assert.equal(await progress(), 0, "reduced-motion initial progress is static")
  assert.match(await activeComment.textContent(), /field be set in a state/, "reduced-motion load is static")
  await swipeComment(-120)
  await waitForComment(/different domain meanings/)
  assert.match(await activeComment.textContent(), /different domain meanings/)
  assert.equal(
    await page.locator(".card-position-0").evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
    "reduced motion disables card transitions"
  )
  await page.locator(".comment-stack").focus()
  await page.keyboard.press("ArrowLeft")
  await waitForComment(cardTitles[0])
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 })
    const barPositions = []
    for (let index = 0; index < cardTitles.length; index++) {
      await waitForComment(cardTitles[index])
      const bar = await page.locator(".card-position-0 .comment-progress").boundingBox()
      assert.ok(bar)
      barPositions.push(bar.y + (await page.evaluate(() => scrollY)))
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      const contentFits = await page
        .locator(".card-position-0")
        .evaluate((card) => card.scrollHeight <= card.clientHeight)
      assert.ok(contentFits, `card ${index + 1} content fits at ${width}px`)
      await page.locator(".comment-stack").focus()
      await page.keyboard.press("ArrowRight")
    }
    assert.ok(Math.max(...barPositions) - Math.min(...barPositions) < 0.5, `all six progress bars align at ${width}px`)
  }
  await selectStage(1)
  await stages.nth(2).focus()
  await page.keyboard.press("Enter")
  await page.clock.runFor(32)
  await page.locator(".hero-illustration.phase-2").waitFor()
  const staticPixels = await page.locator("#review-loop-canvas").evaluate((canvas) => canvas.toDataURL())
  await page.clock.runFor(8000)
  await page.locator(".hero-illustration.phase-2").waitFor()
  assert.equal(
    await page.locator("#review-loop-canvas").evaluate((canvas) => canvas.toDataURL()),
    staticPixels,
    "reduced motion keeps the selected canvas static"
  )
  assert.equal(await page.locator(".hero-illustration button").count(), 6)
  await page.locator(".hero-illustration").screenshot({ path: "docs/assets/site-hero-context.png" })
  await page.locator(".skip-link").focus()
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Skip to interactive example")
  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 1000 } })
  const staticPage = await staticContext.newPage()
  await staticPage.goto(url)
  await staticPage.getByRole("heading", { name: /^IMMEDIATE CODE REVIEW for coding agents$/ }).waitFor()
  for (const card of await staticPage.locator(".comment-card blockquote").all())
    assert.equal(await card.isVisible(), true)
  assert.deepEqual(await staticPage.locator(".comment-card blockquote").allTextContents(), cardTitles)
  assert.equal(
    await staticPage.locator(".hero-install-row code").textContent(),
    "brew install dearlordylord/tap/hapsland"
  )
  assert.equal(await staticPage.locator("noscript img").isVisible(), true)
  assert.equal(await staticPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await staticContext.close()
  assert.deepEqual(errors, [])
  console.log(
    "site browser: review deck synchronized progress/autoplay, tokenized code, mouse click/resume, mouse dragging across boundaries, touch swipe discrimination/cancellation, keyboard, focus/hover and reduced motion; exact clipboard text (API and HTTP/IP fallback), continuous animation, selectable stages with fresh dwell, full recheck before looping, graph modes, mobile, static reduced motion and readable HTML without JavaScript passed"
  )
} finally {
  await browser?.close()
  await server.stop()
}
