import { describe, expect, it } from "vitest";
import { BACKGROUND_WAITER_EXPIRY_MS, ComposedDelivery, EDIT_PERMIT_EXPIRY_MS,
  MAX_COMPOSED_ROUNDS } from "./composed-delivery.ts";
import { DELIVERY_LEASE_MS } from "./protocol.ts";

const canonicalFinding = (state: ComposedDelivery, partition = "agent"): number => {
  const owner = state.canonical.partitionId(partition);
  const round = state.canonical.roundId(partition);
  const observation = state.canonical.transition({ kind: "admitObservation",
    partition: owner, lifetime: 1, round }).commands[0];
  if (observation?.kind !== "observationAdmitted") throw new Error("canonical source admission failed");
  state.canonical.transition({ kind: "startObservation", partition: owner,
    lifetime: 1, round, observation: observation.id });
  const preparation = state.canonical.transition({ kind: "beginObservedPreparation",
    partition: owner, lifetime: 1, round, observation: observation.id, bytes: 10 }).commands[0];
  if (preparation?.kind !== "prepare") throw new Error("canonical preparation failed");
  const admitted = state.canonical.transition({ kind: "preparationCompleted",
    partition: owner, lifetime: 1, round, operation: preparation.operation,
    unitBytes: [5] }).commands.find((command) => command.kind === "unitAdmitted");
  if (admitted?.kind !== "unitAdmitted") throw new Error("canonical unit admission failed");
  state.canonical.transition({ kind: "completeObservation", partition: owner,
    lifetime: 1, round, observation: observation.id });
  state.canonical.transition({ kind: "queueDispatch", partition: owner,
    lifetime: 1, round, operation: admitted.operation });
  state.canonical.transition({ kind: "startReview", partition: owner,
    lifetime: 1, round, operation: admitted.operation });
  const reviewed = state.canonical.transition({ kind: "reviewObserved", partition: owner,
    lifetime: 1, round, operation: admitted.operation, outcome: "finding",
    currentWork: true });
  if (reviewed.commands.at(-1)?.kind !== "retainFinding") throw new Error("canonical finding not retained");
  return admitted.operation;
};

