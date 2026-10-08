import Native, { type RunState } from "../../monkey-business-bend/run.mjs"
import { readNat, readBool, readRecord } from "@hapsland/canonical-policy/canonical/boundary-schema"
import { projectTrustedCanonical } from "@hapsland/canonical-policy/canonical/canonical-boundary"
import { freezeCanonicalData } from "@hapsland/canonical-policy/canonical/immutable"
import { GRAPH_LIMIT_CEILINGS, validateGraphLimits } from "@hapsland/canonical-policy/canonical/graph-adapter"
import type {
  RunConfig,
  RunInput,
  Control,
  Observation,
  RunRuntimeSnapshot,
  RunStructuralFrame,
  RunObservation
} from "./index.ts"
import {
  DEFAULT_FILE_TREE_PROFILE,
  validateFileTreeProfile,
  encodeFileTreeProfile,
  encodePreparationGraphLimits
} from "./file-trees.ts"
import { DEFAULT_OUTCOME_WEIGHTS, validateOutcomeWeights } from "./outcomes.ts"
import { sessionProfile } from "./session.ts"
import { validateLiveControl } from "./controls.ts"
import { encodeCollectorProfile } from "./collector-codec.ts"
import {
  DEFAULT_PERMIT_PROFILE,
  validatePermitProfile,
  validatePermitLimits,
  DEFAULT_PERMIT_LIMITS,
  type PermitLimits,
  type PermitProfile
} from "./permit-controls.ts"
import { encodeExpiryProfile, validateInitialExpiryProfile } from "./expiry-controls.ts"
import { sharingIdentityLabel } from "./sharing-controls.ts"
import { decodeCallbackTarget, encodeCallbackTarget, encodeCallbackAction } from "./callback-controls.ts"
import { decodeOutputCapture } from "./output-controls.ts"
import { decodeAdviceeLifecycles, encodeAdviceeLifecycle } from "./advicee-lifecycle.ts"
import { decodeDriverEvent, decodeDriver, encodeDriverOutcome, decodeDriverOutcome } from "./driver-codec.ts"
import {
  decodeNativeRunGraphSource,
  decodeNativeRunGraphEvent,
  encodeNativeRunConfig,
  encodeNativeRunJob,
  encodeNativeRunEvent,
  encodeNativeRunList,
  encodeNativeRunOptional,
  encodeNativeRunWeights,
  nativeRunList,
  nativeRunRecord,
  nativeRunOptional,
  nativeRunSingleton,
  decodeNativeRunSnapshot,
  decodeNativeRunObservation,
  type NativeRunJobFacts
} from "./native-run-codec.ts"
import { decodeStopFinish } from "./stop-codec.ts"
import { validateSizeFacts } from "./sizes.ts"
import { encodeWriterCapture, encodeWriterTarget } from "./writer-controls.ts"
import { encodeCollectionResponse, encodeCollectionResponseIdentity } from "./collection-scenario.ts"
import { encodeNoticeScope } from "./notice-controls.ts"
import { ResourceScenarios, demoResourceLimits } from "./resource-scenarios.ts"
import type { CapacityMetadata } from "./lifecycle-profile.ts"

