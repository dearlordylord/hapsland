import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Cause, Effect, Exit } from "effect";
import { makeResidentState } from "./capacity.ts";
import { residentTicketInput } from "../test-support/resident-ticket.ts";

const defectMessage = <A>(effect: Effect.Effect<A>) => Effect.gen(function* () {
  const exit = yield* Effect.exit(effect);
  if (Exit.isSuccess(exit)) throw new Error("expected a resident invariant defect");
  return Cause.pretty(exit.cause);
});

it.effect("publishes one ticket for competing nonce admissions without consuming rejected identities", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const input = residentTicketInput(owner.residentLifetime, "shared");
  const results = yield* Effect.all(Array.from({ length: 16 }, () => Effect.exit(owner.tickets.open(input))),
    { concurrency: "unbounded" });
  const admitted = results.filter(Exit.isSuccess);
  expect(admitted).toHaveLength(1);
  expect(results.filter(Exit.isFailure)).toHaveLength(15);
  expect(yield* owner.tickets.get("shared")).toBe(admitted[0]!.value);
  expect(owner.canonicalProjection().tickets.map((ticket) => ticket.id)).toEqual([1]);
  const next = yield* owner.tickets.open(residentTicketInput(owner.residentLifetime, "next"));
  expect(next.generation).toBe(2);
}));

it.effect("owns an immutable ticket snapshot and rolls back rejected nonce admission", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const input = residentTicketInput(owner.residentLifetime, "first");
  const first = (yield* owner.tickets.open(input));
  Reflect.set(input.ticket, "nonce", "changed");
  expect(first.ticket.nonce).toBe("first");
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(first.ticket)).toBe(true);
  const before = owner.canonicalProjection();
  expect(yield* owner.tickets.open(residentTicketInput(owner.residentLifetime, "first")).pipe(Effect.sandbox, Effect.flip, Effect.map(Cause.pretty))).toContain("identity refused");
  expect(owner.canonicalProjection()).toEqual(before);
  const second = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime, "second")));
  expect(second.generation).toBe(first.generation + 1);
  expect((yield* owner.tickets.get("first"))).toBe(first);
}));

it.effect("rolls back canonical opening and identity allocation if native construction fails", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const input = residentTicketInput(owner.residentLifetime);
  const before = owner.canonicalProjection();
  expect(yield* owner.tickets.open({ ...input, get root(): string { throw new Error("fixture construction failure"); } }).pipe(Effect.sandbox, Effect.flip, Effect.map(Cause.pretty))).toContain("construction failure");
  expect(owner.canonicalProjection()).toEqual(before);
  expect((yield* owner.tickets.get("ticket"))).toBeUndefined();
  expect((yield* owner.tickets.open(input)).generation).toBe(1);
}));

it.effect("evicts the oldest canonical ticket and its native unit bindings together", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const first = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime, "first")));
  const firstUnit = (yield* owner.ticketUnits.add(first));
  const second = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime, "second")));
  const secondUnit = (yield* owner.ticketUnits.add(second));
  (yield* owner.tickets.retain(1));
  expect((yield* owner.tickets.get("first"))).toBeUndefined();
  expect((yield* owner.ticketUnits.stage(firstUnit))).toBeUndefined();
  expect((yield* owner.ticketUnits.values())).toEqual([secondUnit]);
  expect(owner.canonicalProjection().tickets.map((ticket) => ticket.id)).toEqual([second.generation]);
  (yield* owner.tickets.retain(0));
  expect((yield* owner.ticketUnits.values())).toEqual([]);
  expect(owner.canonicalProjection().tickets).toEqual([]);
}));

it.effect("retires only the selected partition and fences stale ticket capabilities after clear", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const first = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime, "first", "a")));
  const independent = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime, "independent", "b")));
  const independentUnit = (yield* owner.ticketUnits.add(independent));
  (yield* owner.tickets.discardPartition("a"));
  expect((yield* owner.tickets.get("first"))).toBeUndefined();
  expect((yield* owner.tickets.get("independent"))).toBe(independent);
  expect((yield* owner.ticketUnits.stage(independentUnit))?.stage).toBe("pending");
  owner.clear();
  const replacement = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime, "first", "a")));
  expect(replacement.generation).toBe(first.generation);
  expect((yield* owner.tickets.forget(first))).toBe(false);
  expect((yield* owner.tickets.get("first"))).toBe(replacement);
  expect(yield* defectMessage(owner.ticketUnits.add(first))).toContain("ticket capability");
}));
