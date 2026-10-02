import { residentTicketInput } from "../test-support/resident-ticket.ts";
import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Cause, Effect, Exit } from "effect";
import { makeResidentState } from "./capacity.ts";

const revision = Object.freeze({ subject: "fixture", token: "revision-token", generation: 1 });

const defectMessage = <A>(effect: Effect.Effect<A>) => Effect.gen(function* () {
  const exit = yield* Effect.exit(effect);
  if (Exit.isSuccess(exit)) throw new Error("expected a resident invariant defect");
  return Cause.pretty(exit.cause);
});

it.effect("admits concurrent units with distinct identities and selectively marks delivered advice", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const ticket = yield* owner.tickets.open(residentTicketInput(owner.residentLifetime));
  const units = yield* Effect.all(Array.from({ length: 16 }, () => owner.ticketUnits.add(ticket)),
    { concurrency: "unbounded" });
  expect(new Set(units.map((unit) => unit.id)).size).toBe(16);
  expect(yield* owner.ticketUnits.values()).toEqual(units);
  const progressed = yield* Effect.all(units.map((unit, index) => owner.ticketUnits.step(unit,
    "findingResult", "lost", { revision, adviceId: index < 8 ? "delivered" : "other" })),
  { concurrency: "unbounded" });
  expect(progressed.every(Boolean)).toBe(true);
  yield* Effect.all(Array.from({ length: 8 }, () => owner.ticketUnits.markAdviceDelivered("delivered")),
    { concurrency: "unbounded" });
  const stages = yield* Effect.all(units.map((unit) => owner.ticketUnits.stage(unit)));
  expect(stages.slice(0, 8).every((stage) => stage?.stage === "finding" && stage.delivered)).toBe(true);
  expect(stages.slice(8).every((stage) => stage?.stage === "finding" && !stage.delivered)).toBe(true);
  yield* Effect.all(units.slice(8).map((unit) => owner.ticketUnits.fail(unit, "stale")),
    { concurrency: "unbounded" });
  expect((yield* Effect.all(units.slice(8).map((unit) => owner.ticketUnits.current(unit))))
    .every((current) => current.revision === undefined && current.adviceId === undefined)).toBe(true);
}));

it.effect("reads metadata when the Effect runs and fences copied capabilities", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const ticket = yield* owner.tickets.open(residentTicketInput(owner.residentLifetime));
  const unit = yield* owner.ticketUnits.add(ticket);
  const readCurrent = owner.ticketUnits.current(unit);
  const before = yield* readCurrent;
  yield* owner.ticketUnits.clear(unit, revision);
  expect(yield* readCurrent).toEqual({ revision });
  expect(before).toEqual({});
  expect(Object.isFrozen(before)).toBe(true);
  expect(yield* owner.ticketUnits.current({ ...unit })).toEqual({});
  expect(yield* owner.ticketUnits.stage({ ...unit })).toBeUndefined();
  expect(yield* owner.ticketUnits.step({ ...unit }, "failUnit", "lost", {})).toBe(false);
  expect((yield* owner.ticketUnits.stage(unit))?.stage).toBe("clear");
}));

it.effect("publishes canonical unit progress and immutable native metadata together", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const unit = (yield* owner.ticketUnits.add(ticket));
  expect(Object.isFrozen(unit)).toBe(true);
  expect((yield* owner.ticketUnits.stage(unit))?.stage).toBe("pending");
  expect((yield* owner.ticketUnits.step(unit, "findingResult", "lost", { revision, adviceId: "advice" }))).toBe(true);
  expect((yield* owner.ticketUnits.stage(unit))?.stage).toBe("finding");
  expect((yield* owner.ticketUnits.current(unit))).toEqual({ revision, adviceId: "advice" });
  expect(Object.isFrozen((yield* owner.ticketUnits.current(unit)))).toBe(true);
  expect((yield* owner.ticketUnits.step(unit, "markDelivered"))).toBe(true);
  expect((yield* owner.ticketUnits.stage(unit))?.delivered).toBe(true);
  expect((yield* owner.ticketUnits.current(unit)).adviceId).toBe("advice");
}));

it.effect("rolls back canonical progress when native metadata fails validation", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const unit = (yield* owner.ticketUnits.add(ticket));
  const before = owner.canonicalProjection();
  expect(yield* defectMessage(owner.ticketUnits.step(unit, "findingResult", "lost", { revision }))).toContain("native ticket unit metadata");
  expect(owner.canonicalProjection()).toEqual(before);
  expect((yield* owner.ticketUnits.current(unit))).toEqual({});
  expect((yield* owner.ticketUnits.stage(unit))?.stage).toBe("pending");
  expect((yield* owner.ticketUnits.step(unit, "findingResult", "lost", { revision, adviceId: "advice" }))).toBe(true);
}));

it.effect("does not consume a native unit identity when its parent capability is rejected", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const foreign = { ...residentTicketInput(owner.residentLifetime), generation: 99 };
  expect(yield* defectMessage(owner.ticketUnits.add(foreign))).toContain("ticket capability");
  expect((yield* owner.ticketUnits.values())).toEqual([]);
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  expect((yield* owner.ticketUnits.add(ticket)).id).toBe(1);
}));

it.effect("fences forgotten and cleared capabilities when numeric unit identities are reused", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const old = (yield* owner.ticketUnits.add(ticket));
  (yield* owner.ticketUnits.step(old, "clearResult", "lost", { revision }));
  (yield* owner.tickets.forget(ticket));
  expect((yield* owner.ticketUnits.current(old))).toEqual({});
  expect((yield* owner.ticketUnits.stage(old))).toBeUndefined();
  expect((yield* owner.ticketUnits.step(old, "failUnit", "lost", {}))).toBe(false);
  yield* owner.clear();
  const replacementTicket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const replacement = (yield* owner.ticketUnits.add(replacementTicket));
  expect(replacement.id).toBe(old.id);
  expect(yield* defectMessage(owner.ticketUnits.add(ticket))).toContain("ticket capability");
  expect((yield* owner.ticketUnits.step(old, "findingResult", "lost", { revision, adviceId: "stale" }))).toBe(false);
  expect((yield* owner.ticketUnits.stage(replacement))?.stage).toBe("pending");
  expect((yield* owner.ticketUnits.current(replacement))).toEqual({});
}));
