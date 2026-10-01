import { Context, Effect, Layer } from "effect";
import type { Writable } from "node:stream";

/** A write callback records runtime submission, not observation by the agent.
 * "failed" means no bytes were passed to stdout. */
export type WriteOutcome = "written" | "failed" | "uncertain";
export type EncodedWriteOutcome = "written" | "error" | "timed-out";

export interface HookOutputPort {
  readonly writable: () => boolean;
  readonly write: (encoded: string, complete: (error?: Error | null) => void) => void;
  readonly settleErrors: () => Effect.Effect<void>;
  readonly onError: (listener: () => void) => () => void;
}

export class HookOutput extends Context.Service<HookOutput, {
  readonly write: (value: unknown, deadlineAt: number) => Effect.Effect<WriteOutcome>;
  readonly writeEncoded: (encoded: string, deadlineAt: number) => Effect.Effect<EncodedWriteOutcome>;
}>()("Hapsland/HookOutput") {}

export const makeHookOutput = (port: HookOutputPort) => {
  const writeEncoded = Effect.fn("HookOutput.writeEncoded")(function* (encoded: string, deadlineAt: number) {
    const remaining = deadlineAt - performance.now();
    if (remaining <= 0) return "timed-out" as const;
    return yield* Effect.acquireUseRelease(
      Effect.sync(() => ({ settled: false, removeErrorListener: () => {} })),
      (observer) => Effect.callback<EncodedWriteOutcome>((resume) => {
        const finish = (outcome: EncodedWriteOutcome) => {
          if (observer.settled) return;
          observer.settled = true;
          resume(Effect.succeed(outcome));
        };
        observer.removeErrorListener = port.onError(() => finish("error"));
        try {
          port.write(encoded, (error) => finish(error == null ? "written" : "error"));
        } catch {
          finish("error");
        }
      }).pipe(Effect.timeoutOrElse({ duration: remaining, orElse: () => Effect.succeed("timed-out" as const) })),
      (observer) => Effect.gen(function* () {
        observer.settled = true;
        yield* port.settleErrors();
        observer.removeErrorListener();
      }),
    );
  });
  return HookOutput.of({
    writeEncoded,
    write: Effect.fn("HookOutput.write")(function* (value: unknown, deadlineAt: number) {
      const writeDeadline = deadlineAt - 50;
      if (writeDeadline <= performance.now() || !port.writable()) return "failed" as const;
      let encoded: string;
      try { encoded = `${JSON.stringify(value)}\n`; }
      catch { return "uncertain" as const; }
      const outcome = yield* writeEncoded(encoded, writeDeadline);
      return outcome === "written" ? "written" as const : "uncertain" as const;
    }),
  });
};

export const makeWritableHookOutput = (stream: Writable) => makeHookOutput({
  writable: () => !stream.destroyed && !stream.writableEnded,
  write: (encoded, complete) => { stream.write(encoded, complete); },
  // Writable reports callback failure before emitting its queued error event.
  // Keep the observer through that native event-loop phase before releasing it.
  settleErrors: () => Effect.callback<void>((resume) => { setImmediate(() => resume(Effect.void)); }),
  onError: (listener) => {
    stream.once("error", listener);
    return () => { stream.removeListener("error", listener); };
  },
});

export const hookOutputLayer = Layer.sync(HookOutput, () => makeWritableHookOutput(process.stdout));
