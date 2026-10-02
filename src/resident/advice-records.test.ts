import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Cause, Effect } from "effect";
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
  const round = (yield* owner.rounds.bind("agent", generation, { root: observation.root, advicee: observation.advicee, activityPath: undefined }, "cohort"));
  const admissionId = owner.admitObservation("agent");
  owner.observation("agent", admissionId, "startObservation", round.canonicalRound);
  const preparation = owner.beginObservedPreparation("agent", admissionId, 100, round.canonicalRound);
  if (preparation === undefined) throw new Error("fixture preparation refused");
  const [unit] = owner.completePreparation("agent", preparation.operation, preparation.reservation, [100], round.canonicalRound);
  if (unit === undefined) throw new Error("fixture unit refused");
  expect(owner.observeReview("agent", unit.operation, unit.reservation, "finding", true, round.canonicalRound)).toBe("retainFinding");
  owner.observation("agent", admissionId, "completeObservation", round.canonicalRound);
  const revision = (yield* owner.revision.register("agent", prepared, true, "revision")).revision;
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
  const advice = yield* owner.advice.insert(initial);
  expect(Object.isFrozen(advice)).toBe(true);
  expect(Object.isFrozen(advice.findings)).toBe(true);
  expect(Object.isFrozen(advice.evaluations[0])).toBe(true);
  expect(Reflect.set(advice, "findings", [])).toBe(false);
  expect(yield* owner.advice.eligible(advice, false)).toBe(true);
  expect(advice.collectionEligible).toBe(true);
  expect(yield* owner.advice.reserveLease(advice, "collector")).toBe(true);
  const first = advice.delivery;
  expect(Object.isFrozen(first)).toBe(true);
  expect(owner.canonicalProjection().collection.leases).toEqual([{ advice: initial.canonicalOperationId, owner: owner.collectionTokenId("collector") }]);
  expect(yield* owner.advice.updateDelivery(advice, "wrong", { acknowledged: true })).toBe(false);
  expect(yield* owner.advice.updateDelivery(advice, "collector", { findings: [finding], leaseUntil: 10, acknowledged: true })).toBe(true);
  expect(advice.delivery?.acknowledged).toBe(true);
  expect(first?.acknowledged).toBe(false);
  yield* owner.advice.checkLease(advice, 10, false, false, false);
  expect(advice.delivery).toBeUndefined();
  expect(owner.canonicalProjection().collection.leases).toEqual([]);
}));

it.effect("rolls back retention and lease updates when native payload snapshotting fails", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const before = owner.canonicalProjection();
  const invalid = { ...finding, get message(): string { throw new Error("snapshot failed"); } };
  expect(yield* defectMessage(owner.advice.insert({ ...initial, findings: [finding, invalid] }))).toContain("snapshot failed");
  expect(owner.canonicalProjection()).toEqual(before);
  expect(owner.advice.values()).toEqual([]);
  const advice = yield* owner.advice.insert(initial);
  yield* owner.advice.eligible(advice, false);
  yield* owner.advice.reserveLease(advice, "collector");
  const leased = owner.canonicalProjection();
  const delivery = advice.delivery;
  expect(yield* defectMessage(owner.advice.updateDelivery(advice, "collector", { findings: [finding, invalid] }))).toContain("snapshot failed");
  expect(owner.canonicalProjection()).toEqual(leased);
  expect(advice.delivery).toBe(delivery);
}));

it.effect("retires advice, ticket bindings and leases while retaining active capture workspace", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const unit = (yield* owner.ticketUnits.add(ticket));
  (yield* owner.ticketUnits.step(unit, "findingResult", "lost", { revision: initial.revision, adviceId: initial.id }));
  const advice = yield* owner.advice.insert(initial);
  yield* owner.advice.eligible(advice, false);
  yield* owner.advice.reserveLease(advice, "collector");
  const capture = yield* owner.adviceCaptures.start(advice.reservation, advice.revision, 200);
  if (capture === undefined) throw new Error("capture refused");
  expect(owner.advice.remove(advice, "stale", "wrong")).toBe(false);
  expect(owner.advice.remove(advice, "stale", "collector")).toBe(true);
  expect(owner.advice.values()).toEqual([]);
  expect(advice.delivery).toBeUndefined();
  expect((yield* owner.ticketUnits.stage(unit))).toMatchObject({ stage: "unavailable", reason: "stale" });
  expect((yield* owner.ticketUnits.current(unit))).toEqual({});
  expect(owner.canonicalProjection().collection.leases).toEqual([]);
  expect(owner.snapshot().bytes).toBe(300);
  expect(yield* owner.revision.count()).toBe(1);
  expect(owner.adviceCaptures.finish(capture)).toBe("retired");
  expect(owner.snapshot().items).toBe(0);
  expect(yield* owner.revision.count()).toBe(0);
  expect(yield* owner.advice.revise(advice, [], [])).toBe(false);
  expect(owner.advice.remove(advice, "stale")).toBe(false);
}));

it.effect("fences a stale capability after the owner clears and advice identity is reused", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  owner.clear();
  const next = yield* fixture(owner);
  const replacement = yield* owner.advice.insert(next.initial);
  expect(yield* owner.advice.revise(advice, [], [])).toBe(false);
  expect(yield* owner.advice.eligible(advice, false)).toBe(false);
  expect(owner.advice.remove(advice, "stale")).toBe(false);
  expect(owner.advice.values()).toEqual([replacement]);
  expect(owner.snapshot().bytes).toBe(100);
}));


it.effect("rejects native retention without canonical finding authority", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const before = owner.canonicalProjection();
  expect(yield* defectMessage(owner.advice.insert({ ...initial, canonicalOperationId: 999 }))).toContain("canonical finding owner");
  expect(owner.canonicalProjection()).toEqual(before);
  expect(owner.advice.values()).toEqual([]);
}));

