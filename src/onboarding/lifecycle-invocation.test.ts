import { Effect } from "effect";
import { expect, it } from "vitest";
import { invokeLifecycle } from "./client-lifecycle.ts";

it("sends lifecycle request through EOF and decodes the checked response", async () => {
  const output = await Effect.runPromise(invokeLifecycle(process.execPath, ["-e",
    "let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{const request=JSON.parse(input);process.stdout.write(JSON.stringify({status:request.operation==='uninstall'?'complete':'conflict'}))})",
  ], "codex", { version: 1, operation: "uninstall" }));
  expect(output.status).toBe("complete");
});

it("accepts a checked partial result from a nonzero child exit", async () => {
  const output = await Effect.runPromise(invokeLifecycle(process.execPath, ["-e",
    "process.stdout.write(JSON.stringify({status:'partial'}));process.exitCode=5",
  ], "claude", { version: 1 }));
  expect(output.status).toBe("partial");
});

it("rejects malformed output without exposing the child payload", async () => {
  const result = await Effect.runPromise(invokeLifecycle(process.execPath, ["-e",
    "process.stdout.write('synthetic-private-payload')",
  ], "codex", { version: 1 }).pipe(Effect.result));
  expect(result).toMatchObject({ _tag: "Failure", failure: {
    _tag: "LifecycleInvocationError",
    message: "codex: package returned an unreadable lifecycle result. Run hapsland doctor codex.",
  } });
  expect(JSON.stringify(result)).not.toContain("synthetic-private-payload");
});
