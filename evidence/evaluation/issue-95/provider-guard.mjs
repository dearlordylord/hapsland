// Opt-in provider-boundary meter for the bounded issue #95 live evaluation.
// It records timing and byte counts only; never request or response bodies.
import { appendFileSync, mkdirSync, readFileSync, rmdirSync } from "node:fs";

const endpoint = "/v1/systemone";
const maxRequests = 80;
const maxSourceBytes = 2 * 1024 * 1024;
const originalFetch = globalThis.fetch;
const pauseBuffer = new SharedArrayBuffer(4);
const pauseView = new Int32Array(pauseBuffer);

function claim(sourceBytes) {
  const ledger = process.env.HAPSLAND_95_PROVIDER_LEDGER;
  if (!ledger) throw new Error("Issue #95 provider ledger is unavailable");
  const lock = `${ledger}.lock`;
  let acquired = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      acquired = true;
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      Atomics.wait(pauseView, 0, 0, 10);
    }
  }
  if (!acquired) throw new Error("Issue #95 provider budget lock unavailable");
  try {
    let previous = [];
    try {
      previous = readFileSync(ledger, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
    } catch (error) {
      if (error?.code !== "ENOENT") throw new Error("Issue #95 provider ledger unreadable");
    }
    if (previous.some((entry) => entry.kind !== "request" ||
      !Number.isSafeInteger(entry.sourceBytes) || entry.sourceBytes < 0)) {
      throw new Error("Issue #95 provider ledger invalid");
    }
    const previousBytes = previous.reduce((total, entry) => total + entry.sourceBytes, 0);
    if (previous.length >= maxRequests || previousBytes + sourceBytes > maxSourceBytes) {
      throw new Error("Issue #95 provider budget exhausted");
    }
    appendFileSync(ledger, `${JSON.stringify({ kind: "request", at: Date.now(), sourceBytes })}\n`, { mode: 0o600 });
  } finally {
    rmdirSync(lock);
  }
}

globalThis.fetch = async (...args) => {
  const url = String(args[0]?.url ?? args[0]);
  if (!url.includes(endpoint)) return originalFetch(...args);
  const body = args[1]?.body;
  const encoded = typeof body === "string" ? body
    : body instanceof Uint8Array ? Buffer.from(body).toString("utf8") : undefined;
  if (encoded === undefined) throw new Error("Issue #95 cannot meter an unreadable Jev request body");
  let source;
  try { source = JSON.parse(encoded)?.state?.artifact?.source; }
  catch { throw new Error("Issue #95 cannot meter a malformed Jev request body"); }
  if (typeof source !== "string") throw new Error("Issue #95 Jev request has no metered source");
  const sourceBytes = Buffer.byteLength(source, "utf8");
  claim(sourceBytes);
  const started = Date.now();
  const events = process.env.HAPSLAND_95_PROVIDER_EVENTS;
  if (!events) throw new Error("Issue #95 provider event log is unavailable");
  try {
    const response = await originalFetch(...args);
    appendFileSync(events, `${JSON.stringify({ kind: "response", at: Date.now(), durationMs: Date.now() - started, status: response.status })}\n`, { mode: 0o600 });
    return response;
  } catch (error) {
    appendFileSync(events, `${JSON.stringify({ kind: "failure", at: Date.now(), durationMs: Date.now() - started })}\n`, { mode: 0o600 });
    throw error;
  }
};
