import { lstat, readdir, readFile as fsReadFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { Dirent, Stats } from "node:fs";
import { canPruneDirectory, eligibility, type PrototypePolicy } from "./policy.ts";
import {
  sha256,
  sortedEntries,
  type Manifest,
  type ManifestEntry,
  type ScanIssue,
  type ScanResult,
  type ScanStats,
} from "./protocol.ts";

export type ScanOptions = {
  readonly maxFiles?: number;
  readonly maxBytes?: number;
  readonly beforeRead?: (absolutePath: string, relativePath: string) => void | Promise<void>;
  readonly beforeDirectoryRead?: (absolutePath: string, relativePath: string) => void | Promise<void>;
  readonly readFile?: (absolutePath: string, relativePath: string) => Promise<Uint8Array>;
  readonly failReadPaths?: ReadonlySet<string>;
  readonly failDirectoryPaths?: ReadonlySet<string>;
};

const asRelative = (root: string, absolutePath: string): string => {
  const value = relative(root, absolutePath).replaceAll("\\", "/");
  if (value.length === 0 || value.startsWith("../") || value === ".." || value.includes("\0")) {
    throw new Error("path escaped the repository root");
  }
  return value;
};

const statIdentity = (stat: Stats): string => {
  const value = stat as Stats & { readonly mtimeNs?: bigint; readonly ctimeNs?: bigint };
  return [
    stat.dev,
    stat.ino,
    stat.mode,
    stat.size,
    value.mtimeNs?.toString() ?? String(stat.mtimeMs),
    value.ctimeNs?.toString() ?? String(stat.ctimeMs),
  ].join(":");
};

const regularMode = (stat: Stats): number => stat.mode & 0o777;

type DirectorySnapshot = {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly identity: string;
  readonly entryFacts: string;
};

const direntKind = (entry: Dirent): string => {
  if (entry.isDirectory()) return "directory";
  if (entry.isFile()) return "file";
  if (entry.isSymbolicLink()) return "symlink";
  if (entry.isBlockDevice()) return "block-device";
  if (entry.isCharacterDevice()) return "character-device";
  if (entry.isFIFO()) return "fifo";
  if (entry.isSocket()) return "socket";
  return "other";
};

const directoryEntryFacts = (children: ReadonlyArray<Dirent>): string =>
  children.map((child) => `${child.name}:${direntKind(child)}`).join("\n");

/**
 * Walk the captured product policy and hash only stable, eligible regular files.
 * The result intentionally has no source bytes. Any read/enumeration problem
 * suppresses the manifest so callers cannot mistake a partial walk for clean.
 * Every traversed directory is also revalidated after the walk using its
 * identity and sorted entry facts. This catches a non-adversarial writer that
 * adds a child to an already-enumerated directory while another directory is
 * being scanned, so the checkpoint remains incomplete instead of advancing.
 */
export const scanManifest = async (
  rootInput: string,
  policy: PrototypePolicy,
  options: ScanOptions = {},
): Promise<ScanResult> => {
  const root = resolve(rootInput);
  const startedAt = performance.now();
  const startedCpu = process.cpuUsage();
  const entries: ManifestEntry[] = [];
  const issues: ScanIssue[] = [];
  const skipped: ScanResult["skipped"] extends ReadonlyArray<infer T> ? T[] : never = [];
  const readPaths: string[] = [];
  let filesVisited = 0;
  let eligibleFiles = 0;
  let bytesRead = 0;
  let contentReads = 0;
  let directoriesVisited = 0;
  let aborted = false;
  const directorySnapshots: DirectorySnapshot[] = [];

  const fail = (code: ScanIssue["code"], path: string): void => {
    issues.push({ code, path });
    aborted = true;
  };

  const walk = async (absoluteDirectory: string, relativeDirectory: string): Promise<void> => {
    if (aborted) return;
    directoriesVisited += 1;
    if (options.failDirectoryPaths?.has(relativeDirectory)) {
      fail("enumeration_error", relativeDirectory || ".");
      return;
    }
    try {
      const beforeDirectory = await lstat(absoluteDirectory);
      if (!beforeDirectory.isDirectory()) {
        fail("enumeration_error", relativeDirectory || ".");
        return;
      }
      await options.beforeDirectoryRead?.(absoluteDirectory, relativeDirectory);
      const children = await readdir(absoluteDirectory, { withFileTypes: true });
      children.sort((left, right) => left.name.localeCompare(right.name));
      directorySnapshots.push({
        absolutePath: absoluteDirectory,
        relativePath: relativeDirectory,
        identity: statIdentity(beforeDirectory),
        entryFacts: directoryEntryFacts(children),
      });
      for (const child of children) {
        if (aborted) return;
        const childAbsolute = join(absoluteDirectory, child.name);
        const childRelative = relativeDirectory.length === 0
          ? child.name
          : `${relativeDirectory}/${child.name}`;
        if (child.isDirectory()) {
          if (!canPruneDirectory(policy, childRelative)) {
            await walk(childAbsolute, childRelative);
          }
          continue;
        }
        let stat: Stats;
        try {
          stat = await lstat(childAbsolute);
        } catch {
          fail("enumeration_error", childRelative);
          return;
        }
        if (stat.isSymbolicLink()) {
          skipped.push({ path: childRelative, reason: "symlink" });
          continue;
        }
        if (!stat.isFile()) {
          skipped.push({ path: childRelative, reason: "nonregular" });
          continue;
        }
        filesVisited += 1;
        const selected = eligibility(policy, childRelative);
        if (!selected.eligible) {
          skipped.push({ path: childRelative, reason: "ineligible" });
          continue;
        }
        eligibleFiles += 1;
        if (options.maxFiles !== undefined && contentReads >= options.maxFiles) {
          fail("budget_exceeded", childRelative);
          return;
        }
        try {
          await options.beforeRead?.(childAbsolute, childRelative);
          const before = await lstat(childAbsolute);
          if (!before.isFile()) {
            fail("unstable_read", childRelative);
            return;
          }
          if (options.failReadPaths?.has(childRelative)) {
            throw new Error("injected read failure");
          }
          const read = options.readFile ?? ((path: string) => fsReadFile(path));
          const bytes = await read(childAbsolute, childRelative);
          const after = await lstat(childAbsolute);
          contentReads += 1;
          bytesRead += bytes.byteLength;
          readPaths.push(childRelative);
          if (options.maxBytes !== undefined && bytesRead > options.maxBytes) {
            fail("budget_exceeded", childRelative);
            return;
          }
          if (statIdentity(before) !== statIdentity(after)) {
            fail("unstable_read", childRelative);
            return;
          }
          entries.push({
            path: childRelative,
            contentHash: sha256(bytes),
            size: bytes.byteLength,
            mode: regularMode(after),
          });
        } catch {
          fail("read_error", childRelative);
          return;
        }
      }
    } catch {
      fail("enumeration_error", relativeDirectory || ".");
    }
  };

  const validateDirectories = async (): Promise<void> => {
    if (aborted) return;
    for (const snapshot of directorySnapshots) {
      if (aborted) return;
      try {
        const beforeEntries = await lstat(snapshot.absolutePath);
        if (!beforeEntries.isDirectory() || statIdentity(beforeEntries) !== snapshot.identity) {
          fail("unstable_read", snapshot.relativePath || ".");
          return;
        }
        const children = await readdir(snapshot.absolutePath, { withFileTypes: true });
        children.sort((left, right) => left.name.localeCompare(right.name));
        const afterEntries = await lstat(snapshot.absolutePath);
        if (
          !afterEntries.isDirectory() ||
          statIdentity(afterEntries) !== snapshot.identity ||
          directoryEntryFacts(children) !== snapshot.entryFacts
        ) {
          fail("unstable_read", snapshot.relativePath || ".");
          return;
        }
      } catch {
        fail("enumeration_error", snapshot.relativePath || ".");
        return;
      }
    }
  };

  try {
    await walk(root, "");
    await validateDirectories();
  } catch {
    fail("enumeration_error", ".");
  }

  const cpu = process.cpuUsage(startedCpu);
  const stats: ScanStats = {
    filesVisited,
    eligibleFiles,
    bytesRead,
    contentReads,
    directoriesVisited,
    elapsedMs: performance.now() - startedAt,
    cpuUserMs: cpu.user / 1_000,
    cpuSystemMs: cpu.system / 1_000,
  };
  const complete = issues.length === 0 && !aborted;
  const result = {
    complete,
    ...(complete
      ? {
          manifest: {
            schemaVersion: 1 as const,
            policyDigest: policy.digest,
            entries: sortedEntries(entries),
          } satisfies Manifest,
        }
      : {}),
    issues,
    skipped,
    readPaths,
    stats,
  } satisfies ScanResult;
  return result;
};

/** Ensure callers can verify that a recorded path is repository-relative. */
export const relativePathFor = asRelative;
