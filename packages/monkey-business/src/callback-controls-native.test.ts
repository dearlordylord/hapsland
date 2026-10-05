import { expect, it } from "vitest"
import {
  runWorkloadNative,
  WORKLOAD_CONFORMANCE_TIMEOUT_MS
} from "../../monkey-business-bend/conformance/workload-native-runner.mjs"
// Independent literal expectations: original time/order and captured owner never
// change, while release/reorder use the new queue order. No product settlement
// or capacity release is fabricated by any of these controls.
it(
  "native callback controls retain original provenance and exact applicability",
  () => {
    expect(
      runWorkloadNative(new URL("../../monkey-business-bend/conformance/callback-controls.bend", import.meta.url))
    ).toEqual([
      [1, 6, 7, 2, 6, 6],
      [1, 6, 7, 1, 11, 10, 11, 1, 2, 3, 4, 5],
      [1, 6, 7, 2, 11, 11],
      [1, 6, 7, 3, 6, 6],
      [1, 6, 7, 1, 9, 6, 8, 9, 1, 2, 3, 4, 5],
      [1, 10, 11, 1, 2, 3, 4, 5],
      [2],
      [2, 6, 7, 1, 6],
      [4, 6, 7, 1, 6]
    ])
  },
  WORKLOAD_CONFORMANCE_TIMEOUT_MS
)
