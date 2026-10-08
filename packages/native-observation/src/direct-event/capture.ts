import { packageAssetPath } from "@hapsland/runtime-environment/runtime/package-runtime"
import { constants, existsSync, type BigIntStats } from "node:fs"
import { open, realpath, type FileHandle } from "node:fs/promises"
import { join } from "node:path"
import {
  execFileClosedStdinBuffer,
  type HostBufferProcessResult
} from "@hapsland/runtime-environment/process/closed-stdin"
import { createHash } from "node:crypto"
import * as Effect from "effect/Effect"
import * as Cause from "effect/Cause"
import type { EligiblePath } from "./selection.ts"
import type { PhysicalRootIdentity } from "./observation.ts"

export const MAX_SOURCE_BYTES = 2_097_152

export type StableCapture = {
  readonly bytes: Uint8Array
  readonly text: string
  readonly byteLength: number
  readonly contentHash: string
  readonly metadata: string
}

/** Observed capture facts, independent of inspection storage and wording. */
export type CaptureDiagnostic =
  | {
      readonly stage: "capture"
      readonly code: "capture-size-limit"
      readonly args: { readonly observedBytes: number; readonly limitBytes: number }
    }
  | {
      readonly stage: "capture"
      readonly code: "capture-budget-limit"
      readonly args: {
        readonly resource: "files" | "bytes"
        readonly used: number
        readonly requested: number
        readonly limit: number
      }
    }
  | {
      readonly stage: "capture"
      readonly code: "capture-unavailable"
      readonly args: { readonly reason: "missing" | "access" | "io" | "mechanism" | "unknown" }
    }
  | {
      readonly stage: "capture"
      readonly code: "capture-unstable"
      readonly args: { readonly checkpoint: "descriptor" | "double-read" }
    }
  | {
      readonly stage: "capture"
      readonly code: "capture-validation-failed"
      readonly args: {
        readonly reason:
          | "root-identity"
          | "git-identity"
          | "path-binding"
          | "file-kind"
          | "text-encoding"
          | "source-null-byte"
          | "budget-argument"
      }
    }
  | { readonly stage: "capture"; readonly code: "panic"; readonly args: { readonly boundary: "stable-capture" } }

export type CaptureResult =
  | { readonly status: "captured"; readonly capture: StableCapture }
  | { readonly status: "unavailable"; readonly diagnostic: CaptureDiagnostic }

export type CaptureHooks = {
  readonly betweenReads?: () => Effect.Effect<void, unknown>
  readonly sourceRead?: (path: string) => void
}

const signature = (status: BigIntStats): string =>
  [status.dev, status.ino, status.mode, status.size, status.mtimeNs, status.ctimeNs].map(String).join(":")

export const descriptorDirectory = (): string | undefined =>
  ["/proc/self/fd", "/dev/fd"].find((candidate) => existsSync(candidate))

/** Internal exception payload is closed; original OS messages never leave this boundary. */
class SourceCaptureError extends Error {
  constructor(readonly diagnostic: CaptureDiagnostic) {
    super("source capture refused")
  }
}
const capturePanic = (): CaptureDiagnostic => ({
  stage: "capture",
  code: "panic",
  args: { boundary: "stable-capture" }
})
const unavailableCapture = (
  reason: Extract<CaptureDiagnostic, { code: "capture-unavailable" }>["args"]["reason"]
): SourceCaptureError => new SourceCaptureError({ stage: "capture", code: "capture-unavailable", args: { reason } })
const invalidCapture = (
  reason: Extract<CaptureDiagnostic, { code: "capture-validation-failed" }>["args"]["reason"]
): SourceCaptureError =>
  new SourceCaptureError({ stage: "capture", code: "capture-validation-failed", args: { reason } })
