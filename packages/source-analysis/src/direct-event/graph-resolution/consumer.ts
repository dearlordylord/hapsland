import {
  awaitNativeWork,
  runNativePromise,
  runNativeEffect,
  type NativeFlow,
  type NativeWork
} from "@hapsland/runtime-environment/runtime/native-execution"
import { encodeGraphToken, encodeGraphCache } from "./reply-codec.ts"
import type {
  StableCapture,
  CaptureDiagnostic as NativeCaptureDiagnostic
} from "@hapsland/native-observation/direct-event/capture"
import type { ReviewUnit } from "@hapsland/source-artifacts/direct-event/artifact-model"
import type { LanguageGraphHost } from "../languages/contracts.ts"
import type { ServiceSession, PerformOptions, Variant, ResolverInput, ResolverOutcome } from "./service-contract.ts"

import { fromProductValue, type ProductValue } from "@hapsland/source-artifacts/direct-event/value/codec"
import * as Effect from "effect/Effect"
import { createServiceSession } from "./service-session.ts"
import { inspectSourceFrontend, parseCargoSyntax, inspectRustModuleSyntax, parsePythonSyntax } from "./frontends.ts"
import {
  eligibleNamedPath,
  DEFAULT_DIRECT_FILE_POLICY,
  contextDirectFilePolicy,
  selectedByDirectFilePolicy
} from "@hapsland/native-observation/direct-event/selection"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"

type ResolverBindingPorts = {
  readonly observeProduct?: (value: ProductValue) => void
  readonly drive: (
    session: ServiceSession,
    input: ResolverInput,
    options: PerformOptions
  ) => NativeWork<ResolverOutcome>
  readonly allocateInvocation: () => number
  readonly onConstructionFailure: (
    invocation: number,
    cleanup: { readonly session: ServiceSession | undefined; readonly closePending: boolean }
  ) => unknown | Promise<unknown>
}

type ResolverPorts = Omit<ResolverBindingPorts, "drive"> & {
  readonly drive: (session: ServiceSession, input: ResolverInput, options: PerformOptions) => Promise<ResolverOutcome>
}
type EffectResolverPorts = Omit<ResolverBindingPorts, "drive"> & {
  /** Resident shared leases need independently cancellable native IO; direct
   * public callbacks keep the caller fiber unless their binding selects it.
   */
  readonly physicalEffect?: typeof import("@hapsland/runtime-environment/runtime/native-execution").withNativeSignal
  readonly drive: (
    session: ServiceSession,
    input: ResolverInput,
    options: PerformOptions
  ) => Effect.Effect<ResolverOutcome>
}

function tagged<Name extends string, Fields extends object>(name: Name, fields: Fields): Variant<Name, Fields> {
  return { $: `Types.${name}`, ...fields }
}

/**
 * Bind graph resolution to its Canonical owner. The owner allocates each
 * invocation, drives commands/replies, accepts the terminal result and settles
 * native resources. Construction failures return custody to that same owner.
 * Drive must reject with opaque provider errors before closing session resources;
 * remaining protocol failures reject with their named technical error.
 * The returned resolver projects only the accepted emitted ReviewUnitResult.
 */
