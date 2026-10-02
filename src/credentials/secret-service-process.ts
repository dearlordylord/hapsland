import { spawn } from "node:child_process";
import { Effect, Schema } from "effect";
import type { SecretServiceResult, SecretServiceStatus } from "./secret-service.ts";

export type SecretServiceOperation = "probe" | "get" | "set" | "delete";
export type SecretServiceProcessOptions = {
  readonly input?: string;
  readonly deadlineMs: number;
  readonly signal?: AbortSignal;
  readonly allowInteraction?: boolean;
};

class CredentialHelperStartError extends Schema.TaggedError<CredentialHelperStartError>()(
  "CredentialHelperStartError", {},
) {}

const decodeResult = (operation: SecretServiceOperation, output: Buffer): SecretServiceResult => {
  const malformedStatus = operation === "set" ? "indeterminate" : "unavailable";
  try {
    const newline = output.indexOf(0x0a);
    if (newline < 0) return { status: malformedStatus };
    const header: unknown = JSON.parse(output.subarray(0, newline).toString("utf8"));
    if (typeof header !== "object" || header === null || !("status" in header)) return { status: malformedStatus };
    const status = header.status;
    const allowed: ReadonlyArray<SecretServiceStatus> = [
      "available", "stored", "deleted", "present", "missing", "locked", "interaction-required",
      "invalid", "unavailable", "indeterminate",
    ];
    if (typeof status !== "string" || !allowed.includes(status as SecretServiceStatus)) return { status: malformedStatus };
    if (status === "present") {
      const value = output.subarray(newline + 1).toString("utf8");
      return value.length === 0 || Buffer.byteLength(value, "utf8") > 32_768
        ? { status: "invalid" } : { status, value };
    }
    return { status: status as SecretServiceStatus };
  } catch { return { status: malformedStatus }; }
};

const makeProcess = Effect.fn("CredentialHelper.acquire")((helper: string, operation: SecretServiceOperation,
  options: SecretServiceProcessOptions) => Effect.try({
  try: () => {
    const child = spawn(helper, options.allowInteraction === true ? [operation, "--allow-interaction"] : [operation],
      { stdio: ["pipe", "pipe", "ignore"], env: process.env });
    let outcome: SecretServiceResult | undefined;
    let termination: "timed-out" | "cancelled" | undefined;
    let errored = false;
    let total = 0;
    const chunks: Buffer[] = [];
    const waiters = new Set<(value: SecretServiceResult) => void>();
    const terminate = (reason: "timed-out" | "cancelled") => {
      if (outcome !== undefined) return;
      termination ??= reason;
      child.kill("SIGKILL");
    };
    const abort = () => terminate("cancelled");
    options.signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total <= 65_536) chunks.push(chunk);
      else child.kill("SIGKILL");
    });
    child.stdin.on("error", () => child.kill("SIGKILL"));
    // A spawn error is not physical closure. Retain ownership until close.
    child.on("error", () => { errored = true; });
    child.once("close", () => {
      options.signal?.removeEventListener("abort", abort);
      const output = Buffer.concat(chunks);
      outcome = termination === undefined
        ? errored ? { status: "unavailable" } : decodeResult(operation, output)
        : { status: termination };
      output.fill(0);
      for (const chunk of chunks) chunk.fill(0);
      chunks.length = 0;
      for (const finish of waiters) finish(outcome);
      waiters.clear();
    });
    if (options.signal?.aborted === true) abort();
    const wait = Effect.callback<SecretServiceResult>((resume) => {
      if (outcome !== undefined) { resume(Effect.succeed(outcome)); return; }
      const finish = (value: SecretServiceResult) => resume(Effect.succeed(value));
      waiters.add(finish);
      return Effect.sync(() => { waiters.delete(finish); });
    });
    // Publish ownership before sending input: a synchronous write failure must
    // still run the process finalizer and await its physical close event.
    const sendInput = Effect.try({
      try: () => { child.stdin.end(options.input); },
      catch: () => new CredentialHelperStartError(),
    });
    return { wait, sendInput, terminate: Effect.fn("CredentialHelper.terminate")((reason: "timed-out" | "cancelled") =>
      Effect.sync(() => terminate(reason))) };
  },
  catch: () => new CredentialHelperStartError(),
}));

/** A timeout requests termination; every exit waits for native process closure. */
export const runSecretServiceProcess = Effect.fn("CredentialHelper.run")((helper: string,
  operation: SecretServiceOperation, options: SecretServiceProcessOptions) => Effect.acquireUseRelease(
  makeProcess(helper, operation, options),
  (process) => process.sendInput.pipe(Effect.andThen(process.wait), Effect.timeoutOrElse({
    duration: options.deadlineMs,
    orElse: () => process.terminate("timed-out").pipe(Effect.andThen(process.wait)),
  })),
  (process) => process.terminate("cancelled").pipe(Effect.andThen(process.wait), Effect.asVoid),
).pipe(Effect.catch(() => Effect.succeed<SecretServiceResult>({ status: "unavailable" }))));
