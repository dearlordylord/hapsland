import { readBendList, readBool, readNat, readRecord } from "@hapsland/canonical-policy/canonical/boundary-schema"
import { freezeCanonicalData } from "@hapsland/canonical-policy/canonical/immutable"
import {
  decodeTrustedCanonicalStep,
  projectTrustedCanonical
} from "@hapsland/canonical-policy/canonical/canonical-boundary"
import {
  encodeDriverAction,
  encodeDriverOutcome,
  decodeDriverOutcome,
  decodeDriverEvent,
  type DriverAction
} from "./driver-codec.ts"
import { doubleWords } from "./numeric-codec.ts"
import { JEV_OUTCOME_ORDER, validateOutcomeWeights, type OutcomeWeights } from "./outcomes.ts"
import {
  decodeImportGraphStep,
  projectImportGraph,
  validateGraphLimits,
  type GraphLimits
} from "@hapsland/canonical-policy/canonical/graph-adapter"
import { decodeGraphEvent } from "@hapsland/canonical-policy/canonical/graph-schema"
import { decodePrefixGraphEvent } from "./callback-native-codec.ts"
import { decodeCallbackTarget } from "./callback-controls.ts"
import { decodeOutputCapture } from "./output-controls.ts"
import { encodeFreshnessSource, type FreshnessSource } from "./freshness-codec.ts"
import { encodeSharingKey, type SharingKey } from "./sharing-controls.ts"
import {
  encodeFileTreeProfile,
  encodePreparationGraphLimits,
  validateFileTreeProfile,
  type FileTreeProfile
} from "./file-trees.ts"
import type { CapacityMetadata } from "./lifecycle-profile.ts"
import type { Observation, RunRuntimeSnapshot } from "./index.ts"

export const decodeNativeRunGraphEvent = (value: unknown) => {
  const event = readRecord(decodePrefixGraphEvent(value))
  switch (event.$) {
    case "ImportGraph.Root":
      return decodeGraphEvent({
        kind: "root",
        target: event.target,
        sourceBytes: event.source_bytes,
        treeBytes: event.tree_bytes,
        localWork: event.local_work,
        edges: nativeRunList(event.edges).map(readNat)
      })
    case "ImportGraph.Captured":
      return decodeGraphEvent({
        kind: "captured",
        sourceBytes: event.source_bytes,
        treeBytes: event.node_bytes,
        localWork: event.local_work,
        edges: nativeRunList(event.edges).map(readNat)
      })
    case "ImportGraph.Resolved":
      return decodeGraphEvent({
        kind: "resolved",
        target: event.target,
        result: (
          {
            "ImportGraph.Found": "found",
            "ImportGraph.NotFound": "missing",
            "ImportGraph.Many": "ambiguous",
            "ImportGraph.Unhandled": "unsupported"
          } as Record<string, string>
        )[String(readRecord(event.result).$)]
      })
    case "ImportGraph.PathChecked":
      return decodeGraphEvent({ kind: "pathChecked", allowed: event.allowed })
    case "ImportGraph.Next":
      return decodeGraphEvent({ kind: "next" })
    case "ImportGraph.CaptureFailed":
      return decodeGraphEvent({ kind: "captureFailed" })
    case "ImportGraph.DeadlineReached":
      return decodeGraphEvent({ kind: "deadlineReached" })
    default:
      throw new TypeError("invalid NativeRun graph event")
  }
}
export const nativeRunList = (value: unknown): unknown[] => readBendList(value, (item) => item, 65536)
export const nativeRunRecord = (value: unknown, tag: string): Record<string, unknown> => {
  const record = readRecord(value)
  if (record.$ !== tag) throw new TypeError(`expected ${tag}`)
  return record
}
export const nativeRunSingleton = (value: unknown): unknown => {
  const values = nativeRunList(value)
  if (values.length !== 1) throw new TypeError("invalid native singleton capsule")
  return values[0]
}
export const nativeRunOptional = (value: unknown): unknown | undefined => {
  const record = readRecord(value)
  if (record.$ === "None" && Object.keys(record).length === 1) return undefined
  if (record.$ === "Some" && Object.keys(record).length === 2 && Object.hasOwn(record, "value")) return record.value
  throw new TypeError("invalid NativeRun Maybe")
}
export const encodeNativeRunList = (values: readonly unknown[]): unknown =>
  values.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
