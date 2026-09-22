import { createHash } from "node:crypto";
import type { CompiledRule } from "../rules/compiler.ts";

export const DIRECT_EVENT_INPUT_CONTRACT =
  "direct-event/same-file-single-named-type/v1" as const;

export type DirectRecipient = {
  readonly host: "codex-cli";
  readonly hostVersion: "0.155.1";
  readonly sessionId: string;
  readonly turnId: string;
  readonly toolUseId: string;
  readonly agentId: string | null;
};

export type AddCandidate = { readonly operation: "add"; readonly path: string };

export type DirectObservation = {
  readonly root: string;
  /** Physical working-tree and Git-administration identity captured at adaptation. */
  readonly rootIdentity: string;
  readonly recipient: DirectRecipient;
  readonly candidates: ReadonlyArray<AddCandidate>;
};

export type TypeDeclaration = {
  readonly kind: "interface" | "type-alias";
  readonly name: string;
  readonly source: string;
  readonly sourceHash: string;
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
