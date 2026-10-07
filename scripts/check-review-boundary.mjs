import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const source = readFileSync(resolve(import.meta.dirname, "../packages/resident-runtime/src/resident/server.ts"), "utf8")
for (const name of [
  "bendWorkPreparedOffer",
  "bendWorkEmptyPrepared",
  "bendWorkEvaluatedDisposition",
  "bendWorkFailureDisposition"
]) {
  if (new RegExp(`\\b${name}\\b`).test(source)) {
    throw new Error(`resident review decision bypasses canonical transition: ${name}`)
  }
}
if (source.includes("residentLedger.replace(")) {
  throw new Error("resident review unit fan-out bypasses canonical preparation completion")
}
for (const call of [
  "residentLedger.admitObservation(",
  "residentLedger.completePreparation(",
  "residentLedger.readyJevRequest(",
  "residentLedger.startJevRequest(",
  "residentLedger.settleJevRequest("
]) {
  if (!source.includes(call)) throw new Error(`resident review transition missing: ${call}`)
}

const backend = readFileSync(
  resolve(import.meta.dirname, "../packages/review-execution/src/ports/review-backend.ts"),
  "utf8"
)
if (backend.includes("Clock.currentTimeMillis") || !backend.includes("Clock.monotonicTimeNanos")) {
  throw new Error("backend elapsed duration must use the caller monotonic Clock")
}
