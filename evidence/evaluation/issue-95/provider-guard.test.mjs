import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

let sent = 0;
globalThis.fetch = async () => {
  sent += 1;
  return { status: 200 };
};
await import("./provider-guard.mjs");

async function withLedger(run) {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-95-meter-test-"));
  process.env.HAPSLAND_95_PROVIDER_LEDGER = join(directory, "requests.jsonl");
  process.env.HAPSLAND_95_PROVIDER_EVENTS = join(directory, "events.jsonl");
  sent = 0;
  try { await run(process.env.HAPSLAND_95_PROVIDER_LEDGER); }
  finally {
    delete process.env.HAPSLAND_95_PROVIDER_LEDGER;
    delete process.env.HAPSLAND_95_PROVIDER_EVENTS;
    rmSync(directory, { recursive: true, force: true });
  }
}

const request = (source, evidence = "") => JSON.stringify({
  state: { artifact: { source } },
  evidence: { nodes: [{ source: evidence }] },
});
const send = (body) => fetch("https://api.typesafe.ai/v1/systemone", { body });

test("charges the full encoded body, including source-bearing evidence nodes", async () => {
  await withLedger(async (ledger) => {
    const body = request("x", "evidence-body");
    await send(body);
    const [entry] = readFileSync(ledger, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(entry.requestBytes, Buffer.byteLength(body, "utf8"));
    assert.ok(entry.requestBytes > Buffer.byteLength("x", "utf8"));
    assert.equal("sourceBytes" in entry, false);
    assert.equal(sent, 1);
  });
});

test("rejects oversized evidence even when the root source is tiny", async () => {
  await withLedger(async (ledger) => {
    const body = request("x", "e".repeat(2 * 1024 * 1024));
    assert.ok(Buffer.byteLength(body, "utf8") > 2 * 1024 * 1024);
    await assert.rejects(send(body), /provider budget exhausted/);
    assert.equal(sent, 0);
    assert.equal(existsSync(ledger), false);
  });
});

test("enforces the aggregate byte budget and 80-request ceiling before egress", async () => {
  await withLedger(async (ledger) => {
    const halfBudget = request("x", "e".repeat(1_100_000));
    await send(halfBudget);
    await assert.rejects(send(halfBudget), /provider budget exhausted/);
    assert.equal(sent, 1);
    assert.equal(readFileSync(ledger, "utf8").trim().split("\n").length, 1);
  });
  await withLedger(async (ledger) => {
    const body = request("x");
    for (let index = 0; index < 80; index += 1) await send(body);
    await assert.rejects(send(body), /provider budget exhausted/);
    assert.equal(sent, 80);
    assert.equal(readFileSync(ledger, "utf8").trim().split("\n").length, 80);
  });
});
