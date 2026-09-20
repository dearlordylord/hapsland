import { createHash, randomUUID } from "node:crypto";
import {
  link,
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import {
  ReceiptCategoryCode,
  ReceiptCompletion,
  type ReceiptEventObservation,
  ReceiptStart,
  type ReceiptCategoryCode as ReceiptCategoryCodeType,
  type ReceiptCompletion as ReceiptCompletionType,
  type ReceiptEventId,
  type ReceiptObservation,
  type ReceiptOutcome,
  type ReceiptSessionId,
} from "../domain/receipts.ts";

type ReceiptStartType = typeof ReceiptStart.Type;

/** A completion carries only classifications, never the result payload. */
export interface ReceiptOutcomeInput {
  readonly status: ReceiptOutcome;
  readonly code?: string;
}

export interface StartInput {
  readonly sessionId: ReceiptSessionId | string;
  readonly eventId: ReceiptEventId | string;
  readonly expectedResults: number;
  readonly startedAt?: number;
}

export interface CompletionInput {
  readonly sessionId: ReceiptSessionId | string;
  readonly eventId: ReceiptEventId | string;
  readonly expectedResults?: number;
  readonly outcomes: ReadonlyArray<ReceiptOutcomeInput>;
  readonly findings?: number;
  readonly completedAt?: number;
}

export class ReceiptStoreError extends Schema.TaggedError<ReceiptStoreError>()(
  "ReceiptStoreError",
  {
    operation: Schema.Literals(["start", "complete"]),
    code: Schema.Literals(["receipt_state_unwritable", "invalid_receipt_input"]),
  },
) {}

export interface Interface {
  readonly start: (input: StartInput) => Effect.Effect<void, ReceiptStoreError>;
  readonly complete: (input: CompletionInput) => Effect.Effect<void, ReceiptStoreError>;
  readonly read: (sessionId: string) => Effect.Effect<ReceiptObservation>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@review/ReceiptStore",
) {}

export interface Options {
  readonly statePath: string;
  /** Maximum number of event identities retained in one session directory. */
  readonly maxEvents?: number;
  /** Maximum age of an event marker, in milliseconds. */
  readonly retentionMs?: number;
  readonly now?: () => number;
}

const DEFAULT_MAX_EVENTS = 256;
const DEFAULT_RETENTION_MS = 14 * 24 * 60 * 60 * 1_000;
const MAX_IDENTITY_LENGTH = 512;
const MAX_COUNT = 10_000;
const MAX_FINDINGS = 10_000;

const isObjectWithCode = (value: unknown): value is { readonly code: string } =>
  typeof value === "object" && value !== null && "code" in value && typeof value.code === "string";

const isMissing = (cause: unknown): boolean => isObjectWithCode(cause) && cause.code === "ENOENT";

const hashIdentity = (value: string): string =>
  createHash("sha256").update(`receipt-v1\0${value}`).digest("hex");

const validateIdentity = (value: string): boolean =>
  value.length > 0 && value.length <= MAX_IDENTITY_LENGTH && !/[\u0000\r\n]/u.test(value);

const boundedCount = (value: number, maximum = MAX_COUNT): number =>
  Number.isInteger(value) && value >= 0 && value <= maximum ? value : -1;

const boundedTime = (value: number): number =>
  Number.isInteger(value) && value >= 0 ? value : -1;

const categoryCode = (value: string | undefined): ReceiptCategoryCodeType => {
  if (value === undefined) return "unknown";
  const decoded = Schema.decodeUnknownOption(ReceiptCategoryCode)(value);
  return decoded._tag === "Some" ? decoded.value : "unknown";
};

const eventKey = (value: string): string => hashIdentity(value);

const sessionKey = (value: string): string => hashIdentity(value);

const sessionDirectory = (statePath: string, sessionId: string): string =>
  join(statePath, sessionKey(sessionId));

const markerPath = (
  statePath: string,
  sessionId: string,
  eventId: string,
  kind: "start" | "completion",
) => join(sessionDirectory(statePath, sessionId), `${eventKey(eventId)}.${kind}.json`);

const atomicallyCreate = async (path: string, encoded: string): Promise<void> => {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, encoded, { encoding: "utf8", mode: 0o600 });
  try {
    // A hard link gives us an atomic no-clobber publication.  Duplicate
    // deliveries therefore leave the first marker and cannot increment counts.
    await link(temporary, path);
  } catch (cause) {
    if (!isObjectWithCode(cause) || cause.code !== "EEXIST") throw cause;
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
};

const encode = (value: unknown): string => `${JSON.stringify(value)}\n`;

const validInput = (input: StartInput | CompletionInput): boolean =>
  validateIdentity(input.sessionId) && validateIdentity(input.eventId);

const readDecodedStart = async (path: string): Promise<ReceiptStartType> => {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  return await Effect.runPromise(
    Schema.decodeUnknownEffect(ReceiptStart, {
      onExcessProperty: "error",
      errors: "all",
    })(value),
  );
};

const readDecodedCompletion = async (path: string): Promise<ReceiptCompletionType> => {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  return await Effect.runPromise(
    Schema.decodeUnknownEffect(ReceiptCompletion, {
      onExcessProperty: "error",
      errors: "all",
    })(value),
  );
};

const readObservation = async (
  statePath: string,
  requestedSessionId: string,
): Promise<ReceiptObservation> => {
  if (!validateIdentity(requestedSessionId)) {
    return { events: [], limitation: "session_id_required" };
  }

  const directory = sessionDirectory(statePath, requestedSessionId);
  let entries: ReadonlyArray<{ readonly name: string }>;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (cause) {
    if (isMissing(cause)) return { events: [] };
    return { events: [], limitation: "receipt_state_unreadable" };
  }

  const starts = new Map<string, ReceiptStartType>();
  const completions = new Map<string, ReceiptCompletionType>();
  let corrupt = false;
  for (const entry of entries) {
    if (!entry.name.endsWith(".json")) continue;
    const path = join(directory, entry.name);
    try {
      if (entry.name.endsWith(".start.json")) {
        const value = await readDecodedStart(path);
        starts.set(value.eventKey, value);
      } else if (entry.name.endsWith(".completion.json")) {
        const value = await readDecodedCompletion(path);
        completions.set(value.eventKey, value);
      }
    } catch {
      corrupt = true;
    }
  }

  const keys = new Set([...starts.keys(), ...completions.keys()]);
  const events: Array<ReceiptEventObservation> = [];
  for (const key of keys) {
    const start = starts.get(key);
    const completion = completions.get(key);
    const categories: Record<string, number> = {};
    if (completion !== undefined) {
      for (const [category, count] of Object.entries(completion.categories)) {
        categories[category] = count;
      }
    }
    events.push({
      eventKey: key,
      ...(start === undefined ? {} : {
        startedAt: start.startedAt,
        expectedResults: start.expectedResults,
      }),
      ...(completion === undefined ? {} : {
        completedAt: completion.completedAt,
        resultCount: completion.resultCount,
      }),
      reviewed: completion?.reviewed ?? 0,
      skipped: completion?.skipped ?? 0,
      unavailable: completion?.unavailable ?? 0,
      findings: completion?.findings ?? 0,
      categories,
      hasStart: start !== undefined,
      hasCompletion: completion !== undefined,
    });
  }

  events.sort((left, right) =>
    (left.startedAt ?? left.completedAt ?? 0) - (right.startedAt ?? right.completedAt ?? 0),
  );
  if (events.some((event) => !event.hasStart && event.hasCompletion)) {
    return {
      events,
      limitation: "completion_without_start",
    };
  }
  return corrupt ? { events, limitation: "receipt_state_corrupt" } : { events };
};

const prune = async (
  statePath: string,
  sessionId: string,
  maxEvents: number,
  retentionMs: number,
  now: number,
): Promise<void> => {
  const directory = sessionDirectory(statePath, sessionId);
  let entries: ReadonlyArray<{ readonly name: string }>;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  const groups = new Map<string, Array<string>>();
  for (const entry of entries) {
    if (!entry.name.endsWith(".start.json") && !entry.name.endsWith(".completion.json")) continue;
    const key = entry.name.endsWith(".start.json")
      ? entry.name.slice(0, -".start.json".length)
      : entry.name.slice(0, -".completion.json".length);
    const current = groups.get(key) ?? [];
    current.push(entry.name);
    groups.set(key, current);
  }
  const timestamps = await Promise.all(
    [...groups.entries()].map(async ([key, names]) => {
      const times = await Promise.all(
        names.map(async (name) => {
          try {
            return (await stat(join(directory, name))).mtimeMs;
          } catch {
            return 0;
          }
        }),
      );
      return { key, names, timestamp: Math.max(...times) };
    }),
  );
  timestamps.sort((left, right) => right.timestamp - left.timestamp);
  for (const [index, group] of timestamps.entries()) {
    if (index < maxEvents && now - group.timestamp <= retentionMs) continue;
    await Promise.all(
      group.names.map((name) => unlink(join(directory, name)).catch(() => undefined)),
    );
  }
};

const makeService = (options: Options): Interface => {
  const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
  const retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;
  const now = options.now ?? Date.now;

  const start = Effect.fn("ReceiptStore.start")(function* (input: StartInput) {
    if (
      !validInput(input) ||
      boundedCount(input.expectedResults) < 0 ||
      (input.startedAt !== undefined && boundedTime(input.startedAt) < 0)
    ) {
      return yield* new ReceiptStoreError({ operation: "start", code: "invalid_receipt_input" });
    }
    const timestamp = input.startedAt ?? now();
    const value = {
      version: 1 as const,
      kind: "start" as const,
      sessionKey: sessionKey(input.sessionId),
      eventKey: eventKey(input.eventId),
      startedAt: timestamp,
      expectedResults: input.expectedResults,
    };
    const decoded = yield* Schema.decodeUnknownEffect(ReceiptStart, {
      onExcessProperty: "error",
      errors: "all",
    })(value).pipe(
      Effect.mapError(() => new ReceiptStoreError({ operation: "start", code: "invalid_receipt_input" })),
    );
    yield* Effect.tryPromise({
      try: async () => {
        const directory = sessionDirectory(options.statePath, input.sessionId);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await atomicallyCreate(
          markerPath(options.statePath, input.sessionId, input.eventId, "start"),
          encode(decoded),
        );
        await prune(options.statePath, input.sessionId, maxEvents, retentionMs, now());
      },
      catch: () => new ReceiptStoreError({ operation: "start", code: "receipt_state_unwritable" }),
    });
  });

  const complete = Effect.fn("ReceiptStore.complete")(function* (input: CompletionInput) {
    const expectedResults = input.expectedResults ?? input.outcomes.length;
    const findings = input.findings ?? 0;
    if (
      !validInput(input) ||
      boundedCount(expectedResults) < 0 ||
      boundedCount(findings, MAX_FINDINGS) < 0 ||
      (input.completedAt !== undefined && boundedTime(input.completedAt) < 0) ||
      input.outcomes.length > MAX_COUNT
    ) {
      return yield* new ReceiptStoreError({ operation: "complete", code: "invalid_receipt_input" });
    }
    const counts = { reviewed: 0, skipped: 0, unavailable: 0 };
    const categories: Record<string, number> = {};
    for (const outcome of input.outcomes) {
      if (outcome.status === "reviewed") counts.reviewed += 1;
      if (outcome.status === "skipped") counts.skipped += 1;
      if (outcome.status === "unavailable") counts.unavailable += 1;
      if (outcome.status !== "reviewed") {
        const key = `${outcome.status}:${categoryCode(outcome.code)}`;
        categories[key] = (categories[key] ?? 0) + 1;
      }
    }
    const timestamp = input.completedAt ?? now();
    const value = {
      version: 1 as const,
      kind: "completion" as const,
      sessionKey: sessionKey(input.sessionId),
      eventKey: eventKey(input.eventId),
      completedAt: timestamp,
      resultCount: input.outcomes.length,
      expectedResults,
      ...counts,
      findings,
      categories,
    };
    const decoded = yield* Schema.decodeUnknownEffect(ReceiptCompletion, {
      onExcessProperty: "error",
      errors: "all",
    })(value).pipe(
      Effect.mapError(() => new ReceiptStoreError({ operation: "complete", code: "invalid_receipt_input" })),
    );
    yield* Effect.tryPromise({
      try: async () => {
        const directory = sessionDirectory(options.statePath, input.sessionId);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await atomicallyCreate(
          markerPath(options.statePath, input.sessionId, input.eventId, "completion"),
          encode(decoded),
        );
        await prune(options.statePath, input.sessionId, maxEvents, retentionMs, now());
      },
      catch: () => new ReceiptStoreError({ operation: "complete", code: "receipt_state_unwritable" }),
    });
  });

  const read = Effect.fn("ReceiptStore.read")(function* (sessionId: string) {
    return yield* Effect.tryPromise({
      try: () => readObservation(options.statePath, sessionId),
      catch: () => new Error("receipt state is unreadable"),
    }).pipe(
      Effect.catch(() =>
        Effect.succeed({ events: [], limitation: "receipt_state_unreadable" as const }),
      ),
    );
  });

  return { start, complete, read };
};

export const layer = (options: Options) => Layer.succeed(Service, Service.of(makeService(options)));

export * as ReceiptStore from "./receipt-store.ts";