const operationalCaptureError = (code: unknown): SourceCaptureError | undefined => {
  if (code === "ENOENT") return unavailableCapture("missing")
  if (code === "EACCES" || code === "EPERM") return unavailableCapture("access")
  if (code === "ELOOP" || code === "ENOTDIR") return invalidCapture("file-kind")
  // An actual OS failure is operational unavailability, not an application panic.
  if (typeof code === "string" && /^E[A-Z]+$/.test(code)) return unavailableCapture("io")
  return undefined
}
const sourceCaptureError = (error: unknown): SourceCaptureError => {
  if (error instanceof SourceCaptureError) return error
  const code = error instanceof Error && "code" in error ? error.code : undefined
  return operationalCaptureError(code) ?? new SourceCaptureError(capturePanic())
}
const nativeIdentityWord = (value: string | undefined): string => value ?? "-"
const darwinCaptureArguments = (
  root: string,
  path: EligiblePath,
  expected: PhysicalRootIdentity | undefined,
  maximum: number
): ReadonlyArray<string> => [
  root,
  path.relativePath,
  nativeIdentityWord(expected?.rootDevice),
  nativeIdentityWord(expected?.rootInode),
  nativeIdentityWord(expected?.gitDirectory),
  nativeIdentityWord(expected?.gitDevice),
  nativeIdentityWord(expected?.gitInode),
  String(maximum)
]
const availableDarwinCaptureHelper = Effect.fn("DirectEvent.availableDarwinCaptureHelper")(function* () {
  const helper = packageAssetPath("native", "prebuilt", "darwin-arm64", "capture-open")
  if (!existsSync(helper)) return yield* Effect.fail(unavailableCapture("mechanism"))
  return helper
})
const readOnceDarwin = Effect.fn("DirectEvent.captureDarwin")(function* (
  root: string,
  path: EligiblePath,
  hooks: CaptureHooks,
  expectedRoot: PhysicalRootIdentity | undefined,
  maxSourceBytes: number
) {
  const helper = yield* availableDarwinCaptureHelper()
  const result = yield* execFileClosedStdinBuffer(
    helper,
    darwinCaptureArguments(root, path, expectedRoot, maxSourceBytes),
    { env: process.env, timeout: Number.POSITIVE_INFINITY, maxBuffer: maxSourceBytes + 4_096 }
  )
  return yield* Effect.try({
    try: () => {
      const decoded = decodeNativeCaptureFrame(result, maxSourceBytes)
      if (decoded.status === "unavailable") throw new SourceCaptureError(decoded.diagnostic)
      hooks.sourceRead?.(path.relativePath)
      return decoded.read
    },
    catch: (error) => {
      result.stdout.fill(0)
      result.stderr.fill(0)
      return sourceCaptureError(error)
    }
  })
})

/** The existing helper wire boundary; rejects frames before source enters capture. */
export const decodeNativeCaptureFrame = (
  result: Pick<HostBufferProcessResult, "succeeded" | "stdout" | "stderr">,
  maximum: number
):
  | { readonly status: "captured"; readonly read: DescriptorCapture }
  | { readonly status: "unavailable"; readonly diagnostic: CaptureDiagnostic } => {
  try {
    if (!validCaptureBudget(maximum)) throw invalidCapture("budget-argument")
    if (!result.succeeded) throw new SourceCaptureError(darwinCaptureFailure(result.stderr, maximum))
    const read = nativeCaptureFrame(result.stdout, maximum)
    return { status: "captured", read }
  } catch (error) {
    result.stdout.fill(0)
    result.stderr.fill(0)
    return { status: "unavailable", diagnostic: sourceCaptureError(error).diagnostic }
  }
}

