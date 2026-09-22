import { constants, type BigIntStats } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";
import type { EligiblePath } from "./selection.ts";

export const MAX_SOURCE_BYTES = 32_768;

export type StableCapture = {
  readonly bytes: Uint8Array;
  readonly text: string;
  readonly byteLength: number;
  readonly contentHash: string;
  readonly metadata: string;
};

export type CaptureHooks = {
  readonly betweenReads?: () => Promise<void>;
  readonly sourceRead?: (path: string) => void;
};

const signature = (status: BigIntStats): string =>
  [status.dev, status.ino, status.mode, status.size, status.mtimeNs, status.ctimeNs]
    .map(String).join(":");

const readOnce = async (
  root: string,
  path: EligiblePath,
  hooks: CaptureHooks,
): Promise<{ readonly bytes: Buffer; readonly metadata: string; readonly hash: string }> => {
  const directoryFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
  const directories = [];
  let parent = await open(root, directoryFlags);
  directories.push(parent);
  try {
    const segments = path.relativePath.split("/");
    for (const segment of segments.slice(0, -1)) {
      parent = await open(`/proc/self/fd/${parent.fd}/${segment}`, directoryFlags);
      directories.push(parent);
    }
    const basename = segments.at(-1);
    if (basename === undefined) throw new Error("invalid path");
    const file = await open(
      `/proc/self/fd/${parent.fd}/${basename}`,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const before = await file.stat({ bigint: true });
      if (!before.isFile() || before.size > BigInt(MAX_SOURCE_BYTES)) {
        throw new Error("oversized or nonregular source");
      }
      const buffer = Buffer.alloc(MAX_SOURCE_BYTES + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const result = await file.read(buffer, offset, buffer.length - offset, offset);
        if (result.bytesRead === 0) break;
        offset += result.bytesRead;
      }
      hooks.sourceRead?.(path.relativePath);
      const after = await file.stat({ bigint: true });
      if (
        offset > MAX_SOURCE_BYTES ||
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
    for (const directory of directories.reverse()) await directory.close();
  }
};

/** Two bounded matching reads are required; failures never return partial bytes. */
export const captureStable = Effect.fn("DirectEvent.captureStable")(function* (
  root: string,
  path: EligiblePath,
  hooks: CaptureHooks = {},
) {
  const captured = yield* Effect.tryPromise({
    try: async () => {
      const first = await readOnce(root, path, hooks);
      await hooks.betweenReads?.();
      const second = await readOnce(root, path, hooks);
      if (
        first.metadata !== second.metadata ||
        first.hash !== second.hash ||
        !first.bytes.equals(second.bytes)
      ) throw new Error("unstable capture");
      if (await realpath(join(root, path.relativePath)) !== path.absolutePath) {
        throw new Error("path identity changed");
      }
      if (second.bytes.includes(0)) throw new Error("binary source");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(second.bytes);
      return {
        bytes: new Uint8Array(second.bytes),
        text,
        byteLength: second.bytes.byteLength,
        contentHash: second.hash,
        metadata: second.metadata,
      } satisfies StableCapture;
    },
    catch: () => undefined,
  }).pipe(Effect.option);
  return captured._tag === "Some" ? captured.value : undefined;
});
