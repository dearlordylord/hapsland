import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Effect } from "effect";
import { makeResidentState } from "./capacity.ts";
import { residentTicketInput } from "../test-support/resident-ticket.ts";

it.effect("owns an immutable ticket snapshot and rolls back rejected nonce admission", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const input = residentTicketInput(owner.residentLifetime, "first");
  const first = owner.tickets.open(input);
  Reflect.set(input.ticket, "nonce", "changed");
  expect(first.ticket.nonce).toBe("first");
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(first.ticket)).toBe(true);
  const before = owner.canonicalProjection();
  expect(() => owner.tickets.open(residentTicketInput(owner.residentLifetime, "first"))).toThrow("identity refused");
  expect(owner.canonicalProjection()).toEqual(before);
  const second = owner.tickets.open(residentTicketInput(owner.residentLifetime, "second"));
  expect(second.generation).toBe(first.generation + 1);
  expect(owner.tickets.get("first")).toBe(first);
}));

it.effect("rolls back canonical opening and identity allocation if native construction fails", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const input = residentTicketInput(owner.residentLifetime);
  const before = owner.canonicalProjection();
  expect(() => owner.tickets.open({ ...input, get root(): string { throw new Error("fixture construction failure"); } })).toThrow("construction failure");
  expect(owner.canonicalProjection()).toEqual(before);
  expect(owner.tickets.get("ticket")).toBeUndefined();
  expect(owner.tickets.open(input).generation).toBe(1);
}));

it.effect("evicts the oldest canonical ticket and its native unit bindings together", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const first = owner.tickets.open(residentTicketInput(owner.residentLifetime, "first"));
  const firstUnit = owner.ticketUnits.add(first);
  const second = owner.tickets.open(residentTicketInput(owner.residentLifetime, "second"));
  const secondUnit = owner.ticketUnits.add(second);
  owner.tickets.retain(1);
  expect(owner.tickets.get("first")).toBeUndefined();
  expect(firstUnit.stage()).toBeUndefined();
  expect(owner.ticketUnits.values()).toEqual([secondUnit]);
  expect(owner.canonicalProjection().tickets.map((ticket) => ticket.id)).toEqual([second.generation]);
  owner.tickets.retain(0);
  expect(owner.ticketUnits.values()).toEqual([]);
  expect(owner.canonicalProjection().tickets).toEqual([]);
}));

it.effect("retires only the selected partition and fences stale ticket capabilities after clear", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const first = owner.tickets.open(residentTicketInput(owner.residentLifetime, "first", "a"));
  const independent = owner.tickets.open(residentTicketInput(owner.residentLifetime, "independent", "b"));
  const independentUnit = owner.ticketUnits.add(independent);
  owner.tickets.discardPartition("a");
  expect(owner.tickets.get("first")).toBeUndefined();
  expect(owner.tickets.get("independent")).toBe(independent);
  expect(independentUnit.stage()?.stage).toBe("pending");
  owner.clear();
  const replacement = owner.tickets.open(residentTicketInput(owner.residentLifetime, "first", "a"));
  expect(replacement.generation).toBe(first.generation);
  expect(owner.tickets.forget(first)).toBe(false);
  expect(owner.tickets.get("first")).toBe(replacement);
  expect(() => owner.ticketUnits.add(first)).toThrow("ticket capability");
}));
