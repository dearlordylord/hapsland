import { it, expect } from "@effect/vitest";
import { Deferred, Effect, Fiber } from "effect";
import { selectSetupClients, type SelectionKey, type SelectionTerminal } from "./client-selection.ts";

const choices = [
  { host: "claude", name: "Claude Code", status: "installed" },
  { host: "codex", name: "Codex CLI", status: "not installed" },
] as const;
const fixture = (ready: Deferred.Deferred<void>, initialRaw = false) => {
  let key: ((value: string, key: SelectionKey) => void) | undefined;
  let raw = initialRaw;
  let paused = false;
  let listening = false;
  const terminal: SelectionTerminal = {
    available: true, raw: () => raw, setRaw: (value) => { raw = value; },
    resume: () => { Deferred.doneUnsafe(ready, Effect.void); },
    pause: () => { paused = true; }, write: () => {}, interrupted: () => {},
    listen: (listener) => {
      key = listener; listening = true;
      return () => { key = undefined; listening = false; };
    },
  };
  return { terminal, press: (name: string) => key?.("", { name }),
    state: () => ({ raw, paused, listening }) };
};

it.effect("selection preserves installed defaults, accepts toggles and restores terminal ownership", () => Effect.gen(function* () {
  const ready = yield* Deferred.make<void>();
  const native = fixture(ready);
  const selecting = yield* selectSetupClients(choices, native.terminal).pipe(Effect.forkScoped);
  yield* Deferred.await(ready);
  native.press("down"); native.press("space"); native.press("return");
  expect(yield* Fiber.join(selecting)).toEqual(["claude", "codex"]);
  expect(native.state()).toEqual({ raw: false, paused: true, listening: false });
}));

it.effect("fiber interruption detaches listeners and restores the original raw mode", () => Effect.gen(function* () {
  const ready = yield* Deferred.make<void>();
  const native = fixture(ready, true);
  const selecting = yield* selectSetupClients(choices, native.terminal).pipe(Effect.forkScoped);
  yield* Deferred.await(ready);
  yield* Fiber.interrupt(selecting);
  expect((yield* Fiber.await(selecting))._tag).toBe("Failure");
  expect(native.state()).toEqual({ raw: true, paused: true, listening: false });
}));
