import type { Change, Manifest, ManifestEntry } from "./protocol.ts";

const byPath = (manifest: Manifest): Map<string, ManifestEntry> =>
  new Map(manifest.entries.map((entry) => [entry.path, entry]));

/**
 * Compare complete source-free manifests. Rename identity is intentionally not
 * inferred: a rename is a delete plus an add unless a later presentation layer
 * elects to show a similarity hint.
 */
export const diffManifests = (
  before: Manifest,
  after: Manifest,
): ReadonlyArray<Change> => {
  const previous = byPath(before);
  const current = byPath(after);
  const paths = [...new Set([...previous.keys(), ...current.keys()])].sort();
  const changes: Change[] = [];
  for (const path of paths) {
    const oldEntry = previous.get(path);
    const newEntry = current.get(path);
    if (oldEntry === undefined && newEntry !== undefined) {
      changes.push({
        path,
        kind: "added",
        afterContentHash: newEntry.contentHash,
        afterSize: newEntry.size,
      });
    } else if (oldEntry !== undefined && newEntry === undefined) {
      changes.push({
        path,
        kind: "deleted",
        beforeContentHash: oldEntry.contentHash,
        beforeSize: oldEntry.size,
      });
    } else if (
      oldEntry !== undefined &&
      newEntry !== undefined &&
      (oldEntry.contentHash !== newEntry.contentHash || oldEntry.mode !== newEntry.mode)
    ) {
      changes.push({
        path,
        kind: "modified",
        beforeContentHash: oldEntry.contentHash,
        afterContentHash: newEntry.contentHash,
        beforeSize: oldEntry.size,
        afterSize: newEntry.size,
      });
    }
  }
  return changes;
};
