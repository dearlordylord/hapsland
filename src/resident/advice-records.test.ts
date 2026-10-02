import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Cause, Effect } from "effect";
import { makeResidentState } from "./capacity.ts";
import { freezeInput, freezeRules, semanticIdentity, type PreparedUnit, type DirectObservation } from "../direct-event/model.ts";
import { TYPE_INPUT_CONTRACT } from "../rules/targets.ts";
import { advicee } from "../direct-event/test-fixtures.ts";
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
  const generation = (yield* owner.delivery().admitEdit("agent", "edit", 0));
  if (generation === undefined) throw new Error("fixture edit refused");
  const round = (yield* owner.rounds.bind("agent", generation, { root: observation.root, advicee: observation.advicee, activityPath: undefined }, "cohort"));
  const admissionId = (yield* owner.admitObservation("agent"));
  (yield* owner.observation("agent", admissionId, "startObservation", round.canonicalRound));
  const preparation = (yield* owner.beginObservedPreparation("agent", admissionId, 100, round.canonicalRound));
  if (preparation === undefined) throw new Error("fixture preparation refused");
  const [unit] = (yield* owner.completePreparation("agent", preparation.operation, preparation.reservation, [100], round.canonicalRound));
  if (unit === undefined) throw new Error("fixture unit refused");
  expect((yield* owner.observeReview("agent", unit.operation, unit.reservation, "finding", true, round.canonicalRound))).toBe("retainFinding");
  (yield* owner.observation("agent", admissionId, "completeObservation", round.canonicalRound));
  const revision = (yield* owner.revision.register("agent", prepared, true, "revision")).revision;
  const initial: AdviceInitial = {
    id: "advice", canonicalRound: round.canonicalRound, round, workUnitId: unit.operation, admissionId,
    canonicalOperationId: unit.operation, observation, partition: "agent", reservation: unit.reservation,
    prepared, revision, evaluationKey: "key", evaluations: [{ prepared, findings: [finding] }], findings: [finding], sequence: 1,
    analyticsPath: undefined, analyticsEnabled: false, analyticsControlled: false, credentialGeneration: null, credentialStatePath: null, credentialRequired: false, credentialEnvironmentOnly: false, pendingAt: 0,
  };
  return { owner, initial };
});

it.effect("owns frozen advice content and leases together with canonical state", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  expect(Object.isFrozen(advice)).toBe(true);
  expect(Object.isFrozen((yield* owner.advice.current(advice)).findings)).toBe(true);
  expect(Object.isFrozen((yield* owner.advice.current(advice)).evaluations[0])).toBe(true);
  expect(Reflect.set(advice, "findings", [])).toBe(false);
  expect(yield* owner.advice.eligible(advice, false)).toBe(true);
  expect((yield* owner.advice.current(advice)).collectionEligible).toBe(true);
  expect(yield* owner.advice.reserveLease(advice, "collector")).toBe(true);
  const first = (yield* owner.advice.current(advice)).delivery;
  expect(Object.isFrozen(first)).toBe(true);
  expect((yield* owner.canonicalProjection()).collection.leases).toEqual([{ advice: initial.canonicalOperationId, owner: yield* owner.collectionTokenId("collector") }]);
  expect(yield* owner.advice.updateDelivery(advice, "wrong", { acknowledged: true })).toBe(false);
  expect(yield* owner.advice.updateDelivery(advice, "collector", { findings: [finding], leaseUntil: 10, acknowledged: true })).toBe(true);
  expect((yield* owner.advice.current(advice)).delivery?.acknowledged).toBe(true);
  expect(first?.acknowledged).toBe(false);
  yield* owner.advice.checkLease(advice, 10, false, false, false);
  expect((yield* owner.advice.current(advice)).delivery).toBeUndefined();
  expect((yield* owner.canonicalProjection()).collection.leases).toEqual([]);
}));

it.effect("rolls back retention and lease updates when native payload snapshotting fails", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const before = (yield* owner.canonicalProjection());
  const invalid = { ...finding, get message(): string { throw new Error("snapshot failed"); } };
  expect(yield* defectMessage(owner.advice.insert({ ...initial, findings: [finding, invalid] }))).toContain("snapshot failed");
  expect((yield* owner.canonicalProjection())).toEqual(before);
  expect((yield* owner.advice.values())).toEqual([]);
  const advice = yield* owner.advice.insert(initial);
  yield* owner.advice.eligible(advice, false);
  yield* owner.advice.reserveLease(advice, "collector");
  const leased = (yield* owner.canonicalProjection());
  const delivery = (yield* owner.advice.current(advice)).delivery;
  expect(yield* defectMessage(owner.advice.updateDelivery(advice, "collector", { findings: [finding, invalid] }))).toContain("snapshot failed");
  expect((yield* owner.canonicalProjection())).toEqual(leased);
  expect((yield* owner.advice.current(advice)).delivery).toBe(delivery);
}));

