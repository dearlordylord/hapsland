import type { DirectFilePolicy } from "@hapsland/native-observation/direct-event/selection"
import type { CodexDirectEventOutput } from "@hapsland/delivery-output/direct-event/output"
import {
  InspectionCaptureDiagnostic,
  InspectionNativeCandidate,
  InspectionRecordingRoot
} from "@hapsland/inspection-records/inspection/contract"
import { ROUND_CLOSE_REASONS, type RoundCloseReason } from "@hapsland/activity-observation/activity/status"
import {
  isCodexHostVersion,
  type NativeEditMetadata,
  type DirectObservation,
  type DirectAdvicee
} from "@hapsland/native-observation/direct-event/observation"

import { resolve } from "node:path"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type { ClaudeHostOutput } from "@hapsland/delivery-output/direct-event/claude-output"

export const MAX_IPC_FRAME_BYTES = 262_144
export const MAX_IPC_CONNECTIONS = 32
export const CLIENT_REQUEST_DEADLINE_MS = 1_500
export const STARTUP_READINESS_DEADLINE_MS = 10_000
export const DELIVERY_LEASE_MS = 5_000
export type CollectionMode = "ordinary" | "turn-end"
/** Bounded synchronous edit response; the hook retains its existing 3.9 s ceiling. */
export const EDIT_REQUEST_DEADLINE_MS = 3_900

export type ResidentControlledOptions = {
  readonly answers?: Readonly<Record<string, unknown>>
  readonly delayMs?: number
  readonly failure?: string
  readonly failureOnSourceIncludes?: string
  readonly findingOnSourceIncludes?: string
  readonly capturePath?: string
  readonly requestSummaryPath?: string
  readonly outcomePath?: string
  readonly requireCredential?: boolean
  readonly syntheticR6BrandedRepair?: "control" | "finding"
}

/** Source-free admission metadata from the immutable pre-edit settings capture. */
export type ResidentEditPolicy = {
  readonly filePolicy: DirectFilePolicy
  readonly credentialEnvVar: string
  readonly sessionAnalytics: boolean
}

export type ResidentSourceDispatchContext = {
  readonly root: string
  readonly credential: ResidentDispatchContext["credential"]
  readonly sessionAnalytics: boolean
}

export type ResidentDispatchContext = {
  readonly sourceContexts?: ReadonlyArray<ResidentSourceDispatchContext>
  readonly deliveryCwd?: string
  readonly statePath: string
  readonly activityPath?: string
  readonly sessionAnalytics?: boolean
  readonly userConfigPath: string | null
  readonly demoBudgetPath?: string | null
  readonly credential: {
    readonly name: string
    readonly environmentValue: string | null
    readonly generation: number
    readonly statePath: string
  } | null
  readonly controlled: ResidentControlledOptions | null
}

