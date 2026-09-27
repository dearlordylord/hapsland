import { describe, expect, it } from "vitest";
import type { Finding } from "../direct-event/pipeline.ts";
import {
  ADVICE_COLLECTION_WINDOW_MS,
  MAX_COMBINED_RESPONSE_BYTES,
  MAX_COMBINED_RESPONSE_ITEMS,
  PENDING_ADVICE_EXPIRY_MS,
  collectionOrder,
  combinedFindingOutput,
  combinedClaudeOutput,
  combinedReviewOutput,
  encodedHostOutputBytes,
  encodedClaudeHostOutputBytes,
  fitsClaudeReviewResponse,
  fitsCombinedResponse,
  isCollectionEligible,
  isPendingAdviceExpired,
  selectFittingFindings,
  selectFittingClaudeFindings,
  selectFittingCurrentFindingIndices,
  selectFittingClaudeNotices,
  selectFittingNotices,
  type FindingSelectionFacts,
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

  it("preserves fractional-time collection and expiry boundaries", () => {
    const pending = candidate({ pendingAt: 0.9 });
    expect(isCollectionEligible(pending, ADVICE_COLLECTION_WINDOW_MS + 0.1)).toBe(false);
    expect(isCollectionEligible(pending, ADVICE_COLLECTION_WINDOW_MS + 0.9)).toBe(true);
    expect(isPendingAdviceExpired(pending, PENDING_ADVICE_EXPIRY_MS + 0.1)).toBe(false);
    expect(isPendingAdviceExpired(pending, PENDING_ADVICE_EXPIRY_MS + 0.9)).toBe(true);
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

  it("counts and selects flattened findings rather than unit groups", () => {
    const nineFromOneUnit = Array.from({ length: 9 }, (_, index) => finding(index));
    expect(fitsCombinedResponse([nineFromOneUnit])).toBe(false);
    const selected = selectFittingFindings([], nineFromOneUnit);
    expect(selected).toHaveLength(5);
    expect(selected.map(({ declaration }) => declaration)).toEqual([
      "Count0", "Count1", "Count2", "Count3", "Count4",
    ]);
    expect(fitsCombinedResponse([selected])).toBe(true);
  });

  it("uses each candidate's current work and credential generations and reports an individual limit", () => {
    const facts: FindingSelectionFacts = {
      partition: 17, round: 3, unit: 8, snapshot: 8, currentSnapshot: 8,
      credential: 12, currentCredential: 12, ageMs: 42, collectionReady: true,
    };
    expect(selectFittingFindings([], [finding(0)], { ...facts, currentSnapshot: 9 })).toEqual([]);
    expect(selectFittingFindings([], [finding(0)], { ...facts, currentCredential: 13 })).toEqual([]);
    expect(selectFittingFindings([], [finding(0)], { ...facts, ageMs: PENDING_ADVICE_EXPIRY_MS })).toEqual([]);
    expect(selectFittingFindings([], [finding(0)], { ...facts, collectionReady: false })).toEqual([]);
    expect(selectFittingFindings([], [finding(0)], facts)).toEqual([finding(0)]);
    const limited: Array<Finding> = [];
    const oversized = finding(1, "x".repeat(MAX_COMBINED_RESPONSE_BYTES));
    expect(selectFittingFindings([], [oversized, finding(2)], facts,
      (item) => limited.push(item))).toEqual([finding(2)]);
    expect(limited).toEqual([oversized]);
    expect(combinedReviewOutput([], [{ kind: "output-limit", suppressedCount: 0 }])
      .hookSpecificOutput.additionalContext).toContain("exceeded the host response limit");
  });

  it("rechecks every retained finding from its own facts at final handoff", () => {
    const current: FindingSelectionFacts = {
      partition: 7, round: 2, unit: 2, snapshot: 2, currentSnapshot: 2,
      credential: 4, currentCredential: 4, ageMs: 10, collectionReady: true,
    };
    const offers = [
      { finding: finding(0), facts: { ...current, snapshot: 1 } },
      { finding: finding(1), facts: current },
      { finding: finding(2), facts: { ...current, currentCredential: 5 } },
    ];
    expect(selectFittingCurrentFindingIndices(offers, "codex")).toEqual([1]);
    expect(selectFittingCurrentFindingIndices(offers, "block-current-findings")).toEqual([1]);
  });

  it("shares item and byte bounds without allowing notices to displace findings", () => {
    const findings = Array.from({ length: MAX_COMBINED_RESPONSE_ITEMS }, (_, index) => finding(index));
    const notice = { kind: "backend" as const, suppressedCount: 2 };
    expect(selectFittingNotices(findings, [], [notice])).toEqual([]);
    expect(selectFittingNotices(findings.slice(0, 4), [], [notice])).toEqual([notice]);
    const output = combinedReviewOutput(findings.slice(0, 4), [notice]);
    expect(output.hookSpecificOutput.additionalContext).toContain("Jev was unavailable");
    expect(output.hookSpecificOutput.additionalContext).toContain("2 similar failures were suppressed");
    expect(encodedHostOutputBytes(output)).toBeLessThanOrEqual(MAX_COMBINED_RESPONSE_BYTES);
  });

  it("expires at equality, but not one millisecond before", () => {
    const pending = candidate({ pendingAt: 25 });
    expect(isPendingAdviceExpired(pending, 25 + PENDING_ADVICE_EXPIRY_MS - 1)).toBe(false);
    expect(isPendingAdviceExpired(pending, 25 + PENDING_ADVICE_EXPIRY_MS)).toBe(true);
    expect(isPendingAdviceExpired(pending, 25 + PENDING_ADVICE_EXPIRY_MS + 1)).toBe(true);
  });

  it("selects whole Claude findings against the exact serialized block line", () => {
    const five = Array.from({ length: MAX_COMBINED_RESPONSE_ITEMS }, (_, index) => finding(index));
    expect(selectFittingClaudeFindings([], [...five, finding(5)], "block-current-findings")).toEqual(five);
    const output = combinedClaudeOutput(five, [], "block-current-findings");
    expect(output).toMatchObject({ decision: "block" });
    expect(encodedClaudeHostOutputBytes(output)).toBeLessThanOrEqual(MAX_COMBINED_RESPONSE_BYTES);
    const smallest = encodedClaudeHostOutputBytes(combinedClaudeOutput([finding(0, "")], [], "block-current-findings"));
    const exact = finding(0, "x".repeat(MAX_COMBINED_RESPONSE_BYTES - smallest));
    expect(encodedClaudeHostOutputBytes(combinedClaudeOutput([exact], [], "block-current-findings"))).toBe(MAX_COMBINED_RESPONSE_BYTES);
    expect(fitsClaudeReviewResponse([exact], [], "block-current-findings")).toBe(true);
    expect(fitsClaudeReviewResponse([{ ...exact, message: `${exact.message}x` }], [], "block-current-findings")).toBe(false);
    const oversized = { ...exact, message: `${exact.message}x` };
    expect(selectFittingClaudeFindings([], [oversized, finding(1)], "block-current-findings")).toEqual([finding(1)]);
  });

  it("keeps notices informational and uses advisory output when no finding fits", () => {
    const notice = { kind: "backend" as const, suppressedCount: 0 };
    const findingOutput = combinedClaudeOutput([finding(0)], [notice], "block-current-findings");
    expect(findingOutput).toMatchObject({ decision: "block" });
    if (!("decision" in findingOutput)) throw new Error("expected block output");
    expect(findingOutput.reason).toContain("Informational notices:");
    expect(findingOutput.reason).toContain("Jev was unavailable");
    const tooLarge = finding(0, "x".repeat(MAX_COMBINED_RESPONSE_BYTES));
    const selected = selectFittingClaudeFindings([], [tooLarge], "block-current-findings");
    expect(selected).toEqual([]);
    expect(selectFittingClaudeNotices(selected, [notice], "block-current-findings")).toEqual([notice]);
    expect(combinedClaudeOutput([], [notice], "block-current-findings")).not.toHaveProperty("decision");
  });
});