const nativeCaptureFrame = (stdout: Buffer, maximum: number): DescriptorCapture => {
  const newline = stdout.indexOf(0x0a)
  if (newline <= 0 || newline > 256) throw new Error("invalid capture frame")
  const metadata = stdout.subarray(0, newline).toString("utf8")
  const bytes = stdout.subarray(newline + 1)
  const fields = metadata.split(":")
  if (!validNativeCaptureMetadata(fields) || Number(fields[3]) !== bytes.byteLength || bytes.byteLength > maximum)
    throw new Error("invalid capture frame")
  return { bytes, metadata, hash: createHash("sha256").update(bytes).digest("hex") }
}
const validNativeCaptureMetadata = (fields: readonly string[]): boolean =>
  fields.length === 8 &&
  fields.slice(0, 4).every((word) => /^[0-9]+$/.test(word)) &&
  fields.slice(4).every((word) => /^-?[0-9]+$/.test(word))

const darwinFailureFacts = new Map<string, CaptureDiagnostic>([
  ["missing", unavailableCapture("missing").diagnostic],
  ["access", unavailableCapture("access").diagnostic],
  ["io", unavailableCapture("io").diagnostic],
  ["root-identity", invalidCapture("root-identity").diagnostic],
  ["git-identity", invalidCapture("git-identity").diagnostic],
  ["path-binding", invalidCapture("path-binding").diagnostic],
  ["file-kind", invalidCapture("file-kind").diagnostic],
  ["budget-argument", invalidCapture("budget-argument").diagnostic],
  ["unstable", { stage: "capture", code: "capture-unstable", args: { checkpoint: "descriptor" } }],
  ["", unavailableCapture("unknown").diagnostic]
])

/** Only the helper's finite source-free protocol is interpreted; stderr is never retained. */
const darwinCaptureFailure = (stderr: Buffer, maximum: number): CaptureDiagnostic => {
  if (stderr.byteLength > 128 || stderr.some((byte) => byte > 0x7f)) return capturePanic()
  const fact = stderr.toString("utf8").trim()
  const size = /^size-limit ([0-9]+) ([0-9]+)$/.exec(fact)
  if (size !== null) {
    const observedBytes = Number(size[1])
    const limitBytes = Number(size[2])
    if (Number.isSafeInteger(observedBytes) && observedBytes > maximum && limitBytes === maximum)
      return { stage: "capture", code: "capture-size-limit", args: { observedBytes, limitBytes } }
    return capturePanic()
  }
  return darwinFailureFacts.get(fact) ?? capturePanic()
}

type DescriptorCapture = { readonly bytes: Buffer; readonly metadata: string; readonly hash: string }
const directoryIdentityMatches = (status: BigIntStats, device: string, inode: string): boolean =>
  String(status.dev) === device && String(status.ino) === inode
