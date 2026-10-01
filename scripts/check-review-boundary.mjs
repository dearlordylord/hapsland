import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "../src/resident/server.ts"), "utf8");
for (const name of ["bendWorkPreparedOffer", "bendWorkEmptyPrepared",
  "bendWorkEvaluatedDisposition", "bendWorkFailureDisposition"]) {
  if (new RegExp(`\\b${name}\\b`).test(source)) {
    throw new Error(`resident review decision bypasses canonical transition: ${name}`);
  }
}
if (source.includes("#ledger.replace(")) {
  throw new Error("resident review unit fan-out bypasses canonical preparation completion");
}
for (const call of ["#ledger.admitObservation(", "#ledger.completePreparation(",
  "#ledger.readyJevRequest(", "ledger.startJevRequest(",
  "#ledger.settleJevRequest("]) {
  if (!source.includes(call)) throw new Error(`resident review transition missing: ${call}`);
}
