import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import {
  DiagnosticEvent,
  DiagnosticObservation,
  DiagnosticProblem,
  initialDiagnosticState,
} from "./domain.ts";
import type { DiagnosticReducerState } from "./domain.ts";
import { reduceDiagnostic } from "./reducer.ts";

export interface Interface {
  /** Record an outcome and return it even when host notification is suppressed. */
  readonly observe: (
    event: DiagnosticEvent,
  ) => Effect.Effect<DiagnosticObservation>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@review/DiagnosticStore",
) {}

const PersistedQuietState = Schema.Struct({
  version: Schema.Literal(1),
  announced: Schema.Array(DiagnosticProblem),
  active: Schema.optionalKey(Schema.Never),
  activeWasNotified: Schema.Literal(false),
});

const PersistedActiveState = Schema.Struct({
  version: Schema.Literal(1),
  announced: Schema.Array(DiagnosticProblem),
  active: DiagnosticProblem,
  activeWasNotified: Schema.Boolean,
});

const PersistedState = Schema.Union([
  PersistedQuietState,
  PersistedActiveState,
]);
type PersistedState = typeof PersistedState.Type;

const defaultDirectory = join(
  tmpdir(),
  `realtime-review-tool-diagnostics-v1-${typeof process.getuid === "function" ? process.getuid() : "user"}`,
);

const scopeKey = (event: DiagnosticEvent): string =>
  createHash("sha256")
    .update(`${event.scope.sessionId}\0${event.scope.repository}\0${event.scope.backend}`)
    .digest("hex");

const stateFromPersisted = (value: PersistedState): DiagnosticReducerState =>
  !("active" in value)
    ? {
        announced: value.announced,
        activeWasNotified: false,
      }
    : {
        announced: value.announced,
        active: value.active,
        activeWasNotified: value.activeWasNotified,
      };

const persistedFromState = (state: DiagnosticReducerState): PersistedState =>
  !("active" in state)
    ? {
        version: 1,
        announced: [...state.announced],
        activeWasNotified: false,
      }
    : {
        version: 1,
        announced: [...state.announced],
        active: state.active,
        activeWasNotified: state.activeWasNotified,
      };

const readState = async (path: string): Promise<DiagnosticReducerState> => {
  try {
    const encoded = await readFile(path, "utf8");
    const unknown: unknown = JSON.parse(encoded);
    const decoded = Schema.decodeUnknownSync(PersistedState, {
      onExcessProperty: "error",
    })(unknown);
    return stateFromPersisted(decoded);
  } catch (cause) {
    if (
      typeof cause === "object" &&
      cause !== null &&
      "code" in cause &&
      cause.code === "ENOENT"
    ) {
      return initialDiagnosticState;
    }
    // Corrupt diagnostic state must not block a completed edit.  Starting a
    // fresh bounded state can repeat one warning, but cannot leak its contents.
    return initialDiagnosticState;
  }
};

const writeState = async (path: string, state: DiagnosticReducerState) => {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(
      temporary,
      `${JSON.stringify(persistedFromState(state))}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
};

const acquireLock = async (path: string): Promise<() => Promise<void>> => {
  // Hook invocations are short. A bounded retry lets a concurrent invocation
  // observe the committed state instead of racing it, while the final fallback
  // remains fail-open if a filesystem is unavailable.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const handle = await open(path, "wx", 0o600);
      return async () => {
        await handle.close();
        await unlink(path).catch(() => undefined);
      };
    } catch (cause) {
      if (
        !(
          typeof cause === "object" &&
          cause !== null &&
          "code" in cause &&
          cause.code === "EEXIST"
        )
      ) {
        throw cause;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 2));
    }
  }
  throw new Error("diagnostic state lock timed out");
};

const observeFile = async (
  directory: string,
  event: DiagnosticEvent,
): Promise<DiagnosticObservation> => {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const base = join(directory, scopeKey(event));
  const statePath = `${base}.json`;
  const lockPath = `${base}.lock`;
  let release: (() => Promise<void>) | undefined;
  try {
    release = await acquireLock(lockPath);
    const current = await readState(statePath);
    const reduction = reduceDiagnostic(current, event);
    await writeState(statePath, reduction.state);
    return reduction.observation;
  } catch {
    // Persistence is best effort. Keep the product fail-open and return an
    // accurate structured outcome, but do not pretend that suppression held.
    return reduceDiagnostic(initialDiagnosticState, event).observation;
  } finally {
    await release?.().catch(() => undefined);
  }
};

export interface LayerOptions {
  readonly statePath?: string;
}

/** Process-boundary store. State filenames contain only a SHA-256 scope key. */
export const layer = (options: LayerOptions = {}) =>
  Layer.succeed(
    Service,
    Service.of({
      observe: Effect.fn("DiagnosticStore.observe")(function* (
        event: DiagnosticEvent,
      ) {
        return yield* Effect.tryPromise(() =>
          observeFile(options.statePath ?? defaultDirectory, event),
        ).pipe(
          Effect.catch(() =>
            Effect.succeed(reduceDiagnostic(initialDiagnosticState, event).observation),
          ),
        );
      }),
    }),
  );

/** In-memory layer for deterministic tests and single-process callers. */
export const testLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const states = yield* Ref.make(
      new Map<string, DiagnosticReducerState>(),
    );
    return Service.of({
      observe: Effect.fn("DiagnosticStore.Test.observe")(function* (
        event: DiagnosticEvent,
      ) {
        return yield* Ref.modify(states, (current) => {
          const key = scopeKey(event);
          const reduction = reduceDiagnostic(
            current.get(key) ?? initialDiagnosticState,
            event,
          );
          const next = new Map(current);
          next.set(key, reduction.state);
          return [reduction.observation, next] as const;
        });
      }),
    });
  }),
);

export const makeInMemory = (): Effect.Effect<Interface> =>
  Effect.gen(function* () {
    const states = yield* Ref.make(
      new Map<string, DiagnosticReducerState>(),
    );
    return {
      observe: Effect.fn("DiagnosticStore.InMemory.observe")(function* (
        event: DiagnosticEvent,
      ) {
        return yield* Ref.modify(states, (current) => {
          const key = scopeKey(event);
          const reduction = reduceDiagnostic(
            current.get(key) ?? initialDiagnosticState,
            event,
          );
          const next = new Map(current);
          next.set(key, reduction.state);
          return [reduction.observation, next] as const;
        });
      }),
    } satisfies Interface;
  });

export * as DiagnosticStore from "./store.ts";