it.effect("retires advice and leases while retaining active capture workspace", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  yield* owner.advice.eligible(advice, false);
  yield* owner.advice.reserveLease(advice, "collector");
  const capture = yield* owner.adviceCaptures.start(advice.reservation, advice.revision, 200);
  if (capture === undefined) throw new Error("capture refused");
  expect(yield* owner.advice.remove(advice, "stale", "wrong")).toBe(false);
  expect(yield* owner.advice.remove(advice, "stale", "collector")).toBe(true);
  expect((yield* owner.advice.values())).toEqual([]);
  expect((yield* owner.advice.current(advice)).delivery).toBeUndefined();
  expect((yield* owner.canonicalProjection()).collection.leases).toEqual([]);
  expect((yield* owner.snapshot()).bytes).toBe(300);
  expect(yield* owner.revision.count()).toBe(1);
  expect(yield* owner.adviceCaptures.finish(capture)).toBe("retired");
  expect((yield* owner.snapshot()).items).toBe(0);
  expect(yield* owner.revision.count()).toBe(0);
  expect(yield* owner.advice.revise(advice, [], [])).toBe(false);
  expect(yield* owner.advice.remove(advice, "stale")).toBe(false);
}));

it.effect("fences a stale capability after the owner clears and advice identity is reused", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  yield* owner.clear();
  const next = yield* fixture(owner);
  const replacement = yield* owner.advice.insert(next.initial);
  expect(yield* owner.advice.revise(advice, [], [])).toBe(false);
  expect(yield* owner.advice.eligible(advice, false)).toBe(false);
  expect(yield* owner.advice.remove(advice, "stale")).toBe(false);
  expect((yield* owner.advice.values())).toEqual([replacement]);
  expect((yield* owner.snapshot()).bytes).toBe(100);
}));


it.effect("rejects native retention without canonical finding authority", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const before = (yield* owner.canonicalProjection());
  expect(yield* defectMessage(owner.advice.insert({ ...initial, canonicalOperationId: 999 }))).toContain("canonical finding owner");
  expect((yield* owner.canonicalProjection())).toEqual(before);
  expect((yield* owner.advice.values())).toEqual([]);
}));

it.effect("rolls back advice retirement when authorized Stop output prevents submission cleanup", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  yield* owner.advice.eligible(advice, false);
  yield* owner.advice.reserveLease(advice, "collector");
  const delivery = owner.delivery();
  expect((yield* delivery.beginStop(advice.partition, "stop"))).toBe(true);
  (yield* delivery.finishGate(advice.partition, "stop", 0, true));
  expect((yield* delivery.reserveFinishOutput(advice.partition, "stop", "collector", [{ id: advice.id, unit: advice.canonicalOperationId, findings: [finding] }], 1))).toBe(true);
  expect((yield* delivery.authorizeFinishOutput(advice.partition, "collector"))).toBe(true);
  const before = (yield* owner.canonicalProjection());
  expect(yield* defectMessage(owner.advice.remove(advice, "stale", "collector"))).toContain("canonical submission forget refused");
  expect((yield* owner.canonicalProjection())).toEqual(before);
  expect((yield* owner.advice.values())).toEqual([advice]);
  expect((yield* owner.snapshot()).bytes).toBe(100);
  expect((yield* owner.advice.current(advice)).delivery?.token).toBe("collector");
}));


it.effect("publishes the owner result and independent joined subscribers together", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const joined = owner.joinedReviews(() => 1);
  yield* joined.append({ admission: initial.admissionId, evaluationKey: initial.evaluationKey,
    observation, activityPath: undefined, revision: initial.revision });
  const advice = yield* owner.advice.insert(initial);
  const publish = owner.advice.publish(advice);
  expect(yield* joined.hasAdmission(initial.admissionId)).toBe(true);
  const batches = yield* Effect.all(Array.from({ length: 16 }, () => publish), { concurrency: 16 });
  expect(batches.filter((batch) => batch.length > 0)).toHaveLength(1);
  const outcomes = batches.flat();
  expect(outcomes.map(({ stage }) => stage)).toEqual(["findings"]);
  expect(yield* joined.hasAdmission(initial.admissionId)).toBe(false);
  yield* owner.advice.remove(advice, "stale");
  expect(yield* owner.advice.publish(advice)).toEqual([]);
}));

it.effect("executes advice eligibility and revision against current retained identity", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  const eligible = owner.advice.eligible(advice, false);
  const revise = owner.advice.revise(advice, [], []);
  expect((yield* owner.advice.current(advice)).collectionEligible).toBe(false);
  expect(yield* eligible).toBe(true);
  expect((yield* owner.advice.current(advice)).collectionEligible).toBe(true);
  expect((yield* owner.advice.current(advice)).findings).toHaveLength(initial.findings.length);
  expect(yield* revise).toBe(true);
  expect((yield* owner.advice.current(advice)).findings).toEqual([]);
  yield* owner.advice.remove(advice, "stale");
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
  expect((yield* owner.advice.values())).toEqual([]);
  pendingFindings.length = 0;
  const retained = yield* insert;
  expect((yield* owner.advice.current(retained)).findings).toEqual([]);
  pendingFindings.push(finding);
  expect((yield* owner.advice.current(retained)).findings).toEqual([]);
  expect((yield* owner.advice.values())).toEqual([retained]);
}));


