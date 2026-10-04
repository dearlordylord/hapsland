import { expect, it } from "vitest";
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE, type Run, type RunInput } from "./index.ts";
import { runWorkloadNative, runWorkloadEmitted } from "../../monkey-business-bend/conformance/workload-native-runner.mjs";
import { encodeWriterCapture, encodeWriterTarget, type WriterControl } from "./writer-controls.ts";
import { callbackPublicBoundary } from "./callback-native-codec.ts";
import { decodeNativePrefix } from "./callback-native-prefix.ts";
import { decodeWriterNativeBoundary } from "./writer-native-boundary.ts";
import { validateLiveControl, type LiveControl } from "./controls.ts";
import { encodeCollectionResponse } from "./collection-scenario.ts";
import { readBendList, readRecord } from "../../../src/canonical/boundary-schema.ts";

const modes = Array.from({ length: 13 }, (_, mode) => mode);
const seeds = [3, 17, 41, 97] as const;
const list = (values: readonly unknown[]): unknown => values.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" });
const none = { $: "None" };
const target = (partition = 1, round = 1, token = 51) => ({ partition, lifetime: 1, round, token });
const claim = (lease: number, partition = 1, round = 1, token = 51) => ({
  target: target(partition, round, token), claimStarted: 0, claimLifetimeMs: lease, capacity: 2,
  response: { partition, lifetime: 1, round, started: 0, deadline: 30, admittedBlock: false },
});
const graphLimits = { version: 1 as const, sourceBytes: 262144, treeBytes: 20480, files: 8, readBytes: 1572864, outgoingEdges: 16, depth: 4, work: 128 };
type OriginalBoundary = { endpoint: number; budget: number } | LiveControl
  | { kind: "originalResponseAttempt"; agent: string; openIndex: number; blocked: boolean }
  | { kind: "originalMemberLeave"; agent: string; admissionIndex: number };
