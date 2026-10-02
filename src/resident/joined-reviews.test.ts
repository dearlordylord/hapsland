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
  expect(reuse.claim("key")).toBe(true);
  joined.append({ admission: 1, evaluationKey: "key", observation, activityPath: undefined, ticketUnit: first });
  joined.append({ admission: 2, evaluationKey: "key", observation, activityPath: undefined, ticketUnit: second });
  const pending = Object.freeze({ id: 1 });
  expect(joined.attachOwner("key", pending, revision)).toBe(true);
  expect(reuse.pending("key")).toBe(pending);
  expect((yield* owner.ticketUnits.current(first)).revision).toBe(revision);
  expect((yield* owner.ticketUnits.current(second)).revision).toBe(revision);
  const outcomes = joined.settle("key", "finding", undefined, "advice");
  expect(outcomes.map((outcome) => outcome.stage)).toEqual(["findings", "findings"]);
  expect(outcomes.map((outcome) => Object.keys(outcome.review.observation))).toEqual([["root", "advicee"], ["root", "advicee"]]);
  expect(Object.isFrozen(outcomes[0]?.review)).toBe(true);
  expect(Object.isFrozen(outcomes[0]?.review.observation)).toBe(true);
  expect((yield* owner.ticketUnits.current(first)).adviceId).toBe("advice");
  expect((yield* owner.ticketUnits.current(second)).adviceId).toBe("advice");
  expect(joined.hasAdmission(1)).toBe(false);
  expect(joined.hasAdmission(2)).toBe(false);
  expect(joined.settle("key", "finding", undefined, "advice")).toEqual([]);
}));

it.effect("releases unbound subscribers with the claim while retaining attached subscribers", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const reuse = owner.reuse(measure);
  const joined = owner.joinedReviews(measure);
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const unbound = (yield* owner.ticketUnits.add(ticket));
  const attached = (yield* owner.ticketUnits.add(ticket));
  reuse.claim("key");
  joined.append({ admission: 1, evaluationKey: "key", observation, activityPath: undefined, ticketUnit: unbound });
  joined.append({ admission: 2, evaluationKey: "key", observation, activityPath: undefined, ticketUnit: attached, revision });
  expect(joined.releaseOwner("key", "backend").map((review) => review.admission)).toEqual([1]);
  expect(reuse.hasPending("key")).toBe(false);
  expect((yield* owner.ticketUnits.stage(unbound))).toMatchObject({ stage: "unavailable", reason: "backend" });
  expect(joined.hasAdmission(1)).toBe(false);
  expect(joined.hasAdmission(2)).toBe(true);
  expect(joined.settle("key", "clear").map((outcome) => outcome.stage)).toEqual(["clear"]);
  expect((yield* owner.ticketUnits.stage(attached))?.stage).toBe("clear");
}));

it.effect("rolls back unit attachment when native subscriber construction fails", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const joined = owner.joinedReviews(measure);
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const unit = (yield* owner.ticketUnits.add(ticket));
  const before = owner.canonicalProjection();
  expect(() => joined.append({ admission: 1, evaluationKey: "key", activityPath: undefined, ticketUnit: unit, revision,
    observation: { get root(): string { throw new Error("fixture subscriber construction failed"); }, advicee: advicee() },
  })).toThrow("subscriber construction failed");
  expect(owner.canonicalProjection()).toEqual(before);
  expect((yield* owner.ticketUnits.current(unit))).toEqual({});
  expect(joined.hasAdmission(1)).toBe(false);
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
  joined.append({ admission: 1, evaluationKey: "key", observation, activityPath: undefined, revision });
  expect(second.joinedReviews(measure).hasAdmission(1)).toBe(false);
  first.clear();
  expect(joined.hasAdmission(1)).toBe(false);
  expect(joined.settle("key", "clear")).toEqual([]);
}));

it.effect("rolls back owner and subscriber attachment together when the native claim is invalid", () => Effect.gen(function* () {
  const owner = yield* makeResidentState<number | undefined>();
  const reuse = owner.reuse(measure);
  const joined = owner.joinedReviews(measure);
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const unit = (yield* owner.ticketUnits.add(ticket));
  reuse.claim("key");
  joined.append({ admission: 1, evaluationKey: "key", observation, activityPath: undefined, ticketUnit: unit });
  const before = owner.canonicalProjection();
  expect(() => joined.attachOwner("key", undefined, revision)).toThrow("native evaluation handles");
  expect(owner.canonicalProjection()).toEqual(before);
  expect((yield* owner.ticketUnits.current(unit))).toEqual({});
  expect(reuse.hasPending("key")).toBe(true);
  expect(joined.releaseOwner("key", "lost").map((review) => review.admission)).toEqual([1]);
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
  reuse.claim("first");
  reuse.claim("independent");
  joined.append({ admission: 1, evaluationKey: "first", observation, activityPath: undefined, ticketUnit: oldUnit });
  joined.append({ admission: 2, evaluationKey: "independent", observation, activityPath: undefined, ticketUnit: independentUnit });
  joined.attachOwner("first", { token: "first" }, old);
  joined.attachOwner("independent", { token: "independent" }, independent);
  yield* owner.revision.register("a", prepare("type Count = string"), true, "replacement");
  expect(joined.retireSuperseded(old.subject).map((review) => review.admission)).toEqual([1]);
  expect((yield* owner.ticketUnits.stage(oldUnit))).toMatchObject({ stage: "unavailable", reason: "stale" });
  expect(joined.hasAdmission(1)).toBe(false);
  expect(joined.hasAdmission(2)).toBe(true);
  expect((yield* owner.ticketUnits.stage(independentUnit))?.stage).toBe("pending");
}));
