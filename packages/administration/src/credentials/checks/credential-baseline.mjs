import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"
import { deriveLookupPlan, deriveSavePlan } from "./credential-reference.ts"
const contexts = Array.from({ length: 32 }, (_, bits) => ({
  envVar: "TYPESAFE_API_KEY", referenceExplicit: Boolean(bits & 1), captured: Boolean(bits & 2),
  root: bits & 4 ? "/project" : undefined, userFile: "/user/key", nativeTarget: "hapsland",
  projectLocalFile: bits & 8 ? "/project/local" : undefined,
  projectFile: bits & 16 ? "/project/key" : undefined
}))
const loops = 10000
function run() {
  let checksum = 0
  for (let n = 0; n < loops; n++) for (const context of contexts) {
    checksum += deriveLookupPlan(context).length
    for (const destination of ["user", "project-local", "native"])
      checksum += deriveSavePlan(context, destination) === undefined ? 0 : 1
  }
  return checksum
}
const expected = run()
const samplesMs = []
for (let sample = 0; sample < 5; sample++) {
  const start = performance.now()
  if (run() !== expected) throw new Error("unstable baseline")
  samplesMs.push(performance.now() - start)
}
const record = { at: new Date().toISOString(), runtime: process.versions, scope: "pure credential lookup/save planning; 32 flag combinations; excludes IO", loops, checksum: expected, samplesMs }
writeFileSync(new URL("./baseline-execution.json", import.meta.url), JSON.stringify(record, null, 2) + "\n")
console.log(JSON.stringify({ checksum: expected, samplesMs }))
