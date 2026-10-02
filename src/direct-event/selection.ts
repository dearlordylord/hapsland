import { gitOutput } from "../repository/root.ts";
import * as Schema from "effect/Schema";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import * as Effect from "effect/Effect";
import { matchesAnyGlob } from "../matcher/glob.ts";
import { admitCandidateFile, selectFile } from "../configuration/decision.ts";
import { protectedPathReason } from "../policy/file-policy.ts";
import type { PhysicalRootIdentity } from "./model.ts";



export type DirectFilePolicy = {
  /** The already-resolved, highest-precedence include list. Empty selects nothing. */
  readonly includes: ReadonlyArray<string>;
  /** Already-accumulated exclusions from every configuration layer. */
  readonly excludes: ReadonlyArray<string>;
};

export const DEFAULT_DIRECT_FILE_POLICY: DirectFilePolicy = {
  includes: ["**/*"],
  excludes: [],
};

export type EligiblePath = { readonly relativePath: string; readonly absolutePath: string };

class PathSelectionError extends Schema.TaggedError<PathSelectionError>()("PathSelectionError", {}) {}
const fileObservation = Effect.fn("DirectEvent.pathObservation")(<A>(read: () => Promise<A>) =>
  Effect.tryPromise({ try: read, catch: () => new PathSelectionError() }).pipe(Effect.uninterruptible));

const portableRelative = (root: string, candidate: string): EligiblePath | undefined => {
  if (candidate.length === 0 || candidate.includes("\0")) return undefined;
  const absolutePath = resolve(root, candidate);
  const path = relative(root, absolutePath);
  if (path.length === 0 || path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    return undefined;
  }
  return { relativePath: path.replaceAll(sep, "/"), absolutePath };
};

/** Pure path-policy decision shared by initial capture and queued dispatch. */
export const selectedByDirectFilePolicy = (path: string, policy: DirectFilePolicy): boolean =>
  selectFile({
    protected: protectedPathReason(path) !== undefined,
    excluded: matchesAnyGlob(policy.excludes, path),
    includesEmpty: policy.includes.length === 0,
    included: matchesAnyGlob(policy.includes, path),
  }) === "selected";

const equalToOrWithin = (parent: string, candidate: string): boolean => {
  const path = relative(parent, candidate);
  return path.length === 0 ||
    (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
};

const hasSymlinkOrNonDirectoryAncestor = Effect.fn("DirectEvent.inspectAncestors")(function* (root: string, path: string) {
  let current = root;
  const segments = path.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) return true;
    current = join(current, segment);
    const status = yield* fileObservation(() => lstat(current));
    if (status.isSymbolicLink()) return true;
    if (index < segments.length - 1 && !status.isDirectory()) return true;
    if (index === segments.length - 1 && !status.isFile()) return true;
  }
  return false;
});

/**
 * Selects one event-named path without walking source directories. Only tracked
 * state and per-directory .gitignore files participate in Git ignore checks.
 */
export const eligibleNamedPath = Effect.fn("DirectEvent.eligibleNamedPath")(function* (
  root: string,
  candidate: string,
  policy: DirectFilePolicy = DEFAULT_DIRECT_FILE_POLICY,
  rootIdentity: PhysicalRootIdentity | undefined = undefined,
) {
  const normalized = portableRelative(root, candidate);
  if (normalized === undefined || !selectedByDirectFilePolicy(normalized.relativePath, policy)) return undefined;
  // A linked worktree or --separate-git-dir repository need not use a literal
  // `.git` directory. The structured Git identity is the authoritative
  // administrative subtree, and this path-boundary check happens before lstat
  // or any source capture.
  const gitAdmin = rootIdentity !== undefined &&
    equalToOrWithin(rootIdentity.gitDirectory, normalized.absolutePath);
  if (admitCandidateFile({ gitAdmin, physicalSafe: true, gitAllowed: true }) !== "candidateAllowed") return undefined;
  const safe = yield* Effect.gen(function* () {
    if (yield* hasSymlinkOrNonDirectoryAncestor(root, normalized.relativePath)) return { physicalSafe: false, gitAllowed: false };
    if ((yield* fileObservation(() => realpath(normalized.absolutePath))) !== normalized.absolutePath) return { physicalSafe: false, gitAllowed: false };
    const tracked = (yield* gitOutput(root, ["ls-files", "-z", "--", normalized.relativePath])).split("\0").includes(normalized.relativePath);
    if (tracked) return { physicalSafe: true, gitAllowed: true };
    // Only per-directory ignores participate; global excludes and .git/info/exclude are omitted.
    const ignored = (yield* gitOutput(root, ["ls-files", "--others", "--ignored", "--exclude-per-directory=.gitignore", "-z", "--", normalized.relativePath])).split("\0").includes(normalized.relativePath);
    return { physicalSafe: true, gitAllowed: !ignored };
  }).pipe(Effect.catch(() => Effect.succeed({ physicalSafe: false, gitAllowed: false })));
  return admitCandidateFile({ gitAdmin: false, ...safe }) === "candidateAllowed" ? normalized : undefined;
});

export const resolvedDirectFilePolicy = (policy: {
  readonly includes: ReadonlyArray<{ readonly value: string }>;
  readonly excludes: ReadonlyArray<{ readonly value: string }>;
  readonly protectedExcludes?: ReadonlyArray<{ readonly value: string }>;
}): DirectFilePolicy => ({
  includes: policy.includes.map(({ value }) => value),
  excludes: [...policy.excludes, ...(policy.protectedExcludes ?? [])].map(({ value }) => value),
});
