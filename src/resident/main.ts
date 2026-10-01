#!/usr/bin/env node
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { acquireResidentOwnership, releaseResidentOwnership } from "./ownership.ts";

class ResidentProcessError extends Schema.TaggedError<ResidentProcessError>()(
  "ResidentProcessError", { operation: Schema.String },
) {}
const processEffect = <A>(operation: string, run: () => Promise<A>) => Effect.tryPromise({
  try: run, catch: () => new ResidentProcessError({ operation }),
});

// Signal callbacks are a process boundary. Cancellation removes the handlers;
// the resident scope owns every resource released after a signal or idle exit.
const stopped = Effect.callback<void>((resume) => {
  const stop = () => resume(Effect.void);
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  process.once("beforeExit", stop);
  return Effect.sync(() => {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    process.removeListener("beforeExit", stop);
  });
});

const run = Effect.fn("ResidentProcess.run")(function* () {
  const directory = process.argv[2];
  if (directory === undefined) return yield* Effect.fail(new ResidentProcessError({ operation: "runtime directory is required" }));
  yield* processEffect("create runtime directory", () => mkdir(directory, { recursive: true, mode: 0o700 }));
  const lock = join(directory, "owner.lock");
  const acquired = yield* Effect.acquireRelease(
    processEffect("acquire resident ownership", () => acquireResidentOwnership(lock)),
    (owned) => owned ? processEffect("release resident ownership", () => releaseResidentOwnership(lock)).pipe(Effect.orDie) : Effect.void,
  );
  if (!acquired) return;

  // Only the winner loads the review runtime. Competing hook clients never
  // acquire resident state, a command executor or provider services.
  const { ResidentServer } = yield* processEffect("load resident runtime", () => import("./server.ts"));
  const clockPath = yield* Config.option(Config.String("REVIEW_RESIDENT_CLOCK_PATH"));
  const now = Option.isNone(clockPath) ? () => performance.now() : () => Number(readFileSync(clockPath.value, "utf8"));
  const server = yield* Effect.acquireRelease(
    Effect.sync(() => new ResidentServer({ directory, socket: join(directory, "resident.sock"), lock, owner: join(directory, "owner.json") }, now)),
    (server) => server.closeEffect.pipe(Effect.orDie),
  );
  yield* server.listenEffect().pipe(Effect.mapError(() => new ResidentProcessError({ operation: "listen on resident socket" })));
  yield* processEffect("clear startup diagnostic", () => rm(`${lock}.startup-error`, { force: true }));
  yield* Effect.never;
});

await Effect.runPromise(Effect.scoped(run().pipe(Effect.raceFirst(stopped))).pipe(
  Effect.catch((error) => Effect.sync(() => {
    // Launcher diagnostics contain operation labels, never captured source,
    // provider responses or credentials from an infrastructure error.
    console.error(error._tag === "ResidentProcessError" ? `resident startup failed: ${error.operation}` : "resident configuration failed");
    process.exitCode = 1;
  })),
));
