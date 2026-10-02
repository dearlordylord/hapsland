import { expect, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import { mkdtempSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSecretServiceProcess } from "./secret-service-process.ts";

const fixture = (body: string) => Effect.acquireRelease(
  Effect.sync(() => {
    const directory = mkdtempSync(join(tmpdir(), "hapsland-credential-process-"));
    const helper = join(directory, "helper.cjs");
    const pidPath = join(directory, "pid");
    writeFileSync(helper, `#!${process.execPath}\n${body}\n`, { mode: 0o700 });
    return { directory, helper, pidPath };
  }),
  ({ directory }) => Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
);

const runningPid = (directory: string, pidPath: string) => Effect.callback<number>((resume) => {
  let finished = false;
  const read = () => {
    if (finished) return;
    try {
      const pid = Number(readFileSync(pidPath, "utf8"));
      if (!Number.isSafeInteger(pid) || pid <= 0) return;
      finished = true;
      observer.close();
      resume(Effect.succeed(pid));
    } catch { /* Creation and write notifications can arrive separately. */ }
  };
  const observer = watch(directory, read);
  read();
  return Effect.sync(() => observer.close());
});

const assertClosed = (pid: number) => {
  expect(() => process.kill(pid, 0)).toThrow();
};

it.live("decodes the native header and credential body without trimming", () => Effect.gen(function* () {
  const { helper } = yield* fixture('process.stdout.write(JSON.stringify({status:"present"})+"\\n value ");');
  expect(yield* runSecretServiceProcess(helper, "get", { deadlineMs: 1_500 }))
    .toEqual({ status: "present", value: " value " });
}));

it.live("maps a failed spawn to a sanitized unavailable result after closure", () => Effect.gen(function* () {
  const { directory } = yield* fixture("");
  expect(yield* runSecretServiceProcess(join(directory, "absent"), "get", { deadlineMs: 1_500 }))
    .toEqual({ status: "unavailable" });
}));

it.live("keeps mutation outcomes indeterminate when native output is malformed", () => Effect.gen(function* () {
  const { helper } = yield* fixture('process.stdout.write("not-a-native-header\\n");');
  expect(yield* runSecretServiceProcess(helper, "set", { input: "synthetic", deadlineMs: 1_500 }))
    .toEqual({ status: "indeterminate" });
}));

const hangingBody = 'require("node:fs").writeFileSync(require("node:path").join(__dirname,"pid"),String(process.pid));setInterval(()=>{},1000);';

it.live("timeout returns only after the native helper has physically closed", () => Effect.gen(function* () {
  const { directory, helper, pidPath } = yield* fixture(hangingBody);
  const ready = yield* Effect.forkChild(runningPid(directory, pidPath), { startImmediately: true });
  const running = yield* Effect.forkChild(runSecretServiceProcess(helper, "get", { deadlineMs: 1_500 }),
    { startImmediately: true });
  const pid = yield* Fiber.join(ready);
  expect(yield* Fiber.join(running)).toEqual({ status: "timed-out" });
  assertClosed(pid);
}));

it.live("fiber interruption waits for physical closure without becoming a success result", () => Effect.gen(function* () {
  const { directory, helper, pidPath } = yield* fixture(hangingBody);
  const ready = yield* Effect.forkChild(runningPid(directory, pidPath), { startImmediately: true });
  const running = yield* Effect.forkChild(runSecretServiceProcess(helper, "get", { deadlineMs: 5_000 }),
    { startImmediately: true });
  const pid = yield* Fiber.join(ready);
  yield* Fiber.interrupt(running);
  expect((yield* Fiber.await(running))._tag).toBe("Failure");
  assertClosed(pid);
}));

it.live("external abort preserves the cancelled domain result and waits for closure", () => Effect.gen(function* () {
  const { directory, helper, pidPath } = yield* fixture(hangingBody);
  const controller = new AbortController();
  const ready = yield* Effect.forkChild(runningPid(directory, pidPath), { startImmediately: true });
  const running = yield* Effect.forkChild(runSecretServiceProcess(helper, "get",
    { deadlineMs: 5_000, signal: controller.signal }), { startImmediately: true });
  const pid = yield* Fiber.join(ready);
  controller.abort();
  expect(yield* Fiber.join(running)).toEqual({ status: "cancelled" });
  assertClosed(pid);
}));
