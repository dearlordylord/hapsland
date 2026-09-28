import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import * as Effect from "effect/Effect";

const execFileAsync = promisify(execFile);

/** Discover a physical Git working-tree root without consulting saved grants. */
export const discoverWorkingTreeRoot = Effect.fn("Repository.discoverWorkingTreeRoot")(function* (cwd: string) {
  const result = yield* Effect.tryPromise({
    try: () => execFileAsync("git", ["-C", cwd, "rev-parse", "--show-toplevel"]),
    catch: () => new Error("working tree could not be discovered"),
  });
  const reported = result.stdout.trim();
  if (reported.length === 0) return yield* Effect.fail(new Error("working tree could not be discovered"));
  return yield* Effect.tryPromise({
    try: () => realpath(reported),
    catch: () => new Error("working tree root is not accessible"),
  });
});

export const rootRelativePath = (root: string, cwd: string, path: string): string | undefined => {
  const absolute = resolve(cwd, path);
  const relativePath = relative(root, absolute);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || relativePath.includes("\0")) {
    return undefined;
  }
  return relativePath.replaceAll(sep, "/") || ".";
};
