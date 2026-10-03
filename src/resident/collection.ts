import { formatReviewFeedback } from "../feedback/message.ts";
import { Effect } from "effect";
import type { CodexDirectEventOutput, Finding } from "../direct-event/pipeline.ts";
import { toCodexDirectEventOutput } from "../direct-event/pipeline.ts";
import { encodedCodexHostOutputBytes } from "../direct-event/writer.ts";
import { encodeClaudeHostOutputLine, type ClaudeHostOutput } from "../direct-event/claude-output.ts";
import { initialCanonical, stepCanonical, type CanonicalEvent } from "../canonical/adapter.ts";
import { GLOBAL_BYTE_LIMIT, GLOBAL_ITEM_LIMIT, PARTITION_BYTE_LIMIT, PARTITION_ITEM_LIMIT } from "./capacity.ts";
export type { ClaudeBlockOutput, ClaudeHostOutput } from "../direct-event/claude-output.ts";

export const PENDING_ADVICE_EXPIRY_MS = 600_000;
export const MAX_COMBINED_RESPONSE_BYTES = 10 * 1024;

export type OperationalNoticeKind = "capacity" | "backend" | "credential" | "output-limit";

export type OperationalNotice = {
  readonly kind: OperationalNoticeKind;
  readonly suppressedCount: number;
};

export type ClaudeOutputMode = "advisory" | "block-current-findings";

export type CollectionCandidate = {
  readonly sequence: number;
  readonly pendingAt: number;
};

export type CollectionMode = "ordinary" | "turn-end";

const standaloneLimits = {
  globalItems: GLOBAL_ITEM_LIMIT,
  globalBytes: GLOBAL_BYTE_LIMIT,
  partitionItems: PARTITION_ITEM_LIMIT,
  partitionBytes: PARTITION_BYTE_LIMIT,
};

const canonicalCollectionCommand = (event: CanonicalEvent): string => {
  const result = stepCanonical(initialCanonical(standaloneLimits), event);
  if (result.rejection !== undefined || result.commands.length !== 1) {
    throw new Error("canonical collection decision refused");
  }
  return result.commands[0]!.kind;
};

export const collectionOrder = <A extends Pick<CollectionCandidate, "sequence">>(left: A, right: A): number => {
  switch (
    canonicalCollectionCommand({
      kind: "collectionOrderCheck",
      leftSequence: left.sequence,
      rightSequence: right.sequence,
    })
  ) {
    case "collectionBefore":
      return -1;
    case "collectionEqual":
      return 0;
    case "collectionAfter":
      return 1;
    default:
      throw new Error("invalid canonical collection order");
  }
};

const elapsedForBend = (now: number, started: number, limit: number): number => {
  const bounded = Math.min(limit, Math.max(0, now - started));
  return Number.isNaN(bounded) ? 0 : Math.floor(bounded);
};

export const isPendingAdviceExpired = (candidate: Pick<CollectionCandidate, "pendingAt">, now: number): boolean =>
  canonicalCollectionCommand({
    kind: "collectionExpiryCheck",
    elapsed: elapsedForBend(now, candidate.pendingAt, PENDING_ADVICE_EXPIRY_MS),
    lifetime: PENDING_ADVICE_EXPIRY_MS,
  }) === "collectionExpired";

/** Bytes actually handed to the host writer, including its line terminator. */
export const encodedHostOutputBytes = (output: CodexDirectEventOutput): number => encodedCodexHostOutputBytes(output);

export const combinedFindingOutput = (groups: ReadonlyArray<ReadonlyArray<Finding>>): CodexDirectEventOutput =>
  toCodexDirectEventOutput(groups.flatMap((findings) => findings));

const noticeText = (notice: OperationalNotice): string => {
  const message =
    notice.kind === "capacity"
      ? "Operational notice: review capacity was unavailable; some eligible edits were not reviewed."
      : notice.kind === "credential"
        ? "Operational notice: the saved review credential was unavailable; run hapsland --login in a user terminal to unlock or approve native access, then retry. Background hooks never prompt."
        : notice.kind === "output-limit"
          ? "Operational notice: a review finding exceeded the host response limit and could not be delivered."
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
  return {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: formatReviewFeedback(findings, notices.map(noticeText)),
    },
  };
};

