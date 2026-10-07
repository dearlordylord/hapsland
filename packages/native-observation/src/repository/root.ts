import type { Stats } from "node:fs"
import { execFileClosedStdin } from "@hapsland/runtime-environment/process/closed-stdin"
import { existsSync } from "node:fs"
import { lstat, realpath, stat } from "node:fs/promises"
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path"
import * as Effect from "effect/Effect"

import * as Schema from "effect/Schema"
import type { PhysicalRootIdentity } from "../direct-event/observation.ts"
class RepositoryObservationError extends Schema.TaggedError<RepositoryObservationError>()(
  "RepositoryObservationError",
  { message: Schema.NonEmptyString }
) {}
const fileObservation = Effect.fn("Repository.fileObservation")(<A>(message: string, read: () => Promise<A>) =>
  Effect.tryPromise({ try: read, catch: () => new RepositoryObservationError({ message }) }).pipe(
    Effect.uninterruptible
  )
)
export const gitOutput = Effect.fn("Repository.gitOutput")(function* (root: string, args: ReadonlyArray<string>) {
  const result = yield* execFileClosedStdin("git", ["--literal-pathspecs", "-C", root, ...args], {
    env: process.env,
    timeout: 2_000,
    maxBuffer: 65_536
  })
  if (!result.succeeded)
    return yield* Effect.fail(new RepositoryObservationError({ message: "Git working tree observation unavailable" }))
  return result.stdout
})
export const discoverPhysicalWorkingTreeRoot = Effect.fn("Repository.discoverPhysicalRoot")(function* (cwd: string) {
  const physicalCwd = yield* fileObservation("working directory is inaccessible", () => realpath(cwd))
  const reported = (yield* gitOutput(physicalCwd, ["rev-parse", "--show-toplevel"])).trim()
  if (reported.length === 0)
    return yield* Effect.fail(new RepositoryObservationError({ message: "not a Git working tree" }))
  const root = yield* fileObservation("working tree is inaccessible", () => realpath(reported))
  const gitReported = (yield* gitOutput(root, ["rev-parse", "--absolute-git-dir"])).trim()
  const gitDirectory = yield* fileObservation("Git administration directory is inaccessible", () =>
    realpath(gitReported)
  )
  const [rootStatus, gitStatus] = yield* Effect.all(
    [
      fileObservation("working tree metadata is inaccessible", () => stat(root, { bigint: true })),
      fileObservation("Git administration metadata is inaccessible", () => stat(gitDirectory, { bigint: true }))
    ],
    { concurrency: 2 }
  )
  return {
    root,
    physicalCwd,
    rootIdentity: Object.freeze({
      rootDevice: String(rootStatus.dev),
      rootInode: String(rootStatus.ino),
      gitDirectory,
      gitDevice: String(gitStatus.dev),
      gitInode: String(gitStatus.ino)
    } satisfies PhysicalRootIdentity)
  }
})

/** Translate a tool path against its actual base, preserving rejected target symlinks. */
export const absoluteToolTarget = Effect.fn("Repository.absoluteToolTarget")(function* (cwd: string, path: string) {
  if (path.length === 0 || path.includes("\0"))
    return yield* Effect.fail(new RepositoryObservationError({ message: "invalid tool target" }))
  if (!isAbsolute(path)) {
    const base = yield* fileObservation("tool path base is inaccessible", () => realpath(cwd))
    return resolve(base, path)
  }
  const fromBase = relative(resolve(cwd), path)
  if (fromBase !== ".." && !fromBase.startsWith(`..${sep}`) && !isAbsolute(fromBase)) {
    const base = yield* fileObservation("tool path base is inaccessible", () => realpath(cwd))
    return resolve(base, fromBase)
  }
  return resolve(path)
})

const targetAncestorStatus = Effect.fn("Repository.targetAncestorStatus")((path: string) =>
  Effect.tryPromise({ try: () => lstat(path), catch: (error) => error }).pipe(
    Effect.catch((error) => {
      if (error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT")
        return Effect.succeed(undefined)
      return Effect.fail(new RepositoryObservationError({ message: "tool target metadata is inaccessible" }))
    })
  )
)

const safeTargetAncestor = (status: Stats, final: boolean): boolean =>
  !status.isSymbolicLink() && (status.isDirectory() || (final && status.isFile()))

/** Discover from the target's existing ancestors, including before a new file exists. No source is read. */
export const discoverAbsoluteToolTargetRoot = Effect.fn("Repository.discoverAbsoluteToolTargetRoot")(function* (
  absolutePath: string
) {
  if (!isAbsolute(absolutePath) || absolutePath.includes("\0"))
    return yield* Effect.fail(new RepositoryObservationError({ message: "invalid absolute tool target" }))
  const filesystemRoot = parse(absolutePath).root
  const segments = relative(filesystemRoot, absolutePath).split(sep)
  let directory = filesystemRoot
  for (let index = 0; index < segments.length; index += 1) {
    const current = join(directory, segments[index]!)
    const status = yield* targetAncestorStatus(current)
    if (status === undefined) break
    if (!safeTargetAncestor(status, index === segments.length - 1))
      return yield* Effect.fail(new RepositoryObservationError({ message: "unsafe tool target ancestor" }))
    if (status.isDirectory()) directory = current
  }
  const discovered = yield* discoverPhysicalWorkingTreeRoot(directory)
  return { ...discovered, absolutePath }
})

export const discoverToolTargetRoot = Effect.fn("Repository.discoverToolTargetRoot")(function* (
  cwd: string,
  path: string
) {
  return yield* discoverAbsoluteToolTargetRoot(yield* absoluteToolTarget(cwd, path))
})

/** Native marker observation for distinguishing a missing Git command from a non-repository path. */
export const hasGitMetadata = (path: string): boolean => {
  let current = resolve(path)
  while (true) {
    if (existsSync(join(current, ".git"))) return true
    const parent = dirname(current)
    if (parent === current) return false
    current = parent
  }
}

/** Discover a physical Git working-tree root without consulting saved grants. */
export const discoverWorkingTreeRoot = Effect.fn("Repository.discoverWorkingTreeRoot")(function* (cwd: string) {
  const result = yield* execFileClosedStdin("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
    env: process.env,
    timeout: Number.POSITIVE_INFINITY,
    maxBuffer: 1_048_576
  })
  const reported = result.stdout.trim()
  if (!result.succeeded || reported.length === 0)
    return yield* Effect.fail(new RepositoryObservationError({ message: "working tree could not be discovered" }))
  return yield* fileObservation("working tree root is not accessible", () => realpath(reported))
})

export const rootRelativePath = (root: string, cwd: string, path: string): string | undefined => {
  const absolute = resolve(cwd, path)
  const relativePath = relative(root, absolute)
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || relativePath.includes("\0")) {
    return undefined
  }
  return relativePath.replaceAll(sep, "/") || "."
}
