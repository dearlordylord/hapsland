import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "vite";
const server = await createServer({ server: { host: "0.0.0.0", port: 0 } });
let browser;
try {
  await server.listen();
  const url = new URL("site.html", server.resolvedUrls.local[0]).href;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page
    .getByRole("heading", { name: /Review code changes with the definitions/ })
    .waitFor();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const instruction = await page.locator(".agent-instruction").innerText();
  await page
    .getByRole("button", { name: "Copy instruction", exact: true })
    .click();
  await page
    .locator("#copy-instruction + .copy-status")
    .getByText("Copied", { exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    instruction,
  );
  await page.getByText("Install manually", { exact: true }).click();
  await page
    .getByRole("button", { name: "Copy installation command", exact: true })
    .click();
  await page
    .locator("#copy-install + .copy-status")
    .getByText("Copied", { exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    "npm install -g --ignore-scripts @hapsland/hapsland",
  );
  await page
    .getByRole("button", { name: "Copy setup command", exact: true })
    .click();
  await page
    .locator("#copy-setup + .copy-status")
    .getByText("Copied", { exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    "hapsland setup",
  );
  // Exercise the same selection path used on the HTTP/IP preview.
  await page.evaluate(() => {
    navigator.clipboard.writeText = () =>
      Promise.reject(new Error("unavailable"));
  });
  await page
    .getByRole("button", { name: "Copy instruction", exact: true })
    .click();
  await page
    .locator("#copy-instruction + .copy-status")
    .getByText("Copied", { exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    instruction,
  );
  assert.equal(await page.locator("textarea[aria-hidden=true]").count(), 0);
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "copy-instruction",
  );
  const networkUrl = new URL("site.html", server.resolvedUrls.network[0]).href;
  const httpPage = await page.context().newPage();
  await httpPage.goto(networkUrl);
  assert.equal(await httpPage.evaluate(() => window.isSecureContext), false);
  await httpPage
    .getByRole("button", { name: "Copy instruction", exact: true })
    .click();
  await httpPage
    .locator("#copy-instruction + .copy-status")
    .getByText("Copied", { exact: true })
    .waitFor();
  await page.bringToFront();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    instruction,
  );
  await httpPage.close();

  assert.deepEqual(
    await page.locator("#setup .setup-command code").allTextContents(),
    ["npm install -g --ignore-scripts @hapsland/hapsland", "hapsland setup"],
  );
  assert.equal(
    await page.locator(".hero-illustration").getAttribute("class"),
    "hero-illustration phase-0",
  );
  await mkdir("docs/assets", { recursive: true });
  await page.locator(".hero-illustration").screenshot({
    animations: "disabled",
    path: "docs/assets/site-hero-edit.png",
  });
  assert.match(
    await page.locator(".phase-0 pre").textContent(),
    /\+  coverWidth: number;/,
  );
  assert.doesNotMatch(
    await page.locator(".phase-0 pre").textContent(),
    /interface Gallery/,
  );
  await page.getByRole("button", { name: "Next frame" }).click();
  await page.locator(".phase-1").waitFor();
  assert.equal(
    await page.locator(".hero-dependency-graph .example-code-card").count(),
    3,
  );
  assert.equal(
    await page.locator(".hero-dependency-graph .dependency-edge").count(),
    2,
  );
  await mkdir("docs/assets", { recursive: true });
  await page.locator(".hero-illustration").screenshot({
    animations: "disabled",
    path: "docs/assets/site-hero-related.png",
  });
  await page.getByRole("button", { name: "Play animation" }).click();
  await page.getByRole("button", { name: "Pause animation" }).waitFor();
  await page.getByRole("button", { name: "Pause animation" }).click();
  const paused = await page.locator(".hero-illustration").getAttribute("class");
  await page.waitForTimeout(50);
  const pausedPixels = await page
    .locator("#review-loop-canvas")
    .evaluate((canvas) => canvas.toDataURL());
  await page.waitForTimeout(150);
  assert.equal(
    await page
      .locator("#review-loop-canvas")
      .evaluate((canvas) => canvas.toDataURL()),
    pausedPixels,
    "paused circular renderer must stop changing",
  );
  assert.equal(
    await page.locator(".hero-illustration").getAttribute("class"),
    paused,
  );
  await page.getByRole("button", { name: "Next frame" }).click();
  await page.locator(".phase-2").waitFor();
  assert.equal(
    await page.locator(".hero-dependency-graph .example-code-card").count(),
    3,
  );
  assert.equal(
    await page.locator(".hero-dependency-graph .dependency-edge").count(),
    2,
  );
  await page.locator(".hero-illustration").screenshot({
    animations: "disabled",
    path: "docs/assets/site-hero-context.png",
  });
  await page.getByRole("button", { name: "Next frame" }).click();
  await page.locator(".phase-3").waitFor();
  assert.doesNotMatch(
    await page.locator(".hero-illustration").innerText(),
    /\d+%|threshold|artifact/,
    "feedback frame must explain the finding without classifier math or prompt vocabulary",
  );
  assert.equal(await page.locator(".sample-feedback p").count(), 1);
  assert.equal(
    await page.locator(".sample-feedback p").textContent(),
    "The type appears to store the same fact in places that can disagree.",
  );
  await mkdir("docs/assets", { recursive: true });
  await page.locator(".hero-illustration").screenshot({
    animations: "disabled",
    path: "docs/assets/site-hero-feedback.png",
  });
  await page.getByRole("button", { name: "Next frame" }).click();
  await page.locator(".phase-4").waitFor();
  await page.getByRole("button", { name: "Next frame" }).click();
  await page.locator(".phase-5").waitFor();
  await page
    .locator(".hero-illustration")
    .screenshot({
      animations: "disabled",
      path: "docs/assets/site-hero-recheck.png",
    });
  await page.getByRole("button", { name: "Replay animation" }).click();
  await page.locator(".phase-0").waitFor();
  await page.getByRole("button", { name: "Pause animation" }).click();
  const demo = page.locator("#explore");
  const finish = async () => {
    const next = demo.getByRole("button", { name: "Next step" });
    const total = Number(
      (await demo.locator(".step-explanation .micro").innerText()).split(
        "/",
      )[1],
    );
    for (let step = 2; step <= total; step++) {
      await next.click();
      await page.waitForFunction(
        (expected) =>
          document.querySelector(".step-explanation .micro")?.textContent ===
          expected,
        `STEP ${step} / ${total}`,
      );
    }
    assert.equal(await next.isDisabled(), true);
  };
  await finish();
  await demo.screenshot({
    animations: "disabled",
    path: "docs/assets/site-normal.png",
  });
  assert.equal(await demo.locator(".definition-node.included").count(), 3);
  assert.match(
    await demo.locator(".outline-heading").innerText(),
    /3 definitions/,
  );
  await demo
    .getByRole("button", { name: "User exclusion", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('.case-picker button[aria-pressed="true"]')
        ?.textContent === "User exclusion" &&
      document
        .querySelector(".step-explanation .micro")
        ?.textContent?.startsWith("STEP 1 /"),
  );
  assert.equal(await demo.locator(".definition-node.included").count(), 1);
  await finish();
  assert.match(
    await demo.locator(".node-2").innerText(),
    /Excluded before read/,
  );
  assert.equal(
    await demo
      .locator(".included-list")
      .getByText("Dimensions", { exact: true })
      .count(),
    0,
  );
  await demo.getByRole("button", { name: "Size limit", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.case-picker button[aria-pressed="true"]')
        ?.textContent === "Size limit" &&
      document
        .querySelector(".step-explanation .micro")
        ?.textContent?.startsWith("STEP 1 /"),
  );
  await finish();
  assert.match(
    await demo.locator(".node-2").innerText(),
    /Read locally · over size limit/,
  );
  assert.match(
    await demo.locator(".outline-heading").innerText(),
    /Code limit reached/,
  );
  assert.equal(
    await demo
      .locator(".included-list")
      .getByText("Dimensions", { exact: true })
      .count(),
    0,
  );
  await demo.getByRole("button", { name: "Restart", exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector(".step-explanation .micro")
      ?.textContent?.startsWith("STEP 1 /"),
  );
  assert.equal(await demo.locator(".definition-node.included").count(), 1);
  await mkdir("docs/assets", { recursive: true });
  await page.screenshot({
    animations: "disabled",
    path: "docs/assets/site-desktop.png",
    fullPage: true,
  });
  await demo
    .getByRole("button", { name: "User exclusion", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('.case-picker button[aria-pressed="true"]')
        ?.textContent === "User exclusion" &&
      document
        .querySelector(".step-explanation .micro")
        ?.textContent?.startsWith("STEP 1 /"),
  );
  await finish();
  await demo.screenshot({
    animations: "disabled",
    path: "docs/assets/site-exclusion.png",
  });
  await demo.getByRole("button", { name: "Size limit", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.case-picker button[aria-pressed="true"]')
        ?.textContent === "Size limit" &&
      document
        .querySelector(".step-explanation .micro")
        ?.textContent?.startsWith("STEP 1 /"),
  );
  await finish();
  await demo.screenshot({
    animations: "disabled",
    path: "docs/assets/site-size-limit.png",
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForFunction(
    () => document.querySelector("#review-loop-canvas")?.width === 640,
  );
  await page.locator("#setup").screenshot({
    animations: "disabled",
    path: "docs/assets/site-setup-mobile.png",
  });
  assert.equal(
    await page
      .locator(".setup-command pre")
      .first()
      .evaluate((el) => getComputedStyle(el).color),
    await page
      .locator(".wordmark")
      .first()
      .evaluate((el) => getComputedStyle(el).color),
    "setup commands use dark ink",
  );
  await page.screenshot({
    animations: "disabled",
    path: "docs/assets/site-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "mobile must not overflow horizontally",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.getByText("Reduced motion · manual steps").waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Play animation" }).count(),
    0,
  );
  await page.getByRole("button", { name: "Next frame" }).click();
  await page.locator(".phase-1").waitFor();
  await page.getByRole("button", { name: "Next frame" }).focus();
  await page.keyboard.press("Enter");
  await page.locator(".phase-2").waitFor();
  await page.locator(".hero-illustration").screenshot({
    animations: "disabled",
    path: "docs/assets/site-hero-context.png",
  });
  await page.locator(".skip-link").focus();
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent),
    "Skip to interactive example",
  );
  assert.deepEqual(errors, []);
  console.log(
    "site browser: exact clipboard text (API and HTTP/IP fallback), animation controls, graph modes, reset, mobile and reduced motion passed",
  );
} finally {
  await browser?.close();
  await server.close();
}
