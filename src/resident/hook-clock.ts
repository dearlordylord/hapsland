/** Shared machine monotonic milliseconds; never a wall clock or runtime turn ID. */
export const monotonicNow = (): number => Number(process.hrtime.bigint()) / 1_000_000;

// Read hrtime before performance.now to obtain a conservative lower bound on
// Node process start, including imports/startup before this module executes.
const sampledNow = monotonicNow();
export const hookProcessStartedAt = sampledNow - performance.now();
export const PRE_EDIT_ADMISSION_DEADLINE_MS = 2_500;
