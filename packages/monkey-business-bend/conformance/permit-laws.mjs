import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

// Candidate evidence: temporary mutants never change the checked production core.
const source = readFileSync(new URL("../PermitScenario.bend", import.meta.url), "utf8");
const marker = source.indexOf("# Candidate law");
const proofStart = source.indexOf("def absent_post_expires", marker);
assert.ok(marker > 0 && proofStart > marker);
const scratch = mkdtempSync(join(fileURLToPath(new URL(".", import.meta.url)), "permit-law-"));
const run = args => {
  const executable = process.env.BUN ?? "bun";
  const result = spawnSync(executable, ["x", "github:nohzafk/bend-falsify#a50873f068c8ee81dd005f97f645717c7b7ca011", ...args], {
    cwd: scratch, encoding: "utf8", timeout: 60000,
    env: { ...process.env, PATH: `${dirname(executable)}:${process.env.PATH ?? ""}` },
  });
  process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? "");
  assert.equal(result.error, undefined); assert.equal(result.status, 0);
};
try {
  writeFileSync(join(scratch, "core.bend"), source.slice(0, marker).replaceAll("../agent-flow-bend/", "../../../agent-flow-bend/"));
  writeFileSync(join(scratch, "LAWS.bend"), "import Base\nimport ./core.bend as C\n\n" + source.slice(marker, proofStart)
    .replace("{issued(", "{C.issued(").replace("Capture{", "C.Capture{")
    .replace("Absent{}", "C.Absent{}").replace("[expire(", "[C.expire(").replace("List<&2, Fact>", "List<&2, C.Fact>"));
  writeFileSync(join(scratch, "PROOF.bend"), "import Base\nimport ./LAWS.bend as Laws\n\n# ---- absent POST expiry ----\n" + source.slice(proofStart).replace("def absent_post_expires", "def Laws.absent_post_expires"));
  writeFileSync(join(scratch, "spec.json"), JSON.stringify({ imports: ["./core.bend as C"], instances: [0, 1, 7].map(value => ({
    name: `absent_${value}`, claim: `{C.issued(C.Capture{${value}n,1n,2n,3n,13n,5n,C.Absent{},32n,4096n},1n) == [C.expire(${value}n,1n,1n,10n)] : List<&2,C.Fact>}`,
  })) }));
  writeFileSync(join(scratch, "mutants.json"), JSON.stringify([{
    law: "absent_post_expires", section: "absent POST expiry",
    from: "    case Absent{}: [expire(p, l, token, (deadline - started : Nat))]",
    to: "    case Absent{}: []", why: "drops unused permit expiry and leaks pending authority",
    at: { p: "1n", l: "1n", tool: "2n", started: "3n", deadline: "13n", delay: "5n", local: "32n", resident: "4096n", token: "1n" },
    failsIn: "Laws.absent_post_expires",
  }]));
  run(["spec.json"]); run(["mutants", "."]);
} finally { rmSync(scratch, { recursive: true, force: true }); }