/** The sole on-socket CLI/resident message version. Internal response shapes remain operation-specific. */
export const CURRENT_IPC_VERSION = 1 as const
/** Change only when the hook-facing call contract actually becomes incompatible. */
export const CURRENT_HOOK_CONTRACT = 1 as const
export const UPDATE_NOTICE_COOLDOWN_MS = 600_000
export const MAX_UPDATE_NOTICE_KEYS = 1_024
export type ResidentRequestRoute = "shared" | "edit"
export type ResidentUnavailableReason = "backend" | "credential" | "capacity" | "stale" | "lost" | "expired"
export type ResidentRequest = (
  | {
      readonly requestRoute: "shared"
      readonly operation: "record-native"
      readonly lifetime: string
      readonly metadata: ReadonlyArray<NativeEditMetadata>
      readonly userConfigPath: string | null
      readonly activityPath?: string
    }
  | {
      readonly requestRoute: "edit"
      readonly operation: "admit-and-collect"
      readonly lifetime: string
      readonly observation: DirectObservation
      readonly controlledWriter: true
      readonly composed: true
      readonly dispatch: ResidentDispatchContext
      readonly waitMs: number
    }
  | { readonly requestRoute: "shared"; readonly operation: "hello" }
  | {
      readonly requestRoute: "shared"
      readonly operation: "recipient-root" | "edit-policy"
      readonly lifetime: string
      readonly root: string
      readonly advicee: DirectAdvicee
      readonly targetPaths?: ReadonlyArray<string>
    }
  | {
      readonly requestRoute: "shared"
      readonly operation: "prompt-marker"
      readonly lifetime: string
      readonly root: string
      readonly advicee: DirectAdvicee
      readonly marker: string
      readonly promptDigest?: string
      readonly onlyIfMissing?: true
    }
  | {
      readonly requestRoute: "shared"
      readonly operation: "begin-stop" | "finish-stop"
      readonly lifetime: string
      readonly root: string
      readonly advicee: DirectAdvicee
      readonly token: string
      readonly close?: boolean
      readonly reason?: RoundCloseReason
    }
  | {
      readonly requestRoute: "shared"
      readonly operation: "register-edit" | "retire-edit"
      readonly lifetime: string
      readonly root: string
      readonly advicee: DirectAdvicee
      readonly startedAt: number
      readonly activityPath?: string
      readonly userConfigPath?: string
    }
  | {
      readonly requestRoute: "shared"
      readonly operation: "claim-background" | "release-background"
      readonly lifetime: string
      readonly root: string
      readonly advicee: DirectAdvicee
      readonly token: string
    }
  | {
      readonly requestRoute: "shared"
      readonly operation: "begin-submission"
      readonly lifetime: string
      readonly token: string
      readonly surface: "edit" | "background" | "stop"
    }
  | {
      readonly requestRoute: "shared"
      readonly operation: "release"
      readonly lifetime: string
      readonly token: string
    }
  | {
      readonly requestRoute: "shared"
      readonly operation: "admit"
      readonly lifetime: string
      readonly observation: DirectObservation
      readonly controlledWriter: true
      readonly composed: true
      readonly dispatch: ResidentDispatchContext
    }
  | {
      readonly requestRoute: "shared"
      readonly operation: "collect"
      readonly lifetime: string
      readonly root: string
      readonly advicee: DirectAdvicee
      readonly dispatch: ResidentDispatchContext
      readonly mode?: CollectionMode
      readonly reportWorkState?: true
      readonly finish?: { readonly token: string; readonly deadlineReached: boolean }
      readonly composed: true
    }
  | {
      readonly requestRoute: "shared"
      readonly operation: "acknowledge"
      readonly lifetime: string
      readonly token: string
    }
  | {
      readonly requestRoute: "shared"
      readonly operation: "finalize"
      readonly lifetime: string
      readonly token: string
    }
  | { readonly requestRoute: "shared"; readonly operation: "stats" | "inspection-status"; readonly lifetime: string }
  | { readonly requestRoute: "shared"; readonly operation: "cleanup"; readonly lifetime: string }
  | { readonly requestRoute: "shared"; readonly operation: "replace"; readonly lifetime: string }
) & { readonly hookContract?: number; readonly updateNotice?: boolean }

export type ResidentResponse =
  | { readonly status: "update-required"; readonly warn: boolean }
  | { readonly status: "replacing" }
  | { readonly status: "edit-policy"; readonly policy: ResidentEditPolicy }
  | { readonly status: "recipient-root"; readonly root: string | null }
  | {
      readonly requestRoute: "edit"
      readonly status:
        | "rejected-capacity"
        | "rejected-stale"
        | "skipped-other-root"
        | "obsolete-lifetime"
        | "unsupported"
    }
  | { readonly requestRoute: "edit"; readonly status: "pending" | "empty" }
  | { readonly requestRoute: "edit"; readonly status: "unavailable"; readonly reason: ResidentUnavailableReason }
  | {
      readonly requestRoute: "edit"
      readonly status: "advice"
      readonly token: string
      readonly findingCount: number
      readonly output: ClaudeHostOutput
    }
  | { readonly status: "ready"; readonly lifetime: string; readonly pid: number; readonly build: string }
  | {
      readonly status: "inspection-status"
      readonly sourceId: string
      readonly observedAt: number
      readonly roots: ReadonlyArray<typeof InspectionRecordingRoot.Type>
      readonly omittedRoots: number
    }
  | {
      readonly status:
        | "accepted"
        | "skipped-other-root"
        | "rejected-capacity"
        | "rejected-stale"
        | "obsolete-lifetime"
        | "empty"
        | "pending"
        | "advanced"
        | "background-claimed"
        | "submitting"
        | "released"
        | "acknowledged"
        | "finalized"
        | "unsupported"
        | "busy"
        | "cleaned"
      readonly reason?: string
    }
  | {
      readonly status: "advice"
      readonly token: string
      readonly findingCount: number
      readonly output: CodexDirectEventOutput
    }
  | {
      readonly status: "stats"
      readonly queued: number
      readonly running: number
      readonly pendingAdvice: number
      readonly pendingFindingBatches: number
      readonly pendingOperationalNotices: number
      readonly retainedBytes: number
      readonly rejectedCapacity: number
      readonly successfulCacheEntries: number
      readonly pendingEvaluations: number
      readonly noticeCooldowns: number
      readonly currentWork: number
    }

