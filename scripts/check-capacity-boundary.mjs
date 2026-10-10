import { readResidentStateSource, residentRuntimeSourceFiles } from "./resident-runtime-source.mjs"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const resident = resolve(root, "packages/resident-runtime/src/resident")
assert.equal(
  existsSync(resolve(resident, "bend-ledger.generated.js")),
  false,
  "retired direct ledger artifact returned"
)
for (const path of residentRuntimeSourceFiles(root)) {
  const name = path.slice(resident.length + 1)
  if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue
  const source = readFileSync(path, "utf8")
  if (name.startsWith("state/")) {
    const allowed = new Map([
      ["state/resident/state.ts", "make"],
      ["state/resident/transaction.ts", "modify"]
    ])
    for (const operation of ["make", "modify", "update", "set"]) {
      const occurrences = [...source.matchAll(new RegExp(`\\bRef\\.${operation}\\s*(?:<|\\()`, "g"))].length
      assert.equal(
        occurrences,
        allowed.get(name) === operation ? 1 : 0,
        `${name} must retain one resident state creation and publication authority`
      )
    }
  }
  assert.doesNotMatch(
    source,
    /bend-ledger\.generated|bendLedger(?:Initial|Reserve|Resize|Release|Clear|Total|PartitionUsage)/,
    `${name} bypasses the canonical capacity boundary`
  )
}
const adapter = readResidentStateSource(root, "capacity", "resident")
assert.match(
  adapter,
  /from "@hapsland\/canonical-policy\/canonical\/adapter"/,
  "resident capacity must use the shared checked canonical adapter"
)
assert.doesNotMatch(
  adapter,
  /Effect\.runSync|Ref\.getUnsafe|makeCapacityLedger|canonical: capacity/,
  "resident state must expose Effects without synchronous owner bridges or draft-owner capabilities"
)