function original(mode: number) {
  if (mode >= 11) return intersectionOriginal(mode);
  const seeded = mode >= 7, seed = seeded ? seeds[mode - 7]! : 1;
  const preparation = seeded ? 2 + seed % 3 : 2, delay = seeded ? 3 + seed % 4 : 5;
  const ready = preparation + delay, cutoff = ready + 2;
  const agents = seeded ? ["agent-1", "healthy-writer"] : ["owner"];
  const inputs = agents.map(agent => ({ kind: "edit" as const, agent, at: 0, bytes: 10, unitBytes: [5], outcome: "finding" as const }));
  // validateFileTreeProfile (file-trees.ts) requires maxFiles within branching/
  // depth capacity. The superseded two-files/zero-imports draft never ran.
  // One allowed edge preserves its files, sizes, clocks and writer controls.
  const tree = seeded ? DEFAULT_FILE_TREE_PROFILE : { ...DEFAULT_FILE_TREE_PROFILE, minFiles: 2, maxFiles: 2, maxImports: 1,
    minSourceBytes: 100, maxSourceBytes: 100, minTreeBytes: 20, maxTreeBytes: 20 };
  const sessions = agents.map((agent, index) => ({ agent, seed: (seed + Math.imul(index, 2654435761)) >>> 0,
    editIntervalMs: 1000000, variationMs: 0, editsPerTask: 1000 }));
  const boundaries: OriginalBoundary[] = [];
  const advance = (endpoint: number, budget = seeded ? 500 : 200) => boundaries.push({ endpoint, budget });
  const primary = seeded ? claim(cutoff) : claim(mode === 3 ? 7 : mode === 4 ? 6 : 8);
  advance(0, seeded ? 500 : 100);
  boundaries.push({ kind: "backgroundWriter", action: "claim", agent: agents[0]!, capture: primary });
  if (seeded) {
    boundaries.push({ kind: "backgroundWriter", action: "claim", agent: agents[1]!, capture: claim(cutoff + 10, 2, 2, 61) },
      { kind: "backgroundWriter", action: "release", agent: agents[0]!, target: target(1, 1, 99) },
      { kind: "backgroundWriter", action: "claim", agent: agents[0]!, capture: { ...primary, target: target(1, 1, 99) } });
    advance(0); advance(preparation); advance(ready);
    if (mode === 8) { advance(cutoff); boundaries.push({ kind: "backgroundWriter", action: "expire", agent: agents[0]!, target: target() }); }
    else if (mode === 7) boundaries.push({ kind: "backgroundWriter", action: "release", agent: agents[0]!, target: target() });
    else boundaries.push({ kind: "adviceeLifecycle", agent: agents[0]!, action: mode === 9 ? "disconnect" : "remove" });
    boundaries.push({ kind: "backgroundWriter", action: "attempt", agent: agents[0]!, target: target(), currentBlock: false },
      { kind: "backgroundWriter", action: "attempt", agent: agents[1]!, target: target(2, 2, 61), currentBlock: false });
    advance(mode === 8 ? cutoff + 1 : ready + 1);
  } else {
    if (mode === 5) boundaries.push({ kind: "backgroundWriter", action: "claim", agent: "owner", capture: claim(8, 1, 1, 52) });
    advance(7);
    if (mode === 1 || mode === 2) boundaries.push({ kind: "backgroundWriter", action: "release", agent: "owner", target: target(1, 1, mode === 1 ? 99 : 51) });
    boundaries.push({ kind: "backgroundWriter", action: "attempt", agent: "owner", target: mode === 6 ? { ...target(), lifetime: 2 } : target(), currentBlock: false });
    advance(8);
  }
  return { seeded, seed, preparation, delay, ready, cutoff, agents, inputs, tree, sessions, boundaries };
}
function intersectionOriginal(mode: number) {
  const agent = "agent-1", preparation = 2, delay = mode === 12 ? 10 : 5;
  const plain = { kind: "edit", agent, at: 0, bytes: 10, unitBytes: [5], outcome: "finding" } satisfies RunInput;
  const shared = { ...plain, evaluationInputs: ["shared-original"], revisionSubject: "same", revisionInput: "same" } satisfies RunInput;
  const boundaries: OriginalBoundary[] = [{ endpoint: 0, budget: mode === 12 ? 200 : 100 },
    { kind: "backgroundWriter", action: "claim", agent, capture: claim(20) }];
  if (mode === 11) boundaries.push({ kind: "outputProfile", outcome: "certain", delayMs: 5, leaseMs: 20 },
    { endpoint: 7, budget: 200 }, { kind: "collectionResponse", action: "open", agent,
      response: { partition: 1, lifetime: 1, round: 1, started: 7, deadline: 30, admittedBlock: false } },
    { kind: "backgroundWriter", action: "attempt", agent, target: target(), currentBlock: false },
    { kind: "originalResponseAttempt", agent, openIndex: 0, blocked: false }, { endpoint: 7, budget: 300 },
    { kind: "backgroundWriter", action: "release", agent, target: target() }, { endpoint: 8, budget: 100 }, { endpoint: 12, budget: 200 });
  else boundaries.push({ endpoint: 2, budget: 300 }, { kind: "originalMemberLeave", agent, admissionIndex: 0 },
    { endpoint: 3, budget: 100 }, { endpoint: 12, budget: 300 },
    { kind: "backgroundWriter", action: "attempt", agent, target: target(), currentBlock: false }, { endpoint: 13, budget: 200 });
  return { seeded: false, seed: 1, preparation, delay, ready: preparation + delay, cutoff: 20, agents: [agent],
    inputs: mode === 12 ? [shared, { ...shared }] : [plain], tree: DEFAULT_FILE_TREE_PROFILE,
    sessions: [{ agent, seed: 1, editIntervalMs: 1000000, variationMs: 0, editsPerTask: 1000 }], boundaries };
}
function nativeBoundary(boundary: OriginalBoundary) {
  if ("endpoint" in boundary) return { $: "writer_original_inputs.Advance", endpoint: boundary.endpoint, budget: boundary.budget };
  if (boundary.kind === "backgroundWriter") return { $: "writer_original_inputs.WriterControl", input: nativeControl(boundary) };
  if (boundary.kind === "adviceeLifecycle") return { $: "writer_original_inputs.Departure", agent: boundary.agent, partition: 1,
    action: { $: `AdviceeLifecycle.${boundary.action === "disconnect" ? "Disconnect" : "Remove"}` } };
  let input;
  if (boundary.kind === "collectionResponse" && boundary.action === "open") input = { $: "writer_intersection_controls.OpenResponse", agent: boundary.agent, response: encodeCollectionResponse(boundary.response) };
  else if (boundary.kind === "originalResponseAttempt") input = { $: "writer_intersection_controls.AttemptIssuedResponse", agent: boundary.agent, open_index: boundary.openIndex, blocked: boundary.blocked };
  else if (boundary.kind === "originalMemberLeave") input = { $: "writer_intersection_controls.LeaveMember", agent: boundary.agent, admission_index: boundary.admissionIndex };
  else if (boundary.kind === "outputProfile") input = { $: "writer_intersection_controls.OutputProfile", delay: boundary.delayMs, lease: boundary.leaseMs };
  else throw new TypeError("unsupported original writer boundary");
  return { $: "writer_original_inputs.IntersectionControl", input };
}
function nativeControl(value: WriterControl) {
  if (value.action === "claim") return { $: "writer_observed_driver.Claim", agent: value.agent, facts: encodeWriterCapture(value.capture) };
  return { $: `writer_observed_driver.${value.action === "attempt" ? "Attempt" : value.action === "release" ? "Release" : "Expire"}`,
    agent: value.agent, target: encodeWriterTarget(value.target), ...(value.action === "attempt" ? { blocked: value.currentBlock } : {}) };
}
// These independent original input literals are never obtained from an
// observed trace. The native family must retain exactly the declared inputs.
function frozenNativeInput(mode: number) {
  const source = original(mode), tree = source.tree;
  return { $: "writer_original_inputs.Scenario", configuration: { $: "sharing_original_inputs.Configuration", seed: source.seed,
    limits: { $: "Ledger.Limits", global_items: 32, global_bytes: 100000, partition_items: 16, partition_bytes: 50000 }, retention: mode === 12 ? 3000 : source.seeded ? 2000 : 1000,
    sessions: list(source.sessions.map((session, index) => ({ $: "sharing_original_inputs.SessionInput", agent: session.agent, identity: index + 1,
      profile: { $: "Workload.Profile", settings: { $: "Session.Settings", interval: 1000000, variation: 0, edits: 1000, pause: 500, response: 0, repairDelay: 300 },
        seed: session.seed, codes: list(Array.from(session.agent, char => char.charCodeAt(0))), bytes: 100, units: list([100]), duration: none } }))),
    tree: { $: "TreeFacts.Profile", min_files: tree.minFiles, max_files: tree.maxFiles, max_imports: tree.maxImports, max_depth: tree.maxDepth,
      denied_percent: tree.deniedPercent, missing_percent: tree.missingPercent ?? 0, unreadable_percent: tree.unreadablePercent ?? 0,
      repeated_percent: tree.repeatedEdgePercent ?? 0, cyclic_percent: tree.cyclicEdgePercent ?? 0, unsupported_percent: tree.unsupportedPercent ?? 0,
      deadline_step: tree.deadlineStep ?? 0, local_work: tree.localWork ?? 0, min_source: tree.minSourceBytes, max_source: tree.maxSourceBytes,
      min_tree: tree.minTreeBytes, max_tree: tree.maxTreeBytes },
    graph: { $: "ImportGraph.Limits", version: 1, source_bytes: 262144, tree_bytes: 20480, files: 8, read_bytes: 1572864, outgoing_edges: 16, depth: 4, work: 128 },
    preparation_delay: source.preparation, output_delay: 0, output_lease: 30000,
    outcomes: {$:"Driver.OutcomeEnvironment",outcome:{$:"Some",value:{$:"Canonical.RequestFinding"}},
      weights:list([0,1078525952,1078525952,0,0,0].map(high=>({$:"Numeric.Words",high,low:0})))}, reuse_entries: mode === 12 ? 8 : 0, reuse_bytes: mode === 12 ? 1 : 0 },
    edits: list(source.inputs.map(edit => {
      if (edit.kind !== "edit") throw new TypeError("expected original writer edit");
      return mode === 12 ? { $: "writer_original_inputs.SharedEdit", original: {
      $: "sharing_original_inputs.Edit", agent: edit.agent, at: edit.at, bytes: edit.bytes, units: list(edit.unitBytes!),
      subject: "same", input: "same", namespace: { $: "sharing_original_inputs.Namespace", partition: "agent-1", work: none, credential: none, prepared: "shared-original" },outcome:{$:"Some",value:{$:"Canonical.RequestFinding"}} } }
      : { $: "writer_original_inputs.Edit", agent: edit.agent, at: edit.at, bytes: edit.bytes, units: list(edit.unitBytes!),outcome:{$:"Some",value:{$:"Canonical.RequestFinding"}} }; })), jev_delay: source.delay,
    boundaries: list(source.boundaries.map(nativeBoundary)) };

}
const queued = (run: Run) => run.queuedFacts.map(({ at, order }) => ({ at, order }));
function publicCase(mode: number) {
  const source = original(mode), run = createRun({ seed: source.seed, retention: mode === 12 ? 3000 : source.seeded ? 2000 : 1000,
    inputs: source.inputs, sessions: source.sessions, preparationDelay: source.preparation, jevDelay: source.delay,
    fileTrees: source.tree, graphLimits, outcome: "finding", ...(mode === 12 ? { lifecycles: { reuse: { entryLimit: 8, byteLimit: 1 } } } : {}) });
  const controls: unknown[] = [], boundaries: unknown[] = [];
  for (const boundary of source.boundaries) {
    if ("endpoint" in boundary) {
      const result = run.advance({ untilTime: boundary.endpoint, maxEvents: boundary.budget });
      expect(result.reason).not.toBe("eventLimit");
      boundaries.push({ endpoint: boundary.endpoint, budget: boundary.budget, consumed: result.events,
        state: callbackPublicBoundary(run.observe(), [], []).endpoint, queued: queued(run) });
      if (mode === 11) {
        const reservations = run.observations.filter(frame => frame.event.kind === "collectionReserveLease"
          && frame.commands.some(command => command.kind === "collectionLeaseReserved"));
        const attempted = controls.some(value => readRecord(readRecord(value).control).kind === "collectionResponse"
          && readRecord(readRecord(value).control).action === "attempt");
        if (boundary.endpoint === 7) {
          expect(reservations).toHaveLength(attempted ? 1 : 0);
          expect(run.observations.filter(frame => frame.event.kind === "submissionTerminal")).toEqual([]);
          if (!attempted) expect(run.projection.pendingFindings).toHaveLength(1);
        } else if (boundary.endpoint === 8) {
          expect(run.projection.collection.claims).toEqual([]);
          expect(run.observations.filter(frame => frame.event.kind === "submissionTerminal")).toEqual([]);
          expect(reservations).toHaveLength(1);
        } else if (boundary.endpoint === 12) {
          const terminal = run.observations.filter(frame => frame.event.kind === "submissionTerminal");
          expect(terminal).toHaveLength(1);
          expect(terminal[0]?.event).toMatchObject({ kind: "submissionTerminal", certain: true });
          expect(reservations).toHaveLength(1);
        }
      }
      if (mode === 12 && (boundary.endpoint === 2 || boundary.endpoint === 3)) {
        expect(run.projection.revision.entries).toEqual([expect.objectContaining({ members: boundary.endpoint === 2 ? 2 : 1 })]);
        expect(run.projection.global).toEqual({ items: 1, bytes: 5 });
        expect(run.projection.dispatch.requests).toHaveLength(1);
        expect(run.projection.collection.leases).toEqual([]);
        expect(run.observations.filter(frame => frame.event.kind === "submissionTerminal")).toEqual([]);
      }
      if (mode === 12 && boundary.endpoint === 12) {
        expect(run.projection.pendingFindings).toHaveLength(1);
        expect(run.observations.filter(frame => frame.event.kind === "submissionTerminal")).toEqual([]);
      }
      if (source.seeded && boundary.endpoint === 0 && run.observe().writerReports.some(report => report.issued)) {
        expect(run.projection.collection.claims).toEqual([{ group: 2, owner: 61 }, { group: 1, owner: 51 }]);
        expect(run.projection.collection.leases).toEqual([]);
      }
      if (source.seeded && boundary.endpoint === source.preparation) {
        expect(run.observations.filter(frame => frame.event.kind === "preparationCompleted")).toHaveLength(2);
        expect(run.projection.dispatch.requests).toHaveLength(2);
        expect(run.projection.pendingFindings).toEqual([]);
      }
      if (mode < 11 && boundary.endpoint === source.ready && (source.seeded || !source.seeded && boundary.endpoint === 7)) {
        expect(run.projection.pendingFindings).toHaveLength(source.seeded ? 2 : 1);
        expect(run.projection.dispatch.requests).toEqual([]);
        expect(run.observations.filter(frame => frame.event.kind === "submissionTerminal")).toEqual([]);
      }
    } else {
      const before = run.projection, time = run.observe().now;
      let control: LiveControl;
      if (boundary.kind === "originalResponseAttempt") {
        const issued = run.observe().collectionResponseReports.filter(report => report.control.action === "open")[boundary.openIndex]?.issued;
        expect(issued).toEqual({ id: 2, partition: 1, lifetime: 1, round: 1 });
        if (!issued) throw new Error("original response was not issued");
        control = validateLiveControl({ kind: "collectionResponse", action: "attempt", agent: boundary.agent, target: issued, currentBlock: boundary.blocked });
      } else if (boundary.kind === "originalMemberLeave") {
        const event = run.observations.filter(frame => frame.event.kind === "beginObservedPreparation")[boundary.admissionIndex]?.event;
        if (event?.kind !== "beginObservedPreparation") throw new Error("missing original shared member");
        control = validateLiveControl({ kind: "sharingMember", action: "leave", agent: boundary.agent,
          target: { partition: event.partition, lifetime: event.lifetime, round: event.round, operation: event.observation } });
      } else control = validateLiveControl(boundary);
      run.applyControl(control);
      controls.push({ time, before, after: run.projection, control });
    }
  }
  const expectedOutputs = mode >= 11 || source.seeded ? 1 : [1, 1, 0, 0, 0, 1, 0][mode]!;
  const terminal = run.observations.filter(frame => frame.event.kind === "submissionTerminal");
  expect(terminal).toHaveLength(expectedOutputs);
  if (source.seeded) {
    expect(terminal[0]?.partition).toBe(2);
    expect(run.projection.collection.claims.some(claim => claim.group === 1)).toBe(false);
    expect(run.projection.collection.claims.some(claim => claim.group === 2 && claim.owner === 61)).toBe(true);
  }
  expect(run.projection.collection.leases).toEqual([]);
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestStarted")).toHaveLength(source.seeded ? 2 : 1);
  expect(run.observe().writerReports.filter(report => report.issued).map(report => report.issued)).toEqual(source.seeded
    ? [{ id: 1, partition: 1, lifetime: 1, round: 1 }, { id: 2, partition: 2, lifetime: 1, round: 2 }]
    : [{ id: 1, partition: 1, lifetime: 1, round: 1 }]);
  const replay = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())));
  expect(replay.observe()).toEqual(run.observe());
  expect(replay.queuedFacts).toEqual(run.queuedFacts);
  const observed = callbackPublicBoundary(run.observe(), controls, []);
  return { ...observed, reports: run.observe().writerReports, responseReports: run.observe().collectionResponseReports, boundaries, queued: queued(run), eventCount: run.observe().eventCount };
}

