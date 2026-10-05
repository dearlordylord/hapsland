// Test-runner scheduling allowances. Product clocks and child deadlines have
// separate owners; neither is scaled by this policy.
export const UNIT_TEST_TIMEOUT_MS = 5_000
export const PROCESS_TEST_TIMEOUT_MS = 60_000
export const DEFAULT_CHILD_TIMEOUT_MS = 30_000
export const FIXTURE_READY_TIMEOUT_MS = 20_000
export const CLEANUP_TIMEOUT_MS = 10_000

export const boundedScenarioFiles = new Map([
  ["scripts/cli-import-boundary.test.mts", "bounded shared CLI import-closure validation"],
  ["src/resident/capacity.test.ts", "bounded metadata-capacity exhaustion"],
  ["packages/monkey-business/src/cache-scenarios.test.ts", "bounded seeded cache-pressure simulation and replay"],
  ["packages/monkey-business/src/outcomes.test.ts", "bounded seeded outcome simulation and replay"],
  ["src/resident/server.test.ts", "bounded resident saturation and batch collection"],
  ["packages/monkey-business/src/lifecycles.test.ts", "bounded lifecycle simulation and replay"]
])

export const timeoutForKind = (kind) => (kind === "unit" ? UNIT_TEST_TIMEOUT_MS : PROCESS_TEST_TIMEOUT_MS)
