import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import type * as DecisionModel from "effect/unstable/ai/DecisionModel";
import { execFile } from "node:child_process";
import { writeFile, rm, symlink, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
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
  reviewObservation,
  type DirectReviewContext,
} from "./pipeline.ts";
import { attemptCodexHostOutput } from "./writer.ts";
import { addEvent, makeGitFixture, put, recipient } from "./test-fixtures.ts";
import { adaptCodexAdd } from "./adapter.ts";

const execFileAsync = promisify(execFile);

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
      expect(result.status).toBe("ready");
      if (result.status !== "ready") return;
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

  it.effect("enforces every selection gate before source reads and backend work", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      const outsideRoot = yield* Effect.promise(makeGitFixture);
      yield* Effect.promise(() => put(root, ".gitignore", "ignored.ts\n"));
      yield* Effect.promise(() => put(root, "ignored.ts", "type OrderCount = number"));
      yield* Effect.promise(() => put(root, "real.ts", "type OrderCount = number"));
      yield* Effect.promise(() => symlink(join(root, "real.ts"), join(root, "link.ts")));
      yield* Effect.promise(() => put(root, "policy.ts", "type OrderCount = number"));
      const outside = yield* Effect.promise(() => put(outsideRoot, "outside.ts", "type OrderCount = number"));
      let reads = 0;
      let calls = 0;
      const gated: ReadonlyArray<{
        readonly path: string;
        readonly policy?: DirectReviewContext["policy"];
      }> = [
        { path: "ignored.ts" },
        { path: "link.ts" },
        { path: ".git/config" },
        { path: outside },
        { path: "policy.ts", policy: { includes: ["**/*"], excludes: ["policy.ts"] } },
      ];
      for (const gate of gated) {
        const result = yield* enabledReview(root, addEvent(root, [gate.path]), {
          answers: findingAnswers(),
          onRequest: Effect.sync(() => { calls += 1; }),
        }, (base) => ({
          ...base,
          ...(gate.policy === undefined ? {} : { policy: gate.policy }),
          captureHooks: { sourceRead: () => { reads += 1; } },
        }));
        expect(result.status).toBe("no-advice");
      }
      expect(reads).toBe(0);
      expect(calls).toBe(0);

      yield* Effect.promise(() => execFileAsync("git", ["-C", root, "add", "-f", "ignored.ts"]));
      const tracked = yield* enabledReview(root, addEvent(root, ["ignored.ts"]), {
        answers: findingAnswers(),
        onRequest: Effect.sync(() => { calls += 1; }),
      }, (base) => ({
        ...base,
        captureHooks: { sourceRead: () => { reads += 1; } },
      }));
      expect(tracked.status).toBe("ready");
      expect(reads).toBeGreaterThan(0);
      expect(calls).toBe(1);
    }),
  );

  it.effect("keeps independent candidate outcomes when another path is unsupported", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      yield* Effect.promise(() => put(root, "good.ts", "type OrderCount = number"));
      yield* Effect.promise(() => put(root, "bad.ts", "interface A {}\ninterface B {}"));
      const result = yield* enabledReview(root, addEvent(root, ["bad.ts", "good.ts"]));
      expect(result.status).toBe("ready");
      if (result.status === "ready") {
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

  it.effect("rejects qualified and value-query references without a backend call", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      let calls = 0;
      for (const source of [
        "interface Root { child: NS.B }",
        "interface Root extends NS.B { count: number }",
        "type Root = typeof external",
        "interface Root { [external]: string }",
        "interface Root { [NS.key]: string }",
        "interface Root { value: T; fn: <T>() => T }",
      ]) {
        yield* Effect.promise(() => put(root, "type.ts", source));
        const result = yield* enabledReview(root, addEvent(root), {
          answers: findingAnswers(),
          onRequest: Effect.sync(() => { calls += 1; }),
        });
        expect(result.status).toBe("no-advice");
      }
      expect(calls).toBe(0);
    }),
  );

  it.effect("rejects a remapped canonical root before source or backend use", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"));
      const observation = yield* adaptCodexAdd(addEvent(root));
      expect(observation).toBeDefined();
      if (observation === undefined) return;
      const original = `${root}-original`;
      yield* Effect.promise(() => rename(root, original));
      yield* Effect.promise(() => mkdir(root));
      yield* Effect.promise(() => execFileAsync("git", ["init", "-q", root]));
      yield* Effect.promise(() => put(root, "type.ts", "type CrossRoot = string"));
      yield* Effect.promise(() => put(root, ".review.jsonc", "{ invalid"));
      let reads = 0;
      let calls = 0;
      const result = yield* Effect.gen(function* () {
        const consent = yield* Consent.Service;
        return yield* reviewObservation(observation, {
          controlledWriter: true,
          recipient: observation.recipient,
          consent,
          settings,
          rules: configuredRules,
          captureHooks: { sourceRead: () => { reads += 1; } },
        });
      }).pipe(Effect.provide(Layer.mergeAll(
        Consent.testLayer(),
        controlledDecisionModelLayer({
          answers: findingAnswers(),
          onRequest: Effect.sync(() => { calls += 1; }),
        }),
      )));
      expect(result.status).toBe("unsupported");
      expect(reads).toBe(0);
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
      const extra = yield* enabledReview(root, addEvent(root), {
        answers: findingAnswers(),
        extraDecisionKey: "unexpected",
      });
      expect(extra.status).toBe("unavailable");
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
      expect(unrelated.status).toBe("ready");
      yield* Effect.promise(() => writeFile(path, "type OrderCount = number\n"));
      const sibling = yield* enabledReview(root, addEvent(root), undefined, (base) => ({
        ...base,
        beforeHandoff: Effect.promise(() => writeFile(
          path,
          "type OrderCount = number\ninterface Unrelated { label: string }\n",
        )),
      }));
      expect(sibling.status).toBe("ready");
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
        () => Effect.promise(() => writeFile(
          path,
          "type OrderCount = number\ntype OrderCount = string",
        )),
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

      const ruleMutations: ReadonlyArray<(
        rules: typeof configuredRules,
      ) => typeof configuredRules> = [
        (rulesValue) => rulesValue.map((rule, index) => index === 0
          ? {
              ...rule,
              decision: {
                ...rule.decision,
                criteria: { ...rule.decision.criteria, true: `${rule.decision.criteria.true} changed` },
              },
            }
          : rule),
        (rulesValue) => rulesValue.map((rule, index) => index === 0
          ? { ...rule, threshold: rule.threshold === 0.8 ? 0.81 : 0.8 }
          : rule),
        (rulesValue) => rulesValue.map((rule, index) => index === 0
          ? { ...rule, message: `${rule.message} changed` }
          : rule),
      ];
      for (const mutateRules of ruleMutations) {
        yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"));
        let mutableRules = configuredRules;
        const result = yield* enabledReview(root, addEvent(root), undefined, (base) => ({
          ...base,
          rules: () => mutableRules,
          beforeHandoff: Effect.sync(() => { mutableRules = mutateRules(configuredRules); }),
        }));
        expect(result).toEqual({ status: "unavailable", reason: "stale", output: undefined });
      }

      let contract = "direct-event/same-file-single-named-type/v1";
      const changedContract = yield* enabledReview(root, addEvent(root), undefined, (base) => ({
        ...base,
        inputContract: () => contract,
        beforeHandoff: Effect.sync(() => { contract = "direct-event/same-file-single-named-type/v2"; }),
      }));
      expect(changedContract).toEqual({ status: "unavailable", reason: "stale", output: undefined });
    }),
  );
});

describe("controlled host writer", () => {
  it("records attempted-unacknowledged only after the write invocation", () => {
    const events: Array<string> = [];
    const attempt = attemptCodexHostOutput({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: "advice",
      },
    }, (encoded) => {
      events.push(encoded);
    });
    expect(events).toHaveLength(1);
    expect(attempt.status).toBe("attempted-unacknowledged");
    expect(attempt.encodedBytes).toBe(Buffer.byteLength(events[0] ?? ""));
  });

  it("does not manufacture an attempt record when the writer throws", () => {
    expect(() => attemptCodexHostOutput({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: "advice",
      },
    }, () => {
      throw new Error("closed writer");
    })).toThrow("closed writer");
  });
});