it.effect("rolls back advice retirement when authorized Stop output prevents submission cleanup", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  yield* owner.advice.eligible(advice, false);
  yield* owner.advice.reserveLease(advice, "collector");
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
  const ownerUnit = (yield* owner.ticketUnits.add(ticket));
  const subscriber = (yield* owner.ticketUnits.add(ticket));
  const joined = owner.joinedReviews(() => 1);
  yield* joined.append({ admission: initial.admissionId, evaluationKey: initial.evaluationKey,
    observation, activityPath: undefined, ticketUnit: subscriber, revision: initial.revision });
  const advice = yield* owner.advice.insert(initial);
  const publish = owner.advice.publish(advice, ownerUnit);
  expect((yield* owner.ticketUnits.stage(ownerUnit))?.stage).toBe("pending");
  expect((yield* owner.ticketUnits.stage(subscriber))?.stage).toBe("pending");
  const batches = yield* Effect.all(Array.from({ length: 16 }, () => publish), { concurrency: 16 });
  expect(batches.filter((batch) => batch.length > 0)).toHaveLength(1);
  const outcomes = batches.flat();
  expect(outcomes.map(({ stage }) => stage)).toEqual(["findings"]);
  expect((yield* owner.ticketUnits.stage(ownerUnit))?.stage).toBe("finding");
  expect((yield* owner.ticketUnits.stage(subscriber))?.stage).toBe("finding");
  expect((yield* owner.ticketUnits.current(ownerUnit)).adviceId).toBe(advice.id);
  expect((yield* owner.ticketUnits.current(subscriber)).adviceId).toBe(advice.id);
  expect(yield* joined.hasAdmission(initial.admissionId)).toBe(false);
  owner.advice.remove(advice, "stale");
  expect(yield* owner.advice.publish(advice, ownerUnit)).toEqual([]);
  expect((yield* owner.ticketUnits.stage(ownerUnit))?.stage).toBe("unavailable");
}));

it.effect("executes advice eligibility and revision against current retained identity", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  const eligible = owner.advice.eligible(advice, false);
  const revise = owner.advice.revise(advice, [], []);
  expect(advice.collectionEligible).toBe(false);
  expect(yield* eligible).toBe(true);
  expect(advice.collectionEligible).toBe(true);
  expect(advice.findings).toHaveLength(initial.findings.length);
  expect(yield* revise).toBe(true);
  expect(advice.findings).toEqual([]);
  owner.advice.remove(advice, "stale");
  expect(yield* eligible).toBe(false);
  expect(yield* revise).toBe(false);
}));

const defectMessage = <A>(effect: Effect.Effect<A>) => Effect.gen(function* () {
  const exit = yield* Effect.exit(effect);
  return exit._tag === "Failure" ? Cause.pretty(exit.cause) : "no defect";
});

it.effect("defers advice retention and snapshots source payloads at execution", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const pendingFindings = [...initial.findings];
  const insert = owner.advice.insert({ ...initial, findings: pendingFindings });
  expect(owner.advice.values()).toEqual([]);
  pendingFindings.length = 0;
  const retained = yield* insert;
  expect(retained.findings).toEqual([]);
  pendingFindings.push(finding);
  expect(retained.findings).toEqual([]);
  expect(owner.advice.values()).toEqual([retained]);
}));


it.effect("arbitrates competing collectors only when lease Effects execute", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  yield* owner.advice.eligible(advice, false);
  const attempts = Array.from({ length: 16 }, (_, index) => owner.advice.reserveLease(advice, `collector-${index}`));
  expect(advice.delivery).toBeUndefined();
  const results = yield* Effect.all(attempts, { concurrency: 16 });
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(owner.canonicalProjection().collection.leases).toHaveLength(1);
}));

it.effect("validates delivery token when a deferred update executes", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  yield* owner.advice.eligible(advice, false);
  yield* owner.advice.reserveLease(advice, "old");
  const update = owner.advice.updateDelivery(advice, "old", { acknowledged: true });
  expect(advice.delivery?.acknowledged).toBe(false);
  yield* owner.advice.releaseLease(advice, "old");
  yield* owner.advice.reserveLease(advice, "new");
  expect(yield* update).toBe(false);
  expect(advice.delivery?.token).toBe("new");
  expect(advice.delivery?.acknowledged).toBe(false);
}));


it.effect("checks expiry against the lease retained at execution", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  yield* owner.advice.eligible(advice, false);
  yield* owner.advice.reserveLease(advice, "collector");
  yield* owner.advice.updateDelivery(advice, "collector", { leaseUntil: 10 });
  const check = owner.advice.checkLease(advice, 10, false, false, false);
  expect(advice.delivery).toBeDefined();
  yield* owner.advice.updateDelivery(advice, "collector", { leaseUntil: 20 });
  yield* check;
  expect(advice.delivery).toBeDefined();
  yield* owner.advice.checkLease(advice, 20, false, false, false);
  expect(advice.delivery).toBeUndefined();
  expect(owner.canonicalProjection().collection.leases).toEqual([]);
}));

it.effect("releases only the lease owned at execution", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  yield* owner.advice.eligible(advice, false);
  yield* owner.advice.reserveLease(advice, "old");
  const release = owner.advice.releaseLease(advice, "old");
  expect(advice.delivery?.token).toBe("old");
  expect(yield* release).toBe(true);
  yield* owner.advice.reserveLease(advice, "new");
  expect(yield* release).toBe(false);
  expect(advice.delivery?.token).toBe("new");
  expect(yield* owner.advice.releaseLease(advice, "new")).toBe(true);
  expect(owner.canonicalProjection().collection.leases).toEqual([]);
}));
