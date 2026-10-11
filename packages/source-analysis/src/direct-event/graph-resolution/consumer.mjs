import { artifactValueTag, fromProductValue } from "@hapsland/source-artifacts/direct-event/value/codec"
import * as Effect from "effect/Effect"
import { createServiceSession } from "./service-session.mjs"
import { inspectSourceFrontend, parseCargoSyntax, inspectRustModuleSyntax, parsePythonSyntax } from "./frontends.ts"
import {
  eligibleNamedPath,
  DEFAULT_DIRECT_FILE_POLICY,
  contextDirectFilePolicy,
  selectedByDirectFilePolicy
} from "../../../../native-observation/dist/direct-event/selection.js"
import { captureStable } from "../../../../native-observation/dist/direct-event/capture.js"
import { GRAPH_LIMIT_CEILINGS } from "../../../../canonical-policy/dist/canonical/graph-limits.js"

const tagged = (name, fields = {}) => ({ $: artifactValueTag(name) ?? "Types." + name, ...fields })
// Only the emitted Nat ABI is converted here; graph decisions remain in Bend.
export function pureReply(value) {
  if (Array.isArray(value)) return value.map(pureReply)
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        ["invocation", "id", "bytes"].includes(key) && typeof item === "number" ? BigInt(item) : pureReply(item)
      ])
    )
  return value
}

export function createBendResolver({ observeProduct, drive: ownedDrive, allocateInvocation, onConstructionFailure }) {
  if (
    typeof ownedDrive !== "function" ||
    typeof allocateInvocation !== "function" ||
    typeof onConstructionFailure !== "function"
  )
    throw new Error("Resolver requires its owning Canonical driver")
  const drive = ownedDrive
  return async (path, capture, name, context, options = {}) => {
    const limits = { ...GRAPH_LIMIT_CEILINGS, ...context.limits }
    const activeInvocation = allocateInvocation()
    let session, input
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
        diagnostic: context.observeCaptureDiagnostic
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
          version: 1n,
          ...Object.fromEntries(
            Object.entries(limits).map(([key, value]) => [
              {
                sourceBytes: "source_bytes",
                treeBytes: "tree_bytes",
                readBytes: "read_bytes",
                outgoingEdges: "outgoing_edges"
              }[key] ?? key,
              BigInt(value)
            ])
          )
        }
      })
    } catch (error) {
      session?.close()
      onConstructionFailure?.(activeInvocation)
      throw error
    }
    const outcome = await drive(session, input, options)
    if (outcome.failure) throw new Error("Bend resolver technical failure: " + outcome.failure.$)
    if (outcome.result.$ === "Types.NoReviewUnit") return undefined
    observeProduct?.(outcome.result.value)
    return fromProductValue(outcome.result.value)
  }
}

export function createBendEffectResolver(options) {
  const resolve = createBendResolver(options)
  return (path, capture, name, context) => Effect.promise((signal) => resolve(path, capture, name, context, { signal }))
}
