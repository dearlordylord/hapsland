import { describe, expect, it } from "vitest";
import type { Finding } from "../direct-event/pipeline.ts";
import {
  ADVICE_COLLECTION_WINDOW_MS,
  MAX_COMBINED_RESPONSE_BYTES,
  MAX_COMBINED_RESPONSE_ITEMS,
  PENDING_ADVICE_EXPIRY_MS,
  collectionOrder,
  combinedFindingOutput,
  encodedHostOutputBytes,
  fitsCombinedResponse,
  isCollectionEligible,
  isPendingAdviceExpired,
} from "./collection.ts";

const candidate = (overrides: Partial<{
  cycle: number;
  sequence: number;
  cycleComplete: boolean;
  pendingAt: number;
}> = {}) => ({
  cycle: 2,
  sequence: 4,
  cycleComplete: false,
  pendingAt: 1_000,
  ...overrides,
});

const finding = (index: number, message = "use a domain name"): Finding => ({
  path: `type-${index}.ts`,
  declaration: `Count${index}`,
  ruleId: "noul/no-primitive-obsession",
  probability: 0.9,
  message,
  semanticIdentity: `identity-${index}`,
});

describe("resident advice collection policy", () => {
  it("becomes eligible at cycle completion or exactly 50 ms without resetting age", () => {
    expect(isCollectionEligible(candidate(), 1_000 + ADVICE_COLLECTION_WINDOW_MS - 1)).toBe(false);
    expect(isCollectionEligible(candidate(), 1_000 + ADVICE_COLLECTION_WINDOW_MS)).toBe(true);
    expect(isCollectionEligible(candidate({ cycleComplete: true }), 1_000)).toBe(true);
    expect(isCollectionEligible(candidate(), 1_000, "turn-end")).toBe(true);

    const older = candidate({ pendingAt: 1_000 });
    const newer = candidate({ pendingAt: 1_049, sequence: 5 });
    expect(isCollectionEligible(older, 1_050)).toBe(true);
    expect(isCollectionEligible(newer, 1_050)).toBe(false);
    expect(isCollectionEligible(newer, 1_050, "ordinary", older.pendingAt)).toBe(true);
    expect(isCollectionEligible({ ...newer, collectionEligible: true }, 1_050)).toBe(true);
  });

  it("orders deterministically by finite cycle then dispatch sequence", () => {
    const ordered = [
      candidate({ cycle: 3, sequence: 1 }),
      candidate({ cycle: 2, sequence: 9 }),
      candidate({ cycle: 2, sequence: 4 }),
    ].sort(collectionOrder);
    expect(ordered.map(({ cycle, sequence }) => [cycle, sequence])).toEqual([[2, 4], [2, 9], [3, 1]]);
  });

  it("enforces five items and the exact 2 KiB host encoding", () => {
    const five = Array.from({ length: MAX_COMBINED_RESPONSE_ITEMS }, (_, index) => [finding(index)]);
    expect(fitsCombinedResponse(five)).toBe(true);
    expect(fitsCombinedResponse([...five, [finding(5)]])).toBe(false);
    expect(encodedHostOutputBytes(combinedFindingOutput(five))).toBeLessThanOrEqual(MAX_COMBINED_RESPONSE_BYTES);

    const oversized = [[finding(0, "x".repeat(MAX_COMBINED_RESPONSE_BYTES))]];
    expect(fitsCombinedResponse(oversized)).toBe(false);
    expect(encodedHostOutputBytes(combinedFindingOutput(oversized))).toBeGreaterThan(MAX_COMBINED_RESPONSE_BYTES);
    expect(fitsCombinedResponse([])).toBe(false);
  });

  it("expires at equality, but not one millisecond before", () => {
    const pending = candidate({ pendingAt: 25 });
    expect(isPendingAdviceExpired(pending, 25 + PENDING_ADVICE_EXPIRY_MS - 1)).toBe(false);
    expect(isPendingAdviceExpired(pending, 25 + PENDING_ADVICE_EXPIRY_MS)).toBe(true);
    expect(isPendingAdviceExpired(pending, 25 + PENDING_ADVICE_EXPIRY_MS + 1)).toBe(true);
  });
});
