import { packageAssetPath } from "../runtime/package-runtime.ts";
import { constants, existsSync, type BigIntStats } from "node:fs";
import { open, realpath, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { execFileClosedStdinBuffer } from "../onboarding/host-process.ts";
import { createHash } from "node:crypto";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import type { EligiblePath } from "./selection.ts";
import type { PhysicalRootIdentity } from "./model.ts";

export const MAX_SOURCE_BYTES = 262_144;

export type StableCapture = {
  readonly bytes: Uint8Array;
  readonly text: string;
  readonly byteLength: number;
  readonly contentHash: string;
  readonly metadata: string;
};

export type CaptureHooks = {
  readonly betweenReads?: () => Effect.Effect<void, unknown>;
  readonly sourceRead?: (path: string) => void;
};

const signature = (status: BigIntStats): string =>
  [status.dev, status.ino, status.mode, status.size, status.mtimeNs, status.ctimeNs].map(String).join(":");

export const descriptorDirectory = (): string | undefined =>
  ["/proc/self/fd", "/dev/fd"].find((candidate) => existsSync(candidate));

class SourceCaptureError extends Schema.TaggedError<SourceCaptureError>()("SourceCaptureError", {}) {}
const nativeIdentityWord = (value: string | undefined): string => value ?? "-";
const darwinCaptureArguments = (
  root: string,
  path: EligiblePath,
  expected: PhysicalRootIdentity | undefined,
  maximum: number,
): ReadonlyArray<string> => [
  root,
  path.relativePath,
  nativeIdentityWord(expected?.rootDevice),
  nativeIdentityWord(expected?.rootInode),
  nativeIdentityWord(expected?.gitDirectory),
  nativeIdentityWord(expected?.gitDevice),
  nativeIdentityWord(expected?.gitInode),
  String(maximum),
];
const availableDarwinCaptureHelper = Effect.fn("DirectEvent.availableDarwinCaptureHelper")(function* () {
  const helper = packageAssetPath("native", "prebuilt", "darwin-arm64", "capture-open");
  if (!existsSync(helper)) return yield* Effect.fail(new SourceCaptureError());
  return helper;
});
const readOnceDarwin = Effect.fn("DirectEvent.captureDarwin")(function* (
  root: string,
  path: EligiblePath,
  hooks: CaptureHooks,
  expectedRoot: PhysicalRootIdentity | undefined,
  maxSourceBytes: number,
) {
  const helper = yield* availableDarwinCaptureHelper();
  const result = yield* execFileClosedStdinBuffer(
    helper,
    darwinCaptureArguments(root, path, expectedRoot, maxSourceBytes),
    { env: process.env, timeout: Number.POSITIVE_INFINITY, maxBuffer: maxSourceBytes + 4_096 },
  );
  if (!result.succeeded) return yield* Effect.fail(new SourceCaptureError());
  return yield* Effect.try({
    try: () => {
      const newline = result.stdout.indexOf(0x0a);
      if (newline <= 0) throw new Error("invalid capture frame");
      const metadata = result.stdout.subarray(0, newline).toString("utf8");
      const bytes = result.stdout.subarray(newline + 1);
      hooks.sourceRead?.(path.relativePath);
      return { bytes, metadata, hash: createHash("sha256").update(bytes).digest("hex") };
    },
    catch: () => new SourceCaptureError(),
  });
});

type DescriptorCapture = { readonly bytes: Buffer; readonly metadata: string; readonly hash: string };
const directoryIdentityMatches = (status: BigIntStats, device: string, inode: string): boolean =>
  String(status.dev) === device && String(status.ino) === inode;
const assertRootIdentity = (status: BigIntStats, expected: PhysicalRootIdentity | undefined): void => {
  if (expected !== undefined && !directoryIdentityMatches(status, expected.rootDevice, expected.rootInode))
    throw new Error("working tree root identity changed");
};
const inspectGitDirectory = async (
  expected: PhysicalRootIdentity | undefined,
  flags: number,
  directories: FileHandle[],
): Promise<void> => {
  if (expected === undefined) return;
  const directory = await open(expected.gitDirectory, flags);
  directories.push(directory);
  const status = await directory.stat({ bigint: true });
  if (!directoryIdentityMatches(status, expected.gitDevice, expected.gitInode))
    throw new Error("Git administration identity changed");
};
const openCaptureParent = async (
  parent: FileHandle,
  path: EligiblePath,
  descriptorRoot: string,
  flags: number,
  directories: FileHandle[],
): Promise<FileHandle> => {
  for (const segment of path.relativePath.split("/").slice(0, -1)) {
    parent = await open(`${descriptorRoot}/${parent.fd}/${segment}`, flags);
    directories.push(parent);
  }
  return parent;
};
const assertCaptureFileBounds = (status: BigIntStats, maximum: number): void => {
  if (!status.isFile() || status.size > BigInt(maximum)) throw new Error("oversized or nonregular source");
};
const readDescriptorBytes = async (file: FileHandle, buffer: Buffer): Promise<number> => {
  let offset = 0;
  while (offset < buffer.length) {
    const result = await file.read(buffer, offset, buffer.length - offset, offset);
    if (result.bytesRead === 0) break;
    offset += result.bytesRead;
  }
  return offset;
};
const assertDescriptorCaptureStable = (before: BigIntStats, after: BigIntStats, length: number): void => {
  if (BigInt(length) !== after.size || signature(before) !== signature(after)) throw new Error("unstable capture");
};
const readCaptureDescriptor = async (
  file: FileHandle,
  path: EligiblePath,
  hooks: CaptureHooks,
  maximum: number,
): Promise<DescriptorCapture> => {
  const before = await file.stat({ bigint: true });
  assertCaptureFileBounds(before, maximum);
  const buffer = Buffer.alloc(maximum);
  const length = await readDescriptorBytes(file, buffer);
  hooks.sourceRead?.(path.relativePath);
  const after = await file.stat({ bigint: true });
  assertDescriptorCaptureStable(before, after, length);
  const bytes = buffer.subarray(0, length);
  return { bytes, metadata: signature(after), hash: createHash("sha256").update(bytes).digest("hex") };
};
const readCaptureSource = async (
  parent: FileHandle,
  path: EligiblePath,
  hooks: CaptureHooks,
  descriptorRoot: string,
  maximum: number,
): Promise<DescriptorCapture> => {
  const basename = path.relativePath.split("/").at(-1);
  if (basename === undefined) throw new Error("invalid path");
  const file = await open(
    `${descriptorRoot}/${parent.fd}/${basename}`,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    return await readCaptureDescriptor(file, path, hooks, maximum);
  } finally {
    await file.close();
  }
};
const closeCaptureDirectories = async (directories: FileHandle[]): Promise<void> => {
  const closed = await Promise.allSettled(directories.reverse().map((directory) => directory.close()));
  if (closed.some((result) => result.status === "rejected")) throw new Error("capture directory closure failed");
};
const readOnceLinux = async (
  root: string,
  path: EligiblePath,
  hooks: CaptureHooks,
  expectedRoot: PhysicalRootIdentity | undefined,
  maxSourceBytes: number,
): Promise<DescriptorCapture> => {
  const descriptorRoot = descriptorDirectory();
  if (descriptorRoot === undefined) throw new Error("descriptor-anchored capture is unavailable");
  const directoryFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
  const directories: FileHandle[] = [];
  let parent = await open(root, directoryFlags);
  directories.push(parent);
  try {
    assertRootIdentity(await parent.stat({ bigint: true }), expectedRoot);
    await inspectGitDirectory(expectedRoot, directoryFlags, directories);
    parent = await openCaptureParent(parent, path, descriptorRoot, directoryFlags, directories);
    return await readCaptureSource(parent, path, hooks, descriptorRoot, maxSourceBytes);
  } finally {
    await closeCaptureDirectories(directories);
  }
};

const readOnce = Effect.fn("DirectEvent.captureRead")(
  (
    root: string,
    path: EligiblePath,
    hooks: CaptureHooks,
    expectedRoot: PhysicalRootIdentity | undefined,
    maxSourceBytes: number,
  ) =>
    process.platform === "darwin"
      ? readOnceDarwin(root, path, hooks, expectedRoot, maxSourceBytes)
      : Effect.tryPromise({
          try: () => readOnceLinux(root, path, hooks, expectedRoot, maxSourceBytes),
          catch: () => new SourceCaptureError(),
        }).pipe(Effect.uninterruptible),
);
const clearRead = (read: Effect.Success<ReturnType<typeof readOnce>>) =>
  Effect.sync(() => {
    read.bytes.fill(0);
  });

const validCaptureBudget = (maximum: number): boolean =>
  Number.isSafeInteger(maximum) && maximum >= 1 && maximum <= MAX_SOURCE_BYTES;
const matchingDescriptorCaptures = (first: DescriptorCapture, second: DescriptorCapture): boolean =>
  first.metadata === second.metadata && first.hash === second.hash && first.bytes.equals(second.bytes);
const stableCaptureResult = (
  first: DescriptorCapture,
  second: DescriptorCapture,
  currentPath: string,
  path: EligiblePath,
): StableCapture => {
  if (!matchingDescriptorCaptures(first, second) || currentPath !== path.absolutePath || second.bytes.includes(0))
    throw new Error("unstable capture");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(second.bytes);
  return {
    bytes: new Uint8Array(second.bytes),
    text,
    byteLength: second.bytes.byteLength,
    contentHash: second.hash,
    metadata: second.metadata,
  };
};

/** Two bounded matching reads are required; failures never return partial bytes. */
export const captureStable = Effect.fn("DirectEvent.captureStable")(function* (
  root: string,
  path: EligiblePath,
  hooks: CaptureHooks = {},
  expectedRoot: PhysicalRootIdentity | undefined = undefined,
  maxSourceBytes: number = MAX_SOURCE_BYTES,
) {
  if (!validCaptureBudget(maxSourceBytes)) return undefined;
  return yield* Effect.acquireUseRelease(
    readOnce(root, path, hooks, expectedRoot, maxSourceBytes),
    (first) =>
      Effect.gen(function* () {
        if (hooks.betweenReads !== undefined) yield* hooks.betweenReads();
        return yield* Effect.acquireUseRelease(
          readOnce(root, path, hooks, expectedRoot, maxSourceBytes),
          (second) =>
            Effect.gen(function* () {
              const currentPath = yield* Effect.tryPromise({
                try: () => realpath(join(root, path.relativePath)),
                catch: () => new SourceCaptureError(),
              }).pipe(Effect.uninterruptible);
              return yield* Effect.try({
                try: () => stableCaptureResult(first, second, currentPath, path),
                catch: () => new SourceCaptureError(),
              });
            }),
          clearRead,
        );
      }),
    clearRead,
  ).pipe(Effect.catch(() => Effect.succeed(undefined)));
});
