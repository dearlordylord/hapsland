import { expect, it } from "vitest";
import { initialCanonical, projectCanonical, stepCanonical } from "./adapter.ts";

const limits = { globalItems: 2, globalBytes: 100, partitionItems: 2, partitionBytes: 100 };

it("fences canonical state and projected facts against mutation", () => {
  const state = initialCanonical(limits);
  const projection = projectCanonical(state);
  expect(Object.isFrozen(state)).toBe(true);
  expect(Object.isFrozen(projection)).toBe(true);
  expect(Reflect.set(state as object, "ledger", {})).toBe(false);
  expect(Reflect.set(projection.global, "bytes", 99)).toBe(false);
  expect(Reflect.set(projection.dispatch.queued, "0", {})).toBe(false);
  expect(projectCanonical(state)).toBe(projection);
  expect(projectCanonical(state).global).toEqual({ items: 0, bytes: 0 });
});

it("keeps previous immutable snapshots intact through functional Bend transitions", () => {
  const before = initialCanonical(limits);
  const snapshot = projectCanonical(before);
  const step = stepCanonical(before, { kind: "reserveCapacity", partition: 1, bytes: 10, purpose: "preparation" });
  expect(step.commands[0]?.kind).toBe("capacityGranted");
  expect(Object.isFrozen(step.state)).toBe(true);
  const after = projectCanonical(step.state);
  expect(after.global).toEqual({ items: 1, bytes: 10 });
  expect(Object.isFrozen(after.charges[0])).toBe(true);
  expect(Reflect.set(after.charges[0]!, "bytes", 90)).toBe(false);
  expect(projectCanonical(step.state)).toBe(after);
  expect(projectCanonical(before)).toBe(snapshot);
  expect(snapshot.global).toEqual({ items: 0, bytes: 0 });
  expect(stepCanonical(before, { kind: "reserveCapacity", partition: 1, bytes: 10, purpose: "preparation" }).commands).toEqual(step.commands);
});

it("rejects foreign copies even when their fields match a memoized state", () => {
  const state = initialCanonical(limits);
  projectCanonical(state);
  const copy = { ...(state as object) };
  expect(() => projectCanonical(copy)).toThrow("foreign canonical state");
  expect(() => stepCanonical(copy, { kind: "reserveCapacity", partition: 1, bytes: 10, purpose: "preparation" }))
    .toThrow("foreign canonical state");
});
