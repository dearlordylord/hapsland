import { Effect, Schema } from "effect";
import { emitKeypressEvents } from "node:readline";

export type SetupClient = "claude" | "codex" | "pi";
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
  readonly listen: (
    key: (value: string, key: SelectionKey) => void,
    error: (error: Error) => void,
    end: () => void,
  ) => () => void;
  readonly interrupted: () => void;
}
const nativeTerminal: SelectionTerminal = {
  get available() {
    return Boolean(process.stdin.isTTY && process.stderr.isTTY);
  },
  raw: () => process.stdin.isRaw,
  setRaw: (raw) => process.stdin.setRawMode(raw),
  resume: () => {
    process.stdin.resume();
  },
  pause: () => {
    process.stdin.pause();
  },
  write: (text) => {
    process.stderr.write(text);
  },
  interrupted: () => {
    process.exitCode = 130;
  },
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
const selectionError = (cause: unknown) =>
  new ClientSelectionError({
    message: cause instanceof Error ? cause.message : "client selection failed",
  });

type SelectionAction = "interrupt" | "cancel" | "confirm" | "up" | "down" | "toggle" | "ignore";
const selectionActions: ReadonlyMap<string, SelectionAction> = new Map([
  ["escape", "cancel"],
  ["return", "confirm"],
  ["up", "up"],
  ["down", "down"],
  ["space", "toggle"],
]);
const selectionAction = (key: SelectionKey): SelectionAction => {
  if (key.ctrl && key.name === "c") return "interrupt";
  return selectionActions.get(key.name ?? "") ?? "ignore";
};
const toggleSelectedChoice = (selected: Set<SetupClient>, choice: ClientChoice | undefined): void => {
  if (choice === undefined) return;
  if (selected.has(choice.host)) selected.delete(choice.host);
  else selected.add(choice.host);
};
const shiftedCursor = (cursor: number, count: number, direction: "up" | "down"): number =>
  direction === "up" ? (cursor + count - 1) % count : (cursor + 1) % count;

/** Selection controls which profiles to set up; it never removes existing registrations. */
export const selectSetupClients = Effect.fn("ClientSelection.select")(function* (
  choices: ReadonlyArray<ClientChoice>,
  terminal: SelectionTerminal = nativeTerminal,
) {
  if (!terminal.available)
    return yield* Effect.fail(
      new ClientSelectionError({
        message:
          "Client selection needs a terminal. Use hapsland setup claude or hapsland setup codex, or --setup JSON for automation.",
      }),
    );
  return yield* Effect.acquireUseRelease(
    Effect.try({ try: () => ({ raw: terminal.raw(), remove: () => {} }), catch: selectionError }),
    (owned) =>
      Effect.callback<ReadonlyArray<SetupClient>, ClientSelectionError>((complete) => {
        const selected = new Set(
          choices.filter((choice) => choice.status === "installed").map((choice) => choice.host),
        );
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
          const lines = [
            "Choose clients to set up",
            "Arrows: move · Space: toggle · Enter: continue · Esc: cancel",
            ...choices.map(
              (choice, index) =>
                `${index === cursor ? ">" : " "} [${selected.has(choice.host) ? "x" : " "}] ${choice.name} — ${choice.status}`,
            ),
            "Unchecking a client keeps its existing installation.",
          ];
          renderedLines = lines.length;
          terminal.write(lines.join("\n") + "\n");
        };
        const onError = (cause: Error) => finish(Effect.fail(selectionError(cause)));
        const move = (direction: "up" | "down") => {
          if (choices.length === 0) return;
          cursor = shiftedCursor(cursor, choices.length, direction);
          render();
        };
        const actions: Readonly<Record<SelectionAction, () => void>> = {
          interrupt: () => {
            terminal.interrupted();
            finish(Effect.succeed([]));
          },
          cancel: () => finish(Effect.succeed([])),
          confirm: () =>
            finish(Effect.succeed(choices.filter((choice) => selected.has(choice.host)).map((choice) => choice.host))),
          up: () => move("up"),
          down: () => move("down"),
          toggle: () => {
            toggleSelectedChoice(selected, choices[cursor]);
            render();
          },
          ignore: () => {},
        };
        const onKey = (_value: string, key: SelectionKey) => {
          if (settled) return;
          try {
            actions[selectionAction(key)]();
          } catch (cause) {
            finish(Effect.fail(selectionError(cause)));
          }
        };
        try {
          owned.remove = terminal.listen(onKey, onError, () =>
            onError(new Error("Terminal input ended before client selection completed")),
          );
          terminal.setRaw(true);
          terminal.resume();
          render();
        } catch (cause) {
          finish(Effect.fail(selectionError(cause)));
        }
        return Effect.sync(() => {
          settled = true;
        });
      }),
    (owned) =>
      Effect.try({
        try: () => {
          owned.remove();
          terminal.setRaw(owned.raw);
          terminal.pause();
        },
        catch: selectionError,
      }),
  );
});
