import { activitySessionKey, activityRepositoryKey, pruneActivityStore } from "./storage.ts"
import { createHash, randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { DirectAdvicee } from "../direct-event/observation.ts"

export const MAX_ACTIVITY_EVENTS_PER_SESSION = 256
export const MAX_ACTIVITY_MARKERS_PER_EVENT = 72
const ACTIVITY_VERSION = 1 as const

export type ActivityStage = "pending" | "skipped" | "clear" | "findings" | "submitted" | "unavailable" | "incomplete"
type EvaluationStage = Exclude<ActivityStage, "submitted">
type BaseMarker = {
  readonly version: 1
  readonly sessionKey: string
  readonly childKey: string
  readonly repositoryKey: string
  readonly eventKey: string
  readonly lifetime: string
  readonly observedAt: number
}
type ActivityMarker = BaseMarker & {
  readonly kind: "activity"
  readonly stage: EvaluationStage
  readonly findings: number
  readonly unitKey?: string
  readonly expectedUnitKeys?: ReadonlyArray<string>
}
type SubmissionMarker = BaseMarker & { readonly kind: "submission"; readonly findings: number }
export const ROUND_CLOSE_REASONS = [
  "no-advice",
  "deadline",
  "limit",
  "unavailable",
  "output-failed",
  "abandoned-stop",
  "quiescent"
] as const
export type RoundCloseReason = (typeof ROUND_CLOSE_REASONS)[number]
export type RoundClosureSummary = {
  readonly roundKey: string
  readonly reason: RoundCloseReason
  readonly reservedContinuations: number
  readonly discarded: {
    readonly queued: number
    readonly running: number
    readonly pendingAdvice: number
    readonly submitted: number
    readonly uncertain: number
    readonly editPermits: number
  }
}
type RoundClosureMarker = BaseMarker & RoundClosureSummary & { readonly kind: "round-closure"; readonly findings: 0 }
type Marker = ActivityMarker | SubmissionMarker | RoundClosureMarker

export type ActivityKind =
  | "no-observation"
  | "skipped"
  | "pending"
  | "clear"
  | "findings"
  | "submitted"
  | "unavailable"
  | "incomplete"
  | "restarted/lost"
export type ActivityStatus = {
  readonly kind: ActivityKind
  readonly observed: boolean
  readonly source: "resident-v1"
  readonly boundedToEvents: number
  readonly counts: Readonly<Record<ActivityKind, number>>
  readonly findings: number
  readonly children: ReadonlyArray<{
    readonly identity: "root" | "child"
    readonly key: string
    readonly events: number
  }>
  readonly firstObservedAt?: number
  readonly lastObservedAt?: number
  readonly submission: { readonly status: "none" | "submitted"; readonly findings: number }
  readonly modelReaction: { readonly status: "unavailable"; readonly reason: "host-model-reaction-not-instrumented" }
  readonly roundClosures?: ReadonlyArray<RoundClosureSummary>
  readonly limitation?: "activity-state-unreadable" | "session-id-required"
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const sessionKey = activitySessionKey
const childKey = (value: string | null) => hash(`activity-v1:child\0${value ?? "root"}`)
const repositoryKey = activityRepositoryKey
const eventKey = (value: DirectAdvicee) =>
  hash(`activity-v1:event\0${value.sessionId}\0${value.subagentId ?? "root"}\0${value.turnId}\0${value.toolUseId}`)
const unitKey = (value: string) => hash(`activity-v1:unit\0${value}`)
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 65_536

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const validLifetime = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 512
const validObservedAt = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const validMarkerIdentity = (item: Readonly<Record<string, unknown>>) =>
  item.version === ACTIVITY_VERSION &&
  digest(item.sessionKey) &&
  digest(item.childKey) &&
  digest(item.repositoryKey) &&
  digest(item.eventKey)
const validMarkerBase = (item: Readonly<Record<string, unknown>>) =>
  validMarkerIdentity(item) && validLifetime(item.lifetime) && validObservedAt(item.observedAt) && count(item.findings)
const validExpectedUnits = (value: unknown) =>
  value === undefined || (Array.isArray(value) && value.length <= 64 && value.every(digest))
const validActivityFields = (item: Readonly<Record<string, unknown>>) =>
  item.kind === "activity" &&
  ["pending", "skipped", "clear", "findings", "unavailable", "incomplete"].includes(String(item.stage)) &&
  (item.unitKey === undefined || digest(item.unitKey)) &&
  validExpectedUnits(item.expectedUnitKeys)
const validDiscarded = (discarded: unknown) =>
  typeof discarded === "object" &&
  discarded !== null &&
  ["queued", "running", "pendingAdvice", "submitted", "uncertain", "editPermits"].every((key) =>
    count(Reflect.get(discarded, key))
  )
const validRoundClosureFields = (item: Readonly<Record<string, unknown>>) =>
  digest(item.roundKey) &&
  ROUND_CLOSE_REASONS.some((reason) => reason === item.reason) &&
  count(item.reservedContinuations) &&
  Number(item.reservedContinuations) <= 4 &&
  validDiscarded(item.discarded)

const isMarker = (value: unknown): value is Marker => {
  if (!isRecord(value) || !validMarkerBase(value)) return false
  if (value.kind === "submission") return true
  if (value.kind === "round-closure") return validRoundClosureFields(value)
  return validActivityFields(value)
}

const readMarker = (path: string): Marker | undefined => {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"))
    return isMarker(value) ? value : undefined
  } catch {
    return undefined
  }
}

const atomicCreate = (directory: string, marker: Marker): void => {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const target = join(directory, `${marker.eventKey}.${marker.observedAt}.${process.pid}.${randomUUID()}.json`)
  const temporary = `${target}.tmp`
  try {
    writeFileSync(temporary, `${JSON.stringify(marker)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" })
    renameSync(temporary, target)
  } finally {
    rmSync(temporary, { force: true })
  }
}

type MarkerEntry = { readonly path: string; readonly marker: Marker }
type MarkerGroup = { readonly at: number; readonly entries: Array<MarkerEntry> }
const addMarkerGroup = (groups: Map<string, MarkerGroup>, path: string, marker: Marker) => {
  const previous = groups.get(marker.eventKey)
  groups.set(marker.eventKey, {
    at: Math.max(previous?.at ?? 0, marker.observedAt),
    entries: [...(previous?.entries ?? []), { path, marker }]
  })
}

const markerGroups = (directory: string) => {
  const groups = new Map<string, MarkerGroup>()
  try {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue
      const path = join(directory, entry.name)
      const marker = readMarker(path)
      if (marker !== undefined) addMarkerGroup(groups, path, marker)
    }
    return groups
  } catch {
    return undefined
  }
}

const semanticMarkerKey = (marker: Marker) => {
  if (marker.kind === "round-closure") return "round-closure"
  if (marker.kind === "submission") return "submission"
  if (marker.expectedUnitKeys !== undefined) return "plan"
  return marker.unitKey === undefined ? `stage:${marker.stage}` : `unit:${marker.unitKey}`
}

const pruneMarkerGroup = (group: MarkerGroup) => {
  const newest = [...group.entries].sort(
    (left, right) => right.marker.observedAt - left.marker.observedAt || right.path.localeCompare(left.path)
  )
  const bySemanticMarker = new Map<string, (typeof newest)[number]>()
  for (const entry of newest) {
    const marker = entry.marker
    const key = semanticMarkerKey(marker)
    if (!bySemanticMarker.has(key)) bySemanticMarker.set(key, entry)
  }
  const deduplicated = [...bySemanticMarker.entries()]
  const essential = deduplicated.filter(([key]) => !key.startsWith("unit:"))
  const units = deduplicated
    .filter(([key]) => key.startsWith("unit:"))
    .slice(0, Math.max(0, MAX_ACTIVITY_MARKERS_PER_EVENT - essential.length))
  const retained = new Set([...essential, ...units].map(([, entry]) => entry.path))
  for (const { path } of group.entries) {
    if (!retained.has(path)) rmSync(path, { force: true })
  }
}

const prune = (directory: string): void => {
  const groups = markerGroups(directory)
  if (groups === undefined) return
  const orderedGroups = [...groups.values()].sort((left, right) => right.at - left.at)
  for (const group of orderedGroups.slice(MAX_ACTIVITY_EVENTS_PER_SESSION)) {
    for (const { path } of group.entries) rmSync(path, { force: true })
  }
  for (const group of orderedGroups.slice(0, MAX_ACTIVITY_EVENTS_PER_SESSION)) pruneMarkerGroup(group)
}

/** Immutable, source-free, best-effort marker creation. */
type RecordActivityOptions = {
  readonly statePath: string | undefined
  readonly root: string
  readonly advicee: DirectAdvicee
  readonly lifetime: string
  readonly stage: ActivityStage
  readonly findings?: number
  readonly submittedFindings?: number
  readonly unitIdentity?: string
  readonly expectedUnitIdentities?: ReadonlyArray<string>
  readonly now?: number
}

const activityMarker = (options: RecordActivityOptions, base: BaseMarker): Marker => {
  return options.stage === "submitted"
    ? { ...base, kind: "submission", findings: Math.min(65_536, Math.max(0, options.submittedFindings ?? 0)) }
    : {
        ...base,
        kind: "activity",
        stage: options.stage,
        findings: Math.min(65_536, Math.max(0, options.findings ?? 0)),
        ...(options.unitIdentity === undefined ? {} : { unitKey: unitKey(options.unitIdentity) }),
        ...(options.expectedUnitIdentities === undefined
          ? {}
          : { expectedUnitKeys: [...new Set(options.expectedUnitIdentities.map(unitKey))].slice(0, 64) })
      }
}

export const recordActivity = (options: RecordActivityOptions): void => {
  if (options.statePath === undefined) return
  try {
    const directory = join(options.statePath, sessionKey(options.advicee.sessionId))
    const base: BaseMarker = {
      version: ACTIVITY_VERSION,
      sessionKey: sessionKey(options.advicee.sessionId),
      childKey: childKey(options.advicee.subagentId),
      repositoryKey: repositoryKey(options.root),
      eventKey: eventKey(options.advicee),
      lifetime: options.lifetime,
      observedAt: options.now ?? Date.now()
    }
    const marker = activityMarker(options, base)
    atomicCreate(directory, marker)
    prune(directory)
    pruneActivityStore(options.statePath)
  } catch {
    // Activity is advisory and cannot fail an already-completed host edit.
  }
}

/** A bounded source-free explanation of the resource cleanup at round closure. */
export const recordRoundClosure = (options: {
  readonly statePath: string | undefined
  readonly root: string
  readonly advicee: DirectAdvicee
  readonly lifetime: string
  readonly roundIdentity: string
  readonly reason: RoundCloseReason
  readonly reservedContinuations: number
  readonly discarded: RoundClosureSummary["discarded"]
}): void => {
  if (options.statePath === undefined) return
  try {
    const directory = join(options.statePath, sessionKey(options.advicee.sessionId))
    const roundKey = hash(`round:${options.lifetime}:${options.roundIdentity}`)
    atomicCreate(directory, {
      version: 1,
      kind: "round-closure",
      findings: 0,
      sessionKey: sessionKey(options.advicee.sessionId),
      childKey: childKey(options.advicee.subagentId),
      repositoryKey: repositoryKey(options.root),
      eventKey: roundKey,
      roundKey,
      lifetime: options.lifetime,
      observedAt: Date.now(),
      reason: options.reason,
      reservedContinuations: options.reservedContinuations,
      discarded: options.discarded
    })
    prune(directory)
    pruneActivityStore(options.statePath)
  } catch {
    /* Advisory accounting must not prevent cleanup. */
  }
}

const emptyCounts = (): Record<ActivityKind, number> => ({
  "no-observation": 0,
  skipped: 0,
  pending: 0,
  clear: 0,
  findings: 0,
  submitted: 0,
  unavailable: 0,
  incomplete: 0,
  "restarted/lost": 0
})
const priority: Readonly<Record<EvaluationStage, number>> = {
  pending: 0,
  skipped: 1,
  clear: 2,
  findings: 3,
  incomplete: 4,
  unavailable: 5
}

const preferMarker = (current: ActivityMarker | undefined, marker: ActivityMarker) =>
  current === undefined || priority[marker.stage] >= priority[current.stage] ? marker : current

const terminalMarkersFor = (ordered: ReadonlyArray<ActivityMarker>) => {
  const terminals = new Map<string, ActivityMarker>()
  let eventStage: ActivityMarker | undefined
  for (const marker of ordered) {
    if (marker.unitKey !== undefined) terminals.set(marker.unitKey, preferMarker(terminals.get(marker.unitKey), marker))
    else if (marker.expectedUnitKeys === undefined) eventStage = preferMarker(eventStage, marker)
  }
  return { terminals, eventStage }
}

const eventPending = (
  expected: ReadonlySet<string>,
  terminals: ReadonlyMap<string, ActivityMarker>,
  eventStage: ActivityMarker | undefined
) => (expected.size > 0 ? [...expected].some((key) => !terminals.has(key)) : eventStage?.stage === "pending")

const eventTerminal = (eventStage: ActivityMarker | undefined, terminalMarkers: ReadonlyArray<ActivityMarker>) => {
  const terminalStage = terminalMarkers.reduce<ActivityMarker | undefined>(preferMarker, undefined)
  return eventStage === undefined ||
    (terminalStage !== undefined && priority[terminalStage.stage] > priority[eventStage.stage])
    ? terminalStage
    : eventStage
}

const reduceEvent = (
  markers: ReadonlyArray<ActivityMarker>,
  resident: { readonly available: boolean; readonly lifetime?: string }
): { readonly kind: Exclude<ActivityKind, "no-observation" | "submitted">; readonly findings: number } => {
  const ordered = [...markers].sort((left, right) => left.observedAt - right.observedAt)
  const expected = new Set(
    ordered.filter((marker) => marker.expectedUnitKeys !== undefined).at(-1)?.expectedUnitKeys ?? []
  )
  const { terminals, eventStage } = terminalMarkersFor(ordered)
  const residentLost = !resident.available || resident.lifetime !== ordered.at(-1)?.lifetime
  if (eventPending(expected, terminals, eventStage)) {
    return { kind: residentLost ? "restarted/lost" : "pending", findings: 0 }
  }
  const terminalMarkers = [...terminals.values()]
  const findings = (eventStage?.findings ?? 0) + terminalMarkers.reduce((total, marker) => total + marker.findings, 0)
  const selected = eventTerminal(eventStage, terminalMarkers)
  return { kind: selected?.stage ?? "skipped", findings }
}

const overallKind = (counts: Readonly<Record<ActivityKind, number>>): ActivityKind => {
  for (const kind of [
    "restarted/lost",
    "incomplete",
    "unavailable",
    "pending",
    "submitted",
    "findings",
    "clear",
    "skipped"
  ] as const) {
    if (counts[kind] > 0) return kind
  }
  return "no-observation"
}

const emptyActivity = (limitation?: ActivityStatus["limitation"]): ActivityStatus => ({
  kind: "no-observation",
  observed: false,
  source: "resident-v1",
  boundedToEvents: MAX_ACTIVITY_EVENTS_PER_SESSION,
  counts: emptyCounts(),
  findings: 0,
  children: [],
  submission: { status: "none", findings: 0 },
  modelReaction: { status: "unavailable", reason: "host-model-reaction-not-instrumented" },
  ...(limitation === undefined ? {} : { limitation })
})

const missingDirectory = (cause: unknown) =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT"
const sessionMarkers = (directory: string, root: string) => {
  let limitation: ActivityStatus["limitation"]
  try {
    const markers = readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isFile() || !entry.name.endsWith(".json")) return []
      const marker = readMarker(join(directory, entry.name))
      if (marker === undefined) {
        limitation = "activity-state-unreadable"
        return []
      }
      return marker.repositoryKey === repositoryKey(root) ? [marker] : []
    })
    return { status: "loaded" as const, markers, limitation }
  } catch (cause) {
    return { status: missingDirectory(cause) ? ("missing" as const) : ("unreadable" as const) }
  }
}

interface ActivityIndex {
  readonly roundClosures: RoundClosureSummary[]
  readonly events: Map<string, ActivityMarker[]>
  readonly submissions: Map<string, SubmissionMarker>
  readonly children: Map<string, Set<string>>
  firstObservedAt: number | undefined
  lastObservedAt: number | undefined
}

const indexSubmission = (index: ActivityIndex, marker: SubmissionMarker) => {
  const previous = index.submissions.get(marker.eventKey)
  if (previous === undefined || marker.observedAt >= previous.observedAt) index.submissions.set(marker.eventKey, marker)
}

const indexActivityMarker = (index: ActivityIndex, marker: ActivityMarker | SubmissionMarker) => {
  index.firstObservedAt = Math.min(index.firstObservedAt ?? marker.observedAt, marker.observedAt)
  index.lastObservedAt = Math.max(index.lastObservedAt ?? marker.observedAt, marker.observedAt)
  const children = index.children.get(marker.childKey) ?? new Set<string>()
  children.add(marker.eventKey)
  index.children.set(marker.childKey, children)
  if (marker.kind === "submission") {
    indexSubmission(index, marker)
  } else {
    const group = index.events.get(marker.eventKey) ?? []
    group.push(marker)
    index.events.set(marker.eventKey, group)
  }
}

const indexActivity = (markers: ReadonlyArray<Marker>) => {
  const index: ActivityIndex = {
    roundClosures: [],
    events: new Map(),
    submissions: new Map(),
    children: new Map(),
    firstObservedAt: undefined,
    lastObservedAt: undefined
  }
  for (const marker of markers) {
    if (marker.kind === "round-closure")
      index.roundClosures.push({
        roundKey: marker.roundKey,
        reason: marker.reason,
        reservedContinuations: marker.reservedContinuations,
        discarded: marker.discarded
      })
    else indexActivityMarker(index, marker)
  }
  return index
}

const activitySummary = (
  index: ActivityIndex,
  markers: ReadonlyArray<Marker>,
  counts: Record<ActivityKind, number>,
  findings: number,
  limitation: ActivityStatus["limitation"]
): ActivityStatus => {
  const { roundClosures, submissions, children, firstObservedAt, lastObservedAt } = index
  const submittedFindings = [...submissions.values()].reduce((total, marker) => total + marker.findings, 0)
  counts.submitted = submissions.size
  return {
    ...(roundClosures.length === 0 ? {} : { roundClosures }),
    kind: overallKind(counts),
    observed: markers.length > 0,
    source: "resident-v1",
    boundedToEvents: MAX_ACTIVITY_EVENTS_PER_SESSION,
    counts,
    findings,
    children: [...children.entries()]
      .map(([key, eventKeys]) => ({
        identity: key === childKey(null) ? ("root" as const) : ("child" as const),
        key,
        events: eventKeys.size
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    ...(firstObservedAt === undefined ? {} : { firstObservedAt }),
    ...(lastObservedAt === undefined ? {} : { lastObservedAt }),
    submission: { status: submissions.size > 0 ? "submitted" : "none", findings: submittedFindings },
    modelReaction: { status: "unavailable", reason: "host-model-reaction-not-instrumented" },
    ...(limitation === undefined ? {} : { limitation })
  }
}

export const readActivity = (options: {
  readonly statePath: string
  readonly root: string
  readonly sessionId: string
  readonly resident: { readonly available: boolean; readonly lifetime?: string }
}): ActivityStatus => {
  if (options.sessionId.length === 0) return emptyActivity("session-id-required")
  pruneActivityStore(options.statePath)
  const result = sessionMarkers(join(options.statePath, sessionKey(options.sessionId)), options.root)
  if (result.status !== "loaded")
    return result.status === "missing" ? emptyActivity() : emptyActivity("activity-state-unreadable")
  const index = indexActivity(result.markers)
  const counts = emptyCounts()
  let findings = 0
  for (const group of index.events.values()) {
    const event = reduceEvent(group, options.resident)
    counts[event.kind] += 1
    findings += event.findings
  }
  return activitySummary(index, result.markers, counts, findings, result.limitation)
}

export const formatActivityHuman = (sessionId: string, activity: ActivityStatus): string => {
  const lines = [
    `session: ${sessionId}`,
    `activity: ${activity.kind}`,
    `events: ${
      Object.entries(activity.counts)
        .filter(([, value]) => value > 0)
        .map(([kind, value]) => `${kind}=${value}`)
        .join(", ") || "none"
    }`,
    `findings: ${activity.findings}`,
    `submission: ${activity.submission.status} (findings=${activity.submission.findings})`,
    "model-reaction: unavailable (host model reaction is not instrumented)"
  ]
  for (const closure of activity.roundClosures ?? []) {
    lines.push(
      `round closed: ${closure.reason}; continuations=${closure.reservedContinuations}; discarded ${Object.entries(
        closure.discarded
      )
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")}`
    )
  }
  if (activity.limitation !== undefined) lines.push(`limitation: ${activity.limitation}`)
  return `${lines.join("\n")}\n`
}
