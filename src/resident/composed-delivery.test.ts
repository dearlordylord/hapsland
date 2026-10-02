import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { makeCapacityLedger, MAX_PARTITION_IDENTITIES } from "./capacity.ts";
import { BACKGROUND_WAITER_EXPIRY_MS, type ComposedDelivery, EDIT_PERMIT_EXPIRY_MS, VIRTUAL_ROUND_QUIET_MS } from "./composed-delivery.ts";
const RECENT_EDIT_IDENTITIES = 1_000;
import { monotonicNow } from "./hook-clock.ts";
import { DELIVERY_LEASE_MS } from "./protocol.ts";

const canonicalFinding = (state: Pick<ComposedDelivery, "canonical">, partition = "agent"): number => {
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
  it("rolls back provisional revocation and nested submissions when Stop closure fails", () => {
    const state = makeCapacityLedger().delivery();
    const permitRead = state.hasFinishPermit("output");
    expect(Effect.runSync(permitRead)).toBe(false);
    const finding = { rule: "r", advice: "repair" };
    state.admitEdit("agent", "edit", 0);
    expect(state.beginStop("agent", "attempt")).toBe(true);
    const unit = canonicalFinding(state);
    state.finishGate("agent", "attempt", 0, true);
    const selected = [{ id: "advice", unit, findings: [finding] }];
    expect(state.reserveFinishOutput("agent", "attempt", "output", selected, 1)).toBe(true);
    const before = state.canonical.canonicalProjection();
    const beforeCounts = state.closureCounts("agent");
    const beforeOwnsStop = state.ownsStop("agent", "attempt");

    // finishStop revokes provisional output and ends the Stop before validating
    // its closure timestamp. Neither step may escape when that timestamp fails.
    expect(() => state.finishStop("agent", "attempt", true, Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(state.canonical.canonicalProjection()).toEqual(before);
    expect(state.closureCounts("agent")).toEqual(beforeCounts);
    expect(Effect.runSync(permitRead)).toBe(true);
    expect(Effect.runSync(state.hasToken("output"))).toBe(true);
    expect(state.finishSelectionMatches("output", selected)).toBe(true);
    expect(state.ownsStop("agent", "attempt")).toBe(beforeOwnsStop);
    expect(state.authorizeFinishOutput("agent", "output")).toBe(true);
    expect(state.markSubmitted("output", [unit])).toBe(true);
  });

  it("runs repeat diagnostics after publication and contains a failing sink", () => {
    const ledger = makeCapacityLedger();
    let reports = 0;
    let nestedDecision: unknown;
    const state = ledger.delivery(() => {
      reports += 1;
      // Reentrant reads and commits are permitted at this external sink. The
      // repeat flag is already published, so the nested call cannot report again.
      nestedDecision = state.registerEditDecision("agent", "edit", 111, 120);
      throw new Error("diagnostic sink unavailable");
    });
    expect(state.registerEditDecision("agent", "edit", 100, 110)).toEqual({ accepted: true });
    expect(state.registerEditDecision("agent", "edit", 111, 120)).toEqual({ accepted: true });
    expect(reports).toBe(1);
    expect(nestedDecision).toEqual({ accepted: true });
    expect(state.closureCounts("agent").editPermits).toBe(1);
    expect(state.admitEdit("agent", "edit", 130, true)).toBe(1);
  });

  it("shares delivery views and clears their native ownership with canonical state", () => {
    const ledger = makeCapacityLedger();
    const now = monotonicNow();
    const first = ledger.delivery();
    const second = ledger.delivery();
    expect(first.registerEdit("agent", "edit", now, now + 1)).toBe(true);
    expect(second.hasPendingEdits("agent")).toBe(true);
    expect(second.admitEdit("agent", "edit", now + 10, true)).toBe(1);
    expect(first.beginStop("agent", "attempt")).toBe(true);
    expect(second.ownsStop("agent", "attempt")).toBe(true);
    ledger.clear();
    expect(first.hasPendingEdits("agent")).toBe(false);
    expect(second.ownsStop("agent", "attempt")).toBe(false);
    expect(Effect.runSync(first.liveCollectionTokenKeys()).size).toBe(0);
    expect(Effect.runSync(first.editIdentityMappingCount())).toBe(0);
    expect(first.registerEdit("agent", "fresh", now + 100, now + 110)).toBe(true);
    expect(second.admitEdit("agent", "fresh", now + 120, true)).toBe(1);
  });

  it("closes only after five continuous quiet minutes and opens a fresh virtual round on a later edit", () => {
    const state = makeCapacityLedger().delivery();
    expect(state.admitEdit("agent", "first", 1)).toBe(1);
    const quiet = { nativeWorkIdle: true, adviceEmpty: true };
    expect(state.tickQuietRound("agent", 100, quiet)).toBeUndefined();
    expect(state.tickQuietRound("agent", 100 + VIRTUAL_ROUND_QUIET_MS - 1, quiet)).toBeUndefined();
    expect(state.isActive("agent")).toBe(true);
    expect(state.tickQuietRound("agent", 100 + VIRTUAL_ROUND_QUIET_MS, quiet)).toBe(1);
    expect(state.isActive("agent")).toBe(false);
    expect(state.beginStop("agent", "late-stop")).toBe(false);
    expect(state.registerEditDecision("agent", "late-edit", 99, 100 + VIRTUAL_ROUND_QUIET_MS + 1).accepted)
      .toBe(false);
    expect(state.registerEditDecision("agent", "second", 100 + VIRTUAL_ROUND_QUIET_MS + 2,
      100 + VIRTUAL_ROUND_QUIET_MS + 3)).toEqual({ accepted: true });
    expect(state.admitEdit("agent", "second", 100 + VIRTUAL_ROUND_QUIET_MS + 4, true)).toBe(2);
  });

  it("restarts the quiet interval after edit activity and after pending advice clears", () => {
    const state = makeCapacityLedger().delivery();
    const quiet = { nativeWorkIdle: true, adviceEmpty: true };
    expect(state.admitEdit("agent", "first", 1)).toBe(1);
    state.tickQuietRound("agent", 100, quiet);
    expect(state.admitEdit("agent", "second", VIRTUAL_ROUND_QUIET_MS - 10)).toBe(1);
    expect(state.tickQuietRound("agent", VIRTUAL_ROUND_QUIET_MS + 100, quiet)).toBeUndefined();
    expect(state.tickQuietRound("agent", 2 * VIRTUAL_ROUND_QUIET_MS + 100,
      { nativeWorkIdle: true, adviceEmpty: false })).toBeUndefined();
    expect(state.tickQuietRound("agent", 2 * VIRTUAL_ROUND_QUIET_MS + 101, quiet)).toBeUndefined();
    expect(state.tickQuietRound("agent", 3 * VIRTUAL_ROUND_QUIET_MS + 101, quiet)).toBe(1);
  });

  it("uses the quiet duration captured by the first admitted edit", () => {
    const state = makeCapacityLedger().delivery();
    const limits = { perAdvicee: 32, resident: 4096 };
    expect(state.registerEditDecision("agent", "first", 100, 101, limits, 10_000)).toEqual({ accepted: true });
    expect(state.admitEdit("agent", "first", 102, true)).toBe(1);
    const quiet = { nativeWorkIdle: true, adviceEmpty: true };
    state.tickQuietRound("agent", 200, quiet);
    expect(state.registerEditDecision("agent", "second", 300, 301, limits, 20_000)).toEqual({ accepted: true });
    expect(state.admitEdit("agent", "second", 302, true)).toBe(1);
    state.tickQuietRound("agent", 400, quiet);
    expect(state.tickQuietRound("agent", 10_399, quiet)).toBeUndefined();
    expect(state.tickQuietRound("agent", 10_400, quiet)).toBe(1);
  });

  it("breaks quiescence for a permit even when the permit expires between checks", () => {
    const state = makeCapacityLedger().delivery();
    const quiet = { nativeWorkIdle: true, adviceEmpty: true };
    expect(state.admitEdit("agent", "first", 1)).toBe(1);
    state.tickQuietRound("agent", 100, quiet);
    expect(state.registerEditDecision("agent", "unused", 200, 201)).toEqual({ accepted: true });
    state.expirePermits(200 + EDIT_PERMIT_EXPIRY_MS);
    expect(state.tickQuietRound("agent", 100 + VIRTUAL_ROUND_QUIET_MS, quiet)).toBeUndefined();
    expect(state.tickQuietRound("agent", 2 * VIRTUAL_ROUND_QUIET_MS + 100, quiet)).toBe(1);
  });

  it("holds the virtual round through Stop even after the quiet deadline", () => {
    const state = makeCapacityLedger().delivery();
    const quiet = { nativeWorkIdle: true, adviceEmpty: true };
    expect(state.admitEdit("agent", "first", 1)).toBe(1);
    state.tickQuietRound("agent", 100, quiet);
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.tickQuietRound("agent", 100 + VIRTUAL_ROUND_QUIET_MS, quiet)).toBeUndefined();
    expect(state.isActive("agent")).toBe(true);
  });

  it("starts a new quiet interval after Stop continues the advicee", () => {
    const state = makeCapacityLedger().delivery();
    const quiet = { nativeWorkIdle: true, adviceEmpty: true };
    expect(state.admitEdit("agent", "first", 1)).toBe(1);
    state.tickQuietRound("agent", 100, quiet);
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.finishStop("agent", "stop", false, 101)).toBeUndefined();
    expect(state.tickQuietRound("agent", 100 + VIRTUAL_ROUND_QUIET_MS, quiet)).toBeUndefined();
    expect(state.tickQuietRound("agent", 100 + 2 * VIRTUAL_ROUND_QUIET_MS, quiet)).toBe(1);
  });

  it("frees one of 64 open slots without changing another advicee's round", () => {
    const state = makeCapacityLedger().delivery();
    const quiet = { nativeWorkIdle: true, adviceEmpty: true };
    for (let index = 0; index < 64; index++) {
      expect(state.admitEdit(`agent-${index}`, `edit-${index}`, 1)).toBe(1);
    }
    expect(state.admitEdit("next", "edit", 2)).toBeUndefined();
    state.tickQuietRound("agent-0", 100, quiet);
    expect(state.tickQuietRound("agent-0", 100 + VIRTUAL_ROUND_QUIET_MS, quiet)).toBe(1);
    expect(state.isActive("agent-1")).toBe(true);
    expect(state.admitEdit("next", "fresh-edit", 100 + VIRTUAL_ROUND_QUIET_MS + 1)).toBe(1);
  });

  it("does not retain an advicee identity for a rejected first edit", () => {
    const state = makeCapacityLedger().delivery();
    expect(state.registerEditDecision("late-advicee", "edit", 100, 2600)).toEqual({
      accepted: false, reason: "StaleInvocation",
    });
    expect(state.canonical.knownPartitionId("late-advicee")).toBeUndefined();
    expect(state.canonical.canonicalProjection().admissions).toEqual([]);
  });

  it("reclaims a closed advicee record and refuses its old edit after eviction", () => {
    const state = makeCapacityLedger().delivery();
    state.admitEdit("agent", "first", 1);
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.finishStop("agent", "stop", true, 100)).toBe(1);
    const oldId = state.canonical.knownPartitionId("agent");
    for (let index = 1; index < MAX_PARTITION_IDENTITIES; index++) {
      state.canonical.partitionId(`other-${index}`);
    }
    state.canonical.partitionId("overflow");
    expect(state.canonical.knownPartitionId("agent")).toBeUndefined();
    expect(state.canonical.canonicalProjection().admissions.some(
      (item) => item.partition === oldId)).toBe(false);
    const oldStart = state.canonical.minimumFreshStart() / 1000;
    expect(state.registerEditDecision("agent", "late", oldStart, oldStart + 1).accepted).toBe(false);
    expect(state.canonical.knownPartitionId("agent")).toBeUndefined();
  });

  it("removes the Bend delivery counter when a virtual round ends", () => {
    const state = makeCapacityLedger().delivery();
    state.admitEdit("agent", "first", 1);
    const group = state.canonical.partitionId("agent");
    const round = state.canonical.roundId("agent");
    expect(state.canonical.transition({ kind: "continuationConsume", group, round }).commands[0]?.kind)
      .toBe("continuationConsumed");
    expect(state.canonical.canonicalProjection().delivery.counters).toHaveLength(1);
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.finishStop("agent", "stop", true, 100)).toBe(1);
    expect(state.canonical.canonicalProjection().delivery.counters).toEqual([]);
  });

  it("denies a fresh background token after a Stop continuation installs its barrier", () => {
    const state = makeCapacityLedger().delivery();
    state.admitEdit("agent", "edit", 100);
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.consumeStop("agent")).toBe(true);
    expect(state.canBeginExistingToken("background", "fresh")).toBe(true);
    expect(state.canBeginSubmission("agent", "background", "fresh")).toBe(false);
  });

  it("denies a duplicate token after its native lease expires without dropping uncertainty", () => {
    const state = makeCapacityLedger().delivery();
    state.admitEdit("agent", "edit", 100);
    expect(state.beginSubmission("advice", "agent", "output", [{ rule: "r" }],
      "background", 100)).toBe(true);
    state.expire(100 + DELIVERY_LEASE_MS);
    expect(state.closureCounts("agent").uncertain).toBe(1);
    expect(state.canBeginExistingToken("background", "output")).toBe(false);
    expect(state.closureCounts("agent").uncertain).toBe(1);
    expect(Effect.runSync(state.hasToken("output"))).toBe(true);
  });

  it("allows four continuation reservations; prompts and expiry cannot reset them", () => {
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
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

  it("reuses a pending permit and rejects a recently completed edit ID", () => {
    const diagnostics: unknown[] = [];
    const state = makeCapacityLedger().delivery((diagnostic) => diagnostics.push(diagnostic));
    expect(state.registerEditDecision("agent", "same-edit", 100, 110)).toEqual({ accepted: true });
    expect(state.registerEditDecision("agent", "same-edit", 111, 120)).toEqual({ accepted: true });
    expect(state.closureCounts("agent").editPermits).toBe(1);
    expect(state.admitEdit("agent", "same-edit", 130, true)).toBe(1);
    expect(state.registerEditDecision("agent", "same-edit", 131, 140)).toEqual({
      accepted: false, reason: "DuplicateTool",
    });
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.finishStop("agent", "stop", true, 200)).toBe(1);
    expect(state.registerEditDecision("agent", "same-edit", 220, 230)).toEqual({
      accepted: false, reason: "DuplicateTool",
    });
    expect(diagnostics).toMatchObject([{ phase: "pending" }, { phase: "completed", completedReason: "consumed" }]);
    expect(Effect.runSync(state.recentEditCount())).toBe(1);
  });

  it("retains at most 1000 completed identities across the resident", () => {
    const diagnostics: unknown[] = [];
    const state = makeCapacityLedger().delivery((diagnostic) => diagnostics.push(diagnostic));
    for (let index = 0; index < RECENT_EDIT_IDENTITIES; index += 1) {
      expect(state.admitEdit(`agent-${index % 2}`, `edit-${index}`, index + 1)).toBe(1);
    }
    expect(Effect.runSync(state.recentEditCount())).toBe(RECENT_EDIT_IDENTITIES);
    expect(Effect.runSync(state.editIdentityMappingCount())).toBe(RECENT_EDIT_IDENTITIES);
    expect(state.registerEditDecision("agent-0", "edit-0", 1002, 1003)).toEqual({ accepted: false, reason: "DuplicateTool" });
    expect(diagnostics).toHaveLength(1);
    expect(state.admitEdit("agent-0", `edit-${RECENT_EDIT_IDENTITIES}`, 1001)).toBe(1);
    expect(Effect.runSync(state.recentEditCount())).toBe(RECENT_EDIT_IDENTITIES);
    expect(Effect.runSync(state.editIdentityMappingCount())).toBe(RECENT_EDIT_IDENTITIES);
    expect(state.registerEditDecision("agent-0", "edit-0", 1004, 1005)).toEqual({ accepted: true });
  }, 20_000);

  it("counts pending permits per advicee and across the resident, then frees consumed capacity", () => {
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
    expect(state.admitEdit("agent", "first", 1)).toBe(1);
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.finishStop("agent", "stop", true, 100)).toBe(1);
    expect(state.admitEdit("agent", "next", 102)).toBeUndefined();
  });

  it("never renews a tool occurrence when duplicate prehooks outlive its permit", () => {
    const state = makeCapacityLedger().delivery();
    expect(state.registerEdit("agent", "failed", 100, 101)).toBe(true);
    expect(state.registerEdit("agent", "failed", 200, 201)).toBe(true);
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
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
    for (let i = 0; i < 64; i++) state.canonical.roundId(`occupied-${i}`);
    expect(state.registerEdit("agent", "edit", 100, 101)).toBe(true);
    expect(state.admitEdit("agent", "edit", 102, true)).toBeUndefined();
    expect(state.generation("agent")).toBe(0);
    expect(state.isActive("agent")).toBe(false);
    expect(state.beginStop("agent", "stop")).toBe(false);
    const admission = state.canonical.canonicalProjection().admissions.find(
      (item) => item.partition === state.canonical.partitionId("agent"));
    expect(admission).toMatchObject({ active: false, round: 0, permits: [] });
    expect(Effect.runSync(state.recentEditCount())).toBe(1);
  });

  it("keeps native tool identity across duplicate and cross-advicee callbacks", () => {
    const state = makeCapacityLedger().delivery();
    expect(state.registerEdit("child", "tool-use-original", 100, 110)).toBe(true);
    expect(state.registerEdit("child", "tool-use-original", 100, 111)).toBe(true);
    expect(state.admitEdit("parent", "tool-use-original", 115, true)).toBeUndefined();
    expect(state.admitEdit("child", "other-tool", 116, true)).toBeUndefined();
    expect(state.admitEdit("child", "tool-use-original", 117, true)).toBe(1);
    expect(state.admitEdit("child", "tool-use-original", 118, true)).toBeUndefined();
    const child = state.canonical.canonicalProjection().admissions[0];
    expect(Effect.runSync(state.recentEditCount())).toBe(1);
    expect(child?.permits).toHaveLength(0);
  });

  it("closes abandoned pre-output Stop attempts but preserves uncertain continuations", () => {
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
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

  it("records a two-advice Stop output as one checked terminal transition", () => {
    const state = makeCapacityLedger().delivery();
    state.admitEdit("agent", "edit", 0);
    const first = canonicalFinding(state);
    const second = canonicalFinding(state);
    state.beginStop("agent", "attempt");
    state.finishGate("agent", "attempt", 0, true);
    expect(state.reserveFinishOutput("agent", "attempt", "output", [
      { id: "first", unit: first, findings: [{ rule: "a", advice: "first" }] },
      { id: "second", unit: second, findings: [{ rule: "b", advice: "second" }] },
    ], 1)).toBe(true);
    expect(state.authorizeFinishOutput("agent", "output")).toBe(true);
    const before = state.canonical.canonicalProjection();
    expect(before.delivery.submissions.batches.map((batch) => batch.phase)).toEqual(["authorized", "authorized"]);
    const firstBatch = before.delivery.submissions.batches[0];
    if (firstBatch === undefined) throw new Error("expected first Stop advice record");
    expect(state.canonical.transition({ kind: "submissionTerminal", advice: firstBatch.advice,
      token: firstBatch.token, certain: true }).commands[0]?.kind).toBe("submissionRefused");
    expect(state.canonical.transition({ kind: "submissionRelease", advice: firstBatch.advice,
      token: firstBatch.token }).commands[0]?.kind).toBe("submissionRefused");
    const slot = before.delivery.slots[0];
    if (slot === undefined) throw new Error("expected Stop output slot");
    expect(state.canonical.transition({ kind: "finishEnd", group: slot.group,
      round: slot.round, attempt: slot.attempt, token: slot.token }).commands[0]?.kind).toBe("finishRefused");
    expect(state.canonical.transition({ kind: "submissionForget", advice: firstBatch.advice }).rejection).toBeDefined();
    expect(state.canonical.transition({ kind: "collectionRetireAdvice", advice: firstBatch.advice }).rejection).toBeDefined();
    expect(state.canonical.canonicalProjection()).toEqual(before);
    expect(state.markSubmitted("output", [first])).toBe(false);
    expect(state.canonical.canonicalProjection()).toEqual(before);
    expect(state.markSubmitted("output", [first, second])).toBe(true);
    const after = state.canonical.canonicalProjection();
    expect(after.delivery.submissions.batches.map((batch) => batch.phase)).toEqual(["submitted", "submitted"]);
    expect(after.delivery.slots.map((slot) => slot.phase)).toEqual(["submitted"]);
  });

  it("marks both advice records uncertain with their shared Stop output", () => {
    const state = makeCapacityLedger().delivery();
    state.admitEdit("agent", "edit", 0);
    const first = canonicalFinding(state);
    const second = canonicalFinding(state);
    state.beginStop("agent", "attempt");
    state.finishGate("agent", "attempt", 0, true);
    expect(state.reserveFinishOutput("agent", "attempt", "output", [
      { id: "first", unit: first, findings: [{ rule: "a", advice: "first" }] },
      { id: "second", unit: second, findings: [{ rule: "b", advice: "second" }] },
    ], 1)).toBe(true);
    expect(state.authorizeFinishOutput("agent", "output")).toBe(true);
    expect(state.markUncertain("output")).toBe(true);
    const after = state.canonical.canonicalProjection();
    expect(after.delivery.submissions.batches.map((batch) => batch.phase)).toEqual(["uncertain", "uncertain"]);
    expect(after.delivery.slots.map((slot) => slot.phase)).toEqual(["uncertain"]);
  });

  it("refuses a prepared Stop output when one selected advice is retired before authorization", () => {
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
    state.admitEdit("agent", "first", 1);
    expect(state.registerEdit("agent", "pending", 10, 11)).toBe(true);
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.finishGate("agent", "stop", 0, true)?.status).toBe("cutoff");
    expect(state.closureCounts("agent").editPermits).toBe(0);
    expect(state.canonical.canonicalProjection().admissions[0]?.permits).toHaveLength(0);
  });

  it("waits across edits in one advicee round and resets its decision fence on continuation", () => {
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
    state.admitEdit("agent", "edit", 0);
    expect(state.beginStop("agent", "stop")).toBe(true);
    const original = state.canonical.roundId("agent");
    state.canonical.retireRound("agent", original);
    const successor = state.canonical.roundId("agent");
    const source = state.canonical.admitObservation("agent", successor);
    expect(state.finishGate("agent", "stop", 0, true)).toBeUndefined();
    expect(state.canonical.canonicalProjection().work).toEqual([
      expect.objectContaining({ operation: source, round: successor, kind: "awaitingSourceRead" }),
    ]);
    expect(state.canonical.canonicalProjection().rounds).toEqual([
      expect.objectContaining({ id: successor, deciding: false }),
    ]);
  });

  it("keeps an external Stop owner waiting until deadline", () => {
    const state = makeCapacityLedger().delivery();
    state.admitEdit("agent", "edit", 0);
    expect(state.beginStop("agent", "stop")).toBe(true);
    expect(state.finishGate("agent", "stop", 1, false)).toMatchObject({ status: "waiting" });
    expect(state.finishGate("agent", "stop", 1, true)).toMatchObject({ status: "cutoff", limited: false });
  });

  it("coalesces background waiters and forbids submission after the Stop barrier", () => {
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
    state.admitEdit("agent", "edit", 0);
    expect(state.claimBackground("agent", "first", 0.9)).toBe(true);
    expect(state.claimBackground("agent", "second", BACKGROUND_WAITER_EXPIRY_MS + 0.1)).toBe(false);
    expect(state.claimBackground("agent", "second", BACKGROUND_WAITER_EXPIRY_MS + 0.9)).toBe(true);
  });

  it("counts submitted background findings as delivered at Stop", () => {
    const state = makeCapacityLedger().delivery();
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
    expect(Effect.runSync(state.hasToken("bg"))).toBe(false);
  });

  it("reoffers an authorized background write only after terminal uncertainty", () => {
    const state = makeCapacityLedger().delivery();
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
    const state = makeCapacityLedger().delivery();
    const finding = { rule: "r", advice: "repair" };
    state.admitEdit("agent", "edit", 0);
    expect(state.beginSubmission("advice", "agent", "bg", [finding], "background", 1)).toBe(true);
    expect(state.markUncertain("bg")).toBe(true);
    expect(state.beginSubmission("advice", "agent", "stop", [finding], "stop", 2)).toBe(true);
    expect(state.suppresses("advice", "agent", finding, "stop")).toBe(true);
    state.release("stop");
    expect(Effect.runSync(state.hasToken("bg"))).toBe(true);
    expect(state.suppresses("advice", "agent", finding, "stop")).toBe(false);
    expect(state.beginSubmission("advice", "agent", "retry", [finding], "stop", 3)).toBe(true);
  });

  it("expires an authorized background output only at its full fractional-time lease", () => {
    const state = makeCapacityLedger().delivery();
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
