import { Context, Effect, Layer } from "effect";

/** A write callback records runtime submission, not observation by the agent.
 * "failed" means no bytes were passed to stdout. */
export type WriteOutcome = "written" | "failed" | "uncertain";

export interface HookOutputPort {
  readonly writable: () => boolean;
  readonly write: (encoded: string, complete: (error?: Error | null) => void) => void;
  readonly onError: (listener: () => void) => () => void;
}

export class HookOutput extends Context.Service<HookOutput, {
  readonly write: (value: unknown, deadlineAt: number) => Effect.Effect<WriteOutcome>;
}>()("Hapsland/HookOutput") {}

export const makeHookOutput = (port: HookOutputPort) => HookOutput.of({
  write: Effect.fn("HookOutput.write")(function* (value: unknown, deadlineAt: number) {
    const remaining = deadlineAt - performance.now() - 50;
    if (remaining <= 0 || !port.writable()) return "failed" as const;
    return yield* Effect.acquireUseRelease(
      Effect.sync(() => ({ settled: false, removeErrorListener: () => {} })),
      (observer) => Effect.callback<WriteOutcome>((resume) => {
        const finish = (outcome: WriteOutcome) => {
          if (observer.settled) return;
          observer.settled = true;
          resume(Effect.succeed(outcome));
        };
        observer.removeErrorListener = port.onError(() => finish("uncertain"));
        try {
          port.write(`${JSON.stringify(value)}\n`, (error) => finish(error == null ? "written" : "uncertain"));
        } catch {
          finish("uncertain");
        }
      }).pipe(Effect.timeoutOrElse({ duration: remaining, orElse: () => Effect.succeed("uncertain" as const) })),
      (observer) => Effect.sync(() => {
        observer.settled = true;
        observer.removeErrorListener();
      }),
    );
  }),
});

export const hookOutputLayer = Layer.sync(HookOutput, () => makeHookOutput({
  writable: () => !process.stdout.destroyed && !process.stdout.writableEnded,
  write: (encoded, complete) => { process.stdout.write(encoded, complete); },
  onError: (listener) => {
    process.stdout.once("error", listener);
    return () => { process.stdout.removeListener("error", listener); };
  },
}));
