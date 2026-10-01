import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Effect } from "effect";
import { makeResidentState } from "./capacity.ts";
import { freezeInput, freezeRules, semanticIdentity, type PreparedUnit, type DirectObservation } from "../direct-event/model.ts";
import { TYPE_INPUT_CONTRACT } from "../rules/targets.ts";
import { advicee } from "../direct-event/test-fixtures.ts";
import { residentTicketInput } from "../test-support/resident-ticket.ts";
import type { AdviceInitial } from "./advice-records.ts";

const observation: DirectObservation = {
  root: "/fixture", rootIdentity: { rootDevice: "1", rootInode: "1", gitDirectory: "/fixture/.git", gitDevice: "1", gitInode: "2" },
  advicee: advicee(), candidates: [{ operation: "add", path: "count.ts", addedLines: [] }],
};
const input = freezeInput({ contract: TYPE_INPUT_CONTRACT, completeness: "complete", path: "count.ts",
  declaration: { id: "count.ts::Count", kind: "type-alias", name: "Count", source: "type Count = number", sourceHash: "source" },
  unit: { root: { artifact: { id: "count.ts::Count", kind: "type-alias", name: "Count", source: "type Count = number", sourceHash: "source" }, references: [] } },
  rules: freezeRules([]), interpretation: "probability-strictly-greater-than-threshold" });
const prepared: PreparedUnit = { root: observation.root, advicee: observation.advicee, input, identity: semanticIdentity(input) };
const finding = { path: "count.ts", declaration: "Count", ruleId: "noul", probability: 0.9, message: "review", semanticIdentity: prepared.identity };
type Owner = Effect.Success<ReturnType<typeof makeResidentState<never, string, never>>>;
const fixture = (existing?: Owner) => Effect.gen(function* () {
  const owner = existing ?? (yield* makeResidentState());
  const generation = owner.delivery().admitEdit("agent", "edit", 0);
  if (generation === undefined) throw new Error("fixture edit refused");
  const round = owner.rounds.bind("agent", generation, { root: observation.root, advicee: observation.advicee, activityPath: undefined }, "cohort");
  const admissionId = owner.admitObservation("agent");
  owner.observation("agent", admissionId, "startObservation", round.canonicalRound);
  const preparation = owner.beginObservedPreparation("agent", admissionId, 100, round.canonicalRound);
  if (preparation === undefined) throw new Error("fixture preparation refused");
  const [unit] = owner.completePreparation("agent", preparation.operation, preparation.reservation, [100], round.canonicalRound);
  if (unit === undefined) throw new Error("fixture unit refused");
  expect(owner.observeReview("agent", unit.operation, unit.reservation, "finding", true, round.canonicalRound)).toBe("retainFinding");
  owner.observation("agent", admissionId, "completeObservation", round.canonicalRound);
  const revision = owner.revision.register("agent", prepared, true, "revision").revision;
  const initial: AdviceInitial = {
    id: "advice", canonicalRound: round.canonicalRound, round, workUnitId: unit.operation, admissionId,
    canonicalOperationId: unit.operation, observation, partition: "agent", reservation: unit.reservation,
    prepared, revision, evaluationKey: "key", evaluations: [{ prepared, findings: [finding] }], findings: [finding], sequence: 1,
    credentialGeneration: null, credentialStatePath: null, credentialRequired: false, credentialEnvironmentOnly: false, pendingAt: 0,
  };
  return { owner, initial };
});

it.effect("owns frozen advice content and leases together with canonical state", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = owner.advice.insert(initial);
  expect(Object.isFrozen(advice)).toBe(true);
  expect(Object.isFrozen(advice.findings)).toBe(true);
  expect(Object.isFrozen(advice.evaluations[0])).toBe(true);
  expect(Reflect.set(advice, "findings", [])).toBe(false);
  expect(owner.advice.eligible(advice, false)).toBe(true);
  expect(advice.collectionEligible).toBe(true);
  expect(owner.advice.reserveLease(advice, "collector")).toBe(true);
  const first = advice.delivery;
  expect(Object.isFrozen(first)).toBe(true);
  expect(owner.canonicalProjection().collection.leases).toEqual([{ advice: initial.canonicalOperationId, owner: owner.collectionTokenId("collector") }]);
  expect(owner.advice.updateDelivery(advice, "wrong", { acknowledged: true })).toBe(false);
  expect(owner.advice.updateDelivery(advice, "collector", { findings: [finding], leaseUntil: 10, acknowledged: true })).toBe(true);
  expect(advice.delivery?.acknowledged).toBe(true);
  expect(first?.acknowledged).toBe(false);
  owner.advice.checkLease(advice, 10, false, false, false);
  expect(advice.delivery).toBeUndefined();
  expect(owner.canonicalProjection().collection.leases).toEqual([]);
}));

