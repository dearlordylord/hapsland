import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"
import { deriveLookupPlan as referenceLookup, deriveSavePlan as referenceSave } from "./credential-reference.ts"
import { deriveLookupPlan, deriveSavePlan } from "@hapsland/runtime-inputs/credentials/policy"
const context = { envVar: "KEY", referenceExplicit: false, captured: false, root: "/root", userFile: "/user", nativeTarget: "hapsland", projectLocalFile: "/local", projectFile: "/project" }
const loops = 300000
const lanes = {
  baselineLookup: () => referenceLookup(context).length,
  bendLookup: () => deriveLookupPlan(context).length,
  baselineSave: () => referenceSave(context, "user").target.length,
  bendSave: () => deriveSavePlan(context, "user").target.length
}
const samplesMs = Object.fromEntries(Object.keys(lanes).map(name => [name, []]))
let checksum = 0
for (let round = 0; round < 6; round++) for (const [name, fn] of Object.entries(lanes)) {
  const start = performance.now()
  for (let i = 0; i < loops; i++) checksum += fn()
  if (round > 0) samplesMs[name].push(performance.now() - start)
}
const record = { at: new Date().toISOString(), loops, samplesMs, checksum, scope: "diagnostic per-function warm-cache costs; fixed full-source context; not final acceptance" }
writeFileSync(new URL("./integrated-profile.json", import.meta.url), JSON.stringify(record, null, 2) + "\n")
console.log(JSON.stringify(record))
