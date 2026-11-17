import { Config, Effect, Option } from "effect"
import { discoverPhysicalWorkingTreeRoot } from "@hapsland/native-observation/repository/root"
import { discoverWorkingTreeCandidates } from "@hapsland/native-observation/direct-event/selection"
import { selectGlobalPath } from "@hapsland/native-observation/policy/file-policy"
import { ReviewSettingsService, settingsSource } from "@hapsland/review-definition/runtime/review-settings"
import { CredentialResolver } from "@hapsland/credential-storage/credentials/owner"
import { reviewDecisionModelLayer } from "@hapsland/review-execution/review-providers/live"
import {
  prepareSourceFile,
  preparedSourceFileStillCurrent,
  evaluatePrepared,
  type SourceFileRequest,
  type PreparedSource,
  type EvaluationEvidence
} from "@hapsland/review-execution/direct-event/pipeline"
import * as ConfigProvider from "effect/ConfigProvider"
import type { ReviewNode } from "@hapsland/source-artifacts/direct-event/artifact-model"
import type { CaptureDiagnostic } from "@hapsland/native-observation/direct-event/capture"
import type { PreparationDiagnostic } from "@hapsland/review-definition/direct-event/model"
import { RULE_AUDIT_EXIT_CODES } from "./cli-definition.ts"

interface AuditReason {
  readonly path?: string
  readonly declaration?: string
  readonly reason: string
  readonly stage?: "selection" | "capture" | "preparation" | "analysis"
  readonly details?: CaptureDiagnostic["args"] | PreparationDiagnostic["args"]
  readonly missingReferences?: ReadonlyArray<{
    readonly symbol: string
    readonly reason: "unresolved" | "unsupported" | "reference-limit" | "unavailable"
  }>
  readonly context?: "optional" | "required"
}
interface AuditFinding {
  readonly path: string
  readonly declaration: string
  readonly location: PreparedSource["input"]["rootLocation"]
  readonly ruleId: string
  readonly probability: number
  readonly message: string
}
export interface AuditCounters {
  files: { selected: number; processed: number; skipped: number }
  declarations: { prepared: number; processed: number; skipped: number }
  requests: { estimated: number; dispatched: number; active: number; successful: number; failed: number }
}
export interface RuleAuditResult {
  readonly version: 1
  readonly operation: "rule-audit"
  readonly status: "clear" | "findings" | "incomplete" | "no-work"
  readonly counters: AuditCounters
  readonly findings: ReadonlyArray<AuditFinding>
  readonly reasons: ReadonlyArray<AuditReason>
  readonly freshness: "before-dispatch-after-evaluation-and-final-report"
}

