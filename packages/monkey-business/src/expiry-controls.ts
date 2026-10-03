import { Schema } from "effect";
import { decodeSharedValue } from "../../../src/canonical/simulation-codec.ts";
import { decoder, Nat, PositiveNat, readBendList } from "../../../src/canonical/boundary-schema.ts";
import { decodeDriverEvent } from "./driver-codec.ts";

/** Source-free supplied clock durations; production owns the boundary rule. */
const Duration = PositiveNat.check(Schema.isLessThanOrEqualTo(1_000_000_000));
export const ExpiryProfileSchema = Schema.Struct({ pendingMs: Duration, leaseMs: Duration, cooldownMs: PositiveNat.check(Schema.isLessThanOrEqualTo(1_000_000)) });
export const ExpiryControlSchema = Schema.Struct({ kind: Schema.Literal("expiryProfile"), profile: ExpiryProfileSchema });
export type ExpiryProfile = typeof ExpiryProfileSchema.Type;
export type ExpiryControl = typeof ExpiryControlSchema.Type;
const readProfile = decoder(ExpiryProfileSchema);
const readControl = decoder(ExpiryControlSchema);
export const validateExpiryProfile = (value: unknown): ExpiryProfile => Object.freeze(readProfile(value));
export const validateExpiryControl = (value: unknown): ExpiryControl => {
  const control = readControl(value);
  return Object.freeze({ ...control, profile: Object.freeze(control.profile) });
};
const NoticeClockSchema = Schema.Struct({ partition: PositiveNat, group: PositiveNat, key: PositiveNat, retainedAt: Nat,
  pendingMs: Duration, leaseStarted: Nat, leaseMs: Duration, cooldownStarted: Nat, cooldownMs: Duration })
  .check(Schema.makeFilter(value => value.retainedAt <= 2 ** 48 - 1 - value.pendingMs && value.leaseStarted <= 2 ** 48 - 1 - value.leaseMs && value.cooldownStarted <= 2 ** 48 - 1 - value.cooldownMs));
export type NoticeExpiryClock = typeof NoticeClockSchema.Type;
const readNoticeClock = decoder(NoticeClockSchema);
export const encodeNoticeExpiryClock = (value: unknown) => {
  const clock = readNoticeClock(value);
  return Object.freeze({ $: "ExpiryScenario.NoticeClock", partition: clock.partition, group: clock.group, key: clock.key,
    retained_at: clock.retainedAt, pending_duration: clock.pendingMs, lease_started: clock.leaseStarted,
    lease_duration: clock.leaseMs, cooldown_started: clock.cooldownStarted, cooldown_duration: clock.cooldownMs });
};
/** The host does no timestamp comparisons, selection or ownership inference. */
export const decodeExpiryEvents = (value: unknown) => Object.freeze(readBendList(value, value => decodeDriverEvent(decodeSharedValue(value)), 3));

export const encodeExpiryProfile = (value: unknown) => {
  const profile = readProfile(value);
  return Object.freeze({ $: "ExpiryScenario.Profile", pending_duration: profile.pendingMs,
    lease_duration: profile.leaseMs, cooldown_duration: profile.cooldownMs });
};
