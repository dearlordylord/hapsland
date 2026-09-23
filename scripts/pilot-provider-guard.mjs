import { appendFileSync, readFileSync } from "node:fs";

const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const url = String(args[0]?.url ?? args[0]);
  if (!url.includes("/v1/systemone")) return originalFetch(...args);
  const callsPath = process.env.REVIEW_PILOT_CALL_LOG;
  if (typeof callsPath !== "string") throw new Error("pilot call log is unavailable");
  let count = 0;
  try { count = readFileSync(callsPath, "utf8").trim().split("\n").filter(Boolean).length; }
  catch { /* The first call creates the log. */ }
  if (count >= 2) throw new Error("pilot Jev call budget exhausted");
  const startedAt = Date.now();
  appendFileSync(callsPath, `${JSON.stringify({ kind: "request", at: startedAt })}\n`, { mode: 0o600 });
  try {
    const response = await originalFetch(...args);
    appendFileSync(process.env.REVIEW_PILOT_EVENT_LOG, `${JSON.stringify({ kind: "response", status: response.status, durationMs: Date.now() - startedAt })}\n`, { mode: 0o600 });
    return response;
  } catch (cause) {
    appendFileSync(process.env.REVIEW_PILOT_EVENT_LOG, `${JSON.stringify({ kind: "failure", durationMs: Date.now() - startedAt })}\n`, { mode: 0o600 });
    throw cause;
  }
};
