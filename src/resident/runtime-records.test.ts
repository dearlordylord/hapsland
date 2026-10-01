import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { makeResidentState } from "./capacity.ts";
import { residentTicketInput } from "../test-support/resident-ticket.ts";

it.effect("bounds connection leases and fences foreign and duplicate release", () => Effect.gen(function* () {
  const owner = yield* makeResidentState(undefined, "same-lifetime");
  const foreign = yield* makeResidentState(undefined, "same-lifetime");
  const connection = owner.runtime.openConnection(1)!;
  const other = foreign.runtime.openConnection(1)!;
  expect(Object.isFrozen(connection)).toBe(true);
  expect(owner.runtime.openConnection(1)).toBeUndefined();
  expect(owner.runtime.releaseConnection(other)).toBe(false);
  expect(owner.runtime.snapshot().connections).toBe(1);
  expect(owner.runtime.releaseConnection(connection)).toBe(true);
  expect(owner.runtime.releaseConnection(connection)).toBe(false);
  expect(owner.runtime.snapshot().connections).toBe(0);
  expect(foreign.runtime.snapshot().connections).toBe(1);
}));

it.effect("publishes canonical cleanup, ticket eviction and retirement together", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const ticket = owner.tickets.open(residentTicketInput(owner.residentLifetime));
  const unit = owner.ticketUnits.add(ticket);
  const outcome = yield* owner.runtime.cleanup(() => 10);
  expect(outcome).toBe("cleaned");
  expect(owner.runtime.snapshot().lifecycle).toBe("retiring");
  expect(owner.canonicalProjection().dispatch.closed).toBe(true);
  expect(owner.tickets.get(ticket.ticket.nonce)).toBeUndefined();
  expect(unit.stage()).toBeUndefined();
  expect(owner.runtime.scheduleRetirement()).toBe(true);
  expect(owner.runtime.scheduleRetirement()).toBe(false);
  expect((yield* owner.runtime.cleanup(() => 10))).toBe("busy");
}));

it.effect("busy ownership does not retire the runtime or evict tickets", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const ticket = owner.tickets.open(residentTicketInput(owner.residentLifetime));
  const reservation = owner.reserve("fixture", 10, "preparation")!;
  const before = owner.canonicalProjection();
  const outcome = yield* owner.runtime.cleanup(() => 10);
  expect(outcome).toBe("busy");
  expect(owner.canonicalProjection()).toEqual(before);
  expect(owner.tickets.get(ticket.ticket.nonce)).toBe(ticket);
  expect(owner.runtime.snapshot().lifecycle).toBe("active");
  expect(owner.runtime.scheduleRetirement()).toBe(false);
  expect(owner.release(reservation)).toBe(true);
  expect((yield* owner.runtime.cleanup(() => 10))).toBe("cleaned");
}));

it.effect("keeps connection ownership and immutable statistics through physical cleanup", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const connection = owner.runtime.openConnection(2)!;
  const snapshot = owner.runtime.snapshot();
  expect(Object.isFrozen(snapshot)).toBe(true);
  const reservation = owner.reserve("fixture", 20, "preparation")!;
  owner.runtime.observeCapacity();
  owner.runtime.observePreparedUnits(3);
  owner.runtime.rejectCapacity();
  expect(owner.runtime.nextAuthoritySequence()).toBe(1);
  expect(owner.runtime.nextAuthoritySequence()).toBe(2);
  expect(snapshot.peakLedgerBytes).toBe(0);
  owner.release(reservation);
  yield* owner.runtime.close();
  owner.clear();
  expect(owner.runtime.snapshot()).toMatchObject({
    lifecycle: "closed", connections: 1, rejectedCapacity: 1,
    peakLedgerBytes: 20, maxMaterializedPreparedUnits: 3,
  });
  expect(owner.runtime.releaseConnection(connection)).toBe(true);
  expect(owner.runtime.snapshot().connections).toBe(0);
}));

it.effect("two connected clients keep cleanup busy until one physically closes", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const first = owner.runtime.openConnection(2)!;
  owner.runtime.openConnection(2);
  expect((yield* owner.runtime.cleanup(() => 10))).toBe("busy");
  owner.runtime.releaseConnection(first);
  expect((yield* owner.runtime.cleanup(() => 10))).toBe("cleaned");
}));

it.effect("rolls back staged ticket eviction and retirement if native validation fails", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const ticket = owner.tickets.open(residentTicketInput(owner.residentLifetime));
  const unit = owner.ticketUnits.add(ticket);
  // Seed a mismatched canonical admission to exercise failure after the first
  // eviction has staged; normal ticket admission validates this invariant.
  owner.transition({ kind: "ticketOpen", id: ticket.generation + 1 });
  const before = owner.canonicalProjection();
  const outcome = yield* Effect.exit(owner.runtime.cleanup(() => 10));
  expect(outcome._tag).toBe("Failure");
  expect(owner.canonicalProjection()).toEqual(before);
  expect(owner.tickets.get(ticket.ticket.nonce)).toBe(ticket);
  expect(unit.stage()?.stage).toBe("pending");
  expect(owner.runtime.snapshot().lifecycle).toBe("active");
}));