/** Finite configured-scope review; all source authority remains in shared preparation/evaluation. */
export const auditRules = Effect.fn("Rules.audit")(function* (
  request: { readonly id?: string | undefined },
  cwd: string,
  progress: (counters: AuditCounters) => void = () => {}
) {
  const counters: AuditCounters = {
    files: { selected: 0, processed: 0, skipped: 0 },
    declarations: { prepared: 0, processed: 0, skipped: 0 },
    requests: { estimated: 0, dispatched: 0, active: 0, successful: 0, failed: 0 }
  }
  const reasons: AuditReason[] = []
  const findings: AuditFinding[] = []
  const retained: Array<{
    selection: SourceFileRequest
    prepared: PreparedSource
    findings: ReadonlyArray<AuditFinding>
  }> = []
  let incomplete = false
  let noApplicableRule = false
  const finish = (): RuleAuditResult => ({
    version: 1,
    operation: "rule-audit",
    status: incomplete
      ? "incomplete"
      : counters.requests.successful === 0
        ? "no-work"
        : findings.length
          ? "findings"
          : "clear",
    counters,
    findings,
    reasons: [...new Map(reasons.map((reason) => [JSON.stringify(reason), reason])).values()],
    freshness: "before-dispatch-after-evaluation-and-final-report"
  })
  const rootResult = yield* discoverPhysicalWorkingTreeRoot(cwd).pipe(Effect.result)
  if (rootResult._tag === "Failure") {
    incomplete = true
    reasons.push({ reason: "repository-unavailable" })
    return finish()
  }
  const repository = rootResult.success
  const userConfigPath = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("REVIEW_USER_CONFIG_PATH")))
  const settingsService = yield* ReviewSettingsService
  const settingsResult = yield* settingsService
    .capture(settingsSource(repository.root, userConfigPath))
    .pipe(Effect.result)
  if (settingsResult._tag === "Failure") {
    incomplete = true
    reasons.push({ reason: "configuration-unavailable" })
    return finish()
  }
  const settings = settingsResult.success
  const policy = settings.configuration.policy
  if (!policy.layers.some((layer) => layer.name !== "built-in" && layer.document.includes !== undefined))
    return yield* Effect.fail(
      new Error("rules audit requires explicit configured includes. Set includes in project or user configuration.")
    )
  const rules = (settings.rules ?? []).filter((rule) => request.id === undefined || rule.id === request.id)
  if (request.id !== undefined && rules.length === 0)
    return yield* Effect.fail(
      new Error(`Rule '${request.id}' is not enabled. Run hapsland rules list to inspect rules.`)
    )
  if (policy.includes.length === 0 || rules.length === 0) {
    reasons.push({ reason: policy.includes.length === 0 ? "empty-includes" : "no-enabled-rules" })
    return finish()
  }
  const discovered = yield* discoverWorkingTreeCandidates(
    repository.root,
    (path) => selectGlobalPath(policy, path).selected
  ).pipe(Effect.result)
  if (discovered._tag === "Failure") {
    incomplete = true
    reasons.push({ reason: "discovery-unavailable" })
    return finish()
  }
  const paths = discovered.success.paths
  counters.files.selected = paths.length
  counters.files.skipped = discovered.success.skipped
  if (paths.length === 0) reasons.push({ reason: "no-selected-files" })
  const resolveCredential = yield* Effect.cached(
    Effect.gen(function* () {
      const credentials = yield* CredentialResolver
      return yield* credentials.resolve({
        root: repository.root,
        envVar: settings.credentialEnvVar,
        environmentOnly: policy.credentialEnvVar.origin.layer !== "built-in"
      })
    })
  )
  let stop = false
  for (const path of paths) {
    if (stop) break
    const selection = { root: repository.root, rootIdentity: repository.rootIdentity, path }
    const ineligibleDeclarations = new Set<string>()
    const omissions: AuditReason[] = []
    const context = {
      settings,
      rules,
      observePreparationOmission: (omittedPath: string, declaration: string, reason: string) => {
        counters.declarations.skipped++
        omissions.push({ path: omittedPath, declaration, reason, stage: "preparation" })
        if (reason === "missing-evidence") {
          incomplete = true
        }
        if (reason === "no-applicable-rule") {
          noApplicableRule = true
          ineligibleDeclarations.add(declaration)
        }
      }
    }
    const preparedFile = yield* prepareSourceFile(selection, context).pipe(Effect.result)
    counters.files.processed++
    if (preparedFile._tag === "Failure") {
      incomplete = true
      reasons.push({ path, reason: "preparation-unavailable" })
      progress(counters)
      continue
    }
    const preparation = preparedFile.success
    const ready = preparation.outcomes.flatMap((outcome) => (outcome.status === "ready" ? [outcome.prepared] : []))
    const observedUnits = preparation.observation.outcomes.flatMap((observation) =>
      observation.status === "observed" ? observation.units : []
    )
    const referenceDetails = (declaration: string | undefined) => {
      const matches = observedUnits.filter((unit) => unit.root.artifact.name === declaration)
      const [match] = matches
      return matches.length === 1 && match !== undefined ? omittedReferences(match.root) : []
    }
    for (const omission of omissions) {
      const missingReferences = referenceDetails(omission.declaration)
      reasons.push({
        ...omission,
        ...(missingReferences.length === 0 ? {} : { missingReferences }),
        ...(omission.reason === "missing-evidence" ? { context: "required" as const } : {})
      })
    }
    for (const observation of preparation.observation.outcomes) {
      if (observation.status === "incomplete") {
        const diagnostic = "diagnostic" in observation ? observation.diagnostic : undefined
        const reason =
          diagnostic?.code === "preparation-analysis-unavailable" && diagnostic.args.reason === "no-declarations"
            ? "no-declarations"
            : "diagnostic" in observation
              ? observation.diagnostic.code
              : observation.reason
        reasons.push({
          path,
          reason,
          ...(diagnostic === undefined
            ? { stage: "selection" as const }
            : { stage: diagnostic.stage, details: diagnostic.args })
        })
        // Ordinary selection denials are non-targets; capture/analysis failures lose work.
        if (
          ![
            "excluded",
            "not-included",
            "empty-includes",
            "language-not-enabled",
            "git-ignored",
            "sensitive",
            "generated-or-vendor",
            "file-extension",
            "no-declarations"
          ].includes(reason)
        )
          incomplete = true
      } else if (observation.analysis.status === "incomplete") {
        for (const failure of observation.analysis.failures) {
          if (
            failure.reason === "missing-evidence" &&
            failure.root !== undefined &&
            ineligibleDeclarations.has(failure.root)
          )
            continue
          const admittedPartial =
            failure.reason === "missing-evidence" &&
            (ready.some((prepared) => prepared.input.declaration.name === failure.root) ||
              (failure.root !== undefined && ineligibleDeclarations.has(failure.root)))
          const missingReferences = referenceDetails(failure.root)
          // The omission observer already reports required missing context for this declaration.
          if (
            !omissions.some((omission) => omission.declaration === failure.root && omission.reason === failure.reason)
          )
            reasons.push({
              path,
              ...(failure.root === undefined ? {} : { declaration: failure.root }),
              reason: failure.reason,
              stage: "analysis",
              ...(missingReferences.length === 0 ? {} : { missingReferences }),
              ...(failure.reason === "missing-evidence"
                ? { context: admittedPartial ? ("optional" as const) : ("required" as const) }
                : {})
            })
          if (
            !admittedPartial &&
            !["no-supported-function-root", "no-declarations", "extension"].includes(failure.reason)
          )
            incomplete = true
        }
      }
    }
    counters.declarations.prepared += ready.length
    counters.requests.estimated += ready.length
    progress(counters)
    for (const prepared of ready) {
      if (stop) break
      const resolvedCredential = yield* resolveCredential.pipe(Effect.result)
      if (resolvedCredential._tag === "Failure") {
        incomplete = true
        stop = true
        reasons.push({ reason: "credential-unavailable" })
        break
      }
      const credential = resolvedCredential.success
      if (credential.status !== "present") {
        incomplete = true
        stop = true
        reasons.push({ reason: `credential-${credential.status}` })
        break
      }
      let stale = false
      let dispatched = false
      let outcome: Extract<EvaluationEvidence, { kind: "evaluation-outcome" }>["outcome"] | undefined
      const beforeDispatch = Effect.gen(function* () {
        stale = !(yield* preparedSourceFileStillCurrent(selection, prepared, { settings, rules }).pipe(
          Effect.catch(() => Effect.succeed(false))
        ))
        if (stale) return yield* Effect.fail(new Error("Selected source changed before dispatch"))
      })
      const evaluation = yield* evaluatePrepared(prepared, beforeDispatch, (evidence) => {
        if (evidence.kind === "model-input") {
          dispatched = true
          counters.requests.dispatched++
          counters.requests.active++
          progress(counters)
        }
        if (evidence.kind === "evaluation-outcome") outcome = evidence.outcome
      }).pipe(
        Effect.provide(reviewDecisionModelLayer(settings)),
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromUnknown({ [settings.credentialEnvVar]: credential.value }))
        ),
        Effect.result
      )
      counters.requests.active = 0
      counters.declarations.processed++
      if (evaluation._tag === "Failure") {
        incomplete = true
        stop = true
        if (dispatched) counters.requests.failed++
        reasons.push({ path, declaration: prepared.input.declaration.name, reason: "backend-unavailable" })
        progress(counters)
        break
      }
      const evaluated = evaluation.success
      if (
        evaluated.status !== "evaluated" ||
        !(yield* preparedSourceFileStillCurrent(selection, prepared, { settings, rules }).pipe(
          Effect.catch(() => Effect.succeed(false))
        ))
      ) {
        incomplete = true
        if (dispatched) counters.requests.failed++
        reasons.push({
          path,
          declaration: prepared.input.declaration.name,
          reason: stale ? "stale" : evaluated.status === "evaluated" ? "stale" : (outcome ?? evaluated.status)
        })
        if (!stale && outcome === "backend") stop = true
      } else {
        counters.requests.successful++
        const currentFindings = evaluated.findings.map((finding) => ({
          path: finding.path,
          declaration: finding.declaration,
          location: prepared.input.rootLocation,
          ruleId: finding.ruleId,
          probability: finding.probability,
          message: finding.message
        }))
        findings.push(...currentFindings)
        retained.push({ selection, prepared, findings: currentFindings })
      }
      progress(counters)
    }
  }
  for (const completed of retained) {
    const current = yield* preparedSourceFileStillCurrent(completed.selection, completed.prepared, {
      settings,
      rules
    }).pipe(Effect.catch(() => Effect.succeed(false)))
    if (!current) {
      incomplete = true
      reasons.push({
        path: completed.selection.path,
        declaration: completed.prepared.input.declaration.name,
        reason: "stale-at-final-report"
      })
      const invalidated = new Set(completed.findings)
      const valid = findings.filter((finding) => !invalidated.has(finding))
      findings.splice(0, findings.length, ...valid)
    }
  }
  if (!incomplete && counters.requests.dispatched === 0 && paths.length > 0)
    reasons.push({ reason: noApplicableRule ? "no-applicable-rules" : "no-eligible-declarations" })
  return finish()
})

