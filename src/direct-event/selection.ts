import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import * as Effect from "effect/Effect";
import { matchesAnyGlob } from "../matcher/glob.ts";
import { admitCandidateFile, selectFile } from "../configuration/decision.ts";
import { protectedPathReason } from "../policy/file-policy.ts";
import type { PhysicalRootIdentity } from "./model.ts";

const execFileAsync = promisify(execFile);

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

const git = async (root: string, args: ReadonlyArray<string>): Promise<string> => {
  const result = await execFileAsync(
    "git",
    ["--literal-pathspecs", "-C", root, ...args],
    { timeout: 2_000, maxBuffer: 65_536 },
  );
  return result.stdout;
};

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

const hasSymlinkOrNonDirectoryAncestor = async (
  root: string,
  path: string,
): Promise<boolean> => {
  let current = root;
  const segments = path.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) return true;
    current = join(current, segment);
    const status = await lstat(current);
    if (status.isSymbolicLink()) return true;
    if (index < segments.length - 1 && !status.isDirectory()) return true;
    if (index === segments.length - 1 && !status.isFile()) return true;
  }
  return false;
};

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
  const safe = yield* Effect.tryPromise({
    try: async () => {
      if (await hasSymlinkOrNonDirectoryAncestor(root, normalized.relativePath)) return { physicalSafe: false, gitAllowed: false };
      if (await realpath(normalized.absolutePath) !== normalized.absolutePath) return { physicalSafe: false, gitAllowed: false };
      const tracked = (await git(root, ["ls-files", "-z", "--", normalized.relativePath]))
        .split("\0").includes(normalized.relativePath);
      if (tracked) return { physicalSafe: true, gitAllowed: true };
      // Supplying only --exclude-per-directory deliberately omits the user's
      // global excludes file and .git/info/exclude.
      const ignored = (await git(root, [
        "ls-files", "--others", "--ignored",
        "--exclude-per-directory=.gitignore", "-z", "--", normalized.relativePath,
      ])).split("\0").includes(normalized.relativePath);
      return { physicalSafe: true, gitAllowed: !ignored };
    },
    catch: () => new Error("path selection unavailable"),
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
