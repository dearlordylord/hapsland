import { constants, type Stats } from "node:fs"
import { lstat, open, rename, rm, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { Effect, Schema } from "effect"
import { ResidentEndpointError, validateEndpointMetadata, type ResidentPaths } from "./paths.ts"
import { RESIDENT_LOOPBACK } from "./port.ts"

export const MAX_RESIDENT_ENDPOINT_BYTES = 8192
export const ResidentEndpoint = Schema.Struct({
  version: Schema.Literal(1),
  host: Schema.Literal(RESIDENT_LOOPBACK),
  port: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
  certificate: Schema.NonEmptyString.check(Schema.isMaxLength(4096)),
  token: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  pid: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
  lifetime: Schema.NonEmptyString.check(Schema.isMaxLength(256))
})
export interface ResidentEndpoint extends Schema.Schema.Type<typeof ResidentEndpoint> {}
const decode = Schema.decodeUnknownSync(ResidentEndpoint, { onExcessProperty: "error" })
const same = (a: { dev: number; ino: number }, b: { dev: number; ino: number }) => a.dev === b.dev && a.ino === b.ino
const metadata = (s: Stats) => ({
  uid: s.uid,
  mode: s.mode,
  isDirectory: s.isDirectory(),
  isSocket: s.isSocket(),
  isFile: s.isFile(),
  isSymbolicLink: s.isSymbolicLink()
})

export const readResidentEndpoint = Effect.fn("ResidentEndpoint.read")((paths: ResidentPaths) =>
  Effect.tryPromise({
    try: async () => {
      const directory = await lstat(paths.directory)
      if (!validateEndpointMetadata(metadata(directory), "directory")) throw new Error("unsafe directory")
      const handle = await open(paths.endpoint, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      try {
        const status = await handle.stat()
        if (
          !validateEndpointMetadata(metadata(status), "regular") ||
          status.nlink !== 1 ||
          status.size > MAX_RESIDENT_ENDPOINT_BYTES
        )
          throw new Error("unsafe record")
        const buffer = Buffer.alloc(MAX_RESIDENT_ENDPOINT_BYTES + 1)
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
        if (bytesRead > MAX_RESIDENT_ENDPOINT_BYTES || !same(directory, await lstat(paths.directory)))
          throw new Error("unsafe record")
        return decode(JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")))
      } finally {
        await handle.close()
      }
    },
    catch: () =>
      new ResidentEndpointError({ operation: "readEndpoint", message: "resident endpoint unavailable or unsafe" })
  })
)

export const publishResidentEndpoint = Effect.fn("ResidentEndpoint.publish")(
  (paths: ResidentPaths, endpoint: ResidentEndpoint) =>
    Effect.tryPromise({
      try: async () => {
        const temporary = `${paths.endpoint}.${randomUUID()}.candidate`
        try {
          await writeFile(temporary, `${JSON.stringify(endpoint)}\n`, { mode: 0o600, flag: "wx" })
          await rename(temporary, paths.endpoint)
        } finally {
          await rm(temporary, { force: true })
        }
      },
      catch: () =>
        new ResidentEndpointError({ operation: "publishEndpoint", message: "resident endpoint publication failed" })
    }).pipe(Effect.uninterruptible)
)

/** Never overwrite an arbitrary file/symlink just because we acquired the lock. */
export const verifyRemovableEndpoint = Effect.fn("ResidentEndpoint.verifyRemovable")((paths: ResidentPaths) =>
  Effect.tryPromise({
    try: () => lstat(paths.endpoint),
    catch: (cause) =>
      new ResidentEndpointError({
        operation: "inspectEndpoint",
        message: "resident endpoint metadata unavailable",
        ...(typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
          ? { code: cause.code }
          : {})
      })
  }).pipe(
    Effect.flatMap(() => readResidentEndpoint(paths).pipe(Effect.asVoid)),
    Effect.catch((error) => (error.code === "ENOENT" ? Effect.void : Effect.fail(error)))
  )
)
