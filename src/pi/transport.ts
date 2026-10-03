import { randomUUID } from "node:crypto";
import { Clock, Effect } from "effect";
import { adaptPiDirectEvent, adaptPiHookIdentity } from "../direct-event/pi-adapter.ts";
import { hookProcessStartedAt } from "../resident/hook-clock.ts";
import { resolveResidentPaths, type ResidentPaths } from "../resident/paths.ts";
import { acknowledgeAdviceEffect, admitObservationEffect, beginComposedSubmissionEffect, collectAdviceeOutcomeEffect, composedStopBoundaryEffect, inspectResidentEffect, makeResidentDispatchContextEffect, registerComposedEditEffect, residentRequestEffect, type AdviceeCollectionOutcome } from "../resident/client.ts";
import type { ControlledDecisionModelOptions } from "../test-support/controlled-decision-model.ts";
import type { DirectAdvicee } from "../direct-event/model.ts";
import type { ResidentDispatchContext } from "../resident/protocol.ts";

/** Pi has an awaited boundary, with a four-second Hapsland wait inside its five-second resident fence. */
export const PI_FINISH_DEADLINE_MS = 4_000;
const now = Clock.monotonicTimeNanos.pipe(Effect.map(n => Number(n) / 1_000_000));
const object = (v: unknown): Record<string, unknown> | undefined => typeof v === "object" && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
type Options = { statePath: string; activityPath: string; userConfigPath?: string; controlled?: ControlledDecisionModelOptions };
type Context = { root: string; advicee: DirectAdvicee; paths: ResidentPaths; event: Record<string, unknown>; options: Options };
const empty = { status: "empty" } as const;
const incomplete = { status: "incomplete" } as const;
const before = Effect.fn("Pi.register")(function* ({ root, advicee, paths, options }: Context) {
  const admitted = yield* registerComposedEditEffect(root, advicee, hookProcessStartedAt, paths, options.activityPath, options.userConfigPath);
  return { status: admitted ? "registered" : "incomplete" };
});
const retire = Effect.fn("Pi.retire")(function* ({ root, advicee, paths }: Context) {
  const owner = yield* inspectResidentEffect(paths);
  if (owner.lifetime !== undefined) yield* residentRequestEffect(paths, { requestRoute: "shared", operation: "retire-edit", lifetime: owner.lifetime, root, advicee, startedAt: hookProcessStartedAt });
  return { status: "retired" };
});
const acknowledge = Effect.fn("Pi.acknowledge")(function* ({ root, advicee, paths, options, event }: Context) {
  if (typeof event.token !== "string" || typeof event.lifetime !== "string") return incomplete;
  const acknowledged = yield* acknowledgeAdviceEffect({ paths, token: event.token, lifetime: event.lifetime, root, advicee, activityPath: options.activityPath, findingCount: 0, output: { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "" } } });
  if (typeof event.stopToken === "string") yield* composedStopBoundaryEffect("finish-stop", root, advicee, event.stopToken, event.continued !== true, paths);
  return { status: acknowledged ? "acknowledged" : "uncertain" };
});
const close = Effect.fn("Pi.close")(function* ({ root, advicee, paths }: Context) {
  const token = randomUUID();
  if (yield* composedStopBoundaryEffect("begin-stop", root, advicee, token, false, paths)) yield* composedStopBoundaryEffect("finish-stop", root, advicee, token, true, paths, "abandoned-stop");
  return { status: "closed" };
});
const admitEdit = Effect.fn("Pi.admit")(function* (context: Context, dispatch: ResidentDispatchContext) {
  const { event, options, paths } = context;
  const observation = yield* adaptPiDirectEvent(event, options.userConfigPath === undefined ? {} : { userConfigPath: options.userConfigPath });
  if (observation === undefined) return false;
  const admitted = yield* admitObservationEffect(observation, true, dispatch, paths);
  return admitted.status === "accepted";
});
type Advice = Extract<AdviceeCollectionOutcome, { status: "advice" }>["advice"];
const offerAdvice = Effect.fn("Pi.offer")(function* (context: Context, advice: Advice, stopToken: string | undefined) {
  const finish = stopToken !== undefined;
  const continued = finish && advice.findingCount > 0 && context.event.canContinue === true;
  if (advice.findingCount > 0 && !(yield* beginComposedSubmissionEffect(advice, finish ? "stop" : "edit"))) return incomplete;
  return { status: "advice", text: advice.output.hookSpecificOutput.additionalContext, token: advice.token, lifetime: advice.lifetime, findingCount: advice.findingCount, continued, ...(stopToken === undefined ? {} : { stopToken }) };
});
const finishFacts = (token: string | undefined, time: number, deadline: number) => token === undefined ? undefined : { token, deadlineReached: time >= deadline - 750 };
const collect = Effect.fn("Pi.collect")(function* (context: Context, dispatch: ResidentDispatchContext) {
  const { event, root, advicee, paths } = context;
  const finish = event.operation === "finish";
  const deadline = (yield* now) + (finish ? PI_FINISH_DEADLINE_MS : 250);
  const stopToken = finish ? randomUUID() : undefined;
  if (stopToken !== undefined && !(yield* composedStopBoundaryEffect("begin-stop", root, advicee, stopToken, false, paths))) return { status: "unavailable" };
  while ((yield* now) < deadline - 150) {
    const outcome = yield* collectAdviceeOutcomeEffect(root, advicee, dispatch, paths, finish ? "turn-end" : "ordinary", deadline, finishFacts(stopToken, yield* now, deadline));
    if (outcome.status === "advice") return yield* offerAdvice(context, outcome.advice, stopToken);
    if (outcome.status === "empty") break;
    yield* Effect.sleep("50 millis");
  }
  if (stopToken !== undefined) yield* composedStopBoundaryEffect("finish-stop", root, advicee, stopToken, true, paths, (yield* now) >= deadline - 750 ? "deadline" : "no-advice");
  return empty;
});
const review = Effect.fn("Pi.review")(function* (context: Context) {
  const { root, event, options } = context;
  const dispatch = yield* makeResidentDispatchContextEffect(root, options.statePath, options.activityPath, options.userConfigPath, options.controlled);
  if (event.operation === "edit" && !(yield* admitEdit(context, dispatch))) return incomplete;
  return yield* collect(context, dispatch);
});
const handlers = { before, retire, ack: acknowledge, close, edit: review, finish: review };
export const runPiHook = Effect.fn("Pi.transport")(function* (input: unknown, options: Options) {
  const event = object(input);
  if (event === undefined || typeof event.operation !== "string" || !(event.operation in handlers)) return incomplete;
  const identity = yield* adaptPiHookIdentity(event);
  if (identity === undefined) return incomplete;
  const paths = yield* resolveResidentPaths();
  return yield* handlers[event.operation as keyof typeof handlers]({ ...identity, paths, event, options });
});
