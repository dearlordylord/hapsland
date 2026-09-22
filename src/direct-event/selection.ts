import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import * as Effect from "effect/Effect";
import { matchesAnyGlob } from "../matcher/glob.ts";
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

const hardExcluded = (path: string): boolean => {
  const segments = path.split("/");
  const basename = segments.at(-1) ?? "";
  return segments.some((segment) => segment === ".git" || segment === "node_modules") ||
    /^\.env(?:\..*)?$/.test(basename);
};

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
  if (normalized === undefined || hardExcluded(normalized.relativePath)) return undefined;
  // A linked worktree or --separate-git-dir repository need not use a literal
  // `.git` directory. The structured Git identity is the authoritative
  // administrative subtree, and this path-boundary check happens before lstat
  // or any source capture.
  if (
    rootIdentity !== undefined &&
    equalToOrWithin(rootIdentity.gitDirectory, normalized.absolutePath)
  ) return undefined;
  if (policy.excludes.length > 0 && matchesAnyGlob(policy.excludes, normalized.relativePath)) {
    return undefined;
  }
  if (policy.includes.length === 0 || !matchesAnyGlob(policy.includes, normalized.relativePath)) {
    return undefined;
  }
  const safe = yield* Effect.tryPromise({
    try: async () => {
      if (await hasSymlinkOrNonDirectoryAncestor(root, normalized.relativePath)) return false;
      if (await realpath(normalized.absolutePath) !== normalized.absolutePath) return false;
      const tracked = (await git(root, ["ls-files", "-z", "--", normalized.relativePath]))
        .split("\0").includes(normalized.relativePath);
      if (tracked) return true;
      // Supplying only --exclude-per-directory deliberately omits the user's
      // global excludes file and .git/info/exclude.
      const ignored = (await git(root, [
        "ls-files", "--others", "--ignored",
        "--exclude-per-directory=.gitignore", "-z", "--", normalized.relativePath,
      ])).split("\0").includes(normalized.relativePath);
      return !ignored;
    },
    catch: () => new Error("path selection unavailable"),
  }).pipe(Effect.catch(() => Effect.succeed(false)));
  return safe ? normalized : undefined;
});

export const resolvedDirectFilePolicy = (policy: {
  readonly includes: ReadonlyArray<{ readonly value: string }>;
  readonly excludes: ReadonlyArray<{ readonly value: string }>;
  readonly protectedExcludes?: ReadonlyArray<{ readonly value: string }>;
}): DirectFilePolicy => ({
  includes: policy.includes.map(({ value }) => value),
  excludes: [...policy.excludes, ...(policy.protectedExcludes ?? [])].map(({ value }) => value),
});
