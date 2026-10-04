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
const hostPaths = ["index.ts", "shared-core.ts", "driver-codec.ts", "controls.ts", "outcomes.ts", "file-trees.ts", "preparation.ts", "session.ts", "lifecycle-profile.ts", "resource-scenarios.ts", "sizes.ts", "numeric-codec.ts", "jev-interventions.ts", "advicee-lifecycle.ts", "permit-controls.ts", "callback-controls.ts", "notice-controls.ts", "freshness-codec.ts", "sharing-controls.ts", "cache-controls.ts", "collection-scenario.ts", "stop-codec.ts", "writer-controls.ts", "collector-codec.ts", "expiry-controls.ts"].map(name => `../monkey-business/src/${name}`).concat(["../../src/canonical/simulation-adapter.ts", "../../src/canonical/simulation-codec.ts", "../../src/canonical/canonical-boundary.ts", "../../src/canonical/graph-adapter.ts"]);
const hostHash = hash(hostPaths.map(path => `${path}\0${readFileSync(join(root, path))}\0`).join(""));
const identityHash = hash(`${sourceHash}\0${hostHash}\0${buildHash}\0${declarationHash}`);
const preparationHash = hash(["../../src/canonical/import-graph.generated.js", "../monkey-business/src/preparation.ts", "../monkey-business/src/file-trees.ts"].map(path => readFileSync(join(root, path))).join(""));
if (process.argv.includes("--check")) {
  const manifest = JSON.parse(readFileSync(join(root, "generated.json"), "utf8"));
  if (manifest.identityHash !== identityHash || manifest.hostHash !== hostHash || manifest.preparationHash !== preparationHash || manifest.declarationHash !== declarationHash || manifest.sourceHash !== sourceHash || manifest.buildHash !== buildHash || manifest.moduleHash !== hash(readFileSync(join(root, "engine.mjs")))) throw new Error("Stale shared Monkey Business artifact; run node packages/monkey-business-bend/build.mjs");
} else {
  const temp = mkdtempSync(join(tmpdir(), "hapsland-monkey-business-"));
  try {
    const run = spawnSync("bend", [join(root, "Engine.bend"), "-o", join(temp, "engine.mjs")], { encoding: "utf8", timeout: 15000 });
    if (run.error || run.status !== 0) throw run.error ?? new Error(run.stdout + run.stderr);
    const compiled = readFileSync(join(temp, "engine.mjs"), "utf8");
    const marker = "export default {";
    const offset = compiled.lastIndexOf(marker);
    const names = ["prepare_command_context", "quiet_command", "quiet_event", "quiet_after", "writer_unissued_release_delivery", "writer_capture", "writer_departures", "writer_release_delivery", "writer_attempt", "writer_prepare", "writer_claim_event", "writer_feedback", "writer_release", "writer_expire", "collection_response_delivery_valid", "collection_response_open", "collection_response_close", "collection_response_attempt", "collection_response_after", "collection_response_valid", "collection_response_handle", "collection_response_expire", "collection_responses", "cache_begin", "cache_apply", "cache_removed", "configure_cache", "sharing_leave_all", "sharing_after", "sharing_admitted", "sharing_preprocess", "sharing_leave", "sharing_prepare", "sharing_route", "sharing_routed", "sharing_completion", "sharing_binding", "sharing_result", "freshness_admitted", "freshness_current", "freshness_checks", "callback_replaced", "notice_after", "notice_collection_prune", "notice_exercise", "notice_failure", "notice_lease", "notice_acknowledge", "callback_owner", "callback_issue", "callback_issue_output", "output_intervene", "output_deliver", "output_initial", "stop_initial", "stop_wake", "callback_delivered", "callback_originals", "callback_action", "activity_event_valid", "lifecycle_entries", "lifecycle_entry", "lifecycle_action", "activity_scope", "activity_valid", "activity_lifetime", "activity_edit", "permit_issue_action", "permit_issued", "permit_consumed", "preparation_active", "context_credentials", "credential_captured", "credential_matches", "callback_matches", "issue_actions", "edit_attempt", "scope_event", "scope_command", "scope_select", "intervene_request", "declare_advicee", "advicee_identity", "advicee_partition", "advicee_targets", "credentials", "configure_credentials", "credential_action", "generate_tree", "initial", "step", "canonical", "graph_step", "handle", "edit", "preparation_completed", "after", "enqueue", "take", "queued", "cancel", "fence", "preparation_fact_time", "revalidate", "clock", "configure_seed", "configure_workload", "workload_action", "workload_valid", "workload_duration", "pre_timing", "numeric_add", "numeric_divide", "random_initial", "random_sample", "session_initial", "session_next", "session_generation", "session_sizes", "session_burst", "session_interval", "session_rewind", "session_suspend", "session_finish", "session_advice", "session_delay", "stop_command", "stop_register", "stop_find", "stop_entries", "stop_active", "stop_progress", "stop_close", "stop_reserve", "stop_continued", "stop_reserved", "stop_budget", "stop_candidates", "stop_end", "stop_validation", "collector_configure", "collector_configured", "collector_command", "collector_after"];
    if (offset < 0 || names.some(name => !compiled.includes(`function $${name}$(`))) throw new Error("Bend shared engine JavaScript layout changed");
    // Same immediate-Nat ABI convention as agent-flow-bend's checked builds.
    // Keep all emitted policy code; avoid re-marshalling original opaque state.
    const marshaling = compiled.indexOf("function $0m0(");
    if (marshaling < 0 || marshaling >= offset) throw new Error("Bend shared engine marshalling layout changed");
    const emitted = compiled.slice(0, marshaling).replaceAll("../agent-flow-bend/", "").replaceAll("./Session.", "Session.");
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
 quiet_command: (state,command,event,partition,now) => run_loop($quiet_command$(state,facts(command),facts(event),facts(partition),facts(now))),
 quiet_event: (state,event,native_idle,stop_absent) => run_loop($quiet_event$(state,facts(event),facts(native_idle),facts(stop_absent))),
 quiet_after: (state,event,partition,now,window,native_idle,stop_absent) => run_loop($quiet_after$(state,facts(event),facts(partition),facts(now),facts(window),facts(native_idle),facts(stop_absent))),
 writer_unissued_release_delivery: (state,pending,now) => run_loop($writer_unissued_release_delivery$(state,facts(pending),facts(now))),
 writer_capture: (state,target) => run_loop($writer_capture$(state,facts(target))),
 writer_departures: (before,state,event) => run_loop($writer_departures$(before,state,facts(event))),
 writer_release_delivery: (state,capture,event,now) => run_loop($writer_release_delivery$(state,facts(capture),facts(event),facts(now))),
 writer_attempt: (state,target,now,block) => run_loop($writer_attempt$(state,facts(target),facts(now),facts(block))),
 writer_prepare: (state,fact) => run_loop($writer_prepare$(state,facts(fact))),
 writer_claim_event: (state,pending,now) => run_loop($writer_claim_event$(state,facts(pending),facts(now))),
 writer_feedback: (state,pending,event,commands,now) => run_loop($writer_feedback$(state,facts(pending),facts(event),facts(commands),facts(now))),
 writer_release: (state,target) => run_loop($writer_release$(state,facts(target))),
 writer_expire: (state,target,now) => run_loop($writer_expire$(state,facts(target),facts(now))),
 collection_response_delivery_valid: (state,target,now,event) => run_loop($collection_response_delivery_valid$(state,facts(target),facts(now),facts(event))),
 collection_response_open: (state,response) => run_loop($collection_response_open$(state,facts(response))),
 collection_response_close: (state,id,p,l,r) => run_loop($collection_response_close$(state,facts(id),facts(p),facts(l),facts(r))),
 collection_response_attempt: (state,id,p,l,r,now,block) => run_loop($collection_response_attempt$(state,facts(id),facts(p),facts(l),facts(r),facts(now),facts(block))),
 collection_response_after: (state,target,event,commands) => run_loop($collection_response_after$(state,facts(target),facts(event),facts(commands))),
 collection_response_valid: (state,target,now) => run_loop($collection_response_valid$(state,facts(target),facts(now))),
 collection_response_handle: (state,event,command,context,target) => run_loop($collection_response_handle$(state,facts(event),facts(command),facts(context),facts(target))),
 collection_response_expire: (state,now) => run_loop($collection_response_expire$(state,facts(now))),
 collection_responses: state => run_loop($collection_responses$(state)),
 cache_begin: (before,state,event,commands) => run_loop($cache_begin$(before,state,facts(event),facts(commands))),
 cache_apply: (state,fact) => run_loop($cache_apply$(state,facts(fact))),
 cache_removed: (before,commands) => run_loop($cache_removed$(before,facts(commands))),
 configure_cache: (state,enabled,entries,bytes) => run_loop($configure_cache$(state,facts(enabled),facts(entries),facts(bytes))),
 sharing_prepare: (state,scope,keys,sizes) => run_loop($sharing_prepare$(state,facts(scope),facts(keys),facts(sizes))),
 sharing_after: (before,after,event,commands) => run_loop($sharing_after$(before,after,facts(event),facts(commands))),
 sharing_admitted: (state,scope,source,command) => run_loop($sharing_admitted$(state,facts(scope),facts(source),facts(command))),
 sharing_preprocess: (state,event,order,horizon) => run_loop($sharing_preprocess$(state,facts(event),facts(order),facts(horizon))),
 sharing_leave_all: (state,p,l) => run_loop($sharing_leave_all$(state,facts(p),facts(l))),
 sharing_leave: (state,scope) => run_loop($sharing_leave$(state,facts(scope))),
 sharing_route: (state,route) => run_loop($sharing_route$(state,facts(route))),
 sharing_routed: (state,route,commands) => run_loop($sharing_routed$(state,facts(route),facts(commands))),
 sharing_completion: (state,event) => run_loop($sharing_completion$(state,facts(event))),
 sharing_binding: (state,scope) => run_loop($sharing_binding$(state,facts(scope))),
 sharing_result: (state,evaluation) => run_loop($sharing_result$(state,facts(evaluation))),
 freshness_admitted: (state,scope,source,command) => run_loop($freshness_admitted$(state,facts(scope),facts(source),facts(command))),
 freshness_current: (state,scope) => run_loop($freshness_current$(state,facts(scope))),
 freshness_checks: (state,scope) => run_loop($freshness_checks$(state,facts(scope))),
 notice_after: (before,state,scope,event,commands,now,profile) => run_loop($notice_after$(before,state,facts(scope),facts(event),facts(commands),facts(now),facts(profile))),
 notice_collection_prune: (state,partition,group,now) => run_loop($notice_collection_prune$(state,facts(partition),facts(group),facts(now))),
 notice_exercise: (scope) => run_loop($notice_exercise$(facts(scope))),
 notice_failure: (state,scope,now,key,sequence) => run_loop($notice_failure$(state,facts(scope),facts(now),facts(key),facts(sequence))),
 notice_lease: (state,partition,group,key) => run_loop($notice_lease$(state,facts(partition),facts(group),facts(key))),
 notice_acknowledge: (state,partition,group,key) => run_loop($notice_acknowledge$(state,facts(partition),facts(group),facts(key))),
 callback_replaced: (state,orders) => run_loop($callback_replaced$(state,facts(orders))),
 callback_owner: (state,event) => run_loop($callback_owner$(state,facts(event))),
 callback_issue: (state,owner,order,at,action) => run_loop($callback_issue$(state,facts(owner),facts(order),facts(at),facts(action))),
 callback_issue_output: (state,owner,order,at,action,capture) => run_loop($callback_issue_output$(state,facts(owner),facts(order),facts(at),facts(action),facts(capture))),
 output_intervene: (state,target,outcome,receipt) => run_loop($output_intervene$(state,facts(target),facts(outcome),facts(receipt))),
 stop_reserve: (capture,selected,now) => run_loop($stop_reserve$(facts(capture),facts(selected),facts(now))),
 stop_continued: (capture) => run_loop($stop_continued$(facts(capture))),
 stop_reserved: (capture,selected,failed,delay) => run_loop($stop_reserved$(facts(capture),facts(selected),facts(failed),facts(delay))),
 stop_budget: (state,capture) => run_loop($stop_budget$(state,facts(capture))),
 stop_candidates: (state,capture) => run_loop($stop_candidates$(state,facts(capture))),
 stop_end: (state,capture,continuation) => run_loop($stop_end$(state,facts(capture),facts(continuation))),
 stop_validation: (capture,advice,current,credential,generation,readable) => run_loop($stop_validation$(facts(capture),facts(advice),facts(current),facts(credential),facts(generation),facts(readable))),
 collector_configure: (state,profile) => run_loop($collector_configure$(state,facts(profile))),
 collector_configured: (state) => run_loop($collector_configured$(state)),
 collector_command: (state,event,command,context) => run_loop($collector_command$(state,facts(event),facts(command),facts(context))),
 collector_after: (state,event) => run_loop($collector_after$(state,facts(event))),
 stop_command: (state,event,command,context,factsInput) => run_loop($stop_command$(state,facts(event),facts(command),facts(context),facts(factsInput))),
 stop_register: (state,input) => run_loop($stop_register$(state,facts(input))),
 stop_find: (state,p) => run_loop($stop_find$(state,facts(p))),
 stop_entries: (state) => run_loop($stop_entries$(state)),
 stop_active: (state,p) => run_loop($stop_active$(state,facts(p))),
 stop_progress: (state,p,a,change) => run_loop($stop_progress$(state,facts(p),facts(a),facts(change))),
 stop_close: (state,p) => run_loop($stop_close$(state,facts(p))),
 stop_initial: (capture) => run_loop($stop_initial$(facts(capture))),
 stop_wake: (capture,now) => run_loop($stop_wake$(facts(capture),facts(now))),
 output_initial: (capture,terminalOnly) => run_loop($output_initial$(facts(capture),facts(terminalOnly))),
 output_deliver: (receipt,now) => run_loop($output_deliver$(facts(receipt),facts(now))),
 callback_delivered: (state,order) => run_loop($callback_delivered$(state,facts(order))),
 callback_originals: (state) => run_loop($callback_originals$(state)),
 callback_action: (state,target,control,receipt,at,order) => run_loop($callback_action$(state,facts(target),facts(control),facts(receipt),facts(at),facts(order))),
 activity_event_valid: (state, event, partition, incarnation) => run_loop($activity_event_valid$(state, facts(event), facts(partition), facts(incarnation))),
 lifecycle_entries: (state) => run_loop($lifecycle_entries$(state)),
 lifecycle_entry: (state, partition) => run_loop($lifecycle_entry$(state, facts(partition))),
 lifecycle_action: (state, partition, action) => run_loop($lifecycle_action$(state, facts(partition), facts(action))),
 activity_scope: (state, partition) => run_loop($activity_scope$(state, facts(partition))),
 activity_valid: (state, partition, incarnation) => run_loop($activity_valid$(state, facts(partition), facts(incarnation))),
 activity_lifetime: (state, partition) => run_loop($activity_lifetime$(state, facts(partition))),
 activity_edit: (state, partition, incarnation) => run_loop($activity_edit$(state, facts(partition), facts(incarnation))),
 permit_issue_action: (capture,started,now) => run_loop($permit_issue_action$(facts(capture),facts(started),facts(now))),
 permit_issued: (capture, token) => run_loop($permit_issued$(facts(capture), facts(token))),
 permit_consumed: (state, command, partition, lifetime) => run_loop($permit_consumed$(state, facts(command), facts(partition), facts(lifetime))),
 preparation_active: (state, partition, lifetime, round, operation) => run_loop($preparation_active$(state, facts(partition), facts(lifetime), facts(round), facts(operation))),
 context_credentials: (state, event, context) => run_loop($context_credentials$(state, facts(event), facts(context))),
 credential_captured: (state, operation) => run_loop($credential_captured$(state, facts(operation))),
 credential_matches: (state, operation) => run_loop($credential_matches$(state, facts(operation))),
 callback_matches: (event, target) => run_loop($callback_matches$(facts(event), facts(target))),
 issue_actions: (state, actions) => run_loop($issue_actions$(state, facts(actions))),
 edit_attempt: (state, partition, lifetime) => run_loop($edit_attempt$(state, facts(partition), facts(lifetime))),
 scope_event: (before, after, event, provided) => run_loop($scope_event$(before, after, facts(event), facts(provided))),
 scope_command: (before, after, command, provided) => run_loop($scope_command$(before, after, command, facts(provided))),
 scope_select: (bindings, partition) => run_loop($scope_select$(facts(bindings), facts(partition))),
 intervene_request: (state, target, outcome, delay) => run_loop($intervene_request$(state, facts(target), facts(outcome), facts(delay))),
 declare_advicee: (state, identity, seed) => run_loop($declare_advicee$(state, facts(identity), seed)),
 advicee_identity: (state, identity) => run_loop($advicee_identity$(state, facts(identity))),
 advicee_partition: (state, partition) => run_loop($advicee_partition$(state, facts(partition))),
 advicee_targets: (state, identity) => run_loop($advicee_targets$(state, facts(identity))),
 credentials: state => run_loop($credentials$(state)),
 configure_credentials: (state, available, generation) => run_loop($configure_credentials$(state, available, facts(generation))),
 credential_action: (state, available, rotation) => run_loop($credential_action$(state, available, rotation)),
 generate_tree: (seed, operation, unit, profile, limits) => run_loop($generate_tree$(facts(seed), facts(operation), facts(unit), facts(profile), facts(limits))),
 initial: limits => run_loop($initial$(facts(limits))),
 step: (state, event) => run_loop($step$(state, facts(event))),
 canonical: state => run_loop($canonical$(state)),
 graph_step: (state, key, position, limits, event) => run_loop($graph_step$(state, facts(key), facts(position), facts(limits), facts(event))),
 prepare_command_context: (state,command,source_job,environment,context) => run_loop($prepare_command_context$(state,command,facts(source_job),facts(environment),facts(context))),
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
 session_delay: (settings, random) => run_loop($session_delay$(facts(settings), random)),
 clock: state => run_loop($clock$(state)),
 configure_seed: (state, seed) => run_loop($configure_seed$(state, facts(seed))),
 configure_workload: (state, partition, profile) => run_loop($configure_workload$(state, facts(partition), facts(profile))),
 workload_action: (state, partition, action) => run_loop($workload_action$(state, facts(partition), facts(action))),
 workload_valid: (state, partition, generation, recurring) => run_loop($workload_valid$(state, facts(partition), facts(generation), recurring)),
 workload_duration: (state, partition, fallback) => run_loop($workload_duration$(state, facts(partition), facts(fallback))),
 pre_timing: (state, partition, provided, fallback, lifetime) => run_loop($pre_timing$(state, facts(partition), facts(provided), facts(fallback), facts(lifetime))),
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