const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined

// These schemas own structural wire validity; runtime ownership and credentials
// remain in the resident handlers. Decode with excess-property errors recursively.
const BoundedString = Schema.NonEmptyString.check(Schema.isMaxLength(16_384))
const AbsolutePath = BoundedString.check(Schema.isPattern(/^\//))
const Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const SafeNatural = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }))
const adviceeFields = { sessionId: BoundedString, toolUseId: BoundedString, subagentId: Schema.NullOr(BoundedString) }
const ClaudeAdvicee = Schema.Struct({
  ...adviceeFields,
  host: Schema.Literal("claude-code"),
  hostVersion: Schema.Literal("2.1.218"),
  turnId: Schema.Null
})
const Advicee = Schema.Union([
  ClaudeAdvicee,
  Schema.Struct({
    ...adviceeFields,
    host: Schema.Literal("pi"),
    hostVersion: Schema.Literal("1.0.0"),
    turnId: Schema.Null,
    subagentId: Schema.Null
  }),
  Schema.Struct({
    ...adviceeFields,
    host: Schema.Literal("codex-cli"),
    hostVersion: BoundedString.check(Schema.makeFilter(isCodexHostVersion)),
    turnId: BoundedString
  })
])
const ControlledOptions = Schema.Struct({
  answers: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  delayMs: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  failure: Schema.optionalKey(Schema.String),
  failureOnSourceIncludes: Schema.optionalKey(Schema.String),
  findingOnSourceIncludes: Schema.optionalKey(Schema.String),
  capturePath: Schema.optionalKey(Schema.String),
  requestSummaryPath: Schema.optionalKey(Schema.String),
  outcomePath: Schema.optionalKey(Schema.String),
  requireCredential: Schema.optionalKey(Schema.Boolean),
  syntheticR6BrandedRepair: Schema.optionalKey(Schema.Literals(["control", "finding"]))
})
const Credential = Schema.NullOr(
  Schema.Struct({
    name: Schema.String.check(Schema.isPattern(/^[A-Z_][A-Z0-9_]*$/)),
    environmentValue: Schema.NullOr(
      Schema.String.check(Schema.makeFilter((value) => Buffer.byteLength(value, "utf8") <= 32_768))
    ),
    generation: SafeNatural,
    // Preserve the credential owner's path contract independently of general path bounds.
    statePath: Schema.String.check(Schema.isPattern(/^\//))
  })
)
const Dispatch = Schema.Struct({
  sourceContexts: Schema.optionalKey(
    Schema.Array(Schema.Struct({ root: AbsolutePath, credential: Credential, sessionAnalytics: Schema.Boolean })).check(
      Schema.isMaxLength(16)
    )
  ),
  deliveryCwd: Schema.optionalKey(AbsolutePath),
  statePath: AbsolutePath,
  activityPath: Schema.optionalKey(AbsolutePath),
  sessionAnalytics: Schema.optionalKey(Schema.Boolean),
  userConfigPath: Schema.NullOr(AbsolutePath),
  demoBudgetPath: Schema.optionalKey(Schema.NullOr(AbsolutePath)),
  credential: Credential,
  controlled: Schema.NullOr(ControlledOptions)
})
const AddedLines = Schema.Array(Schema.String).check(Schema.isMaxLength(65_536))
const Candidate = Schema.Union([
  Schema.Struct({ operation: Schema.Literal("add"), path: BoundedString, addedLines: Schema.optionalKey(AddedLines) }),
  Schema.Struct({ operation: Schema.Literal("update"), path: BoundedString, addedLines: AddedLines }),
  Schema.Struct({
    operation: Schema.Literal("move"),
    path: BoundedString,
    addedLines: Schema.Tuple([]),
    moveTo: Schema.optionalKey(BoundedString)
  }),
  Schema.Struct({ operation: Schema.Literal("delete"), path: BoundedString, addedLines: Schema.Tuple([]) })
])
const Coordinate = SafeNatural.check(Schema.isGreaterThanOrEqualTo(1))
const Position = Schema.Struct({ line: Coordinate, column: Coordinate })
const VerifiedHunks = Schema.Struct({
  path: BoundedString,
  contentHash: Digest,
  hunks: Schema.Array(
    Schema.Struct({
      path: BoundedString,
      verified: Schema.Literal(true),
      location: Schema.Struct({ start: Position, end: Position })
    })
  ).check(Schema.isMinLength(1), Schema.isMaxLength(64))
}).check(Schema.makeFilter((value) => value.hunks.every((hunk) => hunk.path === value.path)))
const RootIdentity = Schema.Struct({
  rootDevice: BoundedString,
  rootInode: BoundedString,
  gitDirectory: AbsolutePath,
  gitDevice: BoundedString,
  gitInode: BoundedString
})
const NativeMetadata = Schema.Struct({
  root: AbsolutePath,
  rootIdentity: RootIdentity,
  advicee: Advicee,
  candidates: Schema.Array(InspectionNativeCandidate).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(16),
    Schema.makeFilter((value) =>
      value.every((candidate, index) => index === 0 || candidate.position > value[index - 1]!.position)
    )
  ),
  admission: Schema.optionalKey(Schema.Literal("skipped-other-root")),
  diagnostic: Schema.optionalKey(
    Schema.Union([
      Schema.Struct({
        stage: Schema.Literal("capture"),
        code: Schema.Literal("panic"),
        args: Schema.Struct({ boundary: Schema.Literal("stable-capture") })
      }),
      InspectionCaptureDiagnostic,
      Schema.Struct({
        stage: Schema.Literal("observation"),
        code: Schema.Literal("attribution-unavailable"),
        args: Schema.Struct({})
      }),
      Schema.Struct({
        stage: Schema.Literal("admission"),
        code: Schema.Literal("dispatch-unavailable"),
        args: Schema.Struct({})
      })
    ])
  )
})
const NativeMetadataArray = Schema.Array(NativeMetadata).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(16),
  Schema.makeFilter(
    (value) =>
      value.reduce((count, projection) => count + projection.candidates.length, 0) <= 16 &&
      new Set(value.map((projection) => projection.root)).size === value.length &&
      new Set(value.flatMap((projection) => projection.candidates.map((candidate) => candidate.position))).size ===
        value.reduce((count, projection) => count + projection.candidates.length, 0) &&
      value.every((projection) => projection.candidates.every((candidate) => candidate.position < 16))
  )
)
const observationFields = {
  nativeMetadata: Schema.optionalKey(NativeMetadataArray),
  root: BoundedString,
  rootIdentity: Schema.Struct({
    rootDevice: BoundedString,
    rootInode: BoundedString,
    gitDirectory: BoundedString,
    gitDevice: BoundedString,
    gitInode: BoundedString
  }),
  candidates: Schema.Array(Candidate).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
  candidateRoots: Schema.optionalKey(
    Schema.Array(
      Schema.NullOr(
        Schema.Struct({
          root: AbsolutePath,
          rootIdentity: Schema.Struct({
            rootDevice: BoundedString,
            rootInode: BoundedString,
            gitDirectory: AbsolutePath,
            gitDevice: BoundedString,
            gitInode: BoundedString
          })
        })
      )
    ).check(Schema.isMinLength(1), Schema.isMaxLength(16))
  ),
  nativePatchCommand: Schema.optionalKey(Schema.String),
  verifiedPostEditHunks: Schema.optionalKey(VerifiedHunks)
}
const BaseObservation = Schema.Struct({ ...observationFields, advicee: Advicee })
const metadataTarget = (value: typeof BaseObservation.Type, position: number) =>
  value.candidateRoots?.[position] ?? (value.candidateRoots === undefined ? value : undefined)
