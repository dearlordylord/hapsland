import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as DecisionModel from "effect/ai/DecisionModel"
import * as AiError from "effect/ai/AiError"
import { appendFile } from "node:fs/promises"

export type ControlledDecisionModelOptions = {
  readonly answers?: Readonly<Record<string, DecisionModel.ProviderAnswer>>
  /** Test-only r2 finding when the root declaration source contains this marker. */
  readonly findingOnSourceIncludes?: string
  readonly delayMs?: number
  readonly failure?: string
  /** Test-only failure for one prepared unit selected by its declaration source. */
  readonly failureOnSourceIncludes?: string
  readonly onRequest?: Effect.Effect<void>
  readonly inspectRequest?: (request: DecisionModel.ProviderOptions) => Effect.Effect<void>
  /** Injected after provider normalization to exercise consumer exact-key checks. */
  readonly extraDecisionKey?: string
  /** Test-only subprocess transcript path; never enabled by the live layer. */
  readonly capturePath?: string
  /** Test-only source-free request shape; never writes the provider input. */
  readonly requestSummaryPath?: string
  /** Test-only source-free terminal outcome path; consumed by the resident. */
  readonly outcomePath?: string
  /** Installed acceptance seam: exercise production credential resolution before the controlled transport. */
  readonly requireCredential?: boolean
  /** Exact, source-sensitive #94 offline fixture. Unknown snapshots fail closed. */
  readonly syntheticR6BrandedRepair?: "control" | "finding"
}

const syntheticBefore = "type OrderCount = number"
const syntheticAfter = 'type OrderCount = number & { readonly __brand: "OrderCount" }'
const exactLine = (source: unknown, line: string): boolean =>
  typeof source === "string" && (source === line || source === `${line}\n` || source === `${line}\r\n`)

const objectRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const requestArtifact = (request: DecisionModel.ProviderOptions): Readonly<Record<string, unknown>> | undefined => {
  if (!objectRecord(request.state)) return undefined
  return objectRecord(request.state.artifact) ? request.state.artifact : undefined
}
const syntheticDomain = (artifact: Readonly<Record<string, unknown>> | undefined): boolean =>
  artifact?.domain === "order-count.ts"
const syntheticSourceExpected = (source: unknown, scenario: "control" | "finding", before: boolean): boolean =>
  before || (scenario === "finding" && exactLine(source, syntheticAfter))
const syntheticAnswers = (
  request: DecisionModel.ProviderOptions,
  scenario: "control" | "finding"
): Effect.Effect<Readonly<Record<string, DecisionModel.ProviderAnswer>>, AiError.AiError> => {
  const artifactRecord = requestArtifact(request)
  const source = artifactRecord?.source
  const before = exactLine(source, syntheticBefore)
  const expected = syntheticDomain(artifactRecord) && syntheticSourceExpected(source, scenario, before)
  if (!expected || !Object.hasOwn(request.decisions, "bare_domain_value")) {
    return Effect.fail(
      AiError.make({
        module: "ControlledDecisionModel",
        method: "decide",
        reason: new AiError.InvalidOutputError({ description: "unknown synthetic review snapshot" })
      })
    )
  }
  return Effect.succeed(
    Object.fromEntries(
      Object.keys(request.decisions).map((key) => [
        key,
        { _tag: "Probability", probability: scenario === "finding" && before && key === "bare_domain_value" ? 0.9 : 0 }
      ])
    )
  )
}

type ProviderAnswers = Readonly<Record<string, DecisionModel.ProviderAnswer>>
const nonemptySourceMarker = (value: unknown): value is string => typeof value === "string" && value.length > 0
const controlledSourceFinding = (options: ControlledDecisionModelOptions, source: unknown): boolean =>
  nonemptySourceMarker(options.findingOnSourceIncludes) &&
  typeof source === "string" &&
  source.includes(options.findingOnSourceIncludes)
const controlledFailure = (
  options: ControlledDecisionModelOptions,
  request: DecisionModel.ProviderOptions
): string | undefined => {
  if (options.failure !== undefined) return options.failure
  return options.failureOnSourceIncludes !== undefined &&
    JSON.stringify(request).includes(options.failureOnSourceIncludes)
    ? "controlled unit failure"
    : undefined
}
const sourceFindingAnswers = (request: DecisionModel.ProviderOptions): ProviderAnswers =>
  Object.fromEntries(
    Object.keys(request.decisions).map((key) => [
      key,
      { _tag: "Probability" as const, probability: key === "meaningless_combinations" ? 0.91 : 0 }
    ])
  )
const defaultAnswers = (request: DecisionModel.ProviderOptions): ProviderAnswers =>
  Object.fromEntries(
    Object.keys(request.decisions).map((key) => [key, { _tag: "Probability" as const, probability: 0 }])
  )
