import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { recordActivity } from "@hapsland/activity-observation/activity/status"
import { recordDemoTrace } from "@hapsland/activity-observation/activity/demo-trace"
import {
  claudeHostOutputText,
  encodeClaudeHostOutputLine,
  type ClaudeHostOutput
} from "@hapsland/delivery-output/direct-event/claude-output"
import { attemptCodexHostOutput } from "@hapsland/delivery-output/direct-event/writer"
import {
  acknowledgeAdviceEffect,
  beginComposedSubmissionEffect,
  releaseComposedSubmissionEffect,
  type CollectedAdvice
} from "@hapsland/resident-transport/resident/client"
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
        yield* Effect.sync(() => {
          if ("hookSpecificOutput" in value)
            attemptCodexHostOutput(value, (encoded) => {
              process.stdout.write(encoded)
            })
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
  yield* submission.acknowledge(output.collected)
})

export const submitDirectHookOutput = Effect.fn("DirectHook.submitOutput")(function* (
  output: DirectHookOutputValue,
  options: DirectHookOutputOptions
) {
  const submission = yield* DirectHookSubmission
  const hostOutput = yield* HookOutput
  const composedSubmission = options.composed && output.collected.findingCount > 0
  const handoff: DirectHookHandoff = { handedOff: false }
  let released = false
  const release = Effect.fn("DirectHook.releaseUnwrittenOutput")(function* () {
    if (!composedSubmission || released) return
    released = true
    yield* submission.release(output.collected).pipe(Effect.catch(() => Effect.succeed(false)))
  })
  const attempt = Effect.gen(function* (): Effect.fn.Return<EncodedWriteOutcome, Error> {
    const submissionReady =
      !composedSubmission ||
      (yield* submission.begin(output.collected, "edit").pipe(Effect.catch(() => Effect.succeed(false))))
    if (!submissionReady) {
      yield* release()
      return "error"
    }
    const result = yield* writeInitialHookOutput(output, options, composedSubmission, hostOutput, handoff)
    if (result === "written") yield* recordHookOutput(output, options, composedSubmission, submission, handoff)
    else if (result === "error") yield* release()
    return result
  }).pipe(Effect.ensuring(Effect.suspend(() => (!handoff.handedOff ? release() : Effect.void))))
  return yield* attempt
})