export const auditExitCode = (result: RuleAuditResult): number => RULE_AUDIT_EXIT_CODES[result.status]
export const formatAuditProgress = (counters: AuditCounters): string =>
  `Files ${counters.files.processed}/${counters.files.selected}, skipped ${counters.files.skipped}; declarations ${counters.declarations.processed}/${counters.declarations.prepared}, skipped ${counters.declarations.skipped}; requests estimated ${counters.requests.estimated}, dispatched ${counters.requests.dispatched}, active ${counters.requests.active}, successful ${counters.requests.successful}, failed ${counters.requests.failed}`
const diagnosticSymbol = (symbol: string): string =>
  /^[\p{ID_Start}_$][\p{ID_Continue}$]*(?:\.[\p{ID_Start}_$][\p{ID_Continue}$]*)*$/u.test(symbol) ||
  ["import-authority", "schema-behavior", "type-parameter"].includes(symbol)
    ? symbol
    : "unsupported-expression"

const omittedReferences = (node: ReviewNode): NonNullable<AuditReason["missingReferences"]> => {
  const references: Array<NonNullable<AuditReason["missingReferences"]>[number]> = []
  for (const reference of node.references) {
    if (reference.kind === "expanded") references.push(...omittedReferences(reference.node))
    if (reference.kind === "omitted")
      references.push({ symbol: diagnosticSymbol(reference.site.symbol), reason: reference.reason })
  }
  return [...new Map(references.map((reference) => [JSON.stringify(reference), reference])).values()]
}

