import { randomUUID } from "node:crypto"
import {
  InspectionSubmissionObservation,
  InspectionWriterObservation,
  observeInspectionWriter
} from "../inspection/writer.ts"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { recordActivity } from "../activity/status.ts"
import { recordDemoTrace } from "../onboarding/demo-trace.ts"
import {
  claudeHostOutputText,
  encodeClaudeHostOutputLine,
  type ClaudeHostOutput
} from "../direct-event/claude-output.ts"
import { attemptCodexHostOutput } from "../direct-event/writer.ts"
import {
  acknowledgeAdviceEffect,
  beginComposedSubmissionEffect,
  releaseComposedSubmissionEffect,
  type CollectedAdvice
} from "./client.ts"
import { HookOutput, type EncodedWriteOutcome } from "./hook-output.ts"

export class DirectHookSubmission extends Context.Service<
  DirectHookSubmission,
  {
    readonly begin: typeof beginComposedSubmissionEffect
    readonly release: typeof releaseComposedSubmissionEffect
    readonly acknowledge: typeof acknowledgeAdviceEffect
    readonly writeCodex: (value: ClaudeHostOutput) => Effect.Effect<void>
    readonly record: (advice: CollectedAdvice, value: ClaudeHostOutput) => Effect.Effect<void>
  }
>()("Hapsland/DirectHookSubmission") {}

export const directHookSubmissionLayer = Layer.effect(
  DirectHookSubmission,
  Effect.gen(function* () {
    const demoBudgetPath = yield* Config.option(Config.NonEmptyString("REVIEW_DEMO_BUDGET_PATH"))
    return DirectHookSubmission.of({
      begin: beginComposedSubmissionEffect,
      release: releaseComposedSubmissionEffect,
      acknowledge: acknowledgeAdviceEffect,
      writeCodex: Effect.fn("DirectHookSubmission.writeCodex")(function* (value: ClaudeHostOutput) {
        const observer = Context.getOrUndefined(yield* Effect.context(), InspectionWriterObservation)
        yield* Effect.sync(() => {
          if ("hookSpecificOutput" in value)
            attemptCodexHostOutput(
              value,
              (encoded) => {
                process.stdout.write(encoded)
              },
              observer
            )
        })
      }),
      record: Effect.fn("DirectHookSubmission.record")((advice: CollectedAdvice, value: ClaudeHostOutput) =>
        Effect.sync(() => {
          recordDemoTrace(Option.getOrUndefined(demoBudgetPath), advice.root, advice.advicee, {
            kind: "delivery",
            ruleIds: [...claudeHostOutputText(value).matchAll(/\[([a-z0-9_/-]+), p=/g)].map((match) => match[1] ?? "")
          })
          recordActivity({
            statePath: advice.activityPath,
            root: advice.root,
            advicee: advice.advicee,
            lifetime: advice.lifetime,
            stage: "submitted",
            submittedFindings: advice.findingCount
          })
        })
      )
    })
  })
)

type DirectHookOutputValue = { readonly value: ClaudeHostOutput; readonly collected: CollectedAdvice }
type DirectHookOutputOptions = { readonly composed: boolean; readonly claude: boolean; readonly deadlineAt: number }
type DirectHookHandoff = { handedOff: boolean }
const writeInitialHookOutput = Effect.fn("DirectHook.writeInitialOutput")(function* (
  output: DirectHookOutputValue,
  options: DirectHookOutputOptions,
  composedSubmission: boolean,
  hostOutput: ReturnType<typeof HookOutput.of>,
  handoff: DirectHookHandoff
) {
  if (!options.claude && !composedSubmission) return "written" as const
  // Interruption after this point cannot prove that no bytes were submitted.
  handoff.handedOff = true
  return yield* hostOutput.writeEncoded(encodeClaudeHostOutputLine(output.value), options.deadlineAt)
})
const directCodexOutputRequired = (
  output: DirectHookOutputValue,
  options: DirectHookOutputOptions,
  composedSubmission: boolean
): boolean => !options.claude && !composedSubmission && "hookSpecificOutput" in output.value
const recordHookOutput = Effect.fn("DirectHook.recordOutput")(function* (
  output: DirectHookOutputValue,
  options: DirectHookOutputOptions,
  composedSubmission: boolean,
  submission: ReturnType<typeof DirectHookSubmission.of>,
  handoff: DirectHookHandoff
) {
  if (directCodexOutputRequired(output, options, composedSubmission)) {
    handoff.handedOff = true
    yield* submission.writeCodex(output.value)
  }
  yield* submission.record(output.collected, output.value)
  const acknowledged = yield* submission.acknowledge(output.collected)
  if (acknowledged)
    observeInspectionWriter(
      Context.getOrUndefined(yield* Effect.context(), InspectionWriterObservation),
      "acknowledged"
    )
})

export const submitDirectHookOutput = Effect.fn("DirectHook.submitOutput")(function* (
  output: DirectHookOutputValue,
  options: DirectHookOutputOptions
) {
  const submission = yield* DirectHookSubmission
  const hostOutput = yield* HookOutput
  const composedSubmission = options.composed && output.collected.findingCount > 0
  const context = yield* Effect.context()
  const factory = Context.getOrUndefined(context, InspectionSubmissionObservation)
  let observer = Context.getOrUndefined(context, InspectionWriterObservation)
  if (factory !== undefined) {
    try {
      observer = factory.forAttempt({
        batchId: output.collected.token,
        findingCount: output.collected.findingCount,
        noticeOnly: output.collected.findingCount === 0,
        attemptId: randomUUID(),
        endpoint: output.collected.paths.socket,
        lifetime: output.collected.lifetime,
        root: output.collected.root,
        advicee: Object.freeze({ ...output.collected.advicee }),
        ...(output.collected.inspectionReporting === true ? { recording: true } : {})
      })
    } catch {
      observer = undefined
    }
  }
  const handoff: DirectHookHandoff = { handedOff: false }
  let released = false
  const release = Effect.fn("DirectHook.releaseUnwrittenOutput")(function* () {
    if (!composedSubmission || released) return
    released = true
    yield* submission.release(output.collected).pipe(Effect.catch(() => Effect.succeed(false)))
  })
  const attempt = Effect.gen(function* (): Effect.fn.Return<EncodedWriteOutcome, Error> {
    observeInspectionWriter(observer, "ready")
    const submissionReady =
      !composedSubmission ||
      (yield* submission.begin(output.collected, "edit").pipe(Effect.catch(() => Effect.succeed(false))))
    if (!submissionReady) {
      observeInspectionWriter(observer, "failed-before-write")
      yield* release()
      return "error"
    }
    if (composedSubmission) observeInspectionWriter(observer, "authorized")
    const result = yield* writeInitialHookOutput(output, options, composedSubmission, hostOutput, handoff)
    if (result === "written") yield* recordHookOutput(output, options, composedSubmission, submission, handoff)
    else if (result === "error") yield* release()
    return result
  }).pipe(
    Effect.onInterrupt(() =>
      Effect.sync(() => {
        if (!handoff.handedOff) observeInspectionWriter(observer, "failed-before-write")
      })
    ),
    Effect.ensuring(Effect.suspend(() => (!handoff.handedOff ? release() : Effect.void)))
  )
  return yield* factory === undefined && observer === undefined
    ? attempt
    : attempt.pipe(Effect.provideService(InspectionWriterObservation, observer ?? { observe: () => {} }))
})