const nativeMoveMatches = (
  value: typeof BaseObservation.Type,
  projection: NativeEditMetadata,
  candidate: NativeEditMetadata["candidates"][number],
  native: (typeof BaseObservation.Type)["candidates"][number]
): boolean =>
  !("moveTo" in native) || native.moveTo === undefined
    ? candidate.moveTo === undefined
    : candidate.moveTo !== undefined &&
      resolve(value.root, native.moveTo) === resolve(projection.root, candidate.moveTo)
const metadataCandidateMatches = (
  value: typeof BaseObservation.Type,
  projection: NativeEditMetadata,
  candidate: NativeEditMetadata["candidates"][number]
): boolean => {
  const native = value.candidates[candidate.position]
  const target = metadataTarget(value, candidate.position)
  if (native === undefined || target === undefined || target === null) return false
  return (
    target.root === projection.root &&
    Object.keys(target.rootIdentity).every(
      (key) =>
        target.rootIdentity[key as keyof typeof target.rootIdentity] ===
        projection.rootIdentity[key as keyof typeof target.rootIdentity]
    ) &&
    candidate.operation === native.operation &&
    resolve(value.root, native.path) === resolve(projection.root, candidate.path) &&
    nativeMoveMatches(value, projection, candidate, native)
  )
}
/** A normal admission can carry only metadata for its own discovered native candidates. */
const metadataMatchesObservation = (value: typeof BaseObservation.Type): boolean =>
  (value.candidateRoots === undefined || value.candidateRoots.length === value.candidates.length) &&
  (value.nativeMetadata === undefined ||
    (value.nativeMetadata.flatMap((projection) => projection.candidates).length ===
      value.candidates.filter(
        (_, position) => value.candidateRoots === undefined || value.candidateRoots[position] !== null
      ).length &&
      value.nativeMetadata.every(
        (projection) =>
          Object.keys(value.advicee).every(
            (key) =>
              projection.advicee[key as keyof typeof value.advicee] === value.advicee[key as keyof typeof value.advicee]
          ) && projection.candidates.every((candidate) => metadataCandidateMatches(value, projection, candidate))
      )))
