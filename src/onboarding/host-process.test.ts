import { DEFAULT_CHILD_TIMEOUT_MS } from "../../scripts/test-harness/policy.mjs";
import { Effect, Fiber } from "effect";
import { it as effectIt } from "@effect/vitest";
import { mkdtempSync, readFileSync, rmSync, watch } from "node:fs";
import { spawnSync } from "../../scripts/test-harness/process.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { execFileClosedStdin, execFileClosedStdinBuffer, spawnInherited } from "./host-process.ts";

describe("native host process", () => {
  it("closes stdin so a prompt argument can start without waiting for the deadline", async () => {
    const result = await Effect.runPromise(execFileClosedStdin(process.execPath, [
      "-e", "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('ready'))",
    ], { env: process.env, timeout: 2_000, maxBuffer: 1_024 }));
    expect(result.stdout).toBe("ready");
  });
});

effectIt.live("timeout kills a host that ignores SIGTERM and waits for physical closure", () => Effect.gen(function* () {
  const result = yield* execFileClosedStdin(process.execPath, ["-e",
    "process.on('SIGTERM',()=>{});process.stdout.write(String(process.pid));setInterval(()=>{},1000)",
  ], { env: process.env, timeout: 300, maxBuffer: 1_024 });
  const pid = Number(result.stdout);
  expect(pid).toBeGreaterThan(0);
  expect(result).toMatchObject({ succeeded: false, timedOut: true });
  expect(() => process.kill(pid, 0)).toThrow();
}));

effectIt.live("interruption waits for native close and remains interrupted", () => Effect.gen(function* () {
  const directory = yield* Effect.acquireRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "codex-host-interrupt-"))),
    (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
  );
  const pidPath = join(directory, "pid");
  const ready = yield* Effect.forkChild(Effect.callback<number>((resume) => {
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
  }), { startImmediately: true });
  const running = yield* Effect.forkChild(execFileClosedStdin(process.execPath, ["-e",
    `require('node:fs').writeFileSync(${JSON.stringify(pidPath)},String(process.pid));setInterval(()=>{},1000)`,
  ], { env: process.env, timeout: 5_000, maxBuffer: 1_024 }), { startImmediately: true });
  const pid = yield* Fiber.join(ready);
  yield* Fiber.interrupt(running);
  expect((yield* Fiber.await(running))._tag).toBe("Failure");
  expect(() => process.kill(pid, 0)).toThrow();
}));
effectIt.live("inherited process interruption waits for physical close and remains interrupted", () => Effect.gen(function* () {
  const directory = yield* Effect.acquireRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "codex-host-interrupt-"))),
    (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
  );
  const pidPath = join(directory, "pid");
  const ready = yield* Effect.forkChild(Effect.callback<number>((resume) => {
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
  }), { startImmediately: true });
  const running = yield* Effect.forkChild(spawnInherited(process.execPath, ["-e",
    `require('node:fs').writeFileSync(${JSON.stringify(pidPath)},String(process.pid));setInterval(()=>{},1000)`,
  ], process.env), { startImmediately: true });
  const pid = yield* Fiber.join(ready);
  yield* Fiber.interrupt(running);
  expect((yield* Fiber.await(running))._tag).toBe("Failure");
  expect(() => process.kill(pid, 0)).toThrow();
}));

effectIt.live("failed spawn and command exit return structured outcomes without raw errors", () => Effect.gen(function* () {
  const missing = yield* execFileClosedStdin("/nonexistent-hapsland-host", [],
    { env: process.env, timeout: 1_000, maxBuffer: 1_024 });
  expect(missing).toEqual({ succeeded: false, timedOut: false, exitCode: null, stdout: "", stderr: "" });
  const failed = yield* execFileClosedStdin(process.execPath, ["-e",
    "process.stdout.write('synthetic-output');process.stderr.write('synthetic-authentication-error');process.exitCode=2",
  ], { env: process.env, timeout: 1_000, maxBuffer: 1_024 });
  expect(failed).toEqual({ succeeded: false, timedOut: false, exitCode: 2,
    stdout: "synthetic-output", stderr: "synthetic-authentication-error" });
}));

it("sends UTF-8 lifecycle input then EOF before completing the child", async () => {
  const result = await Effect.runPromise(execFileClosedStdin(process.execPath, ["-e",
    "let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>text+=chunk);process.stdin.on('end',()=>process.stdout.write(JSON.stringify({matches:text===JSON.stringify({version:1,label:'тест'}),ended:true})))",
  ], { env: process.env, input: JSON.stringify({ version: 1, label: "тест" }), timeout: 2_000, maxBuffer: 1_024 }));
  expect(result.succeeded).toBe(true);
  expect(JSON.parse(result.stdout)).toEqual({ matches: true, ended: true });
});


it("inherited package processes preserve native stdin, output streams and exit code", () => {
  const childCode = "let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{process.stdout.write(JSON.stringify({received:input==='synthetic input'})+'\\n');process.stderr.write('synthetic stderr');process.exitCode=7;});";
  const parentCode = `import { Effect } from 'effect';import { spawnInherited } from './src/onboarding/host-process.ts';const result=await Effect.runPromise(spawnInherited(process.execPath,['-e',${JSON.stringify(childCode)}],process.env));process.stdout.write(JSON.stringify(result)+'\\n');`;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", parentCode], {
    cwd: process.cwd(), input: "synthetic input", encoding: "utf8", timeout: DEFAULT_CHILD_TIMEOUT_MS,
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("synthetic stderr");
  expect(result.stdout.trim().split("\n").map(line => JSON.parse(line))).toEqual([
    { received: true }, { started: true, exitCode: 7 },
  ]);
});

effectIt.live("inherited process failed startup returns a bounded outcome", () => Effect.gen(function* () {
  expect(yield* spawnInherited("/nonexistent-hapsland-package", [], process.env)).toEqual({ started: false, exitCode: null });
}));

effectIt.live("binary native helper output preserves bytes before UTF-8 validation", () => Effect.gen(function* () {
  const result = yield* execFileClosedStdinBuffer(process.execPath, ["-e",
    "process.stdout.write(Buffer.from([0,255,240,40,140,188]))",
  ], { env: process.env, timeout: 2_000, maxBuffer: 1_024 });
  expect(result.succeeded).toBe(true);
  expect([...result.stdout]).toEqual([0, 255, 240, 40, 140, 188]);
}));
