import { readResidentStateSource, readResidentRuntimeSource } from "./resident-runtime-source.mjs"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const server = readResidentRuntimeSource(root)
const delivery = readResidentStateSource(root, "delivery")
const work = readFileSync(resolve(root, "packages/resident-runtime/src/resident/bend-work.ts"), "utf8")
for (const name of ["bendLifecycleFinishGate", "bendLifecycleCutoff"]) {
  if (server.includes(name) || delivery.includes(name) || work.includes(name)) {
    throw new Error(`retired Stop decision owner returned: ${name}`)
  }
}
for (const name of ["stopGroupPolled", "stopGroupEnded", "cancelWork", "finishLimit"]) {
  if (!delivery.includes(name)) throw new Error(`missing canonical Stop command handling: ${name}`)
}
if (!server.includes("job.canonicalObservationId") || !server.includes("job.canonicalOperationId")) {
  throw new Error("Stop cancellation must use canonical job identities")
}
for (const owner of [
  "#rounds",
  "#roundActivity",
  "round.work =",
  "round.discarded.queued +=",
  "round.discarded.running +="
]) {
  if (server.includes(owner)) throw new Error(`independent resident round owner returned: ${owner}`)
}
if (!server.includes("residentLedger.rounds.replaceWork") || !server.includes("residentLedger.rounds.retire")) {
  throw new Error("native round replacement and retirement must use the shared resident owner")
}

if (/Effect\.runSync|Effect\.runPromise|Ref\.getUnsafe/u.test(server)) {
  throw new Error(
    "resident runtime operations must compose Effects in their owning fiber without execution bridges or unsafe reads"
  )
}

const capacity = readResidentStateSource(root, "capacity", "resident")
if (
  !/const roundCommit = [\s\S]*?=>\s*commitAllEffect\(/u.test(capacity) ||
  !server.includes("yield* deps.residentLedger.rounds.bind") ||
  !server.includes("yield* deps.residentLedger.rounds.replaceWork") ||
  !server.includes("yield* deps.residentLedger.rounds.retire")
) {
  throw new Error("round mutations must compose atomic Effects without a synchronous commit bridge")
}
const roundSurface = readFileSync(
  resolve(root, "packages/resident-runtime/src/resident/state/resident/rounds.ts"),
  "utf8"
)
if (
  roundSurface.includes("Ref.getUnsafe") ||
  roundSurface.includes("get work()") ||
  roundSurface.includes("get discarded()")
) {
  throw new Error("round state reads must compose Effects rather than hidden mutable capability getters")
}
if (/const runtimeCommit\s*=/u.test(capacity) || server.includes("responseFiber")) {
  throw new Error("runtime mutations and IPC responses must compose Effects without synchronous mutation bridges")
}
for (const ownership of [
  "Effect.forkIn(workflows.ipc.residentAccept(socket), residentIpcScope",
  "Scope.close(residentIpcScope, Exit.void)",
  "(connection) => port.close.pipe(Effect.andThen"
]) {
  if (!server.replace(/\s+/gu, "").includes(ownership.replace(/\s+/gu, "")))
    throw new Error(`missing scoped IPC ownership: ${ownership}`)
}

if (/listenEffect|closeEffect|(?:whenIdle|listen|close)\(\): Promise/u.test(server)) {
  throw new Error("resident lifecycle must expose scoped Effects without parallel Promise facades")
}

if (
  /readonly (?:beforeSelection|beforeEvaluate|afterSourceWorkspaceReserved|afterAdvicePending|beforeFinalSelection|beforeResponseHandoff)\?/u.test(
    server
  ) ||
  /resident(?:BeforeRevalidate|BeforeEvaluate|AfterRevalidationWorkspaceReserved|AfterAdvicePending|BeforeFinalRevalidate|BeforeResponseHandoff)/u.test(
    server
  )
) {
  throw new Error("resident coordination must use scoped review controls rather than Promise hooks")
}
if (
  !server
    .replace(/\s+/gu, "")
    .includes("Layer.buildWithScope(options.reviewControls??reviewControlsLayer,residentControlScope)")
) {
  throw new Error("resident review controls must be owned by its control scope")
}
