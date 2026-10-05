import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createRun } from "./test-harness/run-checks.mjs"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const arguments_ = process.argv.slice(2)
if (arguments_.length > 1 || (arguments_.length === 1 && arguments_[0] !== "--lab"))
  throw new Error("Expected no arguments or --lab")
const lab = arguments_[0] === "--lab"
const stage = lab ? "game-lab-conformance" : "game-consumer"
const verifier = lab ? "scripts/compare-game-lab-native.mjs" : "prototypes/canonical-defense/verify-consumer.mjs"
const run = await createRun({
  root,
  mode: "test",
  timeoutMs: 380000,
  inherited: process.env.HAPSLAND_CHECK_CONTEXT,
  scope: stage
})
// Keep the authenticated parent coordinates; narrowing this stage must not
// overwrite an inherited run's manifest or extend its deadline.
const supervisorContext = JSON.stringify(run.context)
const deadline = Math.min(run.context.deadline, Date.now() + 380000)
run.context.deadline = deadline
try {
  await run.runStage({
    name: stage,
    command: process.execPath,
    args: ["--experimental-strip-types", verifier],
    env: { HAPSLAND_GAME_SUPERVISOR_CONTEXT: supervisorContext, HAPSLAND_GAME_OUTER_DEADLINE_MS: String(deadline) }
  })
} finally {
  process.exitCode = await run.finish()
}
