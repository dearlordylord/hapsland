import { createHash } from "node:crypto";

export type ChangeKind = "added" | "modified" | "deleted";

export type ManifestEntry = {
  readonly path: string;
  readonly contentHash: string;
  readonly size: number;
  readonly mode: number;
};

export type Manifest = {
  readonly schemaVersion: 1;
  readonly policyDigest: string;
  readonly entries: ReadonlyArray<ManifestEntry>;
};

export type Change = {
  readonly path: string;
  readonly kind: ChangeKind;
  readonly beforeContentHash?: string;
  readonly afterContentHash?: string;
  readonly beforeSize?: number;
  readonly afterSize?: number;
};

export type IssueCode =
  | "enumeration_error"
  | "read_error"
  | "unstable_read"
  | "budget_exceeded";

export type ScanIssue = {
  readonly code: IssueCode;
  readonly path: string;
};

export type ScanStats = {
  readonly filesVisited: number;
  readonly eligibleFiles: number;
  readonly bytesRead: number;
  readonly contentReads: number;
  readonly directoriesVisited: number;
  readonly elapsedMs: number;
  readonly cpuUserMs: number;
  readonly cpuSystemMs: number;
};

export type ScanResult = {
  readonly complete: boolean;
  /** Deliberately absent for incomplete scans: a partial manifest is never a checkpoint. */
  readonly manifest?: Manifest;
  readonly issues: ReadonlyArray<ScanIssue>;
  readonly skipped: ReadonlyArray<{
    readonly path: string;
    readonly reason: "symlink" | "nonregular" | "ineligible";
  }>;
  readonly readPaths: ReadonlyArray<string>;
  readonly stats: ScanStats;
};

export type ReconcileStatus =
  | "baseline_seeded"
  | "complete"
  | "incomplete"
  | "baseline_reset";

export type ReconcileResult = {
  readonly status: ReconcileStatus;
  readonly changes: ReadonlyArray<Change>;
  readonly issues: ReadonlyArray<ScanIssue>;
  readonly coverage: "complete" | "unknown";
  readonly advanced: boolean;
  readonly stateKind: "none" | "valid" | "corrupt" | "incompatible";
  readonly stats: ScanStats;
};

export const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

/** Stable JSON for policy/state identities and source-free evidence. */
export const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const digest = (value: unknown): string => sha256(stableJson(value));

export const sortedEntries = (
  entries: ReadonlyArray<ManifestEntry>,
): ReadonlyArray<ManifestEntry> =>
  [...entries].sort((left, right) => left.path.localeCompare(right.path));

export const summarizeIssues = (
  issues: ReadonlyArray<ScanIssue>,
): ReadonlyArray<{ readonly code: IssueCode; readonly count: number }> => {
  const counts = new Map<IssueCode, number>();
  for (const issue of issues) counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => ({ code, count }));
};
