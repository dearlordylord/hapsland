import { Config, Context, Effect, Layer, Option } from "effect";
import { recordActivity } from "../activity/status.ts";
import { recordDemoTrace } from "../onboarding/demo-trace.ts";
import { claudeHostOutputText, encodeClaudeHostOutputLine, type ClaudeHostOutput } from "../direct-event/claude-output.ts";
import { attemptCodexHostOutput } from "../direct-event/writer.ts";
import { acknowledgeAdviceEffect, beginComposedSubmissionEffect, releaseComposedSubmissionEffect, type CollectedAdvice } from "./client.ts";
import { HookOutput, type EncodedWriteOutcome } from "./hook-output.ts";

export class DirectHookSubmission extends Context.Service<DirectHookSubmission, {
  readonly begin: typeof beginComposedSubmissionEffect;
  readonly release: typeof releaseComposedSubmissionEffect;
  readonly acknowledge: typeof acknowledgeAdviceEffect;
  readonly writeCodex: (value: ClaudeHostOutput) => Effect.Effect<void>;
  readonly record: (advice: CollectedAdvice, value: ClaudeHostOutput) => Effect.Effect<void>;
}>()("Hapsland/DirectHookSubmission") {}

export const directHookSubmissionLayer = Layer.effect(DirectHookSubmission, Effect.gen(function* () {
  const demoBudgetPath = yield* Config.option(Config.NonEmptyString("REVIEW_DEMO_BUDGET_PATH"));
  return DirectHookSubmission.of({
    begin: beginComposedSubmissionEffect,
    release: releaseComposedSubmissionEffect,
    acknowledge: acknowledgeAdviceEffect,
    writeCodex: Effect.fn("DirectHookSubmission.writeCodex")((value: ClaudeHostOutput) => Effect.sync(() => {
      if ("hookSpecificOutput" in value) attemptCodexHostOutput(value, (encoded) => { process.stdout.write(encoded); });
    })),
    record: Effect.fn("DirectHookSubmission.record")((advice: CollectedAdvice, value: ClaudeHostOutput) => Effect.sync(() => {
      recordDemoTrace(Option.getOrUndefined(demoBudgetPath), advice.root, advice.advicee, {
        kind: "delivery",
        ruleIds: [...claudeHostOutputText(value).matchAll(/\[([a-z0-9_/-]+), p=/g)].map((match) => match[1] ?? ""),
      });
      recordActivity({
        statePath: advice.activityPath, root: advice.root, advicee: advice.advicee, lifetime: advice.lifetime,
        stage: "submitted", submittedFindings: advice.findingCount,
      });
    })),
  });
}));

export const submitDirectHookOutput = Effect.fn("DirectHook.submitOutput")(function* (
  output: { readonly value: ClaudeHostOutput; readonly collected: CollectedAdvice },
  options: { readonly composed: boolean; readonly claude: boolean; readonly deadlineAt: number },
) {
  const submission = yield* DirectHookSubmission;
  const hostOutput = yield* HookOutput;
  const composedSubmission = options.composed && output.collected.findingCount > 0;
  let handedOff = false;
  let released = false;
  const release = () => Effect.gen(function* () {
    if (!composedSubmission || released) return;
    released = true;
    yield* submission.release(output.collected).pipe(Effect.catch(() => Effect.succeed(false)));
  });
  return yield* Effect.gen(function* (): Effect.fn.Return<EncodedWriteOutcome, Error> {
    const submissionReady = !composedSubmission ||
      (yield* submission.begin(output.collected, "edit").pipe(Effect.catch(() => Effect.succeed(false))));
    if (!submissionReady) {
      yield* release();
      return "error";
    }
    let result: EncodedWriteOutcome = "written";
    if (options.claude || composedSubmission) {
      // Interruption after this point cannot prove that no bytes were submitted.
      handedOff = true;
      result = yield* hostOutput.writeEncoded(encodeClaudeHostOutputLine(output.value), options.deadlineAt);
    }
    if (result === "written") {
      if (!options.claude && !composedSubmission && "hookSpecificOutput" in output.value) {
        handedOff = true;
        yield* submission.writeCodex(output.value);
      }
      yield* submission.record(output.collected, output.value);
      yield* submission.acknowledge(output.collected);
    } else if (result === "error") {
      yield* release();
    }
    return result;
  }).pipe(Effect.ensuring(Effect.suspend(() => !handedOff ? release() : Effect.void)));
});
