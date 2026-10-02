import { Effect, Schema } from "effect";
import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";

export class ConfirmationError extends Schema.TaggedError<ConfirmationError>()("ConfirmationError", {
  message: Schema.String,
}) {}
const failure = () => new ConfirmationError({ message: "terminal confirmation unavailable or cancelled" });

export const askConfirmation = Effect.fn("TerminalConfirmation.ask")((question: string,
  streams: { readonly input: Readable; readonly output: Writable } = { input: process.stdin, output: process.stderr },
) => Effect.acquireUseRelease(
  Effect.try({ try: () => createInterface(streams), catch: failure }),
  (prompt) => Effect.tryPromise({
    try: (signal) => prompt.question(`${question} [y/N] `, { signal }), catch: failure,
  }).pipe(Effect.map((answer) => answer.trim().toLowerCase() === "y")),
  (prompt) => Effect.sync(() => prompt.close()),
));