const controlledAnswers = (
  request: DecisionModel.ProviderOptions,
  options: ControlledDecisionModelOptions,
  sourceFinding: boolean
): Effect.Effect<ProviderAnswers, AiError.AiError> => {
  if (options.syntheticR6BrandedRepair !== undefined) return syntheticAnswers(request, options.syntheticR6BrandedRepair)
  return Effect.succeed(sourceFinding ? sourceFindingAnswers(request) : (options.answers ?? defaultAnswers(request)))
}
const controlledResult = (answers: Effect.Effect<ProviderAnswers, AiError.AiError>, failure: string | undefined) =>
  failure === undefined
    ? answers.pipe(Effect.map((answers) => ({ answers, usage: { inputTokens: 0, outputTokens: 0 } })))
    : Effect.fail(
        AiError.make({
          module: "ControlledDecisionModel",
          method: "decide",
          reason: new AiError.UnknownError({ description: failure })
        })
      )
const delayedResult = <A, E, R>(result: Effect.Effect<A, E, R>, delayMs: number | undefined) =>
  delayMs === undefined || delayMs === 0 ? result : result.pipe(Effect.delay(`${delayMs} millis`))
const captureRequest = (capturePath: string | undefined) => {
  if (capturePath === undefined) return Effect.succeed(undefined)
  return Effect.tryPromise({
    try: () => appendFile(capturePath, "called\n", "utf8"),
    catch: () => new Error("capture unavailable")
  }).pipe(Effect.catch(() => Effect.succeed(undefined)))
}
const controlledRequestSummary = (
  request: DecisionModel.ProviderOptions,
  options: ControlledDecisionModelOptions,
  sourceFinding: boolean
) => {
  return options.requestSummaryPath === undefined
    ? Effect.void
    : Effect.tryPromise({
        try: () => {
          const state = request.state as
            | {
                artifact?: { kind?: unknown; domain?: unknown }
                evidence?: { nodes?: { domain?: unknown }[]; edges?: { kind?: unknown }[] }
              }
            | undefined
          const edges = state?.evidence?.edges ?? []
          return appendFile(
            options.requestSummaryPath!,
            `${JSON.stringify({
              rootKind: state?.artifact?.kind ?? "unknown",
              inputBytes: Buffer.byteLength(JSON.stringify(request.state) ?? "null", "utf8"),
              evidenceBytes: Buffer.byteLength(JSON.stringify(state?.evidence) ?? "null", "utf8"),
              conditionalFindingSourceMatched: sourceFinding,
              evidenceNodes: state?.evidence?.nodes?.length ?? 0,
              crossFileEvidenceNodes:
                state?.evidence?.nodes?.filter(
                  (node) => typeof node.domain === "string" && node.domain !== state?.artifact?.domain
                ).length ?? 0,
              expandedEdges: edges.filter((edge) => edge.kind === "expanded").length,
              includedEdges: edges.filter((edge) => edge.kind === "included").length,
              omittedEdges: edges.filter((edge) => edge.kind === "omitted").length
            })}\n`,
            "utf8"
          )
        },
        catch: () => new Error("request summary unavailable")
      }).pipe(Effect.catch(() => Effect.void))
}
export const controlledDecisionModelLayer = (options: ControlledDecisionModelOptions) =>
  Layer.effect(
    DecisionModel.DecisionModel,
    DecisionModel.make({
      decide: (request) => {
        const source = requestArtifact(request)?.source
        const sourceFinding = controlledSourceFinding(options, source)
        const failure = controlledFailure(options, request)
        const answers = controlledAnswers(request, options, sourceFinding)
        const result = controlledResult(answers, failure)
        const delayed = delayedResult(result, options.delayMs)
        const capture = captureRequest(options.capturePath)
        const requestSummary = controlledRequestSummary(request, options, sourceFinding)
        return (options.onRequest ?? Effect.succeed(undefined)).pipe(
          Effect.andThen(options.inspectRequest?.(request) ?? Effect.void),
          Effect.andThen(capture),
          Effect.andThen(requestSummary),
          Effect.andThen(delayed)
        )
      }
    }).pipe(
      Effect.map((model) =>
        options.extraDecisionKey === undefined
          ? model
          : DecisionModel.DecisionModel.of({
              ...model,
              decide: (definition, decideOptions) =>
                model
                  .decide(definition, decideOptions)
                  .pipe(
                    Effect.map((response) => ({
                      ...response,
                      answers: { ...response.answers, [options.extraDecisionKey ?? "extra"]: { probability: 0 } }
                    }))
                  )
            })
      )
    )
  )
