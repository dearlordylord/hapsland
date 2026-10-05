import { mkdtempSync, copyFileSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = mkdtempSync(join(tmpdir(), "hapsland-lifecycle-laws-"));
const copy = join(directory, "core");
mkdirSync(copy);
const check = (file, verdict = false) => {
  const result = spawnSync("bend", [file, verdict ? "--verdict" : "--check-only"], { encoding: "utf8", timeout: 5000 });
  if (result.error) throw result.error;
  return { status: result.status, text: result.stdout + result.stderr };
};
try {
  for (const file of ["AdviceeLifecycle.bend", "Advicees.bend", "AdviceeLifecycleProposals.bend"])
    copyFileSync(join(root, file), join(copy, file));
  symlinkSync(join(root, "../agent-flow-bend"), join(directory, "agent-flow-bend"), "dir");
  // Independently stated literals precede the universal proposal kernel gate.
  writeFileSync(join(copy, "Instances.bend"), `import Base
import ./AdviceeLifecycle.bend as L
law departed:
  {L.valid_entry(Some{L.Entry{9n, 1n, L.Disconnected{}}}, 1n) == False{} : Bool}
def departed(): {==}
law removed:
  {L.valid_entry(Some{L.Entry{9n, 2n, L.Removed{}}}, 2n) == False{} : Bool}
def removed(): {==}
law fresh:
  {L.change([L.Entry{9n, 1n, L.Disconnected{}}, L.Entry{7n, 1n, L.Active{}}], 9n, L.Resume{}) == L.Changed{[L.Entry{9n, 2n, L.Active{}}, L.Entry{7n, 1n, L.Active{}}], Some{L.Entry{9n, 1n, L.Disconnected{}}}, Some{L.Entry{9n, 2n, L.Active{}}}, True{}} : L.Changed}
def fresh(): {==}
law refused:
  {L.resumed(False{}, [L.Entry{9n, 2n, L.Removed{}}], L.Entry{9n, 2n, L.Removed{}}) == L.Changed{[L.Entry{9n, 2n, L.Removed{}}], Some{L.Entry{9n, 2n, L.Removed{}}}, Some{L.Entry{9n, 2n, L.Removed{}}}, False{}} : L.Changed}
def refused(): {==}
law still_removed:
  {L.disconnected_entry_status(L.Entry{9n, 2n, L.Removed{}}) == L.Removed{} : L.Status}
def still_removed(): {==}
`);
  const instances = check(join(copy, "Instances.bend"));
  if (instances.status !== 0) throw new Error(instances.text);
  const proposals = check(join(copy, "AdviceeLifecycleProposals.bend"), true);
  if (proposals.status !== 0) throw new Error(proposals.text);
  const mutants = [
    ["entry_active(entry) && Nat.is_eq(lifetime(entry), generation)", "Nat.is_eq(lifetime(entry), generation)", "departed_activity_refused"],
    ["entry_active(entry) && Nat.is_eq(lifetime(entry), generation)", "Nat.is_eq(lifetime(entry), generation)", "removed_activity_refused"],
    ["Changed{entries, Some{entry}, Some{entry}, False{}}", "Changed{[], Some{entry}, Some{entry}, False{}}", "refused_resume_preserves_facts"],
    ["case Removed{}: Removed{}", "case Removed{}: Disconnected{}", "disconnect_preserves_removal"],
  ];
  const proposalSource = readFileSync(join(copy, "AdviceeLifecycleProposals.bend"), "utf8");
  const path = join(copy, "AdviceeLifecycle.bend");
  const original = readFileSync(path, "utf8");
  for (const [before, after, law] of mutants) {
    if (!original.includes(before)) throw new Error(`missing mutant ${law}`);
    writeFileSync(path, original.replace(before, after));
    const section = proposalSource.match(new RegExp(`law ${law}:\\n[\\s\\S]*?\\ndef ${law}\\([^\\n]*\\): \\{==\\}`))?.[0];
    if (!section) throw new Error(`missing exact proposal section ${law}`);
    writeFileSync(join(copy, "Mutant.bend"), `import Base\nimport ./AdviceeLifecycle.bend as L\n${section}\n`);
    const rejected = check(join(copy, "Mutant.bend"));
    writeFileSync(path, original);
    if (rejected.status === 0 || !rejected.text.includes(law)) throw new Error(`mutant did not fail the named proposal ${law}: ${rejected.text}`);
    console.log(`rejected ${law}`);
  }
  console.log("5 literal instances, 4 primitive proposal kernel proofs, 4 named mutant failures");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
