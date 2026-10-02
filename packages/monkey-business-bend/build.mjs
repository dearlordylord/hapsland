import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = dirname(fileURLToPath(import.meta.url));
const hash = value => createHash("sha256").update(value).digest("hex");
const consumed = new Map();
const collect = path => {
  if (consumed.has(path)) return;
  const source = readFileSync(path, "utf8");
  consumed.set(path, source);
  for (const match of source.matchAll(/^import\s+(\.[^\s]+\.bend)(?:\s|$)/gm)) collect(resolve(dirname(path), match[1]));
};
collect(join(root, "Engine.bend"));
const sourceHash = hash([...consumed].sort(([a], [b]) => a.localeCompare(b)).map(([path, source]) => `${relative(root, path)}\0${source}\0`).join(""));
const declarationHash = hash(readFileSync(join(root, "engine.d.mts")));
const buildHash = hash(readFileSync(fileURLToPath(import.meta.url)));
const hostPaths = ["index.ts", "shared-core.ts", "driver-codec.ts", "controls.ts", "outcomes.ts", "file-trees.ts", "preparation.ts", "session.ts", "lifecycle-profile.ts", "resource-scenarios.ts", "sizes.ts", "numeric-codec.ts"].map(name => `../monkey-business/src/${name}`).concat(["../../src/canonical/simulation-adapter.ts", "../../src/canonical/simulation-codec.ts", "../../src/canonical/canonical-boundary.ts", "../../src/canonical/graph-adapter.ts"]);
const hostHash = hash(hostPaths.map(path => `${path}\0${readFileSync(join(root, path))}\0`).join(""));
const identityHash = hash(`${sourceHash}\0${hostHash}\0${buildHash}\0${declarationHash}`);
const preparationHash = hash(["../../src/canonical/import-graph.generated.js", "../monkey-business/src/preparation.ts", "../monkey-business/src/file-trees.ts"].map(path => readFileSync(join(root, path))).join(""));
if (process.argv.includes("--check")) {
  const manifest = JSON.parse(readFileSync(join(root, "generated.json"), "utf8"));
  if (manifest.identityHash !== identityHash || manifest.hostHash !== hostHash || manifest.preparationHash !== preparationHash || manifest.declarationHash !== declarationHash || manifest.sourceHash !== sourceHash || manifest.buildHash !== buildHash || manifest.moduleHash !== hash(readFileSync(join(root, "engine.mjs")))) throw new Error("Stale shared Monkey Business artifact; run node packages/monkey-business-bend/build.mjs");
} else {
  const temp = mkdtempSync(join(tmpdir(), "hapsland-monkey-business-"));
  try {
    const run = spawnSync("bend", [join(root, "Engine.bend"), "-o", join(temp, "engine.mjs")], { encoding: "utf8", timeout: 5000 });
    if (run.error || run.status !== 0) throw run.error ?? new Error(run.stdout + run.stderr);
    const compiled = readFileSync(join(temp, "engine.mjs"), "utf8");
    const marker = "export default {";
    const offset = compiled.lastIndexOf(marker);
    const names = ["initial", "step", "canonical", "graph_step", "retire", "handle", "edit", "preparation_completed", "after", "enqueue", "take", "queued", "cancel", "fence", "preparation_fact_time", "revalidate", "clock", "configure_seed", "configure_workload", "workload_action", "workload_valid", "workload_duration", "sample_outcome", "pre_timing", "numeric_add", "numeric_divide", "random_initial", "random_sample", "session_initial", "session_next", "session_generation", "session_sizes", "session_burst", "session_interval", "session_rewind", "session_suspend", "session_finish", "session_advice", "pre_issue", "permit_actions", "session_delay"];
    if (offset < 0 || names.some(name => !compiled.includes(`function $${name}$(`))) throw new Error("Bend shared engine JavaScript layout changed");
    // Same immediate-Nat ABI convention as agent-flow-bend's checked builds.
    // Keep all emitted policy code; avoid re-marshalling original opaque state.
    const marshaling = compiled.indexOf("function $0m0(");
    if (marshaling < 0 || marshaling >= offset) throw new Error("Bend shared engine marshalling layout changed");
    const emitted = compiled.slice(0, marshaling).replaceAll("../agent-flow-bend/", "").replaceAll("../session-bend/Session.", "Session.");
    const module = emitted + `
export const SOURCE_IDENTITY = "shared-monkey-business-source-sha256:${identityHash}";
export const PREPARATION_SOURCE_IDENTITY = "import-preparation-sha256:${preparationHash}";

const facts = value => {
  if (typeof value === "bigint") {
    if (value < 0n || value > 281474976710655n) throw new RangeError("invalid immediate Nat");
    return Number(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0 || value >= 2 ** 48) throw new RangeError("invalid immediate Nat");
    return value;
  }
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "$" && typeof item === "string" ? (item.startsWith("../agent-flow-bend/") ? item.slice(19) : item) : facts(item)]));
  return value;
};
export default {
 initial: limits => run_loop($initial$(facts(limits))),
 step: (state, event) => run_loop($step$(state, facts(event))),
 canonical: state => run_loop($canonical$(state)),
 graph_step: (state, key, position, limits, event) => run_loop($graph_step$(state, facts(key), facts(position), facts(limits), facts(event))),
 retire: (state, operation) => run_loop($retire$(state, facts(operation))),
 handle: (state, event, command, context) => run_loop($handle$(state, facts(event), command, facts(context))),
 edit: (state, partition, lifetime) => run_loop($edit$(state, facts(partition), facts(lifetime))),
 preparation_completed: (partition, lifetime, round, operation, units, delay) => run_loop($preparation_completed$(facts(partition), facts(lifetime), facts(round), facts(operation), facts(units), facts(delay))),
 after: (before, state, event) => run_loop($after$(before, state, facts(event))),
 enqueue: (state, at, order) => run_loop($enqueue$(state, facts(at), facts(order))),
 take: state => run_loop($take$(state)),
 queued: state => run_loop($queued$(state)),
 cancel: (state, order) => run_loop($cancel$(state, facts(order))),
 fence: (state, event, generated, context) => run_loop($fence$(state, facts(event), generated, facts(context))),
 revalidate: (state, context) => run_loop($revalidate$(state, facts(context))),
 pre_issue: (state, factsInput) => run_loop($pre_issue$(state, facts(factsInput))),
 permit_actions: (state, capture) => run_loop($permit_actions$(state, facts(capture))),
 session_delay: (settings, random) => run_loop($session_delay$(facts(settings), random)),
 clock: state => run_loop($clock$(state)),
 configure_seed: (state, seed) => run_loop($configure_seed$(state, facts(seed))),
 configure_workload: (state, partition, profile) => run_loop($configure_workload$(state, facts(partition), facts(profile))),
 workload_action: (state, partition, action) => run_loop($workload_action$(state, facts(partition), facts(action))),
 workload_valid: (state, partition, generation, recurring) => run_loop($workload_valid$(state, facts(partition), facts(generation), recurring)),
 workload_duration: (state, partition, fallback) => run_loop($workload_duration$(state, facts(partition), facts(fallback))),
 pre_timing: (state, partition, provided, fallback, lifetime) => run_loop($pre_timing$(state, facts(partition), facts(provided), facts(fallback), facts(lifetime))),
 sample_outcome: (state, weights) => run_loop($sample_outcome$(state, facts(weights))),
 numeric_add: (a, b) => run_loop($numeric_add$(facts(a), facts(b))),
 numeric_divide: (a, b) => run_loop($numeric_divide$(facts(a), facts(b))),
 random_initial: seed => run_loop($random_initial$(facts(seed))),
 random_sample: (random, weights) => run_loop($random_sample$(random, facts(weights))),
 session_initial: (settings, seed, codes, bytes, units) => run_loop($session_initial$(facts(settings), seed, facts(codes), facts(bytes), facts(units))),
 session_next: (settings, stream) => run_loop($session_next$(facts(settings), stream)),
 session_generation: stream => run_loop($session_generation$(stream)),
 session_sizes: (stream, bytes, units) => run_loop($session_sizes$(stream, facts(bytes), facts(units))),
 session_burst: (count, stream) => run_loop($session_burst$(facts(count), stream)),
 session_interval: (settings, interval) => run_loop($session_interval$(facts(settings), interval)),
 session_rewind: (settings, stream) => run_loop($session_rewind$(facts(settings), stream)),
 session_suspend: (settings, stream, suspended) => run_loop($session_suspend$(facts(settings), stream, suspended)),
 session_finish: (stream, continuation) => run_loop($session_finish$(stream, continuation)),
 session_advice: (settings, stream) => run_loop($session_advice$(facts(settings), stream)),
 preparation_fact_time: (delay, index, count) => BigInt(run_loop($preparation_fact_time$(facts(delay), facts(index), facts(count)))),
};
`;

    writeFileSync(join(root, "engine.mjs"), module);
    writeFileSync(join(root, "generated.json"), JSON.stringify({ sourceHash, hostHash, identityHash, preparationHash, buildHash, declarationHash, moduleHash: hash(module) }, null, 2) + "\n");
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
