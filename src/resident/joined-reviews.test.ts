import { freezeInput, freezeRules, semanticIdentity, type PreparedUnit, type TypeDeclaration } from "../direct-event/model.ts";
import { TYPE_INPUT_CONTRACT } from "../rules/targets.ts";
import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Cause, Effect } from "effect";
import { makeResidentState } from "./capacity.ts";
import { residentTicketInput } from "../test-support/resident-ticket.ts";
import { advicee } from "../direct-event/test-fixtures.ts";

const measure = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const revision = Object.freeze({ subject: "fixture", token: "revision", generation: 1 });
const observation = { root: "/fixture", advicee: advicee(), candidates: [{ source: "source must not be retained by a joined subscriber" }] };

it.effect("attaches one owner and independently settles all joining ticket units", () => Effect.gen(function* () {
  const owner = yield* makeResidentState<{ readonly id: number }>();
  const reuse = owner.reuse(measure);
  const joined = owner.joinedReviews(measure);
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const first = (yield* owner.ticketUnits.add(ticket));
  const second = (yield* owner.ticketUnits.add(ticket));
  expect((yield* reuse.claim("key"))).toBe(true);
  yield* joined.append({ admission: 1, evaluationKey: "key", observation, activityPath: undefined, ticketUnit: first });
  yield* joined.append({ admission: 2, evaluationKey: "key", observation, activityPath: undefined, ticketUnit: second });
  const pending = Object.freeze({ id: 1 });
  expect(yield* joined.attachOwner("key", pending, revision)).toBe(true);
  expect((yield* reuse.pending("key"))).toBe(pending);
  expect((yield* owner.ticketUnits.current(first)).revision).toBe(revision);
  expect((yield* owner.ticketUnits.current(second)).revision).toBe(revision);
  const outcomes = yield* joined.settle("key", "finding", undefined, "advice");
  expect(outcomes.map((outcome) => outcome.stage)).toEqual(["findings", "findings"]);
  expect(outcomes.map((outcome) => Object.keys(outcome.review.observation))).toEqual([["root", "advicee"], ["root", "advicee"]]);
  expect(Object.isFrozen(outcomes[0]?.review)).toBe(true);
  expect(Object.isFrozen(outcomes[0]?.review.observation)).toBe(true);
  expect((yield* owner.ticketUnits.current(first)).adviceId).toBe("advice");
  expect((yield* owner.ticketUnits.current(second)).adviceId).toBe("advice");
  expect(yield* joined.hasAdmission(1)).toBe(false);
  expect(yield* joined.hasAdmission(2)).toBe(false);
  expect(yield* joined.settle("key", "finding", undefined, "advice")).toEqual([]);
}));

it.effect("releases unbound subscribers with the claim while retaining attached subscribers", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const reuse = owner.reuse(measure);
  const joined = owner.joinedReviews(measure);
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const unbound = (yield* owner.ticketUnits.add(ticket));
  const attached = (yield* owner.ticketUnits.add(ticket));
  (yield* reuse.claim("key"));
  yield* joined.append({ admission: 1, evaluationKey: "key", observation, activityPath: undefined, ticketUnit: unbound });
  yield* joined.append({ admission: 2, evaluationKey: "key", observation, activityPath: undefined, ticketUnit: attached, revision });
  expect((yield* joined.releaseOwner("key", "backend")).map((review) => review.admission)).toEqual([1]);
  expect((yield* reuse.hasPending("key"))).toBe(false);
  expect((yield* owner.ticketUnits.stage(unbound))).toMatchObject({ stage: "unavailable", reason: "backend" });
  expect(yield* joined.hasAdmission(1)).toBe(false);
  expect(yield* joined.hasAdmission(2)).toBe(true);
  expect((yield* joined.settle("key", "clear")).map((outcome) => outcome.stage)).toEqual(["clear"]);
  expect((yield* owner.ticketUnits.stage(attached))?.stage).toBe("clear");
}));

it.effect("rolls back unit attachment when native subscriber construction fails", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const joined = owner.joinedReviews(measure);
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const unit = (yield* owner.ticketUnits.add(ticket));
  const before = owner.canonicalProjection();
  expect(yield* defectMessage(joined.append({ admission: 1, evaluationKey: "key", activityPath: undefined, ticketUnit: unit, revision,
    observation: { get root(): string { throw new Error("fixture subscriber construction failed"); }, advicee: advicee() },
  }))).toContain("subscriber construction failed");
  expect(owner.canonicalProjection()).toEqual(before);
  expect((yield* owner.ticketUnits.current(unit))).toEqual({});
  expect(yield* joined.hasAdmission(1)).toBe(false);
}));

it.effect("clears joined membership with its owner and keeps independent acquisitions isolated", () => Effect.gen(function* () {
  const recipe = makeResidentState();
  const first = yield* recipe;
  const second = yield* recipe;
  expect(second.residentLifetime).not.toBe(first.residentLifetime);
  const input = residentTicketInput(first.residentLifetime);
  (yield* first.tickets.open(input));
  const before = second.canonicalProjection();
  expect(yield* second.tickets.open(input).pipe(Effect.sandbox, Effect.flip, Effect.map(Cause.pretty))).toContain("ticket admission identity refused");
  expect(second.canonicalProjection()).toEqual(before);
  const joined = first.joinedReviews(measure);
  yield* joined.append({ admission: 1, evaluationKey: "key", observation, activityPath: undefined, revision });
  expect(yield* second.joinedReviews(measure).hasAdmission(1)).toBe(false);
  first.clear();
  expect(yield* joined.hasAdmission(1)).toBe(false);
  expect(yield* joined.settle("key", "clear")).toEqual([]);
}));

