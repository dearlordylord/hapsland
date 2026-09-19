import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";
import type * as DecisionModel from "effect/unstable/ai/DecisionModel";
import type { ReviewRequest } from "../domain/contracts.ts";
import { configuredRules } from "../policy/rules.ts";
import { ReviewBackend } from "../ports/review-backend.ts";
import { DedupeStore } from "../ports/dedupe-store.ts";
import { SnapshotReader } from "../ports/snapshot-reader.ts";
import { controlledDecisionModelLayer } from "../test-support/controlled-decision-model.ts";
import { review } from "./review.ts";

const source = "export type Count = { value: number; unit: string };\n";

const answers = (
  probability: number,
): Readonly<Record<string, DecisionModel.ProviderAnswer>> =>
  Object.fromEntries(
    configuredRules.map((rule) => [
      rule.id,
      { _tag: "Probability" as const, probability },
    ]),
  );

const request = (cwd: string, paths = ["src/example.ts"]): ReviewRequest => ({
  version: 1,
  event: {
    id: "event-1",
    kind: "successful-edit",
    host: "test",
    cwd,
    paths,
  },
});

const fixture = Effect.acquireRelease(
  Effect.tryPromise(async () => {
    const root = await mkdtemp(join(tmpdir(), "review-slice-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/example.ts"), source);
    return root;
  }),
  (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
);

const run = (
  input: ReviewRequest,
  options: Parameters<typeof controlledDecisionModelLayer>[0],
) =>
  review(input).pipe(
    Effect.provide(
      Layer.mergeAll(
        SnapshotReader.layer,
        DedupeStore.testLayer,
        ReviewBackend.layer.pipe(
          Layer.provide(controlledDecisionModelLayer(options)),
        ),
      ),
    ),
  );

describe("review orchestration", () => {
  it.effect("reviews the exact post-write snapshot without modifying it", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        const result = yield* run(request(root), { answers: answers(0.8) });
        expect(result.results[0]?.status).toBe("reviewed");
        expect(result.advice).toHaveLength(5);
        expect(result.advice[0]?.snapshot.contentHash).toMatch(/^[a-f0-9]{64}$/);
        const after = yield* Effect.promise(() =>
          readFile(join(root, "src/example.ts"), "utf8"),
        );
        expect(after).toBe(source);
      }),
    ),
  );

  it.effect("distinguishes exclusions and backend unavailability", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        const excluded = yield* run(request(root, [".env"]), {});
        expect(excluded.results[0]).toMatchObject({
          status: "skipped",
          reason: "sensitive path excluded",
        });

        const unavailable = yield* run(request(root), {
          failure: "controlled failure",
        });
        expect(unavailable.results[0]).toMatchObject({
          status: "unavailable",
          retryable: false,
        });
      }),
    ),
  );

  it.effect("filters privacy, repository, type, and filesystem exclusions before egress", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        yield* Effect.promise(async () => {
          await mkdir(join(root, "src/directory.ts"));
          await symlink("example.ts", join(root, "src/link.ts"));
          await writeFile(join(root, "src/large.ts"), Buffer.alloc(256 * 1024 + 1));
        });
        const requests = yield* Ref.make(0);
        const output = yield* run(
          request(root, [
            ".env",
            "node_modules/dependency.ts",
            "package-lock.json",
            "src/example.txt",
            "../outside.ts",
            "src/directory.ts",
            "src/link.ts",
            "src/large.ts",
          ]),
          { onRequest: Ref.update(requests, (count) => count + 1) },
        );
        expect(output.results).toHaveLength(8);
        expect(output.results.every((result) => result.status === "skipped")).toBe(true);
        expect(yield* Ref.get(requests)).toBe(0);
      }),
    ),
  );

  it.effect("rejects inexact, wrong-kind, non-finite, and out-of-range answers", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        const missing = { ...answers(0.2) };
        delete missing[configuredRules[0]?.id ?? ""];
        const cases: ReadonlyArray<readonly [
          string,
          Readonly<Record<string, DecisionModel.ProviderAnswer>>,
        ]> = [
          ["missing", missing],
          ["wrong kind", {
            ...answers(0.2),
            [configuredRules[0]?.id ?? "missing"]: {
              _tag: "Rate",
              rating: 0,
              probabilities: { clear: 1 },
            },
          }],
          ["out of range", {
            ...answers(0.2),
            [configuredRules[0]?.id ?? "missing"]: {
              _tag: "Probability",
              probability: 1.1,
            },
          }],
          ["NaN", {
            ...answers(0.2),
            [configuredRules[0]?.id ?? "missing"]: {
              _tag: "Probability",
              probability: Number.NaN,
            },
          }],
          ["infinity", {
            ...answers(0.2),
            [configuredRules[0]?.id ?? "missing"]: {
              _tag: "Probability",
              probability: Number.POSITIVE_INFINITY,
            },
          }],
        ];
        for (const [label, invalid] of cases) {
          const output = yield* run(request(root), { answers: invalid });
          expect(output.results[0]?.status, label).toBe("unavailable");
        }
      }),
    ),
  );

  it.effect("times out deterministically and does not report a clean review", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        const requested = yield* Deferred.make<void>();
        const fiber = yield* run(request(root), {
          answers: answers(0),
          delayMs: 2_000,
          onRequest: Deferred.succeed(requested, undefined),
        }).pipe(Effect.forkChild);
        yield* Deferred.await(requested);
        yield* TestClock.adjust("2 seconds");
        const output = yield* Fiber.join(fiber);
        expect(output.results[0]).toMatchObject({
          status: "unavailable",
          reason: "review backend timed out after 1000 ms",
        });
      }),
    ),
  );

  it.effect("completes controlled 100 ms and 500 ms evaluations before the deadline", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        for (const delayMs of [100, 500]) {
          const requested = yield* Deferred.make<void>();
          const fiber = yield* run(request(root), {
            answers: answers(0),
            delayMs,
            onRequest: Deferred.succeed(requested, undefined),
          }).pipe(Effect.forkChild);
          yield* Deferred.await(requested);
          yield* TestClock.adjust(`${delayMs} millis`);
          const output = yield* Fiber.join(fiber);
          expect(output.results[0]).toMatchObject({
            status: "reviewed",
            backend: { durationMs: delayMs },
          });
        }
      }),
    ),
  );

  it.effect("suppresses advice when the file changes during evaluation", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        const requested = yield* Deferred.make<void>();
        const fiber = yield* run(request(root), {
          answers: answers(1),
          delayMs: 100,
          onRequest: Deferred.succeed(requested, undefined),
        }).pipe(Effect.forkChild);
        yield* Deferred.await(requested);
        yield* Effect.promise(() =>
          writeFile(join(root, "src/example.ts"), `${source}// changed\n`),
        );
        yield* TestClock.adjust("100 millis");
        const output = yield* Fiber.join(fiber);
        expect(output.advice).toEqual([]);
        expect(output.results[0]).toMatchObject({
          status: "unavailable",
          reason: "file changed while review was in progress; advice is stale",
        });
      }),
    ),
  );

  it.effect("deduplicates repeated paths in one delivered event", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        const output = yield* run(
          request(root, ["src/example.ts", "src/example.ts"]),
          { answers: answers(0) },
        );
        expect(output.results).toHaveLength(1);
      }),
    ),
  );

  it.effect("bounds multi-file backend concurrency at four", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        const paths = Array.from({ length: 5 }, (_, index) => `src/file-${index}.ts`);
        yield* Effect.promise(() =>
          Promise.all(paths.map((path) => writeFile(join(root, path), source))),
        );
        const active = yield* Ref.make(0);
        const maximum = yield* Ref.make(0);
        const started = yield* Ref.make(0);
        const fourStarted = yield* Deferred.make<void>();
        const fiveStarted = yield* Deferred.make<void>();
        const backend = Layer.succeed(
          ReviewBackend.Service,
          ReviewBackend.Service.of({
            evaluate: (options) =>
              Effect.gen(function* () {
                const nowActive = yield* Ref.updateAndGet(active, (count) => count + 1);
                yield* Ref.update(maximum, (value) => Math.max(value, nowActive));
                const nowStarted = yield* Ref.updateAndGet(started, (count) => count + 1);
                if (nowStarted === 4) yield* Deferred.succeed(fourStarted, undefined);
                if (nowStarted === 5) yield* Deferred.succeed(fiveStarted, undefined);
                yield* Effect.sleep("100 millis");
                yield* Ref.update(active, (count) => count - 1);
                return {
                  answers: Object.fromEntries(
                    options.rules.map((rule) => [rule.id, { probability: 0 }]),
                  ),
                  backend: {
                    id: "controlled-concurrency",
                    durationMs: 100,
                    retries: 0,
                    usage: {},
                  },
                };
              }),
          }),
        );
        const fiber = yield* review(request(root, paths)).pipe(
          Effect.provide(
            Layer.mergeAll(SnapshotReader.layer, DedupeStore.testLayer, backend),
          ),
          Effect.forkChild,
        );
        yield* Deferred.await(fourStarted);
        expect(yield* Ref.get(maximum)).toBe(4);
        yield* TestClock.adjust("100 millis");
        yield* Deferred.await(fiveStarted);
        expect(yield* Ref.get(maximum)).toBe(4);
        yield* TestClock.adjust("100 millis");
        const output = yield* Fiber.join(fiber);
        expect(output.results).toHaveLength(5);
        expect(output.results.every((result) => result.status === "reviewed")).toBe(true);
      }),
    ),
  );
});
