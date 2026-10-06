import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { Option, Redacted } from "effect"
import { JEV_API_BASE, JEV_PROVIDER } from "../runtime/backend.ts"
import { liveLayer } from "../jev-decision.ts"
import { ReviewBackend } from "../ports/review-backend.ts"
import { compileRules } from "../rules/compiler.ts"
import type { LoadedRule } from "../rules/loader.ts"
import { SHIPPED_DEFAULT_RULES } from "../rules/shipped.ts"
import {
  controlledDecisionModelLayer,
  type ControlledDecisionModelOptions
} from "../review-execution/controlled-decision-model.ts"
import {
  makeBackendIdentity,
  makeEvaluationRun,
  makeEvaluationScenario,
  makeInputContractIdentity,
  makeRendererAdapterIdentity,
  planEvaluation
} from "./plan.ts"
import { BUNDLED_EVALUATION_EXPECTATIONS, BUNDLED_EVALUATION_FIXTURES, BUNDLED_EVALUATION_RULES } from "./fixtures.ts"
import { digestValue, makeConfigurationCase, makeConfigurationLayer, makeEffectiveConfiguration } from "./digest.ts"
import { executeEvaluation, type EvaluationExecutionError } from "./runner.ts"
import { isReportDigestValid } from "./report.ts"
import {
  EvaluationReport,
  strictParseOptions,
  type EvaluationPlan,
  type EvaluationReport as EvaluationReportType,
  type EvaluationRun,
  type EvaluationScenario
} from "./model.ts"

export const EVALUATION_PROTOCOL_VERSION = 1 as const

export class EvaluationCommandError extends Schema.TaggedError<EvaluationCommandError>()("EvaluationCommandError", {
  reason: Schema.NonEmptyString
}) {
  override get message(): string {
    return this.reason
  }
}

const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const PositiveInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))

const OperationBase = {
  version: Schema.Literal(EVALUATION_PROTOCOL_VERSION),
  liveOptIn: Schema.optionalKey(Schema.Boolean),
  repetitions: Schema.optionalKey(PositiveInteger),
  maximumRequests: Schema.optionalKey(PositiveInteger),
  maximumRetriesPerRequest: Schema.optionalKey(NonNegativeInteger),
  authorizedRemainingCalls: Schema.optionalKey(NonNegativeInteger)
}

export const EvaluationCommand = Schema.Union([
  Schema.Struct({ ...OperationBase, operation: Schema.Literal("plan") }),
  Schema.Struct({ ...OperationBase, operation: Schema.Literal("run") }),
  Schema.Struct({
    version: Schema.Literal(EVALUATION_PROTOCOL_VERSION),
    operation: Schema.Literal("report"),
    report: Schema.Unknown
  })
])
export type EvaluationCommand = typeof EvaluationCommand.Type

export type EvaluationCommandOptions = {
  /** A command flag must explicitly allow live provider construction. */
  readonly allowLive?: boolean
  /** Credential presence is checked by name only and never returned. */
  readonly credentialEnvVar?: string
  readonly controlled?: ControlledDecisionModelOptions
}

export type DefaultEvaluationSuite = {
  readonly scenarios: ReadonlyArray<EvaluationScenario>
  readonly run: EvaluationRun
  readonly plan: EvaluationPlan
  readonly compiledRules: ReadonlyArray<ReturnType<typeof compileRules>[number]>
}

const productionRules: ReadonlyArray<LoadedRule> = SHIPPED_DEFAULT_RULES.map((rule) => ({
  ...rule,
  origin: { layer: "built-in", source: "built-in:noul", field: "bundled.noul" },
  path: "built-in:noul",
  enabled: true,
  reference: { path: "built-in:noul", origin: { layer: "built-in", source: "built-in:noul", field: "bundled.noul" } }
}))

const compiledRules = compileRules({ rules: productionRules })
const allRuleIds = BUNDLED_EVALUATION_RULES.map((rule) => rule.identity.ruleId)
const backendIdentity = (mode: "controlled" | "live") => makeBackendIdentity({ id: "jev", version: "1", mode })
const inputContract = makeInputContractIdentity({
  id: "full-file-plus-path",
  version: "1",
  digest: digestValue("full-file-plus-path-v1")
})
const rendererAdapter = makeRendererAdapterIdentity({
  id: "production-review-renderer",
  version: "1",
  digest: digestValue("review-backend-artifact-v1")
})

