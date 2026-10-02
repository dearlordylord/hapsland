import { afterEach, expect, it, vi } from "vitest";
import fc from "fast-check";
import { CANONICAL_MAX_BYTES, initialCanonical, probabilityWords, projectCanonical, stepCanonical, type CanonicalEvent } from "./adapter.ts";
import { initialImportGraph, projectImportGraph, stepImportGraph, type ImportGraphEvent } from "./graph-adapter.ts";

const injected = vi.hoisted(() => ({ canonical: undefined as undefined | ((state: unknown) => unknown), graph: undefined as undefined | ((state: unknown) => unknown) }));
vi.mock("./canonical.generated.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./canonical.generated.js")>();
  return { ...original, bendCanonicalStep: (state: unknown, event: unknown) =>
    injected.canonical === undefined ? original.bendCanonicalStep(state, event) : injected.canonical(state) };
});
vi.mock("./import-graph.generated.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./import-graph.generated.js")>();
  return { ...original, bendImportGraphStep: (state: unknown, event: unknown) =>
    injected.graph === undefined ? original.bendImportGraphStep(state, event) : injected.graph(state) };
});
afterEach(() => { injected.canonical = undefined; injected.graph = undefined; });
const limits = { globalItems: 512, globalBytes: CANONICAL_MAX_BYTES, partitionItems: 16, partitionBytes: CANONICAL_MAX_BYTES };
const canonical = (event: unknown) => stepCanonical(initialCanonical(limits), event as CanonicalEvent);
const graph = (event: unknown) => stepImportGraph(initialImportGraph(), event as ImportGraphEvent);
const linked = (count: number, head: unknown, end: unknown = { $: "Nil" }): unknown => {
  let result = end;
  for (let index = 0; index < count; index += 1) result = { $: "Con", head, tail: result };
  return result;
};
const graphCopy = () => structuredClone(initialImportGraph()) as { graph: Record<string, unknown>; remaining: unknown };

it("rejects malformed canonical events, positive identities, bytes and excess fields", () => {
  const valid = { kind: "reserveCapacity", partition: 1, bytes: 1, purpose: "preparation" };
  for (const event of [null, [], {}, { ...valid, extra: true }, { ...valid, kind: "retired" }]) expect(() => canonical(event)).toThrow(TypeError);
  for (const key of Object.keys(valid)) {
    const event = { ...valid };
    Reflect.deleteProperty(event, key);
    expect(() => canonical(event)).toThrow(TypeError);
  }
  for (const partition of [0, -1, 1.5, 2 ** 48, 1n, NaN, Infinity]) expect(() => canonical({ ...valid, partition })).toThrow(TypeError);
  for (const bytes of [0, -1, 1.5, CANONICAL_MAX_BYTES + 1, 1n, NaN, Infinity]) expect(() => canonical({ ...valid, bytes })).toThrow(TypeError);
  expect(canonical({ ...valid, partition: 2 ** 48 - 1, bytes: CANONICAL_MAX_BYTES }).commands[0]?.kind).toBe("capacityGranted");
  const full = canonical({ ...valid, bytes: CANONICAL_MAX_BYTES });
  const refused = stepCanonical(full.state, { ...valid, kind: "reserveCapacity", purpose: "preparation", bytes: CANONICAL_MAX_BYTES });
  expect(refused.commands[0]?.kind).toBe("capacityRefused");
  expect(projectCanonical(refused.state).global.bytes).toBe(CANONICAL_MAX_BYTES);
});

it("normalizes ordinary negative zero and rejects invalid IEEE probability words", () => {
  expect(probabilityWords(-0)).toEqual(probabilityWords(0));
  for (const value of [-1, 1.01, NaN, Infinity, -Infinity]) expect(() => probabilityWords(value)).toThrow(RangeError);
  const invalid = [{ high: 0x80000000, low: 0 }, { high: 0x7ff00000, low: 0 }, { high: 0x7ff80000, low: 0 },
    { high: 0x3ff00000, low: 1 }, { high: -1, low: 0 }, { high: 2 ** 32, low: 0 },
    { high: 0, low: 0.5 }, { high: 0n, low: 0 }, { high: 0, low: 0, extra: 1 }];
  for (const probability of invalid) expect(() => canonical({ kind: "ruleFindingCheck", probability, threshold: probabilityWords(0.5) })).toThrow(TypeError);
});

