import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const project = join(root, "progress-proof");
const source = readFileSync(join(project, "LAWS.bend"), "utf8");
const laws = new Map([...source.matchAll(/^law (\w+):\n([\s\S]*?)(?=^(?:law |def )|$(?![\s\S]))/gm)].map(([, name, body]) => {
  const binders = [...body.matchAll(/^  for \+?(\w+):[^\n]+/gm)].map(match => match[1]);
  return [name, { body, binders, claim: body.slice(body.indexOf("  {")).trim().replace(/\n#.*$/gm, "") }];
}));
const nat = n => `${n}n`;
const bool = n => n ? "True{}" : "False{}";
const list = items => items.length ? `${items.join(" <> ")} <> Nil{}` : "Nil{}";
const entry = (i, seed) => `Dispatch.Entry{${nat(seed)}, 1n, 2n, ${nat(i)}, ${nat(i)}, False{}, ${bool(i % 2)}}`;
const request = (i, seed) => `Dispatch.Request{${nat(seed)}, 1n, 2n, ${nat(i)}, ${nat(i + 1)}, ${bool(i % 2)}, ${bool(i % 2)}}`;
const responsiveWitness = n => n === 0 ? "Unit{}" : `({==}, ${responsiveWitness(n - 1)})`;
const instances = [];
const add = (law, at) => {
  const { binders, claim } = laws.get(law);
  assert.deepEqual(Object.keys(at).sort(), [...binders].sort(), `${law}: exact binders`);
  const pattern = new RegExp(`\\b(${binders.join("|")})\\b`, "g");
  const hypotheses = [...laws.get(law).body.matchAll(/^  for (?:eligible|known): (\{[\s\S]*? : Bool\})/gm)]
    .map(match => match[1].replace(pattern, name => at[name]));
  if (law === "every_responsive_completion_order_resolves") {
    const responsiveType = `Laws.Responsive(${at.responses}, ${at.requests})`;
    const witness = responsiveWitness((at.responses.match(/Dispatch.Request\{/g) ?? []).length);
    hypotheses.push({ type: responsiveType, witness });
    hypotheses.push(`{List.length(&2, Dispatch.Request, ${at.responses}) == List.length(&2, Dispatch.Request, ${at.requests}) : Nat}`);
  }
  instances.push({ law, claim: claim.replace(pattern, name => at[name]), hypotheses });
};
for (const seed of [0, 1, 7, 42]) for (let count = 0; count <= 9; count++) {
  const context = { queued: list([entry(11, seed), entry(12, seed)]),
    running: list([entry(13, seed)]), sequence: nat(seed),
    requests: list(Array.from({ length: count }, (_, i) => request(i, seed))) };
  for (const closed of [false, true]) add("request_cohort_resolves", { ...context, closed: bool(closed) });
  add("settled_failures_allow_fresh_request", { ...context, partition: nat(seed), lifetime: "1n", round: "2n", operation: "99n", request: "100n" });
}
for (const id of [0, 1, 7, 42]) for (const reoffered of [false, true]) for (const surface of ["Edit", "Background", "Stop"]) {
  add("eligible_advice_reaches_handoff", { item: nat(id), round: nat(id), token: nat(id + 1), reoffered: bool(reoffered), surface: `Handoff.${surface}{}` });
}
for (const id of [0, 1, 7, 42]) add("uncertain_background_reaches_stop_handoff", { item: nat(id), round: nat(id), token: nat(id + 1) });
for (const outcome of ["NeverSent", "RequestFinding", "RequestClear", "RequestBackendFailure", "RequestTimeout", "RequestInterrupted"]) {
  add("supplied_outcome_has_valid_phase", { outcome: `Canonical.${outcome}{}` });
}
for (const id of [0, 1, 7, 42]) for (const surface of ["Edit", "Background", "Stop"]) {
  for (const phase of ["Handoff.Available{}", `Handoff.Reserved{${nat(id + 1)}, Handoff.${surface}{}}`,
    `Handoff.Authorized{${nat(id + 1)}, Handoff.${surface}{}}`, `Handoff.Submitted{Handoff.${surface}{}}`,
    "Handoff.Uncertain{Handoff.Background{}}"])
    add("runnable_advice_reaches_handoff", { lease: `Handoff.Lease{${nat(id)}, ${nat(id)}, False{}, False{}, ${phase}}`,
      token: nat(id + 2), surface: `Handoff.${surface}{}`, eligible: "{==}" });
}
for (const seed of [0, 1, 7, 42]) for (let count = 1; count <= 9; count++) for (let target = 0; target < count; target++) {
  add("matching_completion_decreases_request_count", { requests: list(Array.from({ length: count }, (_, i) => request(i, seed))),
    partition: nat(seed), lifetime: "1n", round: "2n", operation: nat(target), request: nat(target + 1), known: "{==}" });
}
for (const seed of [0, 1, 7, 42]) for (let count = 0; count <= 8; count++) {
  const requests = Array.from({ length: count }, (_, i) => request(i, seed));
  for (const responses of [requests, [...requests].reverse(), [...requests.slice(1), ...requests.slice(0, 1)]])
    add("every_responsive_completion_order_resolves", { requests: list(requests), responses: list(responses),
      responsive: "Unit{}", count: "{==}" });
}
assert.equal(laws.size, 8);
const imports = source.slice(0, source.indexOf("# Matching"));
const probes = selected => `${imports}
${source.slice(source.indexOf("def Responsive("), source.indexOf("# Every responsive"))}
${selected.map(({ claim, hypotheses }, index) =>
  `${hypotheses.map((hypothesis, h) => `def hypothesis_${index}_${h}() -> ${typeof hypothesis === "string" ? hypothesis : hypothesis.type.replaceAll("Laws.Responsive", "Responsive")}:
  ${typeof hypothesis === "string" ? "{==}" : hypothesis.witness}
`).join("\n")}\ndef instance_${index}() -> ${claim}:\n  {==}\n`).join("\n")}`;
const check = (file, verdict = false) => {
  const result = spawnSync("bend", [file, verdict ? "--verdict" : "--check-only"], { encoding: "utf8", timeout: 5000 });
  assert.notEqual(result.error?.code, "ETIMEDOUT", `Bend checker exceeded 5 seconds: ${file}`);
  return { ok: result.status === 0 && result.stdout.includes("ALL PROOFS CHECK"), output: result.stdout + result.stderr };
};
const temporary = mkdtempSync(join(tmpdir(), "hapsland-progress-"));
try {
  const mirror = join(temporary, "agent-flow-bend");
  cpSync(root, mirror, { recursive: true });
  const scratch = join(mirror, "progress-proof");
  const probe = join(scratch, "instances.bend");
  writeFileSync(probe, probes(instances));
  const result = check(probe);
  assert.ok(result.ok, result.output);
  // Positive control: the instances must detect the original invalid never-sent facts.
  const core = join(scratch, "core.bend");
  const original = readFileSync(core, "utf8");
  writeFileSync(core, original.replace("case Canonical.NeverSent{}: False{}", "case Canonical.NeverSent{}: True{}"));
  writeFileSync(probe, probes(instances.filter(instance => instance.law === "supplied_outcome_has_valid_phase")));
  const planted = check(probe);
  assert.ok(!planted.ok && /Location: instance_/.test(planted.output), "planted never-sent lifecycle bug escaped literal falsification");
  writeFileSync(core, original);
  console.log(`checked ${instances.length} literal instances of ${laws.size} progress laws; planted lifecycle bug caught`);
  if (!process.argv.includes("--falsify-only")) {
    const table = JSON.parse(readFileSync(join(project, "mutants.json"), "utf8"));
    assert.deepEqual(new Set(table.map(mutant => mutant.law)), new Set(laws.keys()), "every law has a mutant");
    const proofSource = readFileSync(join(project, "PROOF.bend"), "utf8");
    const header = proofSource.slice(0, proofSource.indexOf("# ----"));
    const definitions = [...proofSource.matchAll(/^def ([\w.]+)\([\s\S]*?(?=^def |$(?![\s\S]))/gm)]
      .map(match => ({ name: match[1], source: match[0] }));
    const neededProof = roots => {
      const needed = new Set(roots.map(name => `Laws.${name}`));
      let added = true;
      while (added) {
        added = false;
        for (const definition of definitions.filter(definition => needed.has(definition.name)))
          for (const candidate of definitions)
            if (!needed.has(candidate.name) && definition.source.includes(`${candidate.name}(`)) {
              needed.add(candidate.name); added = true;
            }
      }
      return definitions.filter(definition => needed.has(definition.name)).map(definition => definition.source).join("\n");
    };
    const coverage = [];
    for (const mutant of table) {
      cpSync(root, mirror, { recursive: true });
      const target = join(scratch, mutant.file);
      const originalTarget = readFileSync(target, "utf8");
      assert.equal(originalTarget.split(mutant.from).length, 2, `${mutant.law}: exactly one mutation target`);
      const instance = instances.find(instance => instance.law === mutant.law &&
        (mutant.instance !== "nonempty" || instance.claim.includes("Dispatch.Request{")));
      assert.ok(instance, `${mutant.law}: literal witness`);
      writeFileSync(probe, probes([instance]));
      assert.ok(check(probe).ok, `${mutant.law}: witness must hold on original core`);
      const dependencies = {
        settled_failures_allow_fresh_request: ["request_cohort_resolves"],
        runnable_advice_reaches_handoff: ["eligible_advice_reaches_handoff", "uncertain_background_reaches_stop_handoff"],
        every_responsive_completion_order_resolves: ["matching_completion_decreases_request_count"],
      };
      const kept = [...dependencies[mutant.law] ?? [], mutant.law];
      writeFileSync(join(scratch, "LAWS.bend"), imports + source.slice(source.indexOf("def Responsive("), source.indexOf("# Every responsive")) + kept.map(name => `law ${name}:\n${laws.get(name).body}`).join("\n"));
      const isolated = join(scratch, "PROOF.bend");
      writeFileSync(isolated, header + "\n" + neededProof(kept));
      const control = check(isolated);
      assert.ok(control.ok, `${mutant.law}: unmutated isolated proof: ${control.output}`);
      writeFileSync(target, originalTarget.replace(mutant.from, mutant.to));
      const compile = check(target);
      assert.ok(compile.ok, `${mutant.law}: mutant must compile: ${compile.output}`);
      const counter = check(probe);
      assert.ok(!counter.ok && /Location: instance_0/.test(counter.output), `${mutant.law}: literal mutant survived: ${counter.output}`);
      const rejected = check(isolated);
      const expectedLocation = mutant.expectedLocation ?? `Laws.${mutant.law}`;
      assert.ok(!rejected.ok && rejected.output.includes(`Location: ${expectedLocation}\n`),
        `${mutant.law}: mutant must fail in ${expectedLocation}: ${rejected.output}`);
      coverage.push({ law: mutant.law, target: mutant.file, location: expectedLocation,
        evidence: mutant.evidence ?? (mutant.expectedLocation ? "shared lemma" : "law's own proof") });
    }
    console.log(JSON.stringify({ mutantsRejected: coverage }, null, 2));
    const proof = check(join(project, "PROOF.bend"), true);
    assert.ok(proof.ok, proof.output);
    console.log("Bend progress proofs passed the kernel verdict");
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
