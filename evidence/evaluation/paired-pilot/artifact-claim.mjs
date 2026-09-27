import { mkdir } from "node:fs/promises";

/** Claim a fresh run artifact before starting the host. Existing output is immutable. */
export const claimOutputRoot = (path) => mkdir(path);

/** A single retry has its own immutable artifact; the first attempt keeps its path. */
export const retryOutputRoot = (firstAttemptRoot) => `${firstAttemptRoot}-retry-1`;
