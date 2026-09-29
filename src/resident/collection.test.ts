import { describe, expect, it } from "vitest";
import type { Finding } from "../direct-event/pipeline.ts";
import {
  ADVICE_COLLECTION_WINDOW_MS,
  MAX_COMBINED_RESPONSE_BYTES,
  PENDING_ADVICE_EXPIRY_MS,
  collectionOrder,
  combinedFindingOutput,
  combinedClaudeOutput,
  combinedReviewOutput,
  composedClaudeHostOutput,
  encodedComposedClaudeOutputBytes,
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
  selectFittingComposedClaudeFindings,
  selectFittingComposedClaudeNotices,
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

  it("enforces the exact 10 KiB host encoding without an item cap", () => {
    const six = Array.from({ length: 6 }, (_, index) => [finding(index)]);
    expect(fitsCombinedResponse(six)).toBe(true);
    expect(encodedHostOutputBytes(combinedFindingOutput(six))).toBeLessThanOrEqual(MAX_COMBINED_RESPONSE_BYTES);

    const oversized = [[finding(0, "x".repeat(MAX_COMBINED_RESPONSE_BYTES))]];
    expect(fitsCombinedResponse(oversized)).toBe(false);
    expect(encodedHostOutputBytes(combinedFindingOutput(oversized))).toBeGreaterThan(MAX_COMBINED_RESPONSE_BYTES);
    expect(fitsCombinedResponse([])).toBe(false);
  });

  it("selects flattened findings from a unit until the byte bound", () => {
    const nineFromOneUnit = Array.from({ length: 9 }, (_, index) => finding(index));
    expect(fitsCombinedResponse([nineFromOneUnit])).toBe(true);
    const selected = selectFittingFindings([], nineFromOneUnit);
    expect(selected).toHaveLength(9);
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

  it("keeps the legacy notice helper within the byte bound", () => {
    const findings = Array.from({ length: 6 }, (_, index) => finding(index));
    const notice = { kind: "backend" as const, suppressedCount: 2 };
    const baseline = encodedHostOutputBytes(combinedReviewOutput([finding(0, "")], []));
    const full = finding(0, "x".repeat(MAX_COMBINED_RESPONSE_BYTES - baseline));
    expect(selectFittingNotices([full], [], [notice])).toEqual([]);
    expect(selectFittingNotices(findings, [], [notice])).toEqual([notice]);
    const output = combinedReviewOutput(findings, [notice]);
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
    const six = Array.from({ length: 6 }, (_, index) => finding(index));
    expect(selectFittingClaudeFindings([], six, "block-current-findings")).toEqual(six);
    const output = combinedClaudeOutput(six, [], "block-current-findings");
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

  it.each(["background", "stop"] as const)("bounds the final composed Claude %s response", (surface) => {
    const baseline = encodedComposedClaudeOutputBytes([finding(0, "")], [], surface);
    const exact = finding(0, "x".repeat(MAX_COMBINED_RESPONSE_BYTES - baseline));
    expect(encodedComposedClaudeOutputBytes([exact], [], surface)).toBe(MAX_COMBINED_RESPONSE_BYTES);
    expect(selectFittingComposedClaudeFindings([], [exact], surface)).toEqual([exact]);
    expect(selectFittingComposedClaudeFindings([], [{ ...exact, message: `${exact.message}x` }], surface)).toEqual([]);
    expect(selectFittingComposedClaudeNotices([exact], [{ kind: "backend", suppressedCount: 0 }], surface)).toEqual([]);
    const output = composedClaudeHostOutput(combinedReviewOutput([exact], []), 1, surface);
    expect(Buffer.byteLength(`${JSON.stringify(output)}\n`, "utf8")).toBe(MAX_COMBINED_RESPONSE_BYTES);
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

  it("skips an unfitting Claude notice but stops the Codex notice prefix", () => {
    const short = { kind: "backend" as const, suppressedCount: 0 };
    const long = { kind: "credential" as const, suppressedCount: 0 };
    const claudeBytes = encodedClaudeHostOutputBytes(combinedClaudeOutput(
      [finding(0, "")], [short], "block-current-findings"));
    const claudeFinding = finding(0, "x".repeat(MAX_COMBINED_RESPONSE_BYTES - claudeBytes));
    expect(fitsClaudeReviewResponse([claudeFinding], [short], "block-current-findings")).toBe(true);
    expect(fitsClaudeReviewResponse([claudeFinding], [long], "block-current-findings")).toBe(false);
    expect(selectFittingClaudeNotices([claudeFinding], [long, short], "block-current-findings"))
      .toEqual([short]);

    const codexBytes = encodedHostOutputBytes(combinedReviewOutput([finding(0, "")], [short]));
    const codexFinding = finding(0, "x".repeat(MAX_COMBINED_RESPONSE_BYTES - codexBytes));
    expect(fitsCombinedResponse([[codexFinding]])).toBe(true);
    expect(selectFittingNotices([codexFinding], [], [long, short])).toEqual([]);
  });
});
