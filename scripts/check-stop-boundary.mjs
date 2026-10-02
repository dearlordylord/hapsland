import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const server = readFileSync(resolve(root, "src/resident/server.ts"), "utf8");
const delivery = readFileSync(resolve(root, "src/resident/composed-delivery.ts"), "utf8");
const work = readFileSync(resolve(root, "src/resident/bend-work.ts"), "utf8");
for (const name of ["bendLifecycleFinishGate", "bendLifecycleCutoff"]) {
  if (server.includes(name) || delivery.includes(name) || work.includes(name)) {
    throw new Error(`retired Stop decision owner returned: ${name}`);
  }
}
for (const name of ["stopGroupPolled", "stopGroupEnded", "cancelWork", "finishLimit"]) {
  if (!delivery.includes(name)) throw new Error(`missing canonical Stop command handling: ${name}`);
}
if (!server.includes("job.canonicalObservationId") || !server.includes("job.canonicalOperationId")) {
  throw new Error("Stop cancellation must use canonical job identities");
}
for (const owner of ["#rounds", "#roundActivity", "round.work =", "round.discarded.queued +=", "round.discarded.running +="]) {
  if (server.includes(owner)) throw new Error(`independent resident round owner returned: ${owner}`);
}
if (!server.includes("residentLedger.rounds.replaceWork") || !server.includes("residentLedger.rounds.retire")) {
  throw new Error("native round replacement and retirement must use the shared resident owner");
}

if (/Effect\.runSync|Ref\.getUnsafe/u.test(server)) {
  throw new Error("resident runtime operations must compose Effects in their owning fiber without synchronous execution or unsafe reads");
}

const capacity = readFileSync(resolve(root, "src/resident/capacity.ts"), "utf8");
if (!/const roundCommit = [\s\S]*?=>\s*commitAllEffect\(/u.test(capacity) ||
    !server.includes("yield* residentLedger.rounds.bind") ||
    !server.includes("yield* residentLedger.rounds.replaceWork") ||
    !server.includes("yield* residentLedger.rounds.retire")) {
  throw new Error("round mutations must compose atomic Effects without a synchronous commit bridge");
}
const roundSurface = capacity.slice(capacity.indexOf("const rounds: RoundRecords"), capacity.indexOf("const runtimeCommitEffect"));
if (roundSurface.includes("Ref.getUnsafe") || roundSurface.includes("get work()") || roundSurface.includes("get discarded()")) {
  throw new Error("round state reads must compose Effects rather than hidden mutable capability getters");
}
if (/const runtimeCommit\s*=/u.test(capacity) || server.includes("responseFiber")) {
  throw new Error("runtime mutations and IPC responses must compose Effects without synchronous mutation bridges");
}
for (const ownership of [
  "Effect.forkIn(residentAccept(socket), residentIpcScope",
  "Scope.close(residentIpcScope, Exit.void)",
  "(connection) => port.close.pipe(Effect.andThen",
]) {
  if (!server.includes(ownership)) throw new Error(`missing scoped IPC ownership: ${ownership}`);
}
