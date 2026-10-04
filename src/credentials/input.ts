import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs"
import { join } from "node:path"
import { parseEnv } from "node:util"
import { HAPSLAND_CONFIG_DIRECTORY } from "../runtime/user-paths.ts"

export interface CredentialInput {
  readonly value?: Redacted.Redacted | undefined
  readonly file?: string
}
export interface CredentialInputOptions {
  readonly envVar: string
  readonly root?: string
  readonly userDirectory?: string
  /** A captured hook input is authoritative; never substitute resident environment. */
  readonly environmentValue?: string | null
}
export class CredentialInputError extends Schema.TaggedError<CredentialInputError>()("CredentialInputError", {
  file: Schema.String
}) {}

const openCredentialFile = (file: string): number | undefined => {
  try {
    return openSync(file, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
    throw new CredentialInputError({ file })
  }
}

const readBoundedFile = (descriptor: number, file: string): string => {
  const sizeLimit = 65_536
  const stats = fstatSync(descriptor)
  if (!stats.isFile() || stats.size > sizeLimit) throw new CredentialInputError({ file })
  const buffer = Buffer.alloc(sizeLimit + 1)
  let length = 0
  let read = 0
  do {
    read = readSync(descriptor, buffer, length, buffer.length - length, null)
    length += read
  } while (read > 0 && length < buffer.length)
  if (length > sizeLimit) throw new CredentialInputError({ file })
  return buffer.subarray(0, length).toString("utf8")
}

const readCredentialFile = (file: string, envVar: string): string | undefined => {
  const descriptor = openCredentialFile(file)
  if (descriptor === undefined) return undefined
  try {
    const value = parseEnv(readBoundedFile(descriptor, file))[envVar]
    return value && value.length > 0 ? value : undefined
  } finally {
    closeSync(descriptor)
  }
}

/** Reads only the selected key; never sources files or mutates process environment. */
export const resolveCredentialInput = Effect.fn("Credentials.input")(function* (
  options: CredentialInputOptions
): Effect.fn.Return<CredentialInput, CredentialInputError | Config.ConfigError> {
  if ("environmentValue" in options)
    return {
      value: options.environmentValue == null ? undefined : Redacted.make(options.environmentValue)
    } satisfies CredentialInput
  const explicit = yield* Config.option(Config.Redacted(options.envVar))
  if (Option.isSome(explicit)) return { value: explicit.value } satisfies CredentialInput
  // Callers without a repository scope retain environment/native-only resolution.
  if (options.root === undefined) return {} satisfies CredentialInput
  const files = [
    join(options.root, ".env.local"),
    join(options.root, ".env"),
    join(options.userDirectory ?? HAPSLAND_CONFIG_DIRECTORY, ".env")
  ]
  for (const file of files) {
    const value = yield* Effect.try({
      try: () => readCredentialFile(file, options.envVar),
      catch: () => new CredentialInputError({ file })
    })
    if (value !== undefined) return { value: Redacted.make(value), file } satisfies CredentialInput
  }
  return {} satisfies CredentialInput
})
