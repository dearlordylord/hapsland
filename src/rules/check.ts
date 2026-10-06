import * as Config from "effect/Config"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type * as HttpClient from "effect/http/HttpClient"
import { discoverPhysicalWorkingTreeRoot, rootRelativePath } from "../repository/root.ts"
import { loadReviewSettings } from "../runtime/review-config.ts"
import { resolveCredential } from "../credentials/secret-service.ts"
import { reviewDecisionModelLayer } from "../review-providers/live.ts"
import {
  prepareSourceLine,
  preparedSourceLineStillCurrent,
  preparedProviderInput,
  candidateReviewInput,
  evaluatePrepared,
  type EvaluationEvidence
} from "../direct-event/pipeline.ts"
import { findingFromProbability } from "./decision.ts"

export interface RuleCheckRequest {
  readonly path: string
  readonly line: number
  readonly id?: string | undefined
}

/** Manual review shares capture, graph, evidence admission, credentials and model execution with hooks. */
export const checkRuleAtLine = Effect.fn("Rules.checkAtLine")(function* (
  request: RuleCheckRequest,
  options: { readonly cwd?: string; readonly httpClient?: HttpClient.HttpClient } = {}
) {
  if (!Number.isSafeInteger(request.line) || request.line < 1)
    return yield* Effect.fail(new Error("--line must be a positive one-based integer."))
  const cwd = options.cwd ?? process.cwd()
  const repository = yield* discoverPhysicalWorkingTreeRoot(cwd)
  const path = rootRelativePath(repository.root, repository.physicalCwd, request.path)
  if (path === undefined) return yield* Effect.fail(new Error("--path must stay inside the current Git working tree."))
  const userConfigPath = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("REVIEW_USER_CONFIG_PATH")))
  const settings = yield* loadReviewSettings(repository.root, userConfigPath === undefined ? {} : { userConfigPath })
  const rules = (settings.rules ?? []).filter((rule) => request.id === undefined || rule.id === request.id)
  if (request.id !== undefined && rules.length === 0)
    return yield* Effect.fail(
      new Error(`Rule '${request.id}' is not enabled. Run hapsland rules list to inspect rules.`)
    )
  const selection = { root: repository.root, rootIdentity: repository.rootIdentity, path, line: request.line }
  const omissions: Array<{ path: string; declaration: string; reason: string }> = []
  const context = {
    settings,
    rules,
    observePreparationOmission: (path: string, declaration: string, reason: string) => {
      omissions.push({ path, declaration, reason })
    }
  }
  const preparation = yield* prepareSourceLine(selection, context)
  const ready = preparation.outcomes.flatMap((outcome) => (outcome.status === "ready" ? [outcome.prepared] : []))
  const base = {
    version: 1 as const,
    operation: "rule-check" as const,
    path,
    line: request.line,
    provider: settings.providerIdentity,
    omissions,
    analysis: preparation.observation.outcomes.map((outcome) =>
      outcome.status === "observed"
        ? { status: outcome.status, path: outcome.path, analysis: outcome.analysis }
        : outcome
    ),
    results: [] as ReadonlyArray<{
      ruleId: string
      probability: number
      threshold: number
      finding: boolean
      message: string
    }>
  }
  const preparationReasons = [
    ...new Set([
      ...base.analysis.flatMap((outcome) =>
        outcome.status === "incomplete"
          ? [outcome.reason]
          : outcome.analysis.status === "incomplete"
            ? outcome.analysis.failures.map((failure) => failure.reason)
            : []
      ),
      ...omissions.map((omission) => omission.reason)
    ])
  ]
  if (ready.length !== 1) {
    const reason =
      preparation.ambiguousLine || ready.length > 1 || preparationReasons.includes("ambiguous-update")
        ? "ambiguous-line"
        : rules.length === 0
          ? "no-enabled-rules"
          : (preparationReasons[0] ?? "no-eligible-declaration")
    return {
      ...base,
      status: "skipped" as const,
      classifierCalls: 0,
      reason,
      explanation:
        "No request sent. Choose a line inside one supported declaration and inspect the selection/evidence reasons below."
    }
  }
  const prepared = ready[0]!
  const captured = {
    ...base,
    declaration: {
      name: prepared.input.declaration.name,
      kind: prepared.input.declaration.kind,
      location: prepared.input.rootLocation
    },
    relatedSources: [...new Set(candidateReviewInput(prepared.input)?.nodes.map((node) => node.domain) ?? [])],
    input: preparedProviderInput(prepared)
  }
  const credential = yield* resolveCredential({
    root: repository.root,
    envVar: settings.credentialEnvVar,
    environmentOnly: settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in"
  })
  if (credential.status !== "present")
    return {
      ...captured,
      status: "unavailable" as const,
      classifierCalls: 0,
      reason: `credential-${credential.status}`,
      explanation: `No request sent. Check ${settings.credentialEnvVar}, the project key file or native saved credentials as configured.`
    }
  let classifierCalls = 0
  let stale = false
  let answers: Extract<EvaluationEvidence, { kind: "validated-answers" }>["answers"] = []
  let outcome: Extract<EvaluationEvidence, { kind: "evaluation-outcome" }>["outcome"] | undefined
  const freshnessContext = { settings, rules }
  const beforeDispatch = Effect.gen(function* () {
    stale = !(yield* preparedSourceLineStillCurrent(selection, prepared, freshnessContext))
    if (stale) return yield* Effect.fail(new Error("Selected source changed before dispatch"))
  })
  const evaluated = yield* evaluatePrepared(prepared, beforeDispatch, (evidence) => {
    if (evidence.kind === "model-input") classifierCalls++
    if (evidence.kind === "validated-answers") answers = evidence.answers
    if (evidence.kind === "evaluation-outcome") outcome = evidence.outcome
  }).pipe(
    Effect.provide(reviewDecisionModelLayer(settings, options.httpClient)),
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ [settings.credentialEnvVar]: credential.value })))
  )
  if (evaluated.status !== "evaluated")
    return {
      ...captured,
      status: "unavailable" as const,
      classifierCalls,
      reason: stale ? "stale" : (outcome ?? evaluated.status),
      explanation: "No valid current classifier result. This is not a passing check."
    }
  if (!(yield* preparedSourceLineStillCurrent(selection, prepared, freshnessContext)))
    return {
      ...captured,
      status: "unavailable" as const,
      classifierCalls,
      reason: "stale",
      explanation: "Source changed during review. Run the check again; these probabilities are not a current result."
    }
  return {
    ...captured,
    status: "evaluated" as const,
    classifierCalls,
    results: prepared.input.rules.map((rule) => {
      const probability = answers.find((answer) => answer.ruleId === rule.id)!.probability
      return {
        ruleId: rule.id,
        probability,
        threshold: rule.threshold,
        finding: findingFromProbability(probability, rule.threshold),
        message: rule.message
      }
    }),
    explanation:
      "Reviewed the enclosing declaration and bounded related code with the configured classifier. One example does not establish rule accuracy."
  }
})

