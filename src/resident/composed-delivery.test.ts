import { describe, expect, it } from "vitest";
import { BACKGROUND_WAITER_EXPIRY_MS, ComposedDelivery, MAX_COMPOSED_ROUNDS } from "./composed-delivery.ts";
import { DELIVERY_LEASE_MS } from "./protocol.ts";
import { BendWorkTracker } from "./bend-work.ts";

describe("shared Hapsland rounds", () => {
  it("allows four continuation reservations; prompts and expiry cannot reset them", () => {
    const state = new ComposedDelivery();
    expect(state.consumeStop("agent")).toBe(false);
    state.admitEdit("agent", "edit", 0);
    for (let count = 0; count < 4; count++) {
      state.advance("agent", `runtime-turn-${count}`, count);
      state.expire(600_000 * (count + 1));
      expect(state.consumeStop("agent")).toBe(true);
    }
    expect(state.consumeStop("agent")).toBe(false);
    expect(state.generation("agent")).toBe(1);
  });

  it("fences a closed round and requires fresh occurrence evidence to reopen", () => {
    const state = new ComposedDelivery();
    state.admitEdit("agent", "old", 0);
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.beginStop("agent", "competing-stop")).toBe(false);
    expect(state.finishStop("agent", "stop", true, 100)).toBe(1);
    expect(state.advance("agent", "prompt", 1)).toBe(false);
    expect(state.admitEdit("agent", "unknown-late", 1)).toBeUndefined();
    expect(state.registerEdit("agent", "late", 99, 110)).toBe(false);
    expect(state.registerEdit("agent", "new", 102, 110)).toBe(true);
    expect(state.admitEdit("agent", "new", 111, true)).toBe(2);
    expect(state.admitEdit("agent", "old", 112, true)).toBeUndefined();
    expect(state.consumeStop("agent")).toBe(true);
  });

  it("requires a prospective permit, rejects expired or orphaned prehooks and consumes once", () => {
    const state = new ComposedDelivery();
    expect(state.admitEdit("agent", "no-pre", 100, true)).toBeUndefined();
    expect(state.registerEdit("agent", "expired", 100, 2600)).toBe(false);
    expect(state.registerEdit("agent", "edit", 100, 110)).toBe(true);
    expect(state.admitEdit("agent", "edit", 120, true)).toBe(1);
    expect(state.admitEdit("agent", "edit", 121, true)).toBeUndefined();
    expect(state.registerEdit("agent", "pending", 130, 140)).toBe(true);
    state.beginStop("agent", "stop");
    state.finishStop("agent", "stop", true, 200);
    expect(state.admitEdit("agent", "pending", 210, true)).toBeUndefined();
    expect(state.registerEdit("agent", "old-hook", 190, 210)).toBe(false);
    expect(state.registerEdit("agent", "edit", 220, 230)).toBe(false);
    expect(state.registerEdit("other-agent", "edit", 220, 230)).toBe(true);
  });

  it("closes abandoned pre-output Stop attempts but preserves uncertain continuations", () => {
    const state = new ComposedDelivery();
    state.admitEdit("allow", "edit", 0);
    state.beginStop("allow", "lost");
    expect(state.expireStop("allow", "lost")).toBe(1);
    expect(state.isActive("allow")).toBe(false);
    state.admitEdit("continue", "edit", 0);
    state.beginStop("continue", "lost");
    state.consumeStop("continue");
    expect(state.expireStop("continue", "lost")).toBeUndefined();
    expect(state.isActive("continue")).toBe(true);
    for (let count = 0; count < 3; count++) expect(state.consumeStop("continue")).toBe(true);
    expect(state.consumeStop("continue")).toBe(false);
  });

  it("releases an abandoned provisional finish reservation and closes the round", () => {
    const state = new ComposedDelivery();
    const finding = { rule: "r", advice: "repair" };
    state.admitEdit("agent", "edit", 0);
    state.beginStop("agent", "attempt");
    const work = new BendWorkTracker();
    const source = work.admit();
    const unit = work.spawn(source)!;
    expect(work.outcome(unit, { $: "Finding", count: 1, bytes: 20 })).toBe(true);
    expect(work.completeSource(source)).toBe(true);
    state.beginFinishDecision("agent", "attempt", work);
    expect(state.reserveFinishOutput("agent", "attempt", "output",
      [{ id: "advice", unit, findings: [finding] }], 1, work)).toBe(true);
    expect(state.expireStop("agent", "attempt")).toBe(1);
    expect(state.isActive("agent")).toBe(false);
    expect(state.suppresses("advice", "agent", finding, "stop")).toBe(false);
    expect(state.authorizeFinishOutput("agent", "output")).toBe(false);
    expect(state.beginStop("agent", "later")).toBe(false);
    expect(state.authorizeFinishOutput("agent", "output")).toBe(false);
    expect(state.closureCounts("agent").reservedContinuations).toBe(0);
  });

  it("preserves a reserved continuation after output authorization when Stop expires", () => {
    const state = new ComposedDelivery();
    const finding = { rule: "r", advice: "repair" };
    state.admitEdit("agent", "edit", 0);
    state.beginStop("agent", "attempt");
    const work = new BendWorkTracker();
    const source = work.admit();
    const unit = work.spawn(source)!;
    expect(work.outcome(unit, { $: "Finding", count: 1, bytes: 20 })).toBe(true);
    expect(work.completeSource(source)).toBe(true);
    state.beginFinishDecision("agent", "attempt", work);
    expect(state.reserveFinishOutput("agent", "attempt", "output",
      [{ id: "advice", unit, findings: [finding] }], 1, work)).toBe(true);
    expect(state.authorizeFinishOutput("agent", "output")).toBe(true);
    expect(state.expireStop("agent", "attempt")).toBeUndefined();
    expect(state.isActive("agent")).toBe(true);
    expect(state.closureCounts("agent").reservedContinuations).toBe(1);
    expect(state.authorizeFinishOutput("agent", "output")).toBe(false);
  });

  it("releases a provisional continuation before output authorization", () => {
    const state = new ComposedDelivery();
    const finding = { rule: "r", advice: "repair" };
    state.admitEdit("agent", "edit", 0);
    expect(state.beginStop("agent", "attempt")).toBe(true);
    const work = new BendWorkTracker();
    const source = work.admit();
    const unit = work.spawn(source)!;
    expect(work.outcome(unit, { $: "Finding", count: 1, bytes: 20 })).toBe(true);
    expect(work.completeSource(source)).toBe(true);
    expect(state.beginFinishDecision("agent", "attempt", work)).toBeDefined();
    expect(state.reserveFinishOutput("agent", "attempt", "output",
      [{ id: "advice", unit, findings: [finding] }], 1, work)).toBe(true);
    expect(state.closureCounts("agent").reservedContinuations).toBe(1);
    expect(state.revokeProvisionalFinishOutput("agent", "attempt", "output")).toBe(true);
    expect(state.closureCounts("agent").reservedContinuations).toBe(0);
    expect(state.authorizeFinishOutput("agent", "output")).toBe(false);
    expect(state.revokeProvisionalFinishOutput("agent", "attempt", "output")).toBe(false);
  });

  it("retains source-free fences at capacity instead of resetting through expiry", () => {
    const state = new ComposedDelivery();
    for (let i = 0; i < MAX_COMPOSED_ROUNDS; i++) {
      expect(state.registerEdit(`agent-${i}`, "edit", 1, 2)).toBe(true);
    }
    state.expire(600_000);
    expect(state.registerEdit("overflow", "edit", 600_001, 600_002)).toBe(false);
  });

  it("does not create a round from prompt or Stop alone", () => {
    const state = new ComposedDelivery();
    expect(state.advance("agent", "prompt", 10)).toBe(true);
    expect(state.ensureFromHostTurn("agent", "turn", 11)).toBe(true);
    expect(state.generation("agent")).toBe(0);
    expect(state.beginStop("agent", "stop")).toBe(false);
    expect(state.consumeStop("agent")).toBe(false);
    expect(state.registerEdit("agent", "edit", 12, 13)).toBe(true);
    expect(state.generation("agent")).toBe(1);
  });

  it("closes an unconsumed prospective permit and only reopens for a fresh edit", () => {
    const state = new ComposedDelivery();
    expect(state.registerEdit("agent", "uncompleted", 10, 11)).toBe(true);
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.finishStop("agent", "stop", true, 100)).toBe(1);
    expect(state.admitEdit("agent", "uncompleted", 101, true)).toBeUndefined();
    expect(state.registerEdit("agent", "fresh", 102, 103)).toBe(true);
    expect(state.admitEdit("agent", "fresh", 104, true)).toBe(2);
  });

  it("coalesces background waiters and forbids submission after the Stop barrier", () => {
    const state = new ComposedDelivery();
    state.admitEdit("agent", "edit", 0);
    expect(state.claimBackground("agent", "first", 0)).toBe(true);
    expect(state.claimBackground("agent", "second", 1)).toBe(false);
    expect(state.claimBackground("agent", "second", BACKGROUND_WAITER_EXPIRY_MS)).toBe(true);
    state.beginStop("agent", "stop");
    expect(state.canSubmit("agent", "background")).toBe(true);
    state.consumeStop("agent");
    expect(state.canSubmit("agent", "background")).toBe(false);
    state.finishStop("agent", "stop", false);
    expect(state.canSubmit("agent", "background")).toBe(true);
  });

  it("keeps a fractional-time background claim until its full lifetime elapses", () => {
    const state = new ComposedDelivery();
    state.admitEdit("agent", "edit", 0);
    expect(state.claimBackground("agent", "first", 0.9)).toBe(true);
    expect(state.claimBackground("agent", "second", BACKGROUND_WAITER_EXPIRY_MS + 0.1)).toBe(false);
    expect(state.claimBackground("agent", "second", BACKGROUND_WAITER_EXPIRY_MS + 0.9)).toBe(true);
  });

  it("reoffers submitted or uncertain background findings once at Stop without rerunning review", () => {
    const state = new ComposedDelivery();
    const finding = { rule: "r", advice: "repair" };
    state.admitEdit("agent", "edit", 0);
    state.beginSubmission("advice", "agent", "bg", [finding], "background", 1);
    expect(state.suppresses("advice", "agent", finding)).toBe(true);
    expect(state.suppresses("advice", "agent", finding, "stop")).toBe(true);
    expect(state.beginSubmission("advice", "agent", "early-stop", [finding], "stop", 2)).toBe(false);
    state.markSubmitted("bg");
    expect(state.suppresses("advice", "agent", finding, "stop")).toBe(false);
    state.beginSubmission("advice", "agent", "stop", [finding], "stop", 2);
    expect(state.suppresses("advice", "agent", finding, "stop")).toBe(true);
    state.beginStop("agent", "close");
    state.finishStop("agent", "close", true);
    expect(state.hasToken("bg")).toBe(false);
    expect(state.hasToken("stop")).toBe(false);
  });

  it("reoffers an authorized background write only after terminal uncertainty", () => {
    const state = new ComposedDelivery();
    const finding = { rule: "r", advice: "repair" };
    state.admitEdit("agent", "edit", 0);
    expect(state.claimBackground("agent", "worker", 0)).toBe(true);
    expect(state.beginSubmission("advice", "agent", "bg", [finding], "background", 1)).toBe(true);
    expect(state.suppresses("advice", "agent", finding, "stop")).toBe(true);
    state.releaseBackground("agent", "worker");
    expect(state.suppresses("advice", "agent", finding, "stop")).toBe(false);
    expect(state.beginSubmission("advice", "agent", "stop", [finding], "stop", 2)).toBe(true);
  });

  it("expires an authorized background output only at its full fractional-time lease", () => {
    const state = new ComposedDelivery();
    const finding = { rule: "r", advice: "repair" };
    state.admitEdit("agent", "edit", 0);
    expect(state.beginSubmission("advice", "agent", "bg", [finding], "background", 0.9)).toBe(true);
    expect(state.backgroundReofferable("advice", "bg")).toBe(false);
    state.expire(DELIVERY_LEASE_MS + 0.1);
    expect(state.suppresses("advice", "agent", finding, "stop")).toBe(true);
    state.expire(DELIVERY_LEASE_MS + 0.9);
    expect(state.backgroundReofferable("advice", "bg")).toBe(true);
    expect(state.suppresses("advice", "agent", finding, "stop")).toBe(false);
    expect(state.markSubmitted("bg")).toBe(false);
  });
});
