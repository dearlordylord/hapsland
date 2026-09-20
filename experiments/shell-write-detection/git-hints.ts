import { execFileSync } from "node:child_process";

export type GitHint = {
  readonly status: string;
  readonly path: string;
  readonly ignored: boolean;
};

/**
 * Read Git's NUL-delimited porcelain candidate list. This is deliberately only
 * a wake-up/candidate hint: the product walk remains the coverage authority and
 * decides eligibility independently of Git ignore rules.
 */
export const gitCandidateHints = (root: string): ReadonlyArray<GitHint> => {
  const output = execFileSync(
    "git",
    ["-c", "core.quotepath=false", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching"],
    {
      cwd: root,
      encoding: "buffer",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const parts = output.toString("utf8").split("\0").filter((part) => part.length > 0);
  const hints: GitHint[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const record = parts[index] ?? "";
    if (record.length < 4) continue;
    const status = record.slice(0, 2);
    const path = record.slice(3);
    const ignored = status === "!!";
    hints.push({ status, path, ignored });
    // Porcelain v1 -z emits the original path as a second NUL field for
    // renames/copies. Keep it as a separate candidate, without treating it as
    // an identity assertion.
    if (status.includes("R") || status.includes("C")) {
      const original = parts[index + 1];
      if (original !== undefined && original.length > 0) {
        hints.push({ status, path: original, ignored });
        index += 1;
      }
    }
  }
  return hints.sort((left, right) => left.path.localeCompare(right.path));
};