const Observation = BaseObservation.check(Schema.makeFilter(metadataMatchesObservation))
const ClaudeObservation = Schema.Struct({ ...observationFields, advicee: ClaudeAdvicee }).check(
  Schema.makeFilter(metadataMatchesObservation)
)
const shared = { requestRoute: Schema.Literal("shared") }
const lifetime = { ...shared, lifetime: BoundedString }
const owner = { ...lifetime, root: BoundedString, advicee: Advicee }
const token = { ...lifetime, token: BoundedString }
const admission = { controlledWriter: Schema.Literal(true), composed: Schema.Literal(true), dispatch: Dispatch }
const collection = {
  ...owner,
  operation: Schema.Literal("collect"),
  dispatch: Dispatch,
  reportWorkState: Schema.optionalKey(Schema.Literal(true)),
  composed: Schema.Literal(true)
}

const ResidentRequestSchema = Schema.Union([
  Schema.Struct({
    ...lifetime,
    operation: Schema.Literal("record-native"),
    metadata: NativeMetadataArray,
    userConfigPath: Schema.NullOr(AbsolutePath),
    activityPath: Schema.optionalKey(AbsolutePath)
  }),
  Schema.Struct({
    requestRoute: Schema.Literal("edit"),
    operation: Schema.Literal("admit-and-collect"),
    lifetime: BoundedString,
    ...admission,
    observation: ClaudeObservation,
    waitMs: SafeNatural.check(Schema.isLessThanOrEqualTo(EDIT_REQUEST_DEADLINE_MS))
  }),
  Schema.Struct({ ...shared, operation: Schema.Literal("hello") }),
  Schema.Struct({
    ...owner,
    operation: Schema.Literals(["recipient-root", "edit-policy"]),
    targetPaths: Schema.optionalKey(Schema.Array(AbsolutePath).check(Schema.isMaxLength(16)))
  }),
  Schema.Struct({
    ...owner,
    operation: Schema.Literal("prompt-marker"),
    marker: Digest,
    promptDigest: Schema.optionalKey(Digest),
    onlyIfMissing: Schema.optionalKey(Schema.Literal(true))
  }),
  Schema.Struct({
    ...owner,
    operation: Schema.Literals(["begin-stop", "finish-stop"]),
    token: BoundedString,
    close: Schema.optionalKey(Schema.Boolean),
    reason: Schema.optionalKey(Schema.Literals(ROUND_CLOSE_REASONS))
  }),
  Schema.Struct({
    ...owner,
    operation: Schema.Literals(["register-edit", "retire-edit"]),
    startedAt: Schema.Finite.check(Schema.isGreaterThan(0)),
    activityPath: Schema.optionalKey(AbsolutePath),
    userConfigPath: Schema.optionalKey(AbsolutePath)
  }),
  Schema.Struct({
    ...owner,
    operation: Schema.Literals(["claim-background", "release-background"]),
    token: Schema.String.check(Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/))
  }),
  Schema.Struct({
    ...token,
    operation: Schema.Literal("begin-submission"),
    surface: Schema.Literals(["edit", "background", "stop"])
  }),
  Schema.Struct({ ...token, operation: Schema.Literal("release") }),
  Schema.Struct({ ...token, operation: Schema.Literals(["acknowledge", "finalize"]) }),
  Schema.Struct({ ...lifetime, operation: Schema.Literal("admit"), ...admission, observation: Observation }),
  // Separate alternatives make finish mandatory only for turn-end collection.
  Schema.Struct({ ...collection, mode: Schema.optionalKey(Schema.Literal("ordinary")) }),
  Schema.Struct({
    ...collection,
    mode: Schema.Literal("turn-end"),
    finish: Schema.Struct({ token: BoundedString, deadlineReached: Schema.Boolean })
  }),
  Schema.Struct({ ...lifetime, operation: Schema.Literals(["stats", "cleanup", "inspection-status", "replace"]) })
])
const decodeRequest = Schema.decodeUnknownOption(ResidentRequestSchema, { onExcessProperty: "error" })

