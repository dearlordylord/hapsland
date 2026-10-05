import { expect, it } from "vitest"
import {
  runWorkloadNative,
  WORKLOAD_CONFORMANCE_TIMEOUT_MS
} from "../../monkey-business-bend/conformance/workload-native-runner.mjs"

// Independent finite contract observations: original receipt fields and delay
// unchanged; postauthorized failed is MAY-have-reached uncertainty; exact
// deadline>=10 expires; whole ordered Stop membership remains one terminal.
it(
  "pins original output completion identity, exact expiry and atomic batch payload",
  () => {
    const actual = runWorkloadNative(
      new URL("../../monkey-business-bend/conformance/output-completion-facts.bend", import.meta.url)
    )
    expect(actual).toEqual([
      [1, 2, 3, 4, 17, 15, 5, 1, 7, 9, 1],
      [1, 2, 3, 4, 17, 15, 5, 1, 7, 9, 0],
      [1, 2, 3, 4, 17, 15, 5, 1, 7, 9, 0],
      [0],
      [0],
      [0],
      [5, 1, 7, 9, 1],
      // Started at10 with lease10: exact deadline20 reports elapsed10;
      // the later check21 reports elapsed11, without clamping to the lease.
      [5, 2, 7, 9, 10, 10],
      [5, 2, 7, 9, 11, 10],
      [5, 3, 1, 3, 5, 9, 7, 11],
      [0],
      [0],
      [0],
      [0, 1, 7, 9, 0]
    ])
    // This helper fact check is not full Driver agreement, nor proof of private
    // receipt provenance, actual queued status or authorized state. Central #182
    // gates those before it may replace one original scheduled completion.
  },
  WORKLOAD_CONFORMANCE_TIMEOUT_MS
)
