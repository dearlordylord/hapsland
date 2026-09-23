import { appendFileSync, readFileSync } from "node:fs";
import { basename } from "node:path";

if (process.env.REVIEW_PILOT_LOAD_LOG !== undefined) {
  appendFileSync(process.env.REVIEW_PILOT_LOAD_LOG,
    `${JSON.stringify({ kind: "loaded", process: basename(process.argv[1] ?? "unknown") })}\n`, { mode: 0o600 });
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const url = String(args[0]?.url ?? args[0]);
  if (!url.includes("/v1/systemone")) return originalFetch(...args);
  const callsPath = process.env.REVIEW_PILOT_CALL_LOG;
  if (typeof callsPath !== "string") throw new Error("pilot call log is unavailable");
  const body = args[1]?.body;
  const encoded = typeof body === "string" ? body : body instanceof Uint8Array ? Buffer.from(body).toString("utf8") : undefined;
  if (encoded === undefined) throw new Error("pilot cannot meter an unreadable Jev request body");
  let source;
  try { source = JSON.parse(encoded)?.state?.artifact?.source; }
  catch { throw new Error("pilot cannot meter a malformed Jev request body"); }
  if (typeof source !== "string") throw new Error("pilot Jev request has no metered source");
  const sourceBytes = Buffer.byteLength(source, "utf8");
  let prior = [];
  try { prior = readFileSync(callsPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
  catch (cause) {
    if (cause?.code !== "ENOENT") throw new Error("pilot call log is unreadable");
  }
  if (prior.some((call) => !Number.isSafeInteger(call.sourceBytes) || call.sourceBytes < 0)) {
    throw new Error("pilot call log has invalid source-byte counts");
  }
  if (prior.length >= 2 || prior.reduce((total, call) => total + call.sourceBytes, 0) + sourceBytes > 4_096) {
    throw new Error("pilot Jev call or source-byte budget exhausted");
  }
  const startedAt = Date.now();
  appendFileSync(callsPath, `${JSON.stringify({ kind: "request", at: startedAt, sourceBytes })}\n`, { mode: 0o600 });
  try {
    const response = await originalFetch(...args);
    appendFileSync(process.env.REVIEW_PILOT_EVENT_LOG, `${JSON.stringify({ kind: "response", status: response.status, durationMs: Date.now() - startedAt })}\n`, { mode: 0o600 });
    return response;
  } catch (cause) {
    appendFileSync(process.env.REVIEW_PILOT_EVENT_LOG, `${JSON.stringify({ kind: "failure", durationMs: Date.now() - startedAt })}\n`, { mode: 0o600 });
    throw cause;
  }
};
