import type { CodexDirectEventOutput, Finding } from "../direct-event/pipeline.ts";
import { DIRECT_EVENT_ADVISORY_HEADING, toCodexDirectEventOutput } from "../direct-event/pipeline.ts";
import { encodedCodexHostOutputBytes } from "../direct-event/writer.ts";
import { encodeClaudeHostOutputLine, type ClaudeHostOutput } from "../direct-event/claude-output.ts";
import {
  bendFitsBatch,
  bendSelectionInitial,
  bendSelectionStep,
  type BendAdvice,
  type BendSelection,
} from "./bend-policy.generated.js";
export type { ClaudeBlockOutput, ClaudeHostOutput } from "../direct-event/claude-output.ts";

export const ADVICE_COLLECTION_WINDOW_MS = 50;
export const PENDING_ADVICE_EXPIRY_MS = 600_000;
export const MAX_COMBINED_RESPONSE_ITEMS = 5;
export const MAX_COMBINED_RESPONSE_BYTES = 2 * 1024;

export type OperationalNoticeKind = "capacity" | "backend" | "credential";

export type OperationalNotice = {
  readonly kind: OperationalNoticeKind;
  readonly suppressedCount: number;
};

export type ClaudeOutputMode = "advisory" | "block-current-findings";

const CLAUDE_ADVISORY_HEADING = "Advisory: Edit succeeded. Please repair each finding.";
const CLAUDE_BLOCK_HEADING =
  "Hapsland found a current rule finding after this edit succeeded. Repair the listed finding(s) in the file, then continue.";

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

const noticeText = (notice: OperationalNotice): string => {
  const message = notice.kind === "capacity"
    ? "Operational notice: review capacity was unavailable; some eligible edits were not reviewed."
    : notice.kind === "credential"
      ? "Operational notice: the saved review credential was unavailable; run hapsland --login in a user terminal to unlock or approve native access, then retry. Background hooks never prompt."
      : "Operational notice: Jev was unavailable; some eligible edits were not reviewed.";
  return notice.suppressedCount === 0
    ? message
    : `${message} (${notice.suppressedCount} similar ${notice.suppressedCount === 1 ? "failure was" : "failures were"} suppressed.)`;
};

/** Encode findings and operational notices into one bounded host handoff. */
export const combinedReviewOutput = (
  findings: ReadonlyArray<Finding>,
  notices: ReadonlyArray<OperationalNotice>,
): CodexDirectEventOutput => {
  const findingOutput = toCodexDirectEventOutput(findings);
  return {
    hookSpecificOutput: {
      ...findingOutput.hookSpecificOutput,
      additionalContext: [
        findingOutput.hookSpecificOutput.additionalContext,
        ...notices.map(noticeText),
      ].join("\n"),
    },
  };
};

/** Final Claude envelope. The resident budgets this exact serialized line before leasing. */
export const combinedClaudeOutput = (
  findings: ReadonlyArray<Finding>,
  notices: ReadonlyArray<OperationalNotice>,
  mode: ClaudeOutputMode,
): ClaudeHostOutput => {
  const formatted = toCodexDirectEventOutput(findings).hookSpecificOutput.additionalContext;
  if (mode === "block-current-findings" && findings.length > 0) {
    return {
      decision: "block",
      reason: [
        CLAUDE_BLOCK_HEADING + formatted.slice(DIRECT_EVENT_ADVISORY_HEADING.length),
        ...(notices.length === 0 ? [] : ["Informational notices:", ...notices.map(noticeText)]),
      ].join("\n"),
    };
  }
  const context = findings.length > 0
    ? CLAUDE_ADVISORY_HEADING + formatted.slice(DIRECT_EVENT_ADVISORY_HEADING.length)
    : formatted;
  return {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: [context, ...notices.map(noticeText)].join("\n"),
    },
  };
};

export const encodedClaudeHostOutputBytes = (output: ClaudeHostOutput): number =>
  Buffer.byteLength(encodeClaudeHostOutputLine(output), "utf8");

const fitsBendBatch = (items: number, bytes: number): boolean => {
  try {
    return bendFitsBatch(items, bytes) === true;
  } catch {
    return false;
  }
};