const nativeFacts = (value: unknown): unknown => value
const clone = <T>(value: T): T => structuredClone(value)
const outcome = (value: "certain" | "uncertain" | "failed") => ({
  $: `OutputScenario.${value[0]!.toUpperCase()}${value.slice(1)}`
})
const permitOutcome = (value: string) => ({
  $: `PermitScenario.${({ success: "Successful", failure: "Failed", duplicate: "Duplicate", absent: "Absent" } as Record<string, string>)[value]}`
})
/** Factual host shell. Queue selection, time advancement and command handling stay in Bend. */
export class NativeRunHost {
  private state: RunState
  private viewingRuntime: unknown | undefined
  private viewingPhysical = false
  private lastNativeFrame: unknown = { $: "None" }
  private readonly identities = new Map<string, number>()
  private controlSequence = 0
  private readonly historicalCallbacks = new Map<number, unknown>()
  private readonly originalJobs = new Map<number, Extract<RunInput, { kind: "edit" }>>()
  readonly config: RunConfig
  readonly agentScopes: readonly { agent: string; partition: number; seed: number }[]
  private readonly history: Observation[] = []
  private readonly listeners = new Set<(value: Observation) => void>()
  private readonly structuralListeners = new Set<(value: unknown) => void>()
  private readonly reportHistory = {
    writerReports: [] as RunObservation["writerReports"][number][],
    collectionResponseReports: [] as RunObservation["collectionResponseReports"][number][],
    interventions: [] as RunObservation["interventions"][number][],
    callbackReports: [] as RunObservation["callbackReports"][number][],
    outputReports: [] as RunObservation["outputReports"][number][]
  }
  private readonly writerOrigins = new Map<
    string,
    { control: Extract<Control, { kind: "backgroundWriter" }>; sequence: number }
  >()
  private readonly responseOrigins = new Map<
    string,
    {
      control: Extract<Control, { kind: "collectionResponse" }> | Extract<Control, { kind: "backgroundWriter" }>
      sequence: number
    }
  >()
  private metadata: CapacityMetadata
  get capacityMetadata(): CapacityMetadata {
    return freezeCanonicalData(clone(this.metadata))
  }
  constructor(config: RunConfig = {}) {
    if (config.session && config.sessions) throw new TypeError("choose session or sessions")
    if (config.outcome !== undefined && config.outcomeWeights !== undefined)
      throw new TypeError("choose explicit outcome or outcome weights")
    const seed = readNat(config.seed ?? 1)
    const sessions = config.sessions ?? (config.session ? [config.session] : [])
    if (config.sessions && (sessions.length === 0 || sessions.length > 64))
      throw new RangeError("sessions requires 1..64 agents")
    const scopes = (sessions.length ? sessions : [{}]).map((settings, index) => ({
      agent: settings.agent ?? `agent-${index + 1}`,
      partition: index + 1,
      seed: settings.seed ?? (seed + Math.imul(index, 2654435761)) >>> 0
    }))
    if (new Set(scopes.map((scope) => scope.agent)).size !== scopes.length)
      throw new TypeError("duplicate session agent")
    this.agentScopes = freezeCanonicalData(scopes)
    const fileTrees = validateFileTreeProfile(config.fileTrees ?? DEFAULT_FILE_TREE_PROFILE)
    const graphLimits = validateGraphLimits(config.graphLimits ?? GRAPH_LIMIT_CEILINGS)
    const environment = config.environment ?? { currentWork: true, credentialReady: true }
    const outputProfile = config.outputProfile ?? { outcome: "certain", delayMs: 0, leaseMs: 30000 }
    validateLiveControl({ kind: "environment", ...environment })
    validateLiveControl({ kind: "outputProfile", ...outputProfile })
    const weights = validateOutcomeWeights(config.outcomeWeights ?? DEFAULT_OUTCOME_WEIGHTS)
    const inputs =
      config.inputs ??
      (sessions.length
        ? []
        : [
            { at: 0, kind: "edit", bytes: 10, unitBytes: [5] },
            { at: 20, kind: "finish" }
          ])
    const { outcome: forcedOutcome, outcomeWeights: _inputWeights, ...baseConfig } = config
    const limits = config.limits ?? { globalItems: 32, globalBytes: 100000, partitionItems: 16, partitionBytes: 50000 }
    const collector = nativeRunOptional(encodeCollectorProfile(config.lifecycles?.collectors))
    this.state = Native.create(
      nativeFacts(
        encodeNativeRunConfig({
          limits,
          advicees: scopes.map((scope, index) => ({
            identity: scope.partition,
            seed: scope.seed,
            ...(sessions.length
              ? { profile: sessionProfile({ ...sessions[index], agent: scope.agent, seed: scope.seed }) }
              : {})
          })),
          environment: {
            jevDelay: readNat(config.jevDelay ?? 5),
            ...(config.outcome === undefined ? {} : { outcome: config.outcome }),
            weights,
            preparationDelay: readNat(config.preparationDelay ?? 2),
            treeProfile: encodeFileTreeProfile(fileTrees),
            graphLimits: encodePreparationGraphLimits(graphLimits),
            outputDelay: outputProfile.delayMs,
            outputLease: outputProfile.leaseMs,
            currentWork: environment.currentWork,
            credentialReady: environment.credentialReady,
            credentialGeneration: environment.credentialGeneration ?? 1,
            sourceReadable: environment.sourceReadable ?? true,
            adviceLifetime: readNat(config.adviceLifetime ?? 600000),
            outputOutcome: outputProfile.outcome,
            ...((config.lifecycles?.encodedOutputBytes ??
              config.resourceScenarios?.outputBytes ??
              (config.resourceScenarios?.outputFit ? 512 : undefined)) === undefined
              ? {}
              : {
                  candidateBytes: config.lifecycles?.encodedOutputBytes ?? config.resourceScenarios?.outputBytes ?? 512
                })
          },
          ...(collector === undefined ? {} : { collectors: collector })
        })
      ),
      seed
    )
    const runtime = readRecord(this.decode(Native.default_runtime()))
    const profile = validatePermitProfile(config.permitProfile ?? DEFAULT_PERMIT_PROFILE)
    const permitLimits = validatePermitLimits(config.editPermitLimits ?? {})
    this.config = freezeCanonicalData(
      clone({
        ...baseConfig,
        seed,
        fileTrees,
        inputs,
        ...(config.editPermitLimits !== undefined || config.permitProfile !== undefined
          ? { editPermitLimits: permitLimits, permitProfile: profile }
          : {}),
        ...(forcedOutcome === undefined ? { outcomeWeights: weights } : { outcome: forcedOutcome })
      })
    )
    const expiry = validateInitialExpiryProfile(
      config.expiryProfile ?? {
        pendingMs: config.adviceLifetime ?? 600000,
        leaseMs: outputProfile.leaseMs,
        cooldownMs: config.resourceScenarios?.cooldownMs ?? 60000
      }
    )
    this.state = Native.replace_runtime(
      this.state,
      nativeFacts({
        ...runtime,
        finish_deadline: readNat(config.finishDeadline ?? 200),
        permit: encodeNativeRunOptional(
          config.editPermitLimits !== undefined || config.permitProfile !== undefined
            ? {
                $: "NativeRunTypes.PermitProfile",
                duration: profile.durationMs,
                lifetime: profile.lifetimeMs,
                outcome: permitOutcome(profile.outcome),
                advicee_limit: permitLimits.perAdvicee,
                resident_limit: permitLimits.resident
              }
            : undefined
        ),
        tree_label: this.identity(JSON.stringify(fileTrees)),
        limits_label: this.identity(JSON.stringify(graphLimits)),
        expiry: encodeExpiryProfile(expiry),
        quiet_window: encodeNativeRunOptional(config.lifecycles?.quietWindowMs),
        reuse: config.lifecycles?.reuse !== undefined
      })
    )
    this.metadata = {
      preparationWorkers: 8,
      jevRequests: 8,
      continuationBudget: 4,
      deliveryGroups: scopes.map((scope) => ({ partition: scope.partition, group: scope.partition })),
      ...(config.resourceScenarios?.notices
        ? {
            notices: {
              maximumKeys:
                config.resourceScenarios.noticeMaximumKeys ?? demoResourceLimits(scopes.length).noticeMaximumKeys
            }
          }
        : {}),
      ...(config.lifecycles?.reuse ? { reuse: config.lifecycles.reuse } : {}),
      ...(config.lifecycles?.collectors ? { collectors: { capacity: config.lifecycles.collectors.capacity } } : {}),
      ...(config.editPermitLimits || config.permitProfile
        ? { permits: { adviceeLimit: permitLimits.perAdvicee, residentLimit: permitLimits.resident } }
        : {})
    }
    if (config.lifecycles?.reuse)
      this.state = Native.configure_cache(
        this.state,
        readNat(config.lifecycles.reuse.entryLimit),
        readNat(config.lifecycles.reuse.byteLimit)
      )
    for (const input of inputs) this.schedule(input)
    if (config.resourceScenarios) {
      const scenarios = new ResourceScenarios({
        noticeMaximumKeys: demoResourceLimits(scopes.length).noticeMaximumKeys,
        ...config.resourceScenarios
      })
      for (const input of scenarios.inputs()) this.schedule(input)
      if (scenarios.config.notices) {
        const settings = scenarios.config
        this.state = Native.notice_exercise(
          this.state,
          encodeNoticeScope({
            partition: settings.partition,
            group: settings.group,
            key: 900000,
            maximumKeys: settings.noticeMaximumKeys,
            reservationBytes: settings.noticeReservationBytes,
            cooldownMs: settings.cooldownMs,
            startAt: settings.startAt
          }),
          settings.startAt
        )
      }
    }
  }
  private decode(value: unknown): unknown {
    return value
  }
  label(identity: number): string | undefined {
    return [...this.identities].find(([, id]) => id === identity)?.[0]
  }
  private generatedIdentitySource(
    label: string
  ):
    | { kind: "subject" }
    | {
        kind: "unit"
        fixture: number
        unit: number
        bytes: number
        seed: number
        profile: import("./file-trees.ts").FileTreeProfile
        limits: import("@hapsland/canonical-policy/canonical/graph-adapter").GraphLimits
        partition: number
      }
    | {
        kind: "input"
        fixture: number
        bytes: number
        units: readonly number[]
        seed: number
        profile: import("./file-trees.ts").FileTreeProfile
        limits: import("@hapsland/canonical-policy/canonical/graph-adapter").GraphLimits
      }
    | undefined {
    // Recognize only exact historical source spellings; arbitrary labels stay opaque.
    try {
      const parsed: unknown = JSON.parse(label)
      if (Array.isArray(parsed)) {
        if (label === JSON.stringify(["revision-subject-label", "generated-root"])) return { kind: "subject" }
        if (parsed.length !== 2 || parsed[0] !== "revision-input-label" || typeof parsed[1] !== "string")
          return undefined
        const source = readRecord(JSON.parse(parsed[1]))
        const fixture = readNat(source.fixture),
          bytes = readNat(source.bytes),
          seed = readNat(source.seed)
        if (fixture > 1 || !Array.isArray(source.unitBytes)) return undefined
        const units = source.unitBytes.map(readNat)
        const profile = validateFileTreeProfile(source.profile as import("./file-trees.ts").FileTreeProfile),
          limits = validateGraphLimits(
            source.limits as import("@hapsland/canonical-policy/canonical/graph-adapter").GraphLimits
          )
        const original = JSON.stringify({ fixture, bytes, unitBytes: units, seed, profile, limits })
        if (parsed[1] !== original || label !== JSON.stringify(["revision-input-label", original])) return undefined
        return { kind: "input", fixture, bytes, units, seed, profile, limits }
      }
      const namespace = readRecord(parsed)
      if (typeof namespace.input !== "string" || typeof namespace.partition !== "string") return undefined
      const [partitionText, work, credential, ...extra] = namespace.partition.split("\0")
      if (
        partitionText === undefined ||
        !/^[1-9][0-9]*$/.test(partitionText) ||
        work !== "work:standalone" ||
        credential !== "credential-generation:controlled" ||
        extra.length !== 0
      )
        return undefined
      const partition = readNat(Number(partitionText))
      if (
        String(partition) !== partitionText ||
        label !== JSON.stringify({ input: namespace.input, partition: namespace.partition })
      )
        return undefined
      const source = readRecord(JSON.parse(namespace.input)),
        prepared = readRecord(source.prepared),
        tree = readRecord(prepared.tree)
      const fixture = readNat(source.fixture),
        unit = readNat(source.unit),
        bytes = readNat(prepared.bytes),
        seed = readNat(tree.seed)
      if (fixture > 1 || readNat(tree.fixture) !== fixture || prepared.rules !== "synthetic-noul") return undefined
      const profile = validateFileTreeProfile(tree.profile as import("./file-trees.ts").FileTreeProfile),
        limits = validateGraphLimits(
          tree.limits as import("@hapsland/canonical-policy/canonical/graph-adapter").GraphLimits
        )
      if (
        namespace.input !==
        JSON.stringify({
          fixture,
          unit,
          prepared: { bytes, rules: "synthetic-noul", tree: { fixture, seed, profile, limits } }
        })
      )
        return undefined
      return { kind: "unit", fixture, unit, bytes, seed, profile, limits, partition }
    } catch {
      return undefined
    }
  }
  private identity(label: string): number {
    const known = this.identities.get(label)
    if (known !== undefined) return known
    const source = this.generatedIdentitySource(label)
    let key: unknown
    if (source?.kind === "subject") key = Native.subject_key()
    else if (source !== undefined) {
      const treeLabel = this.identity(JSON.stringify(source.profile)),
        limitsLabel = this.identity(JSON.stringify(source.limits))
      const profile = encodeFileTreeProfile(source.profile),
        limits = encodePreparationGraphLimits(source.limits)
      key =
        source.kind === "unit"
          ? Native.unit_key(
              source.partition,
              source.fixture,
              source.unit,
              source.bytes,
              source.seed,
              profile,
              limits,
              treeLabel,
              limitsLabel
            )
          : Native.input_key(
              source.fixture,
              source.bytes,
              encodeNativeRunList(source.units),
              source.seed,
              profile,
              limits,
              treeLabel,
              limitsLabel
            )
    }
    const proposed = this.identities.size + 1
    if (proposed >= 2 ** 47) throw new RangeError("host source identity namespace exhausted")
    if (key === undefined) {
      this.identities.set(label, proposed)
      return proposed
    }
    const bound = Native.bind_generated(this.state, key, proposed)
    this.state = bound.state
    const identity = readNat(bound.identity)
    this.identities.set(label, identity)
    return identity
  }
  private partition(input: object): number {
    if (!("agent" in input) || input.agent === undefined) return 1
    const scope = this.agentScopes.find((scope) => scope.agent === input.agent)
    if (!scope) throw new TypeError(`unknown agent ${String(input.agent)}`)
    return scope.partition
  }
  private activity(partition: number): number {
    const scope = nativeRunList(this.coreRecord().activity_scopes)
      .map(readRecord)
      .find((entry) => readNat(entry.partition) === partition)
    if (!scope) throw new TypeError("missing native activity scope")
    return readNat(scope.incarnation)
  }
  private coreRecord(): Record<string, unknown> {
    if (this.viewingRuntime !== undefined)
      return readRecord(nativeRunList(nativeRunRecord(this.viewingRuntime, "NativeRunTypes.RuntimeSnapshot").core)[0])
    const value = this.decode(Native.core(this.state))
    const record = readRecord(value)
    if (record.$ === "Types.State") return record
    const values = nativeRunList(value)
    if (values.length !== 1) throw new TypeError("invalid native core box")
    return readRecord(values[0])
  }
  get now(): number {
    return readNat(readRecord(this.coreRecord().scheduler).now)
  }
  get eventCount(): number {
    return this.viewingRuntime === undefined
      ? readNat(readRecord(this.decode(Native.observe(this.state))).event_count)
      : readNat(readRecord(this.viewingRuntime).count)
  }
  get queueTakeCount(): number {
    return readNat(
      readRecord(nativeRunRecord(readRecord(this.rawRuntime()).host, "NativeRunTypes.HostFacts").runtime).queue_takes
    )
  }
  get projection() {
    return projectTrustedCanonical(this.coreRecord().canonical)
  }
  get writerReports(): RunObservation["writerReports"] {
    return freezeCanonicalData(clone(this.reportHistory.writerReports))
  }
  get collectionResponseReports(): RunObservation["collectionResponseReports"] {
    return freezeCanonicalData(clone(this.reportHistory.collectionResponseReports))
  }
  get interventions(): RunObservation["interventions"] {
    return freezeCanonicalData(clone(this.reportHistory.interventions))
  }
  get callbackReports(): RunObservation["callbackReports"] {
    return freezeCanonicalData(clone(this.reportHistory.callbackReports))
  }
  get outputReports(): RunObservation["outputReports"] {
    return freezeCanonicalData(clone(this.reportHistory.outputReports))
  }
  private runtimeProfile(): Record<string, unknown> {
    return readRecord(
      nativeRunRecord(
        nativeRunRecord(this.rawRuntime(), "NativeRunTypes.RuntimeSnapshot").host,
        "NativeRunTypes.HostFacts"
      ).runtime
    )
  }
  get editPermitLimits(): PermitLimits {
    const permit = nativeRunOptional(this.runtimeProfile().permit)
    if (permit === undefined) return clone(DEFAULT_PERMIT_LIMITS)
    const profile = readRecord(permit)
    return { perAdvicee: readNat(profile.advicee_limit), resident: readNat(profile.resident_limit) }
  }
  get futurePermitProfile(): PermitProfile {
    const permit = nativeRunOptional(this.runtimeProfile().permit)
    if (permit === undefined) return clone(DEFAULT_PERMIT_PROFILE)
    const profile = readRecord(permit),
      tag = readRecord(profile.outcome).$
    const outcome =
      tag === "PermitScenario.Successful"
        ? "success"
        : tag === "PermitScenario.Failed"
          ? "failure"
          : tag === "PermitScenario.Duplicate"
            ? "duplicate"
            : tag === "PermitScenario.Absent"
              ? "absent"
              : undefined
    if (!outcome) throw new TypeError("invalid captured permit outcome")
    return { durationMs: readNat(profile.duration), lifetimeMs: readNat(profile.lifetime), outcome }
  }
  private responseReport(value: unknown) {
    const report = nativeRunRecord(value, "Engine.ResponseResult")
    if (Object.keys(report).length !== 3) throw new TypeError("invalid native response report fields")
    const tags = {
      "CollectionScenario.Applied": "applied",
      "CollectionScenario.Missing": "missing",
      "CollectionScenario.WrongScope": "wrongScope",
      "CollectionScenario.AlreadyAttempting": "alreadyAttempting",
      "CollectionScenario.IdentityExhausted": "identityExhausted",
      "CollectionScenario.ContextBound": "contextBound"
    } as const
    const applicability = readRecord(report.result)
    if (Object.keys(applicability).length !== 1) throw new TypeError("invalid native response applicability")
    const tag = String(applicability.$)
    if (!Object.hasOwn(tags, tag)) throw new TypeError("invalid native response report")
    const issuedValue = nativeRunOptional(report.issued)
    const issued = issuedValue === undefined ? undefined : this.responseIdentity(issuedValue)
    return { result: tags[tag as keyof typeof tags], ...(issued ? { issued } : {}) }
  }
  private responseIdentity(value: unknown) {
    const identity = nativeRunRecord(value, "CollectionScenario.Identity")
    if (Object.keys(identity).length !== 5) throw new TypeError("invalid native response identity fields")
    return {
      id: readNat(identity.id),
      partition: readNat(identity.partition),
      lifetime: readNat(identity.lifetime),
      round: readNat(identity.round)
    }
  }
  get adviceeLifecycles(): RunObservation["adviceeLifecycles"] {
    return decodeAdviceeLifecycles(this.coreRecord().lifecycles)
  }
  get callbackTargets(): RunObservation["callbackTargets"] {
    const callbacks = readRecord(readRecord(this.coreRecord().scenarios).callbacks)
    const targets = nativeRunList(callbacks.originals).map((value) =>
      decodeCallbackTarget(readRecord(readRecord(value).fact).target)
    )
    for (const observation of this.history) {
      const target = observation.callbackReceipt?.target
      if (target && !targets.some((known) => JSON.stringify(known) === JSON.stringify(target))) targets.push(target)
    }
    return freezeCanonicalData(targets)
  }
  get outputAttempts(): RunObservation["outputAttempts"] {
    const callbacks = readRecord(readRecord(this.coreRecord().scenarios).callbacks)
    return freezeCanonicalData(
      nativeRunList(callbacks.originals).flatMap((value) => {
        const original = readRecord(value),
          fact = nativeRunRecord(original.fact, "Callbacks.Fact")
        const completion = nativeRunOptional(fact.completion)
        if (completion === undefined) return []
        const capture = decodeOutputCapture(completion)
        const status = readRecord(original.status).$
        const delivery =
          status === "Callbacks.Queued"
            ? "scheduled"
            : status === "Callbacks.Held"
              ? "held"
              : status === "Callbacks.Dropped"
                ? "dropped"
                : undefined
        if (!delivery) throw new TypeError("invalid native callback delivery status")
        return [
          {
            target: decodeCallbackTarget(fact.target),
            capture,
            issuedAt: capture.started,
            dueAt: readNat(fact.at),
            scheduledOrder: readNat(original.scheduled_order),
            delivery
          }
        ]
      })
    )
  }
  get observations(): readonly Observation[] {
    return freezeCanonicalData([...this.history])
  }
  get core() {
    return freezeCanonicalData(clone(this.coreRecord()))
  }
  private rawRuntime(): unknown {
    return this.viewingRuntime ?? this.decode(Native.runtime_snapshot(this.state))
  }
  private jobFacts(input: Extract<RunInput, { kind: "edit" }>, partition: number): NativeRunJobFacts {
    validateSizeFacts({
      sourceBytes: 0,
      evidenceTreeBytes: 0,
      reservationBytes: input.bytes,
      reviewUnitBytes: input.unitBytes,
      encodedOutputBytes: 0
    })
    if (
      "evaluationInputs" in input &&
      input.evaluationInputs !== undefined &&
      (input.evaluationInputs.length !== input.unitBytes.length ||
        input.evaluationInputs.some((label) => !label.length))
    )
      throw new TypeError("evaluationInputs must identify every prepared unit")
    if (
      "evaluationIdentityFacts" in input &&
      input.evaluationIdentityFacts !== undefined &&
      input.evaluationIdentityFacts.length !== input.unitBytes.length
    )
      throw new TypeError("evaluationIdentityFacts must capture every prepared unit")
    if ("revisionSubject" in input && input.revisionSubject !== undefined && input.revisionInput === undefined)
      throw new TypeError("revisionInput required with revisionSubject")
    const generated = "revision" in input
    const facts: NonNullable<NativeRunJobFacts["facts"]> = {
      keys:
        "evaluationInputs" in input && input.evaluationInputs
          ? input.evaluationInputs.map((preparedIdentity, unit) => ({
              partition,
              prepared: this.identity(
                sharingIdentityLabel(
                  input.evaluationIdentityFacts?.[unit] ?? {
                    partition: String(partition),
                    workId: null,
                    credentialGeneration: null,
                    preparedIdentity
                  }
                )
              )
            }))
          : [],
      ...("revisionSubject" in input && input.revisionSubject !== undefined
        ? {
            freshness: {
              subject: this.identity(JSON.stringify(["revision-subject-label", input.revisionSubject])),
              input: this.identity(JSON.stringify(["revision-input-label", input.revisionInput]))
            }
          }
        : {}),
      ...("evaluationTreeIdentity" in input && input.evaluationTreeIdentity !== undefined
        ? {
            tree: {
              identity: input.evaluationTreeIdentity,
              profile: input.evaluationTreeProfile ?? this.config.fileTrees!,
              limits: input.evaluationGraphLimits ?? this.config.graphLimits ?? GRAPH_LIMIT_CEILINGS,
              profileLabel: this.identity(JSON.stringify(input.evaluationTreeProfile ?? this.config.fileTrees!)),
              limitsLabel: this.identity(
                JSON.stringify(input.evaluationGraphLimits ?? this.config.graphLimits ?? GRAPH_LIMIT_CEILINGS)
              )
            }
          }
        : {}),
      ...("tool" in input && input.tool !== undefined ? { tool: input.tool } : {})
    }
    return {
      partition,
      lifetime: 1,
      round: 0,
      bytes: readNat(input.bytes),
      units: input.unitBytes.map(readNat),
      revision: generated ? input.revision : 0,
      repair: generated && input.repair === true,
      ...(input.editDurationMs === undefined ? {} : { duration: input.editDurationMs }),
      facts,
      sourceJob: {
        partition,
        lifetime: 1,
        bytes: input.bytes,
        units: input.unitBytes,
        ...(input.outcome === undefined ? {} : { outcome: input.outcome })
      }
    }
  }
  schedule(input: RunInput): void {
    const previousState = this.state
    const previousIdentities = new Map(this.identities)
    try {
      const time = readNat(input.at)
      const partition = this.partition(input)
      let encoded: unknown
      let originalJob: readonly [number, Extract<RunInput, { kind: "edit" }>] | undefined
      if ("generation" in input && "agent" in input && input.agent !== undefined) {
        encoded = {
          $: "NativeRunTypes.Arrival",
          activity: this.activity(partition),
          supplied_outcome: encodeNativeRunOptional(
            input.kind === "edit" && input.outcome !== undefined ? encodeDriverOutcome(input.outcome) : undefined
          ),
          emission: {
            $: "Workload.Emission",
            at: time,
            partition,
            generation: input.generation ?? 1,
            kind: input.kind === "edit" ? 1 : input.kind === "task" ? 0 : 2,
            task: input.kind === "task" ? input.task : 0,
            revision: input.kind === "edit" && "revision" in input ? input.revision : 0,
            bytes: input.kind === "edit" ? input.bytes : 0,
            units: encodeNativeRunList(input.kind === "edit" ? input.unitBytes : []),
            repair: input.kind === "edit" && "repair" in input && input.repair === true,
            recurring: "recurring" in input && input.recurring
          }
        }
      } else if (input.kind === "edit") {
        const original = this.originalJobs.size + 1
        const capturedInput =
          this.config.lifecycles?.reuse &&
          "evaluationInputs" in input &&
          input.evaluationInputs !== undefined &&
          input.revisionSubject === undefined
            ? {
                ...input,
                revisionSubject: "standalone-prepared-root",
                revisionInput: JSON.stringify(input.evaluationInputs)
              }
            : input
        const facts = this.jobFacts(capturedInput, partition)
        facts.facts = { ...facts.facts!, origin: original }
        const job = encodeNativeRunJob(facts)
        originalJob = [original, clone(capturedInput)]
        encoded = { $: "NativeRunTypes.CapturedEdit", job, activity: this.activity(partition) }
      } else if (input.kind === "canonical") {
        const action = readRecord(encodeNativeRunEvent({ event: input.event, delay: 0, job: false })).action
        encoded = { $: "NativeRunTypes.RawEvent", partition, action }
      } else
        encoded = { $: "NativeRunTypes.StartFinish", partition, activity: this.activity(partition), recurring: false }
      const candidate = Native.enqueue(this.state, time, nativeFacts(encoded))
      if (!readBool(nativeRunRecord(Native.runtime_snapshot(candidate), "NativeRunTypes.RuntimeSnapshot").valid))
        throw new RangeError("cannot schedule in the past")
      this.state = candidate
      if (originalJob) this.originalJobs.set(...originalJob)
      this.refreshPhysicalView()
    } catch (error) {
      this.state = previousState
      this.identities.clear()
      for (const [label, identity] of previousIdentities) this.identities.set(label, identity)
      throw error
    }
  }
  subscribe(listener: (value: Observation) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  subscribeStructural(listener: (value: unknown) => void): () => void {
    this.structuralListeners.add(listener)
    return () => {
      this.structuralListeners.delete(listener)
    }
  }
  private advanceReason(value: unknown): "continue" | "timeLimit" | "eventLimit" | "idle" {
    const tag = readRecord(value).$
    if (tag === "NativeRunTypes.AdvanceTimeLimit") return "timeLimit"
    if (tag === "NativeRunTypes.AdvanceEventLimit") return "eventLimit"
    if (tag === "NativeRunTypes.AdvanceIdle") return "idle"
    if (tag === "NativeRunTypes.ContinueAdvance") return "continue"
    throw new TypeError(`invalid native advancement status ${String(tag)}`)
  }
  advanceStatus(budget: number, endpoint: number): "continue" | "timeLimit" | "eventLimit" | "idle" {
    return this.advanceReason(Native.advance_status(this.state, readNat(budget), readNat(endpoint)))
  }
  stepAdvanceStatus(
    _observation: Observation | undefined,
    budget: number,
    endpoint: number
  ): "continue" | "timeLimit" | "eventLimit" | "idle" {
    return this.advanceReason(
      Native.advance_step_status(this.state, this.lastNativeFrame, readNat(budget), readNat(endpoint))
    )
  }
  normalize(): void {
    this.state = Native.normalize(this.state)
  }
  step(untilTime: number, takeLimit: number, allowFrame = true): Observation | undefined {
    let frame: unknown
    while (true) {
      const originalRuntime = nativeRunRecord(this.rawRuntime(), "NativeRunTypes.RuntimeSnapshot")
      const head = nativeRunList(readRecord(this.coreRecord().scheduler).queue)[0]
      const selectedOrder = head === undefined ? undefined : readNat(readRecord(head).order)
      const selected =
        selectedOrder === undefined
          ? undefined
          : nativeRunList(originalRuntime.items)
              .map(readRecord)
              .find((item) => readNat(item.order) === selectedOrder)
      const selectedInput = selected === undefined ? undefined : readRecord(selected.input)
      for (const retained of nativeRunList(
        nativeRunRecord(originalRuntime.host, "NativeRunTypes.HostFacts").retained_callbacks
      ))
        this.historicalCallbacks.set(
          decodeCallbackTarget(nativeRunRecord(readRecord(retained).fact, "Callbacks.Fact").target).originalOrder,
          clone(retained)
        )
      const stepped = readRecord(
        this.decode(Native.step_bounded(this.state, readNat(untilTime), readNat(takeLimit), readBool(allowFrame)))
      )
      this.state = stepped.state as RunState
      if (!readBool(nativeRunRecord(Native.runtime_snapshot(this.state), "NativeRunTypes.RuntimeSnapshot").valid)) {
        const mismatch =
          selectedInput?.$ === "NativeRunTypes.RawEvent" &&
          readRecord(readRecord(selectedInput.action).event).$ === "Canonical.JevRequestSettled"
        throw new Error(mismatch ? "mismatched completion identity" : "unhandled required command")
      }
      for (const physical of nativeRunList(stepped.physical))
        this.publishStructural(physical, readRecord(physical).after)
      this.lastNativeFrame = stepped.frame
      frame = nativeRunOptional(stepped.frame)
      if (frame !== undefined) break
      if (
        !readBool(Native.checkpoint_continue(this.state, readNat(untilTime), readNat(takeLimit), readBool(allowFrame)))
      ) {
        this.pruneHistoricalCallbacks()
        return undefined
      }
    }
    const deferredDetails = nativeRunRecord(readRecord(frame).details, "NativeRunTypes.FrameDetails")
    const deferredResult = nativeRunOptional(deferredDetails.control_result),
      consumed = nativeRunOptional(deferredDetails.consumed)
    if (deferredResult !== undefined && consumed !== undefined) {
      const consumedInput = readRecord(nativeRunRecord(consumed, "NativeRunTypes.ConsumedInput").input)
      const pending =
        consumedInput.$ === "NativeRunTypes.ResponseInput" ? nativeRunOptional(consumedInput.pending) : undefined
      const target =
        consumedInput.$ === "NativeRunTypes.ResponseInput" ? nativeRunOptional(consumedInput.target) : undefined
      if (pending !== undefined) {
        const origin = this.writerOrigins.get(JSON.stringify(pending))
        if (!origin) throw new TypeError("native writer result lost original control provenance")
        this.reportHistory.writerReports.push({
          at: this.now,
          controlSequence: origin.sequence,
          control: origin.control,
          ...this.responseReport(deferredResult)
        })
      } else if (target !== undefined) {
        const origin = this.responseOrigins.get(JSON.stringify(target))
        if (
          origin &&
          origin.control.kind === "collectionResponse" &&
          this.responseReport(deferredResult).result === "missing"
        )
          this.reportHistory.collectionResponseReports.push({
            at: this.now,
            controlSequence: origin.sequence,
            control: origin.control,
            ...this.responseReport(deferredResult)
          })
      }
    }
    const rawFrame = readRecord(frame)
    if (rawFrame.$ === "NativeRunTypes.ProductFrame") {
      const event = decodeDriverEvent(rawFrame.event)
      if (event.kind === "issuePermit")
        this.metadata = {
          ...this.metadata,
          permits: {
            ...(this.metadata.permits?.adviceeLimit === undefined
              ? {}
              : { adviceeLimit: this.metadata.permits.adviceeLimit }),
            residentLimit: event.facts.residentPermitLimit,
            adviceeLimits: [
              ...(this.metadata.permits?.adviceeLimits ?? []).filter((item) => item.partition !== event.partition),
              { partition: event.partition, limit: event.facts.adviceePermitLimit }
            ].sort((a, b) => a.partition - b.partition)
          }
        }
      if (event.kind === "collectionClaimBackground")
        this.metadata = { ...this.metadata, collectors: { capacity: event.capacity } }
      if (event.kind === "collectionFitCheck")
        this.metadata = {
          ...this.metadata,
          encodedOutput: { bytes: event.bytes, items: event.items, maximumBytes: 10240, synthetic: true }
        }
    }
    const observation = decodeNativeRunObservation(frame, {
      agent: (partition) => this.agentScopes.find((scope) => scope.partition === partition)?.agent,
      callbackReceipt: (target) => this.capturedCallbackReceipt(target),
      sourceLabel: (identity) => this.label(identity),
      capacityMetadata: this.capacityMetadata,
      ...(this.config.lifecycles?.cancellation === "suppressed" ? { cancellationSuppressed: true } : {})
    })
    this.publishStructural(frame, nativeRunRecord(readRecord(frame).details, "NativeRunTypes.FrameDetails").after)
    this.history.push(observation)
    const retention = this.config.retention ?? 1000
    if (this.history.length > retention) this.history.splice(0, this.history.length - retention)
    this.pruneHistoricalCallbacks()
    for (const listener of this.listeners) listener(observation)
    return observation
  }
  private generatedJobLabels(facts: Record<string, unknown>): Partial<Extract<RunInput, { kind: "edit" }>> {
    const freshness = nativeRunOptional(facts.freshness)
    if (freshness === undefined) return {}
    const identity = readNat(readRecord(freshness).input)
    const runtime = nativeRunRecord(this.rawRuntime(), "NativeRunTypes.RuntimeSnapshot")
    const registry = readRecord(nativeRunRecord(runtime.host, "NativeRunTypes.HostFacts").generated)
    const entry = nativeRunList(registry.entries)
      .map(readRecord)
      .find((entry) => readNat(entry.identity) === identity)
    if (entry === undefined) return {}
    const captured = nativeRunList(readRecord(entry.key).facts).map(readNat)
    if (captured[0] !== 1) throw new TypeError("invalid generated revision input capture")
    const fixture = captured[1]!,
      bytes = captured[2]!,
      count = captured[3]!
    const units = captured.slice(4, 4 + count)
    const seed = captured[4 + count]!
    const profileLabel = this.label(captured[5 + count]!),
      limitLabel = this.label(captured[6 + count]!)
    if (profileLabel === undefined || limitLabel === undefined)
      throw new TypeError("native generated source label lost original profile")
    const profile = validateFileTreeProfile(JSON.parse(profileLabel))
    const limits = validateGraphLimits(JSON.parse(limitLabel))
    return {
      evaluationInputs: units.map((unitBytes, unit) =>
        JSON.stringify({
          fixture,
          unit,
          prepared: { bytes: unitBytes, rules: "synthetic-noul", tree: { fixture, seed, profile, limits } }
        })
      ),
      evaluationTreeIdentity: fixture + 1,
      evaluationTreeProfile: profile,
      evaluationGraphLimits: limits,
      revisionSubject: "generated-root",
      revisionInput: JSON.stringify({ fixture, bytes, unitBytes: units, seed, profile, limits })
    }
  }
  private decodeSourceJob(value: unknown): NonNullable<RunRuntimeSnapshot["queue"][number]["driverSourceJob"]> {
    const source = nativeRunRecord(value, "Driver.SourceJob")
    return {
      partition: readNat(source.partition),
      lifetime: readNat(source.lifetime),
      bytes: readNat(source.bytes),
      units: nativeRunList(source.units).map(readNat),
      outcome: clone(source.outcome) as NonNullable<RunRuntimeSnapshot["queue"][number]["driverSourceJob"]>["outcome"]
    }
  }
  private decodeJob(value: unknown): RunRuntimeSnapshot["jobs"][number][1] {
    const job = nativeRunRecord(value, "NativeRunTypes.Job")
    const facts = nativeRunOptional(nativeRunSingleton(job.facts))
    const original = facts === undefined ? undefined : this.originalJobs.get(readNat(readRecord(facts).origin ?? 0))
    const sourceJob = nativeRunOptional(job.source_job)
    const sourceFields = sourceJob === undefined ? {} : { driverSourceJob: this.decodeSourceJob(sourceJob) }
    if (original) return { ...clone(original), ...sourceFields }
    const originalEmission =
      facts === undefined ? undefined : nativeRunOptional(readRecord(facts).original ?? { $: "None" })
    if (originalEmission !== undefined) {
      const emission = nativeRunRecord(originalEmission, "Workload.Emission")
      const partition = readNat(emission.partition)
      const generatedLabels = this.generatedJobLabels(readRecord(facts!))
      return {
        ...generatedLabels,
        ...sourceFields,
        kind: "edit",
        at: readNat(emission.at),
        agent: this.agentScopes.find((scope) => scope.partition === partition)?.agent ?? "agent-1",
        generation: readNat(emission.generation),
        recurring: readBool(emission.recurring),
        revision: readNat(emission.revision),
        bytes: readNat(emission.bytes),
        unitBytes: nativeRunList(emission.units).map(readNat),
        ...(readBool(emission.repair) ? { repair: true } : {})
      }
    }
    const source = nativeRunOptional(job.source_job)
    const outcomeValue = source === undefined ? undefined : nativeRunOptional(readRecord(source).outcome)
    const duration = nativeRunOptional(job.duration)
    const revision = readNat(job.revision)
    return {
      ...sourceFields,
      kind: "edit",
      at: this.now,
      bytes: readNat(job.bytes),
      unitBytes: nativeRunList(job.units).map(readNat),
      ...(outcomeValue === undefined ? {} : { outcome: decodeDriverOutcome(outcomeValue) }),
      ...(duration === undefined ? {} : { editDurationMs: readNat(duration) }),
      ...(revision === 0
        ? {}
        : {
            agent: this.agentScopes.find((scope) => scope.partition === readNat(job.partition))?.agent ?? "agent-1",
            generation: 1,
            recurring: false,
            revision,
            ...(readBool(job.repair) ? { repair: true } : {})
          })
    }
  }
  private decodeItem(value: unknown, runtime?: unknown): RunRuntimeSnapshot["queue"][number] {
    const item = nativeRunRecord(value, "NativeRunTypes.Item")
    const input = readRecord(item.input)
    const order = readNat(item.order)
    const core =
      runtime === undefined
        ? this.coreRecord()
        : readRecord(nativeRunList(nativeRunRecord(runtime, "NativeRunTypes.RuntimeSnapshot").core)[0])
    const scheduler = readRecord(core.scheduler)
    const at = nativeRunList(scheduler.queue)
      .map(readRecord)
      .find((entry) => readNat(entry.order) === order)?.at
    const time = at === undefined ? readNat(scheduler.now) : readNat(at)
    if (input.$ === "NativeRunTypes.CapturedEdit") {
      const decodedJob = this.decodeJob(input.job)
      return {
        at: time,
        order,
        input: { ...decodedJob, at: time },
        ...(decodedJob.driverSourceJob === undefined ? {} : { driverSourceJob: decodedJob.driverSourceJob }),
        activityScope: readNat(input.activity)
      }
    }
    if (input.$ === "NativeRunTypes.StartFinish")
      return {
        at: time,
        order,
        partition: readNat(input.partition),
        activityScope: readNat(input.activity),
        input: { at: time, kind: "finish" }
      }
    if (input.$ === "NativeRunTypes.RawEvent") {
      const action = decodeDriver({ handled: true, actions: encodeNativeRunList([input.action]) }).actions[0]!
      return {
        at: time,
        order,
        partition: readNat(input.partition),
        input: { kind: "canonical", at: time, event: action.event }
      }
    }
    if (input.$ === "NativeRunTypes.Event" || input.$ === "NativeRunTypes.FinishInput") {
      const action = decodeDriver({ handled: true, actions: encodeNativeRunList([input.action]) }).actions[0]!
      const job = input.$ === "NativeRunTypes.FinishInput" ? input.job : nativeRunOptional(input.job)
      const source = nativeRunOptional(nativeRunSingleton(input.context))
      const sourceJob =
        input.$ === "NativeRunTypes.Event"
          ? nativeRunOptional(input.source_job)
          : nativeRunOptional(readRecord(input.job).source_job)
      const partition =
        source !== undefined
          ? readNat(readRecord(readRecord(source).context).partition)
          : sourceJob !== undefined
            ? readNat(readRecord(sourceJob).partition)
            : job !== undefined
              ? readNat(readRecord(job).partition)
              : "partition" in action.event
                ? action.event.partition
                : undefined
      const snapshot = nativeRunRecord(runtime ?? this.rawRuntime(), "NativeRunTypes.RuntimeSnapshot")
      const custody = nativeRunOptional(nativeRunSingleton(item.receipt))
      const custodyFact = custody === undefined ? undefined : nativeRunRecord(custody, "Callbacks.Fact")
      const originalOrder = custodyFact === undefined ? order : decodeCallbackTarget(custodyFact.target).originalOrder
      const retained = nativeRunList(nativeRunRecord(snapshot.host, "NativeRunTypes.HostFacts").retained_callbacks)
        .map(readRecord)
        .find((capsule) => readNat(capsule.order) === originalOrder)
      const issuance = retained ?? this.historicalCallbacks.get(originalOrder)
      if (custodyFact !== undefined && issuance === undefined)
        throw new TypeError("native queued callback lost original issuance timestamps")
      const fact =
        custodyFact ?? (retained === undefined ? undefined : nativeRunRecord(retained.fact, "Callbacks.Fact"))
      const completion = fact === undefined ? undefined : nativeRunOptional(fact.completion)
      const common = {
        at: time,
        order,
        generated: true,
        ...(partition === undefined ? {} : { partition }),
        // Stop wakes retain their absolute producer time rather than an
        // ordinary driver's relative action delay in the public queue view.
        ...(input.$ === "NativeRunTypes.FinishInput" && action.event.kind === "stopPolled"
          ? {}
          : { driverAction: action }),
        ...(sourceJob === undefined ? {} : { driverSourceJob: this.decodeSourceJob(sourceJob) }),
        ...(input.$ === "NativeRunTypes.FinishInput"
          ? action.event.kind === "collectionFitCheck"
            ? { fitFinish: readNat(input.attempt) }
            : { finishAttempt: readNat(input.attempt) }
          : {}),
        ...(fact === undefined || issuance === undefined
          ? {}
          : {
              callbackReceipt: {
                target: decodeCallbackTarget(fact.target),
                issuedAt: readNat(readRecord(issuance).issued_at),
                dueAt: readNat(readRecord(issuance).due_at),
                ...(completion === undefined ? {} : { outputCapture: decodeOutputCapture(completion) })
              }
            }),
        ...(job === undefined ? {} : { job: this.decodeJob(job) }),
        ...(source === undefined
          ? {}
          : { driverContext: readRecord(source).context, driverOutcomeReceipt: readRecord(source).receipt }),
        ...(action.expiryAdvice === undefined ? {} : { expiryAdvice: action.expiryAdvice })
      }
      if (action.candidate) {
        if (
          action.event.kind !== "finalCandidateCheck" &&
          action.event.kind !== "submissionSuppressCheck" &&
          action.event.kind !== "collectionFitCheck"
        )
          throw new TypeError("invalid native candidate event")
        return { ...common, input: { kind: "canonical", at: time, event: action.event }, candidate: action.candidate }
      }
      return { ...common, input: { kind: "canonical", at: time, event: action.event } }
    }
    if (input.$ === "NativeRunTypes.Arrival") {
      const emission = nativeRunRecord(input.emission, "Workload.Emission")
      const suppliedOutcome = nativeRunOptional(input.supplied_outcome)
      const partition = readNat(emission.partition)
      const common = {
        at: readNat(emission.at),
        agent: this.agentScopes.find((scope) => scope.partition === partition)?.agent ?? "agent-1",
        generation: readNat(emission.generation),
        recurring: readBool(emission.recurring)
      }
      const kind = readNat(emission.kind)
      const publicInput: RunInput =
        kind === 0
          ? { ...common, kind: "task", task: readNat(emission.task) }
          : kind === 1
            ? {
                ...common,
                kind: "edit",
                bytes: readNat(emission.bytes),
                unitBytes: nativeRunList(emission.units).map(readNat),
                revision: readNat(emission.revision),
                ...(suppliedOutcome === undefined ? {} : { outcome: decodeDriverOutcome(suppliedOutcome) }),
                ...(readBool(emission.repair) ? { repair: true } : {})
              }
            : { ...common, kind: "finish" }
      return {
        at: time,
        order,
        partition,
        input: publicInput,
        activityScope: readNat(input.activity),
        workloadSource: {
          $: "Workload.Emission",
          at: readNat(emission.at),
          partition,
          generation: readNat(emission.generation),
          kind,
          task: readNat(emission.task),
          revision: readNat(emission.revision),
          bytes: readNat(emission.bytes),
          units: nativeRunList(emission.units).map(readNat),
          repair: readBool(emission.repair),
          recurring: readBool(emission.recurring)
        }
      }
    }
    if (input.$ === "NativeRunTypes.GraphFact") {
      const key = nativeRunRecord(input.key, "Types.GraphKey")
      return {
        at: time,
        order,
        generated: true,
        partition: readNat(key.partition),
        input: {
          at: time,
          kind: "preparationGraph",
          event: {
            kind: "preparationGraph",
            example: "generated",
            partition: readNat(key.partition),
            lifetime: readNat(key.lifetime),
            round: readNat(key.round),
            operation: readNat(key.operation),
            unit: readNat(key.unit),
            step: readNat(input.position),
            fact: decodeNativeRunGraphEvent(input.fact),
            ...decodeNativeRunGraphSource(input, (identity) => this.label(identity))
          }
        }
      }
    }
    if (input.$ === "NativeRunTypes.CacheFact") {
      const fact = nativeRunRecord(input.fact, "CacheRuntime.Fact")
      const factPartition = readNat(readRecord(readRecord(fact.offer).key).partition)
      const partition = readNat(input.source_partition)
      const event = decodeDriverEvent(fact.event)
      return {
        at: time,
        order,
        partition,
        input: { at: time, kind: "canonical", event },
        cacheFact: { event, partition: factPartition }
      }
    }
    if (
      [
        "NativeRunTypes.NoticeInput",
        "NativeRunTypes.ResponseInput",
        "NativeRunTypes.WriterReleaseInput",
        "NativeRunTypes.WriterPendingReleaseInput"
      ].includes(String(input.$))
    ) {
      const action = decodeDriver({ handled: true, actions: encodeNativeRunList([input.action]) }).actions[0]!
      const diagnostic = input.$ === "NativeRunTypes.NoticeInput" ? nativeRunOptional(input.diagnostic) : undefined
      return {
        at: time,
        order,
        input: { at: time, kind: "canonical", event: action.event },
        driverAction: action,
        ...(input.$ === "NativeRunTypes.NoticeInput"
          ? {
              partition: readNat(input.source_partition),
              noticeScope: input.scope as ReturnType<typeof encodeNoticeScope>,
              ...(diagnostic === undefined
                ? {}
                : { noticeDiagnostic: diagnostic as "capacity" | "backend" | "credential" | "output-limit" })
            }
          : {}),
        ...(input.$ === "NativeRunTypes.WriterReleaseInput"
          ? { writerRelease: input.receipt as NonNullable<RunRuntimeSnapshot["queue"][number]["writerRelease"]> }
          : {})
      }
    }
    throw new TypeError(`unknown factual NativeRun queue decoder ${String(input.$)}`)
  }
  runtimeSnapshot(): RunRuntimeSnapshot {
    return this.decodeRuntime(this.rawRuntime())
  }
  decodeRuntime(runtime: unknown): RunRuntimeSnapshot {
    return decodeNativeRunSnapshot(runtime, {
      engine: (value) => freezeCanonicalData(clone(value)) as RunRuntimeSnapshot["engine"],
      item: (value) => this.decodeItem(value, runtime),
      job: (value) => this.decodeJob(value),
      retained: (value) => {
        const retained = nativeRunRecord(value, "NativeRunTypes.RetainedCallback")
        const fact = nativeRunRecord(retained.fact, "Callbacks.Fact")
        const completion = nativeRunOptional(fact.completion)
        const order = readNat(retained.order)
        return {
          order,
          fact,
          receipt: {
            target: decodeCallbackTarget(fact.target),
            issuedAt: readNat(retained.issued_at),
            dueAt: readNat(retained.due_at),
            ...(completion === undefined ? {} : { outputCapture: decodeOutputCapture(completion) })
          },
          payload: this.decodeItem(
            {
              $: "NativeRunTypes.Item",
              order,
              input: retained.payload,
              receipt: encodeNativeRunList([encodeNativeRunOptional(fact)])
            },
            runtime
          )
        }
      }
    })
  }
  private pruneHistoricalCallbacks(): void {
    const retained = nativeRunList(
      nativeRunRecord(
        nativeRunRecord(this.rawRuntime(), "NativeRunTypes.RuntimeSnapshot").host,
        "NativeRunTypes.HostFacts"
      ).retained_callbacks
    )
    const live = new Set(
      retained.map(
        (value) => decodeCallbackTarget(nativeRunRecord(readRecord(value).fact, "Callbacks.Fact").target).originalOrder
      )
    )
    for (const observation of this.history)
      if (observation.callbackReceipt) live.add(observation.callbackReceipt.target.originalOrder)
    for (const item of nativeRunList(nativeRunRecord(this.rawRuntime(), "NativeRunTypes.RuntimeSnapshot").items)) {
      const receipt = nativeRunOptional(nativeRunSingleton(readRecord(item).receipt))
      if (receipt !== undefined)
        live.add(decodeCallbackTarget(nativeRunRecord(receipt, "Callbacks.Fact").target).originalOrder)
    }
    for (const identity of this.historicalCallbacks.keys())
      if (!live.has(identity)) this.historicalCallbacks.delete(identity)
  }
  private refreshPhysicalView(): void {
    if (this.viewingPhysical) this.viewingRuntime = this.decode(Native.runtime_snapshot(this.state))
  }
  private capturedCallbackReceipt(target: ReturnType<typeof decodeCallbackTarget>): Observation["callbackReceipt"] {
    const captured = this.historicalCallbacks.get(target.originalOrder)
    if (captured === undefined) return undefined
    const capsule = nativeRunRecord(captured, "NativeRunTypes.RetainedCallback")
    const fact = nativeRunRecord(capsule.fact, "Callbacks.Fact")
    if (JSON.stringify(decodeCallbackTarget(fact.target)) !== JSON.stringify(target))
      throw new TypeError("callback receipt differs from original issuance capture")
    const completion = nativeRunOptional(fact.completion)
    return {
      target,
      issuedAt: readNat(capsule.issued_at),
      dueAt: readNat(capsule.due_at),
      ...(completion === undefined ? {} : { outputCapture: decodeOutputCapture(completion) })
    }
  }
  private publishStructural(value: unknown, runtime: unknown): void {
    if (!this.structuralListeners.size) return
    this.viewingRuntime = runtime
    this.viewingPhysical = readRecord(value).$ === "NativeRunTypes.PhysicalDelivery"
    try {
      for (const listener of this.structuralListeners) listener(freezeCanonicalData(clone(value)))
    } finally {
      this.viewingRuntime = undefined
      this.viewingPhysical = false
    }
  }
  projectStructural(value: unknown): RunStructuralFrame {
    const frame = readRecord(value)
    if (frame.$ === "NativeRunTypes.PhysicalDelivery") return this.projectPhysicalFrame(value)
    const observation = decodeNativeRunObservation(value, {
      agent: (partition) => this.agentScopes.find((scope) => scope.partition === partition)?.agent,
      callbackReceipt: (target) => this.capturedCallbackReceipt(target),
      sourceLabel: (identity) => this.label(identity),
      capacityMetadata: this.capacityMetadata,
      ...(this.config.lifecycles?.cancellation === "suppressed" ? { cancellationSuppressed: true } : {})
    })
    return this.projectStructuralFrame(value, observation)
  }
  projectPhysicalFrame(value: unknown): RunStructuralFrame {
    const physical = nativeRunRecord(value, "NativeRunTypes.PhysicalDelivery")
    const consumed = nativeRunOptional(physical.consumed)
    if (consumed === undefined) throw new TypeError("native physical frame lacks exact consumed source")
    const source = nativeRunRecord(consumed, "NativeRunTypes.ConsumedInput")
    const before = this.decodeRuntime(physical.before),
      after = this.decodeRuntime(physical.after)
    const scheduled = this.decodeItem(
      {
        $: "NativeRunTypes.Item",
        order: source.order,
        input: source.input,
        receipt: encodeNativeRunList([physical.fact])
      },
      physical.before
    )
    const time = readNat(readRecord(readRecord(after.engine).scheduler).now)
    const registered = nativeRunOptional(physical.registration)
    if (registered !== undefined) {
      const registration = nativeRunRecord(registered, "NativeRunTypes.FinishRegistered")
      return freezeCanonicalData({
        kind: "finishRegistration",
        time,
        before,
        after,
        scheduled,
        registration: {
          state: after.engine,
          finish: decodeStopFinish(registration.finish),
          created: readBool(registration.created)
        }
      })
    }
    const rawFact = nativeRunOptional(physical.fact)
    if (rawFact === undefined) throw new TypeError("native physical frame lacks callback receipt")
    const fact = nativeRunRecord(rawFact, "Callbacks.Fact")
    const target = decodeCallbackTarget(fact.target)
    const retained =
      before.retainedCallbacks.find((item) => item.order === readNat(source.order)) ??
      before.retainedCallbacks.find((item) => item.order === target.originalOrder)
    const original =
      retained?.receipt ??
      (() => {
        const captured = this.historicalCallbacks.get(target.originalOrder)
        if (captured === undefined) throw new TypeError("native physical callback lost original issuance timestamps")
        const capsule = nativeRunRecord(captured, "NativeRunTypes.RetainedCallback")
        return { target, issuedAt: readNat(capsule.issued_at), dueAt: readNat(capsule.due_at) }
      })()
    const completion = nativeRunOptional(fact.completion)
    const receipt = {
      ...original,
      target,
      ...(completion === undefined ? {} : { outputCapture: decodeOutputCapture(completion) })
    }
    return freezeCanonicalData({
      kind: "callbackDelivery",
      time,
      before,
      after,
      scheduled: { ...scheduled, callbackReceipt: receipt },
      receipt,
      fact,
      delivery: physical.action
    })
  }
  projectStructuralFrame(value: unknown, observation: Observation): RunStructuralFrame {
    const frame = readRecord(value)
    const details = nativeRunRecord(frame.details, "NativeRunTypes.FrameDetails")
    const consumed = nativeRunOptional(details.consumed)
    if (consumed === undefined) throw new TypeError("native product frame lacks consumed source")
    const source = nativeRunRecord(consumed, "NativeRunTypes.ConsumedInput")
    const scheduled = this.decodeItem(
      {
        $: "NativeRunTypes.Item",
        order: source.order,
        input: source.input,
        receipt: encodeNativeRunList([details.receipt])
      },
      details.before
    )
    const before = this.decodeRuntime(details.before),
      after = this.decodeRuntime(details.after)
    const transitionCore = nativeRunList(details.transition_after)
    if (transitionCore.length !== 1) throw new TypeError("native product frame lacks transition core")
    const original = readRecord(source.input)
    if (frame.$ === "NativeRunTypes.GraphFrame") {
      const beforeGraphs = nativeRunList(frame.before),
        afterGraphs = nativeRunList(frame.after)
      return freezeCanonicalData({
        kind: "preparation",
        time: observation.time,
        before,
        after,
        scheduled,
        observation,
        transition: {
          $: "Types.GraphTransition",
          state: transitionCore[0],
          before: beforeGraphs[0],
          result: { $: "ImportGraph.BoundedStep", state: afterGraphs[0], command: frame.command }
        }
      })
    }
    const rejection = nativeRunOptional(frame.rejection)
    const afterCanonical = nativeRunList(frame.after)
    const result =
      rejection === undefined
        ? { $: "Canonical.Advanced", state: afterCanonical[0], outputs: frame.outputs }
        : { $: "Canonical.Rejected", state: afterCanonical[0], reason: rejection }
    return freezeCanonicalData({
      kind: "canonical",
      time: observation.time,
      before,
      after,
      scheduled,
      observation,
      transition: { $: "Engine.Transition", state: transitionCore[0], result },
      ...(original.$ === "NativeRunTypes.CacheFact" ? { source: original.fact } : {})
    })
  }
  get queue(): RunRuntimeSnapshot["queue"] {
    return this.runtimeSnapshot().queue
  }
  control(value: Control, sequence: number = this.controlSequence++): unknown {
    const control = validateLiveControl(value)
    const tag = (name: string, fields: Record<string, unknown>) => ({ $: `NativeRunTypes.${name}`, ...fields })
    let encoded: unknown
    switch (control.kind) {
      case "environment":
        encoded = tag("EnvironmentControl", {
          current_work: control.currentWork,
          credential_ready: control.credentialReady,
          credential_generation: control.credentialGeneration ?? 1,
          source_readable: control.sourceReadable ?? true
        })
        break
      case "outputProfile":
        encoded = tag("OutputProfileControl", {
          outcome: outcome(control.outcome),
          delay: control.delayMs,
          lease: control.leaseMs
        })
        break
      case "jevProfile":
        encoded =
          control.outcome === undefined
            ? tag("JevProfile", {
                delay: control.delayMs,
                weights: encodeNativeRunWeights(control.outcomeWeights ?? DEFAULT_OUTCOME_WEIGHTS)
              })
            : tag("JevOutcomeControl", { delay: control.delayMs, outcome: encodeDriverOutcome(control.outcome) })
        break
      case "callback":
        encoded = tag("CallbackControl", {
          target: encodeCallbackTarget(control.target),
          action: encodeCallbackAction(control.action),
          historical_source: encodeNativeRunOptional(this.historicalCallbacks.get(control.target.originalOrder))
        })
        break
      case "outputAttempt":
        encoded = tag("OutputAttemptControl", {
          target: encodeCallbackTarget(control.target),
          outcome: outcome(control.outcome),
          historical_source: encodeNativeRunOptional(this.historicalCallbacks.get(control.target.originalOrder))
        })
        break
      case "fileTrees":
        encoded = tag("FileTreesControl", {
          profile: encodeFileTreeProfile(control.profile),
          identity: this.identity(JSON.stringify(control.profile))
        })
        break
      case "graphLimits":
        encoded = tag("GraphLimitsControl", {
          limits: encodePreparationGraphLimits(control.limits),
          identity: this.identity(JSON.stringify(control.limits))
        })
        break
      case "adviceeLifecycle":
        encoded = tag("AdviceeLifecycleControl", {
          identity: this.partition(control),
          action: encodeAdviceeLifecycle(control.action)
        })
        break
      case "editPermitLimits":
        encoded = tag("PermitLimitsControl", { advicee: control.limits.perAdvicee, resident: control.limits.resident })
        break
      case "permitProfile":
        encoded = tag("PermitProfileControl", {
          duration: control.profile.durationMs,
          lifetime: control.profile.lifetimeMs,
          outcome: permitOutcome(control.profile.outcome)
        })
        break
      case "expiryProfile":
        encoded = tag("ExpiryProfileControl", { profile: encodeExpiryProfile(control.profile) })
        break
      case "credentials":
        encoded = tag("CredentialControl", {
          available: control.action !== "unavailable",
          rotate: control.action === "rotate"
        })
        break
      case "jevRequest":
        encoded = tag("JevRequestControl", {
          target: { $: "FaultTargets.Target", ...control.target },
          outcome: encodeDriverOutcome(control.outcome)
        })
        break
      case "sharingMember":
        encoded =
          control.action === "leave"
            ? tag("SharingLeaveControl", { target: { $: "FreshnessScenario.Scope", ...control.target } })
            : tag("SharingLeaveAllControl", { partition: control.partition, lifetime: control.lifetime })
        break
      case "collectionResponse":
        encoded =
          control.action === "open"
            ? tag("ResponseOpenControl", { response: encodeCollectionResponse(control.response) })
            : control.action === "close"
              ? tag("ResponseCloseControl", { target: encodeCollectionResponseIdentity(control.target) })
              : tag("ResponseAttemptControl", {
                  target: encodeCollectionResponseIdentity(control.target),
                  current_block: control.currentBlock
                })
        break
      case "backgroundWriter":
        encoded =
          control.action === "claim"
            ? tag("WriterClaimControl", { capture: encodeWriterCapture(control.capture) })
            : control.action === "attempt"
              ? tag("WriterAttemptControl", {
                  target: encodeWriterTarget(control.target),
                  current_block: control.currentBlock
                })
              : tag("WriterReleaseControl", {
                  target: encodeWriterTarget(control.target),
                  expire: control.action === "expire"
                })
        break
      case "noticeFailure":
      case "noticeLease":
      case "noticeAcknowledge":
      case "noticeCollect": {
        const partition = control.kind === "noticeCollect" ? control.partition : control.target.partition
        const group = control.kind === "noticeCollect" ? control.group : control.target.group
        const key = control.kind === "noticeCollect" ? 900000 : control.target.key
        const settings = this.config.resourceScenarios
        const scope = encodeNoticeScope({
          partition,
          group,
          key,
          maximumKeys:
            settings?.noticeMaximumKeys ??
            (settings ? demoResourceLimits(this.agentScopes.length).noticeMaximumKeys : 8),
          reservationBytes: settings?.noticeReservationBytes ?? 128,
          cooldownMs: settings?.cooldownMs ?? 60000,
          startAt: this.now
        })
        encoded =
          control.kind === "noticeFailure"
            ? tag("NoticeFailureControl", {
                scope,
                key,
                sequence,
                diagnostic: encodeNativeRunOptional(control.diagnostic)
              })
            : control.kind === "noticeCollect"
              ? tag("NoticeCollectControl", {
                  scope,
                  composed: control.composed,
                  authority_bound: control.authorityBound,
                  allowed: encodeNativeRunList(control.allowed)
                })
              : tag("NoticeOwnedControl", { scope, lease: control.kind === "noticeLease" })
        break
      }
      case "editPace":
      case "sizes":
      case "burst":
      case "suspendArrivals":
      case "editDuration": {
        const target = value.agent === undefined ? undefined : this.partition(value)
        const workload =
          control.kind === "editPace"
            ? { $: "Workload.Pace", interval: control.intervalMs }
            : control.kind === "sizes"
              ? {
                  $: "Workload.Sizes",
                  bytes: control.reservationBytes,
                  units: encodeNativeRunList(control.reviewUnitBytes)
                }
              : control.kind === "burst"
                ? { $: "Workload.Burst", count: control.count }
                : control.kind === "suspendArrivals"
                  ? { $: "Workload.Suspend", suspended: control.suspended }
                  : { $: "Workload.Duration", duration: control.durationMs }
        encoded = tag("WorkloadControl", { identity: encodeNativeRunOptional(target), control: workload })
        break
      }
      default:
        throw new TypeError(`unimplemented NativeRun control encoder ${(control as { kind: string }).kind}`)
    }
    const result = nativeRunRecord(
      this.decode(Native.control(this.state, nativeFacts(encoded))),
      "NativeRunControls.Applied"
    )
    if (Object.keys(result).length !== 4) throw new TypeError("invalid native control result fields")
    readBool(result.applied)
    const report = readRecord(result.report)
    // Decode the complete response transition before publishing its state or
    // reports. A malformed later action must not consume an issuance identity.
    if (control.kind === "collectionResponse") {
      nativeRunRecord(report, "NativeRunControls.ResponseReport")
      if (Object.keys(report).length !== 2) throw new TypeError("invalid native response envelope fields")
      this.responseReport(report.result)
      const candidateRuntime = Native.runtime_snapshot(result.state as RunState)
      const snapshot = nativeRunRecord(candidateRuntime, "NativeRunTypes.RuntimeSnapshot")
      if (!readBool(snapshot.valid)) throw new TypeError("invalid native response runtime")
      for (const item of nativeRunList(snapshot.items)) this.decodeItem(item, candidateRuntime)
    }
    this.state = result.state as RunState
    this.refreshPhysicalView()
    if (control.kind === "callback") {
      const tag = readRecord(report.result).$
      const result =
        tag === "Callbacks.Applied"
          ? "applied"
          : tag === "Callbacks.NotQueued"
            ? "notQueued"
            : tag === "Callbacks.NotHeld"
              ? "notHeld"
              : "missing"
      this.reportHistory.callbackReports.push({ at: this.now, controlSequence: sequence, control, result })
    } else if (control.kind === "outputAttempt") {
      const tag = readRecord(report.result).$
      const result = tag === "Callbacks.Applied" ? "applied" : tag === "Callbacks.NotQueued" ? "notQueued" : "missing"
      this.reportHistory.outputReports.push({ at: this.now, controlSequence: sequence, control, result })
    } else if (control.kind === "credentials")
      this.reportHistory.interventions.push({ at: this.now, controlSequence: sequence, control, result: "applied" })
    else if (control.kind === "jevRequest") {
      const tag = readRecord(report.result).$
      const result =
        tag === "JevEffects.Applied"
          ? "applied"
          : tag === "JevEffects.RefusedMissing"
            ? "requestMissing"
            : tag === "JevEffects.RefusedStarted"
              ? "requestAlreadyStarted"
              : tag === "JevEffects.RefusedInterrupted"
                ? "requestAlreadyInterrupted"
                : undefined
      if (!result) throw new TypeError("invalid native Jev report")
      this.reportHistory.interventions.push({ at: this.now, controlSequence: sequence, control, result })
    } else if (control.kind === "collectionResponse") {
      this.reportHistory.collectionResponseReports.push({
        at: this.now,
        controlSequence: sequence,
        control,
        ...this.responseReport(report.result)
      })
      if (control.action === "attempt")
        this.responseOrigins.set(JSON.stringify(encodeCollectionResponseIdentity(control.target)), {
          control,
          sequence
        })
    } else if (control.kind === "backgroundWriter") {
      if (control.action === "claim") {
        const pending = nativeRunOptional(report.pending)
        this.reportHistory.writerReports.push({
          at: this.now,
          controlSequence: sequence,
          control,
          result: pending === undefined ? "wrongScope" : "queued"
        })
        if (pending !== undefined) this.writerOrigins.set(JSON.stringify(pending), { control, sequence })
      } else if (control.action === "attempt") {
        const target = nativeRunOptional(report.target)
        this.reportHistory.writerReports.push({
          at: this.now,
          controlSequence: sequence,
          control,
          ...this.responseReport(report.result),
          ...(target === undefined ? {} : { target: this.responseIdentity(target) })
        })
        if (target !== undefined) this.responseOrigins.set(JSON.stringify(target), { control, sequence })
      } else
        this.reportHistory.writerReports.push({
          at: this.now,
          controlSequence: sequence,
          control,
          result: readBool(report.queued) ? "queued" : "missing"
        })
    }
    if (readBool(result.applied)) {
      if (control.kind === "editPermitLimits")
        this.metadata = {
          ...this.metadata,
          permits: {
            adviceeLimit: control.limits.perAdvicee,
            residentLimit: control.limits.resident,
            ...(this.metadata.permits?.adviceeLimits ? { adviceeLimits: this.metadata.permits.adviceeLimits } : {})
          }
        }
      if (control.kind === "backgroundWriter" && control.action === "claim")
        this.metadata = { ...this.metadata, collectors: { capacity: control.capture.capacity } }
      if (control.kind === "noticeFailure")
        this.metadata = {
          ...this.metadata,
          notices: {
            maximumKeys:
              this.config.resourceScenarios?.noticeMaximumKeys ??
              (this.config.resourceScenarios ? demoResourceLimits(this.agentScopes.length).noticeMaximumKeys : 8)
          }
        }
    }
    return freezeCanonicalData(clone(result))
  }
}
