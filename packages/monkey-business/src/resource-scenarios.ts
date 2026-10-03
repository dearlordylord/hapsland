import type { CanonicalEvent } from "../../../src/canonical/adapter.ts";

/** Selectable source-free diagnostic and output-fit exercises, not native serialization. */
export type ResourceScenarioConfig = {
  readonly notices?: boolean;
  readonly outputFit?: boolean;
  /** Explicit synthetic encoded bytes for real generated collection attempts. */
  readonly outputBytes?: number;
  readonly startAt?: number;
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
  noticeMaximumKeys: 64,
  noticeCooldownMs: 60_000,
  reservationBytes: "explicit synthetic notice storage charge",
} as const;

/** Demo-only resident maxima, computed once from configured agents; native policy is unchanged. */
export const demoResourceLimits = (agents: number) => {
  if (!Number.isSafeInteger(agents) || agents < 1 || agents > 64) throw new RangeError("invalid demo agent count");
  const entryLimit = Math.min(8, Math.max(4, 2 * agents));
  return { entryLimit, byteLimit: entryLimit * 8192, noticeMaximumKeys: Math.min(64, 8 * agents) };
};

export class ResourceScenarios {
  readonly config: Required<ResourceScenarioConfig>;
  constructor(config: ResourceScenarioConfig = {}) {
    this.config = { notices: false, outputFit: false, startAt: 0,
      noticeMaximumKeys: 8, noticeReservationBytes: 128,
      cooldownMs: 60_000, outputBytes: 512, partition: 900_000, group: 900_000, ...config };
    for (const key of ["notices", "outputFit"] as const)
      if (typeof this.config[key] !== "boolean") throw new TypeError(`${key} must be boolean`);
    for (const key of ["startAt", "outputBytes", "noticeMaximumKeys", "noticeReservationBytes", "cooldownMs", "partition", "group"] as const) {
      const value = this.config[key];
      if (!Number.isSafeInteger(value) || value < (key === "startAt" ? 0 : 1) || value > 1_000_000)
        throw new RangeError(`invalid scenario ${key}`);
    }
    if (this.config.noticeMaximumKeys > 64) throw new RangeError("scenario noticeMaximumKeys exceeds native supported bound");
  }
  inputs(): ResourceScenarioInput[] {
    const events: ResourceScenarioInput[] = [];
    const emit = (offset: number, event: CanonicalEvent) => events.push({ at: this.config.startAt + offset, kind: "canonical", event });
    if (this.config.outputFit) for (const bytes of [10_240, 10_241]) {
      emit(0, { kind: "collectionFitCheck", items: 1, bytes });
      emit(0, { kind: "collectionNoticeCheck", items: 1, bytes, skipUnfitting: true });
    }
    return events.sort((a, b) => a.at - b.at);
  }
}
