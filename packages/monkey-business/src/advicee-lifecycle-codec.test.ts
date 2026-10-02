import { describe, expect, it } from "vitest";
import { decodeAdviceeLifecycleEntry, decodeAdviceeLifecycles, validateAdviceeLifecycle } from "./advicee-lifecycle.ts";

const entry = () => ({ $: "AdviceeLifecycle.Entry", partition: 4294967313n,
  lifetime: 2n ** 48n - 1n, status: { $: "AdviceeLifecycle.Disconnected" } });
const nil = { $: "Nil" };
const list = (count: number): unknown => {
  let tail: unknown = nil;
  for (let index = 0; index < count; index++) tail = { $: "Con", head: entry(), tail };
  return tail;
};

describe("exact lifecycle representation boundary", () => {
  it("validates control syntax with exact fields without deciding applicability", () => {
    expect(validateAdviceeLifecycle({ kind: "adviceeLifecycle", agent: "opaque:removed", action: "resume" }))
      .toEqual({ kind: "adviceeLifecycle", agent: "opaque:removed", action: "resume" });
    expect(() => validateAdviceeLifecycle({ kind: "adviceeLifecycle", agent: "", action: "resume" })).toThrow(TypeError);
    const extra = { kind: "adviceeLifecycle" as const, agent: "opaque", action: "resume" as const, unexpected: true };
    expect(() => validateAdviceeLifecycle(extra)).toThrow(TypeError);
  });
  it("projects opaque wide identities without rounding", () => {
    expect(decodeAdviceeLifecycleEntry(entry())).toEqual({ partition: 4294967313,
      lifetime: 281474976710655, status: "departed" });
    for (const identity of [0, -1, 2 ** 48, 1.5, 0n, 2n ** 48n]) {
      expect(() => decodeAdviceeLifecycleEntry({ ...entry(), partition: identity })).toThrow(TypeError);
    }
  });
  it("rejects additional entry, status and list constructor fields", () => {
    for (const value of [{ ...entry(), unexpected: true },
      { ...entry(), status: { $: "AdviceeLifecycle.Disconnected", unexpected: true } }]) {
      expect(() => decodeAdviceeLifecycleEntry(value)).toThrow(TypeError);
    }
    expect(() => decodeAdviceeLifecycles({ ...nil, unexpected: true })).toThrow(TypeError);
    expect(() => decodeAdviceeLifecycles({ $: "Con", head: entry(), tail: nil, unexpected: true })).toThrow(TypeError);
  });
  it("accepts the existing core vector bound and rejects overflow and cycles", () => {
    expect(decodeAdviceeLifecycles(list(2048))).toHaveLength(2048);
    expect(() => decodeAdviceeLifecycles(list(2049))).toThrow(TypeError);
    const cycle: { $: string; head: unknown; tail?: unknown } = { $: "Con", head: entry() };
    cycle.tail = cycle;
    expect(() => decodeAdviceeLifecycles(cycle)).toThrow(TypeError);
  });
});
