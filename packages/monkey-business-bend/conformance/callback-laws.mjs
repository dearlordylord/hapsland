import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

// Proposal evidence only. This mutates a scratch copy of the actual core; it
// neither changes accepted laws nor installs a project dependency.
const directory = fileURLToPath(new URL(".", import.meta.url));
const scratch = mkdtempSync(join(directory, "callback-law-"));
const source = readFileSync(new URL("../Callbacks.bend", import.meta.url), "utf8");
const marker = source.indexOf("# Candidate law proposals");
const names = ["hold_publishes_no_callback", "duplicate_keeps_original_fact", "drop_only_cancels_delivery"];
const qualify = value => value.replaceAll("update_one(", "C.update_one(")
  .replace(/\b(Target|Fact|Status|Original|Queued|Held|Dropped|Changed|State|Applied|Scheduled)\b/g, "C.$1");
const declarations = names.map(name => {
  const start = source.indexOf(`law ${name}:`);
  const end = source.indexOf(`\ndef ${name}(`, start);
  assert.ok(start > marker && end > start);
  return qualify(source.slice(start, end));
}).join("\n\n");
const proofs = names.map((name, index) => {
  const start = source.indexOf(`def ${name}(`);
  const end = index + 1 < names.length ? source.indexOf("\n#", start) : source.length;
  return `# ---- ${name} ----\n${qualify(source.slice(start, end)).replace(`def ${name}(`, `def Laws.${name}(`)}`;
}).join("\n\n");
const target = "C.Target{C.Owner{1n, 2n, 3n, 4n}, C.JevSettled{5n}, 6n}";
const action = "Driver.Action{Canonical.JevRequestSettled{1n, 2n, 3n, 4n, 5n, Canonical.RequestClear{}, True{}}, 7n, None{}, False{}, None{}}";
const at = { target, original_at: "7n", action, order: "6n", at: "8n", fresh: "9n" };
const run = args => {
  const executable = process.env.BUN ?? "bun";
  const result = spawnSync(executable, ["x", "github:nohzafk/bend-falsify#a50873f068c8ee81dd005f97f645717c7b7ca011", ...args], {
    cwd: scratch, encoding: "utf8", timeout: 60000,
    env: { ...process.env, PATH: `${dirname(executable)}:${process.env.PATH ?? ""}` },
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
};
try {
  writeFileSync(join(scratch, "core.bend"), source.slice(0, marker)
    .replaceAll("./Driver.bend", "../../Driver.bend").replaceAll("../agent-flow-bend/", "../../../agent-flow-bend/"));
  const imports = "import Base\nimport ./core.bend as C\nimport ../../Driver.bend as Driver\nimport ../../../agent-flow-bend/Canonical.bend as Canonical\n\n";
  writeFileSync(join(scratch, "LAWS.bend"), imports + declarations);
  writeFileSync(join(scratch, "PROOF.bend"), imports + "import ./LAWS.bend as Laws\n\n" + proofs);
  const fact = `C.Fact{${target}, 7n, ${action}}`;
  const instances = [
    { name: "held_original", claim: `{C.update_one(C.Original{${fact}, C.Queued{}, 6n}, C.Hold{}, 8n, 9n) == C.Changed{C.State{[C.Original{${fact}, C.Held{}, 6n}]}, C.Applied{}, [6n], []} : C.Changed}` },
    ...["Queued", "Held", "Dropped"].map(status => ({ name: `duplicate_${status}`, claim: `{C.update_one(C.Original{${fact}, C.${status}{}, 6n}, C.Duplicate{}, 8n, 9n) == C.Changed{C.State{[C.Original{${fact}, C.${status}{}, 6n}]}, C.Applied{}, [], [C.Scheduled{8n, 9n, ${action}}]} : C.Changed}` })),
    { name: "drop_is_not_settlement", claim: `{C.update_one(C.Original{${fact}, C.Queued{}, 6n}, C.Drop{}, 8n, 9n) == C.Changed{C.State{[C.Original{${fact}, C.Dropped{}, 6n}]}, C.Applied{}, [6n], []} : C.Changed}` },
  ];
  writeFileSync(join(scratch, "spec.json"), JSON.stringify({ imports: ["./core.bend as C", "../../Driver.bend as Driver", "../../../agent-flow-bend/Canonical.bend as Canonical"], instances }));
  writeFileSync(join(scratch, "mutants.json"), JSON.stringify([
    { law: names[0], section: names[0], from: "Original{fact, Held{}, order}]}, Applied{}, [order], Nil{}", to: "Original{fact, Held{}, order}]}, Applied{}, Nil{}, Nil{}",
      why: "holding leaves the original physical callback queued", at, failsIn: `Laws.${names[0]}` },
    { law: names[1], section: names[1], from: "Original{Fact{target, original_at, action}, status, order}]}, Applied{}, Nil{}, [Scheduled{at, fresh_order, action}]",
      to: "Original{Fact{target, original_at, action}, status, order}]}, Applied{}, Nil{}, Nil{}",
      why: "repetition silently drops the original callback instead of reaching Canonical", at: { ...at, status: "C.Queued{}" }, failsIn: `Laws.${names[1]}` },
    { law: names[2], section: names[2], from: "Original{fact, Dropped{}, order}]}, Applied{}, [order], Nil{}", to: "Original{fact, Dropped{}, order}]}, Applied{}, Nil{}, Nil{}",
      why: "drop leaves the queued completion live and can settle resources unexpectedly", at, failsIn: `Laws.${names[2]}` },
  ]));
  run(["spec.json"]);
  run(["mutants", "."]);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
