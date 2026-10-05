import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
const root = dirname(fileURLToPath(import.meta.url))
const run = (file, verdict = false) => {
  const result = spawnSync("bend", [file, ...(verdict ? ["--verdict"] : [])], { encoding: "utf8", timeout: 5000 })
  if (result.error) throw result.error
  return { status: result.status, text: result.stdout + result.stderr }
}
const temp = mkdtempSync(join(tmpdir(), "hapsland-driver-laws-"))
try {
  const copy = join(temp, "monkey-business-bend")
  cpSync(root, copy, { recursive: true })
  symlinkSync(join(root, "../agent-flow-bend"), join(temp, "agent-flow-bend"), "dir")
  // Literal falsification precedes checking the general candidate proofs.
  const literals = `import Base
import ./Scheduler.bend as S
import ./Driver.bend as D
import ./Workload.bend as W
import ./PendingEffects.bend as P
import ./Session.bend as Session
import ../agent-flow-bend/Canonical.bend as C
law selected_literal:
  {S.take(S.enqueue(S.State{[], 0n}, 3n, 2n)) == S.Taken{S.State{[], 3n}, Some{S.Entry{3n, 2n}}} : S.Taken}
def selected_literal(): {==}
law never_literal:
  {D.issued_outcome(C.NeverSent{}, 1n, 1n, 1n, 2n, 3n, 5n) == D.Handled{True{}, [D.Action{C.JevRequestSettled{1n, 1n, 1n, 2n, 3n, C.NeverSent{}, True{}}, 5n, None{}, False{}, None{}}]} : D.Handled}
def never_literal(): {==}
law duration_literal:
  {W.control(W.Advicee{1n, Session.Settings{10, 0, 2, 20, 0, 3}, Session.Stream{1, 0, 0, 0n, 0n, 0n, False{}, 0, 0, 0n, 10n, [5n]}, None{}}, W.Duration{11n}) == W.Updated{W.Advicee{1n, Session.Settings{10, 0, 2, 20, 0, 3}, Session.Stream{1, 0, 0, 0n, 0n, 0n, False{}, 0, 0, 0n, 10n, [5n]}, Some{11n}}, []} : W.Updated}
def duration_literal(): {==}
law coalescing_literal:
  {P.known(True{}, [7n], 7n, [D.Action{C.RetireReview{1n, 1n, 1n, 7n}, 0n, None{}, False{}, None{}}]) == P.Issued{[7n], []} : P.Issued}
def coalescing_literal(): {==}
`
  writeFileSync(join(copy, "Instances.bend"), literals)
  const instances = run(join(copy, "Instances.bend"))
  if (instances.status !== 0 || !instances.text.includes("ALL PROOFS CHECK")) throw new Error(instances.text)
  const proof = run(join(copy, "PROOF.bend"), true)
  if (proof.status !== 0 || !proof.text.includes("ALL PROOFS CHECK")) throw new Error(proof.text)
  const mutants = [
    ["Scheduler.bend", "case Nil{}: [entry]", "case Nil{}: Nil{}", "empty_queue_selection"],
    [
      "Scheduler.bend",
      "Taken{State{tail, at}, Some{Entry{at, order}}}",
      "Taken{State{Nil{}, at}, Some{Entry{at, order}}}",
      "take_preserves_tail"
    ],
    [
      "JevEffects.bend",
      "[ScheduledFact{Canonical.JevRequestSettled{p, l, r, o, request, Canonical.NeverSent{}, True{}}, delay}]",
      "[ScheduledFact{Canonical.JevRequestStarted{p, l, r, o, request}, 0n}, ScheduledFact{Canonical.JevRequestSettled{p, l, r, o, request, Canonical.NeverSent{}, True{}}, delay}]",
      "never_sent_lifecycle"
    ],
    ["Workload.bend", "Some{duration}}, []}", "Some{0n}}, []}", "duration_control_only_updates_profile"]
  ]
  for (const [name, before, after, law] of mutants) {
    const path = join(copy, name)
    const original = readFileSync(path, "utf8")
    if (!original.includes(before)) throw new Error(`missing mutant target ${law}`)
    writeFileSync(path, original.replace(before, after))
    const rejected = run(join(copy, "PROOF.bend"))
    writeFileSync(path, original)
    if (rejected.status === 0 || !rejected.text.includes(`Location: Laws.${law}`))
      throw new Error(`mutant did not fail in its law: ${law}\n${rejected.text}`)
    console.log(`candidate mutant rejected in Laws.${law}`)
  }
  const pendingProof = run(join(copy, "PendingEffects.bend"), true)
  if (pendingProof.status !== 0 || !pendingProof.text.includes("ALL PROOFS CHECK")) throw new Error(pendingProof.text)
  const pendingPath = join(copy, "PendingEffects.bend")
  const pendingOriginal = readFileSync(pendingPath, "utf8")
  writeFileSync(
    pendingPath,
    pendingOriginal.replace("case True{}: Issued{pending, Nil{}}", "case True{}: Issued{pending, actions}")
  )
  const pendingMutant = run(pendingPath)
  if (pendingMutant.status === 0 || !pendingMutant.text.includes("Location: already_issued_batch_coalesces"))
    throw new Error(`coalescing mutant did not fail in its proposal: ${pendingMutant.text}`)
  console.log("candidate coalescing mutant rejected in already_issued_batch_coalesces")
  console.log("candidate literal checks and general kernel proofs passed; five law-specific mutants rejected")
} finally {
  rmSync(temp, { recursive: true, force: true })
}
