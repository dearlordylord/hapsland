import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import canonicalOwner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { createChildExecutionDriver } from "@hapsland/canonical-policy/canonical/child-execution"
import type { Protocol, ForeignOptions } from "@hapsland/canonical-policy/canonical/child-execution"
import { createNativeSessionRegistry } from "@hapsland/runtime-environment/runtime/native-session-registry"
import {
  REVIEW_PROVIDERS,
  ReviewProviderId,
  type ReviewBackendSettings
} from "@hapsland/runtime-environment/runtime/backend"
import { list } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { ProviderIdentity } from "./provider-identity-contract.ts"
import compiledCore from "./provider-finalization-core.js"
import type { Selection, Declaration, Maybe, Reply, Step } from "./provider-finalization-core.js"

const backend = "../../../runtime-environment/src/runtime/backend/Backend."
const maybe = <A>(value: A | undefined): Maybe<A> => (value === undefined ? { $: "None" } : { $: "Some", value })
const encodeSelection = (selection: ReviewBackendSettings): Selection => ({
  $: `${backend}Selection`,
  provider: selection.provider,
  model: "model" in selection ? { $: `${backend}Supplied`, value: maybe(selection.model) } : { $: `${backend}Missing` },
  fields: list(
    Object.entries(selection).flatMap(([name, value]) =>
      typeof value === "string" ? [{ $: `${backend}Field` as const, name, value }] : []
    )
  )
})
const encodeCatalog = (catalog: typeof REVIEW_PROVIDERS) =>
  list<Declaration>(
    Object.values(catalog).map((provider) => ({
      $: `${backend}Declaration`,
      id: provider.id,
      default_model: maybe(provider.defaultModel),
      destination: provider.destination
    }))
  )
type Settled = Exclude<Step, { readonly $: "Continue" }>
type Terminal = Exclude<Settled, { readonly $: "EncodeComponent" }>
type Input = {
  readonly invocation: number
  readonly selection: Selection
  readonly catalog: ReturnType<typeof encodeCatalog>
}
type Request = { readonly invocation: number; readonly id: number; readonly value: string }
type Continuation = { readonly machine: ProviderMachine; readonly step: Settled }
type Projection = {
  readonly kind: "provider"
  readonly view: Terminal | { readonly $: "EncodeComponent"; readonly request: Request }
}
export type ProviderIdentitySession = {
  readonly invocation: number
  encodingError: URIError | undefined
  close(): void
  revoke(): void
}

type Session = ProviderIdentitySession

// Advancing a pure Bend continuation is mechanical; it cannot publish, launch
// an engine request or accept a result. Those transitions belong to Canonical.
const createProviderMachine = (engine: typeof compiledCore) => {
  const pump = (initial: Step): Settled => {
    let step = initial
    while (step.$ === "Continue") step = engine.advance(step.state)
    return step
  }
  const machine = {
    initial(input: Input): Continuation {
      return { machine, step: pump(engine.initial_selection(input.invocation, input.selection, input.catalog)) }
    },
    resume(held: Continuation, reply: Reply): Continuation {
      return { machine, step: pump(engine.resume(held.step, reply)) }
    },
    disposeInvocation() {},
    retainedHandles: 0
  }
  return machine
}
type ProviderMachine = ReturnType<typeof createProviderMachine>
const protocol: Protocol<Input, ProviderMachine, Continuation, Projection, Request, Reply, Terminal, never, Session> = {
  initial: (engine, input) => engine.initial(input),
  view: (held) => ({
    kind: "provider",
    view:
      held.step.$ === "EncodeComponent"
        ? {
            $: "EncodeComponent",
            request: { invocation: held.step.state.invocation, id: held.step.state.request, value: held.step.value }
          }
        : held.step
  }),
  resume: (held, reply) => held.machine.resume(held, reply),
  awaitRequest: (projected) => (projected.view.$ === "EncodeComponent" ? projected.view.request : undefined),
  installation: () => ({ method: "install" }),
  terminal: () => "terminal",
  accepted(projected) {
    if (projected.view.$ === "EncodeComponent") throw new TypeError("Provider encoding has no terminal result")
    return projected.view
  },
  preparation() {
    throw new TypeError("Provider identity cannot launch preparation")
  },
  projectTerminal(outcome, session) {
    if ("$" in outcome) {
      if (outcome.$ === "TypeError") throw new TypeError(outcome.message)
      if (outcome.$ === "URIError") {
        if (!session.encodingError) throw new TypeError("Missing provider URI engine error")
        throw session.encodingError
      }
      if (outcome.$ === "InvalidReply") throw new TypeError("Invalid provider identity reply")
    }
    return outcome
  }
}

