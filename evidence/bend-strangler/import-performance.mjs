import { spawnSync } from "node:child_process"
import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
const roots = { typescript: "/workspace/typescript/hapsland-bend-baseline", integratedBend: "/workspace/typescript/hapsland-bend-strangler" }
const modules = ["packages/administration/dist/onboarding/verification-model.js", "packages/administration/dist/credentials/login-model.js", "packages/runtime-inputs/dist/credentials/policy.js"]
const results = {}
for (const module of modules) {
  const lanes = {}
  for (const [lane, root] of Object.entries(roots)) {
    const samples = []
    for (let round = 0; round < 7; round++) {
      const script = `const start = performance.now(); await import(${JSON.stringify(root + "/" + module)}); console.log(JSON.stringify({milliseconds:performance.now()-start}));`
      const result = spawnSync("bun", ["--eval", script], { cwd: root, timeout: 5000, encoding: "utf8" })
      assert.equal(result.error, undefined); assert.equal(result.status, 0)
      samples.push(JSON.parse(result.stdout).milliseconds)
    }
    lanes[lane] = samples
  }
  results[module] = lanes
}
writeFileSync("evidence/bend-strangler/import-performance.json", JSON.stringify({at:new Date().toISOString(), results, scope:"isolated fresh-process dynamic imports; diagnostic only; modules measured separately and shared Effect costs may be paid once in the complete CLI"}, null,2)+"\n")
console.log(JSON.stringify(results))
