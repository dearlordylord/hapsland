import { Schema } from "effect"
import {
  boundedArray,
  decoder,
  Nat,
  PositiveNat,
  readNat,
  readBendList,
  readRecord
} from "@hapsland/canonical-policy/canonical/boundary-schema"
import { CanonicalEventSchema } from "@hapsland/canonical-policy/canonical/models"
import {
  decodeTrustedCanonicalStep,
  projectTrustedCanonical
} from "@hapsland/canonical-policy/canonical/canonical-boundary"
import { encodeCanonicalEvent } from "@hapsland/canonical-policy/canonical/adapter"
import {
  encodeImportGraphEvent,
  projectImportGraph,
  decodeImportGraphStep
} from "@hapsland/canonical-policy/canonical/graph-adapter"
import { decodeGraphEvent } from "@hapsland/canonical-policy/canonical/graph-schema"
import { freezeCanonicalData } from "@hapsland/canonical-policy/canonical/immutable"
import { decodeDriverEvent } from "./driver-codec.ts"
import { decodeCallbackTarget, validateCallbackControl } from "./callback-controls.ts"
import { decodeAdviceeLifecycles } from "./advicee-lifecycle.ts"
import { type RunObservation } from "./index.ts"

// Native event DTOs contain only primitive values, arrays, and plain records.
function equalPlainData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false
  const prototype = Object.getPrototypeOf(left)
  if (
    prototype !== Object.getPrototypeOf(right) ||
    (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null)
  )
    return false
  const leftKeys = Reflect.ownKeys(left)
  const rightKeys = Reflect.ownKeys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => {
    const leftField = Object.getOwnPropertyDescriptor(left, key)
    const rightField = Object.getOwnPropertyDescriptor(right, key)
    return (
      leftField !== undefined &&
      rightField !== undefined &&
      "value" in leftField &&
      "value" in rightField &&
      leftField.enumerable === rightField.enumerable &&
      equalPlainData(leftField.value, rightField.value)
    )
  })
}

const MaybeScope = Schema.Union([Nat, Schema.Null])
const Scopes = boundedArray(MaybeScope, 2048)
const StateFields = { before: Schema.Unknown, after: Schema.Unknown }
const CanonicalFrame = Schema.Struct({
  kind: Schema.Literal("canonical"),
  time: Nat,
  ...StateFields,
  event: Schema.Unknown,
  result: Schema.Unknown,
  outputScopes: Scopes,
  receipt: Schema.Unknown
})
const GraphFrame = Schema.Struct({
  kind: Schema.Literal("graph"),
  time: Nat,
  ...StateFields,
  key: Schema.Struct({
    $: Schema.Literal("Types.GraphKey"),
    partition: PositiveNat,
    lifetime: PositiveNat,
    round: PositiveNat,
    operation: PositiveNat,
    unit: Nat
  }),
  position: Nat,
  event: Schema.Unknown,
  graph: Schema.Struct({ before: Schema.Unknown, after: Schema.Unknown, command: Schema.Unknown })
})
const CallbackFrame = Schema.Struct({
  kind: Schema.Literal("callback"),
  time: Nat,
  ...StateFields,
  target: Schema.Unknown,
  action: Schema.Unknown,
  result: Schema.Unknown
})
const LifecycleFrame = Schema.Struct({
  kind: Schema.Literal("lifecycle"),
  ...StateFields,
  partition: PositiveNat,
  action: Schema.Struct({ $: Schema.Literal("AdviceeLifecycle.Disconnect") })
})
const SourceFrame = Schema.Struct({ kind: Schema.Literal("source"), time: Nat, event: Schema.Unknown })
const FrameSchema = Schema.Union([CanonicalFrame, GraphFrame, CallbackFrame, LifecycleFrame, SourceFrame])
const readFrame = decoder(FrameSchema)
const readScenario = decoder(
  Schema.Struct({
    frames: boundedArray(Schema.Unknown, 2048),
    endpoint: Schema.Struct({
      time: Nat,
      projection: Schema.Unknown,
      targets: boundedArray(Schema.Unknown, 2048),
      lifecycles: Schema.Unknown
    })
  })
)
const readScenarios = decoder(boundedArray(Schema.Unknown, 2048))
const canonicalEvent = decoder(CanonicalEventSchema)
const actionSchema = Schema.Union([
  Schema.Struct({ $: Schema.Literal("Callbacks.Hold") }),
  Schema.Struct({ $: Schema.Literal("Callbacks.Release") }),
  Schema.Struct({ $: Schema.Literal("Callbacks.Drop") }),
  Schema.Struct({ $: Schema.Literal("Callbacks.Duplicate") }),
  Schema.Struct({ $: Schema.Literal("Callbacks.Reorder") })
])
const readAction = decoder(actionSchema)
const readResult = decoder(
  Schema.Union([
    Schema.Struct({ $: Schema.Literal("Callbacks.Applied") }),
    Schema.Struct({ $: Schema.Literal("Callbacks.Missing") }),
    Schema.Struct({ $: Schema.Literal("Callbacks.NotQueued") }),
    Schema.Struct({ $: Schema.Literal("Callbacks.NotHeld") })
  ])
)
const actions = {
  "Callbacks.Hold": "hold",
  "Callbacks.Release": "release",
  "Callbacks.Drop": "drop",
  "Callbacks.Duplicate": "duplicate",
  "Callbacks.Reorder": "reorder"
} as const
const results = {
  "Callbacks.Applied": "applied",
  "Callbacks.Missing": "missing",
  "Callbacks.NotQueued": "notQueued",
  "Callbacks.NotHeld": "notHeld"
} as const

