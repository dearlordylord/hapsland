import { expect, it } from "vitest";
import { encodeNoticeExpiryClock, validateExpiryControl, validateExpiryProfile, decodeExpiryEvents } from "./expiry-controls.ts";

it("captures exact immutable expiry facts without making a host boundary decision", () => {
  const profile = validateExpiryProfile({ pendingMs: 10, leaseMs: 2, cooldownMs: 20 });
  expect(Object.isFrozen(profile)).toBe(true);
  const notice = encodeNoticeExpiryClock({ partition: 2, group: 9, key: 101, retainedAt: 10, pendingMs: 10, leaseStarted: 15, leaseMs: 2, cooldownStarted: 10, cooldownMs: 20 });
  expect(Object.isFrozen(notice)).toBe(true);
  expect(notice.retained_at).toBe(10);
  expect(notice.partition).toBe(2);
  expect(notice.pending_duration).toBe(10);
});
it("rejects impossible derived deadlines and malformed controls", () => {
  expect(() => encodeNoticeExpiryClock({ partition: 1, group: 1, key: 1, retainedAt: 2 ** 48 - 2, pendingMs: 10, leaseStarted: 0, leaseMs: 2, cooldownStarted: 0, cooldownMs: 20 })).toThrow();
  expect(() => validateExpiryProfile({ pendingMs: 0, leaseMs: 2, cooldownMs: 20 })).toThrow();
  expect(() => validateExpiryControl({ kind: "expireNotice", partition: 1, group: 1, key: 0, excepted: false })).toThrow();
  expect(() => validateExpiryControl({ kind: "expireNotice", partition: 1, group: 1, key: 1, excepted: false, unexpected: true })).toThrow();
});
it("decodes bounded actual Canonical cleanup facts and rejects cyclic lists", () => {
  expect(decodeExpiryEvents({ $: "Con", head: { $: "Canonical.ReleaseCapacity", reservation: 2n }, tail: { $: "Nil" } })).toEqual([{ kind: "releaseCapacity", reservation: 2 }]);
  const cyclic: { $: string; head: unknown; tail?: unknown } = { $: "Con", head: { $: "Canonical.ReleaseCapacity", reservation: 2 } };
  cyclic.tail = cyclic;
  expect(() => decodeExpiryEvents(cyclic)).toThrow();
});
