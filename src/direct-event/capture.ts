import { constants, existsSync, type BigIntStats } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { execFileClosedStdinBuffer } from "../onboarding/host-process.ts";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
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
  [status.dev, status.ino, status.mode, status.size, status.mtimeNs, status.ctimeNs]
    .map(String).join(":");

export const descriptorDirectory = (): string | undefined =>
  ["/proc/self/fd", "/dev/fd"].find((candidate) => existsSync(candidate));

class SourceCaptureError extends Schema.TaggedError<SourceCaptureError>()("SourceCaptureError", {}) {}
const readOnceDarwin = Effect.fn("DirectEvent.captureDarwin")(function* (
  root: string, path: EligiblePath, hooks: CaptureHooks,
  expectedRoot: PhysicalRootIdentity | undefined, maxSourceBytes: number,
) {
  const helper = fileURLToPath(new URL("../../native/prebuilt/darwin-arm64/capture-open", import.meta.url));
  if (!existsSync(helper)) return yield* Effect.fail(new SourceCaptureError());
  const result = yield* execFileClosedStdinBuffer(helper, [root, path.relativePath,
    expectedRoot?.rootDevice ?? "-", expectedRoot?.rootInode ?? "-", expectedRoot?.gitDirectory ?? "-",
    expectedRoot?.gitDevice ?? "-", expectedRoot?.gitInode ?? "-", String(maxSourceBytes),
  ], { env: process.env, timeout: Number.POSITIVE_INFINITY, maxBuffer: maxSourceBytes + 4_096 });
  if (!result.succeeded) return yield* Effect.fail(new SourceCaptureError());
  return yield* Effect.try({ try: () => {
    const newline = result.stdout.indexOf(0x0a);
    if (newline <= 0) throw new Error("invalid capture frame");
    const metadata = result.stdout.subarray(0, newline).toString("utf8");
    const bytes = result.stdout.subarray(newline + 1);
    hooks.sourceRead?.(path.relativePath);
    return { bytes, metadata, hash: createHash("sha256").update(bytes).digest("hex") };
  }, catch: () => new SourceCaptureError() });
});

const readOnceLinux = async (
  root: string,
  path: EligiblePath,
  hooks: CaptureHooks,
  expectedRoot: PhysicalRootIdentity | undefined,
  maxSourceBytes: number,
): Promise<{ readonly bytes: Buffer; readonly metadata: string; readonly hash: string }> => {
  const descriptorRoot = descriptorDirectory();
  if (descriptorRoot === undefined) throw new Error("descriptor-anchored capture is unavailable");
  const directoryFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
  const directories = [];
  let parent = await open(root, directoryFlags);
  directories.push(parent);
  try {
    const rootStatus = await parent.stat({ bigint: true });
    if (
      expectedRoot !== undefined &&
      (
        String(rootStatus.dev) !== expectedRoot.rootDevice ||
        String(rootStatus.ino) !== expectedRoot.rootInode
      )
    ) throw new Error("working tree root identity changed");
    if (expectedRoot !== undefined) {
      const gitDirectory = await open(expectedRoot.gitDirectory, directoryFlags);
      directories.push(gitDirectory);
      const gitStatus = await gitDirectory.stat({ bigint: true });
      if (
        String(gitStatus.dev) !== expectedRoot.gitDevice ||
        String(gitStatus.ino) !== expectedRoot.gitInode
      ) throw new Error("Git administration identity changed");
    }
    const segments = path.relativePath.split("/");
    for (const segment of segments.slice(0, -1)) {
      parent = await open(`${descriptorRoot}/${parent.fd}/${segment}`, directoryFlags);
      directories.push(parent);
    }
    const basename = segments.at(-1);
    if (basename === undefined) throw new Error("invalid path");
    const file = await open(
      `${descriptorRoot}/${parent.fd}/${basename}`,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const before = await file.stat({ bigint: true });
      if (!before.isFile() || before.size > BigInt(maxSourceBytes)) {
        throw new Error("oversized or nonregular source");
      }
      const buffer = Buffer.alloc(maxSourceBytes);
      let offset = 0;
      while (offset < buffer.length) {
        const result = await file.read(buffer, offset, buffer.length - offset, offset);
        if (result.bytesRead === 0) break;
        offset += result.bytesRead;
      }
      hooks.sourceRead?.(path.relativePath);
      const after = await file.stat({ bigint: true });
      if (
        BigInt(offset) !== after.size ||
        signature(before) !== signature(after)
      ) throw new Error("unstable capture");
      const bytes = buffer.subarray(0, offset);
      return {
        bytes,
        metadata: signature(after),
        hash: createHash("sha256").update(bytes).digest("hex"),
      };
    } finally {
      await file.close();
    }
  } finally {
    const closed = await Promise.allSettled(directories.reverse().map(directory => directory.close()));
    if (closed.some(result => result.status === "rejected")) throw new Error("capture directory closure failed");
  }
};

const readOnce = Effect.fn("DirectEvent.captureRead")((root: string, path: EligiblePath, hooks: CaptureHooks,
  expectedRoot: PhysicalRootIdentity | undefined, maxSourceBytes: number) => process.platform === "darwin"
    ? readOnceDarwin(root, path, hooks, expectedRoot, maxSourceBytes)
    : Effect.tryPromise({ try: () => readOnceLinux(root, path, hooks, expectedRoot, maxSourceBytes),
      catch: () => new SourceCaptureError(),
    }).pipe(Effect.uninterruptible));
const clearRead = (read: Effect.Success<ReturnType<typeof readOnce>>) => Effect.sync(() => { read.bytes.fill(0); });

/** Two bounded matching reads are required; failures never return partial bytes. */
export const captureStable = Effect.fn("DirectEvent.captureStable")(function* (
  root: string, path: EligiblePath, hooks: CaptureHooks = {},
  expectedRoot: PhysicalRootIdentity | undefined = undefined, maxSourceBytes: number = MAX_SOURCE_BYTES,
) {
  if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes < 1 || maxSourceBytes > MAX_SOURCE_BYTES) return undefined;
  return yield* Effect.acquireUseRelease(
    readOnce(root, path, hooks, expectedRoot, maxSourceBytes),
    (first) => Effect.gen(function* () {
      if (hooks.betweenReads !== undefined) yield* hooks.betweenReads();
      return yield* Effect.acquireUseRelease(
        readOnce(root, path, hooks, expectedRoot, maxSourceBytes),
        (second) => Effect.gen(function* () {
          const currentPath = yield* Effect.tryPromise({ try: () => realpath(join(root, path.relativePath)),
            catch: () => new SourceCaptureError(),
          }).pipe(Effect.uninterruptible);
          return yield* Effect.try({ try: () => {
            if (first.metadata !== second.metadata || first.hash !== second.hash || !first.bytes.equals(second.bytes) ||
              currentPath !== path.absolutePath || second.bytes.includes(0)) throw new Error("unstable capture");
            const text = new TextDecoder("utf-8", { fatal: true }).decode(second.bytes);
            return { bytes: new Uint8Array(second.bytes), text, byteLength: second.bytes.byteLength,
              contentHash: second.hash, metadata: second.metadata } satisfies StableCapture;
          }, catch: () => new SourceCaptureError() });
        }),
        clearRead,
      );
    }),
    clearRead,
  ).pipe(Effect.catch(() => Effect.succeed(undefined)));
});