/** Round-trip through the existing representation owner rejects excess nested
 * fields too. No eligibility or request/lifecycle policy is recomputed here. */
export function decodePrefixCanonicalEvent(value: unknown) {
  const encoded = encodeCanonicalEvent(canonicalEvent(decodeDriverEvent(value)))
  if (!equalPlainData(value, encoded)) throw new TypeError("non-exact canonical event representation")
  return encoded
}
export function decodePrefixGraphEvent(value: unknown) {
  const raw = readRecord(value)
  let publicEvent: unknown
  switch (raw.$) {
    case "ImportGraph.Root":
      publicEvent = {
        kind: "root",
        target: raw.target,
        sourceBytes: raw.source_bytes,
        treeBytes: raw.tree_bytes,
        localWork: raw.local_work,
        edges: readBendList(raw.edges, readNat, 128)
      }
      break
    case "ImportGraph.Next":
      publicEvent = { kind: "next" }
      break
    case "ImportGraph.Resolved": {
      const result = readRecord(raw.result).$
      const names = {
        "ImportGraph.Found": "found",
        "ImportGraph.NotFound": "missing",
        "ImportGraph.Many": "ambiguous",
        "ImportGraph.Unhandled": "unsupported"
      } as const
      if (
        result !== "ImportGraph.Found" &&
        result !== "ImportGraph.NotFound" &&
        result !== "ImportGraph.Many" &&
        result !== "ImportGraph.Unhandled"
      )
        throw new TypeError("unknown graph resolution")
      publicEvent = { kind: "resolved", target: raw.target, result: names[result] }
      break
    }
    case "ImportGraph.PathChecked":
      publicEvent = { kind: "pathChecked", allowed: raw.allowed }
      break
    case "ImportGraph.Captured":
      publicEvent = {
        kind: "captured",
        sourceBytes: raw.source_bytes,
        treeBytes: raw.node_bytes,
        localWork: raw.local_work,
        edges: readBendList(raw.edges, readNat, 128)
      }
      break
    case "ImportGraph.CaptureFailed":
      publicEvent = { kind: "captureFailed" }
      break
    case "ImportGraph.DeadlineReached":
      publicEvent = { kind: "deadlineReached" }
      break
    default:
      throw new TypeError("unknown graph event")
  }
  const encoded = encodeImportGraphEvent(decodeGraphEvent(publicEvent))
  if (!equalPlainData(value, encoded)) throw new TypeError("non-exact graph event representation")
  return encoded
}

/** The comparison preserves all canonical projection fields, complete events,
 * outputs/rejections, graph facts/state/outputs, command ownership and original
 * callback receipts. Presentation labels, private job maps and display counters
 * are excluded; physical resources and output membership remain in projection. */
