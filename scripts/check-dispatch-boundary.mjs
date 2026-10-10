import { readResidentRuntimeSource } from "./resident-runtime-source.mjs"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const dispatch = readFileSync(resolve(root, "packages/resident-runtime/src/resident/state/dispatch.ts"), "utf8")
const server = readResidentRuntimeSource(root)
for (const field of ["#pending", "#active", "#runningEntries", "#sequence", "#cycle", "#concurrency", "#pump"]) {
  if (dispatch.includes(field)) throw new Error(`native dispatch policy returned: ${field}`)
}
for (const event of ["queueDispatch", "dispatchSettled", "discardDispatch", "closeDispatch"]) {
  if (!dispatch.includes(event)) throw new Error(`missing canonical dispatch event: ${event}`)
}
if (/\bRef\.(?:make|modify|update|set)\s*(?:<|\()/.test(dispatch)) {
  throw new Error("dispatch registration must share the resident state owner, not acquire an independent Ref")
}
if (!dispatch.includes("const registry = ledger.dispatch")) {
  throw new Error("dispatch execution bypassed the resident-owned native registry")
}
if (server.includes("bendDiscardScope")) throw new Error("direct discard scope policy returned")

for (const callback of ["afterAuthorizeBeforeCredential", "afterCredentialBeforeDispatch"]) {
  if (server.includes(callback)) throw new Error(`legacy dispatch Promise callback returned: ${callback}`)
}
if (!server.includes("Layer.buildWithScope(options.dispatchControls ?? dispatchControlsLayer, residentControlScope)")) {
  throw new Error("dispatch coordination must share resident-owned scoped retirement")
}