describe("shared Hapsland rounds", () => {
  it("denies a fresh background token after a Stop continuation installs its barrier", () => {
    const state = new ComposedDelivery();
    state.admitEdit("agent", "edit", 100);
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.consumeStop("agent")).toBe(true);
    expect(state.canBeginExistingToken("background", "fresh")).toBe(true);
    expect(state.canBeginSubmission("agent", "background", "fresh")).toBe(false);
  });

  it("denies a duplicate token after its native lease expires without dropping uncertainty", () => {
    const state = new ComposedDelivery();
    state.admitEdit("agent", "edit", 100);
    expect(state.beginSubmission("advice", "agent", "output", [{ rule: "r" }],
      "background", 100)).toBe(true);
    state.expire(100 + DELIVERY_LEASE_MS);
    expect(state.closureCounts("agent").uncertain).toBe(1);
    expect(state.canBeginExistingToken("background", "output")).toBe(false);
    expect(state.closureCounts("agent").uncertain).toBe(1);
    expect(state.hasToken("output")).toBe(true);
  });

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
    expect(state.registerEditDecision("agent", "bad-clock", 200, 100)).toEqual({
      accepted: false, reason: "InvalidClock",
    });
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

  it("expires a prospective permit at its exact fractional deadline", () => {
    const state = new ComposedDelivery();
    const startedAt = 100.5;
    expect(state.registerEdit("agent", "fractional", startedAt, 101)).toBe(true);
    state.expirePermits(startedAt + EDIT_PERMIT_EXPIRY_MS - 0.001);
    expect(state.closureCounts("agent").editPermits).toBe(1);
    state.expirePermits(startedAt + EDIT_PERMIT_EXPIRY_MS);
    expect(state.closureCounts("agent").editPermits).toBe(0);
    expect(state.admitEdit("agent", "fractional", startedAt + EDIT_PERMIT_EXPIRY_MS, true))
      .toBeUndefined();
  });

  it("closes an expired prospective round and admits a fresh tool in the next round", () => {
    const state = new ComposedDelivery();
    expect(state.registerEdit("agent", "first", 100, 101)).toBe(true);
    state.expirePermits(100 + EDIT_PERMIT_EXPIRY_MS);
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.finishStop("agent", "stop", true, 100 + EDIT_PERMIT_EXPIRY_MS + 1)).toBe(1);
    expect(state.admitEdit("agent", "first", 100 + EDIT_PERMIT_EXPIRY_MS + 2, true)).toBeUndefined();
    expect(state.registerEdit("agent", "second", 100 + EDIT_PERMIT_EXPIRY_MS + 3,
      100 + EDIT_PERMIT_EXPIRY_MS + 4)).toBe(true);
    expect(state.admitEdit("agent", "second", 100 + EDIT_PERMIT_EXPIRY_MS + 5, true)).toBe(2);
  });

  it("keeps native tool identity across duplicate and cross-advicee callbacks", () => {
    const state = new ComposedDelivery();
    expect(state.registerEdit("child", "tool-use-original", 100, 110)).toBe(true);
    expect(state.registerEdit("child", "tool-use-original", 100, 111)).toBe(false);
    expect(state.admitEdit("parent", "tool-use-original", 115, true)).toBeUndefined();
    expect(state.admitEdit("child", "other-tool", 116, true)).toBeUndefined();
    expect(state.admitEdit("child", "tool-use-original", 117, true)).toBe(1);
    expect(state.admitEdit("child", "tool-use-original", 118, true)).toBeUndefined();
    const child = state.canonical.canonicalProjection().admissions[0];
    expect(child?.used).toHaveLength(1);
    expect(child?.permits).toHaveLength(0);
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
    const canonicalUnit = canonicalFinding(state);
    state.finishGate("agent", "attempt", 0, true);
    expect(state.reserveFinishOutput("agent", "attempt", "output",
      [{ id: "advice", unit: canonicalUnit, findings: [finding] }], 1)).toBe(true);
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
    const canonicalUnit = canonicalFinding(state);
    state.finishGate("agent", "attempt", 0, true);
    expect(state.reserveFinishOutput("agent", "attempt", "output",
      [{ id: "advice", unit: canonicalUnit, findings: [finding] }], 1)).toBe(true);
    expect(state.authorizeFinishOutput("agent", "output")).toBe(true);
    expect(state.markSubmitted("output", [canonicalUnit + 1])).toBe(false);
    expect(state.markSubmitted("output", [canonicalUnit])).toBe(true);
    expect(state.markSubmitted("output", [canonicalUnit])).toBe(false);
    expect(state.expireStop("agent", "attempt")).toBeUndefined();
    expect(state.isActive("agent")).toBe(true);
    expect(state.closureCounts("agent").reservedContinuations).toBe(1);
    expect(state.authorizeFinishOutput("agent", "output")).toBe(false);
  });

  it("refuses a prepared Stop output when one selected advice is retired before authorization", () => {
    const state = new ComposedDelivery();
    state.admitEdit("agent", "edit", 0);
    const first = canonicalFinding(state);
    const second = canonicalFinding(state);
    expect(state.beginStop("agent", "attempt")).toBe(true);
    expect(state.finishGate("agent", "attempt", 0, true)?.status).toBe("cutoff");
    const advice = [
      { id: "first", unit: first, findings: [{ rule: "one" }] },
      { id: "second", unit: second, findings: [{ rule: "two" }] },
    ];
    expect(state.reserveFinishOutput("agent", "attempt", "output", advice, 1)).toBe(true);
    expect(state.finishSelectionMatches("output", advice)).toBe(true);
    state.forget("first");
    expect(state.finishSelectionMatches("output", advice.slice(1))).toBe(false);
    expect(state.authorizeFinishOutput("agent", "output")).toBe(false);
    state.release("output");
    expect(state.closureCounts("agent").reservedContinuations).toBe(0);
  });

  it("releases a provisional continuation before output authorization", () => {
    const state = new ComposedDelivery();
    const finding = { rule: "r", advice: "repair" };
    state.admitEdit("agent", "edit", 0);
    expect(state.beginStop("agent", "attempt")).toBe(true);
    const canonicalUnit = canonicalFinding(state);
    expect(state.finishGate("agent", "attempt", 0, true)?.status).toBe("cutoff");
    expect(state.reserveFinishOutput("agent", "attempt", "output",
      [{ id: "advice", unit: canonicalUnit, findings: [finding] }], 1)).toBe(true);
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

  it("releases pending permits in canonical state at a Stop cutoff", () => {
    const state = new ComposedDelivery();
    expect(state.registerEdit("agent", "pending", 10, 11)).toBe(true);
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.finishGate("agent", "stop", 0, true)?.status).toBe("cutoff");
    expect(state.closureCounts("agent").editPermits).toBe(0);
    expect(state.canonical.canonicalProjection().admissions[0]?.permits).toHaveLength(0);
  });

  it("waits across edits in one advicee round and resets its decision fence on continuation", () => {
    const state = new ComposedDelivery();
    state.admitEdit("agent", "edit", 0);
    const first = state.canonical.admitObservation("agent");
    const second = state.canonical.admitObservation("agent");
    expect(state.beginStop("agent", "stop")).toBe(true);
    const scopes = ["agent"];
    const round = state.canonical.roundId("agent");
    expect(state.finishGate("agent", "stop", 0, false, scopes))
      .toMatchObject({ status: "waiting" });
    expect(state.canonical.observation(scopes[0]!, first, "completeObservation", round)).toBe(false);
    expect(state.canonical.observation(scopes[0]!, first, "startObservation", round)).toBe(true);
    expect(state.canonical.observation(scopes[0]!, first, "completeObservation", round)).toBe(true);
    expect(state.finishGate("agent", "stop", 0, false, scopes))
      .toMatchObject({ status: "waiting" });
    const cutoff = state.finishGate("agent", "stop", 0, true, scopes);
    expect(cutoff).toMatchObject({ status: "cutoff", cancelledSource: [] });
    expect(state.canonical.canonicalProjection().rounds.filter((item) =>
      scopes.some((scope) => item.partition === state.canonical.partitionId(scope)))
      .every((item) => item.deciding)).toBe(true);
    expect(state.finishStop("agent", "stop", false, 100, scopes)).toBeUndefined();
    expect(state.canonical.canonicalProjection().rounds.filter((item) =>
      scopes.some((scope) => item.partition === state.canonical.partitionId(scope)))
      .every((item) => !item.deciding)).toBe(true);
    expect(state.canonical.admitObservation(scopes[0]!)).toBeGreaterThan(second);
  });

  it("keeps an external Stop owner waiting until deadline", () => {
    const state = new ComposedDelivery();
    state.admitEdit("agent", "edit", 0);
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.finishGate("agent", "stop", 1, false)).toMatchObject({ status: "waiting" });
    expect(state.finishGate("agent", "stop", 1, true)).toMatchObject({ status: "cutoff", limited: false });
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

  it("keeps one canonical background owner through wrong release and expiry", () => {
    const state = new ComposedDelivery();
    state.admitEdit("agent", "edit", 0);
    expect(state.claimBackground("agent", "writer", 100)).toBe(true);
    expect(state.canonical.canonicalProjection().collection.claims).toHaveLength(1);
    state.releaseBackground("agent", "wrong");
    expect(state.canonical.canonicalProjection().collection.claims).toHaveLength(1);
    state.expire(100 + BACKGROUND_WAITER_EXPIRY_MS - 1);
    expect(state.canonical.canonicalProjection().collection.claims).toHaveLength(1);
    state.expire(100 + BACKGROUND_WAITER_EXPIRY_MS);
    expect(state.canonical.canonicalProjection().collection.claims).toEqual([]);
  });

  it("keeps a fractional-time background claim until its full lifetime elapses", () => {
    const state = new ComposedDelivery();
    state.admitEdit("agent", "edit", 0);
    expect(state.claimBackground("agent", "first", 0.9)).toBe(true);
    expect(state.claimBackground("agent", "second", BACKGROUND_WAITER_EXPIRY_MS + 0.1)).toBe(false);
    expect(state.claimBackground("agent", "second", BACKGROUND_WAITER_EXPIRY_MS + 0.9)).toBe(true);
  });

  it("counts submitted background findings as delivered at Stop", () => {
    const state = new ComposedDelivery();
    const finding = { rule: "r", advice: "repair" };
    state.admitEdit("agent", "edit", 0);
    state.beginSubmission("advice", "agent", "bg", [finding], "background", 1);
    expect(state.suppresses("advice", "agent", finding)).toBe(true);
    expect(state.suppresses("advice", "agent", finding, "stop")).toBe(true);
    expect(state.beginSubmission("advice", "agent", "early-stop", [finding], "stop", 2)).toBe(false);
    state.markSubmitted("bg");
    expect(state.backgroundReofferable("advice", "bg")).toBe(false);
    expect(state.suppresses("advice", "agent", finding, "stop")).toBe(true);
    expect(state.beginSubmission("advice", "agent", "stop", [finding], "stop", 2)).toBe(false);
    state.beginStop("agent", "close");
    state.finishStop("agent", "close", true);
    expect(state.hasToken("bg")).toBe(false);
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

  it("restores an uncertain background lease when an unwritten Stop reoffer is released", () => {
    const state = new ComposedDelivery();
    const finding = { rule: "r", advice: "repair" };
    state.admitEdit("agent", "edit", 0);
    expect(state.beginSubmission("advice", "agent", "bg", [finding], "background", 1)).toBe(true);
    expect(state.markUncertain("bg")).toBe(true);
    expect(state.beginSubmission("advice", "agent", "stop", [finding], "stop", 2)).toBe(true);
    expect(state.suppresses("advice", "agent", finding, "stop")).toBe(true);
    state.release("stop");
    expect(state.hasToken("bg")).toBe(true);
    expect(state.suppresses("advice", "agent", finding, "stop")).toBe(false);
    expect(state.beginSubmission("advice", "agent", "retry", [finding], "stop", 3)).toBe(true);
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
