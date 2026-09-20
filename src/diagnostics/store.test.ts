import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  healthyDiagnosticEvent,
  problemDiagnosticEvent,
  type DiagnosticScope,
} from "./domain.ts";
import { DiagnosticStore } from "./store.ts";

const scope: DiagnosticScope = {
  sessionId: "session-1",
  repository: "repo-1",
  backend: "jev",
};

const outage = {
  code: "backend_outage" as const,
  identity: "backend-unavailable",
};

describe("diagnostic store", () => {
  it.effect("deduplicates concurrent identical problems while retaining outcomes", () =>
    Effect.gen(function* () {
      const first = yield* DiagnosticStore.Service;
      const fibers = yield* Effect.forEach(
        Array.from({ length: 12 }, () =>
          first.observe(problemDiagnosticEvent(scope, outage)),
        ),
        (effect) => effect.pipe(Effect.forkChild),
      );
      const observations = yield* Effect.forEach(fibers, Fiber.join);
      expect(observations).toHaveLength(12);
      expect(observations.filter((entry) => entry.notification !== undefined)).toHaveLength(1);
      expect(observations.every((entry) => entry.status === "problem")).toBe(true);
      expect(observations.filter((entry) => entry.suppressed)).toHaveLength(11);
    }).pipe(Effect.provide(DiagnosticStore.testLayer)),
  );

  it.effect("does not share suppression across repository/backend/session identities", () =>
    Effect.gen(function* () {
      const store = yield* DiagnosticStore.Service;
      const first = yield* store.observe(problemDiagnosticEvent(scope, outage));
      const otherRepository = yield* store.observe(
        problemDiagnosticEvent({ ...scope, repository: "repo-2" }, outage),
      );
      const otherBackend = yield* store.observe(
        problemDiagnosticEvent({ ...scope, backend: "other" }, outage),
      );
      const otherSession = yield* store.observe(
        problemDiagnosticEvent({ ...scope, sessionId: "session-2" }, outage),
      );
      expect(first.notification).toBeDefined();
      expect(otherRepository.notification).toBeDefined();
      expect(otherBackend.notification).toBeDefined();
      expect(otherSession.notification).toBeDefined();
    }).pipe(Effect.provide(DiagnosticStore.testLayer)),
  );

  it.effect("records recovery separately from a healthy initial observation", () =>
    Effect.gen(function* () {
      const store = yield* DiagnosticStore.Service;
      const healthy = yield* store.observe(healthyDiagnosticEvent(scope));
      const problem = yield* store.observe(problemDiagnosticEvent(scope, outage));
      const recovered = yield* store.observe(healthyDiagnosticEvent(scope));
      expect(healthy.notification).toBeUndefined();
      expect(problem.notification?.kind).toBe("problem");
      expect(recovered.notification?.kind).toBe("recovery");
    }).pipe(Effect.provide(DiagnosticStore.testLayer)),
  );

  it.effect("deduplicates across independently acquired process-boundary stores", () =>
    Effect.acquireRelease(
      Effect.tryPromise(() => mkdtemp(join(tmpdir(), "diagnostic-store-"))),
      (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
    ).pipe(
      Effect.flatMap((directory) =>
        Effect.gen(function* () {
          const first = yield* DiagnosticStore.Service;
          const initial = yield* first.observe(problemDiagnosticEvent(scope, outage));
          const second = yield* DiagnosticStore.Service;
          const repeated = yield* second.observe(problemDiagnosticEvent(scope, outage));
          expect(initial.notification).toBeDefined();
          expect(repeated.notification).toBeUndefined();
          expect(repeated.suppressed).toBe(true);

          const entries = yield* Effect.promise(() => readdir(directory));
          const stateFile = entries.find((entry) => entry.endsWith(".json"));
          expect(stateFile).toBeDefined();
          const persisted = yield* Effect.promise(() =>
            readFile(join(directory, stateFile ?? ""), "utf8"),
          );
          expect(persisted).not.toContain("SECRET_PROVIDER_RESPONSE");
          expect(persisted).not.toContain("/private/source");
        }).pipe(
          Effect.provide(DiagnosticStore.layer({ statePath: directory })),
        ),
      ),
    ),
  );

  it.effect("coordinates concurrent process-boundary claims", () =>
    Effect.acquireRelease(
      Effect.tryPromise(() => mkdtemp(join(tmpdir(), "diagnostic-store-concurrent-"))),
      (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
    ).pipe(
      Effect.flatMap((directory) =>
        Effect.gen(function* () {
          const effects = Array.from({ length: 8 }, () =>
            DiagnosticStore.Service.pipe(
              Effect.flatMap((store) =>
                store.observe(problemDiagnosticEvent(scope, outage)),
              ),
              Effect.provide(DiagnosticStore.layer({ statePath: directory })),
              Effect.forkChild,
            ),
          );
          const fibers = yield* Effect.all(effects);
          const observations = yield* Effect.forEach(fibers, Fiber.join);
          expect(observations.filter((entry) => entry.notification !== undefined)).toHaveLength(1);
          expect(observations.every((entry) => entry.status === "problem")).toBe(true);
        }),
      ),
    ),
  );
});
