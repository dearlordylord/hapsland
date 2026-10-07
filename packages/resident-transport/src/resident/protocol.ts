import type { CodexDirectEventOutput } from "@hapsland/delivery-output/direct-event/output"
import { InspectionRecordingRoot } from "@hapsland/inspection-records/inspection/contract"
import { ROUND_CLOSE_REASONS, type RoundCloseReason } from "@hapsland/activity-observation/activity/status"
import {
  isCodexHostVersion,
  type DirectObservation,
  type DirectAdvicee
} from "@hapsland/native-observation/direct-event/observation"

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

export type ResidentDispatchContext = {
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
export type ResidentRequestRoute = "shared" | "edit"
export type ResidentUnavailableReason = "backend" | "credential" | "capacity" | "stale" | "lost" | "expired"
export type ResidentRequest =
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

export type ResidentResponse =
  | {
      readonly requestRoute: "edit"
      readonly status: "rejected-capacity" | "rejected-stale" | "obsolete-lifetime" | "unsupported"
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
  | { readonly status: "ready"; readonly lifetime: string; readonly pid: number }
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
const Dispatch = Schema.Struct({
  statePath: AbsolutePath,
  activityPath: Schema.optionalKey(AbsolutePath),
  sessionAnalytics: Schema.optionalKey(Schema.Boolean),
  userConfigPath: Schema.NullOr(AbsolutePath),
  demoBudgetPath: Schema.optionalKey(Schema.NullOr(AbsolutePath)),
  credential: Schema.NullOr(
    Schema.Struct({
      name: Schema.String.check(Schema.isPattern(/^[A-Z_][A-Z0-9_]*$/)),
      environmentValue: Schema.NullOr(
        Schema.String.check(Schema.makeFilter((value) => Buffer.byteLength(value, "utf8") <= 32_768))
      ),
      generation: SafeNatural,
      // Preserve the credential owner's path contract independently of general path bounds.
      statePath: Schema.String.check(Schema.isPattern(/^\//))
    })
  ),
  controlled: Schema.NullOr(ControlledOptions)
})
const AddedLines = Schema.Array(Schema.String).check(Schema.isMaxLength(65_536))
const Candidate = Schema.Union([
  Schema.Struct({ operation: Schema.Literal("add"), path: BoundedString, addedLines: Schema.optionalKey(AddedLines) }),
  Schema.Struct({ operation: Schema.Literal("update"), path: BoundedString, addedLines: AddedLines }),
  Schema.Struct({ operation: Schema.Literals(["delete", "move"]), path: BoundedString, addedLines: Schema.Tuple([]) })
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
const observationFields = {
  root: BoundedString,
  rootIdentity: Schema.Struct({
    rootDevice: BoundedString,
    rootInode: BoundedString,
    gitDirectory: BoundedString,
    gitDevice: BoundedString,
    gitInode: BoundedString
  }),
  candidates: Schema.Array(Candidate).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
  nativePatchCommand: Schema.optionalKey(Schema.String),
  verifiedPostEditHunks: Schema.optionalKey(VerifiedHunks)
}
const Observation = Schema.Struct({ ...observationFields, advicee: Advicee })
const ClaudeObservation = Schema.Struct({ ...observationFields, advicee: ClaudeAdvicee })
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
  Schema.Struct({ ...lifetime, operation: Schema.Literals(["stats", "cleanup", "inspection-status"]) })
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

const ResidentResponseSchema = Schema.Union([
  Schema.Struct({
    requestRoute: Schema.Literal("edit"),
    status: Schema.Literals(["rejected-capacity", "rejected-stale", "obsolete-lifetime", "unsupported"])
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
  Schema.Struct({ status: Schema.Literal("ready"), lifetime: Schema.NonEmptyString, pid: Schema.Int }),
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

/** Encode the current wire contract; the request route remains internal. */
export const encodeCurrentResidentRequest = (request: ResidentRequest): string => {
  const { requestRoute: _requestRoute, ...fields } = request
  return JSON.stringify({ ...fields, version: CURRENT_IPC_VERSION })
}

// Preserve operation-specific fields until the strict request alternative decodes
// them; forbidden internal route keys are rejected before route adaptation.
const CurrentRequestEnvelope = Schema.StructWithRest(
  Schema.Struct({ version: Schema.Literal(CURRENT_IPC_VERSION), operation: Schema.String }),
  [Schema.Record(Schema.String, Schema.Unknown)]
).check(Schema.makeFilter((value) => !("requestRoute" in value)))

export const decodeCurrentResidentRequest = (encoded: string): ResidentRequest | undefined => {
  let parsed: unknown
  try {
    parsed = JSON.parse(encoded)
  } catch {
    return undefined
  }
  const envelope = Schema.decodeUnknownOption(CurrentRequestEnvelope)(parsed)
  if (Option.isNone(envelope)) return undefined
  const { version: _version, ...fields } = envelope.value
  const decoded = decodeRequest({
    ...fields,
    requestRoute: fields.operation === "admit-and-collect" ? "edit" : "shared"
  })
  return Option.isSome(decoded) ? decoded.value : undefined
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
  return decodeResidentResponse(request.requestRoute === "edit" ? { ...body, requestRoute: "edit" } : body)
}
