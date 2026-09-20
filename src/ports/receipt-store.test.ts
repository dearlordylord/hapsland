import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import { afterEach, describe, expect, it } from "vitest";
import { ReceiptStore } from "./receipt-store.ts";
import { summarize } from "../receipts/status.ts";

const roots: Array<string> = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const makeStore = (statePath: string) => ReceiptStore.layer({ statePath });

const makeBoundedStore = (statePath: string) =>
  ReceiptStore.layer({ statePath, maxEvents: 2, retentionMs: 60_000 });

const useStore = <A, E>(
  statePath: string,
  effect: Effect.Effect<A, E, ReceiptStore.Service>,
) =>
  Effect.runPromise(effect.pipe(Effect.provide(makeStore(statePath)), Effect.orDie));

const start = (statePath: string, eventId: string, expectedResults = 1) =>
  useStore(
    statePath,
    Effect.gen(function* () {
      const store = yield* ReceiptStore.Service;
      yield* store.start({ sessionId: "session-receipt-test", eventId, expectedResults, startedAt: 100 });
    }),
  );

const complete = (
  statePath: string,
  eventId: string,
  outcomes: ReadonlyArray<{ readonly status: "reviewed" | "skipped" | "unavailable"; readonly code?: string }>,
  findings = 0,
) =>
  useStore(
    statePath,
    Effect.gen(function* () {
      const store = yield* ReceiptStore.Service;
      yield* store.complete({
        sessionId: "session-receipt-test",
        eventId,
        expectedResults: outcomes.length,
        outcomes,
        findings,
        completedAt: 200,
      });
    }),
  );

const status = (statePath: string) =>
  useStore(
    statePath,
    Effect.gen(function* () {
      const store = yield* ReceiptStore.Service;
      return summarize(yield* store.read("session-receipt-test"));
    }),
  );

const boundedStatus = (statePath: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* ReceiptStore.Service;
      return summarize(yield* store.read("session-receipt-test"));
    }).pipe(Effect.provide(makeBoundedStore(statePath))),
  );

describe("source-free receipt store", () => {
  it("reports no observation when a session has no receipt", async () => {
    const root = mkdtempSync(join(tmpdir(), "receipt-missing-"));
    roots.push(root);

    await expect(status(root)).resolves.toMatchObject({
      kind: "no-observation",
      observed: false,
      counts: { started: 0, completed: 0, incomplete: 0 },
    });
  });

  it("distinguishes all-skipped categories from a clean reviewed event", async () => {
    const root = mkdtempSync(join(tmpdir(), "receipt-outcomes-"));
    roots.push(root);

    await start(root, "skipped-event");
    await complete(root, "skipped-event", [{ status: "skipped", code: "excluded" }]);
    await expect(status(root)).resolves.toMatchObject({
      kind: "all-skipped",
      counts: { started: 1, completed: 1, reviewed: 0, skipped: 1, unavailable: 0 },
      categories: { "skipped:excluded": 1 },
    });

    const cleanRoot = mkdtempSync(join(tmpdir(), "receipt-clean-"));
    roots.push(cleanRoot);
    await start(cleanRoot, "clean-event");
    await complete(cleanRoot, "clean-event", [{ status: "reviewed" }]);
    await expect(status(cleanRoot)).resolves.toMatchObject({
      kind: "clean-reviewed",
      counts: { started: 1, completed: 1, reviewed: 1, skipped: 0, unavailable: 0 },
    });
  });

  it("reports mixed reviewed/unavailable activity without retaining backend detail", async () => {
    const root = mkdtempSync(join(tmpdir(), "receipt-mixed-"));
    roots.push(root);
    const secret = "receipt-secret-marker";

    await start(root, "mixed-event", 2);
    await complete(root, "mixed-event", [
      { status: "reviewed" },
      { status: "unavailable", code: "backend_unavailable" },
    ]);
    const result = await status(root);
    expect(result).toMatchObject({
      kind: "mixed",
      counts: { reviewed: 1, skipped: 0, unavailable: 1 },
      categories: { "unavailable:backend_unavailable": 1 },
    });
    const files = readdirSync(join(root, readdirSync(root)[0]!));
    const encoded = files.map((file) => readFileSync(join(root, readdirSync(root)[0]!, file), "utf8")).join("\n");
    expect(encoded).not.toContain(secret);
    expect(encoded).not.toContain("source text");
    expect(encoded).not.toContain("probability");
  });

  it("keeps an observed start incomplete until its completion is present", async () => {
    const root = mkdtempSync(join(tmpdir(), "receipt-incomplete-"));
    roots.push(root);

    await start(root, "unfinished-event");
    await expect(status(root)).resolves.toMatchObject({
      kind: "incomplete",
      counts: { started: 1, completed: 0, incomplete: 1 },
    });
  });

  it("is idempotent for duplicate delivery and accurate under concurrent writers", async () => {
    const root = mkdtempSync(join(tmpdir(), "receipt-concurrent-"));
    roots.push(root);

    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        start(root, `event-${index}`),
      ),
    );
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        complete(root, `event-${index}`, [{ status: "reviewed" }]),
      ),
    );
    await Promise.all([
      complete(root, "event-0", [{ status: "reviewed" }]),
      complete(root, "event-0", [{ status: "reviewed" }]),
      start(root, "event-0"),
    ]);

    await expect(status(root)).resolves.toMatchObject({
      kind: "clean-reviewed",
      counts: { started: 12, completed: 12, incomplete: 0, reviewed: 12 },
    });
  });

  it("returns an explicit limitation for corrupt or unwritable observation state", async () => {
    const root = mkdtempSync(join(tmpdir(), "receipt-limitation-"));
    roots.push(root);

    await start(root, "corrupt-event");
    const sessionDirectory = join(root, readdirSync(root)[0]!);
    writeFileSync(join(sessionDirectory, "corrupt.start.json"), "not-json\n");
    await expect(status(root)).resolves.toMatchObject({
      kind: "limited",
      limitation: "receipt_state_corrupt",
    });

    const blocked = join(root, "blocked-state");
    writeFileSync(blocked, "not-a-directory\n");
    await expect(status(blocked)).resolves.toMatchObject({
      kind: "limited",
      limitation: "receipt_state_unreadable",
    });
  });

  it("bounds retained events per session", async () => {
    const root = mkdtempSync(join(tmpdir(), "receipt-retention-"));
    roots.push(root);
    for (const eventId of ["retained-1", "retained-2", "retained-3"]) {
      await Effect.runPromise(
        Effect.gen(function* () {
          const store = yield* ReceiptStore.Service;
          yield* store.start({ sessionId: "session-receipt-test", eventId, expectedResults: 1 });
          yield* store.complete({
            sessionId: "session-receipt-test",
            eventId,
            outcomes: [{ status: "reviewed" }],
          });
        }).pipe(Effect.provide(makeBoundedStore(root)), Effect.orDie),
      );
    }
    const result = await boundedStatus(root);
    expect(result.counts.started).toBeLessThanOrEqual(2);
    expect(result.counts.completed).toBeLessThanOrEqual(2);
  });
});
