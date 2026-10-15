import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"

const owner = import.meta.dirname
const root = resolve(owner, "../../../../..")
const proof = join(owner, "ExecutionMeasureProof.bend")
execFileSync("timeout", ["10s", "taskset", "-c", "10", "bend", proof, "--verdict"], { timeout: 11000, stdio: "pipe" })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-execution-measure-mutants-"))
try {
  const copied = new Set()
  function copyClosure(path) {
    if (copied.has(path)) return
    copied.add(path)
    const destination = relative(root, path)
    assert.ok(!destination.startsWith("..") && destination.endsWith(".bend"), destination)
    const source = readFileSync(path, "utf8")
    mkdirSync(dirname(join(temporary, destination)), { recursive: true })
    copyFileSync(path, join(temporary, destination))
    for (const match of source.matchAll(/^import\s+(\.[^\s]+\.bend)(?:\s|$)/gm))
      copyClosure(resolve(dirname(path), match[1]))
  }
  copyClosure(proof)
  const originals = new Map(
    ["ExecutionMeasure.bend", "Execution.bend"].map((file) => {
      const path = join(temporary, relative(root, join(owner, file)))
      return [file, { path, source: readFileSync(path, "utf8") }]
    })
  )
  for (const [mutant, before, after, expectedLocation, file = "ExecutionMeasure.bend"] of [
    [
      "current_command_not_charged",
      "1n+Nat.add(List.length(&2, M.Op, remaining), deferred(next))",
      "Nat.add(List.length(&2, M.Op, remaining), deferred(next))",
      "schedule"
    ],
    [
      "frame_reserve_over_budget",
      "Nat.mul(2n, List.length(&2, C.Frame, frames))",
      "Nat.mul(3n, List.length(&2, C.Frame, frames))",
      "popped_cursor"
    ],
    [
      "declaration_budget_short",
      "Nat.add(6n, Nat.mul(9n, List.length(&2, M.Reference, references)))",
      "Nat.add(5n, Nat.mul(9n, List.length(&2, M.Reference, references)))",
      "entered_child",
      "Execution.bend"
    ]
  ]) {
    for (const { path, source } of originals.values()) writeFileSync(path, source)
    const { path, source: original } = originals.get(file)
    assert.equal(original.split(before).length, 2, mutant)
    writeFileSync(path, original.replace(before, after))
    const result = spawnSync("taskset", ["-c", "10", "bend", join(temporary, relative(root, proof)), "--verdict"], {
      timeout: 10000,
      encoding: "utf8"
    })
    if (result.error) throw result.error
    const diagnostic = result.stdout + result.stderr
    assert.equal(result.status, 1, diagnostic)
    assert.ok(diagnostic.includes("SOME PROOFS FAIL"), diagnostic)
    const locations = [...diagnostic.matchAll(/Location: ([^\r\n]+)/g)].map((match) => match[1])
    assert.deepEqual(locations, [expectedLocation], diagnostic)
    assert.ok(!/PARSE ERROR|SYNTAX ERROR|UNBOUND VARIABLE/.test(diagnostic), diagnostic)
    console.log(
      JSON.stringify({
        mutant,
        rejected: true,
        locations,
        scope:
          "full universal execution decrease, positivity and initial root bound; root completion is proved separately; rejection may occur in a shared proof helper"
      })
    )
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
