import { describe, expect, it } from "vitest";
import { BACKGROUND_WAITER_EXPIRY_MS, COMPOSED_CHAIN_EXPIRY_MS, ComposedDelivery, MAX_COMPOSED_CHAINS } from "./composed-delivery.ts";

describe("shared composed delivery turn chains", () => {
  it("coalesces background waiters per advicee and reclaims canceled owners", () => {
    const state = new ComposedDelivery();
    expect(state.claimBackground("codex/a", "first", 0)).toBe(true);
    expect(state.claimBackground("codex/a", "second", 1)).toBe(false);
    expect(state.claimBackground("claude/a", "child", 1)).toBe(true);
    state.releaseBackground("codex/a", "second");
    expect(state.claimBackground("codex/a", "third", 2)).toBe(false);
    state.releaseBackground("codex/a", "first");
    expect(state.claimBackground("codex/a", "third", 3)).toBe(true);
    expect(state.claimBackground("claude/a", "replacement", BACKGROUND_WAITER_EXPIRY_MS + 1)).toBe(true);
  });
  it("permits one Stop continuation per distinct prompt marker and advicee", () => {
    const state = new ComposedDelivery();
    expect(state.hasStopAllowance("codex/a")).toBe(false);
    expect(state.consumeStop("codex/a")).toBe(false);
    expect(state.advance("codex/a", "prompt-1", 0)).toBe(true);
    expect(state.consumeStop("codex/a")).toBe(true);
    expect(state.consumeStop("codex/a")).toBe(false);
    expect(state.advance("codex/a", "prompt-1", 1)).toBe(true);
    expect(state.consumeStop("codex/a")).toBe(false);
    expect(state.advance("claude/a", "prompt-1", 1)).toBe(true);
    expect(state.consumeStop("claude/a")).toBe(true);
    expect(state.advance("codex/a", "prompt-2", 2)).toBe(true);
    expect(state.generation("codex/a")).toBe(2);
    expect(state.consumeStop("codex/a")).toBe(true);
  });

  it("does not reset the cap when Stop feedback becomes a synthetic prompt", () => {
    const state = new ComposedDelivery();
    state.advance("codex/a", "prompt-1", 0, "original");
    expect(state.consumeStop("codex/a", "feedback")).toBe(true);
    expect(state.advance("codex/a", "new-turn-id", 1, "feedback")).toBe(true);
    expect(state.generation("codex/a")).toBe(1);
    expect(state.consumeStop("codex/a")).toBe(false);
    state.advance("codex/a", "actual-next-prompt", 2, "different");
    expect(state.generation("codex/a")).toBe(2);
  });

  it("recovers a missing prompt marker from a host turn without resetting an existing cap", () => {
    const state = new ComposedDelivery();
    expect(state.ensureFromHostTurn("codex/a", "turn-1", 0)).toBe(true);
    expect(state.consumeStop("codex/a")).toBe(true);
    expect(state.ensureFromHostTurn("codex/a", "turn-2", 1)).toBe(true);
    expect(state.generation("codex/a")).toBe(1);
    expect(state.consumeStop("codex/a")).toBe(false);
  });

  it("fails closed at capacity and expires bounded old chains", () => {
    const state = new ComposedDelivery();
    for (let index = 0; index < MAX_COMPOSED_CHAINS; index += 1) {
      expect(state.advance(`advicee-${index}`, "prompt", 0)).toBe(true);
    }
    expect(state.advance("overflow", "prompt", 0)).toBe(false);
    expect(state.consumeStop("overflow")).toBe(false);
    state.expire(COMPOSED_CHAIN_EXPIRY_MS);
    expect(state.advance("overflow", "prompt", COMPOSED_CHAIN_EXPIRY_MS)).toBe(true);
  });

  it("suppresses uncertain and submitted findings until the next prompt while retaining overflow", () => {
    const state = new ComposedDelivery();
    const first = { rule: "r1", advice: "repair first" };
    const second = { rule: "r2", advice: "repair second" };
    state.advance("advicee", "prompt-1", 0);
    state.beginSubmission("advice", "advicee", "lease-1", [first], "background", 1);
    expect(state.suppresses("advice", "advicee", first)).toBe(true);
    expect(state.suppresses("advice", "advicee", second)).toBe(false);
    state.markSubmitted("lease-1");
    expect(state.suppresses("advice", "advicee", first)).toBe(true);
    state.beginSubmission("advice", "advicee", "lease-2", [second], "stop", 2);
    expect(state.suppresses("advice", "advicee", second)).toBe(true);
    state.release("lease-2");
    expect(state.suppresses("advice", "advicee", second)).toBe(false);
    state.advance("advicee", "prompt-2", 3);
    expect(state.suppresses("advice", "advicee", first)).toBe(false);
    state.forget("advice");
    expect(state.hasToken("lease-1")).toBe(false);
  });
});
