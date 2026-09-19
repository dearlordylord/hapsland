import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { SnapshotError } from "../domain/errors.ts";

export type Snapshot = {
  readonly path: string;
  readonly absolutePath: string;
  readonly content: string;
  readonly contentHash: string;
};

export interface Interface {
  readonly read: (
    cwd: string,
    path: string,
  ) => Effect.Effect<Snapshot, SnapshotError>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@review/SnapshotReader",
) {}

const digest = (content: string) =>
  createHash("sha256").update(content).digest("hex");

const safeRelativePath = (cwd: string, path: string) => {
  const root = resolve(cwd);
  const absolutePath = resolve(root, path);
  const fromRoot = relative(root, absolutePath);
  if (
    isAbsolute(fromRoot) ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`)
  ) {
    return undefined;
  }
  return { absolutePath, path: fromRoot || "." };
};

export const layer = Layer.succeed(
  Service,
  Service.of({
    read: Effect.fn("SnapshotReader.read")(function* (cwd, path) {
      const safe = safeRelativePath(cwd, path);
      if (safe === undefined) {
        return yield* new SnapshotError({ path, reason: "path is outside the event working directory" });
      }

      const value = yield* Effect.tryPromise({
        try: async () => {
          const info = await lstat(safe.absolutePath);
          if (!info.isFile() || info.isSymbolicLink()) {
            throw new Error("path is not a regular file");
          }
          const canonicalRoot = await realpath(resolve(cwd));
          const canonicalPath = await realpath(safe.absolutePath);
          const canonicalRelative = relative(canonicalRoot, canonicalPath);
          if (
            isAbsolute(canonicalRelative) ||
            canonicalRelative === ".." ||
            canonicalRelative.startsWith(`..${sep}`)
          ) {
            throw new Error("resolved path is outside the event working directory");
          }
          const bytes = await readFile(canonicalPath);
          return { info, bytes };
        },
        catch: (cause) =>
          new SnapshotError({
            path: safe.path,
            reason: cause instanceof Error ? cause.message : "snapshot read failed",
          }),
      });

      if (value.info.size > 256 * 1024) {
        return yield* new SnapshotError({ path: safe.path, reason: "file exceeds 262144 bytes" });
      }
      const content = value.bytes.toString("utf8");
      return {
        path: safe.path.replaceAll(sep, "/"),
        absolutePath: safe.absolutePath,
        content,
        contentHash: digest(content),
      };
    }),
  }),
);

export * as SnapshotReader from "./snapshot-reader.ts";
