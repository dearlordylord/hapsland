import { expect, it, vi } from "vitest";
import SharedEngine from "../../monkey-business-bend/engine.mjs";
import { initialSharedCanonical, stepSharedCanonical, projectSharedCanonical,
  prepareSharedWriter, claimSharedWriter, afterSharedWriter, releaseSharedWriter, deliverSharedWriterRelease, expireSharedResponses, type SharedWriterPending } from "../../../src/canonical/simulation-adapter.ts";
import { encodeSharedValue } from "../../../src/canonical/simulation-codec.ts";
import { encodeWriterCapture } from "./writer-controls.ts";

const limits = { globalItems: 32, globalBytes: 4096, partitionItems: 16, partitionBytes: 2048 };
const capture = { target: { partition: 1, lifetime: 1, round: 1, token: 51 },
  claimStarted: 0, claimLifetimeMs: 7, capacity: 2,
  response: { partition: 1, lifetime: 1, round: 1, started: 0, deadline: 20, admittedBlock: false } };
const opened = () => stepSharedCanonical(initialSharedCanonical(limits), { kind: "openRound", partition: 1, lifetime: 1 }).state;

it.each(["laterAction", "extraEnvelope"] as const)("rejects malformed writer %s atomically before capsule publication", kind => {
  const state = opened();
  const before = projectSharedCanonical(state);
  const original = SharedEngine.writer_prepare(state, encodeSharedValue(encodeWriterCapture(capture)));
  const action = { $: "Driver.Action", event: { $: "Canonical.CollectionClaimBackground", group: 1, token: 51, active: true, capacity: 2 },
    delay: 0, job: false, candidate: { $: "None" }, expiry_advice: { $: "None" } };
  const malformed = kind === "extraEnvelope" ? { ...original, unexpected: true }
    : { ...original, actions: encodeSharedValue({ $: "Con", head: action,
      tail: { $: "Con", head: { ...action, delay: true }, tail: { $: "Nil" } } }) };
  const failure = vi.spyOn(SharedEngine, "writer_prepare").mockReturnValueOnce(malformed);
  try {
    expect(() => prepareSharedWriter(state, capture)).toThrow();
    expect(projectSharedCanonical(state)).toBe(before);
    expect(() => projectSharedCanonical(original.state)).toThrow("foreign shared engine state");
  } finally { failure.mockRestore(); }
  const retried = prepareSharedWriter(state, capture);
  expect(retried.pending).toBeDefined();
  const event = claimSharedWriter(retried.state, retried.pending!, 0);
  const granted = stepSharedCanonical(retried.state, event);
  expect(granted.result.commands).toContainEqual({ kind: "collectionBackgroundClaimed" });
  const issued = afterSharedWriter(granted.state, retried.pending!, 0);
  expect(issued.issued).toEqual({ id: 1, partition: 1, lifetime: 1, round: 1 });
});

it("requires the exact original queued event and consumes one grant only once", () => {
  const prepared = prepareSharedWriter(opened(), capture);
  const pending = prepared.pending!;
  expect(() => claimSharedWriter(prepared.state, { kind: "writerPending" } as SharedWriterPending, 0)).toThrow();
  const event = claimSharedWriter(prepared.state, pending, 0);
  const forged = stepSharedCanonical(prepared.state, { ...event });
  expect(() => afterSharedWriter(forged.state, pending, 0)).toThrow("missing original writer source transition");
  const granted = stepSharedCanonical(prepared.state, event);
  const issued = afterSharedWriter(granted.state, pending, 0);
  expect(issued.issued?.id).toBe(1);
  expect(() => afterSharedWriter(issued.state, pending, 0)).toThrow("consumed original writer trigger");
});

it("an original queued trigger at its cutoff cannot reopen writer or response authority", () => {
  const prepared = prepareSharedWriter(opened(), capture);
  const event = claimSharedWriter(prepared.state, prepared.pending!, 7);
  expect(event).toEqual({ kind: "collectionClaimBackground", group: 1, token: 51, active: false, capacity: 2 });
  const refused = stepSharedCanonical(prepared.state, event);
  expect(projectSharedCanonical(refused.state).collection.claims).toEqual([]);
  const settled = afterSharedWriter(refused.state, prepared.pending!, 7);
  expect(settled.issued).toBeUndefined();
  expect(() => claimSharedWriter(settled.state, prepared.pending!, 7)).toThrow();
});


it.each(["sameScope", "nextLifetime"] as const)("a captured release cannot unlock replacement writer %s with the same token", replacement => {
  const first = prepareSharedWriter(opened(), capture);
  const event = claimSharedWriter(first.state, first.pending!, 0);
  const issued = afterSharedWriter(stepSharedCanonical(first.state,event).state,first.pending!,0);
  expect(issued.issued?.id).toBe(1);
  const old = releaseSharedWriter(issued.state,capture.target)[0]!;
  const released = stepSharedCanonical(issued.state,{kind:"collectionReleaseBackground",group:1,token:51});
  let state = expireSharedResponses(released.state,0).state;
  let next = capture;
  if (replacement === "nextLifetime") {
    state = stepSharedCanonical(state,{kind:"retirePartition",partition:1,lifetime:1,round:1}).state;
    state = stepSharedCanonical(state,{kind:"openRound",partition:1,lifetime:2}).state;
    next = {...capture,target:{...capture.target,lifetime:2,round:2},response:{...capture.response,lifetime:2,round:2}};
  }
  const prepared = prepareSharedWriter(state,next);
  const accepted = stepSharedCanonical(prepared.state,claimSharedWriter(prepared.state,prepared.pending!,0));
  const second = afterSharedWriter(accepted.state,prepared.pending!,0);
  expect(second.issued).toEqual({id:2,partition:1,lifetime:replacement==="sameScope"?1:2,round:replacement==="sameScope"?1:2});
  expect(deliverSharedWriterRelease(second.state,old.receipt,0)).toBeUndefined();
  expect(projectSharedCanonical(second.state).collection.claims).toEqual([{group:1,owner:51}]);
});