function createResolverFlow(
  {
    observeProduct,
    drive: ownedDrive,
    allocateInvocation,
    onConstructionFailure,
    physicalEffect
  }: ResolverBindingPorts & Pick<EffectResolverPorts, "physicalEffect">,
  effects: boolean
) {
  if (
    typeof ownedDrive !== "function" ||
    typeof allocateInvocation !== "function" ||
    typeof onConstructionFailure !== "function"
  )
    throw new Error("Resolver requires its owning Canonical driver")
  const drive = ownedDrive
  const runPhysical = <A, E, R>(effect: Effect.Effect<A, E, R>, signal?: AbortSignal) =>
    physicalEffect === undefined ? effect : physicalEffect(effect, signal)
  return function* (
    path: string,
    capture: StableCapture,
    name: string,
    context: LanguageGraphHost,
    options: PerformOptions = {}
  ): NativeFlow<ProductValue | undefined> {
    const limits = { ...GRAPH_LIMIT_CEILINGS, ...context.limits }
    const activeInvocation = allocateInvocation()
    let session: ServiceSession | undefined, input: ResolverInput
    try {
      session = createServiceSession({
        invocation: activeInvocation,
        root: context.root,
        now: context.now,
        callerCache: context.captureCache,
        access: (file, { signal } = {}) => {
          const effect = eligibleNamedPath(
            context.root,
            file,
            contextDirectFilePolicy(context.policy ?? DEFAULT_DIRECT_FILE_POLICY),
            context.rootIdentity
          )
          return effects ? runPhysical(effect, signal) : Effect.runPromise(effect, { signal })
        },
        capture: (selected, sourceCap, { signal } = {}) => {
          const effect = (context.captureSource ?? captureStable)(
            context.root,
            selected,
            context.captureHooks,
            context.rootIdentity,
            sourceCap
          )
          return effects ? runPhysical(effect, signal) : Effect.runPromise(effect, { signal })
        },
        frontend: inspectSourceFrontend,
        parseCargo: parseCargoSyntax,
        parsePythonSyntax,
        readGoConfiguration: () => context.analysisConfiguration?.go,
        readAnalysisConfigurationIdentity: () => context.analysisConfigurationIdentity,
        selectContextPath: (path) =>
          selectedByDirectFilePolicy(path, contextDirectFilePolicy(context.policy ?? DEFAULT_DIRECT_FILE_POLICY)),
        inspectRustModules: inspectRustModuleSyntax,
        diagnostic: context.observeCaptureDiagnostic
          ? (file, value) => context.observeCaptureDiagnostic?.(file, value as NativeCaptureDiagnostic)
          : undefined
      })
      input = tagged("ResolverInput", {
        invocation: Number(BigInt(session.invocation)),
        root_path: path,
        root_capture: encodeGraphToken(session.registerCapture(capture)),
        root_bytes: Number(BigInt(capture.byteLength)),
        root_name: name,
        root_source: capture.text,
        branch: tagged(context.branch === "function" ? "FunctionBranch" : "TypeBranch", {}),
        caller_cache: encodeGraphCache(session.callerCache),
        limits: {
          $: "../../../../agent-flow-bend/ImportGraph.Limits",
          version: Number(BigInt(limits.version)),
          source_bytes: Number(BigInt(limits.sourceBytes)),
          tree_bytes: Number(BigInt(limits.treeBytes)),
          files: Number(BigInt(limits.files)),
          read_bytes: Number(BigInt(limits.readBytes)),
          outgoing_edges: Number(BigInt(limits.outgoingEdges)),
          depth: Number(BigInt(limits.depth)),
          work: Number(BigInt(limits.work))
        }
      })
    } catch (original) {
      const failures = [original]
      let closePending = false
      try {
        session?.close()
      } catch (error) {
        closePending = true
        failures.push(error)
      }
      try {
        yield* awaitNativeWork(Promise.resolve(onConstructionFailure(activeInvocation, { session, closePending })))
      } catch (error) {
        failures.push(error)
      }
      if (failures.length === 1) throw original
      throw new AggregateError(failures, "Resolver construction and cleanup failed", { cause: original })
    }
    const outcome = yield* awaitNativeWork(drive(session, input, options))
    if ("failure" in outcome) throw new Error("Bend resolver technical failure: " + outcome.failure.$)
    if (outcome.result.$ === "Types.NoReviewUnit") return undefined
    observeProduct?.(outcome.result.value)
    // Preserve the accepted owner-produced tree across Bend capability handoffs.
    return outcome.result.value
  }
}

export function createBendResolver(options: ResolverPorts) {
  const resolve = createResolverFlow(options, false)
  function* native(...args: Parameters<typeof resolve>): NativeFlow<ReviewUnit | undefined> {
    const value = yield* resolve(...args)
    return value === undefined ? undefined : (fromProductValue(value) as ReviewUnit)
  }
  return (
    path: string,
    capture: StableCapture,
    name: string,
    context: LanguageGraphHost,
    execution: PerformOptions = {}
  ) => runNativePromise(native(path, capture, name, context, execution))
}

// Internal Effect consumers retain the accepted ProductValue until public decode.
export function createBendEffectResolver(options: EffectResolverPorts) {
  const resolve = createResolverFlow(options, true)
  return (
    path: string,
    capture: StableCapture,
    name: string,
    context: LanguageGraphHost,
    execution: PerformOptions = {}
  ) =>
    Effect.suspend(() => {
      const interruption = new AbortController()
      const signal = execution.signal ? AbortSignal.any([execution.signal, interruption.signal]) : interruption.signal
      return runNativeEffect(resolve(path, capture, name, context, { ...execution, signal }), () =>
        interruption.abort()
      )
    })
}

// Host resource custody and encoded service replies; continuation authority stays with Canonical.
export {
  createServiceRegistry as createGraphServiceRegistry,
  performGraphServiceRequest,
  performGraphServiceEffect,
  performGraphServiceFlow
} from "./service-session.ts"

export type { GraphServiceReply } from "./service-session.ts"

// Public contract belongs to Graph; private compiled ABIs resolve its declaration closure.
export type {
  ResolverInput,
  ResolverFailure,
  ResolverOutcome,
  Request,
  Reply,
  ServiceOutcome
} from "./service-contract.ts"
