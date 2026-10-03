import { expect, it, vi } from "vitest";
import SharedEngine from "../../monkey-business-bend/engine.mjs";
import * as boundary from "../../../src/canonical/simulation-adapter.ts";
import { encodeCollectionResponse } from "./collection-scenario.ts";
import { encodeSharedValue } from "../../../src/canonical/simulation-codec.ts";
import { readRecord } from "../../../src/canonical/boundary-schema.ts";
import { createRun, restoreReplay, type Run } from "./index.ts";
import { validateCollectionResponseControl, type CollectionResponseControl } from "./collection-scenario.ts";

const agent = "agent-1";
const target: { id: number; partition: number; lifetime: number; round: number } = { id: 1, partition: 1, lifetime: 1, round: 1 };
// Deliberate TDD seam: production LiveControl still needs central integration.
// This cast introduces no alternate host driver or authorizing fallback.
const control = (run: Run, value: CollectionResponseControl) => run.applyControl(validateCollectionResponseControl(value) as Parameters<Run["applyControl"]>[0]);
const opened = (deadline = 20, admittedBlock = false) => {
  const run = createRun({ retention: 1000, preparationDelay: 2, jevDelay: 5,
    inputs: [{ at: 0, kind: "edit", agent, bytes: 10, unitBytes: [5], outcome: "finding" }] });
  expect(run.observe().agentScopes).toEqual([{ agent: "agent-1", partition: 1, seed: 1 }]);
  run.advance({ untilTime: 0 });
  expect(run.observations.every(frame => frame.agent === undefined || frame.agent === "agent-1")).toBe(true);
  control(run, { kind: "collectionResponse", action: "open", agent,
    response: { partition: target.partition, lifetime: target.lifetime, round: target.round, started: 0, deadline, admittedBlock } });
  return run;
};
const attempt = (run: Run, currentBlock = false, identity = target) => control(run,
  { kind: "collectionResponse", action: "attempt", agent, target: identity, currentBlock });
const terminal = (run: Run) => run.observations.filter(frame => frame.event.kind === "submissionTerminal");
const replayExact = (run: Run) => expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe());

it("retains completed finding until a current response selects its exact authorized member", () => {
  const run = opened();
  run.advance({ untilTime: 6 });
  expect(run.projection.pendingFindings).toEqual([]);
  expect(terminal(run)).toEqual([]);
  run.advance({ untilTime: 7 });
  expect(run.projection.pendingFindings).toHaveLength(1);
  expect(terminal(run)).toEqual([]);
  attempt(run);
  run.advance({ untilTime: 8 });
  expect(terminal(run)).toHaveLength(1);
  expect(terminal(run)[0]).toMatchObject({ partition: 1, event: { certain: true } });
  expect(run.observations.filter(frame => frame.event.kind === "collectionReserveLease")).toHaveLength(1);
  expect(run.projection.collection.leases).toEqual([]);
  replayExact(run);
});

it.each(["close", "expiry", "wrongScope", "revokedOptIn"] as const)("%s cannot turn a retained finding into output authority", failure => {
  const run = opened(failure === "expiry" ? 7 : 20, failure === "revokedOptIn");
  run.advance({ untilTime: 7 });
  expect(run.projection.pendingFindings).toHaveLength(1);
  if (failure === "close") control(run, { kind: "collectionResponse", action: "close", agent, target });
  attempt(run, false, failure === "wrongScope" ? { ...target, lifetime: 2 } : target);
  run.advance({ untilTime: 8 });
  expect(terminal(run)).toEqual([]);
  expect(run.projection.collection.leases).toEqual([]);
  // An ended response does not cancel valid preparation/review ownership.
  expect(run.projection.pendingFindings).toHaveLength(1);
  replayExact(run);
});

it("temporary credential refusal recovers on the same response without a second review", () => {
  const run = opened();
  run.advance({ untilTime: 7 });
  run.applyControl({ kind: "credentials", action: "unavailable" });
  attempt(run);
  run.advance({ untilTime: 8 });
  expect(terminal(run)).toEqual([]);
  expect(run.projection.pendingFindings).toHaveLength(1);
  run.applyControl({ kind: "credentials", action: "restore" });
  attempt(run);
  run.advance({ untilTime: 9 });
  expect(terminal(run)).toHaveLength(1);
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestStarted")).toHaveLength(1);
  replayExact(run);
});

it("a successful response suppresses a second selection of the same retained advice", () => {
  const run = opened();
  run.advance({ untilTime: 7 });
  attempt(run); run.advance({ untilTime: 8 });
  attempt(run); run.advance({ untilTime: 9 });
  expect(terminal(run)).toHaveLength(1);
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestStarted")).toHaveLength(1);
  expect(run.projection.collection.leases).toEqual([]);
  replayExact(run);
});


