import type { Protocol, ForeignReply, ForeignCommand } from "@hapsland/canonical-policy/canonical/child-execution"
import { unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import snapshot from "./freshness-core.js"
import publication from "./publication-core.js"
import type * as Snapshot from "./freshness-core.js"
import type * as Publication from "./publication-core.js"
import type { FreshnessInput, FreshnessPorts, FreshnessExecution, FreshnessResult } from "./contract.ts"
import type { EvaluatedUnit } from "../evaluation/contract.ts"
import type { Finding } from "@hapsland/delivery-output/direct-event/output"

type State =
  | { readonly kind: "snapshot"; readonly step: Snapshot.Step }
  | { readonly kind: "publication"; readonly step: Publication.Step }
type Query = Snapshot.Query | Publication.Query
type NativeQuery =
  | Exclude<Query, { readonly $: "RetentionQuery" }>
  | Extract<Publication.Query, { readonly $: "RetentionQuery" }>["query"]
type Response = Snapshot.Response | Exclude<Publication.Response, { readonly $: "RetentionResponse" }>
type Binding = ReturnType<typeof createBinding>
export type FreshnessInvocation = { readonly invocation: bigint; readonly freshness: FreshnessInput }
export type FreshnessMachine = ReturnType<typeof createFreshnessMachine>
export type FreshnessContinuation = {
  readonly kind: "freshness"
  readonly machine: FreshnessMachine
  readonly binding: Binding
  readonly state: State
}
export type FreshnessRequest = {
  readonly invocation: bigint
  readonly id: bigint
  readonly held: FreshnessContinuation
}
export type FreshnessReply = {
  readonly $: "FreshnessReply"
  readonly request: FreshnessRequest
  readonly state: State
  readonly response?: Response
}
export type FreshnessProjection = {
  readonly kind: "freshness"
  readonly view:
    | { readonly $: "Types.AwaitService"; readonly request: FreshnessRequest }
    | { readonly $: "FreshnessFinished"; readonly result: FreshnessResult }
}
export type FreshnessSession = {
  readonly invocation: number
  readonly input: FreshnessInvocation
  readonly machine: FreshnessMachine
  revoke(): void
  close(): void
}

const importedResponse = (value: Response): Extract<Publication.Response, { readonly $: "RetentionResponse" }> => {
  switch (value.$) {
    case "Handle":
      return { $: "RetentionResponse", response: { $: "PublicationRetention.Handle", value: value.value } }
    case "Flag":
      return { $: "RetentionResponse", response: { $: "PublicationRetention.Flag", value: value.value } }
    case "Count":
      return { $: "RetentionResponse", response: { $: "PublicationRetention.Count", value: value.value } }
    case "End":
      return { $: "RetentionResponse", response: { $: "PublicationRetention.End" } }
    case "Missing":
      return { $: "RetentionResponse", response: { $: "PublicationRetention.Missing" } }
    case "Acknowledged":
      throw new TypeError("Unexpected retention acknowledgment")
  }
}
const snapshotResponse = (value: Response): Snapshot.Response => {
  if (value.$ === "End" || value.$ === "Acknowledged") throw new TypeError("Unexpected snapshot reply")
  return value
}
const advance = (state: State, response: Response): State => {
  if (state.step.$ !== "Await") throw new TypeError("Freshness reply has no boundary")
  const frame = state.step.frame
  if (state.kind === "snapshot") {
    return {
      ...state,
      step: snapshot.resume(state.step, {
        $: "Reply",
        invocation: frame.invocation,
        request: frame.request,
        response: snapshotResponse(response)
      })
    }
  }
  const encoded = state.step.query.$ === "RetentionQuery" ? importedResponse(response) : response
  return {
    ...state,
    step: publication.resume(state.step, {
      $: "Reply",
      invocation: frame.invocation,
      request: frame.request,
      response: encoded
    })
  }
}
const disposition = (state: State) =>
  state.kind === "snapshot" ? snapshot.boundary(state.step).$ : publication.boundary(state.step).$
const nativeQuery = (query: Query): NativeQuery => (query.$ === "RetentionQuery" ? query.query : query)

// Invocation-local original values, not serialized product state. Cancellation
// revokes acceptance; final session close clears these only after lease settlement.
function createBinding(input: FreshnessInput, ports: FreshnessPorts) {
  const values = new Map<bigint, unknown>()
  let nextHandle = 0n
  let liveInput: FreshnessInput | undefined = input
  let activeIterator: Generator<unknown, void, unknown> | undefined
  let iteratorBody = false
  const store = (value: unknown) => {
    const id = nextHandle++
    values.set(id, value)
    return id
  }
  const value = (id: bigint) => values.get(id)
  const read = (lens: Pick<Snapshot.Lens, "object" | "fields">): unknown =>
    unlist(lens.fields).reduce<unknown>((held, key) => (held as Record<string, unknown>)[key], value(lens.object))
  const requiredInput = () => {
    if (!liveInput) throw new TypeError("Closed freshness invocation")
    return liveInput
  }
  const authority = () => {
    const held = requiredInput()
    if (held.kind !== "publication" || held.authority === undefined)
      throw new TypeError("Missing publication authority")
    return held.authority
  }
  const iterator = function* (array: unknown): Generator<unknown, void, unknown> {
    for (const item of array as Iterable<unknown>) yield item
  }
  const primitive = (query: NativeQuery): Response => {
    switch (query.$) {
      case "Read":
      case "PublicationRetention.Read":
        return { $: "Handle", value: store(read(query.value)) }
      case "Truthy":
        return { $: "Flag", value: !!read(query.value) }
      case "Equal":
      case "PublicationRetention.Equal":
        return { $: "Flag", value: read(query.left) === read(query.right) }
      case "EqualValues":
        return { $: "Flag", value: value(query.left) === value(query.right) }
      case "TextIs":
        return { $: "Flag", value: read(query.value) === query.expected }
      case "CanonicalEqual":
        return {
          $: "Flag",
          value: query.review_input
            ? ports.sameInput(read(query.left), read(query.right))
            : ports.serialize(read(query.left)) === ports.serialize(read(query.right))
        }
      case "AdviceeEqual": {
        const left = read(query.left),
          right = read(query.right)
        return { $: "Flag", value: ports.serialize(left) === ports.serialize(right) }
      }
      case "Identity":
        return { $: "Handle", value: store(ports.semanticIdentity(value(query.input))) }
      case "PublicationRetention.InputEqual":
        return { $: "Flag", value: ports.sameInput(value(query.left), value(query.right)) }
      case "Length":
      case "PublicationRetention.Length":
        return { $: "Count", value: BigInt((value(query.array) as { length: number }).length) }
      case "Element":
      case "PublicationRetention.Element": {
        const array = value(query.array) as Record<string, unknown>
        const index = query.index.toString()
        return index in array ? { $: "Handle", value: store(array[index]) } : { $: "Missing" }
      }
      case "NewMap":
        return { $: "Handle", value: store(new Map<unknown, unknown>()) }
      case "NewSet":
        return { $: "Handle", value: store(new Set<unknown>()) }
      case "MapGet": {
        const found = (value(query.map) as Map<unknown, unknown>).get(value(query.key))
        return found == null ? { $: "Missing" } : { $: "Handle", value: store(found) }
      }
      case "SetAdd":
        ;(value(query.set) as Set<unknown>).add(value(query.value))
        return { $: "Acknowledged" }
      case "MapSet":
        ;(value(query.map) as Map<unknown, unknown>).set(value(query.key), value(query.value))
        return { $: "Acknowledged" }
      case "Iterator":
      case "PublicationRetention.Iterator":
        return { $: "Handle", value: store(iterator(value(query.array))) }
      case "IteratorNext":
      case "PublicationRetention.IteratorNext": {
        iteratorBody = false
        activeIterator = value(query.iterator) as Generator<unknown, void, unknown>
        const next = activeIterator.next()
        iteratorBody = !next.done
        return next.done ? { $: "End" } : { $: "Handle", value: store(next.value) }
      }
      case "StatusReady":
        return { $: "Flag", value: (value(query.outcome) as { status: unknown }).status === "ready" }
      case "FreshArray":
        return { $: "Handle", value: store(unlist(query.values).map(value)) }
      case "PublicationRetention.CurrentMethod":
        return { $: "Handle", value: store(authority().isCurrentWork) }
      case "PublicationRetention.IsArray":
        return { $: "Flag", value: Array.isArray(value(query.value)) }
      case "VerifyRoot":
      case "Prepare":
      case "PublicationRetention.CurrentWork":
        throw new TypeError("IO query offered as primitive")
    }
  }
  const begin = (
    query: NativeQuery,
    execution: FreshnessExecution
  ): { readonly pending: Promise<unknown>; readonly encode: (raw: unknown) => Response } => {
    switch (query.$) {
      case "VerifyRoot":
        return {
          pending: ports.verifyRoot(value(query.observation) as FreshnessInput["observation"], execution),
          encode: (raw) => ({ $: "Flag", value: !!raw })
        }
      case "Prepare": {
        const names =
          typeof query.names === "bigint"
            ? (value(query.names) as ReadonlyMap<string, ReadonlySet<string>>)
            : query.names.$ === "Nil"
              ? undefined
              : new Map(
                  unlist(query.names).map((name) => [value(name.path) as string, new Set([value(name.name) as string])])
                )
        return {
          pending: ports.prepare(requiredInput(), names, execution),
          encode: (raw) => ({ $: "Handle", value: store(raw) })
        }
      }
      case "PublicationRetention.CurrentWork":
        return {
          pending: ports.currentWork(value(query.method), authority(), value(query.prepared), execution),
          encode: (raw) => ({ $: "Flag", value: !!raw })
        }
      default:
        throw new TypeError("Primitive query offered as IO")
    }
  }
  return {
    get retainedHandles() {
      return values.size
    },
    close() {
      liveInput = undefined
      activeIterator = undefined
      values.clear()
    },
    initial(invocation: bigint): State {
      const held = requiredInput()
      const observation = store(held.observation),
        context = store(held.context)
      if (held.kind === "publication")
        return {
          kind: "publication",
          step: publication.initial(invocation, {
            $: "Input",
            observation,
            context,
            evaluations: store(held.evaluations),
            authority: held.authority !== undefined
          })
        }
      return {
        kind: "snapshot",
        step: snapshot.initial(invocation, {
          $: "Input",
          observation,
          context,
          prepared: store(held.prepared),
          mode: { $: held.kind === "snapshot-line" ? "SnapshotLine" : "SnapshotUnit" }
        })
      }
    },
    group(request: FreshnessRequest, execution: FreshnessExecution): ForeignReply<FreshnessReply> {
      let state = request.held.state
      const next = (): ForeignCommand<FreshnessReply> => {
        const boundary = disposition(state)
        if (boundary === "TerminalBoundary") return { kind: "terminal", value: { $: "FreshnessReply", request, state } }
        if (state.step.$ !== "Await") throw new TypeError("Invalid freshness command boundary")
        const query = nativeQuery(state.step.query)
        if (boundary === "IoBoundary")
          return {
            kind: "pending",
            start() {
              const engine = begin(query, execution)
              // Encoding only: Canonical's completion resumes the IO continuation.
              return {
                pending: engine.pending,
                map: (raw) => ({ $: "FreshnessReply", request, state, response: engine.encode(raw) })
              }
            }
          }
        if (boundary !== "PrimitiveBoundary") throw new TypeError("Invalid freshness disposition")
        return {
          kind: "primitive",
          perform() {
            try {
              state = advance(state, primitive(query))
            } catch (error) {
              if (iteratorBody) activeIterator?.throw(error)
              throw error
            }
          }
        }
      }
      return { group: { next } }
    },
    accepted(state: State): FreshnessResult | undefined {
      if (state.step.$ !== "Completed") return undefined
      if (state.kind === "snapshot") return { kind: "snapshot", current: state.step.current }
      const status = (
        { Current: "current", Stale: "stale", Unavailable: "unavailable", Unattributed: "unattributed" } as const
      )[state.step.status.$]
      const evaluations = unlist(state.step.evaluations).map((id) => value(id) as EvaluatedUnit)
      const findings = unlist(state.step.findings).map((id) => value(id) as Finding)
      return {
        kind: "publication",
        result: status === "current" ? { status, evaluations, findings } : { status, findings: [] }
      }
    }
  }
}

function createFreshnessMachine(invocation: number, input: FreshnessInput, ports: FreshnessPorts) {
  let ownedInput: FreshnessInput | undefined = input
  const ownedInvocation = BigInt(invocation)
  const binding = createBinding(input, ports)
  return {
    kind: "freshness" as const,
    get retainedHandles() {
      return binding.retainedHandles
    },
    disposeInvocation(_invocation: bigint) {},
    close() {
      ownedInput = undefined
      binding.close()
    },
    initial(input: FreshnessInvocation): FreshnessContinuation {
      if (input.invocation !== ownedInvocation || input.freshness !== ownedInput)
        throw new TypeError("Freshness input replaced its owned invocation")
      return { kind: "freshness", machine: this, binding, state: binding.initial(input.invocation) }
    }
  }
}
export const freshnessProtocol: Protocol<
  FreshnessInvocation,
  FreshnessMachine,
  FreshnessContinuation,
  FreshnessProjection,
  FreshnessRequest,
  FreshnessReply,
  FreshnessResult,
  never,
  FreshnessSession
> = {
  initialSignalCheckpoint: () => "protocol",
  initial: (machine, input) => machine.initial(input),
  view(held) {
    const result = held.binding.accepted(held.state)
    if (result !== undefined) return { kind: "freshness", view: { $: "FreshnessFinished", result } }
    if (held.state.step.$ !== "Await") throw new TypeError("Invalid freshness continuation")
    const { invocation, request: id } = held.state.step.frame
    return { kind: "freshness", view: { $: "Types.AwaitService", request: { invocation, id, held } } }
  },
  resume(held, reply) {
    if (reply.request.held !== held) throw new TypeError("Freshness reply replaced its owned continuation")
    return { ...held, state: reply.response === undefined ? reply.state : advance(reply.state, reply.response) }
  },
  awaitRequest: (projection) => (projection.view.$ === "Types.AwaitService" ? projection.view.request : undefined),
  installation: () => ({ method: "install" }),
  terminal: () => "terminal",
  accepted(projection) {
    if (projection.view.$ !== "FreshnessFinished") throw new TypeError("Freshness was not completed")
    return projection.view.result
  },
  preparation() {
    throw new TypeError("Freshness cannot issue a preparation handoff")
  },
  projectTerminal: (outcome) => outcome
}
export const performFreshnessSync = (
  request: FreshnessRequest,
  execution: FreshnessExecution
): ForeignReply<FreshnessReply> => request.held.binding.group(request, execution)
export function createFreshnessSession(
  invocation: number,
  input: FreshnessInput,
  ports: FreshnessPorts
): FreshnessSession {
  const machine = createFreshnessMachine(invocation, input, ports)
  return {
    invocation,
    input: { invocation: BigInt(invocation), freshness: input },
    machine,
    revoke() {},
    close() {
      machine.close()
    }
  }
}