/** Final Claude envelope. The resident budgets this exact serialized line before leasing. */
export const combinedClaudeOutput = (
  findings: ReadonlyArray<Finding>,
  notices: ReadonlyArray<OperationalNotice>,
  mode: ClaudeOutputMode,
): ClaudeHostOutput => {
  const text = formatReviewFeedback(findings, notices.map(noticeText));
  return mode === "block-current-findings" && findings.length > 0
    ? { decision: "block", reason: text }
    : { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text } };
};

export const encodedClaudeHostOutputBytes = (output: ClaudeHostOutput): number =>
  Buffer.byteLength(encodeClaudeHostOutputLine(output), "utf8");

/** Match the final JSONL object written by the composed Claude hook. */
export const claudeStopHostOutput = (
  output: CodexDirectEventOutput,
  findingCount: number,
): { readonly decision: "block"; readonly reason: string } | { readonly systemMessage: string } => {
  const message = output.hookSpecificOutput.additionalContext;
  return findingCount > 0 ? { decision: "block", reason: message } : { systemMessage: message };
};

export const encodedClaudeStopOutputBytes = (
  findings: ReadonlyArray<Finding>,
  notices: ReadonlyArray<OperationalNotice>,
): number =>
  Buffer.byteLength(
    `${JSON.stringify(claudeStopHostOutput(combinedReviewOutput(findings, notices), findings.length))}\n`,
    "utf8",
  );

const fitsBendBatch = (items: number, bytes: number): boolean => {
  try {
    return canonicalCollectionCommand({ kind: "collectionFitCheck", items, bytes }) === "collectionFits";
  } catch {
    return false;
  }
};

/** The exact host encoding is measured here; Bend owns the inclusion rule. */
export type FindingSelectionFacts = {
  readonly partition: number;
  readonly round: number;
  readonly unit: number;
  readonly snapshot: number;
  readonly currentSnapshot: number;
  readonly credential: number;
  readonly currentCredential: number;
  readonly ageMs: number;
  readonly collectionReady: boolean;
};

const previouslyValidated: FindingSelectionFacts = {
  partition: 1,
  round: 1,
  unit: 1,
  snapshot: 1,
  currentSnapshot: 1,
  credential: 1,
  currentCredential: 1,
  ageMs: 0,
  collectionReady: true,
};

export type CanonicalFindingOffer = (input: {
  readonly selectionPartition: number;
  readonly selectionRound: number;
  readonly facts: FindingSelectionFacts;
  readonly selectedCount: number;
  readonly soloBytes: number;
  readonly prospectiveBytes: number;
}) => Effect.Effect<"selected" | "retained" | "limited" | "expired">;

export type CanonicalNoticeOffer = (
  items: number,
  bytes: number,
  skipUnfitting: boolean,
) => "include" | "skip" | "stop";

const standaloneFindingOffer: CanonicalFindingOffer = Effect.fn("Collection.standaloneFindingOffer")(function* (input) {
  const facts = input.facts;
  const command = canonicalCollectionCommand({
    kind: "collectionFindingCheck",
    selectionPartition: input.selectionPartition,
    selectionRound: input.selectionRound,
    unit: facts.unit,
    partition: facts.partition,
    round: facts.round,
    snapshot: facts.snapshot,
    currentSnapshot: facts.currentSnapshot,
    credential: facts.credential,
    currentCredential: facts.currentCredential,
    ageMs: facts.ageMs,
    soloBytes: input.soloBytes,
    collectionReady: facts.collectionReady,
    selectedCount: input.selectedCount,
    prospectiveBytes: input.prospectiveBytes,
  });
  switch (command) {
    case "collectionFindingSelected":
      return "selected";
    case "collectionFindingRetained":
      return "retained";
    case "collectionFindingLimited":
      return "limited";
    case "collectionFindingExpired":
      return "expired";
    default:
      throw new Error("invalid canonical finding offer");
  }
});

const standaloneNoticeOffer: CanonicalNoticeOffer = (items, bytes, skipUnfitting) => {
  const command = canonicalCollectionCommand({ kind: "collectionNoticeCheck", items, bytes, skipUnfitting });
  switch (command) {
    case "collectionNoticeIncluded":
      return "include";
    case "collectionNoticeSkipped":
      return "skip";
    case "collectionNoticeStopped":
      return "stop";
    default:
      throw new Error("invalid canonical notice offer");
  }
};

