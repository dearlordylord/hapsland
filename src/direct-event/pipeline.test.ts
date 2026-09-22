import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import type * as DecisionModel from "effect/unstable/ai/DecisionModel";
import { writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { configuredRules } from "../policy/rules.ts";
import { Consent } from "../runtime/consent.ts";
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../runtime/review-config.ts";
import {
  controlledDecisionModelLayer,
  type ControlledDecisionModelOptions,
} from "../test-support/controlled-decision-model.ts";
import {
  DIRECT_EVENT_DEADLINE_MS,
  reviewCodexAdd,
  type DirectReviewContext,
} from "./pipeline.ts";
import { addEvent, makeGitFixture, put, recipient } from "./test-fixtures.ts";

const findingAnswers = (): Readonly<Record<string, DecisionModel.ProviderAnswer>> =>
  Object.fromEntries(configuredRules.map((rule) => [
    rule.id,
    { _tag: "Probability" as const, probability: 0.91 },
  ]));

const settings = { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION };

const enabledReview = (
  root: string,
  event: unknown,
  modelOptions: ControlledDecisionModelOptions = { answers: findingAnswers() },
  extend: (base: DirectReviewContext) => DirectReviewContext = (base) => base,
) => Effect.gen(function* () {
  const consent = yield* Consent.Service;
  const proposal = yield* consent.preview(root, DEFAULT_BACKEND, DEFAULT_DESTINATION);
  yield* consent.enable(proposal);
  return yield* reviewCodexAdd(event, extend({
    controlledWriter: true,
    recipient: recipient(),
    consent,
    settings,
    rules: configuredRules,
  }));
}).pipe(
  Effect.provide(Layer.mergeAll(
    Consent.testLayer(),
    controlledDecisionModelLayer(modelOptions),
  )),
);

describe("direct-event vertical slice", () => {
  it.effect("runs one Add declaration from native adapter to attempted output", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      yield* Effect.promise(() => put(root, "type.ts", "// file context\ntype OrderCount = number\n"));
      let state: unknown;
      const result = yield* enabledReview(root, addEvent(root), {
        answers: findingAnswers(),
        inspectRequest: (request) => Effect.sync(() => { state = request.state; }),
      });
      expect(result.status).toBe("submitted");
      if (result.status !== "submitted") return;
      expect(result.submission).toBe("attempted-unacknowledged");
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.output).toMatchObject({ hookSpecificOutput: { hookEventName: "PostToolUse" } });
      expect(state).toEqual({ artifact: { domain: "type.ts", source: "type OrderCount = number" } });
    }),
  );

  it.effect("requires controlled-writer authority and exact recipient association", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"));
      let calls = 0;
      const model = { answers: findingAnswers(), onRequest: Effect.sync(() => { calls += 1; }) };
      const uncontrolled = yield* enabledReview(root, addEvent(root), model, (base) => ({ ...base, controlledWriter: false }));
      const wrongRecipient = yield* enabledReview(root, addEvent(root), model, (base) => ({
        ...base,
        recipient: recipient({ sessionId: "someone-else" }),
      }));
      expect(uncontrolled.status).toBe("unattributed");
      expect(wrongRecipient.status).toBe("unattributed");
      expect(calls).toBe(0);
    }),
  );

  it.effect("does zero source reads and backend calls for excluded paths", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      yield* Effect.promise(() => put(root, ".env.local", "type Secret = string"));
      let reads = 0;
      let calls = 0;
      const result = yield* enabledReview(root, addEvent(root, [".env.local"]), {
        answers: findingAnswers(),
        onRequest: Effect.sync(() => { calls += 1; }),
      }, (base) => ({
        ...base,
        captureHooks: { sourceRead: () => { reads += 1; } },
      }));
      expect(result.status).toBe("no-advice");
      expect(reads).toBe(0);
      expect(calls).toBe(0);
    }),
  );

  it.effect("keeps independent candidate outcomes when another path is unsupported", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      yield* Effect.promise(() => put(root, "good.ts", "type OrderCount = number"));
      yield* Effect.promise(() => put(root, "bad.ts", "interface A {}\ninterface B {}"));
      const result = yield* enabledReview(root, addEvent(root, ["bad.ts", "good.ts"]));
      expect(result.status).toBe("submitted");
      if (result.status === "submitted") {
        expect(new Set(result.findings.map(({ path }) => path))).toEqual(new Set(["good.ts"]));
      }
    }),
  );

  it.effect("keeps unsupported analyzer input quiet with no backend call", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      yield* Effect.promise(() => put(root, "type.ts", "interface A {}\ninterface B {}"));
      let calls = 0;
      const result = yield* enabledReview(root, addEvent(root), {
        answers: findingAnswers(),
        onRequest: Effect.sync(() => { calls += 1; }),
      });
      expect(result.status).toBe("no-advice");
      expect(calls).toBe(0);
    }),
  );

  it.effect("emits no empty advice after a successful clear", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"));
      const result = yield* enabledReview(root, addEvent(root), {});
      expect(result).toEqual({ status: "no-advice", output: undefined });
    }),
  );

  it.effect("rejects missing/extra keys and non-finite/out-of-range probabilities", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"));
      const variants: ReadonlyArray<Readonly<Record<string, DecisionModel.ProviderAnswer>>> = [
        {},
        Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: Number.NaN }])),
        Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 2 }])),
      ];
      for (const answers of variants) {
        const result = yield* enabledReview(root, addEvent(root), { answers });
        expect(result.status).toBe("unavailable");
      }
    }),
  );

  it.effect("rechecks consent immediately before dispatch and makes no call after revocation", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"));
      let calls = 0;
      const result = yield* enabledReview(root, addEvent(root), {
        answers: findingAnswers(),
        onRequest: Effect.sync(() => { calls += 1; }),
      }, (base) => ({
        ...base,
        beforeDispatch: base.consent.disable(root, DEFAULT_BACKEND, DEFAULT_DESTINATION).pipe(
          Effect.asVoid,
          Effect.orDie,
        ),
      }));
      expect(result).toEqual({ status: "unavailable", reason: "consent", output: undefined });
      expect(calls).toBe(0);
    }),
  );

  it.effect("uses a 15-second deadline and performs zero retries", () =>
    Effect.scoped(Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"));
      const called = yield* Deferred.make<void>();
      let calls = 0;
      const program = enabledReview(root, addEvent(root), {
        answers: findingAnswers(),
        delayMs: DIRECT_EVENT_DEADLINE_MS + 1,
        onRequest: Effect.sync(() => { calls += 1; }).pipe(Effect.andThen(Deferred.succeed(called, undefined))),
      });
      const fiber = yield* program.pipe(Effect.forkChild);
      yield* Deferred.await(called);
      yield* TestClock.adjust(`${DIRECT_EVENT_DEADLINE_MS - 1} millis`);
      expect(calls).toBe(1);
      yield* TestClock.adjust("1 millis");
      const result = yield* Fiber.join(fiber);
      expect(result).toEqual({ status: "unavailable", reason: "timeout", output: undefined });
      expect(calls).toBe(1);
    })),
  );

  it.effect("does not retry a backend failure", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"));
      let calls = 0;
      const result = yield* enabledReview(root, addEvent(root), {
        failure: "controlled failure",
        onRequest: Effect.sync(() => { calls += 1; }),
      });
      expect(result).toEqual({ status: "unavailable", reason: "backend", output: undefined });
      expect(calls).toBe(1);
    }),
  );

  it.effect("allows unrelated file-context edits but suppresses relevant semantic changes", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      const path = join(root, "type.ts");
      yield* Effect.promise(() => put(root, "type.ts", "// old\ntype OrderCount = number\n"));
      const unrelated = yield* enabledReview(root, addEvent(root), undefined, (base) => ({
        ...base,
        beforeHandoff: Effect.promise(() => writeFile(path, "// new\ntype OrderCount = number\n")),
      }));
      expect(unrelated.status).toBe("submitted");
      yield* Effect.promise(() => writeFile(path, "type OrderCount = number\n"));
      const relevant = yield* enabledReview(root, addEvent(root), undefined, (base) => ({
        ...base,
        beforeHandoff: Effect.promise(() => writeFile(path, "type OrderCount = string\n")),
      }));
      expect(relevant).toEqual({ status: "unavailable", reason: "stale", output: undefined });
    }),
  );

  it.effect("suppresses handoff on deletion, analyzer loss, or rule identity change", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      const path = join(root, "type.ts");
      const scenarios: ReadonlyArray<() => Effect.Effect<void>> = [
        () => Effect.promise(() => rm(path)),
        () => Effect.promise(() => writeFile(path, "const unrelated = true")),
      ];
      for (const mutate of scenarios) {
        yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"));
        const result = yield* enabledReview(root, addEvent(root), undefined, (base) => ({ ...base, beforeHandoff: mutate() }));
        expect(result).toEqual({ status: "unavailable", reason: "stale", output: undefined });
      }
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"));
      let rules = configuredRules;
      const changedRules = yield* enabledReview(root, addEvent(root), undefined, (base) => ({
        ...base,
        rules: () => rules,
        beforeHandoff: Effect.sync(() => { rules = configuredRules.slice(0, -1); }),
      }));
      expect(changedRules).toEqual({ status: "unavailable", reason: "stale", output: undefined });
      let excludes: ReadonlyArray<string> = [];
      const changedSelection = yield* enabledReview(root, addEvent(root), undefined, (base) => ({
        ...base,
        policy: () => ({ includes: ["**/*"], excludes }),
        beforeHandoff: Effect.sync(() => { excludes = ["type.ts"]; }),
      }));
      expect(changedSelection).toEqual({ status: "unavailable", reason: "stale", output: undefined });
    }),
  );
});
