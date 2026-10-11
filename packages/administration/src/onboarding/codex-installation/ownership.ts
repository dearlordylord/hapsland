import { OWNED_MARKER } from "./hook-identity.ts"
import { Schema } from "effect"
import { snapshot } from "./file-snapshots.ts"
import { isObject } from "./configuration-values.ts"

export interface OwnershipRecord {
  readonly version: 1
  readonly adapter: "codex"
  readonly codexHome: string
  readonly runtimeVersion: string
  readonly packageVersion: string
  readonly residentProtocol: number
  readonly executable: string
  readonly args: ReadonlyArray<string>
  readonly marker: typeof OWNED_MARKER
  readonly hookFingerprint: string
  readonly hookGroups?: Record<string, unknown>
  readonly composedFingerprints?: {
    readonly stop: string
    readonly subagentStop?: string
    readonly preToolUse?: string
  }
  readonly owned: ReadonlyArray<{
    readonly file: string
    readonly kind: "feature" | "hook"
    readonly fingerprint: string
  }>
}

const ComposedFingerprints = Schema.Struct({
  stop: Schema.String,
  subagentStop: Schema.optional(Schema.String),
  preToolUse: Schema.optional(Schema.String)
})

const OwnershipRecordShape = Schema.Struct({
  version: Schema.Literal(1),
  adapter: Schema.Literal("codex"),
  codexHome: Schema.String,
  runtimeVersion: Schema.String,
  packageVersion: Schema.String,
  residentProtocol: Schema.Literal(1),
  executable: Schema.String,
  args: Schema.Array(Schema.String),
  marker: Schema.Literal(OWNED_MARKER),
  hookFingerprint: Schema.String,
  hookGroups: Schema.optional(Schema.Unknown),
  composedFingerprints: Schema.optional(ComposedFingerprints),
  owned: Schema.Array(Schema.Unknown)
})

const OwnedEntry = Schema.Struct({
  file: Schema.String,
  kind: Schema.Literals(["feature", "hook"]),
  fingerprint: Schema.String
})

const decodeOwnershipRecord = (value: unknown) => {
  try {
    return Schema.decodeUnknownSync(OwnershipRecordShape)(value)
  } catch {
    throw new Error("installation ownership record has an unsupported shape or version")
  }
}

const decodeOwnedEntry = (value: unknown) => {
  try {
    return Schema.decodeUnknownSync(OwnedEntry)(value)
  } catch {
    throw new Error("installation ownership record has an unsupported owned-entry shape")
  }
}

export const readOwnership = (path: string): OwnershipRecord | undefined => {
  const file = snapshot(path)
  if (!file.exists) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(file.content)
  } catch {
    throw new Error("installation ownership record is malformed")
  }
  const value = decodeOwnershipRecord(parsed)
  return {
    version: 1,
    adapter: "codex",
    codexHome: value.codexHome,
    runtimeVersion: value.runtimeVersion,
    packageVersion: value.packageVersion,
    residentProtocol: 1,
    executable: value.executable,
    args: value.args,
    marker: OWNED_MARKER,
    hookFingerprint: value.hookFingerprint,
    ...(isObject(value.hookGroups) ? { hookGroups: value.hookGroups } : {}),
    ...(value.composedFingerprints === undefined
      ? {}
      : {
          composedFingerprints: {
            stop: value.composedFingerprints.stop,
            ...(value.composedFingerprints.subagentStop === undefined
              ? {}
              : { subagentStop: value.composedFingerprints.subagentStop }),
            ...(value.composedFingerprints.preToolUse === undefined
              ? {}
              : { preToolUse: value.composedFingerprints.preToolUse })
          }
        }),
    owned: value.owned.map(decodeOwnedEntry)
  }
}

export const OWNERSHIP_VERSION = 1 as const
