import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = mkdtempSync(join(root, "stop-falsify-"));
const pin = "github:nohzafk/bend-falsify#a50873f068c8ee81dd005f97f645717c7b7ca011";
const imports = text => text.replace(/^(import\s+)(\.[^\s]+\.bend)/gm,
  (_match, prefix, path) => prefix + relative(directory, resolve(root, path)));
const write = (name, text) => writeFileSync(join(directory, name), text);
const read = name => readFileSync(join(root, name), "utf8");
function execute(arguments_) {
  const result = spawnSync(process.env.BUN ?? "bun", ["x", pin, ...arguments_], {
    cwd: directory, stdio: "inherit", timeout: 60000,
    env: { ...process.env, PATH: process.env.BUN ? `${dirname(process.env.BUN)}:${process.env.PATH}` : process.env.PATH },
  });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`Stop proposal falsification failed: ${result.status}`);
}
try {
  write("core.bend", imports(read("StopScenario.bend")));
  write("LAWS.bend", imports(read("StopScenarioLAWS.bend")).replace("../StopScenario.bend as Stop", "./core.bend as Stop"));
  write("PROOF.bend", imports(read("StopScenarioPROOF.bend"))
    .replace("../StopScenarioLAWS.bend as Laws", "./LAWS.bend as Laws")
    .replace("def Laws.poll_", "# ---- captured scope ----\ndef Laws.poll_"));
  const claim = now => `{Stop.poll(Stop.Capture{2n,3n,4n,5n,6n,7n,11n},${now}n) == Canonical.StopPolled{2n,3n,4n,${now >= 11 ? "True{}" : "False{}"}} : Canonical.CanonicalEvent}`;
  write("spec.json", JSON.stringify({ imports: ["./core.bend as Stop", "./PROOF.bend as Proof",
    "../../agent-flow-bend/Canonical.bend as Canonical"], instances: [10,11,12].map(now => ({ name: `poll_at_${now}`, claim: claim(now) })) }, null, 2));
  const at = { p: "2n", l: "3n", r: "4n", attempt: "5n", token: "6n", started: "7n", cutoff: "11n", now: "11n" };
  const mutants = [
    { law: "poll_preserves_captured_scope", section: "captured scope", from: "Canonical.StopPolled{p,l,r,Nat.is_le(cutoff,now)}",
      to: "Canonical.StopPolled{p,Nat.add(l,1n),r,Nat.is_le(cutoff,now)}", why: "a Stop poll rebinds the issued lifetime", at, failsIn: "Laws.poll_preserves_captured_scope" },
    { law: "poll_preserves_captured_scope", section: "captured scope", from: "Canonical.StopPolled{p,l,r,Nat.is_le(cutoff,now)}", to: "Canonical.StopPolled{p,l,r,Nat.is_lt(cutoff,now)}",
      why: "cutoff equality is treated as waiting", at, failsIn: "Laws.poll_preserves_captured_scope" },
  ];
  const core = read("StopScenario.bend");
  for (const mutant of mutants) {
    if (core.split(mutant.from).length !== 2) throw new Error(`Stop mutation target absent or ambiguous: ${mutant.from}`);
  }
  write("mutants.json", JSON.stringify(mutants, null, 2));
  execute(["spec.json"]);
  execute(["mutants", "."]);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