/** Decode only after the transport has enforced MAX_IPC_FRAME_BYTES. */
export const decodeResidentRequest = (encoded: string): ResidentRequest | undefined => {
  let parsed: unknown
  try {
    parsed = JSON.parse(encoded)
  } catch {
    return undefined
  }
  const decoded = decodeRequest(parsed)
  return Option.isSome(decoded) ? decoded.value : undefined
}

const HostOutput = Schema.Struct({
  hookSpecificOutput: Schema.Struct({
    hookEventName: Schema.Literal("PostToolUse"),
    additionalContext: Schema.String.check(Schema.isMaxLength(MAX_IPC_FRAME_BYTES))
  })
})

const ClaudeBlockHostOutput = Schema.Struct({
  decision: Schema.Literal("block"),
  reason: Schema.NonEmptyString.check(Schema.isMaxLength(MAX_IPC_FRAME_BYTES))
})

const FilePolicy = Schema.Struct({
  includes: Schema.Array(Schema.String).check(Schema.isMaxLength(1024)),
  excludes: Schema.Array(Schema.String).check(Schema.isMaxLength(1024)),
  languages: Schema.optionalKey(Schema.Array(Schema.String).check(Schema.isMaxLength(1024))),
  contextIncludes: Schema.optionalKey(Schema.Array(Schema.String).check(Schema.isMaxLength(1024))),
  contextExcludes: Schema.optionalKey(Schema.Array(Schema.String).check(Schema.isMaxLength(1024)))
})
const ResidentResponseSchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal("update-required"), warn: Schema.Boolean }),
  Schema.Struct({ status: Schema.Literal("replacing") }),
  Schema.Struct({
    status: Schema.Literal("edit-policy"),
    policy: Schema.Struct({ filePolicy: FilePolicy, credentialEnvVar: BoundedString, sessionAnalytics: Schema.Boolean })
  }),
  Schema.Struct({ status: Schema.Literal("recipient-root"), root: Schema.NullOr(AbsolutePath) }),
  Schema.Struct({
    requestRoute: Schema.Literal("edit"),
    status: Schema.Literals([
      "rejected-capacity",
      "rejected-stale",
      "skipped-other-root",
      "obsolete-lifetime",
      "unsupported"
    ])
  }),
  Schema.Struct({ requestRoute: Schema.Literal("edit"), status: Schema.Literals(["pending", "empty"]) }),
  Schema.Struct({
    requestRoute: Schema.Literal("edit"),
    status: Schema.Literal("unavailable"),
    reason: Schema.Literals(["backend", "credential", "capacity", "stale", "lost", "expired"])
  }),
  Schema.Struct({
    requestRoute: Schema.Literal("edit"),
    status: Schema.Literal("advice"),
    token: Schema.NonEmptyString,
    findingCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),

    output: HostOutput
  }),
  Schema.Struct({
    requestRoute: Schema.Literal("edit"),
    status: Schema.Literal("advice"),
    token: Schema.NonEmptyString,
    findingCount: Schema.Int.check(Schema.isGreaterThan(0)),

    output: ClaudeBlockHostOutput
  }),
  Schema.Struct({
    status: Schema.Literal("ready"),
    lifetime: Schema.NonEmptyString,
    pid: Schema.Int,
    build: BoundedString
  }),
  Schema.Struct({
    status: Schema.Literal("inspection-status"),
    sourceId: Digest,
    observedAt: SafeNatural,
    roots: Schema.Array(InspectionRecordingRoot).check(Schema.isMaxLength(128)),
    omittedRoots: SafeNatural
  }),
  Schema.Struct({
    status: Schema.Literals([
      "accepted",
      "skipped-other-root",
      "rejected-capacity",
      "rejected-stale",
      "obsolete-lifetime",
      "empty",
      "pending",
      "advanced",
      "background-claimed",
      "submitting",
      "released",
      "acknowledged",
      "finalized",
      "unsupported",
      "busy",
      "cleaned"
    ]),
    reason: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(64)))
  }),
  Schema.Struct({
    status: Schema.Literal("advice"),
    token: Schema.NonEmptyString,
    findingCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),

    output: HostOutput
  }),
  Schema.Struct({
    status: Schema.Literal("stats"),
    queued: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    running: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    pendingAdvice: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    pendingFindingBatches: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    pendingOperationalNotices: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    retainedBytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    rejectedCapacity: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    successfulCacheEntries: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    pendingEvaluations: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    noticeCooldowns: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    currentWork: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
  })
])

