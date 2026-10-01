import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator(".simulation-file-trees summary").waitFor();
  const summaries = page.locator("summary");
  const count = await summaries.count();
  assert.ok(count >= 12, "audit disclosures across the simulator, replay, diagram and import example");
  for (let index = 0; index < count; index++) {
    const summary = summaries.nth(index);
    if (!await summary.isVisible()) continue;
    assert.equal(await summary.evaluate(node => getComputedStyle(node).cursor), "pointer");
    await summary.focus();
    const before = await summary.evaluate(node => node.parentElement.open);
    await summary.press("Enter");
    await page.waitForFunction(({ index, before }) => document.querySelectorAll("summary")[index].parentElement.open !== before, { index, before });
    assert.equal(await summary.evaluate(node => getComputedStyle(node).outlineStyle), "solid");
    await summary.press("Space");
    await page.waitForFunction(({ index, before }) => document.querySelectorAll("summary")[index].parentElement.open === before, { index, before });
  }
  const mix = page.locator(".simulation-outcome-mix summary");
  const trees = page.locator(".simulation-file-trees summary");
  const style = node => {
    const style = getComputedStyle(node);
    return { cursor: style.cursor, padding: style.padding, minHeight: style.minHeight, fontWeight: style.fontWeight };
  };
  assert.deepEqual(await mix.evaluate(style), await trees.evaluate(style), "both settings panels share disclosure styling");
  await mix.hover();
  assert.equal(await mix.evaluate(node => getComputedStyle(node).backgroundColor), "rgb(238, 244, 255)");
  await mix.press("Enter");
  const slider = page.locator(".simulation-outcome-slider input").first();
  assert.equal(await slider.evaluate(node => getComputedStyle(node).cursor), "pointer");
  await slider.focus();
  await slider.press("ArrowRight");
  assert.equal(await slider.evaluate(node => getComputedStyle(node).outlineStyle), "solid");
  const disabled = page.locator("button:disabled").first();
  assert.equal(await disabled.evaluate(node => getComputedStyle(node).cursor), "default");
  const canonical = page.locator("#canonical-replay");
  const square = canonical.getByRole("button", { name: "Inspect Read & prepare source", exact: true });
  await square.focus();
  await square.press("Enter");
  await page.waitForFunction(() => document.querySelector("#canonical-replay [aria-label='Inspect square']")?.value === "preparation");
  assert.equal(await square.evaluate(node => getComputedStyle(node).outlineStyle), "solid");
  await square.press("Space");
  await page.waitForFunction(() => document.querySelector("#canonical-replay [aria-label='Inspect square']")?.value === "");
  await trees.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  for (const target of [mix, trees]) {
    const size = await target.evaluate(node => ({ scroll: node.scrollHeight, client: node.clientHeight }));
    assert.ok(size.scroll <= size.client + 1, "disclosure labels wrap without hidden text");
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "dashboard controls fit the narrow viewport; diagrams scroll within their own panels");
  await page.locator(".simulation-file-trees").screenshot({ path: "/tmp/hapsland-usability-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(`Usability passed: ${count} disclosures, shared hover/cursors, visible keyboard focus, slider and square keyboard activation, disabled controls and narrow layout.`);
} finally {
  await browser?.close();
  await server.close();
}