it("issues independent overlapping contexts and cannot reparent an ended original identity", () => {
  const run = opened();
  expect(run.observe().collectionResponseReports.at(-1)?.issued).toEqual(target);
  control(run, { kind: "collectionResponse", action: "open", agent,
    response: { partition: 1, lifetime: 1, round: 1, started: 0, deadline: 20, admittedBlock: false } });
  const second = { ...target, id: 2 };
  expect(run.observe().collectionResponseReports.at(-1)?.issued).toEqual(second);
  control(run, { kind: "collectionResponse", action: "close", agent, target });
  run.advance({ untilTime: 7 });
  attempt(run,false,target);
  expect(run.observe().collectionResponseReports.at(-1)?.result).toBe("missing");
  attempt(run,false,second);
  run.advance({ untilTime: 8 });
  expect(terminal(run)).toHaveLength(1);
  expect(run.projection.collection.leases).toEqual([]);
  expect(run.projection.pendingFindings).toHaveLength(1);
  replayExact(run);
});

it("overlapping response selections cannot both own one advice item", () => {
  const run = opened();
  control(run, { kind: "collectionResponse", action: "open", agent,
    response: { partition: 1, lifetime: 1, round: 1, started: 0, deadline: 20, admittedBlock: false } });
  run.advance({ untilTime: 7 });
  attempt(run,false,target);
  attempt(run,false,{ ...target, id: 2 });
  run.advance({ untilTime: 8 });
  expect(terminal(run)).toHaveLength(1);
  expect(run.observations.flatMap(frame => frame.commands).filter(command => command.kind === "collectionLeaseReserved")).toHaveLength(1);
  expect(run.observations.flatMap(frame => frame.commands).filter(command => command.kind === "submissionBegun")).toHaveLength(1);
  expect(run.projection.collection.leases).toEqual([]);
  replayExact(run);
});

it("refuses foreign response scopes before minting a capability and preserves allocator identity", () => {
  const run = opened();
  control(run, { kind: "collectionResponse", action: "open", agent,
    response: { partition: 1, lifetime: 2, round: 1, started: 0, deadline: 20, admittedBlock: false } });
  expect(run.observe().collectionResponseReports.at(-1)).toMatchObject({ result: "wrongScope" });
  expect(run.observe().collectionResponseReports.at(-1)?.issued).toBeUndefined();
  control(run, { kind: "collectionResponse", action: "open", agent,
    response: { partition: 1, lifetime: 1, round: 1, started: 0, deadline: 20, admittedBlock: false } });
  expect(run.observe().collectionResponseReports.at(-1)?.issued).toEqual({ ...target, id: 2 });
  replayExact(run);
});


it.each(["laterAction", "extraEnvelopeField"] as const)("rejects %s before publishing response state and retries the same issuance", malformedKind => {
  const apply = boundary.controlSharedResponse;
  let checked = false;
  const interception = vi.spyOn(boundary, "controlSharedResponse").mockImplementation((state, value, now) => {
    if (checked || value.action !== "open") return apply(state, value, now);
    const before = boundary.projectSharedCanonical(state);
    const queued = boundary.queuedShared(state);
    const transition = SharedEngine.collection_response_open(state, encodeSharedValue(encodeCollectionResponse(value.response)));
    const action = { $: "Driver.Action", event: { $: "Canonical.CollectorGateCheck", expired: false, credential_valid: true },
      delay: 0, job: false, candidate: { $: "None" }, expiry_advice: { $: "None" } };
    // Exercise the real decoder without stripping unexpected original fields.
    const malformed = malformedKind === "extraEnvelopeField"
      ? { ...transition, result: { ...readRecord(transition.result), unexpected: true } }
      : { ...transition, actions: encodeSharedValue({ $: "Con", head: action,
        tail: { $: "Con", head: { ...action, delay: true }, tail: { $: "Nil" } } }) };
    const failure = vi.spyOn(SharedEngine, "collection_response_open").mockReturnValueOnce(malformed);
    try {
      expect(() => apply(state, value, now)).toThrow();
      expect(boundary.projectSharedCanonical(state)).toBe(before);
      expect(boundary.queuedShared(state)).toEqual(queued);
      expect(() => boundary.projectSharedCanonical(transition.state)).toThrow("foreign shared engine state");
    } finally {
      failure.mockRestore();
    }
    const retried = apply(state, value, now);
    expect(retried.result).toBe("applied");
    expect(retried.issued).toEqual(target);
    checked = true;
    return retried;
  });
  try {
    const run = opened();
    expect(checked).toBe(true);
    control(run, { kind: "collectionResponse", action: "open", agent,
      response: { partition: 1, lifetime: 1, round: 1, started: 0, deadline: 20, admittedBlock: false } });
    expect(run.observe().collectionResponseReports.map(report => report.issued?.id)).toEqual([1, 2]);
    run.advance({ untilTime: 7 });
    attempt(run);
    run.advance({ untilTime: 8 });
    expect(terminal(run)).toHaveLength(1);
    replayExact(run);
  } finally {
    interception.mockRestore();
  }
});