export const decodeResidentResponse = (value: unknown): ResidentResponse | undefined => {
  const decoded = Schema.decodeUnknownOption(ResidentResponseSchema, { onExcessProperty: "error" })(value)
  return Option.isSome(decoded) ? decoded.value : undefined
}

export type UpdateRecipient = Pick<DirectAdvicee, "host" | "sessionId" | "subagentId">
export const residentUpdateRecipient = (request: ResidentRequest): UpdateRecipient | undefined => {
  const recipient =
    "advicee" in request ? request.advicee : "observation" in request ? request.observation.advicee : undefined
  return recipient === undefined
    ? undefined
    : { host: recipient.host, sessionId: recipient.sessionId, subagentId: recipient.subagentId }
}
export const residentUpdateOpportunity = (request: ResidentRequest): boolean => {
  const recipient = residentUpdateRecipient(request)
  return (
    request.updateNotice ??
    (["admit", "admit-and-collect", "edit-policy", "prompt-marker"].includes(request.operation) ||
      (request.operation === "register-edit" && recipient?.host !== "pi") ||
      (request.operation === "collect" && request.mode === "ordinary"))
  )
}
/** Encode the current wire contract; the request route remains internal. */
export const encodeCurrentResidentRequest = (request: ResidentRequest): string => {
  const { requestRoute: _requestRoute, updateNotice: _updateNotice, ...fields } = request
  const recipient = residentUpdateRecipient(request)
  return JSON.stringify({
    ...fields,
    hookContract: request.hookContract ?? CURRENT_HOOK_CONTRACT,
    ...(recipient === undefined ? {} : { updateRecipient: recipient }),
    ...(residentUpdateOpportunity(request) ? { updateNotice: true } : {}),
    version: CURRENT_IPC_VERSION
  })
}

