import { constants, existsSync, type BigIntStats } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import * as Effect from "effect/Effect";
import type { EligiblePath } from "./selection.ts";
import type { PhysicalRootIdentity } from "./model.ts";

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

export const descriptorDirectory = (): string | undefined =>
  ["/proc/self/fd", "/dev/fd"].find((candidate) => existsSync(candidate));

const execFileAsync = promisify(execFile);
const readOnceDarwin = async (
  root: string,
  path: EligiblePath,
  hooks: CaptureHooks,
  expectedRoot: PhysicalRootIdentity | undefined,
): Promise<{ readonly bytes: Buffer; readonly metadata: string; readonly hash: string }> => {
  const helper = fileURLToPath(new URL("../native/capture-open", import.meta.url));
  if (!existsSync(helper)) throw new Error("macOS descriptor capture helper is unavailable");
  const { stdout } = await execFileAsync(helper, [
    root,
    path.relativePath,
    expectedRoot?.rootDevice ?? "-",
    expectedRoot?.rootInode ?? "-",
    expectedRoot?.gitDirectory ?? "-",
    expectedRoot?.gitDevice ?? "-",
    expectedRoot?.gitInode ?? "-",
  ], { encoding: "buffer", maxBuffer: MAX_SOURCE_BYTES + 4_096 });
  const newline = stdout.indexOf(0x0a);
  if (newline <= 0) throw new Error("macOS descriptor capture helper returned an invalid frame");
  const metadata = stdout.subarray(0, newline).toString("utf8");
  const bytes = stdout.subarray(newline + 1);
  hooks.sourceRead?.(path.relativePath);
  return { bytes, metadata, hash: createHash("sha256").update(bytes).digest("hex") };
};

const readOnce = async (
  root: string,
  path: EligiblePath,
  hooks: CaptureHooks,
  expectedRoot: PhysicalRootIdentity | undefined,
): Promise<{ readonly bytes: Buffer; readonly metadata: string; readonly hash: string }> => {
  if (process.platform === "darwin") return readOnceDarwin(root, path, hooks, expectedRoot);
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
  expectedRoot: PhysicalRootIdentity | undefined = undefined,
) {
  const captured = yield* Effect.tryPromise({
    try: async () => {
      const first = await readOnce(root, path, hooks, expectedRoot);
      await hooks.betweenReads?.();
      const second = await readOnce(root, path, hooks, expectedRoot);
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