export const encodeNativeRunOptional = (value: unknown | undefined): unknown =>
  value === undefined ? { $: "None" } : { $: "Some", value }
export const encodeNativeRunWeights = (weights: OutcomeWeights): unknown => {
  const validated = validateOutcomeWeights(weights)
  return encodeNativeRunList(JEV_OUTCOME_ORDER.map((key) => doubleWords(validated[key]!)))
}
const decodeWeights = (value: unknown): OutcomeWeights => {
  const values = nativeRunList(value)
  if (values.length !== JEV_OUTCOME_ORDER.length) throw new TypeError("invalid NativeRun weights length")
  const entries = JEV_OUTCOME_ORDER.map((key, index) => {
    const words = nativeRunRecord(values[index], "Numeric.Words")
    const view = new DataView(new ArrayBuffer(8))
    const high = readNat(words.high),
      low = readNat(words.low)
    if (high > 0xffffffff || low > 0xffffffff) throw new TypeError("invalid IEEE64 words")
    view.setUint32(0, high, false)
    view.setUint32(4, low, false)
    return [key, view.getFloat64(0, false)]
  })
  return validateOutcomeWeights(Object.fromEntries(entries) as OutcomeWeights)
}
export type NativeRunJobFacts = {
  partition: number
  lifetime: number
  round: number
  bytes: number
  units: readonly number[]
  revision: number
  repair: boolean
  duration?: number
  facts?: {
    origin?: number
    freshness?: FreshnessSource
    keys: readonly SharingKey[]
    tree?: {
      identity: number
      profile: FileTreeProfile
      limits: GraphLimits
      profileLabel?: number
      limitsLabel?: number
    }
    tool?: number
  }
  sourceJob?: {
    partition: number
    lifetime: number
    bytes: number
    units: readonly number[]
    outcome?: Parameters<typeof encodeDriverOutcome>[0]
  }
}
export const encodeNativeRunJob = (job: NativeRunJobFacts): unknown => ({
  $: "NativeRunTypes.Job",
  partition: readNat(job.partition),
  lifetime: readNat(job.lifetime),
  round: readNat(job.round),
  bytes: readNat(job.bytes),
  units: encodeNativeRunList(job.units.map(readNat)),
  revision: readNat(job.revision),
  repair: readBool(job.repair),
  duration: encodeNativeRunOptional(job.duration === undefined ? undefined : readNat(job.duration)),
  facts: encodeNativeRunList([
    encodeNativeRunOptional(
      job.facts === undefined
        ? undefined
        : {
            $: "NativeRunTypes.JobFacts",
            freshness: encodeNativeRunOptional(
              job.facts.freshness === undefined ? undefined : encodeFreshnessSource(job.facts.freshness)
            ),
            keys: encodeNativeRunList(job.facts.keys.map(encodeSharingKey)),
            tree: encodeNativeRunOptional(
              job.facts.tree === undefined
                ? undefined
                : {
                    $: "NativeRunTypes.TreeCapture",
                    identity: readNat(job.facts.tree.identity),
                    profile: encodeFileTreeProfile(job.facts.tree.profile),
                    limits: encodePreparationGraphLimits(job.facts.tree.limits),
                    profile_label: readNat(job.facts.tree.profileLabel ?? 0),
                    limits_label: readNat(job.facts.tree.limitsLabel ?? 0)
                  }
            ),
            tool: encodeNativeRunOptional(job.facts.tool === undefined ? undefined : readNat(job.facts.tool)),
            permit_capture: encodeNativeRunOptional(undefined),
            origin: readNat(job.facts.origin ?? 0),
            original: encodeNativeRunOptional(undefined)
          }
    )
  ]),
  source_job: encodeNativeRunOptional(
    job.sourceJob === undefined
      ? undefined
      : {
          $: "Driver.SourceJob",
          partition: readNat(job.sourceJob.partition),
          lifetime: readNat(job.sourceJob.lifetime),
          bytes: readNat(job.sourceJob.bytes),
          units: encodeNativeRunList(job.sourceJob.units.map(readNat)),
          outcome: encodeNativeRunOptional(
            job.sourceJob.outcome === undefined ? undefined : encodeDriverOutcome(job.sourceJob.outcome)
          )
        }
  )
})
export const encodeNativeRunEvent = (
  action: DriverAction,
  job?: NativeRunJobFacts,
  context?: unknown,
  sourceJob?: unknown
): unknown => ({
  $: "NativeRunTypes.Event",
  action: encodeDriverAction(action),
  job: encodeNativeRunOptional(job === undefined ? undefined : encodeNativeRunJob(job)),
  context: encodeNativeRunList([encodeNativeRunOptional(context)]),
  source_job: encodeNativeRunOptional(sourceJob)
})

