import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const owner = import.meta.dirname
execFileSync("timeout", ["10s", "taskset", "-c", "10", "bend", join(owner, "ReturnProof.bend"), "--verdict"], {
  timeout: 11000,
  stdio: "pipe"
})
const temporary = mkdtempSync(join(tmpdir(), "hapsland-child-return-mutants-"))
try {
  const directory = join(temporary, "local-analysis")
  mkdirSync(directory)
  for (const file of [
    "Model.bend",
    "Core.bend",
    "Specification.bend",
    "Continuation.bend",
    "ReturnLaws.bend",
    "ReturnProof.bend"
  ])
    copyFileSync(join(owner, file), join(directory, file))
  const relative = "../graph-resolution/traversal/GRAPH_LIST_FACTS.bend"
  mkdirSync(dirname(join(directory, relative)), { recursive: true })
  copyFileSync(join(owner, relative), join(directory, relative))
  const natFact = "../graph-resolution/RuntimeNatProof.bend"
  copyFileSync(join(owner, natFact), join(directory, natFact))
  const path = join(directory, "Continuation.bend")
  const original = readFileSync(path, "utf8")
  const start = original.indexOf("def returned_frame(")
  const end = original.indexOf("# Bootstrap compares", start)
  assert.ok(start >= 0 && end > start)
  const returned = original.slice(start, end)
  const mutations = [
    ["parent_site_lost", "symbol), reversed), site}", "symbol), reversed), None{}}"],
    [
      "child_reference_lost",
      "C.keep_reference(purpose,\n        returned_reference(child_slot, List.reverse(&2, M.ReferencePlan, child_reversed), symbol), reversed)",
      "reversed"
    ]
  ]
  const verify = (mutant, law) => {
    const result = spawnSync("taskset", ["-c", "10", "bend", join(directory, "ReturnProof.bend"), "--verdict"], {
      timeout: 10000,
      encoding: "utf8"
    })
    if (result.error) throw result.error
    const diagnostic = result.stdout + result.stderr
    assert.equal(result.status, 1, `${mutant}: expected semantic rejection`)
    assert.ok(diagnostic.includes("SOME PROOFS FAIL"), diagnostic)
    assert.ok(diagnostic.includes(`Location: Laws.${law}`), diagnostic)
    console.log(JSON.stringify({ mutant, law, rejected: true }))
  }
  for (const [mutant, anchor, replacement] of mutations) {
    assert.equal(returned.split(anchor).length, 2, `${mutant}: unique semantic anchor`)
    writeFileSync(path, original.slice(0, start) + returned.replace(anchor, replacement) + original.slice(end))
    verify(mutant, "child_return_frame")
  }
  writeFileSync(path, original)
  const corePath = join(directory, "Core.bend")
  const coreSource = readFileSync(corePath, "utf8")
  const anchor = "finish_child(Cursor{global, root, name, expanded, referenced, failure, remaining, parents},"
  assert.equal(coreSource.split(anchor).length, 2)
  writeFileSync(
    corePath,
    coreSource.replace(
      anchor,
      "finish_child(Cursor{global, root, name, expanded, referenced, failure, Nat.sub(remaining, 1n), parents},"
    )
  )
  verify("return_spends_extra_semantic_tick", "child_return_step")

  writeFileSync(corePath, coreSource)
  const specPath = join(directory, "Specification.bend")
  const specSource = readFileSync(specPath, "utf8")
  const postfix = "List.append(&2, M.Op, postfix(left), List.append(&2, M.Op, postfix(right), [M.Add{}]))"
  assert.equal(specSource.split(postfix).length, 2)
  writeFileSync(
    specPath,
    specSource.replace(
      postfix,
      "List.append(&2, M.Op, postfix(right), List.append(&2, M.Op, postfix(left), [M.Add{}]))"
    )
  )
  verify("postfix_swaps_parent_child", "child_return_postfix")

  writeFileSync(specPath, specSource)
  const ackStart = coreSource.indexOf("def acknowledge(")
  const ackEnd = coreSource.indexOf("def resume(", ackStart)
  assert.ok(ackStart >= 0 && ackEnd > ackStart)
  const ackSource = coreSource.slice(ackStart, ackEnd)
  assert.equal(ackSource.split("Nat.add(request, 1n)").length, 2)
  writeFileSync(
    corePath,
    coreSource.slice(0, ackStart) + ackSource.replace("Nat.add(request, 1n)", "request") + coreSource.slice(ackEnd)
  )
  verify("add_ack_keeps_request", "child_return_ack")

  console.log(
    JSON.stringify({
      kernelRoots: 1,
      mutants: mutations.length + 3,
      scope:
        "returned frame structure and Spec continuation; actual child-return step, postfix order and Ack proved; child entry, traversal invariants and whole root remain unproved"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
