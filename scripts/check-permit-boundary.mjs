import { readResidentStateSource, residentRuntimeSourceFiles } from "./resident-runtime-source.mjs"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const resident = resolve(root, "packages/resident-runtime/src/resident")
for (const path of residentRuntimeSourceFiles(root)) {
  const name = path.slice(resident.length + 1)
  if (!name.endsWith(".ts") || name.endsWith(".test.ts") || name.endsWith(".generated.d.ts")) continue
  assert.doesNotMatch(
    readFileSync(path, "utf8"),
    /bendAdmission(?:Initial|Step|ProspectiveGate|Expire|CloseProspective)|BendAdmissionState/,
    `${name} bypasses the canonical permit boundary`
  )
}
const delivery = readResidentStateSource(root, "delivery")
for (const kind of ["issuePermit", "consumePermit", "releasePermit", "expirePermit", "closePermitRound"]) {
  assert.match(delivery, new RegExp(`kind: "${kind}"`), `resident lacks ${kind} transition`)
}
assert.match(
  readFileSync(resolve(root, "packages/agent-flow-bend/Canonical.bend"), "utf8"),
  /admissions: List<&2, Admission\.AdmissionState>/,
  "canonical state must retain permit ownership"
)