/** Host adapters retain presentation labels and original source-free input facts.
 * They decode facts captured by the runner; they must never schedule effects. */
export type NativeRunSnapshotAdapters = {
  engine: (value: unknown) => RunRuntimeSnapshot["engine"]
  item: (value: unknown) => RunRuntimeSnapshot["queue"][number]
  job: (value: unknown) => RunRuntimeSnapshot["jobs"][number][1]
  retained: (value: unknown) => RunRuntimeSnapshot["retainedCallbacks"][number]
}
export const decodeNativeRunSnapshot = (value: unknown, adapters: NativeRunSnapshotAdapters): RunRuntimeSnapshot => {
  const snapshot = nativeRunRecord(value, "NativeRunTypes.RuntimeSnapshot")
  if (!readBool(snapshot.valid)) throw new TypeError("invalid NativeRun runtime")
  const core = nativeRunList(snapshot.core)
  if (core.length !== 1) throw new TypeError("invalid NativeRun core box")
  const environment = nativeRunRecord(snapshot.environment, "NativeRunTypes.Environment")
  const host = nativeRunRecord(snapshot.host, "NativeRunTypes.HostFacts")
  const profile = nativeRunRecord(environment.output_profile, "NativeRunTypes.OutputProfile")
  const outcomeTag = readRecord(profile.outcome).$
  const outcome =
    outcomeTag === "OutputScenario.Certain"
      ? "certain"
      : outcomeTag === "OutputScenario.Uncertain"
        ? "uncertain"
        : outcomeTag === "OutputScenario.Failed"
          ? "failed"
          : undefined
  if (!outcome) throw new TypeError("invalid NativeRun output outcome")
  const selected = nativeRunOptional(environment.outcome)
  const liveOrders = new Set(
    nativeRunList(readRecord(readRecord(core[0]).scheduler).queue).map((entry) => readNat(readRecord(entry).order))
  )
  return freezeCanonicalData({
    engine: adapters.engine(core[0]),
    queue: nativeRunList(snapshot.items)
      .filter((value) => liveOrders.has(readNat(readRecord(value).order)))
      .map(adapters.item)
      .sort((left, right) => left.at - right.at || left.order - right.order),
    jobs: nativeRunList(snapshot.jobs).map((value) => {
      const stored = nativeRunRecord(value, "NativeRunTypes.StoredJob")
      return [readNat(stored.operation), adapters.job(stored.job)] as const
    }),
    issuedRequests: nativeRunList(host.issued_requests).map((value) => {
      const issued = nativeRunRecord(value, "NativeRunTypes.IssuedRequest")
      const decoded = decodeTrustedCanonicalStep({
        $: "Canonical.Advanced",
        state: readRecord(core[0]).canonical,
        outputs: encodeNativeRunList([issued.output])
      })
      const command = decoded.outputs[0]
      if (!command || command.kind !== "jevRequestIssued") throw new TypeError("invalid NativeRun issued request")
      return [readNat(issued.request), command] as const
    }),
    retainedCallbacks: nativeRunList(host.retained_callbacks).map(adapters.retained),
    order: readNat(snapshot.next),
    eventCount: readNat(snapshot.count),
    jevDelay: readNat(environment.jev_delay),
    outcome: selected === undefined ? undefined : decodeDriverOutcome(selected),
    outcomeWeights: decodeWeights(environment.weights),
    environment: {
      currentWork: readBool(environment.current_work),
      credentialReady: readBool(environment.credential_ready),
      credentialGeneration: readNat(environment.credential_generation),
      sourceReadable: readBool(environment.source_readable)
    },
    outputProfile: { outcome, delayMs: readNat(environment.output_delay), leaseMs: readNat(environment.output_lease) },
    generatorPartitions: nativeRunList(host.generator_partitions).map(readNat)
  })
}
export type NativeRunObservationAdapters = {
  details: (
    value: Record<string, unknown>
  ) => Pick<Observation, "effects" | "capacityMetadata"> &
    Partial<Pick<Observation, "partition" | "agent" | "workload" | "callbackReceipt" | "noticeDiagnostic">>
  graph: (value: unknown) => Observation
}
export const decodeNativeRunFrame = (value: unknown, adapters: NativeRunObservationAdapters): Observation => {
  const raw = readRecord(value)
  if (raw.$ === "NativeRunTypes.GraphFrame") return freezeCanonicalData(adapters.graph(value))
  const frame = nativeRunRecord(value, "NativeRunTypes.ProductFrame")
  const before = nativeRunList(frame.before),
    after = nativeRunList(frame.after)
  if (before.length !== 1 || after.length !== 1) throw new TypeError("invalid NativeRun frame state box")
  const rejection = nativeRunOptional(frame.rejection)
  const result = decodeTrustedCanonicalStep(
    rejection === undefined
      ? { $: "Canonical.Advanced", state: after[0], outputs: frame.outputs }
      : { $: "Canonical.Rejected", state: after[0], reason: rejection }
  )
  const details = nativeRunRecord(frame.details, "NativeRunTypes.FrameDetails")
  return freezeCanonicalData({
    ...adapters.details(details),
    sequence: readNat(frame.sequence),
    time: readNat(frame.time),
    event: decodeDriverEvent(frame.event),
    before: projectTrustedCanonical(before[0]),
    after: projectTrustedCanonical(after[0]),
    outputs: result.outputs,
    ...(result.rejection === undefined ? {} : { rejection: result.rejection }),
    outputScopes: nativeRunList(details.output_scopes).map((value) => {
      const scope = nativeRunOptional(value)
      return scope === undefined ? undefined : readNat(scope)
    })
  })
}