const makeScenarioSet = (backend: ReturnType<typeof backendIdentity>) => {
  const configuration = makeConfigurationCase({
    id: "bundled-noul-defaults",
    builtIn: makeConfigurationLayer({ name: "built-in" }),
    user: makeConfigurationLayer({ name: "user" }),
    project: makeConfigurationLayer({ name: "project" }),
    consent: {
      repositoryId: "evaluation-repository",
      backendId: backend.id,
      destinationId: "https://api.typesafe.ai/v1/systemone",
      granted: true
    },
    expectedEffective: makeEffectiveConfiguration({ selectedRuleIds: allRuleIds })
  })
  const scenario = (input: {
    readonly id: string
    readonly name: string
    readonly interaction: "isolated" | "full" | "named"
    readonly rules: ReadonlyArray<(typeof BUNDLED_EVALUATION_RULES)[number]>
  }) =>
    makeEvaluationScenario({
      id: input.id,
      name: input.name,
      interaction: input.interaction,
      ...(input.interaction === "named" ? { interactionName: "conditional-field-related-pair" } : {}),
      fixtures: BUNDLED_EVALUATION_FIXTURES,
      ruleDefinitions: input.rules,
      configurationCaseId: configuration.id,
      effectiveConfigurationDigest: configuration.expectedEffective.configurationDigest,
      backend,
      inputContract,
      rendererAdapter
    })
  const correlated = BUNDLED_EVALUATION_RULES.filter((rule) => rule.identity.ruleId === "split_correlations")
  const conditional = BUNDLED_EVALUATION_RULES.filter((rule) => rule.identity.ruleId === "meaningless_combinations")
  return {
    configuration,
    scenarios: [
      ...BUNDLED_EVALUATION_RULES.map((rule) =>
        scenario({
          id: `isolated-${rule.identity.ruleId}`,
          name: "isolated bundled rule",
          interaction: "isolated",
          rules: [rule]
        })
      ),
      scenario({
        id: "full-enabled-batch",
        name: "full enabled bundled batch",
        interaction: "full",
        rules: BUNDLED_EVALUATION_RULES
      }),
      scenario({
        id: "named-conditional-field-pair",
        name: "named related conditional-field pair",
        interaction: "named",
        rules: [...conditional, ...correlated]
      })
    ]
  }
}

export const makeDefaultEvaluationSuite = (
  input: {
    readonly mode?: "controlled" | "live"
    readonly repetitions?: number
    readonly maximumRequests?: number
    readonly maximumRetriesPerRequest?: number
    readonly authorizedRemainingCalls?: number
    readonly liveOptIn?: boolean
  } = {}
): DefaultEvaluationSuite => {
  const backend = backendIdentity(input.mode ?? "controlled")
  const { configuration, scenarios } = makeScenarioSet(backend)
  const run = makeEvaluationRun({
    id: `noul-semantic-${backend.mode}`,
    name: `${backend.mode} Noul semantic milestone`,
    suiteId: "bundled-noul-semantic",
    scenarios,
    configurationCases: [configuration],
    fixtures: BUNDLED_EVALUATION_FIXTURES,
    ruleDefinitions: BUNDLED_EVALUATION_RULES,
    expectations: BUNDLED_EVALUATION_EXPECTATIONS,
    backend,
    inputContract,
    rendererAdapter,
    repetitions: input.repetitions ?? 1,
    budget: {
      maximumRequests: input.maximumRequests ?? 1000,
      maximumRetriesPerRequest: input.maximumRetriesPerRequest ?? 2,
      ...(input.authorizedRemainingCalls === undefined
        ? {}
        : { authorizedRemainingCalls: input.authorizedRemainingCalls })
    },
    liveOptIn: input.liveOptIn ?? false
  })
  return { scenarios, run, plan: planEvaluation(run, scenarios), compiledRules }
}

const credentialPresent = Effect.fn("EvaluationCommand.credentialPresent")((name: string) =>
  Config.option(Config.Redacted(name)).pipe(
    Effect.map((value) => Option.isSome(value) && Redacted.value(value.value).length > 0),
    Effect.mapError(() => new EvaluationCommandError({ reason: "evaluation credential configuration unavailable" }))
  )
)

const runLayer = (options: EvaluationCommandOptions, suite: DefaultEvaluationSuite) => {
  if (suite.run.backend.mode === "live") {
    return ReviewBackend.layerWithOptions({ transientRetries: suite.run.budget.maximumRetriesPerRequest })
      .pipe(
        Layer.provide(
          liveLayer({
            apiUrl: JEV_API_BASE,
            credentialEnvVar: options.credentialEnvVar ?? JEV_PROVIDER.credentialEnvVar
          })
        )
      )
      .pipe(Layer.orDie)
  }
  return ReviewBackend.layerWithOptions({ transientRetries: suite.run.budget.maximumRetriesPerRequest }).pipe(
    Layer.provide(controlledDecisionModelLayer(options.controlled ?? {}))
  )
}

