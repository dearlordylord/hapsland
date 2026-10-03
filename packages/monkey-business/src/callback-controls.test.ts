import { describe, expect, it } from "vitest";
import { decodeCallbackTarget, decodeCallbackTargets, encodeCallbackTarget, validateCallbackControl } from "./callback-controls.ts";
const target = { owner: { partition: 1, lifetime: 2, round: 3, operation: 4 },
  effect: { kind: "jevSettled" as const, request: 5 }, originalOrder: 6 };
describe("callback control syntax", () => {
  it("retains the entire captured identity and freezes every nested projection", () => {
    const value = validateCallbackControl({ kind: "callback", action: "duplicate", target });
    expect(decodeCallbackTarget(encodeCallbackTarget(value.target))).toEqual(target);
    expect(Object.isFrozen(value.target.owner)).toBe(true);
    expect(Object.isFrozen(value.target.effect)).toBe(true);
  });
  it("rejects forged fields, missing identities, fractions, overflow and unrelated effects", () => {
    for (const value of [ { kind: "callback", action: "hold", target, extra: true },
      { kind: "callback", action: "hold", target: { ...target, owner: { ...target.owner, round: 0 } } },
      { kind: "callback", action: "hold", target: { ...target, originalOrder: 1.5 } },
      { kind: "callback", action: "hold", target: { ...target, originalOrder: 2 ** 48 } },
      { kind: "callback", action: "hold", target: { ...target, effect: { kind: "outputTerminal", advice: 2 } } },
    ]) expect(() => validateCallbackControl(value as never)).toThrow();
  });
  it("decodes exact bounded vectors and refuses cyclic constructor tails", () => {
    const head = encodeCallbackTarget(target);
    const cycle: { $: string; head: unknown; tail?: unknown } = { $: "List.Con", head };
    cycle.tail = cycle;
    expect(() => decodeCallbackTargets(cycle)).toThrow();
    expect(() => decodeCallbackTargets(Array(2049).fill(head))).toThrow();
    expect(() => decodeCallbackTarget({ ...head, effect: { ...head.effect, extra: true } })).toThrow();
  });
});
