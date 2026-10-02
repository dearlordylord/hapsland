import { Cause, Duration, Effect, Schedule, Schema } from "effect";
import { spawnSync } from "node:child_process";
import { closeSync, constants, openSync, readSync } from "node:fs";
import { terminalModeArguments } from "./terminal.ts";

export class MaskedInputError extends Schema.TaggedError<MaskedInputError>()("MaskedInputError", {
  message: Schema.String,
}) {}
const unavailable = () => new MaskedInputError({ message: "masked terminal input is unavailable; retry with --credential-stdin" });

export const readMaskedCredential = Effect.fn("CredentialTerminal.readMasked")(function* () {
  return yield* Effect.acquireUseRelease(
    Effect.try({ try: () => ({
      descriptor: openSync("/dev/tty", constants.O_RDONLY | constants.O_NONBLOCK),
      mode: "", prompted: false, value: Buffer.alloc(0),
      handlers: new Map<NodeJS.Signals, () => void>(),
    }), catch: unavailable }),
    (owned) => Effect.gen(function* () {
      yield* Effect.try({ try: () => {
        const original = spawnSync("stty", terminalModeArguments(process.platform, "-g"), {
          encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
        });
        owned.mode = original.status === 0 ? original.stdout.trim() : "";
        if (owned.mode.length === 0) throw unavailable();
        const disabled = spawnSync("stty", terminalModeArguments(process.platform, "-echo"), { stdio: "ignore" });
        if (disabled.status !== 0) throw unavailable();
        owned.prompted = true;
        process.stderr.write("Jev API key: ");
      }, catch: unavailable });
      const cancelled = Effect.callback<never, MaskedInputError>((complete) => {
        for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
          const handler = () => complete(Effect.fail(new MaskedInputError({ message: "credential input cancelled" })));
          owned.handlers.set(signal, handler);
          process.once(signal, handler);
        }
      });
      const poll = Effect.fn("CredentialTerminal.poll")(() => Effect.try({ try: () => {
        const chunk = Buffer.alloc(256);
        try {
          const count = readSync(owned.descriptor, chunk, 0, chunk.length, null);
          if (count === 0) return undefined;
          const previous = owned.value;
          owned.value = Buffer.concat([previous, chunk.subarray(0, count)]);
          previous.fill(0);
          if (owned.value.length > 32_768) throw new MaskedInputError({ message: "credential input is too long" });
          const newline = owned.value.findIndex((byte) => byte === 0x0a || byte === 0x0d);
          return newline < 0 ? undefined : owned.value.subarray(0, newline).toString("utf8");
        } catch (cause) {
          if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "EAGAIN") return undefined;
          throw cause;
        } finally { chunk.fill(0); }
      }, catch: (cause) => cause instanceof MaskedInputError ? cause : new MaskedInputError({ message: "credential input unavailable" }) }));
      const schedule = Schedule.fromStep(Effect.succeed((_now: number, value: string | undefined) =>
        value === undefined
          ? Effect.succeed([undefined, Duration.millis(10)] as [string | undefined, Duration.Duration])
          : Cause.done(value)));
      const reading = Effect.sleep("10 millis").pipe(Effect.andThen(poll().pipe(Effect.repeat(schedule))));
      const value = yield* Effect.raceFirst(reading, cancelled);
      if (value === undefined) return yield* Effect.fail(unavailable());
      return value;
    }),
    (owned) => Effect.try({ try: () => {
      for (const [signal, handler] of owned.handlers) process.off(signal, handler);
      owned.value.fill(0);
      let failed = false;
      try { closeSync(owned.descriptor); } catch { failed = true; }
      if (owned.mode.length > 0) {
        let restored = false;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          try {
            spawnSync("stty", terminalModeArguments(process.platform, owned.mode), { stdio: "ignore" });
            const observed = spawnSync("stty", terminalModeArguments(process.platform, "-g"), {
              encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
            });
            if (observed.status === 0 && observed.stdout.trim() === owned.mode) { restored = true; break; }
          } catch { /* bounded native restoration attempts */ }
        }
        if (!restored) failed = true;
      }
      if (owned.prompted) { try { process.stderr.write("\n"); } catch { failed = true; } }
      if (failed) throw new Error("credential terminal restoration failed");
    }, catch: () => new MaskedInputError({ message: "credential terminal restoration failed" }) }),
  );
});
