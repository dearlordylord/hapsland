import { createHash } from "node:crypto";
import type { CompiledRule } from "../rules/compiler.ts";
import type { ReviewTargetV2 } from "../rules/v2-targets.ts";
import type { GraphLimits } from "../configuration/graph-limits.ts";
import { V1_DIRECT_TYPE_INPUT_CONTRACT } from "../rules/contracts.ts";

export const DIRECT_EVENT_INPUT_CONTRACT = V1_DIRECT_TYPE_INPUT_CONTRACT;

export const CODEX_HOST_VERSIONS = ["0.155.1", "0.156.0"] as const;
export type CodexHostVersion = typeof CODEX_HOST_VERSIONS[number];
export const isCodexHostVersion = (value: unknown): value is CodexHostVersion =>
  typeof value === "string" && CODEX_HOST_VERSIONS.some((version) => version === value);

export type DirectAdvicee = {
  readonly host: "codex-cli";
  readonly hostVersion: CodexHostVersion;
  readonly sessionId: string;
  readonly turnId: string;
  readonly toolUseId: string;
  readonly subagentId: string | null;
} | {
  readonly host: "claude-code";
  readonly hostVersion: "2.1.218";
  readonly sessionId: string;
  /** Claude 2.1.218 PostToolUse does not provide a turn identifier. */
  readonly turnId: null;
  readonly toolUseId: string;
  /** Preserve a supplied subagent identity; main-thread hooks may omit it. */
  readonly subagentId: string | null;
} | {
  readonly host: "opencode";
  readonly hostVersion: "1.14.44";
  readonly sessionId: string;
  readonly turnId: null;
  readonly toolUseId: string;
  readonly subagentId: null;
};

export type AddCandidate = {
  readonly operation: "add";
  readonly path: string;
  /** Native patch additions, without the patch marker. */
  readonly addedLines?: ReadonlyArray<string>;
};

export type DirectCandidate =
  | AddCandidate
  | { readonly operation: "update"; readonly path: string; readonly addedLines: ReadonlyArray<string> }
  | { readonly operation: "delete" | "move"; readonly path: string; readonly addedLines: readonly [] };

export type PhysicalRootIdentity = {
  readonly rootDevice: string;
  readonly rootInode: string;
  readonly gitDirectory: string;
  readonly gitDevice: string;
  readonly gitInode: string;
};

export type DirectObservation = {
  readonly root: string;
  /** Physical working-tree and Git-administration identity captured at adaptation. */
  readonly rootIdentity: PhysicalRootIdentity;
  readonly advicee: DirectAdvicee;
  readonly candidates: ReadonlyArray<DirectCandidate>;
  /** Bounded Codex patch retained only to verify v2 Update coordinates after capture. */
  readonly nativePatchCommand?: string;
};

export type TypeDeclaration = {
  readonly id: string;
  readonly kind: "interface" | "type-alias";
  readonly name: string;
  readonly source: string;
  readonly sourceHash: string;
};

export type ReviewArtifact = TypeDeclaration | (Omit<TypeDeclaration, "kind"> & { readonly kind: "function" });

export type ReferenceSite = {
  readonly symbol: string;
};

export type ArtifactReference =
  | {
      readonly kind: "expanded";
      readonly site: ReferenceSite;
      readonly node: ReviewNode;
    }
  | {
      readonly kind: "included";
      readonly site: ReferenceSite;
      readonly target: string;
    }
  | {
      readonly kind: "omitted";
      readonly site: ReferenceSite;
      readonly target:
        | { readonly kind: "known"; readonly artifactId: string }
        | { readonly kind: "unresolved"; readonly symbol: string };
      readonly reason: "unresolved" | "unsupported" | "reference-limit";
    };

export type ReviewNode = {
  readonly artifact: ReviewArtifact;
  readonly references: ReadonlyArray<ArtifactReference>;
};

export type ReviewUnit = {
  readonly root: ReviewNode;
};

