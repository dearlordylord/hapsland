import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { makeResidentState } from "./capacity.ts";
import { residentTicketInput } from "../test-support/resident-ticket.ts";

it.effect("bounds connection leases and fences foreign and duplicate release", () => Effect.gen(function* () {
  const owner = yield* makeResidentState(undefined, "same-lifetime");
  const foreign = yield* makeResidentState(undefined, "same-lifetime");
  const connection = (yield* owner.runtime.openConnection(1))!;
  const other = (yield* foreign.runtime.openConnection(1))!;
  expect(Object.isFrozen(connection)).toBe(true);
  expect((yield* owner.runtime.openConnection(1))).toBeUndefined();
  expect((yield* owner.runtime.releaseConnection(other))).toBe(false);
  expect(owner.runtime.snapshot().connections).toBe(1);
  expect((yield* owner.runtime.releaseConnection(connection))).toBe(true);
  expect((yield* owner.runtime.releaseConnection(connection))).toBe(false);
  expect(owner.runtime.snapshot().connections).toBe(0);
  expect(foreign.runtime.snapshot().connections).toBe(1);
}));

it.effect("publishes canonical cleanup, ticket eviction and retirement together", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const unit = owner.ticketUnits.add(ticket);
  const outcome = yield* owner.runtime.cleanup(() => 10);
  expect(outcome).toBe("cleaned");
  expect(owner.runtime.snapshot().lifecycle).toBe("retiring");
  expect(owner.canonicalProjection().dispatch.closed).toBe(true);
  expect((yield* owner.tickets.get(ticket.ticket.nonce))).toBeUndefined();
  expect(unit.stage()).toBeUndefined();
  expect((yield* owner.runtime.scheduleRetirement())).toBe(true);
  expect((yield* owner.runtime.scheduleRetirement())).toBe(false);
  expect((yield* owner.runtime.cleanup(() => 10))).toBe("busy");
}));

it.effect("busy ownership does not retire the runtime or evict tickets", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const reservation = owner.reserve("fixture", 10, "preparation")!;
  const before = owner.canonicalProjection();
  const outcome = yield* owner.runtime.cleanup(() => 10);
  expect(outcome).toBe("busy");
  expect(owner.canonicalProjection()).toEqual(before);
  expect((yield* owner.tickets.get(ticket.ticket.nonce))).toBe(ticket);
  expect(owner.runtime.snapshot().lifecycle).toBe("active");
  expect((yield* owner.runtime.scheduleRetirement())).toBe(false);
  expect(owner.release(reservation)).toBe(true);
  expect((yield* owner.runtime.cleanup(() => 10))).toBe("cleaned");
}));

it.effect("keeps connection ownership and immutable statistics through physical cleanup", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const connection = (yield* owner.runtime.openConnection(2))!;
  const snapshot = owner.runtime.snapshot();
  expect(Object.isFrozen(snapshot)).toBe(true);
  const reservation = owner.reserve("fixture", 20, "preparation")!;
  (yield* owner.runtime.observePreparedUnits(3));
  (yield* owner.runtime.rejectCapacity());
  expect((yield* owner.runtime.nextAuthoritySequence())).toBe(1);
  expect((yield* owner.runtime.nextAuthoritySequence())).toBe(2);
  expect(snapshot.peakLedgerBytes).toBe(0);
  owner.release(reservation);
  yield* owner.runtime.close();
  owner.clear();
  expect(owner.runtime.snapshot()).toMatchObject({
    lifecycle: "closed", connections: 1, rejectedCapacity: 1,
    peakLedgerBytes: 20, maxMaterializedPreparedUnits: 3,
  });
  expect((yield* owner.runtime.releaseConnection(connection))).toBe(true);
  expect(owner.runtime.snapshot().connections).toBe(0);
}));

it.effect("two connected clients keep cleanup busy until one physically closes", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const first = (yield* owner.runtime.openConnection(2))!;
  (yield* owner.runtime.openConnection(2));
  expect((yield* owner.runtime.cleanup(() => 10))).toBe("busy");
  (yield* owner.runtime.releaseConnection(first));
  expect((yield* owner.runtime.cleanup(() => 10))).toBe("cleaned");
}));

it.effect("rolls back staged ticket eviction and retirement if native validation fails", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const ticket = (yield* owner.tickets.open(residentTicketInput(owner.residentLifetime)));
  const unit = owner.ticketUnits.add(ticket);
  // Seed a mismatched canonical admission to exercise failure after the first
  // eviction has staged; normal ticket admission validates this invariant.
  owner.transition({ kind: "ticketOpen", id: ticket.generation + 1 });
  const before = owner.canonicalProjection();
  const outcome = yield* Effect.exit(owner.runtime.cleanup(() => 10));
  expect(outcome._tag).toBe("Failure");
  expect(owner.canonicalProjection()).toEqual(before);
  expect((yield* owner.tickets.get(ticket.ticket.nonce))).toBe(ticket);
  expect(unit.stage()?.stage).toBe("pending");
  expect(owner.runtime.snapshot().lifecycle).toBe("active");
}));

it.effect("records transient reservation peaks without a server sampling checkpoint", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const capture = owner.reserve("capture", 128, "preparation")!;
  expect(owner.runtime.snapshot().peakLedgerBytes).toBe(128);
  expect(owner.resize(capture, 5)).toBe(true);
  const concurrent = owner.reserve("other", 200, "preparation")!;
  expect(owner.runtime.snapshot().peakLedgerBytes).toBe(205);
  owner.release(capture);
  owner.release(concurrent);
  expect(owner.snapshot().bytes).toBe(0);
  expect(owner.reserve("other", 1_000_000_000, "preparation")).toBeUndefined();
  expect(owner.resize(concurrent, 1_000)).toBe(false);
  owner.clear();
  expect(owner.runtime.snapshot().peakLedgerBytes).toBe(205);
}));
