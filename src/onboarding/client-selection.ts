import { Effect, Schema } from "effect";
import { emitKeypressEvents } from "node:readline";

export type SetupClient = "claude" | "codex";
export type ClientChoice = {
  readonly host: SetupClient;
  readonly name: string;
  readonly status: "installed" | "not installed" | "needs attention" | "unavailable";
};

export type SelectionKey = { readonly name?: string; readonly ctrl?: boolean };
export interface SelectionTerminal {
  readonly available: boolean;
  readonly raw: () => boolean;
  readonly setRaw: (raw: boolean) => void;
  readonly resume: () => void;
  readonly pause: () => void;
  readonly write: (text: string) => void;
  readonly listen: (key: (value: string, key: SelectionKey) => void,
    error: (error: Error) => void, end: () => void) => () => void;
  readonly interrupted: () => void;
}
const nativeTerminal: SelectionTerminal = {
  get available() { return Boolean(process.stdin.isTTY && process.stderr.isTTY); },
  raw: () => process.stdin.isRaw,
  setRaw: (raw) => process.stdin.setRawMode(raw),
  resume: () => { process.stdin.resume(); },
  pause: () => { process.stdin.pause(); },
  write: (text) => { process.stderr.write(text); },
  interrupted: () => { process.exitCode = 130; },
  listen: (key, error, end) => {
    emitKeypressEvents(process.stdin);
    process.stdin.on("keypress", key);
    process.stdin.on("error", error);
    process.stdin.on("end", end);
    return () => {
      process.stdin.off("keypress", key);
      process.stdin.off("error", error);
      process.stdin.off("end", end);
    };
  },
};
export class ClientSelectionError extends Schema.TaggedError<ClientSelectionError>()("ClientSelectionError", {
  message: Schema.String,
}) {}
const selectionError = (cause: unknown) => new ClientSelectionError({
  message: cause instanceof Error ? cause.message : "client selection failed",
});

/** Selection controls which profiles to set up; it never removes existing registrations. */
export const selectSetupClients = Effect.fn("ClientSelection.select")(function* (
  choices: ReadonlyArray<ClientChoice>, terminal: SelectionTerminal = nativeTerminal,
) {
  if (!terminal.available) return yield* Effect.fail(new ClientSelectionError({
    message: "Client selection needs a terminal. Use hapsland setup claude or hapsland setup codex, or --setup JSON for automation.",
  }));
  return yield* Effect.acquireUseRelease(
    Effect.try({ try: () => ({ raw: terminal.raw(), remove: () => {} }), catch: selectionError }),
    (owned) => Effect.callback<ReadonlyArray<SetupClient>, ClientSelectionError>((complete) => {
      const selected = new Set(choices.filter(choice => choice.status === "installed").map(choice => choice.host));
      let cursor = 0;
      let renderedLines = 0;
      let settled = false;
      const finish = (result: Effect.Effect<ReadonlyArray<SetupClient>, ClientSelectionError>) => {
        if (settled) return;
        settled = true;
        complete(result);
      };
      const render = () => {
        if (renderedLines > 0) terminal.write(`\x1b[${renderedLines}A\x1b[J`);
        const lines = ["Choose clients to set up",
          "Arrows: move · Space: toggle · Enter: continue · Esc: cancel",
          ...choices.map((choice, index) => `${index === cursor ? ">" : " "} [${selected.has(choice.host) ? "x" : " "}] ${choice.name} — ${choice.status}`),
          "Unchecking a client keeps its existing installation."];
        renderedLines = lines.length;
        terminal.write(lines.join("\n") + "\n");
      };
      const onError = (cause: Error) => finish(Effect.fail(selectionError(cause)));
      const onKey = (_value: string, key: SelectionKey) => {
        if (settled) return;
        try {
          if (key.ctrl && key.name === "c") { terminal.interrupted(); finish(Effect.succeed([])); return; }
          if (key.name === "escape") { finish(Effect.succeed([])); return; }
          if (key.name === "return") { finish(Effect.succeed(choices.filter(choice => selected.has(choice.host)).map(choice => choice.host))); return; }
          if (key.name === "up" && choices.length > 0) cursor = (cursor + choices.length - 1) % choices.length;
          else if (key.name === "down" && choices.length > 0) cursor = (cursor + 1) % choices.length;
          else if (key.name === "space") {
            const choice = choices[cursor];
            if (choice !== undefined) {
              if (selected.has(choice.host)) selected.delete(choice.host);
              else selected.add(choice.host);
            }
          } else return;
          render();
        } catch (cause) { finish(Effect.fail(selectionError(cause))); }
      };
      try {
        owned.remove = terminal.listen(onKey, onError,
          () => onError(new Error("Terminal input ended before client selection completed")));
        terminal.setRaw(true);
        terminal.resume();
        render();
      } catch (cause) { finish(Effect.fail(selectionError(cause))); }
      return Effect.sync(() => { settled = true; });
    }),
    (owned) => Effect.try({ try: () => { owned.remove(); terminal.setRaw(owned.raw); terminal.pause(); }, catch: selectionError }),
  );
});