it("roundtrips generated probability words through independent IEEE decoding", () => {
  fc.assert(fc.property(fc.double({ min: 0, max: 1, noNaN: true }), value => {
    const words = probabilityWords(value);
    const bytes = new DataView(new ArrayBuffer(8));
    bytes.setUint32(0, words.high, false);
    bytes.setUint32(4, words.low, false);
    expect(bytes.getFloat64(0, false)).toBe(Object.is(value, -0) ? 0 : value);
    expect(() => canonical({ kind: "ruleFindingCheck", probability: words, threshold: words })).not.toThrow();
  }), { numRuns: 80, seed: 174 });
});

it("preserves strict probability threshold decisions across generated finite values", () => {
  fc.assert(fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (value, threshold) => {
    expect(canonical({ kind: "ruleFindingCheck", probability: probabilityWords(value), threshold: probabilityWords(threshold) }).commands)
      .toEqual([{ kind: "ruleGate", gate: value > threshold ? "admit" : "omit" }]);
  }), { numRuns: 80, seed: 174 });
});

it("reserve followed by release restores accounting while preserving old snapshots", () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 100_000 }), bytes => {
    const before = initialCanonical(limits);
    const snapshot = projectCanonical(before);
    const reserved = stepCanonical(before, { kind: "reserveCapacity", partition: 1, bytes, purpose: "preparation" });
    const command = reserved.commands[0];
    if (command?.kind !== "capacityGranted") throw new Error("expected grant");
    expect(projectCanonical(reserved.state).global).toEqual({ items: 1, bytes });
    const released = stepCanonical(reserved.state, { kind: "releaseCapacity", reservation: command.id });
    expect(projectCanonical(released.state).global).toEqual(snapshot.global);
    expect(projectCanonical(before)).toBe(snapshot);
    expect(snapshot.global).toEqual({ items: 0, bytes: 0 });
  }), { numRuns: 50, seed: 174 });
});

it("strictly validates generated canonical command lists at 2048 cells without recursion", () => {
  const state = initialCanonical(limits);
  const command = { $: "Canonical.CompletedEditAbsent" };
  const evaluate = (commands: unknown) => {
    injected.canonical = state => ({ $: "Canonical.Advanced", state, commands });
    return stepCanonical(state, { kind: "checkCompletedEdit", tool: 1 });
  };
  expect(evaluate(linked(2048, command)).commands).toHaveLength(2048);
  const cyclic: { $: string; head: unknown; tail?: unknown } = { $: "Con", head: command };
  cyclic.tail = cyclic;
  for (const commands of [linked(2049, command), cyclic, { $: "Con", head: command },
    linked(1, command, { $: "Nil", extra: true }), linked(1, command, { $: "End" }),
    linked(1, { ...command, extra: true }), linked(1, { $: "Canonical.Unknown" }),
    linked(1, { $: "Canonical.QuietRoundWaiting" }), linked(1, { $: "Canonical.QuietRoundWaiting", since: 1n })]) {
    expect(() => evaluate(commands)).toThrow(TypeError);
  }
  injected.canonical = state => ({ $: "Canonical.Advanced", state, commands: { $: "Nil" }, extra: true });
  expect(() => stepCanonical(state, { kind: "checkCompletedEdit", tool: 1 })).toThrow(TypeError);
});

it("rejects oversized event arrays before reading their elements", () => {
  const unitBytes = Array(1025).fill(1);
  let reads = 0;
  Object.defineProperty(unitBytes, 0, { get: () => { reads += 1; throw new Error("must not read oversized array"); } });
  expect(() => canonical({ kind: "replaceCapacity", reservation: 1, unitBytes })).toThrow(TypeError);
  expect(reads).toBe(0);
  const edges = Array(129).fill(1);
  Object.defineProperty(edges, 0, { get: () => { reads += 1; throw new Error("must not read oversized array"); } });
  expect(() => graph({ kind: "root", target: 1, sourceBytes: 1, treeBytes: 1, edges })).toThrow(TypeError);
  expect(reads).toBe(0);
});

it("validates graph event edges at 128, rejects malformed identities and strict booleans", () => {
  const root = { kind: "root", target: 1, sourceBytes: 1, treeBytes: 1, edges: Array(128).fill(1) };
  expect(() => graph(root)).not.toThrow();
  for (const event of [{ ...root, edges: Array(129).fill(1) }, { ...root, extra: true },
    { ...root, target: 1n }, { ...root, sourceBytes: -1 }, { kind: "pathChecked", allowed: 1 },
    { kind: "resolved", target: 1, result: "unknown" }, { kind: "next", extra: true }]) expect(() => graph(event)).toThrow(TypeError);
});