const referenceExplanation = (reference: NonNullable<AuditReason["missingReferences"]>[number]): string => {
  if (reference.reason === "unsupported") {
    switch (reference.symbol) {
      case "import-authority":
        return "Cannot statically resolve imports"
      case "namespace":
        return "Cannot statically resolve module bindings"
      case "schema-behavior":
        return "Dynamic model schema is not supported by static analysis"
      case "behavior":
        return "Model constructors and decorated methods are not supported by static analysis"
      case "metadata":
        return "Model metadata cannot be evaluated statically"
      case "annotation":
        return "Type annotation uses unsupported syntax"
      case "unsupported-expression":
        return "Type expression is not supported by static analysis"
      default:
        return `Unsupported type reference: ${reference.symbol}`
    }
  }
  if (reference.reason === "unresolved") return `Cannot resolve type reference: ${reference.symbol}`
  if (reference.reason === "reference-limit") return `Type reference exceeds the analysis limit: ${reference.symbol}`
  return `Supporting source is unavailable for: ${reference.symbol}`
}

const reasonExplanation = (reason: AuditReason): string => {
  if (reason.reason === "no-declarations") return "Skipped: no type declarations supported by the current analyzer"
  if (reason.reason === "no-supported-function-root") return "Skipped: no supported function declarations"
  if (reason.reason === "no-applicable-rule" || reason.reason === "no-applicable-rules")
    return "Skipped: no enabled rule applies"
  if (reason.reason === "no-eligible-declarations") return "No declarations are eligible for review"
  if (reason.reason === "missing-evidence")
    return reason.context === "optional"
      ? "Review allowed: missing context is optional for the applicable rules"
      : "Not reviewed: required type context could not be prepared"
  if (
    reason.reason === "preparation-analysis-unavailable" &&
    reason.details !== undefined &&
    "reason" in reason.details
  ) {
    if (reason.details.reason === "parse") return "Not reviewed: source could not be parsed"
    if (reason.details.reason === "declaration-limit")
      return "Not reviewed: too many declarations for the analyzer limit"
    return `Not reviewed: analyzer preparation unavailable (${reason.details.reason})`
  }
  if (reason.reason === "parse") return "Not reviewed: source could not be parsed"
  if (reason.reason === "capture-size-limit" && reason.details !== undefined && "observedBytes" in reason.details)
    return `Not reviewed: source is ${reason.details.observedBytes} bytes; limit is ${reason.details.limitBytes} bytes`
  if (reason.stage === "capture") return `Not reviewed: source capture failed (${reason.reason})`
  return reason.reason
}

export const formatRuleAudit = (result: RuleAuditResult): string =>
  [
    `Audit: ${result.status}`,
    formatAuditProgress(result.counters),
    ...result.findings.map(
      (finding) =>
        `${finding.path}:${finding.location?.start.line ?? "?"} ${finding.declaration}: ${finding.ruleId} — ${finding.message} (${finding.probability})`
    ),
    ...result.reasons.map(
      (reason) =>
        `${reason.path ?? "Audit"}${reason.declaration === undefined ? "" : ` ${reason.declaration}`}: ${reasonExplanation(reason)}${reason.missingReferences?.length ? ` — ${reason.missingReferences.map(referenceExplanation).join("; ")}` : ""}`
    ),
    "Freshness checked before dispatch, after evaluation and during final report preparation; no atomic batch snapshot."
  ].join("\n") + "\n"
