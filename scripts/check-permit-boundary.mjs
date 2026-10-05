import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const resident = resolve(root, "src/resident")
for (const name of readdirSync(resident)) {
  if (!name.endsWith(".ts") || name.endsWith(".test.ts") || name.endsWith(".generated.d.ts")) continue
  assert.doesNotMatch(
    readFileSync(resolve(resident, name), "utf8"),
    /bendAdmission(?:Initial|Step|ProspectiveGate|Expire|CloseProspective)|BendAdmissionState/,
    `${name} bypasses the canonical permit boundary`
  )
}
const delivery = readFileSync(resolve(resident, "composed-delivery.ts"), "utf8")
for (const kind of ["issuePermit", "consumePermit", "releasePermit", "expirePermit", "closePermitRound"]) {
  assert.match(delivery, new RegExp(`kind: "${kind}"`), `resident lacks ${kind} transition`)
}
assert.match(
  readFileSync(resolve(root, "packages/agent-flow-bend/Canonical.bend"), "utf8"),
  /admissions: List<&2, Admission\.AdmissionState>/,
  "canonical state must retain permit ownership"
)
