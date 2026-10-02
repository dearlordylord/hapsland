import { execFile } from "node:child_process";
import { Effect, Schema } from "effect";

export type HostProcessOptions = {
  readonly env: NodeJS.ProcessEnv;
  readonly input?: string;
  readonly cwd?: string;
  readonly timeout: number;
  readonly maxBuffer: number;
};
export type HostProcessResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly succeeded: boolean;
  readonly timedOut: boolean;
};
class HostProcessStartError extends Schema.TaggedError<HostProcessStartError>()("HostProcessStartError", {}) {}
const failedStart: HostProcessResult = { stdout: "", stderr: "", succeeded: false, timedOut: false };

const acquireProcess = Effect.fn("HostProcess.acquireProcess")((executable: string, args: ReadonlyArray<string>,
  options: HostProcessOptions) => Effect.try({
  try: () => {
    let output: { readonly stdout: string; readonly stderr: string; readonly succeeded: boolean } | undefined;
    let closed = false;
    let timedOut = false;
    let outcome: HostProcessResult | undefined;
    const waiters = new Set<(result: HostProcessResult) => void>();
    const settle = () => {
      if (!closed || output === undefined || outcome !== undefined) return;
      outcome = { ...output, timedOut };
      for (const finish of waiters) finish(outcome);
      waiters.clear();
    };
    const { input, ...nativeOptions } = options;
    const child = execFile(executable, [...args], { ...nativeOptions, timeout: 0, encoding: "utf8" }, (cause, stdout, stderr) => {
      output = { stdout, stderr, succeeded: cause === null };
      settle();
    });
    child.once("close", () => { closed = true; settle(); });
    child.stdin?.on("error", () => { if (!closed) child.kill("SIGKILL"); });
    const wait = Effect.callback<HostProcessResult>((resume) => {
      if (outcome !== undefined) { resume(Effect.succeed(outcome)); return; }
      const finish = (result: HostProcessResult) => resume(Effect.succeed(result));
      waiters.add(finish);
      return Effect.sync(() => { waiters.delete(finish); });
    });
    const terminate = Effect.fn("HostProcess.terminate")((timeout: boolean) => Effect.sync(() => {
      if (closed) return;
      timedOut ||= timeout;
      child.kill("SIGKILL");
    }));
    // Publish ownership before input closure, including synchronous failures.
    const closeInput = Effect.try({ try: () => { child.stdin?.end(input); }, catch: () => new HostProcessStartError() });
    return { wait, terminate, closeInput };
  }, catch: () => new HostProcessStartError(),
}));

/** Sends optional input and closes stdin; ownership lasts through callback and physical close. */
export const execFileClosedStdin = Effect.fn("HostProcess.run")((executable: string, args: ReadonlyArray<string>,
  options: HostProcessOptions) => Effect.acquireUseRelease(
  acquireProcess(executable, args, options),
  (process) => process.closeInput.pipe(Effect.andThen(process.wait), Effect.timeoutOrElse({
    duration: options.timeout,
    orElse: () => process.terminate(true).pipe(Effect.andThen(process.wait)),
  })),
  (process) => process.terminate(false).pipe(Effect.andThen(process.wait), Effect.asVoid),
).pipe(Effect.catch(() => Effect.succeed(failedStart))));
