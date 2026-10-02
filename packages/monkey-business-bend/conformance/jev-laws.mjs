import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

// Candidate evidence only. The scratch core is copied from the live production
// module so mutations never modify the worktree or maintain a second policy.
const directory = fileURLToPath(new URL(".", import.meta.url));
const scratch = mkdtempSync(join(directory, "jev-law-"));
const source = readFileSync(new URL("../JevEffects.bend", import.meta.url), "utf8");
const marker = source.indexOf("# Candidate proposal");
assert.ok(marker > 0);
const declarations = source.slice(marker, source.indexOf("def started_never_sent_refused", marker));
const proof = source.slice(source.indexOf("def started_never_sent_refused", marker));
const run = (args) => {
  const executable = process.env.BUN ?? "bun";
  const result = spawnSync(executable, ["x", "github:nohzafk/bend-falsify#a50873f068c8ee81dd005f97f645717c7b7ca011", ...args],
    { cwd: scratch, encoding: "utf8", timeout: 60000,
      env: { ...process.env, PATH: `${dirname(executable)}:${process.env.PATH ?? ""}` } });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
};
try {
  writeFileSync(join(scratch, "core.bend"), source.slice(0, marker).replaceAll("../agent-flow-bend/", "../../../agent-flow-bend/"));
  writeFileSync(join(scratch, "LAWS.bend"), "import Base\nimport ./core.bend as C\nimport ../../../agent-flow-bend/Canonical.bend as Canonical\nimport ../../../agent-flow-bend/Dispatch.bend as Dispatch\n\n" + declarations
    .replaceAll("{intervene(", "{C.intervene(")
    .replaceAll("== RefusedStarted{} : Intervention}", "== C.RefusedStarted{} : C.Intervention}"));
  writeFileSync(join(scratch, "PROOF.bend"), "import Base\nimport ./LAWS.bend as Laws\n\n# ---- started NeverSent refusal ----\n" + proof.replace("def started_never_sent_refused", "def Laws.started_never_sent_refused"));
  const instances = ["0n", "1n", "7n", "Nat.add(4294967295n, 2n)"].flatMap((value, position) => ["False{}", "True{}"].map((interrupted, index) => ({
    name: `started_${position}_${index}`,
    claim: `{C.intervene(Some{Dispatch.Request{${value}, ${value}, ${value}, ${value}, ${value}, True{}, ${interrupted}}}, Canonical.NeverSent{}, ${value}) == C.RefusedStarted{} : C.Intervention}`,
  })));
  writeFileSync(join(scratch, "spec.json"), JSON.stringify({ imports: ["./core.bend as C", "../../../agent-flow-bend/Canonical.bend as Canonical", "../../../agent-flow-bend/Dispatch.bend as Dispatch"], instances }));
  writeFileSync(join(scratch, "mutants.json"), JSON.stringify([{
    law: "started_never_sent_refused", section: "started NeverSent refusal",
    from: "    case Canonical.NeverSent{} _: RefusedStarted{}",
    to: "    case Canonical.NeverSent{} _: Applied{[ScheduledFact{Canonical.JevRequestSettled{p, l, r, o, id, Canonical.NeverSent{}, True{}}, delay}]}",
    why: "allows NeverSent after an existing start", at: { p: "1n", l: "1n", r: "1n", o: "2n", id: "1n", delay: "5n", interrupted: "False{}" },
    failsIn: "Laws.started_never_sent_refused",
  }]));
  run(["spec.json"]);
  run(["mutants", "."]);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