// Preserve operation-specific fields until the strict request alternative decodes
// them; forbidden internal route keys are rejected before route adaptation.
const CurrentRequestEnvelope = Schema.StructWithRest(
  Schema.Struct({
    version: Schema.Literal(CURRENT_IPC_VERSION),
    operation: Schema.String,
    hookContract: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
    updateNotice: Schema.optionalKey(Schema.Boolean),
    updateRecipient: Schema.optionalKey(
      Schema.Struct({
        host: Schema.Literals(["codex-cli", "claude-code", "pi", "opencode"]),
        sessionId: BoundedString,
        subagentId: Schema.NullOr(BoundedString)
      })
    )
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
).check(Schema.makeFilter((value) => !("requestRoute" in value)))

const decodeEnvelope = (encoded: string) => {
  try {
    return Schema.decodeUnknownOption(CurrentRequestEnvelope)(JSON.parse(encoded))
  } catch {
    return Option.none()
  }
}
const requestFromEnvelope = (envelope: typeof CurrentRequestEnvelope.Type): ResidentRequest | undefined => {
  const {
    version: _version,
    hookContract,
    updateNotice: _updateNotice,
    updateRecipient: _updateRecipient,
    ...fields
  } = envelope
  const decoded = decodeRequest({
    ...fields,
    requestRoute: fields.operation === "admit-and-collect" ? "edit" : "shared"
  })
  return Option.isNone(decoded)
    ? undefined
    : hookContract === undefined || hookContract === CURRENT_HOOK_CONTRACT
      ? decoded.value
      : { ...decoded.value, hookContract }
}
export const decodeCurrentResidentRequest = (encoded: string): ResidentRequest | undefined => {
  const envelope = decodeEnvelope(encoded)
  return Option.isNone(envelope) ? undefined : requestFromEnvelope(envelope.value)
}
/** Decode once; incompatible callers need only the stable source-free header. */
export const decodeCurrentResidentFrame = (encoded: string) => {
  const envelope = decodeEnvelope(encoded)
  if (Option.isNone(envelope)) return undefined
  const value = envelope.value
  if (value.operation !== "hello" && value.hookContract !== undefined && value.hookContract !== CURRENT_HOOK_CONTRACT)
    return { kind: "incompatible" as const, recipient: value.updateRecipient, eligible: value.updateNotice === true }
  const request = requestFromEnvelope(value)
  return request === undefined ? undefined : { kind: "request" as const, request }
}

export const encodeCurrentResidentResponse = (response: ResidentResponse): string => {
  const { requestRoute: _authority, ...fields } = response as ResidentResponse & { requestRoute?: ResidentRequestRoute }
  return JSON.stringify({ ...fields, version: CURRENT_IPC_VERSION })
}

/** An old resident's response never proves readiness, clear review, or submission. */
export const decodeCurrentResidentResponse = (
  value: unknown,
  request: ResidentRequest
): ResidentResponse | undefined => {
  const fields = record(value)
  if (fields?.version !== CURRENT_IPC_VERSION || fields.requestRoute !== undefined) return undefined
  const { version: _version, ...body } = fields
  return decodeResidentResponse(
    request.requestRoute === "edit" && body.status !== "update-required" ? { ...body, requestRoute: "edit" } : body
  )
}
