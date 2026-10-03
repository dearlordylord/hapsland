import { expect, it } from "vitest";
import { initialCanonical } from "../../../src/canonical/adapter.ts";
import { readRecord } from "../../../src/canonical/boundary-schema.ts";
import { decodeCallbackNativeBoundary } from "./callback-native-codec.ts";

it("rejects excess envelope fields and over-bound vectors before publication", () => {
  expect(() => decodeCallbackNativeBoundary([{ frames: [], endpoint: {}, extra: true }])).toThrow();
  expect(() => decodeCallbackNativeBoundary([{ kind: "unexpectedCoreNil" }])).toThrow();
  expect(() => decodeCallbackNativeBoundary(Array(2049).fill(null))).toThrow();
  expect(() => decodeCallbackNativeBoundary([{ frames: Array(2049).fill(null), endpoint: {} }])).toThrow();
  expect(() => decodeCallbackNativeBoundary([{ frames: [{ kind: "unrecognized" }], endpoint: {} }])).toThrow();
});
it("refuses cyclic canonical vectors through the actual production representation owner", () => {
  const state = readRecord(initialCanonical({ globalItems: 32, globalBytes: 100000, partitionItems: 16, partitionBytes: 50000 }));
  const cycle: { $: string; head: unknown; tail?: unknown } = { $: "Con", head: null };
  cycle.tail = cycle;
  const endpoint = { time: 0, projection: { ...state, work: cycle }, targets: [], lifecycles: { $: "Nil" } };
  expect(() => decodeCallbackNativeBoundary([{ frames: [], endpoint }])).toThrow();
});
