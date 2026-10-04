import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("maintained game caller forwards its finite supervisor deadline before compilation", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-game-caller-"));
  const receipt = join(directory, "caller.json");
  const hook = join(directory, "observe-caller.mjs");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const deadline = Date.now() + 60000;
  // Intercept the compiler boundary, then execute the real maintained caller.
  // A missing option is observable here before any Bend/clang process can start.
  writeFileSync(hook, `
import { registerHooks } from "node:module";
registerHooks({ load(url, context, nextLoad) {
  if (url.endsWith("/prototypes/canonical-defense/game-stream-runner.mjs")) {
    return { format: "module", shortCircuit: true, source: \`
      import { writeFileSync } from "node:fs";
      export async function createGameStreams(fixture, owners, options) {
        writeFileSync(process.env.HAPSLAND_GAME_CALLER_RECEIPT,
          JSON.stringify({ fixture: fixture.href, owners: owners.length, options }));
        process.exit(0);
      }
    \` };
  }
  return nextLoad(url, context);
} });
`);
  try {
    const result = spawnSync(process.execPath,
      ["--import", hook, "prototypes/canonical-defense/verify-consumer.mjs"], {
        cwd: root, encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024,
        env: { ...process.env, HAPSLAND_GAME_OUTER_DEADLINE_MS: String(deadline),
          HAPSLAND_GAME_NATIVE_RESUME_RECEIPT: "owned-explicit-receipt.json",
          HAPSLAND_GAME_CALLER_RECEIPT: receipt },
      });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const captured = JSON.parse(readFileSync(receipt, "utf8"));
    assert.ok(captured.fixture.endsWith("/DefenseConsumerConformance.bend"));
    assert.ok(captured.owners > 0);
    assert.equal(captured.options.emissionTimeoutMs, 0);
    assert.equal(captured.options.executionTimeoutMs, 180000);
    assert.equal(captured.options.overallDeadlineMs, deadline);
    assert.equal(captured.options.resumeCompilerReceipt, "owned-explicit-receipt.json");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Invalid allowances fail before source discovery or any compiler process.
test("game execution rejects unbounded or unsupported allowances before compilation", async () => {
  const { createGameStreams } = await import("../prototypes/canonical-defense/game-stream-runner.mjs");
  const fixture = new URL("../prototypes/canonical-defense/DefenseConsumerConformance.bend", import.meta.url);
  for (const executionTimeoutMs of [0, -1, 180001, Infinity, NaN]) {
    await assert.rejects(createGameStreams(fixture, [], { executionTimeoutMs }),
      /unsupported finite game execution allowance/);
  }
});