it("validates copied graph state, safe bigint output and exact constructors", () => {
  const state = initialImportGraph();
  const snapshot = projectImportGraph(state);
  const copy = graphCopy();
  copy.graph.files = 3n;
  copy.remaining = 100n;
  expect(projectImportGraph(copy).files).toBe(3);
  expect(Object.isFrozen(projectImportGraph(copy))).toBe(true);
  for (const files of [-1n, BigInt(Number.MAX_SAFE_INTEGER) + 1n, -1, 1.5]) {
    const copy = graphCopy(); copy.graph.files = files;
    expect(() => projectImportGraph(copy)).toThrow(TypeError);
  }
  for (const patch of [{ extra: true }, { skipped_tree: 1 }, { phase: { $: "ImportGraph.Idle", extra: true } },
    { phase: { $: "ImportGraph.Unknown" } }, { phase: { $: "ImportGraph.Incomplete", reason: { $: "ImportGraph.Missing", extra: true } } }]) {
    const copy = graphCopy(); Object.assign(copy.graph, patch);
    expect(() => projectImportGraph(copy)).toThrow(TypeError);
  }
  const next = stepImportGraph(state, { kind: "root", target: 1, sourceBytes: 1, treeBytes: 1, edges: [2] });
  expect(projectImportGraph(state)).toBe(snapshot);
  expect(snapshot.pending).toEqual([]);
  expect(Object.isFrozen(next.state)).toBe(true);
  expect(Object.isFrozen(projectImportGraph(next.state).pending)).toBe(true);
});

it("bounds graph linked lists and rejects missing, cyclic and excess terminal cells", () => {
  const edge = { $: "ImportGraph.Edge", id: 1n, depth: 1n };
  const copy = graphCopy(); copy.graph.pending = linked(128, edge);
  expect(projectImportGraph(copy).pending).toHaveLength(128);
  const cyclic: { $: string; head: unknown; tail?: unknown } = { $: "Con", head: edge }; cyclic.tail = cyclic;
  for (const pending of [linked(129, edge), cyclic, { $: "Con", head: edge },
    linked(1, edge, { $: "Nil", extra: true }), linked(1, { ...edge, extra: true })]) {
    const copy = graphCopy(); copy.graph.pending = pending;
    expect(() => projectImportGraph(copy)).toThrow(TypeError);
  }
});


it("rejects incomplete/excess canonical limits and nested prospective facts", () => {
  for (const key of Object.keys(limits)) {
    const missing = { ...limits }; Reflect.deleteProperty(missing, key);
    expect(() => initialCanonical(missing)).toThrow(TypeError);
  }
  expect(() => initialCanonical({ ...limits, extra: true } as typeof limits)).toThrow(TypeError);
  const facts = { clockValid: true, hookWindow: 100, startedUpper: 1, nowLower: 1,
    adviceePermitLimit: 1, residentPermitLimit: 1 };
  const event = { kind: "issuePermit", partition: 1, lifetime: 1, tool: 1, started: 1, deadline: 10,
    now: 1, minimumStarted: 0, facts };
  for (const key of Object.keys(facts)) {
    const missing = { ...facts }; Reflect.deleteProperty(missing, key);
    expect(() => canonical({ ...event, facts: missing })).toThrow(TypeError);
  }
  expect(() => canonical({ ...event, facts: { ...facts, extra: true } })).toThrow(TypeError);
});

it("validates stop-group scopes and rejects oversized lists before reading cells", () => {
  const event = { kind: "stopGroupEnded", group: 1, lifetime: 1, round: 1, scopes: [{ partition: 1, round: 1 }] };
  expect(() => canonical(event)).not.toThrow();
  for (const scopes of [[{ partition: 1 }], [{ round: 1 }], [{ partition: 0, round: 1 }],
    [{ partition: 1, round: 0 }], [{ partition: 1, round: 1, extra: true }]]) {
    expect(() => canonical({ ...event, scopes })).toThrow(TypeError);
  }
  const scopes = Array(1025).fill({ partition: 1, round: 1 });
  let reads = 0;
  Object.defineProperty(scopes, 0, { get: () => { reads += 1; throw new Error("oversized scope read"); } });
  expect(() => canonical({ ...event, scopes })).toThrow(TypeError);
  expect(reads).toBe(0);
});