export const formatRuleCheck = (result: Effect.Success<ReturnType<typeof checkRuleAtLine>>): string => {
  const header = [
    `${result.path}:${result.line} — ${result.status}`,
    `Classifier: ${result.provider.model}; requests: ${result.classifierCalls}`
  ]
  if ("declaration" in result) {
    header.push(
      `Selected ${result.declaration.kind} ${result.declaration.name}; full declaration plus bounded related code.`
    )
    header.push(`Related source: ${result.relatedSources.join(", ") || "none"}`)
  }
  if ("reason" in result) header.push(`Reason: ${result.reason}`)
  for (const rule of result.results)
    header.push(
      `${rule.finding ? "FINDING" : "clear"} ${rule.ruleId}: probability ${rule.probability}, threshold > ${rule.threshold}${rule.finding ? ` — ${rule.message}` : ""}`
    )
  for (const omission of result.omissions) header.push(`Skipped ${omission.declaration}: ${omission.reason}`)
  for (const outcome of result.analysis) {
    if (outcome.status === "incomplete") header.push(`Selection: ${outcome.reason}`)
    else if (outcome.analysis.status === "incomplete")
      for (const failure of outcome.analysis.failures)
        header.push(`Analysis${failure.root === undefined ? "" : ` (${failure.root})`}: ${failure.reason}`)
  }
  header.push(
    result.explanation,
    "Use --json to inspect the captured classifier input and results. No resident or agent session was started."
  )
  return header.join("\n") + "\n"
}