/** The exact host encoding is measured here; Bend owns the inclusion rule. */
const selectBendFindings = (
  retained: ReadonlyArray<Finding>,
  candidates: ReadonlyArray<Finding>,
  encodedBytes: (findings: ReadonlyArray<Finding>) => number,
): ReadonlyArray<Finding> => {
  try {
    let selection: BendSelection = bendSelectionInitial(1, 1, 1, 1);
    const staged: Array<Finding> = [];
    const selected: Array<Finding> = [];
    let id = 1;
    const offer = (finding: Finding): boolean => {
      const prospectiveBytes = encodedBytes([...staged, finding]);
      const advice: BendAdvice = {
        $: "Advice", id: id++, unit: 1, partition: 1, round: 1,
        snapshot: 1, credential: 1, age_ms: 0,
        solo_bytes: encodedBytes([finding]), collection_ready: true,
      };
      const result = bendSelectionStep(selection, advice, prospectiveBytes);
      if (result.$ !== "Selected") return false;
      if (result.state.$ !== "Selection" || result.state.findings !== BigInt(staged.length + 1) ||
          result.state.bytes !== BigInt(prospectiveBytes)) throw new Error("invalid Bend selection");
      selection = result.state;
      staged.push(finding);
      return true;
    };
    for (const finding of retained) if (!offer(finding)) return [];
    for (const finding of candidates) if (offer(finding)) selected.push(finding);
    return selected;
  } catch {
    return [];
  }
};

export const fitsClaudeReviewResponse = (
  findings: ReadonlyArray<Finding>,
  notices: ReadonlyArray<OperationalNotice>,
  mode: ClaudeOutputMode,
): boolean => fitsBendBatch(findings.length + notices.length,
  encodedClaudeHostOutputBytes(combinedClaudeOutput(findings, notices, mode)));

export const selectFittingClaudeFindings = (
  retained: ReadonlyArray<Finding>,
  candidates: ReadonlyArray<Finding>,
  mode: ClaudeOutputMode,
): ReadonlyArray<Finding> => selectBendFindings(retained, candidates,
  (findings) => encodedClaudeHostOutputBytes(combinedClaudeOutput(findings, [], mode)));

export const selectFittingClaudeNotices = (
  findings: ReadonlyArray<Finding>,
  candidates: ReadonlyArray<OperationalNotice>,
  mode: ClaudeOutputMode,
): ReadonlyArray<OperationalNotice> => {
  const selected: Array<OperationalNotice> = [];
  for (const notice of candidates) {
    if (fitsClaudeReviewResponse(findings, [...selected, notice], mode)) selected.push(notice);
  }
  return selected;
};

export const fitsCombinedReviewResponse = (
  findings: ReadonlyArray<Finding>,
  notices: ReadonlyArray<OperationalNotice>,
): boolean => fitsBendBatch(findings.length + notices.length,
  encodedHostOutputBytes(combinedReviewOutput(findings, notices)));

export const fitsCombinedResponse = (
  groups: ReadonlyArray<ReadonlyArray<Finding>>,
): boolean => fitsCombinedReviewResponse(groups.flatMap((findings) => findings), []);

/** Selects deterministic finding items without treating one unit as one item. */
export const selectFittingFindings = (
  retained: ReadonlyArray<Finding>,
  candidates: ReadonlyArray<Finding>,
): ReadonlyArray<Finding> => selectBendFindings(retained, candidates,
  (findings) => encodedHostOutputBytes(combinedReviewOutput(findings, [])));

/** Findings are passed as already retained so notices can never displace them. */
export const selectFittingNotices = (
  findings: ReadonlyArray<Finding>,
  retained: ReadonlyArray<OperationalNotice>,
  candidates: ReadonlyArray<OperationalNotice>,
): ReadonlyArray<OperationalNotice> => {
  const selected: Array<OperationalNotice> = [];
  for (const notice of candidates) {
    const next = [...retained, ...selected, notice];
    if (!fitsCombinedReviewResponse(findings, next)) break;
    selected.push(notice);
  }
  return selected;
};