const selectBendFindings = Effect.fn("Collection.selectBendFindings")(
  function* (
    retained: ReadonlyArray<Finding>,
    candidates: ReadonlyArray<Finding>,
    encodedBytes: (findings: ReadonlyArray<Finding>) => number,
    facts: FindingSelectionFacts = previouslyValidated,
    onLimited?: (finding: Finding) => void,
    canonicalOffer?: CanonicalFindingOffer,
  ): Effect.fn.Return<ReadonlyArray<Finding>> {
    try {
      const staged: Array<Finding> = [];
      const selected: Array<Finding> = [];
      const offer = Effect.fn("Collection.offerFinding")(function* (finding: Finding, validated: boolean) {
        const prospectiveBytes = encodedBytes([...staged, finding]);
        const current = validated ? previouslyValidated : facts;
        const soloBytes = encodedBytes([finding]);
        const decision = yield* (canonicalOffer ?? standaloneFindingOffer)({
          selectionPartition: facts.partition,
          selectionRound: facts.round,
          facts: { ...current, partition: facts.partition, round: facts.round },
          selectedCount: staged.length,
          soloBytes,
          prospectiveBytes,
        });
        if (decision === "limited" && !validated) onLimited?.(finding);
        if (decision !== "selected") return false;
        staged.push(finding);
        return true;
      });
      for (const finding of retained) if (!(yield* offer(finding, true))) return [];
      for (const finding of candidates) if (yield* offer(finding, false)) selected.push(finding);
      return selected;
    } catch {
      return [];
    }
  },
  (effect) => effect.pipe(Effect.catchDefect(() => Effect.succeed([]))),
);

/** Final writer barrier: every offered finding carries its own current facts. */
const collectionFindingsBytes = (
  mode: ClaudeOutputMode | "codex" | "claude-stop",
  findings: ReadonlyArray<Finding>,
): number => {
  if (mode === "codex") return encodedHostOutputBytes(combinedReviewOutput(findings, []));
  if (mode === "claude-stop") return encodedClaudeStopOutputBytes(findings, []);
  return encodedClaudeHostOutputBytes(combinedClaudeOutput(findings, [], mode));
};

export const selectFittingCurrentFindingIndices = Effect.fn("Collection.selectFittingCurrentFindingIndices")(
  function* (
    offers: ReadonlyArray<{ readonly finding: Finding; readonly facts: FindingSelectionFacts }>,
    mode: ClaudeOutputMode | "codex" | "claude-stop",
    onLimited?: (index: number) => void,
    canonicalOffer?: CanonicalFindingOffer,
  ): Effect.fn.Return<ReadonlyArray<number>> {
    if (offers.length === 0) return [];
    try {
      const first = offers[0]!.facts;
      const staged: Array<Finding> = [];
      const selected: Array<number> = [];
      for (const [index, { finding, facts }] of offers.entries()) {
        const next = [...staged, finding];
        const prospectiveBytes = collectionFindingsBytes(mode, next);
        const soloBytes = collectionFindingsBytes(mode, [finding]);
        const decision = yield* (canonicalOffer ?? standaloneFindingOffer)({
          selectionPartition: first.partition,
          selectionRound: first.round,
          facts,
          selectedCount: staged.length,
          soloBytes,
          prospectiveBytes,
        });
        if (decision === "limited") onLimited?.(index);
        if (decision !== "selected") continue;
        staged.push(finding);
        selected.push(index);
      }
      return selected;
    } catch {
      return [];
    }
  },
  (effect) => effect.pipe(Effect.catchDefect(() => Effect.succeed([]))),
);

export const fitsClaudeReviewResponse = (
  findings: ReadonlyArray<Finding>,
  notices: ReadonlyArray<OperationalNotice>,
  mode: ClaudeOutputMode,
): boolean =>
  fitsBendBatch(
    findings.length + notices.length,
    encodedClaudeHostOutputBytes(combinedClaudeOutput(findings, notices, mode)),
  );

export const selectFittingClaudeFindings = Effect.fn("Collection.selectFittingClaudeFindings")(
  (
    retained: ReadonlyArray<Finding>,
    candidates: ReadonlyArray<Finding>,
    mode: ClaudeOutputMode,
    facts?: FindingSelectionFacts,
    onLimited?: (finding: Finding) => void,
    canonicalOffer?: CanonicalFindingOffer,
  ) =>
    selectBendFindings(
      retained,
      candidates,
      (findings) => encodedClaudeHostOutputBytes(combinedClaudeOutput(findings, [], mode)),
      facts,
      onLimited,
      canonicalOffer,
    ),
);

