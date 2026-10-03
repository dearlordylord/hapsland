import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Only candidate laws are copied/mutated. Accepted laws and production sources
// stay untouched; each mutation must fail its own law at a stated witness.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = mkdtempSync(join(dirname(root), "native-run-falsify-"));
const pin = "github:nohzafk/bend-falsify#a50873f068c8ee81dd005f97f645717c7b7ca011";
const imports = text => text.replace(/^(import\s+)(\.[^\s]+\.bend)/gm, (_match, prefix, path) =>
  prefix + relative(directory, resolve(root, path)));
const write = (name, text) => writeFileSync(join(directory, name), text);
const read = name => readFileSync(join(root, name), "utf8");
function execute(arguments_) {
  const result = spawnSync(process.env.BUN ?? "bun", ["x", pin, ...arguments_], {
    cwd: directory, stdio: "inherit", timeout: 60000,
    env: { ...process.env, PATH: process.env.BUN ? `${dirname(process.env.BUN)}:${process.env.PATH}` : process.env.PATH },
  });
  if (result.error || result.status !== 0)
    throw result.error ?? new Error(`Candidate falsification failed: ${result.status}`);
}
try {
  write("core.bend", imports(read("NativeRun.bend")));
  write("Literal.bend", imports(read("NativeRunLiterals.bend")));
  write("LAWS.bend", imports(read("NativeRunLAWS.bend"))
    .replace("../monkey-business-bend/NativeRun.bend as Run", "./core.bend as Run\nimport ./Literal.bend as Literal"));
  write("PROOF.bend", imports(read("NativeRunPROOF.bend"))
    .replace("../monkey-business-bend/NativeRunLAWS.bend as Laws", "./LAWS.bend as Laws")
    .replace("def Laws.zero_", "# ---- zero budget ----\ndef Laws.zero_")
    .replace("def Laws.refused_", "# ---- atomic refusal ----\ndef Laws.refused_")
    .replace("def Laws.future_", "# ---- future profile ----\ndef Laws.future_"));
  write("spec.json", JSON.stringify({ imports: ["./core.bend as Run", "./Literal.bend as Literal",
    "../monkey-business-bend/NativeRunTypes.bend as T", "../monkey-business-bend/Types.bend as EngineTypes", "./LAWS.bend as Laws", "./PROOF.bend as Proof"], instances: [
    { name: "zero_retains_entire_state", claim: "{Run.advance(Literal.state(),0n,0n) == T.Advanced{Literal.state(),[]} : T.Advanced}" },
    { name: "refusal_retains_original", claim: "{Run.atomic_control(False{},Literal.state(),Literal.proposed()) == T.Controlled{Literal.state(),False{}} : T.Controlled}" },
    { name: "future_profile_retains_engine", claim: "{Run.core(Laws.controlled_state(Run.jev_control(Literal.state(),5n,Literal.weights()))) == Run.core(Literal.state()) : EngineTypes.State}" },
  ] }, null, 2));
  write("mutants.json", JSON.stringify([
    { law: "refused_control_is_atomic", section: "atomic refusal", from: "    case False{}: T.Controlled{original, False{}}", to: "    case False{}: T.Controlled{changed, False{}}", why: "refusal commits proposed mutations", at: { original: "Literal.state()", proposed: "Literal.proposed()" }, failsIn: "Laws.refused_control_is_atomic" },
    { law: "future_jev_profile_preserves_engine", section: "future profile", from: "      T.Controlled{T.State{core, items, next, count, seed,", to: "      T.Controlled{T.State{[Engine.configure_seed(core_value(core), 2n)], items, next, count, seed,", why: "future profile reseeds issued-work stream", at: { state: "Literal.state()", delay: "5n", weights: "Literal.weights()" }, failsIn: "Laws.future_jev_profile_preserves_engine" },
  ], null, 2));
  execute(["spec.json"]);
  execute(["mutants", "."]);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