it("decodes generated graph steps with safe bigint commands and exact nested alternatives", () => {
  const state = initialImportGraph();
  const evaluate = (command: unknown, extra = false) => {
    injected.graph = state => ({ $: "ImportGraph.BoundedStep", state, command, ...(extra ? { extra: true } : {}) });
    return stepImportGraph(state, { kind: "next" });
  };
  expect(evaluate({ $: "ImportGraph.ResolveEdge", edge: 1n }).command).toEqual({ kind: "resolveEdge", edge: 1 });
  for (const command of [{ $: "ImportGraph.ResolveEdge" }, { $: "ImportGraph.ResolveEdge", edge: 1, extra: true },
    { $: "ImportGraph.Unknown" }, { $: "ImportGraph.ResolveEdge", edge: -1n },
    { $: "ImportGraph.UnitIncomplete", reason: { $: "ImportGraph.Unknown" } },
    { $: "ImportGraph.UnitIncomplete", reason: { $: "ImportGraph.Missing", extra: true } }]) {
    expect(() => evaluate(command)).toThrow(TypeError);
  }
  expect(() => evaluate({ $: "ImportGraph.NoCommand" }, true)).toThrow(TypeError);
});

it("rejects graph copies with missing constructors and nested edge fields", () => {
  const missingGraph = graphCopy(); Reflect.deleteProperty(missingGraph, "graph");
  expect(() => projectImportGraph(missingGraph)).toThrow(TypeError);
  const missingPhase = graphCopy(); Reflect.deleteProperty(missingPhase.graph, "phase");
  expect(() => projectImportGraph(missingPhase)).toThrow(TypeError);
  const missingEdgeDepth = graphCopy();
  missingEdgeDepth.graph.pending = linked(1, { $: "ImportGraph.Edge", id: 1 });
  expect(() => projectImportGraph(missingEdgeDepth)).toThrow(TypeError);
});

it("keeps failed generated transitions outside canonical provenance", () => {
  const original = initialCanonical(limits);
  const previous = projectCanonical(original);
  const advancedWithBadCommands = structuredClone(original);
  injected.canonical = () => ({ $: "Canonical.Advanced", state: advancedWithBadCommands,
    commands: linked(1, { $: "Canonical.Unknown" }) });
  expect(() => stepCanonical(original, { kind: "checkCompletedEdit", tool: 1 })).toThrow(TypeError);
  expect(() => projectCanonical(advancedWithBadCommands)).toThrow("foreign canonical state");

  const rejectedWithBadReason = structuredClone(original);
  injected.canonical = () => ({ $: "Canonical.Rejected", state: rejectedWithBadReason,
    reason: { $: "Canonical.Unknown" } });
  expect(() => stepCanonical(original, { kind: "checkCompletedEdit", tool: 1 })).toThrow(TypeError);
  expect(() => projectCanonical(rejectedWithBadReason)).toThrow("foreign canonical state");

  const malformed = structuredClone(original) as { ledger: Record<string, unknown> };
  malformed.ledger.extra = true;
  injected.canonical = () => ({ $: "Canonical.Advanced", state: malformed, commands: { $: "Nil" } });
  expect(() => stepCanonical(original, { kind: "checkCompletedEdit", tool: 1 })).toThrow(TypeError);
  expect(() => projectCanonical(malformed)).toThrow("foreign canonical state");
  expect(projectCanonical(original)).toBe(previous);
  expect(previous.global).toEqual({ items: 0, bytes: 0 });
});

it("rejects excess fields on leaf work kinds and known rejection reasons before publishing state", () => {
  const original = initialCanonical(limits);
  const opened = stepCanonical(original, { kind: "openRound", partition: 1, lifetime: 1 });
  const round = projectCanonical(opened.state).rounds[0]?.id;
  if (round === undefined) throw new Error("missing opened round");
  const prepared = stepCanonical(opened.state, { kind: "beginPreparation", partition: 1, lifetime: 1, round, bytes: 1 });
  const malformedWork = structuredClone(prepared.state) as { work: { head: { kind: Record<string, unknown> } } };
  malformedWork.work.head.kind = { ...malformedWork.work.head.kind, extra: true };
  injected.canonical = () => ({ $: "Canonical.Advanced", state: malformedWork, commands: { $: "Nil" } });
  expect(() => stepCanonical(original, { kind: "checkCompletedEdit", tool: 1 })).toThrow(TypeError);
  expect(() => projectCanonical(malformedWork)).toThrow("foreign canonical state");

  for (const reason of [{ $: "Canonical.InvalidIdentity", extra: true },
    { $: "Canonical.PermitDenied", reason: { $: "Admission.InvalidClock", extra: true } }]) {
    const clone = structuredClone(original);
    injected.canonical = () => ({ $: "Canonical.Rejected", state: clone, reason });
    expect(() => stepCanonical(original, { kind: "checkCompletedEdit", tool: 1 })).toThrow(TypeError);
    expect(() => projectCanonical(clone)).toThrow("foreign canonical state");
  }
});
