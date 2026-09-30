import { describe, expect, it } from "vitest";
import { BACKGROUND_WAITER_EXPIRY_MS, ComposedDelivery, EDIT_PERMIT_EXPIRY_MS } from "./composed-delivery.ts";
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

  it("lets Bend enforce the supplied pre-edit window at its exact boundary", () => {
    const state = new ComposedDelivery();
    expect(state.registerEditDecision("agent", "just-before-window", 100, 2599.999)).toEqual({ accepted: true });
    expect(state.registerEditDecision("agent", "at-window", 100, 2600)).toEqual({
      accepted: false, reason: "StaleInvocation",
    });
    expect(state.registerEditDecision("agent", "reversed-submicrosecond", 100.0009, 100.0001)).toEqual({
      accepted: false, reason: "InvalidClock",
    });
    expect(state.registerEditDecision("agent", "fractional-at-window", 100.0009, 2600.0009)).toEqual({
      accepted: false, reason: "StaleInvocation",
    });
    expect(state.registerEditDecision("agent", "fractional-past-window", 100.0001, 2600.0009)).toEqual({
      accepted: false, reason: "StaleInvocation",
    });
  });

  it("lets Bend reject a repeated edit ID while pending, consumed, and closed", () => {
    const state = new ComposedDelivery();
    expect(state.registerEditDecision("agent", "same-edit", 100, 110)).toEqual({ accepted: true });
    expect(state.registerEditDecision("agent", "same-edit", 111, 120)).toEqual({
      accepted: false, reason: "DuplicateTool",
    });
    expect(state.admitEdit("agent", "same-edit", 130, true)).toBe(1);
    expect(state.registerEditDecision("agent", "same-edit", 131, 140)).toEqual({
      accepted: false, reason: "DuplicateTool",
    });
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.finishStop("agent", "stop", true, 200)).toBe(1);
    expect(state.registerEditDecision("agent", "same-edit", 220, 230)).toEqual({
      accepted: false, reason: "DuplicateTool",
    });
  });

  it("counts pending permits per advicee and across the resident, then frees consumed capacity", () => {
    const state = new ComposedDelivery();
    const limits = { perAdvicee: 2, resident: 3 };
    const issue = (partition: string, event: string) =>
      state.registerEditDecision(partition, event, 100, 110, limits);
    expect(issue("agent-a", "a1")).toEqual({ accepted: true });
    expect(issue("agent-a", "a2")).toEqual({ accepted: true });
    expect(issue("agent-a", "a3")).toEqual({ accepted: false, reason: "AdviceePermitLimit" });
    expect(issue("agent-b", "b1")).toEqual({ accepted: true });
    expect(issue("agent-b", "b2")).toEqual({ accepted: false, reason: "ResidentPermitLimit" });
    expect(state.admitEdit("agent-a", "a1", 120, true)).toBe(1);
    expect(issue("agent-b", "b2")).toEqual({ accepted: true });
  });

  it("does not reopen a closed round through the internal admission seam", () => {
    const state = new ComposedDelivery();
    expect(state.admitEdit("agent", "first", 1)).toBe(1);
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.finishStop("agent", "stop", true, 100)).toBe(1);
    expect(state.admitEdit("agent", "next", 102)).toBeUndefined();
  });

  it("never renews a tool occurrence when duplicate prehooks outlive its permit", () => {
    const state = new ComposedDelivery();
    expect(state.registerEdit("agent", "failed", 100, 101)).toBe(true);
    expect(state.registerEdit("agent", "failed", 200, 201)).toBe(false);
    state.expirePermits(100 + EDIT_PERMIT_EXPIRY_MS);
    expect(state.closureCounts("agent").editPermits).toBe(0);
    expect(state.registerEdit("agent", "failed", 101 + EDIT_PERMIT_EXPIRY_MS,
      102 + EDIT_PERMIT_EXPIRY_MS)).toBe(false);
    expect(state.admitEdit("agent", "failed", 103 + EDIT_PERMIT_EXPIRY_MS, true)).toBeUndefined();
    expect(state.isActive("agent")).toBe(false);
    expect(state.canonical.canonicalProjection().rounds).toHaveLength(0);
    expect(state.registerEdit("agent", "fresh", 104 + EDIT_PERMIT_EXPIRY_MS,
      105 + EDIT_PERMIT_EXPIRY_MS)).toBe(true);
    expect(state.admitEdit("agent", "fresh", 106 + EDIT_PERMIT_EXPIRY_MS, true)).toBe(1);
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

  it("expires a failed edit permit without opening a round", () => {
    const state = new ComposedDelivery();
    expect(state.registerEdit("agent", "first", 100, 101)).toBe(true);
    state.expirePermits(100 + EDIT_PERMIT_EXPIRY_MS);
    expect(state.beginStop("agent", "stop")).toBe(false);
    expect(state.generation("agent")).toBe(0);
    expect(state.canonical.canonicalProjection().rounds).toHaveLength(0);
    expect(state.admitEdit("agent", "first", 100 + EDIT_PERMIT_EXPIRY_MS + 2, true)).toBeUndefined();
    expect(state.registerEdit("agent", "second", 100 + EDIT_PERMIT_EXPIRY_MS + 3,
      100 + EDIT_PERMIT_EXPIRY_MS + 4)).toBe(true);
    expect(state.admitEdit("agent", "second", 100 + EDIT_PERMIT_EXPIRY_MS + 5, true)).toBe(1);
  });

  it("expires an unsuccessful next edit without reopening the closed round", () => {
    const state = new ComposedDelivery();
    state.admitEdit("agent", "first", 1);
    state.beginStop("agent", "stop");
    state.finishStop("agent", "stop", true, 100);
    expect(state.registerEdit("agent", "failed", 102, 103)).toBe(true);
    state.expirePermits(102 + EDIT_PERMIT_EXPIRY_MS);
    expect(state.admitEdit("agent", "failed", 103 + EDIT_PERMIT_EXPIRY_MS, true)).toBeUndefined();
    expect(state.generation("agent")).toBe(1);
    expect(state.isActive("agent")).toBe(false);
    expect(state.beginStop("agent", "permit-only")).toBe(false);
    expect(state.registerEdit("agent", "fresh", 104 + EDIT_PERMIT_EXPIRY_MS,
      105 + EDIT_PERMIT_EXPIRY_MS)).toBe(true);
    expect(state.admitEdit("agent", "fresh", 106 + EDIT_PERMIT_EXPIRY_MS, true)).toBe(2);
  });

  it("does not consume or activate an edit when canonical round capacity is exhausted", () => {
    const state = new ComposedDelivery();
    for (let i = 0; i < 64; i++) state.canonical.roundId(`occupied-${i}`);
    expect(state.registerEdit("agent", "edit", 100, 101)).toBe(true);
    expect(state.admitEdit("agent", "edit", 102, true)).toBeUndefined();
    expect(state.generation("agent")).toBe(0);
    expect(state.isActive("agent")).toBe(false);
    expect(state.beginStop("agent", "stop")).toBe(false);
    const admission = state.canonical.canonicalProjection().admissions.find(
      (item) => item.partition === state.canonical.partitionId("agent"));
    expect(admission).toMatchObject({ active: false, round: 0, permits: [] });
    expect(admission?.used).toHaveLength(1);
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

  it("frees active round capacity without forgetting a closed advicee", () => {
    const state = new ComposedDelivery();
    for (let i = 0; i < 64; i++) {
      expect(state.registerEdit(`agent-${i}`, "edit", 1, 2)).toBe(true);
      expect(state.admitEdit(`agent-${i}`, "edit", 3, true)).toBe(1);
      expect(state.beginStop(`agent-${i}`, "stop")).toBe(true);
      expect(state.finishStop(`agent-${i}`, "stop", true, 4)).toBe(1);
    }
    state.expire(600_000);
    expect(state.registerEdit("next-agent", "edit", 600_001, 600_002)).toBe(true);
    expect(state.admitEdit("next-agent", "edit", 600_003, true)).toBe(1);
  });

  it("does not create a round from prompt or Stop alone", () => {
    const state = new ComposedDelivery();
    expect(state.advance("agent", "prompt", 10)).toBe(true);
    expect(state.ensureFromHostTurn("agent", "turn", 11)).toBe(true);
    expect(state.generation("agent")).toBe(0);
    expect(state.beginStop("agent", "stop")).toBe(false);
    expect(state.consumeStop("agent")).toBe(false);
    expect(state.registerEdit("agent", "edit", 12, 13)).toBe(true);
    expect(state.generation("agent")).toBe(0);
    expect(state.beginStop("agent", "stop")).toBe(false);
    expect(state.canonical.canonicalProjection().rounds).toHaveLength(0);
    expect(state.admitEdit("agent", "edit", 14, true)).toBe(1);
  });

  it("starts the next round only when a fresh post edit arrives and shares it across edits", () => {
    const state = new ComposedDelivery();
    state.admitEdit("agent", "first", 10);
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.finishStop("agent", "stop", true, 100)).toBe(1);
    expect(state.registerEdit("agent", "fresh", 102, 103)).toBe(true);
    const closedRounds = state.canonical.canonicalProjection().rounds;
    expect(state.generation("agent")).toBe(1);
    expect(state.isActive("agent")).toBe(false);
    expect(state.beginStop("agent", "permit-only")).toBe(false);
    expect(state.canonical.canonicalProjection().rounds).toEqual(closedRounds);
    expect(state.admitEdit("agent", "fresh", 104, true)).toBe(2);
    const openRounds = state.canonical.canonicalProjection().rounds;
    expect(state.admitEdit("agent", "fresh", 105, true)).toBeUndefined();
    expect(state.canonical.canonicalProjection().rounds).toEqual(openRounds);
    expect(state.registerEdit("agent", "second", 106, 107)).toBe(true);
    expect(state.admitEdit("agent", "second", 108, true)).toBe(2);
    expect(state.canonical.canonicalProjection().rounds).toEqual(openRounds);
  });

  it("keeps closure diagnostics read only until a fresh edit opens the next round", () => {
    const state = new ComposedDelivery();
    expect(state.registerEdit("agent", "first", 10, 11)).toBe(true);
    expect(state.admitEdit("agent", "first", 12, true)).toBe(1);
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.finishStop("agent", "stop", true, 100)).toBe(1);
    expect(state.canonical.currentRoundId("agent")).toBeUndefined();
    expect(state.canonical.canonicalProjection().rounds).toEqual([]);

    expect(state.closureCounts("agent")).toEqual({
      reservedContinuations: 0, submitted: 0, uncertain: 0, editPermits: 0,
    });
    expect(state.hasVirtualRoundContinuationBudget("agent")).toBe(false);
    expect(state.canSubmit("agent", "background")).toBe(false);
    expect(state.isDeciding("agent")).toBe(false);
    expect(state.canonical.currentRoundId("agent")).toBeUndefined();
    expect(state.canonical.canonicalProjection().rounds).toEqual([]);

    expect(state.registerEdit("agent", "second", 102, 103)).toBe(true);
    expect(state.canonical.canonicalProjection().rounds).toEqual([]);
    expect(state.admitEdit("agent", "second", 104, true)).toBe(2);
    expect(state.canonical.currentRoundId("agent")).toBeDefined();
    expect(state.canonical.canonicalProjection().rounds).toHaveLength(1);
  });

  it("releases pending permits in canonical state at a Stop cutoff", () => {
    const state = new ComposedDelivery();
    state.admitEdit("agent", "first", 1);
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
    expect(state.finishGate("agent", "stop", 0, false))
      .toMatchObject({ status: "waiting" });
    expect(state.canonical.observation(scopes[0]!, first, "completeObservation", round)).toBe(false);
    expect(state.canonical.observation(scopes[0]!, first, "startObservation", round)).toBe(true);
    expect(state.canonical.observation(scopes[0]!, first, "completeObservation", round)).toBe(true);
    expect(state.finishGate("agent", "stop", 0, false))
      .toMatchObject({ status: "waiting" });
    const cutoff = state.finishGate("agent", "stop", 0, true);
    expect(cutoff).toMatchObject({ status: "cutoff", cancelledSource: [] });
    expect(state.canonical.canonicalProjection().rounds.filter((item) =>
      scopes.some((scope) => item.partition === state.canonical.partitionId(scope)))
      .every((item) => item.deciding)).toBe(true);
    expect(state.finishStop("agent", "stop", false, 100)).toBeUndefined();
    expect(state.canonical.canonicalProjection().rounds.filter((item) =>
      scopes.some((scope) => item.partition === state.canonical.partitionId(scope)))
      .every((item) => !item.deciding)).toBe(true);
    expect(state.canonical.admitObservation(scopes[0]!)).toBeGreaterThan(second);
  });

  it("keeps Stop polling bound to its captured canonical round", () => {
    const state = new ComposedDelivery();
    state.admitEdit("agent", "edit", 0);
    expect(state.beginStop("agent", "stop")).toBe(true);
    const original = state.canonical.roundId("agent");
    state.canonical.retireRound("agent", original);
    const successor = state.canonical.roundId("agent");
    const source = state.canonical.admitObservation("agent", successor);
    expect(state.finishGate("agent", "stop", 0, true)).toBeUndefined();
    expect(state.canonical.canonicalProjection().work).toEqual([
      expect.objectContaining({ operation: source, round: successor, kind: "sourceQueued" }),
    ]);
    expect(state.canonical.canonicalProjection().rounds).toEqual([
      expect.objectContaining({ id: successor, deciding: false }),
    ]);
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