const planFor = Effect.fn("EvaluationCommand.plan")(function* (
  command: Extract<EvaluationCommand, { readonly operation: "plan" | "run" }>,
  options: EvaluationCommandOptions
) {
  const live = command.liveOptIn === true
  const suite = yield* Effect.try({
    try: () =>
      makeDefaultEvaluationSuite({
        mode: live ? "live" : "controlled",
        ...(command.repetitions === undefined ? {} : { repetitions: command.repetitions }),
        ...(command.maximumRequests === undefined ? {} : { maximumRequests: command.maximumRequests }),
        ...(command.maximumRetriesPerRequest === undefined
          ? {}
          : { maximumRetriesPerRequest: command.maximumRetriesPerRequest }),
        ...(command.authorizedRemainingCalls === undefined
          ? {}
          : { authorizedRemainingCalls: command.authorizedRemainingCalls }),
        liveOptIn: live
      }),
    catch: () => new EvaluationCommandError({ reason: "evaluation plan input was invalid" })
  })
  const liveCredentialPresent = live
    ? yield* credentialPresent(options.credentialEnvVar ?? JEV_PROVIDER.credentialEnvVar)
    : undefined
  const planOptions = liveCredentialPresent === undefined ? {} : { liveCredentialPresent }
  return { ...suite, plan: planEvaluation(suite.run, suite.scenarios, planOptions) }
})

export type EvaluationCommandResult =
  | { readonly version: 1; readonly operation: "plan"; readonly status: "planned"; readonly plan: EvaluationPlan }
  | {
      readonly version: 1
      readonly operation: "run"
      readonly status: "complete" | "rejected"
      readonly plan: EvaluationPlan
      readonly report?: EvaluationReportType
      readonly reason?: string
    }
  | {
      readonly version: 1
      readonly operation: "report"
      readonly status: "verified" | "invalid"
      readonly report?: EvaluationReportType
      readonly reason?: string
    }

const verifiedEvaluationReport = (value: unknown): EvaluationCommandResult => {
  const report = Schema.decodeUnknownResult(EvaluationReport, strictParseOptions)(value)
  if (report._tag === "Failure")
    return {
      version: 1,
      operation: "report",
      status: "invalid",
      reason: "report does not satisfy the evaluation contract"
    }
  if (!isReportDigestValid(report.success))
    return {
      version: 1,
      operation: "report",
      status: "invalid",
      reason: "report digest does not match its sanitized contents"
    }
  return { version: 1, operation: "report", status: "verified", report: report.success }
}
export const runEvaluationCommand = Effect.fn("EvaluationCommand.run")(function* (
  value: unknown,
  options: EvaluationCommandOptions = {}
): Effect.fn.Return<EvaluationCommandResult, EvaluationCommandError | EvaluationExecutionError> {
  const command = yield* Schema.decodeUnknownEffect(
    EvaluationCommand,
    strictParseOptions
  )(value).pipe(Effect.mapError(() => new EvaluationCommandError({ reason: "invalid evaluation command" })))
  if (command.operation === "report") return verifiedEvaluationReport(command.report)
  const suite = yield* planFor(command, options)
  if (command.operation === "plan") {
    return { version: 1, operation: "plan", status: "planned", plan: suite.plan }
  }
  if (!suite.plan.permitted) {
    return {
      version: 1,
      operation: "run",
      status: "rejected",
      plan: suite.plan,
      ...(suite.plan.rejectionReason === undefined ? {} : { reason: suite.plan.rejectionReason })
    }
  }
  if (suite.run.backend.mode === "live" && options.allowLive !== true) {
    return {
      version: 1,
      operation: "run",
      status: "rejected",
      plan: { ...suite.plan, permitted: false, rejectionReason: "live-opt-in-required" },
      reason: "live evaluation requires the explicit command flag"
    }
  }
  const executionInput = {
    run: suite.run,
    plan: suite.plan,
    scenarios: suite.scenarios,
    fixtures: BUNDLED_EVALUATION_FIXTURES,
    ruleDefinitions: BUNDLED_EVALUATION_RULES,
    expectations: BUNDLED_EVALUATION_EXPECTATIONS,
    compiledRules: suite.compiledRules
  }
  const execution = yield* executeEvaluation(executionInput, runLayer(options, suite))
  return { version: 1, operation: "run", status: "complete", plan: suite.plan, report: execution.report }
})