const assertRootIdentity = (status: BigIntStats, expected: PhysicalRootIdentity | undefined): void => {
  if (expected !== undefined && !directoryIdentityMatches(status, expected.rootDevice, expected.rootInode))
    throw invalidCapture("root-identity")
}
const inspectGitDirectory = async (
  expected: PhysicalRootIdentity | undefined,
  flags: number,
  directories: FileHandle[]
): Promise<void> => {
  if (expected === undefined) return
  const directory = await open(expected.gitDirectory, flags)
  directories.push(directory)
  const status = await directory.stat({ bigint: true })
  if (!directoryIdentityMatches(status, expected.gitDevice, expected.gitInode)) throw invalidCapture("git-identity")
}
const openCaptureParent = async (
  parent: FileHandle,
  path: EligiblePath,
  descriptorRoot: string,
  flags: number,
  directories: FileHandle[]
): Promise<FileHandle> => {
  for (const segment of path.relativePath.split("/").slice(0, -1)) {
    parent = await open(`${descriptorRoot}/${parent.fd}/${segment}`, flags)
    directories.push(parent)
  }
  return parent
}
const assertCaptureFileBounds = (status: BigIntStats, maximum: number): void => {
  if (!status.isFile()) throw invalidCapture("file-kind")
  if (status.size > BigInt(maximum)) {
    const observedBytes = Number(status.size)
    if (!Number.isSafeInteger(observedBytes)) throw new SourceCaptureError(capturePanic())
    throw new SourceCaptureError({
      stage: "capture",
      code: "capture-size-limit",
      args: { observedBytes, limitBytes: maximum }
    })
  }
}
const readDescriptorBytes = async (file: FileHandle, buffer: Buffer): Promise<number> => {
  let offset = 0
  while (offset < buffer.length) {
    const result = await file.read(buffer, offset, buffer.length - offset, offset)
    if (result.bytesRead === 0) break
    offset += result.bytesRead
  }
  return offset
}
const assertDescriptorCaptureStable = (before: BigIntStats, after: BigIntStats, length: number): void => {
  if (BigInt(length) !== after.size || signature(before) !== signature(after))
    throw new SourceCaptureError({ stage: "capture", code: "capture-unstable", args: { checkpoint: "descriptor" } })
}
const readCaptureDescriptor = async (
  file: FileHandle,
  path: EligiblePath,
  hooks: CaptureHooks,
  maximum: number
): Promise<DescriptorCapture> => {
  const before = await file.stat({ bigint: true })
  assertCaptureFileBounds(before, maximum)
  const buffer = Buffer.alloc(maximum)
  try {
    const length = await readDescriptorBytes(file, buffer)
    hooks.sourceRead?.(path.relativePath)
    const after = await file.stat({ bigint: true })
    assertDescriptorCaptureStable(before, after, length)
    const bytes = buffer.subarray(0, length)
    return { bytes, metadata: signature(after), hash: createHash("sha256").update(bytes).digest("hex") }
  } catch (error) {
    buffer.fill(0)
    throw error
  }
}
const readCaptureSource = async (
  parent: FileHandle,
  path: EligiblePath,
  hooks: CaptureHooks,
  descriptorRoot: string,
  maximum: number
): Promise<DescriptorCapture> => {
  const basename = path.relativePath.split("/").at(-1)
  if (basename === undefined) throw new Error("invalid path")
  const file = await open(
    `${descriptorRoot}/${parent.fd}/${basename}`,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  )
  return readAndCloseCaptureDescriptors([file], () => readCaptureDescriptor(file, path, hooks, maximum))
}
const closeCaptureDescriptors = async (
  descriptors: FileHandle[],
  captured: DescriptorCapture | undefined
): Promise<void> => {
  const closed = await Promise.allSettled(descriptors.reverse().map((descriptor) => descriptor.close()))
  const failure = closed.find((result) => result.status === "rejected")
  if (failure !== undefined) {
    captured?.bytes.fill(0)
    throw failure.reason
  }
}
const readAndCloseCaptureDescriptors = async (
  descriptors: FileHandle[],
  read: () => Promise<DescriptorCapture>
): Promise<DescriptorCapture> => {
  let captured: DescriptorCapture
  try {
    captured = await read()
  } catch (error) {
    // A secondary cleanup failure must not replace the observed capture refusal.
    await closeCaptureDescriptors(descriptors, undefined).catch(() => undefined)
    throw error
  }
  await closeCaptureDescriptors(descriptors, captured)
  return captured
}
const readOnceLinux = async (
  root: string,
  path: EligiblePath,
  hooks: CaptureHooks,
  expectedRoot: PhysicalRootIdentity | undefined,
  maxSourceBytes: number
): Promise<DescriptorCapture> => {
  const descriptorRoot = descriptorDirectory()
  if (descriptorRoot === undefined) throw unavailableCapture("mechanism")
  const directoryFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  const directories: FileHandle[] = []
  let parent = await open(root, directoryFlags)
  directories.push(parent)
  return readAndCloseCaptureDescriptors(directories, async () => {
    assertRootIdentity(await parent.stat({ bigint: true }), expectedRoot)
    await inspectGitDirectory(expectedRoot, directoryFlags, directories)
    parent = await openCaptureParent(parent, path, descriptorRoot, directoryFlags, directories)
    return readCaptureSource(parent, path, hooks, descriptorRoot, maxSourceBytes)
  })
}

