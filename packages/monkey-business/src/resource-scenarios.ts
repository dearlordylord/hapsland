import type { CanonicalEvent, CanonicalCommand, CanonicalProjection } from "../../../src/canonical/adapter.ts";

/** Selectable source-free exercises, not native serialization or automatic edit tickets. */
export type ResourceScenarioConfig = {
  readonly tickets?: boolean;
  readonly notices?: boolean;
  readonly outputFit?: boolean;
  /** Explicit synthetic encoded bytes for real generated collection attempts. */
  readonly outputBytes?: number;
  readonly startAt?: number;
  readonly ticketRetention?: number;
  readonly noticeMaximumKeys?: number;
  readonly noticeReservationBytes?: number;
  readonly cooldownMs?: number;
  readonly partition?: number;
  readonly group?: number;
};
export type ResourceScenarioInput = { readonly at: number; readonly kind: "canonical"; readonly event: CanonicalEvent };
export const RESOURCE_SCENARIO_METADATA = {
  encodedOutput: "explicit synthetic encoded-byte facts; native serialization is not measured",
  collectionMaximumBytes: 10 * 1024,
  ticketRetention: 256,
  noticeMaximumKeys: 64,
  noticeCooldownMs: 60_000,
  reservationBytes: "explicit synthetic notice storage charge",
} as const;

/** Demo-only resident maxima, computed once from configured agents; native policy is unchanged. */
export const demoResourceLimits = (agents: number) => {
  if (!Number.isSafeInteger(agents) || agents < 1 || agents > 64) throw new RangeError("invalid demo agent count");
  const entryLimit = Math.min(8, Math.max(4, 2 * agents));
  return { entryLimit, byteLimit: entryLimit * 8192, ticketRetention: Math.min(256, 16 * agents), noticeMaximumKeys: Math.min(64, 8 * agents) };
};

