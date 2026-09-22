import type { CodexDirectEventOutput, Finding } from "../direct-event/pipeline.ts";
import { toCodexDirectEventOutput } from "../direct-event/pipeline.ts";
import { encodedCodexHostOutputBytes } from "../direct-event/writer.ts";

export const ADVICE_COLLECTION_WINDOW_MS = 50;
export const PENDING_ADVICE_EXPIRY_MS = 600_000;
export const MAX_COMBINED_RESPONSE_ITEMS = 5;
export const MAX_COMBINED_RESPONSE_BYTES = 2 * 1024;

export type CollectionCandidate = {
  readonly cycle: number;
  readonly sequence: number;
  readonly cycleComplete: boolean;
  readonly pendingAt: number;
  readonly collectionEligible?: boolean;
};

export type CollectionMode = "ordinary" | "turn-end";

export const collectionOrder = <A extends Pick<CollectionCandidate, "cycle" | "sequence">>(
  left: A,
  right: A,
): number => left.cycle - right.cycle || left.sequence - right.sequence;

export const isCollectionEligible = (
  candidate: CollectionCandidate,
  now: number,
  mode: CollectionMode = "ordinary",
  oldestPendingAt: number = candidate.pendingAt,
): boolean => candidate.collectionEligible === true || mode === "turn-end" ||
  candidate.cycleComplete || now - oldestPendingAt >= ADVICE_COLLECTION_WINDOW_MS;

export const isPendingAdviceExpired = (
  candidate: Pick<CollectionCandidate, "pendingAt">,
  now: number,
): boolean => now - candidate.pendingAt >= PENDING_ADVICE_EXPIRY_MS;

/** Bytes actually handed to the host writer, including its line terminator. */
export const encodedHostOutputBytes = (output: CodexDirectEventOutput): number =>
  encodedCodexHostOutputBytes(output);

export const combinedFindingOutput = (
  groups: ReadonlyArray<ReadonlyArray<Finding>>,
): CodexDirectEventOutput => toCodexDirectEventOutput(groups.flatMap((findings) => findings));

export const fitsCombinedResponse = (
  groups: ReadonlyArray<ReadonlyArray<Finding>>,
): boolean => groups.length > 0 &&
  groups.length <= MAX_COMBINED_RESPONSE_ITEMS &&
  encodedHostOutputBytes(combinedFindingOutput(groups)) <= MAX_COMBINED_RESPONSE_BYTES;
