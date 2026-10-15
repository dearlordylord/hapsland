import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"

const owner = import.meta.dirname
const root = resolve(owner, "../../../../..")
const proof = join(owner, "RootProof.bend")
execFileSync("timeout", ["10s", "taskset", "-c", "10", "bend", proof, "--verdict"], { timeout: 11000, stdio: "pipe" })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-root-completion-mutants-"))
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
    ["Root.bend"].map((file) => {
      const path = join(temporary, relative(root, join(owner, file)))
      return [file, { path, source: readFileSync(path, "utf8") }]
    })
  )
  for (const [mutant, before, after, expectedLocation, file = "Root.bend"] of [
    [
      "zero_root_execution_budget",
      "run(Nat.sub(E.root_weight(root, catalog), 1n),",
      "run(0n,",
      "Laws.complete_root_with_continuation"
    ],
    [
      "root_terminal_refuses_completion",
      "def terminal(step: Core.Step, reversed: List<&2, M.Op>) -> RootRun:\n  match step:\n    case Core.NextRoot{global}: RootDone{global, reversed}",
      "def terminal(step: Core.Step, reversed: List<&2, M.Op>) -> RootRun:\n  match step:\n    case Core.NextRoot{global}: RootFailed{Core.NextRoot{global}}",
      "zero"
    ],
    [
      "root_discards_prior_outcomes",
      "M.Outcome{S.node_slot(node), failure, Some{node}} <> prefix",
      "[M.Outcome{S.node_slot(node), failure, Some{node}}]",
      "root_saved"
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
          "universal successful root correspondence with the original derived budget; whole capability composition and production adoption remain open; rejection may occur in a shared proof helper"
      })
    )
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
