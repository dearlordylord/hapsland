import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"

const owner = import.meta.dirname
const root = resolve(owner, "../../../../..")
const proof = join(owner, "JointStepProof.bend")
execFileSync("timeout", ["10s", "taskset", "-c", "10", "bend", proof, "--verdict"], { timeout: 11000, stdio: "pipe" })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-joint-step-mutants-"))
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
    ["JointStep.bend", "Core.bend"].map((file) => {
      const path = join(temporary, relative(root, join(owner, file)))
      return [file, { path, source: readFileSync(path, "utf8") }]
    })
  )
  for (const [mutant, before, after, expectedLocation, file = "JointStep.bend"] of [
    ["ack_uses_wrong_request", "C.Ack{queued_request}", "C.Ack{1n+queued_request}", "ack_step"],
    [
      "ack_operation_not_recorded",
      "case C.Engine{operation, _, _, _}: operation <> reversed",
      "case C.Engine{operation, _, _, _}: reversed",
      "engine_step"
    ],
    [
      "queued_operation_moved_to_end",
      "operation <> remaining))",
      "List.append(&2, M.Op, remaining, [operation])))",
      "initial_queue"
    ],
    [
      "edge_base_charge_changed",
      "        M.Push{512n},\n        M.Push{2n},",
      "        M.Push{511n},\n        M.Push{2n},",
      "edge_postfix",
      "Core.bend"
    ],
    [
      "child_measurements_before_edge",
      "List.append(&2, M.Op, operations, node_operations(Preflight{}, slot))",
      "List.append(&2, M.Op, node_operations(Preflight{}, slot), operations)",
      "fresh_trace",
      "Core.bend"
    ],
    ["return_add_omitted", "case Preflight{}: [M.Add{}]", "case Preflight{}: []", "return_trace", "Core.bend"]
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
          "root-entry, Engine Ack and pending dispatch and child return with derived budgets; root terminal and weighted completion remain open; rejection may occur in a shared proof helper"
      })
    )
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