export type NativeRunConfigFacts = {
  limits: { globalItems: number; globalBytes: number; partitionItems: number; partitionBytes: number }
  advicees: readonly { identity: number; seed: number; profile?: unknown }[]
  environment: {
    jevDelay: number
    outcome?: Parameters<typeof encodeDriverOutcome>[0]
    weights: OutcomeWeights
    preparationDelay: number
    treeProfile: unknown
    graphLimits: unknown
    outputDelay: number
    outputLease: number
    currentWork: boolean
    credentialReady: boolean
    credentialGeneration: number
    sourceReadable: boolean
    adviceLifetime: number
    outputOutcome: "certain" | "uncertain" | "failed"
    candidateBytes?: number
  }
  collectors?: unknown
}
/** Compose previously validated owner descriptors without inventing configuration defaults. */
export const encodeNativeRunConfig = (facts: NativeRunConfigFacts): unknown => {
  const environment = facts.environment
  nativeRunRecord(environment.treeProfile, "TreeFacts.Profile")
  nativeRunRecord(environment.graphLimits, "ImportGraph.Limits")
  const outcomeTags = { certain: "Certain", uncertain: "Uncertain", failed: "Failed" }
  if (!Object.hasOwn(outcomeTags, environment.outputOutcome)) throw new TypeError("invalid NativeRun output outcome")
  return {
    $: "NativeRunTypes.Config",
    limits: {
      $: "Ledger.Limits",
      global_items: readNat(facts.limits.globalItems),
      global_bytes: readNat(facts.limits.globalBytes),
      partition_items: readNat(facts.limits.partitionItems),
      partition_bytes: readNat(facts.limits.partitionBytes)
    },
    advicees: encodeNativeRunList(
      facts.advicees.map((advicee) => ({
        $: "NativeRunTypes.Advicee",
        identity: readNat(advicee.identity),
        seed: readNat(advicee.seed),
        profile: encodeNativeRunOptional(advicee.profile)
      }))
    ),
    environment: {
      $: "NativeRunTypes.Environment",
      jev_delay: readNat(environment.jevDelay),
      outcome: encodeNativeRunOptional(
        environment.outcome === undefined ? undefined : encodeDriverOutcome(environment.outcome)
      ),
      weights: encodeNativeRunWeights(environment.weights),
      preparation_delay: readNat(environment.preparationDelay),
      tree_profile: environment.treeProfile,
      graph_limits: environment.graphLimits,
      output_delay: readNat(environment.outputDelay),
      output_lease: readNat(environment.outputLease),
      current_work: readBool(environment.currentWork),
      credential_ready: readBool(environment.credentialReady),
      credential_generation: readNat(environment.credentialGeneration),
      source_readable: readBool(environment.sourceReadable),
      advice_lifetime: readNat(environment.adviceLifetime),
      output_profile: {
        $: "NativeRunTypes.OutputProfile",
        outcome: { $: `OutputScenario.${outcomeTags[environment.outputOutcome]}` },
        candidate_bytes: encodeNativeRunOptional(
          environment.candidateBytes === undefined ? undefined : readNat(environment.candidateBytes)
        )
      }
    },
    collectors: encodeNativeRunOptional(facts.collectors)
  }
}