export const selectFittingClaudeNotices = (
  findings: ReadonlyArray<Finding>,
  candidates: ReadonlyArray<OperationalNotice>,
  mode: ClaudeOutputMode,
  canonicalOffer?: CanonicalNoticeOffer,
): ReadonlyArray<OperationalNotice> => {
  const selected: Array<OperationalNotice> = [];
  try {
    for (const notice of candidates) {
      const next = [...selected, notice];
      const items = findings.length + next.length;
      const bytes = encodedClaudeHostOutputBytes(combinedClaudeOutput(findings, next, mode));
      const offer = (canonicalOffer ?? standaloneNoticeOffer)(items, bytes, true);
      if (offer === "include") selected.push(notice);
      else if (offer === "stop") break;
      else if (offer !== "skip") return [];
    }
  } catch {
    return [];
  }
  return selected;
};

export const fitsCombinedReviewResponse = (
  findings: ReadonlyArray<Finding>,
  notices: ReadonlyArray<OperationalNotice>,
): boolean =>
  fitsBendBatch(findings.length + notices.length, encodedHostOutputBytes(combinedReviewOutput(findings, notices)));

export const fitsCombinedResponse = (groups: ReadonlyArray<ReadonlyArray<Finding>>): boolean =>
  fitsCombinedReviewResponse(
    groups.flatMap((findings) => findings),
    [],
  );

/** Selects deterministic finding items without treating one unit as one item. */
export const selectFittingFindings = Effect.fn("Collection.selectFittingFindings")(
  (
    retained: ReadonlyArray<Finding>,
    candidates: ReadonlyArray<Finding>,
    facts?: FindingSelectionFacts,
    onLimited?: (finding: Finding) => void,
    canonicalOffer?: CanonicalFindingOffer,
  ) =>
    selectBendFindings(
      retained,
      candidates,
      (findings) => encodedHostOutputBytes(combinedReviewOutput(findings, [])),
      facts,
      onLimited,
      canonicalOffer,
    ),
);

export const selectFittingClaudeStopFindings = Effect.fn("Collection.selectFittingClaudeStopFindings")(
  (
    retained: ReadonlyArray<Finding>,
    candidates: ReadonlyArray<Finding>,
    facts?: FindingSelectionFacts,
    onLimited?: (finding: Finding) => void,
    canonicalOffer?: CanonicalFindingOffer,
  ) =>
    selectBendFindings(
      retained,
      candidates,
      (findings) => encodedClaudeStopOutputBytes(findings, []),
      facts,
      onLimited,
      canonicalOffer,
    ),
);

export const selectFittingClaudeStopNotices = (
  findings: ReadonlyArray<Finding>,
  candidates: ReadonlyArray<OperationalNotice>,
  canonicalOffer?: CanonicalNoticeOffer,
): ReadonlyArray<OperationalNotice> => {
  const selected: Array<OperationalNotice> = [];
  try {
    for (const notice of candidates) {
      const next = [...selected, notice];
      const items = findings.length + next.length;
      const bytes = encodedClaudeStopOutputBytes(findings, next);
      const offer = (canonicalOffer ?? standaloneNoticeOffer)(items, bytes, true);
      if (offer === "include") selected.push(notice);
      else if (offer === "stop") break;
      else if (offer !== "skip") return [];
    }
  } catch {
    return [];
  }
  return selected;
};

/** Findings are passed as already retained so notices can never displace them. */
export const selectFittingNotices = (
  findings: ReadonlyArray<Finding>,
  retained: ReadonlyArray<OperationalNotice>,
  candidates: ReadonlyArray<OperationalNotice>,
  canonicalOffer?: CanonicalNoticeOffer,
): ReadonlyArray<OperationalNotice> => {
  const selected: Array<OperationalNotice> = [];
  try {
    for (const notice of candidates) {
      const next = [...retained, ...selected, notice];
      const items = findings.length + next.length;
      const bytes = encodedHostOutputBytes(combinedReviewOutput(findings, next));
      const offer = (canonicalOffer ?? standaloneNoticeOffer)(items, bytes, false);
      if (offer === "include") selected.push(notice);
      else if (offer === "stop") break;
      else if (offer !== "skip") return [];
    }
  } catch {
    return [];
  }
  return selected;
};