it.effect("rolls back retention and lease updates when native payload snapshotting fails", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const before = owner.canonicalProjection();
  const invalid = { ...finding, get message(): string { throw new Error("snapshot failed"); } };
  expect(() => owner.advice.insert({ ...initial, findings: [finding, invalid] })).toThrow("snapshot failed");
  expect(owner.canonicalProjection()).toEqual(before);
  expect(owner.advice.values()).toEqual([]);
  const advice = owner.advice.insert(initial);
  owner.advice.eligible(advice, false);
  owner.advice.reserveLease(advice, "collector");
  const leased = owner.canonicalProjection();
  const delivery = advice.delivery;
  expect(() => owner.advice.updateDelivery(advice, "collector", { findings: [finding, invalid] })).toThrow("snapshot failed");
  expect(owner.canonicalProjection()).toEqual(leased);
  expect(advice.delivery).toBe(delivery);
}));

it.effect("retires advice, ticket bindings and leases while retaining active capture workspace", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const unit = owner.ticketUnits.add(ticket);
  unit.step("findingResult", "lost", { revision: initial.revision, adviceId: initial.id });
  const advice = owner.advice.insert(initial);
  owner.advice.eligible(advice, false);
  owner.advice.reserveLease(advice, "collector");
  const capture = owner.adviceCaptures.start(advice.reservation, advice.revision, 200);
  if (capture === undefined) throw new Error("capture refused");
  expect(owner.advice.remove(advice, "stale", "wrong")).toBe(false);
  expect(owner.advice.remove(advice, "stale", "collector")).toBe(true);
  expect(owner.advice.values()).toEqual([]);
  expect(advice.delivery).toBeUndefined();
  expect(unit.stage()).toMatchObject({ stage: "unavailable", reason: "stale" });
  expect(unit.current).toEqual({});
  expect(owner.canonicalProjection().collection.leases).toEqual([]);
  expect(owner.snapshot().bytes).toBe(300);
  expect(owner.revision.count()).toBe(1);
  expect(owner.adviceCaptures.finish(capture)).toBe("retired");
  expect(owner.snapshot().items).toBe(0);
  expect(owner.revision.count()).toBe(0);
  expect(owner.advice.revise(advice, [], [])).toBe(false);
  expect(owner.advice.remove(advice, "stale")).toBe(false);
}));

it.effect("fences a stale capability after the owner clears and advice identity is reused", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = owner.advice.insert(initial);
  owner.clear();
  const next = yield* fixture(owner);
  const replacement = owner.advice.insert(next.initial);
  expect(owner.advice.revise(advice, [], [])).toBe(false);
  expect(owner.advice.eligible(advice, false)).toBe(false);
  expect(owner.advice.remove(advice, "stale")).toBe(false);
  expect(owner.advice.values()).toEqual([replacement]);
  expect(owner.snapshot().bytes).toBe(100);
}));


it.effect("rejects native retention without canonical finding authority", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const before = owner.canonicalProjection();
  expect(() => owner.advice.insert({ ...initial, canonicalOperationId: 999 })).toThrow("canonical finding owner");
  expect(owner.canonicalProjection()).toEqual(before);
  expect(owner.advice.values()).toEqual([]);
}));

it.effect("rolls back advice retirement when authorized Stop output prevents submission cleanup", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = owner.advice.insert(initial);
  owner.advice.eligible(advice, false);
  owner.advice.reserveLease(advice, "collector");
  const delivery = owner.delivery();
  expect(delivery.beginStop(advice.partition, "stop")).toBe(true);
  delivery.finishGate(advice.partition, "stop", 0, true);
  expect(delivery.reserveFinishOutput(advice.partition, "stop", "collector", [{ id: advice.id, unit: advice.canonicalOperationId, findings: [finding] }], 1)).toBe(true);
  expect(delivery.authorizeFinishOutput(advice.partition, "collector")).toBe(true);
  const before = owner.canonicalProjection();
  expect(() => owner.advice.remove(advice, "stale", "collector")).toThrow("canonical submission forget refused");
  expect(owner.canonicalProjection()).toEqual(before);
  expect(owner.advice.values()).toEqual([advice]);
  expect(owner.snapshot().bytes).toBe(100);
  expect(advice.delivery?.token).toBe("collector");
}));


it.effect("publishes the owner result and independent joined subscribers together", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const ownerUnit = owner.ticketUnits.add(ticket);
  const subscriber = owner.ticketUnits.add(ticket);
  const joined = owner.joinedReviews(() => 1);
  joined.append({ admission: initial.admissionId, evaluationKey: initial.evaluationKey,
    observation, activityPath: undefined, ticketUnit: subscriber, revision: initial.revision });
  const advice = owner.advice.insert(initial);
  expect(ownerUnit.stage()?.stage).toBe("pending");
  expect(subscriber.stage()?.stage).toBe("pending");
  const outcomes = owner.advice.publish(advice, ownerUnit);
  expect(outcomes.map(({ stage }) => stage)).toEqual(["findings"]);
  expect(ownerUnit.stage()?.stage).toBe("finding");
  expect(subscriber.stage()?.stage).toBe("finding");
  expect(ownerUnit.current.adviceId).toBe(advice.id);
  expect(subscriber.current.adviceId).toBe(advice.id);
  expect(joined.hasAdmission(initial.admissionId)).toBe(false);
  owner.advice.remove(advice, "stale");
  expect(owner.advice.publish(advice, ownerUnit)).toEqual([]);
  expect(ownerUnit.stage()?.stage).toBe("unavailable");
}));
