import type { StableCapture, CaptureDiagnostic as NativeCaptureDiagnostic } from "@hapsland/native-observation/direct-event/capture"
import type { ReviewUnit } from "@hapsland/source-artifacts/direct-event/artifact-model"
import type { LanguageGraphHost } from "../languages/contracts.ts"
import type { ServiceSession, PerformOptions, Token, Maybe, Variant, Natural } from "./service-contract.ts"

type ResolverInput = Variant<"ResolverInput", {
  readonly invocation: bigint; readonly root_path: string; readonly root_capture: Token<"CaptureToken">;
  readonly root_bytes: bigint; readonly root_name: string; readonly root_source: string;
  readonly branch: Variant<"FunctionBranch" | "TypeBranch">; readonly caller_cache: Maybe<Token<"CacheToken">>;
  readonly limits: { readonly $: "../../../../agent-flow-bend/ImportGraph.Limits"; readonly version: bigint;
    readonly source_bytes: bigint; readonly tree_bytes: bigint; readonly files: bigint; readonly read_bytes: bigint;
    readonly outgoing_edges: bigint; readonly depth: bigint; readonly work: bigint }
}>
type ResolverFailure =
  | Variant<"WrongInvocation" | "WrongCorrelation", { readonly expected: Natural; readonly actual: Natural }>
  | Variant<"NegativeGraphWork", { readonly magnitude: Natural }>
  | Variant<"ForeignProviderFailure" | "RuntimeFailure", { readonly exception: Token<"ExceptionToken"> }>
  | Variant<"WrongReplyKind" | "MalformedReply" | "LocalTraversalFailure" | "InvocationCancelled" | "ReplyAfterTerminal">
type ResolverOutcome = { readonly failure: ResolverFailure } | { readonly result: Variant<"NoReviewUnit"> | Variant<"ReviewUnitResult", { readonly value: ProductValue }> }
type ResolverPorts = {
  readonly observeProduct?: (value: ProductValue) => void
  readonly drive: (session: ServiceSession, input: ResolverInput, options: PerformOptions) => Promise<ResolverOutcome>
  readonly allocateInvocation: () => number
  readonly onConstructionFailure: (invocation: number, cleanup: { readonly session: ServiceSession | undefined; readonly closePending: boolean }) => unknown | Promise<unknown>
}
type NaturalReply<Value> = Value extends readonly (infer Item)[] ? NaturalReply<Item>[] : Value extends object
  ? { [Key in keyof Value]: Key extends "invocation" | "id" | "bytes" ? Value[Key] extends number ? bigint : NaturalReply<Value[Key]> : NaturalReply<Value[Key]> }
  : Value
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

function tagged<Name extends string, Fields extends object>(name: Name, fields: Fields): Variant<Name, Fields> { return { $: `Types.${name}`, ...fields } }
// Only the emitted Nat ABI is converted here; graph decisions remain in Bend.
export function pureReply<Value>(value: Value): NaturalReply<Value> {
  // Mechanical conversion of known emitted Naturals; no parser or graph decision.
  const convert = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(convert)
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        ["invocation", "id", "bytes"].includes(key) && typeof item === "number" ? BigInt(item) : convert(item)
      ])
    )
  return value
  }
  return convert(value) as NaturalReply<Value>
}

export function createBendResolver({ observeProduct, drive: ownedDrive, allocateInvocation, onConstructionFailure }: ResolverPorts) {
  if (
    typeof ownedDrive !== "function" ||
    typeof allocateInvocation !== "function" ||
    typeof onConstructionFailure !== "function"
  )
    throw new Error("Resolver requires its owning Canonical driver")
  const drive = ownedDrive
  return async (path: string, capture: StableCapture, name: string, context: LanguageGraphHost, options: PerformOptions = {}): Promise<ReviewUnit | undefined> => {
    const limits = { ...GRAPH_LIMIT_CEILINGS, ...context.limits }
    const activeInvocation = allocateInvocation()
    let session: ServiceSession | undefined, input: ResolverInput
    try {
      session = createServiceSession({
        invocation: activeInvocation,
        root: context.root,
        now: context.now,
        callerCache: context.captureCache,
        access: (file, { signal } = {}) =>
          Effect.runPromise(
            eligibleNamedPath(
              context.root,
              file,
              contextDirectFilePolicy(context.policy ?? DEFAULT_DIRECT_FILE_POLICY),
              context.rootIdentity
            ),
            { signal }
          ),
        capture: (selected, sourceCap, { signal } = {}) =>
          Effect.runPromise(
            (context.captureSource ?? captureStable)(
              context.root,
              selected,
              context.captureHooks,
              context.rootIdentity,
              sourceCap
            ),
            { signal }
          ),
        frontend: inspectSourceFrontend,
        parseCargo: parseCargoSyntax,
        parsePythonSyntax,
        selectContextPath: (path) =>
          selectedByDirectFilePolicy(path, contextDirectFilePolicy(context.policy ?? DEFAULT_DIRECT_FILE_POLICY)),
        inspectRustModules: inspectRustModuleSyntax,
        diagnostic: context.observeCaptureDiagnostic ? (file, value) => context.observeCaptureDiagnostic?.(file, value as NativeCaptureDiagnostic) : undefined
      })
      input = tagged("ResolverInput", {
        invocation: BigInt(session.invocation),
        root_path: path,
        root_capture: pureReply(session.registerCapture(capture)),
        root_bytes: BigInt(capture.byteLength),
        root_name: name,
        root_source: capture.text,
        branch: tagged(context.branch === "function" ? "FunctionBranch" : "TypeBranch"),
        caller_cache: pureReply(session.callerCache),
        limits: {
          $: "../../../../agent-flow-bend/ImportGraph.Limits",
          version: BigInt(limits.version),
          source_bytes: BigInt(limits.sourceBytes), tree_bytes: BigInt(limits.treeBytes),
          files: BigInt(limits.files), read_bytes: BigInt(limits.readBytes),
          outgoing_edges: BigInt(limits.outgoingEdges), depth: BigInt(limits.depth), work: BigInt(limits.work)
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
        await onConstructionFailure(activeInvocation, { session, closePending })
      } catch (error) {
        failures.push(error)
      }
      if (failures.length === 1) throw original
      throw new AggregateError(failures, "Resolver construction and cleanup failed", { cause: original })
    }
    const outcome = await drive(session, input, options)
    if ("failure" in outcome) throw new Error("Bend resolver technical failure: " + outcome.failure.$)
    if (outcome.result.$ === "Types.NoReviewUnit") return undefined
    observeProduct?.(outcome.result.value)
    // This projection comes from the owning driver and emitted ReviewUnitResult.
    return fromProductValue(outcome.result.value) as ReviewUnit
  }
}

export function createBendEffectResolver(options: ResolverPorts) {
  const resolve = createBendResolver(options)
  return (path: string, capture: StableCapture, name: string, context: LanguageGraphHost) => Effect.promise((signal) => resolve(path, capture, name, context, { signal }))
}
