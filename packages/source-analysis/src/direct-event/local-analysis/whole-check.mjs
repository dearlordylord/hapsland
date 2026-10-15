import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"

const owner = import.meta.dirname
const root = resolve(owner, "../../../../..")
const proof = join(owner, "WholeProof.bend")
execFileSync("timeout", ["10s", "taskset", "-c", "10", "bend", proof, "--verdict"], { timeout: 11000, stdio: "pipe" })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-whole-analyzer-mutants-"))
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
    ["Core.bend", "Execution.bend"].map((file) => {
      const path = join(temporary, relative(root, join(owner, file)))
      return [file, { path, source: readFileSync(path, "utf8") }]
    })
  )
  for (const [mutant, before, after, expectedLocation, file = "Core.bend"] of [
    [
      "completed_outcomes_not_reversed",
      "case Global{_, _, _, reversed, _}: Completed{List.reverse(&2, M.Outcome, reversed)}",
      "case Global{_, _, _, reversed, _}: Completed{reversed}",
      "empty_result"
    ],
    ["initial_preflight_zero_changed", "case Preflight{}: [M.Push{0n}]", "case Preflight{}: [M.Push{1n}]", "entry"],
    [
      "whole_execution_budget_short",
      "Nat.add(2n, roots_weight(Core.catalog_declarations(catalog), catalog))",
      "Nat.add(1n, roots_weight(Core.catalog_declarations(catalog), catalog))",
      "entry",
      "Execution.bend"
    ],
    [
      "next_root_discards_pending",
      "Global{catalog, purpose, tail, reversed, request},",
      "Global{catalog, purpose, [], reversed, request},",
      "Laws.complete_root_with_continuation"
    ],
    [
      "outer_root_progression_stalls",
      "next(Core.advance(Core.NextRoot{global}))(reversed)",
      "next(Core.NextRoot{global})(reversed)",
      "suffix_positive",
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
          "four unchanged universal whole-capability laws, including original derived budgets and exact outcomes/preflight trace; production connection remains open; rejection may occur in a shared proof helper"
      })
    )
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