export type SourceSnapshot = {
  readonly path: string;
  readonly operation: "add" | "update";
  readonly sourceHash: string;
};

export type PathObservationOutcome =
  | {
      readonly status: "observed";
      readonly path: string;
      readonly snapshot: SourceSnapshot;
      readonly units: ReadonlyArray<ReviewUnit>;
      readonly analysis:
        | { readonly status: "complete" }
        | {
            readonly status: "incomplete";
            readonly failures: ReadonlyArray<{
              readonly root: string | undefined;
              readonly reason:
                | "extension"
                | "parse"
                | "import"
                | "declaration-limit"
                | "declaration-merge"
                | "no-declarations"
                | "missing-evidence"
                | "unsupported-reference"
                | "reference-limit"
                | "ambiguous-update";
            }>;
          };
    }
  | {
      readonly status: "incomplete";
      readonly path: string;
      readonly reason:
        | "unsupported-operation"
        | "metadata-only"
        | "ineligible"
        | "capture-unavailable";
    };

export type ChangeSet = {
  readonly status: "complete";
  readonly changes: ReadonlyArray<SourceSnapshot>;
  readonly units: ReadonlyArray<ReviewUnit>;
};

export type ObservationResult =
  | {
      readonly status: "complete";
      readonly changeSet: ChangeSet;
      readonly outcomes: ReadonlyArray<PathObservationOutcome>;
    }
  | {
      readonly status: "incomplete";
      readonly outcomes: ReadonlyArray<PathObservationOutcome>;
      readonly units: ReadonlyArray<ReviewUnit>;
    };

export type FrozenRule = {
  readonly id: string;
  readonly qualifiedId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly packDigest: string;
  readonly definitionDigest: string;
  readonly threshold: number;
  readonly message: string;
  readonly rank: number;
  readonly decision: CompiledRule["decision"];
  readonly target?: ReviewTargetV2;
};

export type ReviewInput = {
  readonly contract: string;
  readonly graphLimits?: GraphLimits;
  /** Candidate graph/source profile requires explicit egress authorization. */
  readonly candidateProjection?: boolean;
  /** Only complete semantic units are eligible for evaluation or reuse. */
  readonly completeness: "complete";
  readonly path: string;
  readonly declaration: ReviewArtifact;
  readonly unit: ReviewUnit;
  readonly rules: ReadonlyArray<FrozenRule>;
  readonly interpretation: "probability-strictly-greater-than-threshold";
};

export type PreparedUnit = {
  readonly root: string;
  readonly advicee: DirectAdvicee;
  readonly input: ReviewInput;
  readonly identity: string;
};

export const canonicalValue = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalValue(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

export const semanticIdentity = (input: ReviewInput): string =>
  createHash("sha256").update(canonicalValue(input), "utf8").digest("hex");

const deepFreeze = <A>(value: A): A => {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
};

export const freezeInput = (value: ReviewInput): ReviewInput => deepFreeze(value);

export const freezeRules = (
  rules: ReadonlyArray<CompiledRule>,
  target?: { readonly artifactKind: "typeShape" | "function"; readonly inputContract: string },
): ReadonlyArray<FrozenRule> =>
  deepFreeze(
    rules.map((rule) => ({
      id: rule.id,
      qualifiedId: rule.qualifiedId,
      packId: rule.packId,
      packVersion: rule.packVersion,
      packDigest: rule.packDigest,
      definitionDigest: rule.definitionDigest,
      threshold: rule.threshold,
      message: rule.message,
      rank: rule.rank,
      decision: {
        ...rule.decision,
        criteria: { ...rule.decision.criteria },
      },
      ...(() => {
        const selected = target === undefined ? undefined : rule.reviewTargets?.find((candidate) =>
          candidate.artifactKind === target.artifactKind && candidate.inputContract === target.inputContract);
        return selected === undefined ? {} : { target: selected };
      })(),
    })),
  );
