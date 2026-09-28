import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
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
import { decodeConfigurationText } from "../configuration/decode.ts";
import { resolveConfiguration } from "../configuration/resolve.ts";
import { ReviewBackend } from "../ports/review-backend.ts";
import { DedupeStore } from "../ports/dedupe-store.ts";
import { SnapshotReader } from "../ports/snapshot-reader.ts";
import { controlledDecisionModelLayer } from "../test-support/controlled-decision-model.ts";
import { Consent } from "./consent.ts";
import {
  DEFAULT_API_BASE,
  DEFAULT_BACKEND,
  DEFAULT_CREDENTIAL_ENV_VAR,
  DEFAULT_DESTINATION,
  loadReviewSettings,
  type ReviewSettings,
} from "./review-config.ts";
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
  it.effect("refuses a Git-ignored file before the older source reader", () =>
    Effect.scoped(Effect.gen(function* () {
      const root = yield* fixture;
      execFileSync("git", ["init", "--quiet", root]);
      yield* Effect.promise(() => writeFile(join(root, ".gitignore"), "src/example.ts\n"));
      const settings = yield* loadReviewSettings(root);
      const noRead = Layer.succeed(SnapshotReader.Service, SnapshotReader.Service.of({
        read: () => Effect.die(new Error("ignored source was read")),
      }));
      const backend = Layer.succeed(ReviewBackend.Service, ReviewBackend.Service.of({
        evaluate: () => Effect.die(new Error("ignored source reached Jev")),
      }));
      const result = yield* review(request(root), { _tag: "authorized", root, settings }).pipe(
        Effect.provide(Layer.mergeAll(noRead, DedupeStore.testLayer, backend)),
      );
      expect(result.results[0]).toMatchObject({ status: "skipped", code: "excluded" });
      const unscoped = yield* review(request(root), { _tag: "unscoped" }).pipe(
        Effect.provide(Layer.mergeAll(noRead, DedupeStore.testLayer, backend)),
      );
      expect(unscoped.results[0]).toMatchObject({ status: "skipped", code: "excluded" });
      const priorPath = process.env.PATH;
      try {
        process.env.PATH = "";
        const unavailable = yield* review(request(root), { _tag: "unscoped" }).pipe(
          Effect.provide(Layer.mergeAll(noRead, DedupeStore.testLayer, backend)),
        );
        expect(unavailable.results[0]).toMatchObject({ status: "unavailable", code: "invalid_configuration" });
      } finally {
        if (priorPath === undefined) delete process.env.PATH;
        else process.env.PATH = priorPath;
      }
    })),
  );

  it.effect("rechecks current file settings before dispatch and advice", () =>
    Effect.scoped(Effect.gen(function* () {
      const root = yield* fixture;
      execFileSync("git", ["init", "--quiet", root]);
      const settings = yield* loadReviewSettings(root);
      const exclusionSource = join(root, "user-settings.jsonc");
      const excluded = resolveConfiguration([{ name: "user", source: exclusionSource,
        document: decodeConfigurationText('{"version":1,"excludes":["**/*"]}', exclusionSource) }], root);
      let requests = 0;
      const backend = Layer.succeed(ReviewBackend.Service, ReviewBackend.Service.of({
        evaluate: ({ rules }) => Effect.sync(() => {
          requests += 1;
          return { answers: Object.fromEntries(rules.map((rule) => [rule.id, { probability: 0.8 }])),
            backend: { id: "offline", durationMs: 0, retries: 0, usage: {} } };
        }),
      }));
      const services = Layer.mergeAll(SnapshotReader.layer, DedupeStore.testLayer, backend);
      const refuseSourceRead = Layer.succeed(SnapshotReader.Service, SnapshotReader.Service.of({
        read: () => Effect.die(new Error("excluded source was read")),
      }));
      const beforeDispatch = yield* review(request(root), { _tag: "authorized", root, settings,
        reloadPolicy: () => Effect.succeed(excluded) }).pipe(Effect.provide(
          Layer.mergeAll(refuseSourceRead, DedupeStore.testLayer, backend),
        ));
      expect(beforeDispatch.results[0]).toMatchObject({ status: "skipped", code: "excluded" });
      expect(requests).toBe(0);
      let dispatchChecks = 0;
      const changedAfterRead = yield* review(request(root), { _tag: "authorized", root, settings,
        reloadPolicy: () => Effect.sync(() => ++dispatchChecks === 1 ? settings.configuration.policy : excluded),
      }).pipe(Effect.provide(services));
      expect(changedAfterRead.results[0]).toMatchObject({ status: "skipped", code: "excluded" });
      expect(requests).toBe(0);
      let checks = 0;
      const beforeAdvice = yield* review(request(root), { _tag: "authorized", root, settings,
        reloadPolicy: () => Effect.sync(() => ++checks <= 2 ? settings.configuration.policy : excluded),
      }).pipe(Effect.provide(services));
      expect(requests).toBe(1);
      expect(beforeAdvice.advice).toEqual([]);
      expect(beforeAdvice.results[0]).toMatchObject({ status: "unavailable", code: "stale_snapshot" });
    })),
  );

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
          code: "excluded",
        });

        const unavailable = yield* run(request(root), {
          failure: "controlled failure",
        });
        expect(unavailable.results[0]).toMatchObject({
          status: "unavailable",
          retryable: false,
          code: "backend_unavailable",
        });
      }),
    ),
  );

  it.effect("skips a selected pack when no rule in that pack applies", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        const configPath = join(root, ".review.jsonc");
        const packDirectory = join(root, "rules");
        const packPath = join(packDirectory, "docs-only.jsonc");
        yield* Effect.promise(async () => {
          await mkdir(packDirectory, { recursive: true });
          await writeFile(
            packPath,
            JSON.stringify({
              schemaVersion: 1,
              id: "docs-only",
              contentVersion: "1",
              rules: [{
                id: "docs-rule",
                question: "Does the document require review?",
                criteria: { false: "No.", true: "Yes." },
                message: "Review the document.",
                applicability: { includes: ["docs/**"] },
              }],
            }),
          );
          await writeFile(
            configPath,
            JSON.stringify({
              version: 1,
              packs: ["rules/docs-only.jsonc"],
              ruleOverrides: { noul: { enabled: false } },
            }),
          );
        });
        const settings = yield* loadReviewSettings(root, {
          projectConfigPath: configPath,
          userConfigPath: join(root, "missing-user.jsonc"),
        });
        const calls = yield* Ref.make(0);
        const backend = Layer.succeed(
          ReviewBackend.Service,
          ReviewBackend.Service.of({
            evaluate: () =>
              Ref.update(calls, (value) => value + 1).pipe(
                Effect.andThen(
                  Effect.succeed({
                    answers: {},
                    backend: {
                      id: "must-not-run",
                      durationMs: 0,
                      retries: 0,
                      usage: {},
                    },
                  }),
                ),
              ),
          }),
        );
        const output = yield* Effect.gen(function* () {
          const consent = yield* Consent.Service;
          return yield* review(request(root), {
            _tag: "authorized",
            root,
            consent,
            settings,
          });
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              SnapshotReader.layer,
              DedupeStore.testLayer,
              backend,
              Consent.layer({ statePath: join(root, ".consent-state") }),
            ),
          ),
        );
        expect(output.results[0]).toMatchObject({
          status: "skipped",
          reason: "no configured rule applies",
          code: "no_applicable_rule",
        });
        expect(yield* Ref.get(calls)).toBe(0);
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
          code: "review_timeout",
        });
      }),
    ),
  );

  it.effect("interrupts an in-flight backend evaluation when the review is cancelled", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        const started = yield* Deferred.make<void>();
        const interrupted = yield* Deferred.make<void>();
        const backend = Layer.succeed(
          ReviewBackend.Service,
          ReviewBackend.Service.of({
            evaluate: () =>
              Effect.gen(function* () {
                yield* Deferred.succeed(started, undefined);
                return yield* Effect.never;
              }).pipe(
                Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
              ),
          }),
        );
        const fiber = yield* review(request(root)).pipe(
          Effect.provide(
            Layer.mergeAll(SnapshotReader.layer, DedupeStore.testLayer, backend),
          ),
          Effect.forkChild,
        );
        yield* Deferred.await(started);
        yield* Fiber.interrupt(fiber);
        yield* Deferred.await(interrupted);
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

  it.effect("keeps advice stable when file evaluations complete in a different order", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        const paths = ["src/a.ts", "src/b.ts"] as const;
        yield* Effect.promise(() =>
          Promise.all(paths.map((path) => writeFile(join(root, path), source))),
        );

        const runWithDelays = (delays: Readonly<Record<string, number>>) =>
          Effect.gen(function* () {
            const started = yield* Deferred.make<void>();
            const count = yield* Ref.make(0);
            const backend = Layer.succeed(
              ReviewBackend.Service,
              ReviewBackend.Service.of({
                evaluate: ({ path, rules }) =>
                  Effect.gen(function* () {
                    const current = yield* Ref.updateAndGet(count, (value) => value + 1);
                    if (current === paths.length) yield* Deferred.succeed(started, undefined);
                    const delayMs = delays[path] ?? 0;
                    if (delayMs > 0) yield* Effect.sleep(`${delayMs} millis`);
                    const probability = path === "src/a.ts" ? 0.8 : 0.9;
                    return {
                      answers: Object.fromEntries(
                        rules.map((rule) => [rule.id, { probability }]),
                      ),
                      backend: {
                        id: "completion-order",
                        durationMs: delayMs,
                        retries: 0,
                        usage: {},
                      },
                    };
                  }),
              }),
            );
            const fiber = yield* review(request(root, [...paths])).pipe(
              Effect.provide(
                Layer.mergeAll(SnapshotReader.layer, DedupeStore.testLayer, backend),
              ),
              Effect.forkChild,
            );
            yield* Deferred.await(started);
            yield* TestClock.adjust("100 millis");
            return yield* Fiber.join(fiber);
          });

        const forward = yield* runWithDelays({ "src/a.ts": 0, "src/b.ts": 100 });
        const reverse = yield* runWithDelays({ "src/a.ts": 100, "src/b.ts": 0 });
        expect(reverse.advice).toEqual(forward.advice);
        const withoutTiming = (results: typeof forward.results) =>
          results.map((result) =>
            result.status === "reviewed"
              ? { ...result, backend: { ...result.backend, durationMs: 0 } }
              : result,
          );
        expect(withoutTiming(reverse.results)).toEqual(withoutTiming(forward.results));
      }),
    ),
  );

  it.effect("uses path and rule identity as deterministic tie breakers", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        yield* Effect.promise(() =>
          Promise.all([
            writeFile(join(root, "src/a.ts"), source),
            writeFile(join(root, "src/b.ts"), source),
          ]),
        );
        const output = yield* run(
          request(root, ["src/b.ts", "src/a.ts"]),
          { answers: answers(0.8) },
        );
        expect(output.advice.map((entry) => `${entry.snapshot.path}:${entry.ruleId}`)).toEqual([
          "src/a.ts:r1_inferred_case",
          "src/a.ts:r2_meaningless_combinations",
          "src/a.ts:r3_split_correlations",
          "src/a.ts:r4_duplicate_encoding",
          "src/a.ts:r5_absence_confusion",
        ]);
      }),
    ),
  );

  it.effect("extends advice monotonically when the event budget increases", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        const paths = ["src/a.ts", "src/b.ts"] as const;
        yield* Effect.promise(() =>
          Promise.all(paths.map((path) => writeFile(join(root, path), source))),
        );
        execFileSync("git", ["init", "--quiet", root]);
        const settingsFor = (adviceBudget: number): ReviewSettings => {
          const sourcePath = join(root, `.settings-${adviceBudget}.jsonc`);
          const policy = resolveConfiguration([
            {
              name: "project",
              source: sourcePath,
              document: decodeConfigurationText(
                JSON.stringify({ version: 1, settings: { adviceBudget } }),
                sourcePath,
              ),
            },
          ], root);
          return {
            backend: DEFAULT_BACKEND,
            apiBase: DEFAULT_API_BASE,
            destination: DEFAULT_DESTINATION,
            credentialEnvVar: DEFAULT_CREDENTIAL_ENV_VAR,
            configuration: { policy },
            rules: configuredRules,
          };
        };
        const backend = Layer.succeed(
          ReviewBackend.Service,
          ReviewBackend.Service.of({
            evaluate: ({ rules }) =>
              Effect.succeed({
                answers: Object.fromEntries(
                  rules.map((rule) => [rule.id, { probability: 0.8 }]),
                ),
                backend: {
                  id: "budget",
                  durationMs: 0,
                  retries: 0,
                  usage: {},
                },
              }),
          }),
        );
        const outputs = yield* Effect.gen(function* () {
          const consent = yield* Consent.Service;
          const proposal = yield* consent.preview(root, DEFAULT_BACKEND, DEFAULT_DESTINATION);
          yield* consent.enable(proposal);
          const small = yield* review(
            request(root, [...paths]),
            { _tag: "authorized", root, consent, settings: settingsFor(5) },
          );
          const large = yield* review(
            request(root, [...paths]),
            { _tag: "authorized", root, consent, settings: settingsFor(10) },
          );
          return { small, large };
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              SnapshotReader.layer,
              DedupeStore.testLayer,
              backend,
              Consent.layer({ statePath: join(root, ".consent-state") }),
            ),
          ),
        );
        expect(outputs.small.advice).toHaveLength(5);
        expect(outputs.large.advice).toHaveLength(10);
        expect(outputs.large.advice.slice(0, outputs.small.advice.length)).toEqual(outputs.small.advice);
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
          code: "stale_snapshot",
        });
      }),
    ),
  );

  it.effect("deduplicates repeated paths in one delivered event", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        const output = yield* run(
          request(root, ["src/example.ts", "./src/example.ts", "src/../src/example.ts"]),
          { answers: answers(0) },
        );
        expect(output.results).toHaveLength(1);
      }),
    ),
  );

  it.effect("rereads consent after preflight revocation and makes zero egress", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        execFileSync("git", ["init", "--quiet", root]);
        const statePath = join(root, ".consent-state");
        const settings: ReviewSettings = {
          backend: DEFAULT_BACKEND,
          apiBase: DEFAULT_API_BASE,
          destination: DEFAULT_DESTINATION,
          credentialEnvVar: DEFAULT_CREDENTIAL_ENV_VAR,
          configuration: { policy: resolveConfiguration([], root) },
        };
        const calls = yield* Ref.make(0);
        const backend = Layer.succeed(
          ReviewBackend.Service,
          ReviewBackend.Service.of({
            evaluate: () =>
              Ref.update(calls, (value) => value + 1).pipe(
                Effect.andThen(
                  Effect.succeed({
                    answers: answers(0),
                    backend: {
                      id: "should-not-run",
                      durationMs: 0,
                      retries: 0,
                      usage: {},
                    },
                  }),
                ),
              ),
          }),
        );
        const output = yield* Effect.gen(function* () {
          const consent = yield* Consent.Service;
          const proposal = yield* consent.preview(
            root,
            settings.backend,
            settings.destination,
          );
          yield* consent.enable(proposal);
          const preflight = yield* consent.authorize(
            root,
            settings.backend,
            settings.destination,
          );
          expect(preflight.status).toBe("approved");
          yield* consent.disable(root, settings.backend, settings.destination);
          return yield* review(request(root), {
            _tag: "authorized",
            root,
            consent,
            settings,
          }).pipe(
            Effect.provide(
              Layer.mergeAll(SnapshotReader.layer, DedupeStore.testLayer, backend),
            ),
          );
        }).pipe(Effect.provide(Consent.layer({ statePath })));
        expect(output.results[0]).toMatchObject({
          status: "unavailable",
          code: "backend_unavailable",
        });
        expect(yield* Ref.get(calls)).toBe(1);
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
