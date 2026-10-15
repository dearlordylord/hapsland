import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

// Temporary copies are diagnostic mutation inputs, never retained source custody.
const temporary = mkdtempSync(join(tmpdir(), "hapsland-rope-plan-mutants-"))
const roots = [
  "CanonicalJsonPlan.bend",
  "CanonicalJsonPlanSpecification.bend",
  "CanonicalJsonRopePlanSpecification.bend",
  "CanonicalJsonRopePlanProof.bend",
  "CanonicalJsonRopePlanSortProof.bend"
]
const sources = roots.map((name) => readFileSync(join(import.meta.dirname, name), "utf8"))
const copies = new Map(roots.map((name) => [join(import.meta.dirname, name), join(temporary, name)]))
const rebase = (source, owner) =>
  source.replace(/^import ([./][^ \n]+)(.*)$/gm, (_line, path, rest) => {
    const absolute = resolve(dirname(owner), path)
    return `import ${copies.get(absolute) ?? absolute}${rest}`
  })
const mutations = [
  {
    name: "reversed key comparator",
    proof: 4,
    section: "comparison_exact",
    before: "Json.units_le(Json.utf16(left), Json.utf16(right))",
    after: "Json.units_le(Json.utf16(right), Json.utf16(left))"
  },
  {
    name: "equal keys choose the later field",
    proof: 4,
    section: "comparison_exact",
    before: "case RopeField{left, _} RopeField{right, _}:\n      Json.units_le(Json.utf16(left), Json.utf16(right))",
    after:
      "case RopeField{+left, _} RopeField{+right, _}:\n      Bool.and(Json.units_le(Json.utf16(left), Json.utf16(right)), Bool.not(String.eq(left, right)))"
  },
  {
    name: "flatten visits right before left",
    proof: 3,
    section: "flatten_go_exact",
    before: "rope_flatten_go(remaining, left <> right <> rest, reversed)",
    after: "rope_flatten_go(remaining, right <> left <> rest, reversed)"
  },
  {
    name: "join omits its own node count",
    proof: 3,
    section: "join_count_exact",
    before: "RopeJoin{Nat.add(1n, Nat.add(rope_nodes(left), rope_nodes(right))), left, right}",
    after: "RopeJoin{Nat.add(rope_nodes(left), rope_nodes(right)), left, right}"
  },
  {
    name: "array separator loses its comma",
    proof: 3,
    section: "array_more_exact",
    before: 'rope_array_more(tail, rope_join(accumulated, rope_join(RopePiece{LiteralPiece{","}}, value)))',
    after: "rope_array_more(tail, rope_join(accumulated, value))"
  }
]
try {
  const checks = [{ name: "baseline assembly", proof: 3 }, { name: "baseline stable sort", proof: 4 }, ...mutations]
  for (const check of checks) {
    let implementation = sources[0]
    if (check.before !== undefined) {
      assert.equal(implementation.split(check.before).length, 2, "mutation must replace exactly one expression")
      implementation = implementation.replace(check.before, check.after)
    }
    for (const [index, name] of roots.entries())
      writeFileSync(
        copies.get(join(import.meta.dirname, name)),
        rebase(index === 0 ? implementation : sources[index], join(import.meta.dirname, name))
      )
    const result = spawnSync(
      "timeout",
      [
        "-s",
        "KILL",
        "10s",
        "taskset",
        "-c",
        "10",
        process.env.BEND ?? "bend",
        copies.get(join(import.meta.dirname, roots[check.proof])),
        "--verdict"
      ],
      { encoding: "utf8", timeout: 11000 }
    )
    assert.ifError(result.error)
    const output = result.stdout + result.stderr
    assert.equal(result.status, check.before === undefined ? 0 : 1, output)
    assert.match(output, check.before === undefined ? /ALL PROOFS CHECK/ : /SOME PROOFS FAIL/)
    if (check.before !== undefined) {
      assert.match(output, /expected\s*:/)
      assert.match(output, new RegExp(`Location: ${check.section}`), "mutant must fail its semantic invariant")
    }
  }
  console.log(
    `Rope planner: two baseline proof roots pass; ${mutations.length} semantic mutants rejected. Failures may occur in shared invariants; universal compile correspondence remains separate.`
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