export type ProviderIdentityPorts = {
  readonly owner: typeof canonicalOwner
  readonly core: typeof compiledCore
  readonly catalog: typeof REVIEW_PROVIDERS
  readonly createRegistry: () => ReturnType<typeof createNativeSessionRegistry<Session>>
  readonly encodeComponent: (value: string, signal?: AbortSignal) => string | Promise<string>
}
const makeExecution = (selection: ReviewBackendSettings, ports: ProviderIdentityPorts) => {
  const { owner, core, catalog, createRegistry, encodeComponent } = ports
  const encodedSelection = encodeSelection(selection)
  const encodedCatalog = encodeCatalog(catalog)
  const machine = createProviderMachine(core)
  const registry = createRegistry()
  let encodingError: URIError | undefined
  const driver = createChildExecutionDriver({
    owner,
    initialState: owner.initial_limits(1, 1, 1, 1),
    registry,
    machine,
    protocol,
    async foreign(requests: readonly Request[], execution: ForeignOptions): Promise<Reply> {
      if (requests.length !== 1) throw new TypeError("Provider identity requires one encoding request")
      const request = requests[0]
      if (!request) throw new TypeError("Missing provider encoding request")
      try {
        return {
          $: "Encoded",
          invocation: request.invocation,
          request: request.id,
          value: await encodeComponent(request.value, execution.signal)
        }
      } catch (error) {
        if (!(error instanceof URIError)) throw error
        encodingError = error
        return { $: "EncodingFailed", invocation: request.invocation, request: request.id }
      }
    }
  })
  const invocation = driver.allocateSettingsInvocation()
  const session: Session = {
    invocation,
    get encodingError() {
      return encodingError
    },
    set encodingError(value) {
      encodingError = value
    },
    close() {
      encodingError = undefined
    },
    revoke() {}
  }
  let active: ReturnType<typeof driver.drive> | undefined
  const run = (signal: AbortSignal) => {
    active = driver.drive(
      session,
      { invocation: Number(BigInt(invocation)), selection: encodedSelection, catalog: encodedCatalog },
      { signal }
    )
    return active
  }
  const accepted = (outcome: Awaited<ReturnType<typeof driver.drive>>): ProviderIdentity => {
    if (!("$" in outcome) || outcome.$ !== "Completed")
      throw new TypeError("Canonical did not accept provider identity")
    const provider = Schema.decodeUnknownSync(ReviewProviderId)(outcome.identity.provider)
    return {
      provider,
      model: Schema.decodeUnknownSync(catalog[provider].model)(outcome.identity.model),
      destination: outcome.identity.destination
    }
  }
  const retire = (exit: Exit.Exit<unknown, unknown>) => {
    const cancel = Effect.sync(() => {
      const child = owner.find(Number(BigInt(invocation)), driver.state.children)
      if (child.$ === "Some" && owner.child_active(child.value)) driver.cancel(invocation)
    })
    const settle = Effect.promise(async () => {
      if (active) {
        try {
          await active
        } catch (error) {
          // A task defect already observed by use must not be appended again.
          if (
            !Exit.isFailure(exit) ||
            !exit.cause.reasons.some((reason) => reason._tag === "Die" && reason.defect === error)
          )
            throw error
        }
      }
    })
    const cleanup = Effect.promise(async () => {
      await registry.retryCleanup()
      if (registry.size || registry.pendingCleanup || Object.values(driver.resources).some((value) => value !== 0))
        throw new Error("Provider identity resources did not settle")
    })
    return cancel.pipe(Effect.ensuring(settle.pipe(Effect.ensuring(cleanup))))
  }
  return { run, accepted, retire }
}

// Construction and selection evaluation remain lazy. Release joins the actual
// running invocation after cancellation before caller resource lifetime ends.
export const createProviderIdentityResolver = ({
  owner = canonicalOwner,
  core = compiledCore,
  catalog = REVIEW_PROVIDERS,
  createRegistry = createNativeSessionRegistry<Session>,
  encodeComponent = encodeURIComponent
}: Partial<ProviderIdentityPorts> = {}) => {
  const ports: ProviderIdentityPorts = { owner, core, catalog, createRegistry, encodeComponent }
  return Effect.fn("ReviewProvider.identity")(function* (selection: ReviewBackendSettings) {
    return yield* Effect.acquireUseRelease(
      Effect.sync(() => makeExecution(selection, ports)),
      (execution) => Effect.promise(execution.run).pipe(Effect.map(execution.accepted)),
      (execution, exit) => execution.retire(exit)
    )
  })
}

export const resolveProviderIdentity = createProviderIdentityResolver()
