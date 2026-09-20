import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { diffManifests } from "./diff.ts";
import { scanManifest, type ScanOptions } from "./scan.ts";
import {
  digest,
  sha256,
  type Manifest,
  type ReconcileResult,
  type ScanIssue,
  type ScanStats,
} from "./protocol.ts";
import type { PrototypePolicy } from "./policy.ts";

export type PersistedState = {
  readonly schemaVersion: 1;
  readonly rootKey: string;
  readonly policyDigest: string;
  readonly sequence: number;
  readonly manifest: Manifest;
};

export type StateLoad =
  | { readonly kind: "none" }
  | { readonly kind: "corrupt" }
  | { readonly kind: "incompatible" }
  | { readonly kind: "valid"; readonly state: PersistedState };

export const canonicalRoot = async (root: string): Promise<string> => realpath(root);

export const rootKeyFor = async (root: string): Promise<string> =>
  sha256(await canonicalRoot(root));

const isManifest = (value: unknown): value is Manifest => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || typeof record.policyDigest !== "string") return false;
  if (!Array.isArray(record.entries)) return false;
  return record.entries.every((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const item = entry as Record<string, unknown>;
    return (
      typeof item.path === "string" &&
      typeof item.contentHash === "string" &&
      typeof item.size === "number" &&
      Number.isSafeInteger(item.size) &&
      item.size >= 0 &&
      typeof item.mode === "number" &&
      Number.isSafeInteger(item.mode)
    );
  });
};

const isPersistedState = (value: unknown): value is PersistedState => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    typeof record.rootKey === "string" &&
    typeof record.policyDigest === "string" &&
    typeof record.sequence === "number" &&
    Number.isSafeInteger(record.sequence) &&
    record.sequence >= 1 &&
    isManifest(record.manifest)
  );
};

export class ManifestStateStore {
  readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  async pathForRoot(root: string): Promise<string> {
    return join(this.directory, `${await rootKeyFor(root)}.json`);
  }

  async load(root: string, policyDigest: string): Promise<StateLoad> {
    const path = await this.pathForRoot(root);
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "none" };
      return { kind: "corrupt" };
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      return { kind: "corrupt" };
    }
    if (!isPersistedState(decoded)) return { kind: "incompatible" };
    const expectedRootKey = await rootKeyFor(root);
    if (
      decoded.rootKey !== expectedRootKey ||
      decoded.policyDigest !== policyDigest ||
      decoded.manifest.policyDigest !== policyDigest
    ) {
      return { kind: "incompatible" };
    }
    return { kind: "valid", state: decoded };
  }

  async save(
    root: string,
    policyDigest: string,
    manifest: Manifest,
    sequence: number,
  ): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = await this.pathForRoot(root);
    const state: PersistedState = {
      schemaVersion: 1,
      rootKey: await rootKeyFor(root),
      policyDigest,
      sequence,
      manifest,
    };
    const temporary = `${path}.${process.pid}.tmp`;
    const encoded = `${JSON.stringify(state)}\n`;
    await writeFile(temporary, encoded, { encoding: "utf8", mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, path);
  }

  async bytesForRoot(root: string): Promise<number> {
    try {
      return (await stat(await this.pathForRoot(root))).size;
    } catch {
      return 0;
    }
  }
}

const emptyStats: ScanStats = {
  filesVisited: 0,
  eligibleFiles: 0,
  bytesRead: 0,
  contentReads: 0,
  directoriesVisited: 0,
  elapsedMs: 0,
  cpuUserMs: 0,
  cpuSystemMs: 0,
};

const stateIssue = (kind: "corrupt" | "incompatible"): ScanIssue => ({
  code: "enumeration_error",
  path: `state:${kind}`,
});

export const reconcile = async (options: {
  readonly root: string;
  readonly policy: PrototypePolicy;
  readonly store: ManifestStateStore;
  readonly scanOptions?: ScanOptions;
}): Promise<ReconcileResult> => {
  const loaded = await options.store.load(options.root, options.policy.digest);
  const scan = await scanManifest(options.root, options.policy, options.scanOptions);
  if (!scan.complete || scan.manifest === undefined) {
    return {
      status: "incomplete",
      changes: [],
      issues: scan.issues,
      coverage: "unknown",
      advanced: false,
      stateKind: loaded.kind,
      stats: scan.stats,
    };
  }
  if (loaded.kind !== "valid") {
    const issue = loaded.kind === "none" ? [] : [stateIssue(loaded.kind)];
    await options.store.save(options.root, options.policy.digest, scan.manifest, 1);
    return {
      status: loaded.kind === "none" ? "baseline_seeded" : "baseline_reset",
      changes: [],
      issues: issue,
      coverage: loaded.kind === "none" ? "complete" : "unknown",
      advanced: true,
      stateKind: loaded.kind,
      stats: scan.stats,
    };
  }
  const changes = diffManifests(loaded.state.manifest, scan.manifest);
  await options.store.save(
    options.root,
    options.policy.digest,
    scan.manifest,
    loaded.state.sequence + 1,
  );
  return {
    status: "complete",
    changes,
    issues: [],
    coverage: "complete",
    advanced: true,
    stateKind: "valid",
    stats: scan.stats,
  };
};

export const stateDigest = (state: PersistedState): string => digest(state);

export const noScanStats = emptyStats;