export class ResourceScenarios {
  readonly config: Required<ResourceScenarioConfig>;
  private readonly pendingKeys: number[] = [];
  private readonly base = 900_000;
  constructor(config: ResourceScenarioConfig = {}) {
    this.config = { tickets: false, notices: false, outputFit: false, startAt: 0,
      ticketRetention: 16, noticeMaximumKeys: 8, noticeReservationBytes: 128,
      cooldownMs: 60_000, outputBytes: 512, partition: 900_000, group: 900_000, ...config };
    for (const key of ["tickets", "notices", "outputFit"] as const)
      if (typeof this.config[key] !== "boolean") throw new TypeError(`${key} must be boolean`);
    for (const key of ["startAt", "outputBytes", "ticketRetention", "noticeMaximumKeys", "noticeReservationBytes", "cooldownMs", "partition", "group"] as const) {
      const value = this.config[key];
      if (!Number.isSafeInteger(value) || value < (key === "startAt" ? 0 : 1) || value > 1_000_000)
        throw new RangeError(`invalid scenario ${key}`);
    }
    if (this.config.noticeMaximumKeys > 64) throw new RangeError("scenario noticeMaximumKeys exceeds native supported bound");
    if (this.config.ticketRetention > 256) throw new RangeError("scenario ticketRetention exceeds bounded exercise");
  }
  inputs(): ResourceScenarioInput[] {
    const events: ResourceScenarioInput[] = [];
    const emit = (offset: number, event: CanonicalEvent) => events.push({ at: this.config.startAt + offset, kind: "canonical", event });
    if (this.config.tickets) {
      for (let n = 0; n < Math.min(3, this.config.ticketRetention + 1); n++) {
        const id = this.base + n;
        emit(0, { kind: "ticketOpen", id });
        emit(0, { kind: "ticketAddUnit", id, unit: id });
        emit(0, { kind: "ticketStepUnit", id, unit: id, event: n % 2 ? "failUnit" : "findingResult", reason: "backend" });
        emit(0, { kind: "ticketUnitCheck", id, unit: id });
        emit(0, { kind: "ticketRetentionCheck", limit: this.config.ticketRetention });
      }
      emit(1, { kind: "ticketCollectGateCheck", expired: false, credentialValid: false });
      emit(2, { kind: "ticketCollectGateCheck", expired: false, credentialValid: true });
      emit(3, { kind: "ticketCollectGateCheck", expired: true, credentialValid: true });
      for (let n = 0; n < Math.min(3, this.config.ticketRetention + 1); n++) emit(4, { kind: "ticketForget", id: this.base + n });
    }
    if (this.config.notices) {
      emit(0, this.advance(this.base));
      emit(1, this.advance(this.base, this.config.cooldownMs));
      emit(this.config.cooldownMs + 2, this.advance(this.base, 0));
      emit(this.config.cooldownMs + 3, this.advance(this.base + 1));
      emit(this.config.cooldownMs + 4, { kind: "noticeSelect", partition: this.config.partition, group: this.config.group, composed: false, ticketed: false, allowed: [] });
      emit(this.config.cooldownMs + 5, { kind: "noticeLease", key: this.base, leased: true });
      emit(this.config.cooldownMs + 6, this.advance(this.base, 0));
      emit(2 * this.config.cooldownMs + 7, { kind: "noticePrune", key: this.base, leaseExpired: true, pendingExpired: true, excepted: false, cooldownExpired: true });
      emit(2 * this.config.cooldownMs + 8, this.advance(this.base + 1));
      emit(3 * this.config.cooldownMs + 9, { kind: "noticePrune", key: this.base + 1, leaseExpired: true, pendingExpired: true, excepted: false, cooldownExpired: true });
    }
    if (this.config.outputFit) for (const bytes of [10_240, 10_241]) {
      emit(0, { kind: "collectionFitCheck", items: 1, bytes });
      emit(0, { kind: "collectionNoticeCheck", items: 1, bytes, skipUnfitting: true });
    }
    return events.sort((a, b) => a.at - b.at);
  }
  private advance(key: number, remaining?: number): CanonicalEvent {
    return { kind: "noticeAdvance", key, ...(remaining === undefined ? {} : { remaining }), maximumKeys: this.config.noticeMaximumKeys, proposed: key, sequence: key, maxCount: 2 ** 48 - 1 };
  }
  /** Follow only checked commands. The caller sends returned events through its shared state. */
  handle(event: CanonicalEvent, commands: readonly CanonicalCommand[], before: CanonicalProjection): CanonicalEvent[] {
    if (this.config.tickets && event.kind === "ticketCollectGateCheck" && commands.some(c => c.kind === "ticketCollectProceed"))
      return before.tickets.filter(t => t.id >= this.base && t.id <= this.base + this.config.ticketRetention).flatMap(t => t.units.map(unit => ({ kind: "ticketUnitCheck" as const, id: t.id, unit: unit.id })));
    if (!this.config.notices) return [];
    if (event.kind === "noticeAdvance" && event.key >= this.base && commands.some(c => c.kind === "noticeCreateKey")) {
      this.pendingKeys.push(event.key);
      return [{ kind: "reserveCapacity", partition: this.config.partition, bytes: this.config.noticeReservationBytes, purpose: "operationalNotice" }];
    }
    if (event.kind === "reserveCapacity" && event.partition === this.config.partition && event.purpose === "operationalNotice" && this.pendingKeys.length > 0) {
      const key = this.pendingKeys.shift()!;
      const granted = commands.find(c => c.kind === "capacityGranted");
      return granted?.kind === "capacityGranted" ? [{ kind: "noticeCommit", key, partition: this.config.partition, group: this.config.group, reservation: granted.id, pending: key, sequence: key, maximumKeys: this.config.noticeMaximumKeys }] : [];
    }
    if (event.kind === "noticeCommit" && commands.some(c => c.kind === "noticeRefused")) return [{ kind: "releaseCapacity", reservation: event.reservation }];
    if (event.kind === "noticePrune" && commands.some(c => c.kind === "noticePruned" && c.dropKey)) {
      const notice = before.notices.find(n => n.id === event.key);
      return notice ? [{ kind: "releaseCapacity", reservation: notice.reservation }] : [];
    }
    return [];
  }
}
