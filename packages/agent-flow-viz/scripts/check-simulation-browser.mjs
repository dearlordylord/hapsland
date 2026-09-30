import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  const panel = page.locator("#monkey-business");
  const status = async (text) =>
    page.waitForFunction(
      (expected) =>
        document
          .querySelector("#monkey-business .simulation-status")
          ?.textContent.includes(expected),
      text,
    );
  await panel.getByLabel("Seed", { exact: true }).fill("7");
  await panel
    .getByRole("button", { name: "Start / reset", exact: true })
    .click();
  await panel.getByRole("button", { name: "Single step", exact: true }).click();
  assert.match(await panel.locator(".simulation-status").innerText(), /Paused/);
  assert.equal(await panel.locator(".topology-node").count(), 13);
  assert.match(await panel.innerText(), /simulated Jev/i);
  assert.match(
    await panel.locator(".simulation-details").innerText(),
    /sequence/,
  );
  assert.match(
    await panel.locator(".simulation-history").innerText(),
    /0\. 105 ms · openRound/,
  );
  await panel.getByLabel("Burst count (1–100)", { exact: true }).fill("0");
  await panel
    .getByRole("button", { name: "Inject edit burst", exact: true })
    .click();
  await status("Burst count must be an integer");
  await panel.getByLabel("Burst count (1–100)", { exact: true }).fill("3");
  await panel
    .getByRole("button", { name: "Inject edit burst", exact: true })
    .click();
  await panel
    .getByLabel("Simulated Jev delay (virtual ms)", { exact: true })
    .fill("500");
  await panel
    .getByLabel("Simulated Jev delay (virtual ms)", { exact: true })
    .press("Tab");
  await panel
    .getByLabel("Simulated Jev outcome", { exact: true })
    .selectOption("backendFailure");
  await panel
    .getByRole("button", { name: "Apply simulated Jev profile", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Suspend edit generation", exact: true })
    .click();
  await status("edits suspended");
  for (let i = 0; i < 20; i++)
    await panel
      .getByRole("button", { name: "Single step", exact: true })
      .click();
  assert.match(
    await panel.locator(".simulation-details").innerText(),
    /before/,
  );
  await panel
    .getByRole("button", { name: "Export replay", exact: true })
    .click();
  await status("Replay inputs exported");
  const exported = await panel
    .getByLabel("Replay JSON", { exact: true })
    .inputValue();
  assert.match(exported, /monkey-business\/1/);
  assert.equal(
    JSON.parse(exported).controls.find(
      (entry) => entry.control.kind === "jevProfile",
    ).control.delayMs,
    500,
  );
  const before = await panel.locator(".simulation-details").innerText();
  await panel
    .getByRole("button", { name: "Start / reset", exact: true })
    .click();
  await panel.getByLabel("Replay JSON", { exact: true }).fill(exported);
  await panel.getByRole("button", { name: "Load replay", exact: true }).click();
  await status("Replay reconstructed");
  assert.equal(await panel.locator(".simulation-details").innerText(), before);
  const incompatible = JSON.parse(exported);
  incompatible.logicIdentity = "other-logic";
  await panel
    .getByLabel("Replay JSON", { exact: true })
    .fill(JSON.stringify(incompatible));
  await panel.getByRole("button", { name: "Load replay", exact: true }).click();
  await status("incompatible replay identity");
  await panel.getByLabel("Replay JSON", { exact: true }).fill(exported);
  await panel.getByRole("button", { name: "Load replay", exact: true }).click();
  await status("Replay reconstructed");
  await panel
    .getByLabel("Edit interval (virtual ms)", { exact: true })
    .fill("200");
  await panel
    .getByRole("button", { name: "Apply edit pace", exact: true })
    .click();
  await status("Future edit pace updated");
  await panel
    .getByLabel("Reservation bytes per edit", { exact: true })
    .fill("250");
  await panel
    .getByRole("button", { name: "Apply reservation size", exact: true })
    .click();
  await status("Synthetic reservation facts updated");
  await panel
    .getByRole("button", { name: "Resume edit generation", exact: true })
    .click();
  await status("edits enabled");
  await panel.getByRole("button", { name: "Resume", exact: true }).click();
  await status("Running");
  await page.waitForFunction(
    () =>
      document.querySelectorAll("#monkey-business .simulation-history button")
        .length > 21,
  );
  await panel.getByRole("button", { name: "Pause", exact: true }).click();
  await status("Paused");
  await panel.locator(".simulation-history button").first().click();
  await page.waitForFunction(() =>
    document
      .querySelector("#monkey-business .simulation-details")
      ?.textContent.includes('"sequence": 0'),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Simulation browser controls, existing diagram and inspection passed",
  );
} finally {
  await browser?.close();
  await server.close();
}