it.each(modes)("validates writer original case %i public progress and complete replay", mode => {
  publicCase(mode);
}, 30000);

const fixture=new URL("../../monkey-business-bend/conformance/writer-original-scenarios.bend",import.meta.url);
function compareOriginalFamily(value: unknown, expected: readonly ReturnType<typeof publicCase>[]): void {
  const cases=readBendList(value,readRecord,13);
  expect(cases).toHaveLength(modes.length);
  expect(expected).toHaveLength(modes.length);
  for(const [mode,original] of cases.entries()) {
    try {
      expect(original.input).toEqual(frozenNativeInput(mode));
      expect(decodeWriterNativeBoundary(original)).toEqual(expected[mode]);
    } catch(error) {
      throw new Error(`writer original case ${mode} business boundary: ${error instanceof Error ? error.message : String(error)}`,{cause:error});
    }
  }
}
it("compares all thirteen writer original cases fresh emitted/public full boundary",()=>{
  const expected=modes.map(publicCase);
  compareOriginalFamily(decodeNativePrefix(runWorkloadEmitted(fixture,{emissionTimeoutMs:30000}),"writer_scenarios"),expected);
},45000);
// One complete original family: C60 + clang90 + native5 + JS30/5 + cleanup15 =205 seconds.
it("compares all thirteen writer original cases full native/emitted/public/replay boundary",()=>{
  const expected=modes.map(publicCase);
  const native=runWorkloadNative(fixture,{emissionTimeoutMs:60000,clangTimeoutMs:90000}),emitted=runWorkloadEmitted(fixture,{emissionTimeoutMs:30000});
  expect(native).toEqual(emitted);
  const nativeDTO=decodeNativePrefix(native,"writer_scenarios"),emittedDTO=decodeNativePrefix(emitted,"writer_scenarios");
  expect(nativeDTO).toEqual(emittedDTO);
  compareOriginalFamily(nativeDTO,expected);
  compareOriginalFamily(emittedDTO,expected);
},205000);
