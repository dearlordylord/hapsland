import assert from "node:assert/strict"
import { createServer } from "vite"
const server = await createServer({ server: { middlewareMode: true } })
try {
  const { SITE_SCENARIOS, replaySiteScenario } = await server.ssrLoadModule("/src/site-scenarios.ts")
  const { SITE_EXAMPLE } = await server.ssrLoadModule("/src/site-example.ts")
  assert.deepEqual(SITE_EXAMPLE.definitionNames, ["Gallery", "ImageFile", "Dimensions"])
  assert.ok(SITE_EXAMPLE.before.includes("  coverWidth: number;"))
  assert.ok(!SITE_EXAMPLE.after.includes("  coverWidth: number;"))
  for (const item of SITE_SCENARIOS) {
    const replay = replaySiteScenario(item.id, item.scenario.steps.length)
    const state = replay.states[0]
    assert.equal(replay.history.length, item.scenario.steps.length)
    assert.equal(state.phase, item.id === "normal" ? "complete" : "incomplete")
    assert.equal(replay.history.at(-1).command.kind, item.id === "normal" ? "unitComplete" : "unitIncomplete")
    assert.equal(state.pending.length, 0)
    assert.ok(state.treeBytes <= item.limits.treeBytes)
    assert.equal(item.checkpoints.at(-1).cursor, item.scenario.steps.length)
    for (const checkpoint of item.checkpoints)
      assert.ok(checkpoint.cursor > 0 && checkpoint.cursor <= item.scenario.steps.length)
    const dimensionsReads = replay.history.filter(
      ({ command }) => command.kind === "readSource" && command.target === 3
    )
    assert.equal(dimensionsReads.length, item.id === "exclusion" ? 0 : 1)
    assert.equal(state.treeBytes, item.id === "normal" ? 1200 : 800)
    if (item.id === "exclusion")
      assert.ok(replay.history.some(({ command }) => command.kind === "skipImport" && command.reason === "Excluded"))
    if (item.id === "tree-budget")
      assert.ok(replay.history.some(({ command }) => command.kind === "skipImport" && command.reason === "TreeLimit"))
  }
  console.log("Site scenarios: terminal traces, permission gate and tree budget verified against compiled core.")
} finally {
  await server.close()
}
