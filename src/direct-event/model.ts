import { createHash } from "node:crypto";
import type { CompiledRule } from "../rules/compiler.ts";

export const DIRECT_EVENT_INPUT_CONTRACT =
  "direct-event/same-file-named-types/v1" as const;

export type DirectRecipient = {
  readonly host: "codex-cli";
  readonly hostVersion: "0.155.1";
  readonly sessionId: string;
  readonly turnId: string;
  readonly toolUseId: string;
  readonly agentId: string | null;
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
  readonly recipient: DirectRecipient;
  readonly candidates: ReadonlyArray<DirectCandidate>;
};

export type TypeDeclaration = {
  readonly id: string;
  readonly kind: "interface" | "type-alias";
  readonly name: string;
  readonly source: string;
  readonly sourceHash: string;
};

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
  readonly artifact: TypeDeclaration;
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
};

export type ReviewInput = {
  readonly contract: string;
  readonly path: string;
  readonly declaration: TypeDeclaration;
  readonly unit: ReviewUnit;
  readonly rules: ReadonlyArray<FrozenRule>;
  readonly interpretation: "probability-strictly-greater-than-threshold";
};

export type PreparedUnit = {
  readonly root: string;
  readonly recipient: DirectRecipient;
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
    })),
  );