export type NativeRunPublicLabels = {
  agent: (partition: number) => string | undefined
  sourceLabel?: (identity: number) => string | undefined
  capacityMetadata: CapacityMetadata
  /** Original prepared graph presentation facts, retained without effect policy. */
  preparation?: (
    key: Record<string, unknown>,
    position: number
  ) => Partial<Pick<import("./preparation.ts").PreparationEvent, "example" | "generatedTree" | "graphLimits">>
  /** Original callback capture, retained at issuance. */
  callbackReceipt?: (target: ReturnType<typeof decodeCallbackTarget>) => Observation["callbackReceipt"]
  cancellationSuppressed?: boolean
}
const boxedNativeRunCore = (snapshot: Record<string, unknown>) => {
  const core = nativeRunList(snapshot.core)
  if (core.length !== 1) throw new TypeError("invalid NativeRun core box")
  return readRecord(core[0])
}
export const decodeNativeRunGraphSource = (
  inputValue: unknown,
  sourceLabel?: (identity: number) => string | undefined
): Partial<import("./preparation.ts").PreparationEvent> => {
  const input = nativeRunRecord(inputValue, "NativeRunTypes.GraphFact")
  const limits = nativeRunRecord(input.limits, "ImportGraph.Limits")
  if (readNat(limits.version) !== 1) throw new TypeError("invalid original graph profile version")
  const graphLimits = validateGraphLimits({
    version: 1,
    sourceBytes: readNat(limits.source_bytes),
    treeBytes: readNat(limits.tree_bytes),
    files: readNat(limits.files),
    readBytes: readNat(limits.read_bytes),
    outgoingEdges: readNat(limits.outgoing_edges),
    depth: readNat(limits.depth),
    work: readNat(limits.work)
  })
  const generatedBox = nativeRunList(input.generated)
  const treeBox = nativeRunList(input.tree)
  if (generatedBox.length !== 1 || treeBox.length !== 1) throw new TypeError("invalid graph source capsule boxing")
  const generatedValue = nativeRunOptional(generatedBox[0])
  const treeCapture = nativeRunOptional(treeBox[0])
  const profileLabel =
    treeCapture === undefined ? undefined : sourceLabel?.(readNat(readRecord(treeCapture).profile_label))
  const limitLabel =
    treeCapture === undefined ? undefined : sourceLabel?.(readNat(readRecord(treeCapture).limits_label))
  const capturedLimits = limitLabel === undefined ? graphLimits : validateGraphLimits(JSON.parse(limitLabel))
  if (generatedValue === undefined) return { graphLimits: capturedLimits }
  const generated = nativeRunRecord(generatedValue, "PreparationScenario.Generated")
  const tree = nativeRunRecord(generated.tree, "TreeFacts.Tree")
  const files = nativeRunList(tree.files).map((value) => nativeRunRecord(value, "TreeFacts.TreeFile"))
  const gate = (value: unknown): boolean => {
    const tag = readRecord(value).$
    if (tag !== "RulePolicy.Admit" && tag !== "RulePolicy.Omit") throw new TypeError("invalid original graph gate")
    return tag === "RulePolicy.Admit"
  }
  const profile = profileLabel === undefined ? undefined : validateFileTreeProfile(JSON.parse(profileLabel))
  const event = decodeNativeRunGraphEvent(input.fact)
  const fact =
    profile !== undefined && profile.localWork === undefined && "localWork" in event
      ? (() => {
          const { localWork: _work, ...original } = event
          return original
        })()
      : event
  return {
    graphLimits: capturedLimits,
    fact,
    generatedTree: {
      targetNames: Object.fromEntries(
        files.map((file) => {
          const target = readNat(file.target)
          return [target, target === 1 ? "entry.ts" : `module-${target}.ts`]
        })
      ),
      files: files.length,
      depth: readNat(tree.depth),
      rootEligible: gate(generated.root_gate),
      closureEligible: gate(generated.closure_gate)
    }
  }
}
/** Project the supplied frame's owner facts. No effects are executed here. */
export const decodeNativeRunObservation = (value: unknown, labels: NativeRunPublicLabels): Observation => {
  const frame = readRecord(value)
  const details = nativeRunRecord(frame.details, "NativeRunTypes.FrameDetails")
  const beforeRuntime = nativeRunRecord(details.before, "NativeRunTypes.RuntimeSnapshot")
  const afterRuntime = nativeRunRecord(details.after, "NativeRunTypes.RuntimeSnapshot")
  const environment = nativeRunRecord(afterRuntime.environment, "NativeRunTypes.Environment")
  const supplied = nativeRunOptional(details.provided)
  const partition = supplied === undefined ? undefined : readNat(supplied)
  const agent = partition === undefined ? undefined : labels.agent(partition)
  const sourceLabels =
    partition === undefined || partition === 0 ? {} : { partition, ...(agent === undefined ? {} : { agent }) }
  const receiptFact = nativeRunOptional(details.receipt)
  const receipt = receiptFact === undefined ? undefined : nativeRunRecord(receiptFact, "Callbacks.Fact")
  const target = receipt === undefined ? undefined : decodeCallbackTarget(receipt.target)
  const capturedReceipt = target === undefined ? undefined : labels.callbackReceipt?.(target)
  const completion = receipt === undefined ? undefined : nativeRunOptional(receipt.completion)
  const retained =
    target === undefined
      ? undefined
      : nativeRunList(nativeRunRecord(beforeRuntime.host, "NativeRunTypes.HostFacts").retained_callbacks)
          .map((value) => nativeRunRecord(value, "NativeRunTypes.RetainedCallback"))
          .find((value) => readNat(value.order) === target.originalOrder)
  if (target !== undefined && capturedReceipt === undefined && retained === undefined)
    throw new TypeError("callback delivery lacks original issuance capture")
  const callbackReceipt =
    capturedReceipt ??
    (target === undefined
      ? undefined
      : {
          target,
          issuedAt: readNat(retained!.issued_at),
          dueAt: readNat(retained!.due_at),
          ...(completion === undefined ? {} : { outputCapture: decodeOutputCapture(completion) })
        })
  if (frame.$ === "NativeRunTypes.GraphFrame") {
    const key = nativeRunRecord(frame.key, "Types.GraphKey")
    const before = nativeRunList(frame.before),
      after = nativeRunList(frame.after)
    if (before.length !== 1 || after.length !== 1) throw new TypeError("invalid NativeRun graph box")
    const beforeBounded = nativeRunRecord(before[0], "ImportGraph.Bounded")
    const afterBounded = nativeRunRecord(after[0], "ImportGraph.Bounded")
    const graph = decodeImportGraphStep({ $: "ImportGraph.BoundedStep", state: afterBounded, command: frame.command })
    const position = readNat(frame.position)
    const consumedValue = nativeRunOptional(details.consumed)
    const graphSource =
      consumedValue === undefined
        ? undefined
        : readRecord(nativeRunRecord(consumedValue, "NativeRunTypes.ConsumedInput").input)
    const originalGraph =
      graphSource?.$ === "NativeRunTypes.GraphFact" ? decodeNativeRunGraphSource(graphSource, labels.sourceLabel) : {}
    const event: import("./preparation.ts").PreparationEvent = {
      kind: "preparationGraph",
      example: "generated",
      partition: readNat(key.partition),
      lifetime: readNat(key.lifetime),
      round: readNat(key.round),
      operation: readNat(key.operation),
      unit: readNat(key.unit),
      step: position,
      fact: decodeNativeRunGraphEvent(frame.fact),
      ...originalGraph,
      ...labels.preparation?.(key, position)
    }
    return freezeCanonicalData({
      sequence: readNat(frame.sequence),
      time: readNat(frame.time),
      partition: event.partition,
      ...(labels.agent(event.partition) === undefined ? {} : { agent: labels.agent(event.partition)! }),
      event,
      preparation: {
        event,
        before: projectImportGraph(beforeBounded),
        after: projectImportGraph(graph.state),
        command: graph.command
      },
      before: projectTrustedCanonical(boxedNativeRunCore(beforeRuntime).canonical),
      after: projectTrustedCanonical(boxedNativeRunCore(afterRuntime).canonical),
      outputs: [],
      effects: [],
      capacityMetadata: labels.capacityMetadata,
      ...(callbackReceipt ? { callbackReceipt } : {})
    })
  }
  return decodeNativeRunFrame(value, {
    graph: () => {
      throw new TypeError("unexpected graph frame")
    },
    details: () => {
      const effects: import("./index.ts").EffectObservation[] = []
      const decodedEvent = decodeDriverEvent(frame.event)
      const after = nativeRunList(frame.after)
      if (after.length !== 1) throw new TypeError("invalid NativeRun after box")
      const decoded = decodeTrustedCanonicalStep({ $: "Canonical.Advanced", state: after[0], outputs: frame.outputs })
      const capturedDue = (
        owner: { partition: number; lifetime: number; round: number; operation: number },
        kind: "preparationCompleted" | "jev",
        request?: number
      ): number => {
        const callbacks = nativeRunList(
          nativeRunRecord(afterRuntime.host, "NativeRunTypes.HostFacts").retained_callbacks
        ).map((value) => nativeRunRecord(value, "NativeRunTypes.RetainedCallback"))
        const actual = callbacks.filter((callback) => {
          const target = decodeCallbackTarget(nativeRunRecord(callback.fact, "Callbacks.Fact").target)
          const captured = target.owner
          if (
            captured.partition !== owner.partition ||
            captured.lifetime !== owner.lifetime ||
            captured.round !== owner.round ||
            captured.operation !== owner.operation
          )
            return false
          return kind === "preparationCompleted"
            ? target.effect.kind === "preparationCompleted"
            : (target.effect.kind === "jevSettled" || target.effect.kind === "jevInterrupted") &&
                target.effect.request === request
        })
        const deadlines = [...new Set(actual.map((callback) => readNat(callback.due_at)))]
        if (deadlines.length !== 1) throw new TypeError("started effect lacks one original completion deadline")
        return deadlines[0]!
      }
      for (const command of decoded.outputs) {
        if (command.kind === "prepare") {
          const owner = projectTrustedCanonical(after[0]).work.find((work) => work.operation === command.operation)
          if (!owner) throw new TypeError("started preparation lacks original owner")
          effects.push({
            kind: "preparation",
            phase: "started",
            operation: command.operation,
            due: capturedDue(owner, "preparationCompleted")
          })
        } else if (command.kind === "jevRequestIssued") {
          const receipts = nativeRunList(details.prepared).map((value) =>
            nativeRunRecord(value, "NativeRunTypes.EmissionContext")
          )
          const selected = receipts
            .map((value) => nativeRunOptional(value.receipt))
            .filter((value) => value !== undefined)
            .map((value) => nativeRunRecord(value, "Driver.OutcomeReceipt"))
            .find((value) => readNat(value.request) === command.request)
          if (!selected) throw new TypeError("issued Jev command lacks outcome receipt")
          if (decodeDriverOutcome(selected.outcome) !== "neverSent")
            effects.push({
              kind: "jev",
              phase: "started",
              operation: command.operation,
              request: command.request,
              due: capturedDue(command, "jev", command.request)
            })
        } else if (command.kind === "findingRetained" && "operation" in decodedEvent)
          effects.push({ kind: "advice", phase: "supplied", advice: decodedEvent.operation })
        else if (
          (command.kind === "submissionAuthorized" ||
            (command.kind === "submissionBegun" &&
              decodedEvent.kind === "submissionBegin" &&
              decodedEvent.authorizeNow &&
              readRecord(readRecord(environment.output_profile).outcome).$ !== "OutputScenario.Failed")) &&
          (decodedEvent.kind === "submissionBegin" || decodedEvent.kind === "submissionAuthorize")
        )
          effects.push({ kind: "output", phase: "started", advices: [decodedEvent.advice] })
        else if (
          command.kind === "finishAuthorized" &&
          (decodedEvent.kind === "finishAuthorize" || decodedEvent.kind === "finishReserve")
        )
          effects.push({ kind: "output", phase: "started", advices: [...decodedEvent.selected] })
        else if (command.kind === "cancelWork")
          effects.push({ kind: "cancellation", phase: "supplied", operation: command.operation })
      }
      if (decodedEvent.kind === "preparationCompleted")
        effects.push({ kind: "preparation", phase: "supplied", operation: decodedEvent.operation })
      if (decodedEvent.kind === "jevRequestSettled")
        effects.push(
          labels.cancellationSuppressed && decodedEvent.outcome === "interrupted"
            ? { kind: "cancellation", phase: "supplied", operation: decodedEvent.operation }
            : { kind: "jev", phase: "supplied", operation: decodedEvent.operation, request: decodedEvent.request }
        )
      const consumedValue = nativeRunOptional(details.consumed)
      const consumedInput =
        consumedValue === undefined
          ? undefined
          : readRecord(nativeRunRecord(consumedValue, "NativeRunTypes.ConsumedInput").input)
      const jobValue =
        consumedInput?.$ === "NativeRunTypes.CapturedEdit" || consumedInput?.$ === "NativeRunTypes.FinishInput"
          ? consumedInput.job
          : consumedInput?.$ === "NativeRunTypes.Event"
            ? nativeRunOptional(consumedInput.job)
            : undefined
      const job = jobValue === undefined ? undefined : nativeRunRecord(jobValue, "NativeRunTypes.Job")
      const revision = job === undefined ? undefined : readNat(job.revision)
      const workload =
        revision === undefined || revision === 0
          ? undefined
          : { revision, ...(agent === undefined ? {} : { agent }), ...(readBool(job!.repair) ? { repair: true } : {}) }
      const diagnostic =
        consumedInput?.$ === "NativeRunTypes.NoticeInput" ? nativeRunOptional(consumedInput.diagnostic) : undefined
      if (
        diagnostic !== undefined &&
        diagnostic !== "capacity" &&
        diagnostic !== "backend" &&
        diagnostic !== "credential" &&
        diagnostic !== "output-limit"
      )
        throw new TypeError("invalid native notice diagnostic")
      return {
        ...sourceLabels,
        ...(diagnostic === undefined ? {} : { noticeDiagnostic: diagnostic }),
        ...(workload ? { workload } : {}),
        ...(callbackReceipt ? { callbackReceipt } : {}),
        effects,
        capacityMetadata: labels.capacityMetadata
      }
    }
  })
}
