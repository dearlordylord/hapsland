import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRun } from "./test-harness/run-checks.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const run = await createRun({ root, mode: "test", timeoutMs: 380000,
  inherited: process.env.HAPSLAND_CHECK_CONTEXT, scope: "game-consumer" });
// Keep the authenticated parent coordinates; narrowing this stage must not
// overwrite an inherited run's manifest or extend its deadline.
const supervisorContext = JSON.stringify(run.context);
const deadline = Math.min(run.context.deadline, Date.now() + 380000);
run.context.deadline = deadline;
try {
  await run.runStage({ name: "game-consumer", command: process.execPath,
    args: ["--experimental-strip-types", "prototypes/canonical-defense/verify-consumer.mjs"],
    env: { HAPSLAND_GAME_SUPERVISOR_CONTEXT: supervisorContext,
      HAPSLAND_GAME_OUTER_DEADLINE_MS: String(deadline) } });
} finally {
  process.exitCode = await run.finish();
}
