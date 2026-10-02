import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = dirname(fileURLToPath(import.meta.url));
const run = (file, verdict = false) => {
  const result = spawnSync("bend", [file, ...(verdict ? ["--verdict"] : [])], { encoding: "utf8", timeout: 5000 });
  if (result.error) throw result.error;
  return { status: result.status, text: result.stdout + result.stderr };
};
const temp = mkdtempSync(join(tmpdir(), "hapsland-driver-laws-"));
try {
  const copy = join(temp, "monkey-business-bend");
  cpSync(root, copy, { recursive: true });
  symlinkSync(join(root, "../agent-flow-bend"), join(temp, "agent-flow-bend"), "dir");
  // Literal falsification precedes checking the general candidate proofs.
  const literals = `import Base
import ./Scheduler.bend as S
import ./Driver.bend as D
import ../agent-flow-bend/Canonical.bend as C
law selected_literal:
  {S.take(S.enqueue(S.State{[], 0n}, 3n, 2n)) == S.Taken{S.State{[], 3n}, Some{S.Entry{3n, 2n}}} : S.Taken}
def selected_literal(): {==}
law never_literal:
  {D.issued_outcome(C.NeverSent{}, 1n, 1n, 1n, 2n, 3n, 5n) == D.Handled{True{}, [D.Action{C.JevRequestSettled{1n, 1n, 1n, 2n, 3n, C.NeverSent{}, True{}}, 5n, None{}, False{}, None{}}]} : D.Handled}
def never_literal(): {==}
`;
  writeFileSync(join(copy, "Instances.bend"), literals);
  const instances = run(join(copy, "Instances.bend"));
  if (instances.status !== 0 || !instances.text.includes("ALL PROOFS CHECK")) throw new Error(instances.text);
  const proof = run(join(copy, "PROOF.bend"), true);
  if (proof.status !== 0 || !proof.text.includes("ALL PROOFS CHECK")) throw new Error(proof.text);
  const mutants = [
    ["Scheduler.bend", "case Nil{}: [entry]", "case Nil{}: Nil{}", "empty_queue_selection"],
    ["Scheduler.bend", "Taken{State{tail, at}, Some{Entry{at, order}}}", "Taken{State{Nil{}, at}, Some{Entry{at, order}}}", "take_preserves_tail"],
    ["Driver.bend", "Handled{True{}, [Action{Canonical.JevRequestSettled{p, l, r, o, request, Canonical.NeverSent{}, True{}}", "Handled{True{}, [immediate(Canonical.JevRequestStarted{p, l, r, o, request}, False{}), Action{Canonical.JevRequestSettled{p, l, r, o, request, Canonical.NeverSent{}, True{}}", "never_sent_lifecycle"],
  ];
  for (const [name, before, after, law] of mutants) {
    const path = join(copy, name);
    const original = readFileSync(path, "utf8");
    if (!original.includes(before)) throw new Error(`missing mutant target ${law}`);
    writeFileSync(path, original.replace(before, after));
    const rejected = run(join(copy, "PROOF.bend"));
    writeFileSync(path, original);
    if (rejected.status === 0 || !rejected.text.includes(`Location: Laws.${law}`)) throw new Error(`mutant did not fail in its law: ${law}\n${rejected.text}`);
    console.log(`candidate mutant rejected in Laws.${law}`);
  }
  console.log("candidate literal checks and general kernel proofs passed; three law-specific mutants rejected");
} finally { rmSync(temp, { recursive: true, force: true }); }
