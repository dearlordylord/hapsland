import { describe, expect, it } from "vitest";
import { initialSharedCanonical, projectSharedCanonical, stepSharedCanonical, enqueueShared, takeShared, queuedShared, cancelShared } from "./simulation-adapter.ts";
import { encodeSharedValue, decodeSharedValue } from "./simulation-codec.ts";

const limits = { globalItems: 32, globalBytes: 4096, partitionItems: 16, partitionBytes: 2048 };
describe("trusted simulation composition boundary", () => {
  it("refuses copied engine states before projection or mutation", () => {
    const state = initialSharedCanonical(limits);
    const copy = structuredClone(state);
    expect(() => projectSharedCanonical(copy)).toThrow("foreign shared engine state");
    expect(() => enqueueShared(copy, 1, 1)).toThrow("foreign shared engine state");
    expect(() => stepSharedCanonical(copy, { kind: "openRound", partition: 1, lifetime: 1 })).toThrow("foreign shared engine state");
  });
  it("keeps immutable canonical ownership through deterministic scheduling", () => {
    const original = initialSharedCanonical(limits);
    const state = stepSharedCanonical(original, { kind: "openRound", partition: 1, lifetime: 1 }).state;
    const projection = projectSharedCanonical(state);
    const queued = enqueueShared(enqueueShared(state, 10, 2), 10, 1);
    expect(projectSharedCanonical(queued)).toBe(projection);
    expect(queuedShared(queued)).toEqual([{ at: 10, order: 1 }, { at: 10, order: 2 }]);
    const taken = takeShared(queued);
    expect(taken.entry).toEqual({ at: 10, order: 1 });
    expect(projectSharedCanonical(taken.state)).toBe(projection);
    expect(queuedShared(cancelShared(taken.state, 2))).toEqual([]);
    expect(queuedShared(state)).toEqual([]);
    expect(Object.isFrozen(taken.state)).toBe(true);
    expect(Object.isFrozen(projection)).toBe(true);
  });
  it("rejects numeric narrowing and foreign namespaces while preserving U32 words", () => {
    expect(() => decodeSharedValue(281474976710656n)).toThrow();
    expect(() => encodeSharedValue(-1)).toThrow();
    expect(() => encodeSharedValue(1.5)).toThrow();
    expect(() => encodeSharedValue({ $: "Foreign.State" })).toThrow();
    const words = { $: "RulePolicy.Words", high: 0x3fe00000, low: 0 };
    expect(decodeSharedValue(encodeSharedValue(words))).toEqual(words);
    expect(encodeSharedValue(words)).toEqual({ ...words, $: "../agent-flow-bend/RulePolicy.Words" });
    expect(() => encodeSharedValue({ ...words, low: 0x100000000 })).toThrow();
  });
});
