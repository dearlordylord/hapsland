import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export type FixtureWorkspace = {
  readonly root: string;
  readonly stateDirectory: string;
  readonly dispose: () => Promise<void>;
};

const runGit = (root: string, args: ReadonlyArray<string>): string =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

export const pathIn = (root: string, relativePath: string): string => join(root, ...relativePath.split("/"));

export const writeFixtureFile = async (
  root: string,
  relativePath: string,
  content: string,
): Promise<void> => {
  const path = pathIn(root, relativePath);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content, "utf8");
};

export const removeFixtureFile = async (root: string, relativePath: string): Promise<void> => {
  await rm(pathIn(root, relativePath), { force: true, recursive: true });
};

export const createWorkspace = async (
  name: string,
  options: { readonly git?: boolean } = {},
): Promise<FixtureWorkspace> => {
  const root = await mkdtemp(join(tmpdir(), `jev-issue4-${name}-`));
  const stateDirectory = await mkdtemp(join(tmpdir(), `jev-issue4-state-${name}-`));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFixtureFile(root, "src/tracked.ts", "export const tracked = 1;\n");
  await writeFixtureFile(root, ".gitignore", "src/ignored.ts\nsrc/ignored-dir/\n");
  if (options.git !== false) {
    runGit(root, ["init", "-q"]);
    runGit(root, ["config", "user.email", "prototype@example.invalid"]);
    runGit(root, ["config", "user.name", "Issue 4 Prototype"]);
    runGit(root, ["add", ".gitignore", "src/tracked.ts"]);
    runGit(root, ["commit", "-qm", "fixture baseline"]);
  }
  return {
    root,
    stateDirectory,
    dispose: async () => {
      await rm(root, { recursive: true, force: true });
      await rm(stateDirectory, { recursive: true, force: true });
    },
  };
};

export const createSymlinkFixture = async (
  root: string,
): Promise<void> => {
  await writeFixtureFile(root, "src/target.ts", "export const target = 1;\n");
  await symlink("target.ts", pathIn(root, "src/link.ts"));
};

export const createFifoFixture = (root: string, relativePath = "src/pipe.ts"): void => {
  execFileSync("mkfifo", [pathIn(root, relativePath)]);
};

export const createWorktree = async (
  root: string,
  name: string,
): Promise<string> => {
  const secondary = join(root, "..", `${name}-secondary`);
  runGit(root, ["worktree", "add", "-q", "-b", `${name}-branch`, secondary, "HEAD"]);
  return secondary;
};

export const removeWorktree = (root: string, secondary: string): void => {
  try {
    runGit(root, ["worktree", "remove", "--force", secondary]);
  } catch {
    // The parent fixture cleanup still removes the temporary repository.
  }
};

export const gitOutput = (root: string, args: ReadonlyArray<string>): string => runGit(root, args);
