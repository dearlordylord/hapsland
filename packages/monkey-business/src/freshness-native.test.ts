import { expect, it } from "vitest"
import { runFreshnessNative, runFreshnessEmitted } from "../../monkey-business-bend/conformance/freshness-runner.mjs"
import { readRetainedWorkloadOutput } from "../../monkey-business-bend/conformance/workload-native-runner.mjs"

// Original edits use Engine.edit_attempt and Engine.freshness_admitted at
// actual admission, then the shared freshness fence. Native input never comes from JS.
const expected = (changed: boolean) => [
  // Shared issuance uses the actual owner allocator, also exercised independently
  // in freshness-scenario.test.ts: operation/request are 3/4, then 7/8.
  [12, 7, 1, 1, 1, 3, 4, changed ? 0 : 1],
  ...(!changed ? [[18, 7]] : []),
  [12, 10, 1, 1, 1, 7, 8, 1],
  [18, 10],
  [32, 10, changed ? 1 : 2, changed ? 5 : 10, 0, 0, 0]
]
function nativeMilestones(rows: number[][]): number[][] {
  return rows.flatMap((row) =>
    row[0] === 12 ? [[...row.slice(0, 7), row[9]!]] : row[0] === 18 ? [row.slice(0, 2)] : row[0] === 32 ? [row] : []
  )
}

it.each([false, true])(
  "compares original %s changed source with independent stale-delivery milestones",
  (changed) => {
    const fixture = new URL(
      `../../monkey-business-bend/conformance/freshness-${changed ? "changed" : "same"}.bend`,
      import.meta.url
    )
    const receipt = changed
      ? process.env.HAPSLAND_FRESHNESS_CHANGED_NATIVE_OUTPUT_RECEIPT
      : process.env.HAPSLAND_FRESHNESS_SAME_NATIVE_OUTPUT_RECEIPT
    const retained = receipt ? readRetainedWorkloadOutput(fixture, receipt, "fresh-native") : undefined
    if (receipt && !Array.isArray(retained))
      throw new TypeError("freshness retained output must be the original row list")
    const native = receipt
      ? (retained as number[][])
      : runFreshnessNative(fixture, { emissionTimeoutMs: 90000, clangTimeoutMs: 120000 })
    expect(runFreshnessEmitted(fixture)).toEqual(native)
    expect(native.some((row) => row[0] === 98)).toBe(false)
    expect(nativeMilestones(native)).toEqual(expected(changed))
  },
  300000
)