export function callbackPublicBoundary(
  observation: RunObservation,
  controls: readonly unknown[],
  sources: readonly unknown[],
  frames: RunObservation["observations"] = observation.observations
) {
  return freezeCanonicalData({
    frames: frames.map((frame) => {
      if (frame.preparation) {
        const prepared = frame.preparation
        return {
          kind: "graph",
          time: frame.time,
          before: frame.before,
          after: frame.after,
          scope: {
            partition: prepared.event.partition,
            lifetime: prepared.event.lifetime,
            round: prepared.event.round,
            operation: prepared.event.operation,
            unit: prepared.event.unit
          },
          position: prepared.event.step,
          event: encodeImportGraphEvent(prepared.event.fact),
          graph: { before: prepared.before, after: prepared.after, command: prepared.command }
        }
      }
      return {
        kind: "canonical",
        time: frame.time,
        before: frame.before,
        after: frame.after,
        event: encodeCanonicalEvent(canonicalEvent(frame.event)),
        outputs: frame.outputs,
        outputScopes: (frame.outputScopes ?? []).map((scope) => scope ?? null),
        rejection: frame.rejection ?? null,
        receipt: frame.callbackReceipt?.target ?? null
      }
    }),
    controls,
    sources,
    endpoint: {
      time: observation.now,
      projection: observation.projection,
      targets: observation.callbackTargets,
      lifecycles: observation.adviceeLifecycles
    }
  })
}

export function decodeCallbackNativeBoundary(value: unknown) {
  return freezeCanonicalData(
    readScenarios(value).map((value) => {
      const scenario = readScenario(value)
      const frames: unknown[] = [],
        controls: unknown[] = [],
        sources: unknown[] = []
      let controlSequence = 0
      for (const input of scenario.frames) {
        const frame = readFrame(input)
        if (frame.kind === "source") {
          sources.push({ time: frame.time, event: decodePrefixCanonicalEvent(frame.event) })
          controlSequence++
          continue
        }
        const before = projectTrustedCanonical(frame.before),
          after = projectTrustedCanonical(frame.after)
        if (frame.kind === "callback") {
          const target = decodeCallbackTarget(frame.target),
            action = actions[readAction(frame.action).$]
          const control = validateCallbackControl({ kind: "callback", target, action })
          controls.push({
            time: frame.time,
            sequence: controlSequence++,
            before,
            after,
            control,
            result: results[readResult(frame.result).$]
          })
        } else if (frame.kind === "lifecycle") {
          controls.push({
            before,
            after,
            control: { kind: "adviceeLifecycle", partition: frame.partition, action: "disconnect" }
          })
          controlSequence++
        } else if (frame.kind === "canonical") {
          const result = decodeTrustedCanonicalStep(frame.result)
          frames.push({
            kind: "canonical",
            time: frame.time,
            before,
            after,
            event: decodePrefixCanonicalEvent(frame.event),
            outputs: result.outputs,
            outputScopes: frame.outputScopes,
            rejection: result.rejection ?? null,
            receipt: frame.receipt === null ? null : decodeCallbackTarget(frame.receipt)
          })
        } else {
          const graph = decodeImportGraphStep({
            $: "ImportGraph.BoundedStep",
            state: frame.graph.after,
            command: frame.graph.command
          })
          const { $: _tag, ...scope } = frame.key
          frames.push({
            kind: "graph",
            time: frame.time,
            before,
            after,
            scope,
            position: frame.position,
            event: decodePrefixGraphEvent(frame.event),
            graph: {
              before: projectImportGraph(frame.graph.before),
              after: projectImportGraph(graph.state),
              command: graph.command
            }
          })
        }
      }
      return {
        frames,
        controls,
        sources,
        endpoint: {
          time: scenario.endpoint.time,
          projection: projectTrustedCanonical(scenario.endpoint.projection),
          targets: scenario.endpoint.targets.map(decodeCallbackTarget),
          lifecycles: decodeAdviceeLifecycles(scenario.endpoint.lifecycles)
        }
      }
    })
  )
}