const readOnce = Effect.fn("DirectEvent.captureRead")(
  (
    root: string,
    path: EligiblePath,
    hooks: CaptureHooks,
    expectedRoot: PhysicalRootIdentity | undefined,
    maxSourceBytes: number
  ) =>
    process.platform === "darwin"
      ? readOnceDarwin(root, path, hooks, expectedRoot, maxSourceBytes)
      : Effect.tryPromise({
          try: () => readOnceLinux(root, path, hooks, expectedRoot, maxSourceBytes),
          catch: sourceCaptureError
        }).pipe(Effect.uninterruptible)
)
const clearRead = (read: Effect.Success<ReturnType<typeof readOnce>>) =>
  Effect.sync(() => {
    read.bytes.fill(0)
  })

const validCaptureBudget = (maximum: number): boolean =>
  Number.isSafeInteger(maximum) && maximum >= 1 && maximum <= MAX_SOURCE_BYTES
const matchingDescriptorCaptures = (first: DescriptorCapture, second: DescriptorCapture): boolean =>
  first.metadata === second.metadata && first.hash === second.hash && first.bytes.equals(second.bytes)
const stableCaptureResult = (
  first: DescriptorCapture,
  second: DescriptorCapture,
  currentPath: string,
  path: EligiblePath
): StableCapture => {
  if (!matchingDescriptorCaptures(first, second))
    throw new SourceCaptureError({ stage: "capture", code: "capture-unstable", args: { checkpoint: "double-read" } })
  if (currentPath !== path.absolutePath) throw invalidCapture("path-binding")
  if (second.bytes.includes(0)) throw invalidCapture("source-null-byte")
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(second.bytes)
  } catch {
    throw invalidCapture("text-encoding")
  }
  return {
    bytes: new Uint8Array(second.bytes),
    text,
    byteLength: second.bytes.byteLength,
    contentHash: second.hash,
    metadata: second.metadata
  }
}

/** Two bounded matching reads are required; failures never return partial bytes. */
export const captureStable = Effect.fn("DirectEvent.captureStable")(function* (
  root: string,
  path: EligiblePath,
  hooks: CaptureHooks = {},
  expectedRoot: PhysicalRootIdentity | undefined = undefined,
  maxSourceBytes: number = MAX_SOURCE_BYTES
): Effect.fn.Return<CaptureResult> {
  if (!validCaptureBudget(maxSourceBytes))
    return { status: "unavailable", diagnostic: invalidCapture("budget-argument").diagnostic }
  return yield* Effect.acquireUseRelease(
    readOnce(root, path, hooks, expectedRoot, maxSourceBytes),
    (first) =>
      Effect.gen(function* () {
        if (hooks.betweenReads !== undefined) yield* hooks.betweenReads()
        return yield* Effect.acquireUseRelease(
          readOnce(root, path, hooks, expectedRoot, maxSourceBytes),
          (second) =>
            Effect.gen(function* () {
              const currentPath = yield* Effect.tryPromise({
                try: () => realpath(join(root, path.relativePath)),
                catch: sourceCaptureError
              }).pipe(Effect.uninterruptible)
              return yield* Effect.try({
                try: () => stableCaptureResult(first, second, currentPath, path),
                catch: sourceCaptureError
              })
            }),
          clearRead
        )
      }),
    clearRead
  ).pipe(
    Effect.map((capture): CaptureResult => ({ status: "captured", capture })),
    Effect.catchCause((cause) => {
      if (Cause.hasInterrupts(cause))
        return Effect.failCause(Cause.fromReasons<never>(cause.reasons.filter(Cause.isInterruptReason)))
      return Effect.succeed<CaptureResult>({
        status: "unavailable",
        diagnostic: Cause.hasDies(cause) ? capturePanic() : sourceCaptureError(Cause.squash(cause)).diagnostic
      })
    })
  )
})