it.effect("arbitrates competing collectors only when lease Effects execute", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  yield* owner.advice.eligible(advice, false);
  const attempts = Array.from({ length: 16 }, (_, index) => owner.advice.reserveLease(advice, `collector-${index}`));
  expect((yield* owner.advice.current(advice)).delivery).toBeUndefined();
  const results = yield* Effect.all(attempts, { concurrency: 16 });
  expect(results.filter(Boolean)).toHaveLength(1);
  expect((yield* owner.canonicalProjection()).collection.leases).toHaveLength(1);
}));

it.effect("validates delivery token when a deferred update executes", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  yield* owner.advice.eligible(advice, false);
  yield* owner.advice.reserveLease(advice, "old");
  const update = owner.advice.updateDelivery(advice, "old", { acknowledged: true });
  expect((yield* owner.advice.current(advice)).delivery?.acknowledged).toBe(false);
  yield* owner.advice.releaseLease(advice, "old");
  yield* owner.advice.reserveLease(advice, "new");
  expect(yield* update).toBe(false);
  expect((yield* owner.advice.current(advice)).delivery?.token).toBe("new");
  expect((yield* owner.advice.current(advice)).delivery?.acknowledged).toBe(false);
}));


it.effect("checks expiry against the lease retained at execution", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  yield* owner.advice.eligible(advice, false);
  yield* owner.advice.reserveLease(advice, "collector");
  yield* owner.advice.updateDelivery(advice, "collector", { leaseUntil: 10 });
  const check = owner.advice.checkLease(advice, 10, false, false, false);
  expect((yield* owner.advice.current(advice)).delivery).toBeDefined();
  yield* owner.advice.updateDelivery(advice, "collector", { leaseUntil: 20 });
  yield* check;
  expect((yield* owner.advice.current(advice)).delivery).toBeDefined();
  yield* owner.advice.checkLease(advice, 20, false, false, false);
  expect((yield* owner.advice.current(advice)).delivery).toBeUndefined();
  expect((yield* owner.canonicalProjection()).collection.leases).toEqual([]);
}));

it.effect("releases only the lease owned at execution", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  yield* owner.advice.eligible(advice, false);
  yield* owner.advice.reserveLease(advice, "old");
  const release = owner.advice.releaseLease(advice, "old");
  expect((yield* owner.advice.current(advice)).delivery?.token).toBe("old");
  expect(yield* release).toBe(true);
  yield* owner.advice.reserveLease(advice, "new");
  expect(yield* release).toBe(false);
  expect((yield* owner.advice.current(advice)).delivery?.token).toBe("new");
  expect(yield* owner.advice.releaseLease(advice, "new")).toBe(true);
  expect((yield* owner.canonicalProjection()).collection.leases).toEqual([]);
}));


it.effect("retires advice once across competing deferred removals", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  const remove = owner.advice.remove(advice, "stale");
  expect((yield* owner.advice.values())).toEqual([advice]);
  const results = yield* Effect.all(Array.from({ length: 16 }, () => remove), { concurrency: 16 });
  expect(results.filter(Boolean)).toHaveLength(1);
  expect((yield* owner.advice.values())).toEqual([]);
  expect(yield* owner.revision.count()).toBe(0);
  expect((yield* owner.snapshot()).items).toBe(0);
}));


it.effect("reads immutable advice snapshots at execution and fences copied capabilities", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const advice = yield* owner.advice.insert(initial);
  const read = owner.advice.current(advice);
  const before = yield* read;
  expect(Object.isFrozen(before)).toBe(true);
  expect(before.collectionEligible).toBe(false);
  yield* owner.advice.eligible(advice, false);
  expect((yield* read).collectionEligible).toBe(true);
  expect(before.collectionEligible).toBe(false);
  expect((yield* owner.advice.current({ ...advice })).findings).toEqual([]);
  yield* owner.advice.remove(advice, "stale");
  expect((yield* read).findings).toEqual([]);
  expect(before.findings).toEqual(initial.findings);
}));

it.effect("keeps batch snapshots stable across advice updates and retirement", () => Effect.gen(function* () {
  const { owner, initial } = yield* fixture();
  const snapshots = owner.advice.snapshots();
  expect(yield* snapshots).toEqual([]);
  const advice = yield* owner.advice.insert(initial);
  const before = yield* snapshots;
  expect(Object.isFrozen(before)).toBe(true);
  expect(Object.isFrozen(before[0])).toBe(true);
  expect(before[0]?.capability).toBe(advice);
  yield* owner.advice.eligible(advice, false);
  expect(before[0]?.content.collectionEligible).toBe(false);
  expect((yield* snapshots)[0]?.content.collectionEligible).toBe(true);
  yield* owner.advice.remove(advice, "stale");
  expect(yield* snapshots).toEqual([]);
  expect(before[0]?.content.findings).toEqual(initial.findings);
}));
