import { residentTicketInput } from "../test-support/resident-ticket.ts";
import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Effect } from "effect";
import { makeResidentState } from "./capacity.ts";

const revision = Object.freeze({ subject: "fixture", token: "revision-token", generation: 1 });

it.effect("publishes canonical unit progress and immutable native metadata together", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const unit = owner.ticketUnits.add(ticket);
  expect(Object.isFrozen(unit)).toBe(true);
  expect(unit.stage()?.stage).toBe("pending");
  expect(unit.step("findingResult", "lost", { revision, adviceId: "advice" })).toBe(true);
  expect(unit.stage()?.stage).toBe("finding");
  expect(unit.current).toEqual({ revision, adviceId: "advice" });
  expect(Object.isFrozen(unit.current)).toBe(true);
  expect(unit.step("markDelivered")).toBe(true);
  expect(unit.stage()?.delivered).toBe(true);
  expect(unit.current.adviceId).toBe("advice");
}));

it.effect("rolls back canonical progress when native metadata fails validation", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const unit = owner.ticketUnits.add(ticket);
  const before = owner.canonicalProjection();
  expect(() => unit.step("findingResult", "lost", { revision })).toThrow("native ticket unit metadata");
  expect(owner.canonicalProjection()).toEqual(before);
  expect(unit.current).toEqual({});
  expect(unit.stage()?.stage).toBe("pending");
  expect(unit.step("findingResult", "lost", { revision, adviceId: "advice" })).toBe(true);
}));

it.effect("does not consume a native unit identity when its parent capability is rejected", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const foreign = { ...residentTicketInput(owner.residentLifetime), generation: 99 };
  expect(() => owner.ticketUnits.add(foreign)).toThrow("ticket capability");
  expect(owner.ticketUnits.values()).toEqual([]);
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  expect(owner.ticketUnits.add(ticket).id).toBe(1);
}));

it.effect("fences forgotten and cleared capabilities when numeric unit identities are reused", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const old = owner.ticketUnits.add(ticket);
  old.step("clearResult", "lost", { revision });
  (yield* owner.tickets.forget(ticket));
  expect(old.current).toEqual({});
  expect(old.stage()).toBeUndefined();
  expect(old.step("failUnit", "lost", {})).toBe(false);
  owner.clear();
  const replacementTicket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const replacement = owner.ticketUnits.add(replacementTicket);
  expect(replacement.id).toBe(old.id);
  expect(() => owner.ticketUnits.add(ticket)).toThrow("ticket capability");
  expect(old.step("findingResult", "lost", { revision, adviceId: "stale" })).toBe(false);
  expect(replacement.stage()?.stage).toBe("pending");
  expect(replacement.current).toEqual({});
}));
