import { machineMonotonicNanos } from "../runtime/machine-clock.ts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

/** Shared machine monotonic milliseconds; never a wall clock or runtime turn ID. */
export const monotonicNow = (): number => Number(machineMonotonicNanos()) / 1_000_000;

// Read the machine clock before performance.now for a conservative lower bound
// on process start, including imports/startup before this module executes.
const sampledNow = monotonicNow();
export const hookProcessStartedAt = sampledNow - performance.now();
export const PRE_EDIT_ADMISSION_DEADLINE_MS = 2_500;

/** Caller Clock deadline coordinate; production roots provide the shared machine-monotonic domain. */
export const hookMonotonicMillis = Clock.monotonicTimeNanos.pipe(Effect.map((now) => Number(now) / 1_000_000));
