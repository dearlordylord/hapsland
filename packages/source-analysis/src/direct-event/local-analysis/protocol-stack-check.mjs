import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const owner = import.meta.dirname
for (const proof of ["ProtocolProof.bend", "StackProof.bend"])
  execFileSync("timeout", ["10s", "taskset", "-c", "10", "bend", join(owner, proof), "--verdict"], {
    timeout: 11000,
    stdio: "pipe"
  })

// Cleaned mutation inputs copied directly from ordinary current owner sources.
// These are diagnostics, not a retained source snapshot or restoration path.
const sources = [
  "Model.bend",
  "Core.bend",
  "Specification.bend",
  "Stack.bend",
  "StackLaws.bend",
  "StackProof.bend",
  "ProtocolLaws.bend",
  "ProtocolProof.bend"
]
const temporary = mkdtempSync(join(tmpdir(), "hapsland-local-protocol-stack-mutants-"))
const mutations = [
  {
    name: "missing_outer_zero",
    file: "Specification.bend",
    proof: "StackProof.bend",
    from: "append_trace(Some{[M.Push{0n}]},",
    to: "append_trace(Some{[]},",
    location: "preflight_depth",
    law: "preflight_stack_effect",
    note: "rejected in the shared preflight depth lemma, not the law definition itself"
  },
  {
    name: "binary_stack_grows",
    file: "Stack.bend",
    proof: "StackProof.bend",
    from: "case 1n+rest: binary_tail(rest)",
    to: "case 1n+rest: Some{1n+1n+rest}",
    location: "Laws.postfix_effect",
    law: "postfix_effect"
  },
  {
    name: "wrong_ack_accepted",
    file: "Core.bend",
    proof: "ProtocolProof.bend",
    from: "case False{}: InvalidReply{}",
    to: "case False{}: schedule(remaining, next, Nat.add(request, 1n))",
    location: "acknowledge_exact",
    law: "ack_exact",
    note: "rejected in the shared correlation lemma, not the law definition itself"
  },
  {
    name: "terminal_reply_keeps_state",
    file: "Core.bend",
    proof: "ProtocolProof.bend",
    from: "case _ _: InvalidReply{}",
    to: "case other _: other",
    location: "Laws.completed_reply_rejected",
    law: "completed_reply_rejected"
  }
]
try {
  for (const mutation of mutations) {
    const directory = join(temporary, mutation.name)
    mkdirSync(directory)
    for (const source of sources) copyFileSync(join(owner, source), join(directory, source))
    const path = join(directory, mutation.file)
    const source = readFileSync(path, "utf8")
    assert.equal(source.split(mutation.from).length, 2, "mutation anchor must be unique: " + mutation.name)
    writeFileSync(path, source.replace(mutation.from, mutation.to))
    const result = spawnSync("taskset", ["-c", "10", "bend", join(directory, mutation.proof), "--verdict"], {
      timeout: 10000,
      encoding: "utf8"
    })
    if (result.error) throw result.error
    const diagnostic = result.stdout + result.stderr
    assert.equal(result.status, 1, "semantic mutant must be rejected: " + mutation.name)
    assert.ok(diagnostic.includes("SOME PROOFS FAIL"), diagnostic)
    assert.ok(diagnostic.includes("Location: " + mutation.location), diagnostic)
    console.log(JSON.stringify({ mutant: mutation.name, law: mutation.law, rejected: true, note: mutation.note }))
  }
  console.log(
    JSON.stringify({
      kernelRoots: 2,
      semanticMutants: mutations.length,
      scope: "local postfix stack effect and Ack/terminal equations; whole correspondence/termination remain open"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