it.effect("rolls back owner and subscriber attachment together when the native claim is invalid", () => Effect.gen(function* () {
  const owner = yield* makeResidentState<number | undefined>();
  const reuse = owner.reuse(measure);
  const joined = owner.joinedReviews(measure);
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const unit = (yield* owner.ticketUnits.add(ticket));
  (yield* reuse.claim("key"));
  yield* joined.append({ admission: 1, evaluationKey: "key", observation, activityPath: undefined, ticketUnit: unit });
  const before = owner.canonicalProjection();
  expect(yield* defectMessage(joined.attachOwner("key", undefined, revision))).toContain("native evaluation handles");
  expect(owner.canonicalProjection()).toEqual(before);
  expect((yield* owner.ticketUnits.current(unit))).toEqual({});
  expect((yield* reuse.hasPending("key"))).toBe(true);
  expect((yield* joined.releaseOwner("key", "lost")).map((review) => review.admission)).toEqual([1]);
}));

it.effect("retires superseded subscribers without changing another subject's membership", () => Effect.gen(function* () {
  const prepare = (source: string): PreparedUnit => {
    const declaration: TypeDeclaration = { id: "type.ts::Count", kind: "type-alias", name: "Count", source, sourceHash: source };
    const input = freezeInput({ contract: TYPE_INPUT_CONTRACT, completeness: "complete", path: "type.ts", declaration,
      unit: { root: { artifact: declaration, references: [] } }, rules: freezeRules([]),
      interpretation: "probability-strictly-greater-than-threshold" });
    return { root: "/fixture", advicee: advicee(), input, identity: semanticIdentity(input) };
  };
  const owner = yield* makeResidentState<{ readonly token: string }>();
  const joined = owner.joinedReviews(measure);
  const reuse = owner.reuse(measure);
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const oldUnit = (yield* owner.ticketUnits.add(ticket));
  const independentUnit = (yield* owner.ticketUnits.add(ticket));
  const item = prepare("type Count = number");
  const old = (yield* owner.revision.register("a", item, true, "old")).revision;
  const independent = (yield* owner.revision.register("b", item, true, "independent")).revision;
  (yield* reuse.claim("first"));
  (yield* reuse.claim("independent"));
  yield* joined.append({ admission: 1, evaluationKey: "first", observation, activityPath: undefined, ticketUnit: oldUnit });
  yield* joined.append({ admission: 2, evaluationKey: "independent", observation, activityPath: undefined, ticketUnit: independentUnit });
  yield* joined.attachOwner("first", { token: "first" }, old);
  yield* joined.attachOwner("independent", { token: "independent" }, independent);
  yield* owner.revision.register("a", prepare("type Count = string"), true, "replacement");
  expect((yield* joined.retireSuperseded(old.subject)).map((review) => review.admission)).toEqual([1]);
  expect((yield* owner.ticketUnits.stage(oldUnit))).toMatchObject({ stage: "unavailable", reason: "stale" });
  expect(yield* joined.hasAdmission(1)).toBe(false);
  expect(yield* joined.hasAdmission(2)).toBe(true);
  expect((yield* owner.ticketUnits.stage(independentUnit))?.stage).toBe("pending");
}));


it.effect("reads joined admission membership at execution", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const joined = owner.joinedReviews(measure);
  const member = joined.hasAdmission(42);
  const append = joined.append({ admission: 42, evaluationKey: "deferred", observation, activityPath: undefined });
  expect(yield* member).toBe(false);
  yield* append;
  expect(yield* member).toBe(true);
  yield* joined.releaseOwner("deferred", "lost");
  expect(yield* member).toBe(false);
}));

const defectMessage = <A>(effect: Effect.Effect<A>) => Effect.gen(function* () {
  const exit = yield* Effect.exit(effect);
  return exit._tag === "Failure" ? Cause.pretty(exit.cause) : "no defect";
});

it.effect("settles competing joined batches once and defers release until execution", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const joined = owner.joinedReviews(measure);
  yield* Effect.all(Array.from({ length: 16 }, (_, admission) => joined.append({
    admission, evaluationKey: "batch", observation, activityPath: undefined,
  })), { concurrency: 16 });
  const batches = yield* Effect.all(Array.from({ length: 16 }, () => joined.settle("batch", "unavailable")), { concurrency: 16 });
  const outcomes = batches.flat();
  expect(outcomes).toHaveLength(16);
  expect(new Set(outcomes.map(({ review }) => review.admission)).size).toBe(16);
  expect(batches.filter((batch) => batch.length > 0)).toHaveLength(1);
  yield* joined.append({ admission: 42, evaluationKey: "release", observation, activityPath: undefined });
  const release = joined.releaseOwner("release", "lost");
  expect(yield* joined.hasAdmission(42)).toBe(true);
  expect((yield* release).map((review) => review.admission)).toEqual([42]);
  expect(yield* release).toEqual([]);
  expect(yield* joined.hasAdmission(42)).toBe(false);
}));
