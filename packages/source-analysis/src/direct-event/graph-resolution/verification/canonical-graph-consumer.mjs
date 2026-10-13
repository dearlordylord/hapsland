import assert from "node:assert/strict"
import { unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import {
  createGraphDriver,
  createGraphMachine
} from "@hapsland/source-analysis/direct-event/graph-resolution/composition"
import { createBendResolver } from "@hapsland/source-analysis/direct-event/graph-resolution"

// Sequential standalone Graph diagnostics use the same Canonical fixture admission as the
// full physical Graph consumer. Packaged engines and the ordinary consumer own
// every continuation, terminal acceptance and resource settlement.
export function createCanonicalGraphConsumer({
  registry,
  timedSync = (_name, task) => task(),
  timedPromise = (_name, task) => task(),
  observeProduct
}) {
  let active = false
  return async (path, capture, name, context) => {
    assert.equal(active, false, "diagnostic fixture invocations must be sequential")
    active = true
    try {
      let preparation
      let initialState = owner.initial_limits(100n, 100000000n, 100n, 100000000n)
      for (const event of [
        { $: "../Canonical.OpenRound", partition: 1n, lifetime: 1n },
        { $: "../Canonical.AdmitObservation", partition: 1n, lifetime: 1n, round: 1n },
        { $: "../Canonical.StartObservation", partition: 1n, lifetime: 1n, round: 1n, observation: 1n },
        {
          $: "../Canonical.BeginObservedPreparation",
          partition: 1n,
          lifetime: 1n,
          round: 1n,
          observation: 1n,
          bytes: 1000n
        }
      ]) {
        const step = owner.canonical_event(initialState, event)
        assert.equal(step.$, "Advanced")
        for (const output of unlist(step.outputs))
          if (output.$ === "../Canonical.ActionRequested" && output.request.$ === "../Canonical.Prepare") {
            assert.equal(preparation, undefined, "one actual preparation admission")
            preparation = output.request.operation
          }
        initialState = step.state
      }
      assert.equal(typeof preparation, "bigint", "Canonical must emit Prepare")
      const original = createGraphMachine()
      const machine = {
        ...original,
        initial: (...args) => timedSync("continuation", () => original.initial(...args)),
        view: (...args) => timedSync("continuation", () => original.view(...args)),
        resume: (...args) => timedSync("continuation", () => original.resume(...args))
      }
      const driver = createGraphDriver({
        owner,
        initialState,
        scope: { $: "Scope", partition: 1n, lifetime: 1n, round: 1n, preparation },
        machine,
        registry,
        foreign: ([request], options) =>
          timedPromise("service:" + request.operation.$, () => registry.perform(request, options))
      })
      const resolve = createBendResolver({
        observeProduct,
        drive: driver.drive,
        allocateInvocation: driver.allocateInvocation,
        onConstructionFailure: driver.constructionFailed
      })
      return await resolve(path, capture, name, context)
    } finally {
      active = false
    }
  }
}
