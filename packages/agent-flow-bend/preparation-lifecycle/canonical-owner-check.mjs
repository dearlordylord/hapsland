import * as Effect from "effect/Effect"
import * as Cause from "effect/Cause"
import { createNativeSessionRegistry } from "@hapsland/runtime-environment/runtime/native-session-registry"
import { awaitNative, effectNative } from "@hapsland/runtime-environment/runtime/native-execution"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { createChildExecutionDriver } from "@hapsland/canonical-policy/canonical/child-execution"
import {
  createServiceRegistry,
  createServiceSession
} from "../../source-analysis/src/direct-event/graph-resolution/service-session.ts"
// These synthetic machines exercise the common driver's custody, not resident
// input discrimination. Real resident protocol consumers have their own checks.
const fixtureProtocol = {
  initial: (machine, input) => ({ machine, step: machine.initial(input) }),
  view: (held) => ({ machine: held.machine, view: held.machine.view(held.step) }),
  resume: (held, reply) => ({ ...held, step: held.machine.resume(held.step, { $: "Types.ServiceReply", reply }) }),
  awaitRequest: (projected) => (projected.view.$ === "Types.AwaitService" ? projected.view.request : undefined),
  installation: () => ({ method: "install" }),
  terminal: (projected, scope) =>
    scope.$ === "PreparationScope"
      ? projected.view.$ === "PreparationFinished"
        ? "terminal_preparation"
        : "terminal_preparation_failed"
      : scope.$ === "SourceScope" && projected.view.$ === "SourcePreparationStopped"
        ? "terminal_source_failed"
        : "terminal",
  preparation: (projected) => projected.view.result,
  accepted: (projected) =>
    projected.view.$ === "Types.FailedResolver"
      ? { failure: projected.view.failure }
      : { result: projected.view.result },
  projectTerminal(outcome, session) {
    if (outcome.failure?.$ === "Types.ForeignProviderFailure" || outcome.failure?.$ === "Types.RuntimeFailure")
      throw session.exception(outcome.failure.exception)
    return outcome
  }
}
const createFixtureDriver = (options) => createChildExecutionDriver({ ...options, protocol: fixtureProtocol })
const temp = await mkdtemp("/tmp/hapsland-canonical-owner-")
try {
  const emitted = join(temp, "owner.mjs")
  execFileSync(
    "taskset",
    ["-c", "10", "bend", join(import.meta.dirname, "./CanonicalResolverOwner.bend"), "-o", emitted],
    { timeout: 10000 }
  )
  const m = (await import(pathToFileURL(emitted))).default
  const c = (name, fields = {}) => ({ $: "../Canonical." + name, ...fields })
  const scope = { $: "Scope", partition: 1, lifetime: 1, round: 1, preparation: 2 }
  const list = (value) => {
    const out = []
    while (value.$ === "Con") {
      out.push(value.head)
      value = value.tail
    }
    assert.equal(value.$, "Nil")
    return out
  }
  const advanced = (value) => {
    assert.equal(value.$, "Advanced")
    return value.state
  }
  const reject = (value, reason) => {
    assert.equal(value.$, "Rejected")
    assert.equal(value.refusal.$, reason)
  }
  const fresh = () => {
    let s = m.initial_limits(100, 100000, 100, 100000)
    for (const event of [
      c("OpenRound", { partition: 1, lifetime: 1 }),
      c("AdmitObservation", { partition: 1, lifetime: 1, round: 1 }),
      c("StartObservation", { partition: 1, lifetime: 1, round: 1, observation: 1 }),
      c("BeginObservedPreparation", { partition: 1, lifetime: 1, round: 1, observation: 1, bytes: 100 })
    ])
      s = advanced(m.canonical_event(s, event))
    assert.equal(m.live(s.canonical, scope), true)
    return s
  }
  let assertions = 0
  // Unknown recipients need no capacity identity allocation. Absence is exact
  // receipt context, never a wildcard shared by different recipient keys.
  for (const partition of [{ $: "None" }, { $: "Some", value: 1 }]) {
    const context = {
      $: "DeliveryContext",
      request: 41,
      recipient: "unknown-recipient",
      partition,
      lifetime: 1,
      round: { $: "None" },
      local_delivery: false
    }
    const launched = m.launch_collection(fresh(), context, 50)
    let state = advanced(launched)
    const invocation = list(launched.actions)[0].invocation
    const completed = m.complete_delivery(state, invocation, 0, 60, { $: "NoDeliverySelection" })
    state = advanced(completed)
    const receipt = list(completed.actions)[0].receipt
    assert.deepEqual(receipt.context, context)
    reject(
      m.claim_delivery(state, { ...receipt, context: { ...context, recipient: "another-unknown-recipient" } }),
      "WrongPhase"
    )
    reject(
      m.claim_delivery(state, {
        ...receipt,
        context: { ...context, partition: partition.$ === "None" ? { $: "Some", value: 1 } : { $: "None" } }
      }),
      "WrongPhase"
    )
    state = advanced(m.claim_delivery(state, receipt))
    const prepared = m.complete_delivery(state, receipt.invocation, 0, 70, { $: "NoDeliverySelection" })
    state = advanced(prepared)
    const finalReceipt = list(prepared.actions)[0].receipt
    assert.deepEqual(finalReceipt.context, context)
    state = advanced(m.claim_delivery(state, finalReceipt))
    advanced(m.complete_delivery(state, finalReceipt.invocation, 0, 80, { $: "NoDeliverySelection" }))
    assertions++
  }
  {
    const context = {
      $: "DeliveryContext",
      request: 41,
      recipient: "recipient-seven",
      partition: { $: "Some", value: 1 },
      lifetime: 1,
      round: { $: "Some", value: 1 },
      local_delivery: false
    }
    const selection = {
      $: "DeliverySelection",
      token: 93,
      advice: { $: "Con", head: 12, tail: { $: "Nil" } },
      notices: { $: "Nil" }
    }
    const fixture = (fault = {}) => {
      const registry = createNativeSessionRegistry()
      const physical = { identity: {}, releases: 0, attempts: 0, cancelAttempts: 0, handoffs: [] }
      const closed = []
      const cleanup = function* () {
        physical.attempts++
        if (fault.cleanup && physical.attempts === 1) throw new Error("delivery cleanup fault")
        if (!physical.releases) physical.releases++
      }
      const machine = {
        initial: (input) => input,
        view: (input) => ({
          kind: "delivery",
          view: input.done
            ? { $: "Finished" }
            : { $: "Types.AwaitService", request: { invocation: input.invocation, id: 1 } },
          input
        }),
        resume(input, reply) {
          assert.equal(reply.invocation, input.invocation)
          assert.equal(reply.id, 1)
          return { ...input, done: true }
        },
        disposeInvocation() {},
        retainedHandles: 0
      }
      const session = (invocation) => ({
        invocation,
        close() {
          closed.push(invocation)
          if (fault.closePrepare && invocation === 2 && closed.filter((id) => id === 2).length === 1)
            throw new Error("delivery close fault")
        },
        revoke() {}
      })
      const driver = createChildExecutionDriver({
        owner: {
          ...m,
          launch_collection(...args) {
            if (fault.launchBefore) throw new Error("collection launch fault")
            return m.launch_collection(...args)
          },
          cancel(...args) {
            if (fault.cancelBefore && !physical.cancelAttempts++) throw new Error("collection cancel fault")
            return m.cancel(...args)
          }
        },
        initialState: fresh(),
        registry:
          fault.registration || fault.rootRegistration
            ? {
                ...registry,
                get size() {
                  return registry.size
                },
                get pendingCleanup() {
                  return registry.pendingCleanup
                },
                *runOutcomeFlow(session, task) {
                  if (session.invocation !== 1 || fault.rootRegistration) throw new Error("delivery registration fault")
                  return yield* registry.runOutcomeFlow(session, task)
                }
              }
            : registry,
        machine,
        foreign: async ([request]) => ({ invocation: request.invocation, id: request.id }),
        hooks: {
          beforeProvider({ invocation, driver }) {
            if (fault.cancelProvider) driver.cancel(invocation)
          },
          afterAction({ command, driver }) {
            if (command.$ === "Launch" && fault.launchAfter) throw new Error("collection launch observer fault")
            if (command.$ === "IssueDeliveryHandoff" && command.invocation === 2)
              fault.afterTransfer?.(physical.handoffs.at(-1), driver)
            if (fault.observer && command.$ === "IssueDeliveryHandoff") throw new Error("delivery observer fault")
          }
        },
        protocol: {
          initial: (_machine, input) => machine.initial(input),
          view: machine.view,
          resume: machine.resume,
          awaitRequest: (projection) =>
            projection.view.$ === "Types.AwaitService" ? projection.view.request : undefined,
          installation: () => ({ method: "install" }),
          terminal: () => ({
            method: "complete_delivery",
            selection: fault.emptyRoot ? { $: "NoDeliverySelection" } : selection
          }),
          preparation() {
            throw new Error("Not Preparation")
          },
          accepted: (projection) => ({ result: projection.input.physical }),
          deliveryHandoff(projection, _session, receipt) {
            assert.equal(projection.input.physical, physical)
            if (fault.validation) throw new Error("delivery validation fault")
            physical.handoffs.push(receipt)
            return { accepted: { handoff: receipt }, cleanup }
          },
          projectTerminal: (outcome) => outcome
        }
      })
      const issue = async () => {
        const invocation = driver.allocateCollectionInvocation(context, cleanup)
        const outcome = await Effect.runPromise(driver.driveEffect(session(invocation), { invocation, physical }))
        return outcome.handoff
      }
      const construct = function* (projection, invocation) {
        assert.equal(projection.input.physical, physical)
        return { session: session(invocation), input: { invocation, physical } }
      }
      return {
        registry,
        physical,
        driver,
        session,
        issue,
        construct,
        closed,
        allocate: () => driver.allocateCollectionInvocation(context, cleanup)
      }
    }
    {
      const f = fixture({ emptyRoot: true }),
        receipt = await f.issue()
      assert.deepEqual(receipt.receipt.permission, {
        $: "PrepareDeliveryIssued",
        selection: { $: "NoDeliverySelection" }
      })
      assert.equal(f.physical.handoffs.length, 1)
      assert.equal(f.physical.attempts, 0)
      assert.equal(f.driver.resources.payloads, 1)
      const next = await Effect.runPromise(f.driver.driveDeliveryEffect(receipt, f.construct))
      assert.deepEqual(next.handoff.receipt.permission, {
        $: "FinalizeDeliveryIssued",
        selection: { $: "NoDeliverySelection" }
      })
      await assert.rejects(Effect.runPromise(f.driver.driveDeliveryEffect(receipt, f.construct)), /Unknown or consumed/)
      const final = await Effect.runPromise(f.driver.driveDeliveryEffect(next.handoff, f.construct))
      assert.equal(final.result, f.physical)
      assert.equal(f.physical.attempts, 0)
      assert.equal(f.driver.resources.payloads, 0)
      assert.equal(f.registry.size, 0)
      await Effect.runPromise(f.registry.retryCleanupEffect())
      assert.equal(f.physical.attempts, 0)
    }
    {
      const f = fixture({ emptyRoot: true, cleanup: true }),
        receipt = await f.issue()
      f.driver.cancel(receipt.handoff)
      await assert.rejects(Effect.runPromise(f.registry.retryCleanupEffect()), /delivery cleanup fault/)
      assert.equal(f.registry.pendingCleanup, 1)
      await Effect.runPromise(f.registry.retryCleanupEffect())
      assert.equal(f.physical.releases, 1)
      assert.equal(f.physical.attempts, 2)
      assert.equal(f.driver.resources.payloads, 0)
      assert.equal(f.registry.pendingCleanup, 0)
    }
    {
      const f = fixture({ cancelBefore: true }),
        invocation = f.allocate()
      const inputHandle = m.find(invocation, f.driver.state.children).value.scope.input_handle
      assert.throws(
        () =>
          f.driver.constructionFailed(invocation, { session: f.session(invocation), closePending: true, inputHandle }),
        /collection cancel fault/
      )
      assert.equal(m.child_active(m.find(invocation, f.driver.state.children).value), true)
      assert.equal(f.physical.attempts, 0)
      await Effect.runPromise(f.registry.retryCleanupEffect())
      assert.equal(m.child_active(m.find(invocation, f.driver.state.children).value), false)
      assert.equal(f.physical.releases, 1)
      assert.equal(f.physical.attempts, 1)
      assert.equal(f.registry.pendingCleanup, 0)
      assert.equal(f.driver.resources.payloads, 0)
    }
    {
      const f = fixture({ cancelProvider: true })
      assert.equal(await f.issue(), undefined)
      assert.equal(f.physical.handoffs.length, 0)
      assert.equal(f.physical.releases, 1)
      assert.equal(f.physical.attempts, 1)
      assert.equal(f.driver.resources.payloads, 0)
    }
    {
      const f = fixture(),
        invocation = f.allocate(),
        cancellation = new AbortController()
      cancellation.abort()
      const outcome = await Effect.runPromiseExit(
        f.driver.driveEffect(
          f.session(invocation),
          { invocation, physical: f.physical },
          { signal: cancellation.signal }
        )
      )
      assert.equal(outcome._tag, "Success")
      assert.equal(outcome.value.failure.$, "Types.InvocationCancelled")
      assert.equal(f.physical.releases, 1)
      assert.equal(f.physical.handoffs.length, 0)
      assert.equal(f.driver.resources.payloads, 0)
      assert.equal(f.registry.pendingCleanup, 0)
    }
    for (const fault of ["launchBefore", "launchAfter", "rootRegistration"]) {
      const f = fixture({ [fault]: true })
      await assert.rejects(f.issue(), /collection launch|delivery registration/)
      await Effect.runPromise(f.registry.retryCleanupEffect())
      await Effect.runPromise(f.registry.retryCleanupEffect())
      assert.equal(f.physical.releases, 1)
      assert.equal(f.physical.attempts, 1)
      assert.equal(f.driver.resources.payloads, 0)
      assert.equal(f.registry.pendingCleanup, 0)
      assert.equal(f.driver.pendingCancellationCleanups, 0)
    }
    {
      const f = fixture({ cleanup: true }),
        invocation = f.allocate()
      f.driver.cancel(invocation)
      await assert.rejects(Effect.runPromise(f.registry.retryCleanupEffect()), /delivery cleanup fault/)
      assert.equal(f.registry.pendingCleanup, 1)
      await Effect.runPromise(f.registry.retryCleanupEffect())
      await Effect.runPromise(f.registry.retryCleanupEffect())
      assert.equal(f.physical.attempts, 2)
      assert.equal(f.physical.releases, 1)
      assert.equal(f.driver.resources.payloads, 0)
    }
    {
      const f = fixture(),
        receipt = await f.issue()
      assert.equal(f.closed.length, 1)
      assert.equal(f.physical.releases, 0)
      assert.equal(f.driver.resources.payloads, 1)
      assert.equal(f.driver.resources.launches, 0)
      await assert.rejects(
        Effect.runPromise(f.driver.driveDeliveryEffect({ ...receipt }, f.construct)),
        /Unknown or consumed/
      )
      const next = await Effect.runPromise(f.driver.driveDeliveryEffect(receipt, f.construct))
      assert.equal(f.physical.releases, 0)
      assert.equal(next.handoff.receipt.permission.$, "FinalizeDeliveryIssued")
      assert.throws(() => f.driver.cancel(receipt.receipt.origin), /WrongPhase/)
      assert.equal(f.physical.releases, 0)
      const final = await Effect.runPromise(f.driver.driveDeliveryEffect(next.handoff, f.construct))
      assert.equal(final.result, f.physical)
      assert.equal(f.driver.resources.payloads, 0)
      assert.equal(f.registry.size, 0)
      assert.equal(f.registry.pendingCleanup, 0)
      await assert.rejects(Effect.runPromise(f.driver.driveDeliveryEffect(receipt, f.construct)), /Unknown or consumed/)
    }
    {
      const f = fixture({ cleanup: true }),
        receipt = await f.issue()
      f.driver.cancel(receipt.handoff)
      assert.equal(f.registry.size, 0)
      assert.equal(f.registry.pendingCleanup, 1)
      await assert.rejects(Effect.runPromise(f.registry.retryCleanupEffect()), /delivery cleanup fault/)
      assert.equal(f.registry.pendingCleanup, 1)
      assert.equal(f.physical.releases, 0)
      await Effect.runPromise(f.registry.retryCleanupEffect())
      await Effect.runPromise(f.registry.retryCleanupEffect())
      assert.equal(f.physical.releases, 1)
      assert.equal(f.physical.attempts, 2)
      assert.equal(f.registry.pendingCleanup, 0)
      assert.equal(f.driver.resources.payloads, 0)
      await assert.rejects(Effect.runPromise(f.driver.driveDeliveryEffect(receipt, f.construct)), /Unknown or consumed/)
    }
    for (const fault of ["validation", "observer"]) {
      const f = fixture({ [fault]: true })
      await assert.rejects(f.issue(), new RegExp("delivery " + fault + " fault"))
      await Effect.runPromise(f.registry.retryCleanupEffect())
      assert.equal(f.physical.releases, 1)
      assert.equal(f.driver.resources.payloads, 0)
      assert.equal(f.registry.pendingCleanup, 0)
    }
    {
      const f = fixture(),
        receipt = await f.issue()
      await assert.rejects(
        Effect.runPromise(
          f.driver.driveDeliveryEffect(receipt, function* () {
            throw new Error("delivery construction fault")
          })
        ),
        /delivery construction fault/
      )
      assert.equal(f.registry.pendingCleanup, 1)
      await Effect.runPromise(f.registry.retryCleanupEffect())
      assert.equal(f.physical.releases, 1)
      assert.equal(f.driver.resources.payloads, 0)
    }
    {
      const f = fixture(),
        receipt = await f.issue()
      let begin, release
      const started = new Promise((resolve) => {
        begin = resolve
      })
      const gate = new Promise((resolve) => {
        release = resolve
      })
      const first = Effect.runPromise(
        f.driver.driveDeliveryEffect(receipt, function* (projection, invocation) {
          begin()
          yield awaitNative(gate)
          return yield* f.construct(projection, invocation)
        })
      )
      await started
      await assert.rejects(Effect.runPromise(f.driver.driveDeliveryEffect(receipt, f.construct)), /WrongPhase/)
      assert.equal(m.child_active(m.find(receipt.handoff, f.driver.state.children).value), true)
      assert.equal(f.physical.releases, 0)
      release()
      const next = await first
      f.driver.cancel(next.handoff.handoff)
      await Effect.runPromise(f.registry.retryCleanupEffect())
      assert.equal(f.physical.releases, 1)
      assert.equal(f.driver.resources.payloads, 0)
    }
    {
      const f = fixture({ registration: true }),
        receipt = await f.issue()
      await assert.rejects(
        Effect.runPromise(f.driver.driveDeliveryEffect(receipt, f.construct)),
        /delivery registration fault/
      )
      assert.equal(f.registry.size, 0)
      assert.equal(f.registry.pendingCleanup, 1)
      assert.ok(f.closed.includes(receipt.handoff))
      await Effect.runPromise(f.registry.retryCleanupEffect())
      assert.equal(f.physical.releases, 1)
      assert.equal(f.driver.resources.payloads, 0)
      assert.equal(f.driver.pendingCancellationCleanups, 0)
    }
    {
      const f = fixture(),
        receipt = await f.issue(),
        cancellation = new AbortController()
      let begin
      const started = new Promise((resolve) => {
        begin = resolve
      })
      const pending = Effect.runPromiseExit(
        f.driver.driveDeliveryEffect(receipt, function* () {
          begin()
          yield effectNative(Effect.never)
          throw new Error("Interrupted construction resumed")
        }),
        { signal: cancellation.signal }
      )
      await started
      cancellation.abort()
      const exit = await pending
      assert.equal(exit._tag, "Failure")
      assert.equal(f.registry.size, 0)
      assert.equal(f.registry.pendingCleanup, 1)
      await Effect.runPromise(f.registry.retryCleanupEffect())
      assert.equal(f.physical.releases, 1)
      assert.equal(f.driver.resources.payloads, 0)
      assert.equal(f.driver.pendingCancellationCleanups, 0)
    }
    {
      const f = fixture({ closePrepare: true }),
        receipt = await f.issue()
      await assert.rejects(
        Effect.runPromise(f.driver.driveDeliveryEffect(receipt, f.construct)),
        /delivery close fault/
      )
      const successor = f.physical.handoffs.at(-1)
      assert.equal(m.child_active(m.find(successor.handoff, f.driver.state.children).value), false)
      await Effect.runPromise(f.registry.retryCleanupEffect())
      assert.equal(f.physical.attempts, 1)
      assert.equal(f.physical.releases, 1)
      assert.equal(f.driver.resources.payloads, 0)
    }
    {
      let running, release
      const gate = new Promise((resolve) => {
        release = resolve
      })
      const f = fixture({
        closePrepare: true,
        afterTransfer(receipt, driver) {
          running = Effect.runPromise(
            driver.driveDeliveryEffect(receipt, function* (projection, invocation) {
              yield awaitNative(gate)
              return yield* f.construct(projection, invocation)
            })
          )
        }
      })
      const receipt = await f.issue()
      await assert.rejects(
        Effect.runPromise(f.driver.driveDeliveryEffect(receipt, f.construct)),
        /delivery close fault/
      )
      const successor = f.physical.handoffs.at(-1)
      await Effect.runPromise(f.registry.retryCleanupEffect())
      assert.equal(m.child_active(m.find(successor.handoff, f.driver.state.children).value), true)
      assert.equal(f.physical.releases, 0)
      assert.equal(f.physical.attempts, 0)
      release()
      const result = await running
      assert.equal(result.result, f.physical)
      assert.equal(f.driver.resources.payloads, 0)
    }
    assertions += 18
  }
  {
    const context = {
      $: "DeliveryContext",
      request: 41,
      recipient: "recipient-seven",
      partition: { $: "Some", value: 1 },
      lifetime: 1,
      round: { $: "Some", value: 1 },
      local_delivery: false
    }
    const selection = {
      $: "DeliverySelection",
      token: 93,
      advice: { $: "Con", head: 12, tail: { $: "Nil" } },
      notices: { $: "Nil" }
    }
    const launched = m.resident_event(fresh(), { $: "LaunchCollectionEvent", context, input_handle: 50 })
    let state = advanced(launched)
    const invocation = list(launched.actions)[0].invocation
    reject(m.terminal(state, invocation, 0, 60), "WrongPhase")
    const completed = m.resident_event(state, {
      $: "CompleteDeliveryEvent",
      invocation,
      generation: 0,
      result_handle: 60,
      selection
    })
    state = advanced(completed)
    const actions = list(completed.actions)
    assert.deepEqual(
      actions.map((action) => action.$),
      ["IssueDeliveryHandoff"]
    )
    const receipt = actions[0].receipt
    assert.deepEqual(receipt.context, context)
    assert.deepEqual(receipt.permission, { $: "PrepareDeliveryIssued", selection })
    reject(m.install(state, receipt.invocation, 0, 70, 1), "WrongGeneration")
    reject(m.terminal(state, receipt.invocation, 0, 70), "WrongPhase")
    for (const changed of [
      { ...receipt, origin: receipt.origin + 1 },
      { ...receipt, generation: 1 },
      { ...receipt, input_handle: 61 },
      ...["request", "lifetime"].map((field) => ({ ...receipt, context: { ...context, [field]: context[field] + 1 } })),
      { ...receipt, context: { ...context, recipient: "another-recipient" } },
      { ...receipt, context: { ...context, partition: { $: "None" } } },
      { ...receipt, context: { ...context, partition: { $: "Some", value: 2 } } },
      { ...receipt, context: { ...context, local_delivery: true } },
      { ...receipt, context: { ...context, round: { $: "None" } } },
      { ...receipt, permission: { $: "PrepareDeliveryIssued", selection: { ...selection, token: 94 } } }
    ])
      reject(m.claim_delivery(state, changed), "WrongPhase")
    const claimed = m.resident_event(state, { $: "ClaimDeliveryEvent", receipt })
    state = advanced(claimed)
    assert.deepEqual(list(claimed.actions), [{ $: "Launch", invocation: receipt.invocation, input_handle: 60 }])
    reject(m.claim_delivery(state, receipt), "WrongPhase")
    const prepared = m.complete_delivery(state, receipt.invocation, 0, 80, { $: "NoDeliverySelection" })
    state = advanced(prepared)
    const finalReceipt = list(prepared.actions)[0].receipt
    assert.deepEqual(finalReceipt.permission, { $: "FinalizeDeliveryIssued", selection })
    const cancelled = advanced(m.cancel(state, finalReceipt.invocation))
    reject(m.claim_delivery(cancelled, finalReceipt), "WrongPhase")
    state = advanced(m.claim_delivery(state, finalReceipt))
    const finalized = m.complete_delivery(state, finalReceipt.invocation, 0, 90, selection)
    state = advanced(finalized)
    assert.deepEqual(
      list(finalized.actions).map((action) => action.$),
      ["AcceptResult"]
    )
    reject(m.complete_delivery(state, finalReceipt.invocation, 0, 91, selection), "WrongPhase")
    assertions++
  }
  {
    const before = advanced(m.launch(fresh(), scope, 50))
    // active_reader_exact owns queries over immutable Bend children. A new
    // committed state must not change the reader for its predecessor.
    const reader = m.active_reader(before.children)
    assert.equal(reader.$, "ActiveReader")
    assert.equal(typeof reader.query, "function")
    assert.deepEqual(reader.query(1), { $: "Some", value: true })
    const after = advanced(m.cancel(before, 1))
    const cancelled = m.active_reader(after.children)
    for (let repeat = 0; repeat < 16; repeat++) {
      assert.deepEqual(reader.query(1), { $: "Some", value: true })
      assert.deepEqual(reader.query(0), { $: "None" })
      assert.deepEqual(reader.query(2 ** 48 - 1), { $: "None" })
      assert.deepEqual(cancelled.query(1), { $: "Some", value: false })
      assert.deepEqual(cancelled.query(0), { $: "None" })
      assertions += 5
    }
    assert.deepEqual(m.active_reader(before.children).query(1), { $: "Some", value: true })
    const emittedSource = await readFile(emitted, "utf8")
    const factoryExport = emittedSource.split("\n").find((line) => line.startsWith('  "active_reader":'))
    assert.match(factoryExport, /, 1\),$/u)
    console.log(JSON.stringify({ reader: { immutableStateIsolation: true, repeatedCalls: 80, factoryArity: 1 } }))
    assertions += 5
  }
  // The actual owner must retain synchronous reply chronology and revoke the
  // pump even when cancellation does not abort the caller's signal.
  for (const cancellation of ["none", "advance", "effect"]) {
    const registry = createServiceRegistry()
    const trace = []
    const machine = {
      initial: () => ({ $: "Continue", remaining: 2 }),
      view: (value) => value,
      resume() {
        trace.push("resume")
        return { $: "Types.CompletedResolver", result: "accepted" }
      },
      disposeInvocation() {},
      get retainedHandles() {
        return 0
      }
    }
    const driver = createChildExecutionDriver({
      owner: m,
      initialState: fresh(),
      scope,
      registry,
      machine,
      protocol: {
        ...fixtureProtocol,
        synchronousAdvance(held) {
          if (held.step.$ !== "Continue") return undefined
          trace.push("advance")
          if (cancellation === "advance") driver.cancel(Number(BigInt(invocation)))
          return {
            ...held,
            step:
              held.step.remaining === 1
                ? { $: "Types.AwaitService", request: { invocation: Number(BigInt(invocation)), id: 7 } }
                : { $: "Continue", remaining: held.step.remaining - 1 }
          }
        }
      },
      foreignSync() {
        trace.push("effect")
        queueMicrotask(() => trace.push("microtask"))
        if (cancellation === "effect") driver.cancel(Number(BigInt(invocation)))
        return { value: { value: "reply" } }
      },
      foreign() {
        throw new Error("Unexpected async fallback")
      }
    })
    const invocation = driver.allocateInvocation()
    const session = { invocation, finish() {}, close() {}, revoke() {} }
    const outcome = await driver.drive(session, { invocation: Number(BigInt(invocation)) })
    assert.deepEqual(
      trace,
      cancellation === "none"
        ? ["advance", "advance", "effect", "resume", "microtask"]
        : cancellation === "advance"
          ? ["advance"]
          : ["advance", "advance", "effect", "microtask"]
    )
    assert.equal(driver.stats.accepted, cancellation === "none" ? 1 : 0)
    if (cancellation === "none") assert.equal(outcome.result, "accepted")
    else assert.equal(outcome.failure.$, "Types.InvocationCancelled")
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assertions += 4
  }
  // One Canonical lease executes every primitive in the original synchronous
  // group. Cancellation revokes acceptance, not the already-running group.
  for (const mode of ["terminal", "cancel", "pending", "cancel-reject", "cancel-map-throw", "throw"]) {
    const registry = createServiceRegistry()
    const trace = []
    const original = new Error("synchronous group " + mode)
    let providers = 0,
      completions = 0,
      starts = 0,
      maps = 0,
      closes = 0
    const machine = {
      initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 7 } }),
      view: (value) => value,
      resume() {
        trace.push("resume")
        return { $: "Types.CompletedResolver", result: "accepted" }
      },
      disposeInvocation() {},
      get retainedHandles() {
        return 0
      }
    }
    const driver = createFixtureDriver({
      owner: m,
      initialState: m.initial_limits(100, 100000, 100, 100000),
      registry,
      machine,
      hooks: {
        beforeProvider() {
          providers++
        },
        beforeCompletion() {
          completions++
        }
      },
      foreignSync(requests, execution) {
        assert.equal(requests.length, 1)
        assert.equal(execution.ownerLease.request, 7)
        let primitive = 0
        return {
          group: {
            next() {
              if (primitive < 2) {
                const index = primitive++
                return {
                  kind: "primitive",
                  perform() {
                    trace.push("primitive " + index)
                    if (index === 0) {
                      queueMicrotask(() => trace.push("microtask"))
                      if (mode === "cancel" || mode === "throw" || mode.startsWith("cancel-"))
                        driver.cancel(Number(BigInt(invocation)))
                    }
                    if (index === 1 && mode === "throw") throw original
                  }
                }
              }
              if (mode === "terminal" || mode === "cancel") return { kind: "terminal", value: { value: "reply" } }
              return {
                kind: "pending",
                start() {
                  starts++
                  trace.push("pending")
                  return {
                    pending: mode === "cancel-reject" ? Promise.reject(original) : Promise.resolve("reply"),
                    map(value) {
                      maps++
                      if (mode === "cancel-map-throw") throw original
                      return { value }
                    }
                  }
                }
              }
            }
          }
        }
      },
      foreign() {
        assert.fail("synchronous group cannot fall back")
      }
    })
    const invocation = driver.allocateFreshnessInvocation()
    const session = {
      invocation,
      finish() {},
      close() {
        closes++
      },
      revoke() {}
    }
    if (mode === "throw") {
      await assert.rejects(
        () => driver.drive(session, { invocation: Number(BigInt(invocation)) }),
        (error) => error === original
      )
    } else {
      const outcome = await driver.drive(session, { invocation: Number(BigInt(invocation)) })
      if (mode === "terminal" || mode === "pending") assert.equal(outcome.result, "accepted")
      else assert.equal(outcome.failure.$, "Types.InvocationCancelled")
    }
    assert.deepEqual(trace.slice(0, 2), ["primitive 0", "primitive 1"])
    if (mode === "terminal") assert.deepEqual(trace, ["primitive 0", "primitive 1", "resume", "microtask"])
    if (mode === "cancel" || mode === "throw") assert.deepEqual(trace, ["primitive 0", "primitive 1", "microtask"])
    assert.equal(providers, 1)
    assert.equal(completions, 1)
    assert.equal(starts, mode === "pending" || mode.startsWith("cancel-") ? 1 : 0)
    assert.equal(maps, mode === "pending" || mode === "cancel-map-throw" ? 1 : 0)
    assert.equal(driver.stats.accepted, mode === "terminal" || mode === "pending" ? 1 : 0)
    assert.equal(closes, 1)
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assertions += 10
  }
  // Checkpointed groups retain an issued lease while separating native effects
  // from continuation commits. Revocation cannot resume or fabricate success.
  for (const [mode, original] of [
    ["terminal", undefined],
    ["pending", undefined],
    ["cancel-next", undefined],
    ["cancel-effect", undefined],
    ["cancel-reject", false],
    ["cancel-map", null],
    ...[undefined, null, false, 0, ""].map((error) => ["cancel-throw", error]),
    ["start-throw", new Error("group pending start")]
  ]) {
    const registry = createServiceRegistry(),
      trace = []
    let closes = 0,
      providers = 0,
      completions = 0,
      primitive = 0
    const machine = {
      initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 7 } }),
      view: (value) => value,
      resume() {
        trace.push("resume")
        return { $: "Types.CompletedResolver", result: "accepted" }
      },
      disposeInvocation() {},
      retainedHandles: 0
    }
    const driver = createFixtureDriver({
      owner: m,
      initialState: m.initial_limits(100, 100000, 100, 100000),
      registry,
      machine,
      hooks: {
        beforeProvider() {
          providers++
        },
        beforeCompletion() {
          completions++
        }
      },
      foreignSync() {
        return {
          group: {
            checkpoints: "canonical",
            next() {
              if (mode === "cancel-next") {
                trace.push("next-cancel")
                driver.cancel(Number(BigInt(invocation)))
              }
              if (primitive < 2) {
                const index = primitive++
                return {
                  kind: "checkpointed",
                  perform() {
                    trace.push("effect " + index)
                    if (index === 0) {
                      queueMicrotask(() => trace.push("microtask"))
                      if (mode === "cancel-effect" || mode === "cancel-throw") driver.cancel(Number(BigInt(invocation)))
                      if (mode === "cancel-throw") throw original
                    }
                    return {
                      commit() {
                        trace.push("commit " + index)
                      }
                    }
                  }
                }
              }
              if (mode === "terminal") return { kind: "terminal", value: { value: "reply" } }
              return {
                kind: "checkpointed",
                perform() {
                  trace.push("start")
                  if (mode !== "pending") driver.cancel(Number(BigInt(invocation)))
                  if (mode === "start-throw") throw original
                  return {
                    pending: mode === "cancel-reject" ? Promise.reject(original) : Promise.resolve("reply"),
                    map(value) {
                      trace.push("map")
                      if (mode === "cancel-map") throw original
                      return { value }
                    }
                  }
                }
              }
            }
          }
        }
      },
      foreign() {
        assert.fail("Checkpointed group cannot fall back")
      }
    })
    const invocation = driver.allocateFreshnessInvocation()
    const session = {
      invocation,
      finish() {},
      revoke() {},
      close() {
        closes++
      }
    }
    if (mode === "cancel-throw" || mode === "start-throw")
      await assert.rejects(
        () => driver.drive(session, { invocation: Number(BigInt(invocation)) }),
        (error) => Object.is(error, original)
      )
    else {
      const result = await driver.drive(session, { invocation: Number(BigInt(invocation)) })
      if (mode === "terminal" || mode === "pending") assert.equal(result.result, "accepted")
      else assert.equal(result.failure.$, "Types.InvocationCancelled")
    }
    if (mode === "cancel-next") assert.deepEqual(trace, ["next-cancel"])
    else if (mode === "cancel-effect" || mode === "cancel-throw") assert.deepEqual(trace, ["effect 0", "microtask"])
    else {
      assert.deepEqual(trace.slice(0, 4), ["effect 0", "commit 0", "effect 1", "commit 1"])
      assert.equal(trace.includes("resume"), mode === "terminal" || mode === "pending")
      if (mode === "terminal") assert.deepEqual(trace.slice(4), ["resume", "microtask"])
      if (mode === "pending") assert.deepEqual(trace.slice(4), ["start", "microtask", "map", "resume"])
    }
    assert.equal(providers, 1)
    assert.equal(completions, 1)
    assert.equal(closes, 1)
    assert.equal(driver.stats.accepted, mode === "terminal" || mode === "pending" ? 1 : 0)
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assertions += 9
  }
  // Effect commands retain the old asynchronous discard classification, even
  // when a native callback synchronously cancels and throws a falsy value.
  for (const failure of [undefined, null, false, 0, ""]) {
    const outcomes = []
    for (const grouped of [false, true]) {
      const registry = createServiceRegistry()
      let closes = 0,
        starts = 0,
        resumes = 0
      const machine = {
        initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 7 } }),
        view: (value) => value,
        resume() {
          resumes++
          return { $: "Types.CompletedResolver", result: "accepted" }
        },
        disposeInvocation() {},
        retainedHandles: 0
      }
      const driver = createFixtureDriver({
        owner: m,
        initialState: m.initial_limits(100, 100000, 100, 100000),
        registry,
        machine,
        foreignSync() {
          const effect = Effect.sync(() => {
            starts++
            driver.cancel(Number(BigInt(invocation)))
            throw failure
          })
          return grouped
            ? {
                group: {
                  checkpoints: "canonical",
                  next: () => ({ kind: "effect-checkpointed", perform: () => effect })
                }
              }
            : {
                effect,
                map() {
                  assert.fail("cancelled failure cannot map")
                }
              }
        },
        foreign() {
          assert.fail("effect command cannot fall back")
        }
      })
      const invocation = driver.allocateFreshnessInvocation()
      const session = {
        invocation,
        finish() {},
        revoke() {},
        close() {
          closes++
        }
      }
      const result = await Effect.runPromise(driver.driveEffect(session, { invocation: Number(BigInt(invocation)) }))
      assert.equal(result.failure.$, "Types.InvocationCancelled")
      outcomes.push({ result, closes, starts, resumes, resources: driver.resources })
    }
    assert.deepEqual(outcomes[1], outcomes[0])
    assert.equal(outcomes[1].closes, 1)
    assert.equal(outcomes[1].starts, 1)
    assert.equal(outcomes[1].resumes, 0)
    assertions += 4
  }
  // The pending engine boundary must distinguish immediate throws from late
  // rejection and mapper failures, while cancellation still drains its lease.
  for (const mode of ["resolved", "immediate", "cancel-reject", "external-reject", "cancel-map-throw"]) {
    const registry = createServiceRegistry()
    const original = new Error("pending engine " + mode)
    let resumed = 0,
      closes = 0,
      mapped = 0
    let rejectPending
    let startedEngine
    const started = new Promise((resolve) => {
      startedEngine = resolve
    })
    const machine = {
      initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 7 } }),
      view: (value) => value,
      resume() {
        resumed++
        return { $: "Types.CompletedResolver", result: "accepted" }
      },
      disposeInvocation() {},
      get retainedHandles() {
        return 0
      }
    }
    const driver = createFixtureDriver({
      owner: m,
      initialState: fresh(),
      scope,
      registry,
      machine,
      foreignSync() {
        startedEngine()
        if (mode === "immediate") {
          driver.cancel(Number(BigInt(invocation)))
          throw original
        }
        if (mode.startsWith("cancel")) driver.cancel(Number(BigInt(invocation)))
        const pending =
          mode === "external-reject"
            ? new Promise((_resolve, reject) => {
                rejectPending = reject
              })
            : mode === "cancel-reject"
              ? Promise.reject(original)
              : Promise.resolve("reply")
        return {
          pending,
          map(value) {
            mapped++
            if (mode === "cancel-map-throw") throw original
            return { value }
          }
        }
      },
      foreign() {
        assert.fail("pending engine must not call async fallback")
      }
    })
    const invocation = driver.allocateInvocation()
    const session = {
      invocation,
      finish() {},
      revoke() {},
      close() {
        closes++
      }
    }
    const execution = driver.drive(session, { invocation: Number(BigInt(invocation)) })
    if (mode === "external-reject") {
      await started
      driver.cancel(Number(BigInt(invocation)))
      rejectPending(original)
    }
    if (mode === "immediate") await assert.rejects(execution, (error) => error === original)
    else {
      const outcome = await execution
      if (mode === "resolved") assert.equal(outcome.result, "accepted")
      else assert.equal(outcome.failure.$, "Types.InvocationCancelled")
    }
    assert.equal(resumed, mode === "resolved" ? 1 : 0)
    assert.equal(mapped, mode === "resolved" || mode === "cancel-map-throw" ? 1 : 0)
    assert.equal(closes, 1)
    assert.equal(registry.pendingCleanup, 0)
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assertions += 6
  }
  // Independent operations are issued with their exact child, without
  // manufacturing an observation or borrowing another operation's scope.
  for (const [scopeKind, launchMethod] of [
    ["SettingsScope", "launch_settings"],
    ["FreshnessScope", "launch_freshness"]
  ]) {
    let settings = m.initial_limits(100, 100000, 100, 100000)
    const untouchedCanonical = settings.canonical
    let settingsOut = m[launchMethod](settings, 500)
    assert.deepEqual(list(settingsOut.outputs), [])
    settings = advanced(settingsOut)
    assert.deepEqual(settings.canonical, untouchedCanonical)
    const settingsChild = m.find(1, settings.children).value
    assert.deepEqual(settingsChild.scope, { $: scopeKind, operation: 1 })
    assert.equal(m.live(settings.canonical, settingsChild.scope), false)
    assert.equal(m.child_live(settings.canonical, settings.children, settingsChild), true)
    assert.equal(
      m.child_live(settings.canonical, settings.children, { ...settingsChild, scope: { $: scopeKind, operation: 2 } }),
      false
    )
    reject(m.launch(settings, settingsChild.scope, 501), "NotPreparing")
    settings = advanced(m.install(settings, 1, 0, 511, 0))
    settings = advanced(m.provider_start(settings, 1))
    assert.equal(m.provider_live(settings, 1, 0, 1, 0), true)
    for (const tuple of [
      [2, 0, 1, 0],
      [1, 1, 1, 0],
      [1, 0, 2, 0],
      [1, 0, 1, 1]
    ])
      assert.equal(m.provider_live(settings, ...tuple), false)
    const settingsNested = m.launch_nested(settings, { $: "Parent", invocation: 1, generation: 0, request: 0 }, 516)
    reject(settingsNested, "WrongPhase")
    assert.deepEqual(settingsNested.state, settings)
    assert.deepEqual(
      list(settings.children).map((child) => child.invocation),
      [1]
    )
    const cancelledSettings = advanced(m.cancel(settings, 1))
    assert.equal(m.provider_live(cancelledSettings, 1, 0, 1, 0), false)
    const cancelledCompletion = m.provider_completed(cancelledSettings, 1, 1, 0, 512)
    assert.equal(
      list(cancelledCompletion.actions).some((action) => action.$ === "Resume" || action.$ === "AcceptResult"),
      false
    )
    settings = advanced(m.provider_completed(settings, 1, 1, 0, 512))
    settingsOut = m.terminal(settings, 1, 1, 513)
    assert.deepEqual(list(settingsOut.actions), [
      { $: "AcceptResult", scope: settingsChild.scope, invocation: 1, result_handle: 513 }
    ])
    settings = advanced(settingsOut)
    assert.equal(m.child_live(settings.canonical, settings.children, m.find(1, settings.children).value), false)
    reject(m.terminal(settings, 1, 1, 513), "WrongPhase")
    settings = advanced(m[launchMethod](settings, 514))
    assert.deepEqual(m.find(2, settings.children).value.scope, { $: scopeKind, operation: 2 })
    assert.deepEqual(settings.canonical, untouchedCanonical)
    reject(m[launchMethod]({ ...settings, next_invocation: 0 }, 515), "NotPreparing")
    reject(m[launchMethod]({ ...settings, next_invocation: 1 }, 515), "NotPreparing")
    assert.equal(
      m.child_live(settings.canonical, settings.children, {
        ...m.find(2, settings.children).value,
        scope: { $: scopeKind === "SettingsScope" ? "FreshnessScope" : "SettingsScope", operation: 2 }
      }),
      false
    )
    assertions += 24
  }
  // The real common executor launches freshness from an empty Canonical state.
  // Its named operation must not create preparation work or require host IDs.
  for (const cancelled of [false, true]) {
    const registry = createServiceRegistry()
    const initialState = m.initial_limits(100, 100000, 100, 100000)
    let closes = 0,
      resumed = 0
    const machine = {
      initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 1 } }),
      view: (value) => value,
      resume() {
        resumed++
        return { $: "Types.CompletedResolver", result: "freshness" }
      },
      disposeInvocation() {},
      get retainedHandles() {
        return 0
      }
    }
    const driver = createFixtureDriver({
      owner: m,
      initialState,
      registry,
      machine,
      foreignSync() {
        if (cancelled) driver.cancel(Number(BigInt(invocation)))
        return { value: { value: "fact" } }
      },
      foreign() {
        assert.fail("synchronous freshness engine must not use async fallback")
      }
    })
    const invocation = driver.allocateFreshnessInvocation()
    assert.equal(invocation, 1)
    assert.deepEqual(m.find(1, driver.state.children).value.scope, { $: "FreshnessScope", operation: 1 })
    const session = {
      invocation,
      finish() {},
      revoke() {},
      close() {
        closes++
      }
    }
    const outcome = await driver.drive(session, { invocation: Number(BigInt(invocation)) })
    if (cancelled) assert.equal(outcome.failure.$, "Types.InvocationCancelled")
    else assert.equal(outcome.result, "freshness")
    assert.equal(resumed, cancelled ? 0 : 1)
    assert.equal(closes, 1)
    assert.deepEqual(driver.state.canonical, initialState.canonical)
    assert.equal(registry.pendingCleanup, 0)
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assertions += 8
  }
  let invalidSource = fresh()
  const wrongScope = {
    $: "SourceScope",
    partition: 1,
    lifetime: 1,
    round: 1,
    observation: 2,
    permission: { $: "SourceNew" }
  }
  invalidSource = {
    ...invalidSource,
    children: {
      $: "Con",
      head: {
        $: "Child",
        scope: wrongScope,
        invocation: 1,
        generation: 0,
        handle: 0,
        phase: { $: "ChildInstalling" },
        request: { $: "None" },
        lease: { $: "None" },
        parent: { $: "None" }
      },
      tail: { $: "Nil" }
    }
  }
  const refusedSource = m.terminal_source_failed(invalidSource, 1, 0, 600)
  reject(refusedSource, "CanonicalRejected")
  assert.equal(refusedSource.refusal.reason.$, "../Canonical.WrongStage")
  assert.deepEqual(refusedSource.state, invalidSource)
  assertions++
  let source = fresh()
  const sourceScope = {
    $: "SourceScope",
    partition: 1,
    lifetime: 1,
    round: 1,
    observation: 1,
    permission: { $: "SourceNew" }
  }
  source = advanced(m.launch_source(source, sourceScope, 400))
  reject(m.launch_source(source, sourceScope, 499), "NotPreparing")
  reject(m.complete_source_observation(source, 1, 0, 1, 0), "WrongPhase")
  source = advanced(m.install_source(source, 1, 0, 401, 0, { $: "SourceCandidate" }))
  source = advanced(m.provider_start(source, 1))
  const sourceParent = { $: "Parent", invocation: 1, generation: 0, request: 0 }
  source = advanced(
    m.launch_source_preparation(
      source,
      sourceParent,
      { $: "PreparationScope", partition: 1, lifetime: 1, round: 1, preparation: 2 },
      402
    )
  )
  assert.deepEqual(m.find(2, source.children).value.parent.value, sourceParent)
  source = advanced(m.install(source, 2, 0, 403, 0))
  source = advanced(m.provider_start(source, 2))
  source = advanced(m.launch_nested(source, { $: "Parent", invocation: 2, generation: 0, request: 0 }, 404))
  assert.equal(m.find(3, source.children).value.scope.$, "Scope")
  const sourceCancelled = advanced(m.cancel(source, 1))
  for (const invocation of [1, 2, 3])
    assert.equal(m.find(invocation, sourceCancelled.children).value.phase.$, "ChildCancelled")
  reject(m.launch_nested(source, { $: "Parent", invocation: 3, generation: 0, request: 0 }, 405), "WrongPhase")
  source = advanced(m.terminal(source, 3, 0, 406))
  source = advanced(m.provider_completed(source, 2, 2, 0, 407))
  source = advanced(m.terminal_preparation(source, 2, 1, 408))
  assert.deepEqual(m.find(4, source.children).value.parent.value, sourceParent)
  source = advanced(m.terminal(source, 4, 0, 409))
  source = advanced(m.provider_completed(source, 1, 1, 0, 410))
  source = advanced(m.install_source(source, 1, 1, 411, 1, { $: "SourceActivity" }))
  source = advanced(m.provider_start(source, 1))
  reject(m.complete_source_observation(source, 1, 1, 3, 1), "WrongPhase")
  source = advanced(m.provider_completed(source, 1, 3, 1, 412))
  source = advanced(m.install_source(source, 1, 2, 413, 2, { $: "SourceObservation" }))
  source = advanced(m.provider_start(source, 1))
  const sourceOut = m.complete_source_observation(source, 1, 2, 4, 2)
  source = advanced(sourceOut)
  assert.equal(m.find(1, source.children).value.scope.$, "AfterSourceScope")
  assert.equal(
    list(sourceOut.actions).some((action) => action.$ === "CancelChild" && action.invocation === 1),
    false
  )
  reject(m.complete_source_observation(source, 1, 2, 4, 2), "WrongPhase")
  source = advanced(m.provider_completed(source, 1, 4, 2, 414))
  reject(m.install(source, 1, 3, 415, 9), "WrongGeneration")
  source = advanced(m.install_after_source(source, 1, 3, 415, 3, { $: "AfterBarrier" }))
  source = advanced(m.provider_start(source, 1))
  source = advanced(m.provider_completed(source, 1, 5, 3, 416))
  reject(m.install(source, 1, 4, 418, 3), "WrongGeneration")
  assert.equal(m.source_claimed(sourceScope, source.children), true)
  source = advanced(m.terminal(source, 1, 4, 417))
  assert.equal(m.find(1, source.children).value.phase.$, "ChildAccepted")
  assertions += 12
  let s = fresh()
  reject(m.launch(s, { ...scope, preparation: 1 }, 50), "NotPreparing")
  assertions++
  let out = m.launch(s, scope, 50)
  assert.deepEqual(list(out.actions), [{ $: "Launch", invocation: 1, input_handle: 50 }])
  s = advanced(out)
  s = advanced(m.install(s, 1, 0, 11, 0))
  out = m.provider_start(s, 1)
  assert.deepEqual(list(out.actions), [{ $: "ExecuteProvider", invocation: 1, lease: 1, request: 0, state_handle: 11 }])
  s = advanced(out)
  assertions += 2
  assert.equal(m.provider_live(s, 1, 0, 1, 0), true)
  for (const tuple of [
    [2, 0, 1, 0],
    [1, 1, 1, 0],
    [1, 0, 2, 0],
    [1, 0, 1, 1]
  ])
    assert.equal(m.provider_live(s, ...tuple), false)
  assert.equal(m.provider_live(advanced(m.cancel(s, 1)), 1, 0, 1, 0), false)
  assertions += 6
  reject(m.provider_completed(s, 1, 2, 0, 60), "WrongLease")
  reject(m.provider_completed(s, 1, 1, 1, 60), "WrongLease")
  assertions += 2
  out = m.provider_completed(s, 1, 1, 0, 60)
  assert.deepEqual(
    list(out.actions).map((x) => x.$),
    ["Resume", "RetireHandle", "CleanupProvider"]
  )
  s = advanced(out)
  assertions++
  reject(m.provider_completed(s, 1, 1, 0, 60), "WrongLease")
  reject(m.install(s, 1, 0, 12, 1), "WrongGeneration")
  assertions += 2
  out = m.terminal(s, 1, 1, 70)
  assert.deepEqual(list(out.actions), [{ $: "AcceptResult", scope, invocation: 1, result_handle: 70 }])
  s = advanced(out)
  reject(m.terminal(s, 1, 1, 70), "WrongPhase")
  reject(m.cancel(s, 1), "WrongPhase")
  assertions += 3
  out = m.launch(s, scope, 51)
  assert.equal(list(out.actions)[0].invocation, 2)
  s = advanced(out)
  s = advanced(m.cancel(s, 2))
  reject(m.install(s, 2, 0, 20, 0), "WrongGeneration")
  assertions += 2
  for (const invalidate of ["cancel", "round", "observation", "preparation"]) {
    let state = fresh()
    state = advanced(m.launch(state, scope, 50))
    state = advanced(m.install(state, 1, 0, 11, 0))
    state = advanced(m.provider_start(state, 1))
    let revoked
    if (invalidate === "cancel") revoked = m.cancel(state, 1)
    else
      revoked = m.canonical_event(
        state,
        invalidate === "round"
          ? c("RetirePartition", { partition: 1, lifetime: 1, round: 1 })
          : invalidate === "observation"
            ? c("InterruptObservation", { partition: 1, lifetime: 1, round: 1, observation: 1 })
            : c("InterruptPreparation", { partition: 1, lifetime: 1, round: 1, operation: 2 })
      )
    assert.equal(revoked.$, "Advanced", invalidate + " " + JSON.stringify(revoked.refusal))
    assert.deepEqual(
      list(revoked.actions).map((x) => x.$),
      ["CancelChild", "RetireHandle"]
    )
    state = advanced(revoked)
    if (invalidate === "round")
      state = advanced(m.canonical_event(state, c("OpenRound", { partition: 1, lifetime: 2 })))
    const late = m.provider_completed(state, 1, 1, 0, 99)
    assert.deepEqual(
      list(late.actions).map((x) => x.$),
      ["CleanupProvider"]
    )
    state = advanced(late)
    reject(m.provider_completed(state, 1, 1, 0, 99), "WrongLease")
    reject(m.terminal(state, 1, 0, 99), "WrongPhase")
    assertions += 4
  }
  // Parent custody is tied to the exact outstanding generation/request.
  let nested = fresh()
  nested = advanced(m.launch(nested, scope, 100))
  nested = advanced(m.install(nested, 1, 0, 101, 7))
  nested = advanced(m.provider_start(nested, 1))
  const parent = { $: "Parent", invocation: 1, generation: 0, request: 7 }
  reject(m.launch_nested(nested, { ...parent, generation: 1 }, 200), "WrongPhase")
  reject(m.launch_nested(nested, { ...parent, request: 8 }, 200), "WrongPhase")
  assertions += 2
  out = m.launch_nested(nested, parent, 200)
  assert.deepEqual(list(out.actions), [{ $: "Launch", invocation: 2, input_handle: 200 }])
  nested = advanced(out)
  reject(m.launch_nested(nested, parent, 205), "WrongPhase")
  assertions++
  assert.deepEqual(m.find(2, nested.children).value.parent.value, parent)
  nested = advanced(m.install(nested, 2, 0, 201, 0))
  nested = advanced(m.provider_start(nested, 2))
  assertions++
  reject(m.launch_nested(nested, { $: "Parent", invocation: 2, generation: 0, request: 0 }, 300), "WrongPhase")
  assertions++
  out = m.cancel(nested, 1)
  assert.deepEqual(
    list(out.actions)
      .filter((action) => action.$ === "CancelChild")
      .map((action) => action.invocation),
    [1, 2]
  )
  nested = advanced(out)
  assert.equal(m.find(1, nested.children).value.phase.$, "ChildCancelled")
  assert.equal(m.find(2, nested.children).value.phase.$, "ChildCancelled")
  assertions++
  out = m.provider_completed(nested, 2, 2, 0, 202)
  assert.deepEqual(
    list(out.actions).map((action) => action.$),
    ["CleanupProvider"]
  )
  nested = advanced(out)
  out = m.provider_completed(nested, 1, 1, 7, 102)
  assert.deepEqual(
    list(out.actions).map((action) => action.$),
    ["CleanupProvider"]
  )
  nested = advanced(out)
  assertions += 2
  reject(m.terminal(nested, 2, 0, 203), "WrongPhase")
  reject(m.launch_nested(nested, parent, 204), "WrongPhase")
  assertions += 2
  let successful = fresh()
  successful = advanced(m.launch(successful, scope, 100))
  successful = advanced(m.install(successful, 1, 0, 101, 7))
  successful = advanced(m.provider_start(successful, 1))
  successful = advanced(m.launch_nested(successful, parent, 200))
  successful = advanced(m.terminal(successful, 2, 0, 201))
  successful = advanced(m.provider_completed(successful, 1, 1, 7, 102))
  successful = advanced(m.install(successful, 1, 1, 103, 8))
  successful = advanced(m.provider_start(successful, 1))
  reject(m.launch_nested(successful, parent, 202), "WrongPhase")
  successful = advanced(m.launch_nested(successful, { ...parent, generation: 1, request: 8 }, 203))
  assertions += 2
  let premature = fresh()
  premature = advanced(m.launch(premature, scope, 100))
  premature = advanced(m.install(premature, 1, 0, 101, 7))
  premature = advanced(m.provider_start(premature, 1))
  premature = advanced(m.launch_nested(premature, parent, 200))
  premature = advanced(m.install(premature, 2, 0, 201, 0))
  premature = advanced(m.provider_start(premature, 2))
  out = m.provider_completed(premature, 1, 1, 7, 102)
  assert.equal(
    list(out.actions).some((action) => action.$ === "CancelChild" && action.invocation === 2),
    true
  )
  premature = advanced(out)
  assertions++
  reject(m.terminal(premature, 2, 0, 203), "WrongPhase")
  out = m.provider_completed(premature, 2, 2, 0, 204)
  assert.deepEqual(
    list(out.actions).map((action) => action.$),
    ["CleanupProvider"]
  )
  assertions += 2
  // Preparation acceptance produces a new retaining child; callers cannot launch it.
  let handoffState = fresh()
  handoffState = advanced(m.launch_preparation(handoffState, scope, 300))
  reject(m.launch_preparation(handoffState, scope, 301), "NotPreparing")
  assertions++
  reject(m.terminal(handoffState, 1, 0, 302), "WrongPhase")
  assertions++
  reject(m.terminal_preparation(handoffState, 1, 1, 302), "WrongPhase")
  assertions++
  out = m.terminal_preparation(handoffState, 1, 0, 302)
  const handoffAction = list(out.actions)[0],
    retaining = { $: "RetainingScope", partition: 1, lifetime: 1, round: 1, observation: 1, origin: 1 }
  assert.deepEqual(handoffAction, {
    $: "LaunchPostPreparation",
    invocation: 2,
    preparation_invocation: 1,
    result_handle: 302,
    scope: retaining
  })
  handoffState = advanced(out)
  assertions++
  assert.equal(m.find(1, handoffState.children).value.phase.$, "ChildAccepted")
  assert.equal(m.find(2, handoffState.children).value.parent.$, "None")
  assertions++
  reject(m.launch(handoffState, retaining, 303), "NotPreparing")
  reject(m.launch_preparation(handoffState, retaining, 303), "NotPreparing")
  assertions += 2
  reject(m.terminal_preparation(handoffState, 1, 0, 304), "WrongPhase")
  reject(m.terminal_preparation(handoffState, 2, 0, 304), "WrongPhase")
  assertions += 2
  out = m.canonical_event(
    handoffState,
    c("PreparationCompleted", { partition: 1, lifetime: 1, round: 1, operation: 2, unit_bytes: { $: "Nil" } })
  )
  handoffState = advanced(out)
  assert.equal(m.live(handoffState.canonical, retaining), true)
  assert.equal(m.find(2, handoffState.children).value.phase.$, "ChildInstalling")
  assertions++
  handoffState = advanced(m.install(handoffState, 2, 0, 305, 0))
  handoffState = advanced(m.provider_start(handoffState, 2))
  out = m.canonical_event(
    handoffState,
    c("InterruptObservation", { partition: 1, lifetime: 1, round: 1, observation: 1 })
  )
  assert.ok(list(out.actions).some((action) => action.$ === "CancelChild" && action.invocation === 2))
  handoffState = advanced(out)
  assertions++
  out = m.provider_completed(handoffState, 2, 1, 0, 306)
  assert.deepEqual(
    list(out.actions).map((action) => action.$),
    ["CleanupProvider"]
  )
  assertions++
  let beforeInstall = fresh()
  beforeInstall = advanced(m.launch_preparation(beforeInstall, scope, 400))
  beforeInstall = advanced(m.terminal_preparation(beforeInstall, 1, 0, 401))
  out = m.cancel(beforeInstall, 2)
  assert.deepEqual(
    list(out.actions).map((action) => action.$),
    ["CancelChild"]
  )
  assertions++
  let cancelledPreparation = fresh()
  cancelledPreparation = advanced(m.launch_preparation(cancelledPreparation, scope, 600))
  cancelledPreparation = advanced(m.cancel(cancelledPreparation, 1))
  reject(m.launch_preparation(cancelledPreparation, scope, 601), "NotPreparing")
  assertions++
  let failedPreparation = fresh()
  failedPreparation = advanced(m.launch_preparation(failedPreparation, scope, 500))
  out = m.terminal_preparation_failed(failedPreparation, 1, 0, 501)
  assert.deepEqual(
    list(out.actions).map((action) => action.$),
    ["AcceptResult"]
  )
  assertions++
  reject(m.terminal_preparation(fresh(), 99, 0, 600), "UnknownInvocation")
  assertions++
  // Advice custody is born at PendingFinding and survives source/round cutoff.
  let adviceState = fresh()
  adviceState = advanced(m.launch_preparation(adviceState, scope, 700))
  adviceState = advanced(m.terminal_preparation(adviceState, 1, 0, 701))
  adviceState = advanced(
    m.canonical_event(
      adviceState,
      c("PreparationCompleted", {
        partition: 1,
        lifetime: 1,
        round: 1,
        operation: 2,
        unit_bytes: { $: "Con", head: 100, tail: { $: "Nil" } }
      })
    )
  )
  adviceState = advanced(m.install(adviceState, 2, 0, 702, 0))
  adviceState = advanced(m.provider_start(adviceState, 2))
  reject(m.handoff_advice(adviceState, 2, 0, 1, 0, 3, 703), "WrongPhase")
  assertions++
  adviceState = advanced(
    m.canonical_event(adviceState, c("StartReview", { partition: 1, lifetime: 1, round: 1, operation: 3 }))
  )
  adviceState = advanced(
    m.canonical_event(
      adviceState,
      c("ReviewCompleted", { partition: 1, lifetime: 1, round: 1, operation: 3, outcome: c("Finding") })
    )
  )
  for (const tuple of [
    [2, 1, 1, 0],
    [2, 0, 2, 0],
    [2, 0, 1, 1]
  ]) {
    reject(m.handoff_advice(adviceState, ...tuple, 3, 703), "WrongLease")
    assertions++
  }
  out = m.handoff_advice(adviceState, 2, 0, 1, 0, 3, 703)
  assert.deepEqual(list(out.actions), [
    { $: "LaunchAdviceTail", invocation: 3, origin: 2, operation: 3, input_handle: 703 }
  ])
  adviceState = advanced(out)
  assertions++
  reject(m.handoff_advice(adviceState, 2, 0, 1, 0, 3, 704), "WrongPhase")
  assertions++
  const tail = m.find(3, adviceState.children).value
  assert.equal(tail.parent.$, "None")
  reject(m.launch(adviceState, tail.scope, 704), "NotPreparing")
  reject(m.install(adviceState, 3, 0, 705, 0), "WrongGeneration")
  reject(m.install_advice(adviceState, 3, 0, 705, 0, { $: "TailPublish" }), "WrongGeneration")
  reject(m.terminal(adviceState, 3, 0, 706), "WrongPhase")
  assertions += 5
  reject(m.terminal_advice_preserved(adviceState, 3, 1, 715), "WrongPhase")
  reject(m.terminal_advice_preserved(adviceState, 2, 0, 715), "WrongPhase")
  assertions += 2
  const preserved = m.terminal_advice_preserved(adviceState, 3, 0, 715)
  assert.equal(preserved.$, "Advanced")
  assert.deepEqual(preserved.state.canonical, adviceState.canonical)
  assert.deepEqual(list(preserved.actions), [
    { $: "AcceptResult", scope: tail.scope, invocation: 3, result_handle: 715 }
  ])
  assert.equal(m.find(3, preserved.state.children).value.phase.$, "ChildAccepted")
  assertions++
  reject(m.terminal_advice_preserved(preserved.state, 3, 0, 716), "WrongPhase")
  assertions++
  const cutoffPreserved = advanced(m.cancel(adviceState, 2))
  assert.equal(m.terminal_advice_preserved(cutoffPreserved, 3, 0, 717).$, "Advanced")
  assertions++
  adviceState = advanced(m.install_advice(adviceState, 3, 0, 705, 0, { $: "TailBarrier" }))
  adviceState = advanced(m.provider_start(adviceState, 3))
  reject(m.terminal_advice_preserved(adviceState, 3, 0, 716), "WrongPhase")
  assertions++
  adviceState = advanced(m.cancel(adviceState, 2))
  assert.equal(m.find(3, adviceState.children).value.phase.$, "ChildAwaiting")
  assert.equal(m.provider_live(adviceState, 3, 0, 2, 0), true)
  assert.equal(m.advice_provider_allowed(adviceState, 3, 0, 2, 0, { $: "TailPublish" }), false)
  assertions += 3
  adviceState = advanced(
    m.canonical_event(adviceState, c("InterruptObservation", { partition: 1, lifetime: 1, round: 1, observation: 1 }))
  )
  assert.equal(m.provider_live(adviceState, 3, 0, 2, 0), true)
  assertions++
  adviceState = advanced(m.provider_completed(adviceState, 3, 2, 0, 707))
  adviceState = advanced(m.install_advice(adviceState, 3, 1, 708, 1, { $: "TailActive" }))
  adviceState = advanced(m.provider_start(adviceState, 3))
  adviceState = advanced(m.provider_completed(adviceState, 3, 3, 1, 709))
  adviceState = advanced(m.install_advice(adviceState, 3, 2, 710, 2, { $: "TailPublish" }))
  adviceState = advanced(m.provider_start(adviceState, 3))
  assert.equal(m.advice_provider_allowed(adviceState, 3, 2, 4, 2, { $: "TailPublish" }), true)
  assert.equal(m.advice_provider_allowed(adviceState, 3, 2, 4, 2, { $: "TailRemove" }), false)
  assertions += 2
  adviceState = advanced(m.cancel(adviceState, 3))
  assert.equal(m.advice_provider_allowed(adviceState, 3, 2, 4, 2, { $: "TailPublish" }), false)
  assert.equal(m.advice_provider_allowed(adviceState, 3, 2, 4, 2, { $: "TailRemove" }), true)
  assertions += 2
  adviceState = advanced(m.provider_completed(adviceState, 3, 4, 2, 711))
  reject(m.install_advice(adviceState, 3, 3, 712, 3, { $: "TailPublish" }), "WrongGeneration")
  assertions++
  adviceState = advanced(m.install_advice(adviceState, 3, 3, 712, 3, { $: "TailRemove" }))
  adviceState = advanced(m.provider_start(adviceState, 3))
  adviceState = advanced(m.provider_completed(adviceState, 3, 5, 3, 713))
  adviceState = advanced(m.terminal(adviceState, 3, 4, 714))
  assert.equal(m.find(3, adviceState.children).value.phase.$, "ChildAccepted")
  assert.equal(m.provider_live(adviceState, 3, 4, 5, 3), false)
  reject(m.advice_cleanup_only(adviceState, 3), "WrongPhase")
  assertions += 3
  for (const mode of ["promise", "effect"])
    for (const failureAt of ["input", "machine", "register"]) {
      const registry = createServiceRegistry(),
        machine = {
          initial: () => ({ $: "PreparationFinished", result: {} }),
          view: (value) => value,
          disposeInvocation() {},
          get retainedHandles() {
            return 0
          }
        }
      const driver = createChildExecutionDriver({
        protocol: { ...fixtureProtocol, view: (held) => ({ ...fixtureProtocol.view(held), kind: "fixture" }) },
        owner: m,
        initialState: fresh(),
        scope,
        registry,
        machine,
        selectMachine: (input) => {
          if (input.postPreparation && failureAt === "machine") throw new Error("machine construction")
          return machine
        },
        foreign: () => {
          throw new Error("unexpected provider")
        }
      })
      const invocation = driver.allocatePreparationInvocation()
      const prepSession = { invocation, close() {}, revoke() {} }
      const receipt = await driver.drive(prepSession, { invocation: Number(BigInt(invocation)) })
      let finishes = 0,
        closes = 0
      const session = {
        invocation: Number(receipt.handoff),
        finish() {
          finishes++
        },
        close() {
          closes++
        },
        revoke() {}
      }
      if (failureAt === "register") registry.register({ invocation: session.invocation, close() {} })
      const buildInput = () => {
        if (failureAt === "input") throw new Error("input construction")
        return { invocation: receipt.handoff, postPreparation: {} }
      }
      await assert.rejects(
        mode === "promise"
          ? driver.driveHandoff(receipt, session, buildInput)
          : Effect.runPromise(driver.driveHandoffEffect(receipt, session, buildInput)),
        failureAt === "register" ? /duplicate active invocation/ : new RegExp(failureAt + " construction")
      )
      assert.equal(finishes, 1)
      assert.equal(closes, 1)
      assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
      assertions += 3
    }
  // An issued preparation handoff executes its native effect in the caller's
  // fiber; forged Advice capabilities remain refused and close exactly once.
  {
    const registry = createServiceRegistry()
    let observedFiber,
      closes = 0
    const machine = {
      initial: (input) =>
        input.postPreparation
          ? { $: "Types.AwaitService", request: { invocation: input.invocation, id: 0 } }
          : { $: "PreparationFinished", result: {} },
      view: (value) => value,
      resume: () => ({ $: "Types.CompletedResolver", result: "post accepted" }),
      disposeInvocation() {},
      retainedHandles: 0
    }
    const driver = createChildExecutionDriver({
      protocol: { ...fixtureProtocol, view: (held) => ({ ...fixtureProtocol.view(held), kind: "fixture" }) },
      owner: m,
      initialState: fresh(),
      scope,
      registry,
      machine,
      foreignSync: () => ({
        effect: Effect.map(Effect.fiber, (fiber) => {
          observedFiber = fiber
          return {}
        }),
        map: (value) => value
      }),
      foreign() {
        assert.fail("Effect handoff cannot use Promise provider")
      }
    })
    const invocation = driver.allocatePreparationInvocation()
    const receipt = await driver.drive(
      { invocation, close() {}, revoke() {} },
      { invocation: Number(BigInt(invocation)) }
    )
    const session = {
      invocation: Number(receipt.handoff),
      close() {
        closes++
      },
      revoke() {}
    }
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const caller = yield* Effect.fiber
        const outcome = yield* driver.driveHandoffEffect(receipt, session, () => ({
          invocation: receipt.handoff,
          postPreparation: {}
        }))
        assert.equal(observedFiber, caller)
        return outcome
      })
    )
    assert.equal(result.result, "post accepted")
    assert.equal(closes, 1)
    for (const mode of ["promise", "effect"]) {
      let refusedCloses = 0
      const refused = {
        invocation: 9999,
        input: { invocation: 9999 },
        close() {
          refusedCloses++
        },
        revoke() {}
      }
      const forged = { handoff: 9999, scope: { $: "AdviceTailScope", origin: 1 } }
      await assert.rejects(
        mode === "promise"
          ? driver.driveAdvice(forged, refused)
          : Effect.runPromise(driver.driveAdviceEffect(forged, refused))
      )
      assert.equal(refusedCloses, 1)
    }
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assertions += 6
  }
  // Construction stays under the interpreter mask until registration. Native
  // finalization still runs in the same fiber after an interruption is pending.
  for (const mode of [
    "success",
    "pre-interrupted",
    "construct-failure",
    "construct-interrupted",
    "provider-interrupted",
    "async-construct-interrupted"
  ]) {
    const registry = createServiceRegistry()
    let constructions = 0,
      closes = 0,
      finishes = 0,
      starts = 0,
      caller
    const machine = {
      initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 7 } }),
      view: (value) => value,
      resume: () => ({ $: "Types.CompletedResolver", result: "accepted" }),
      disposeInvocation() {},
      retainedHandles: 0
    }
    const driver = createFixtureDriver({
      owner: m,
      initialState: m.initial_limits(100, 100000, 100, 100000),
      registry,
      machine,
      foreignSync: () => ({
        effect: Effect.sync(() => {
          starts++
          if (mode === "provider-interrupted") caller.interruptUnsafe()
          return {}
        }),
        map: (value) => value
      }),
      foreign() {
        assert.fail("constructed Effect cannot start a Promise provider")
      }
    })
    const task = Effect.withFiber((fiber) => {
      caller = fiber
      const construct = () => {
        constructions++
        const invocation = driver.allocateFreshnessInvocation()
        if (mode === "construct-failure") {
          driver.constructionFailed(invocation)
          throw undefined
        }
        if (mode === "construct-interrupted") fiber.interruptUnsafe()
        const session = {
          invocation,
          close() {
            closes++
          },
          revoke() {},
          *finishFlow() {
            yield {
              kind: "effect",
              effect: Effect.map(Effect.fiber, (current) => {
                assert.equal(current, fiber)
                finishes++
              })
            }
          }
        }
        return { session, input: { invocation: Number(BigInt(invocation)) } }
      }
      return mode === "async-construct-interrupted"
        ? driver.driveConstructedFlowEffect(function* () {
            const held = construct()
            return yield {
              kind: "await",
              interruptible: false,
              value: Promise.resolve().then(() => {
                fiber.interruptUnsafe()
                return held
              })
            }
          })
        : driver.driveConstructedEffect(construct)
    })
    const exit = await Effect.runPromiseExit(mode === "pre-interrupted" ? Effect.andThen(Effect.interrupt, task) : task)
    assert.equal(constructions, mode === "pre-interrupted" ? 0 : 1)
    assert.equal(
      finishes,
      ["pre-interrupted", "construct-failure"].includes(mode) ? 0 : 1,
      mode +
        " finish: " +
        JSON.stringify({
          closes,
          starts,
          pending: registry.pendingCleanup,
          reasons: exit._tag === "Failure" ? exit.cause.reasons : []
        })
    )
    assert.equal(closes, finishes)
    assert.equal(exit._tag, mode === "success" ? "Success" : "Failure")
    if (exit._tag === "Failure" && mode !== "construct-failure") assert.equal(Cause.hasInterrupts(exit.cause), true)
    assert.equal(registry.size, 0)
    assert.equal(registry.pendingCleanup, 0)
    assert.equal(starts, ["success", "provider-interrupted"].includes(mode) ? 1 : 0)
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assertions += 9
  }
  // Opaque provider failures include falsy JavaScript thrown values. They must
  // survive saved-reply delivery without a Resume or terminal acceptance.
  for (const failureKind of ["thrown", "ForeignProviderFailure", "RuntimeFailure"])
    for (const { original, cleanupFails, closeFails } of [
      undefined,
      null,
      false,
      0,
      "",
      new Error("provider identity")
    ].flatMap((original) =>
      ["none", "finish", "close"].map((phase) => ({
        original,
        cleanupFails: phase === "finish",
        closeFails: phase === "close"
      }))
    )) {
      const token = { $: "Types.ExceptionToken", invocation: 0, id: 1 }
      let closed = false,
        projections = 0
      const registry = createServiceRegistry()
      const machine = {
        initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 7 } }),
        view: (value) => value,
        resume() {
          if (failureKind === "thrown") assert.fail("failed provider must not resume the engine")
          return { $: "Types.FailedResolver", failure: { $: "Types." + failureKind, exception: token } }
        },
        disposeInvocation() {},
        get retainedHandles() {
          return 0
        }
      }
      const driver = createFixtureDriver({
        owner: m,
        initialState: fresh(),
        scope,
        registry,
        machine,
        foreign() {
          if (failureKind === "thrown") throw original
          return { $: "Types.Reply" }
        }
      })
      const invocation = driver.allocateInvocation()
      token.invocation = Number(BigInt(invocation))
      const cleanupError = new Error("original cleanup failure")
      let allowCleanup = !cleanupFails
      const session = {
        invocation,
        exception(value) {
          assert.equal(closed, false)
          assert.strictEqual(value, token)
          projections++
          return original
        },
        finish() {
          if (!allowCleanup) throw cleanupError
        },
        close() {
          closed = true
          if (closeFails) throw original
        },
        revoke() {}
      }
      const observed = await driver.drive(session, { invocation: Number(BigInt(invocation)) }).then(
        () => ({ raised: false }),
        (error) => ({ raised: true, error })
      )
      assert.equal(observed.raised, true)
      if (cleanupFails) {
        assert.ok(observed.error instanceof AggregateError)
        assert.equal(observed.error.cause, original)
        assert.ok(observed.error.errors.includes(original))
        assert.ok(observed.error.errors.includes(cleanupError))
        assert.equal(registry.pendingCleanup, 1)
        assert.equal(driver.resources.sessions, 1)
        allowCleanup = true
        await registry.retryCleanup()
        assertions += 6
      } else if (closeFails) {
        assert.ok(observed.error instanceof AggregateError)
        assert.ok(Object.hasOwn(observed.error, "cause"))
        assert.equal(observed.error.cause, original)
        assert.deepEqual(observed.error.errors, [original, original])
        assertions += 4
      } else assert.equal(observed.error, original)
      assert.equal(driver.stats.resumes, failureKind === "thrown" ? 0 : 1)
      assert.equal(projections, failureKind === "thrown" ? 0 : 1)
      assert.equal(driver.stats.accepted, failureKind === "thrown" ? 0 : 1)
      assert.equal(registry.pendingCleanup, 0)
      assert.equal(registry.size, 0)
      assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
      assertions += 7
    }
  // Real session token storage must be read before registry.close clears it.
  for (const original of [undefined, false, new Error("actual session provider")]) {
    for (const cleanupFails of [false, true]) {
      const registry = createServiceRegistry()
      let allowCleanup = !cleanupFails,
        finishCalls = 0
      const cleanupError = new Error("actual session finish")
      const machine = {
        initial: (input) => ({
          $: "Types.AwaitService",
          request: { $: "Types.Request", invocation: input.invocation, id: 7, operation: { $: "Types.StartClock" } }
        }),
        view: (value) => value,
        resume(_raw, event) {
          assert.equal(event.reply.outcome.$, "Types.ProviderRejected")
          return {
            $: "Types.FailedResolver",
            failure: { $: "Types.ForeignProviderFailure", exception: event.reply.outcome.exception }
          }
        },
        disposeInvocation() {},
        retainedHandles: 0
      }
      const driver = createFixtureDriver({
        owner: m,
        initialState: fresh(),
        scope,
        registry,
        machine,
        foreign: ([request], options) => session.perform(request, options)
      })
      const invocation = driver.allocateInvocation()
      const session = {
        ...createServiceSession({
          invocation,
          root: temp,
          now() {
            throw original
          }
        }),
        finish() {
          finishCalls++
          if (!allowCleanup) throw cleanupError
        }
      }
      const observed = await driver.drive(session, { invocation: Number(BigInt(invocation)) }).then(
        () => ({ raised: false }),
        (error) => ({ raised: true, error })
      )
      assert.equal(observed.raised, true)
      if (cleanupFails) {
        assert.ok(observed.error instanceof AggregateError)
        assert.strictEqual(observed.error.cause, original)
        assert.deepEqual(observed.error.errors, [original, cleanupError, cleanupError])
        assert.equal(finishCalls, 2)
        assert.equal(registry.pendingCleanup, 1)
        allowCleanup = true
        await registry.retryCleanup()
        assertions += 4
      } else assert.strictEqual(observed.error, original)
      assert.equal(registry.pendingCleanup, 0)
      assert.equal(registry.size, 0)
      assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
      assertions += 4
    }
  }
  // Canonical cancellation can commit while engine disposal fails. Keep its
  // exact operation pending; successful revoke/abort must not run again.
  {
    const registry = createServiceRegistry()
    const primary = new Error("provider failed")
    const disposalFailure = new Error("engine disposal failed")
    const sinkFailure = new Error("cancel sink failed")
    let allowDisposal = false,
      disposals = 0,
      revokes = 0,
      cancellations = 0
    let providerSignal
    const machine = {
      initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 7 } }),
      view: (value) => value,
      resume() {
        assert.fail("failed provider cannot resume")
      },
      disposeInvocation() {
        disposals++
        if (!allowDisposal) throw disposalFailure
      },
      get retainedHandles() {
        return 0
      }
    }
    const driver = createFixtureDriver({
      owner: m,
      initialState: fresh(),
      scope,
      registry,
      machine,
      hooks: {
        canonicalOutputs() {
          if (revokes && !cancellations++) throw sinkFailure
        }
      },
      foreign(_requests, options) {
        providerSignal = options.signal
        throw primary
      }
    })
    const invocation = driver.allocateInvocation()
    const session = {
      invocation,
      finish() {},
      close() {},
      revoke() {
        revokes++
      }
    }
    await assert.rejects(driver.drive(session, { invocation: Number(BigInt(invocation)) }), (error) => {
      assert.equal(error.cause, primary)
      assert.ok(error.errors.includes(disposalFailure))
      assert.ok(error.errors.includes(sinkFailure))
      return true
    })
    assert.equal(m.find(Number(BigInt(invocation)), driver.state.children).value.phase.$, "ChildCancelled")
    assert.equal(revokes, 1)
    // Provider completion already discharged its lease before cancellation.
    assert.equal(providerSignal.aborted, false)
    assert.equal(driver.stats.providerCleanups, 1)
    assert.equal(registry.pendingCleanup, 1)
    assert.equal(driver.resources.sessions, 1)
    const failedAttempts = disposals
    await assert.rejects(registry.retryCleanup(), (error) => {
      assert.deepEqual(error.errors, [disposalFailure])
      return true
    })
    assert.equal(disposals, failedAttempts + 1)
    assert.equal(revokes, 1)
    assert.equal(registry.pendingCleanup, 1)
    assert.equal(driver.resources.sessions, 1)
    allowDisposal = true
    await registry.retryCleanup()
    assert.equal(disposals, failedAttempts + 2)
    assert.equal(revokes, 1)
    assert.equal(registry.pendingCleanup, 0)
    assert.equal(driver.stats.revoked, 1)
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assertions += 19
  }
  // A provider that ignores abort must settle before the session closes. Its
  // late reply cannot Resume an already cancelled child, even if disposal fails.
  for (const lateFailure of [false, true]) {
    const registry = createServiceRegistry()
    const disposalFailure = new Error("live provider disposal failed")
    let allowDisposal = false,
      revokes = 0,
      closes = 0,
      settled = false
    let completeProvider, providerSignal, startedProvider
    const started = new Promise((resolve) => {
      startedProvider = resolve
    })
    const machine = {
      initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 7 } }),
      view: (value) => value,
      resume() {
        assert.fail("late provider must not Resume")
      },
      disposeInvocation() {
        if (!allowDisposal) throw disposalFailure
      },
      get retainedHandles() {
        return 0
      }
    }
    const driver = createFixtureDriver({
      owner: m,
      initialState: fresh(),
      scope,
      registry,
      machine,
      foreign(_requests, options) {
        providerSignal = options.signal
        startedProvider()
        return new Promise((resolve, reject) => {
          completeProvider = () => {
            settled = true
            if (lateFailure) reject(undefined)
            else resolve([])
          }
        })
      }
    })
    const invocation = driver.allocateInvocation()
    const session = {
      invocation,
      finish() {
        assert.equal(settled, true)
      },
      close() {
        assert.equal(settled, true)
        closes++
      },
      revoke() {
        revokes++
      }
    }
    const observed = driver.drive(session, { invocation: Number(BigInt(invocation)) }).then(
      () => ({ raised: false }),
      (error) => ({ raised: true, error })
    )
    await started
    assert.throws(
      () => driver.cancel(invocation),
      (error) => error === disposalFailure
    )
    assert.equal(providerSignal.aborted, true)
    assert.equal(driver.resources.leases, 1)
    assert.equal(closes, 0)
    completeProvider()
    const result = await observed
    assert.equal(result.raised, true)
    assert.equal(result.error, disposalFailure)
    assert.equal(driver.stats.resumes, 0)
    assert.equal(driver.stats.providerCleanups, 1)
    assert.equal(closes, 1)
    assert.equal(registry.pendingCleanup, 1)
    assert.equal(driver.resources.sessions, 1)
    await assert.rejects(registry.retryCleanup(), (error) => {
      assert.deepEqual(error.errors, [disposalFailure])
      return true
    })
    assert.equal(revokes, 1)
    allowDisposal = true
    await registry.retryCleanup()
    assert.equal(registry.pendingCleanup, 0)
    assert.equal(revokes, 1)
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assertions += 16
  }
  // Constructor and cleanup are separate events even with identical values.
  for (const original of [undefined, new Error("shared thrown value")]) {
    const registry = createServiceRegistry()
    let allowCleanup = false
    let cleanupFailure = original
    const machine = {
      disposeInvocation() {},
      get retainedHandles() {
        return 0
      }
    }
    const driver = createFixtureDriver({
      owner: m,
      initialState: fresh(),
      scope,
      registry,
      machine,
      selectMachine() {
        throw original
      },
      foreign() {
        assert.fail("constructor failure cannot launch a provider")
      }
    })
    const invocation = driver.allocateInvocation()
    const session = {
      invocation,
      finish() {
        if (!allowCleanup) throw cleanupFailure
      },
      close() {},
      revoke() {}
    }
    const observed = await driver.drive(session, { invocation: Number(BigInt(invocation)) }).then(
      () => ({ raised: false }),
      (error) => ({ raised: true, error })
    )
    assert.equal(observed.raised, true)
    assert.ok(observed.error instanceof AggregateError)
    assert.ok(Object.hasOwn(observed.error, "cause"))
    assert.equal(observed.error.cause, original)
    assert.deepEqual(observed.error.errors, [original, original])
    assert.equal(driver.stats.accepted, 0)
    assert.equal(registry.pendingCleanup, 1)
    assert.equal(driver.resources.sessions, 1)
    for (const retryFailure of [original, undefined]) {
      cleanupFailure = retryFailure
      const retry = await registry.retryCleanup().then(
        () => ({ raised: false }),
        (error) => ({ raised: true, error })
      )
      assert.equal(retry.raised, true)
      assert.ok(retry.error instanceof AggregateError)
      assert.deepEqual(retry.error.errors, [retryFailure])
      assert.equal(registry.pendingCleanup, 1)
      assert.equal(driver.resources.sessions, 1)
      assertions += 5
    }
    allowCleanup = true
    await registry.retryCleanup()
    assert.equal(registry.pendingCleanup, 0)
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assertions += 10
  }
  // A real Resume can fail in nested installation while outer cleanup and the
  // publication sink independently fail. Preserve their order and occurrences.
  for (const mode of ["before-install", "nested-output"]) {
    const registry = createServiceRegistry()
    const nestedError = new Error("nested installation sink")
    const cleanupError = new Error("cleanup acknowledgment")
    const sinkError = new Error("outer publication sink")
    const primary = mode === "before-install" ? undefined : nestedError
    let armed = false,
      nestedFailed = false,
      resumes = 0
    const machine = {
      initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 7 } }),
      view: (value) => value,
      resume(value) {
        resumes++
        return { $: "Types.AwaitService", request: { invocation: value.request.invocation, id: 8 } }
      },
      disposeInvocation() {},
      get retainedHandles() {
        return 0
      }
    }
    const driver = createFixtureDriver({
      owner: m,
      initialState: fresh(),
      scope,
      registry,
      machine,
      foreign: () => ({ value: "provider result" }),
      hooks: {
        beforeInstall({ generation }) {
          if (generation === 1) {
            armed = true
            if (mode === "before-install") throw primary
          }
        },
        afterAction({ command }) {
          if (armed && command.$ === "CleanupProvider") throw cleanupError
        },
        canonicalOutputs() {
          if (!armed) return
          if (mode === "nested-output" && !nestedFailed) {
            nestedFailed = true
            throw nestedError
          }
          armed = false
          throw sinkError
        }
      }
    })
    const invocation = driver.allocateInvocation()
    const session = { invocation, finish() {}, close() {}, revoke() {} }
    const observed = await driver.drive(session, { invocation: Number(BigInt(invocation)) }).then(
      () => ({ raised: false }),
      (error) => ({ raised: true, error })
    )
    assert.equal(observed.raised, true)
    assert.ok(observed.error instanceof AggregateError)
    assert.equal(observed.error.cause, primary)
    assert.deepEqual(observed.error.errors, [primary, cleanupError, sinkError])
    assert.equal(resumes, 1)
    assert.equal(driver.stats.providerStarts, 1)
    assert.equal(driver.stats.providerCleanups, 1)
    assert.equal(driver.stats.accepted, 0)
    assert.equal(m.find(Number(BigInt(invocation)), driver.state.children).value.phase.$, "ChildCancelled")
    assert.equal(registry.pendingCleanup, 0)
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assertions += 11
  }
  // A rejected Source interrupt retains exact custody/resources for retry.
  {
    let controlled = fresh(),
      savedWork
    const control = {
      readState: () => controlled,
      invoke: (method, args) => {
        const step = m[method](controlled, ...args)
        if (step.$ === "Advanced") controlled = step.state
        return step
      }
    }
    const registry = createServiceRegistry(),
      machine = {
        initial: () => ({
          $: "SourcePreparationStopped",
          completed: false,
          reason: { $: "TechnicalFailure", token: 1 }
        }),
        view: (value) => value,
        disposeInvocation() {},
        get retainedHandles() {
          return 0
        }
      }
    const driver = createFixtureDriver({
      owner: m,
      control,
      registry,
      machine,
      hooks: {
        beforeTerminal: () => {
          savedWork = controlled.canonical.work
          const changed = list(savedWork).map((work) =>
            work.operation === 1 ? { ...work, kind: c("Preparing") } : work
          )
          controlled = {
            ...controlled,
            canonical: {
              ...controlled.canonical,
              work: changed.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
            }
          }
        }
      },
      foreign: () => {
        throw new Error("unexpected Source provider")
      }
    })
    const invocation = driver.allocateSourceInvocation(sourceScope)
    const session = { invocation, finish() {}, close() {}, revoke() {} }
    await assert.rejects(driver.drive(session, { invocation: Number(BigInt(invocation)) }), (error) => {
      assert.ok(error instanceof AggregateError)
      assert.match(error.cause.message, /Canonical resolver refused: CanonicalRejected/)
      assert.ok(error.errors.includes(error.cause))
      return true
    })
    assert.equal(registry.size, 0)
    assert.equal(registry.pendingCleanup, 1)
    assert.equal(driver.resources.sessions, 1)
    assert.equal(driver.resources.payloads, 0)
    assert.equal(m.find(1, controlled.children).value.phase.$, "ChildInstalling")
    await assert.rejects(registry.retryCleanup(), /cleanup obligations remain pending/)
    assert.equal(registry.pendingCleanup, 1)
    controlled = { ...controlled, canonical: { ...controlled.canonical, work: savedWork } }
    await registry.retryCleanup()
    assert.equal(registry.pendingCleanup, 0)
    assert.equal(m.find(1, controlled.children).value.phase.$, "ChildCancelled")
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assertions += 8
  }
  // Compare full publications, including refused prefixes, to the original
  // public host's event sequence. These are private non-reentrant entries.
  const unopened = m.initial_limits(1, 100, 1, 100)
  const opened = advanced(m.canonical_event(unopened, c("OpenRound", { partition: 1, lifetime: 1 })))
  for (const state of [unopened, opened, fresh()])
    for (const partition of [0, 1, 2])
      for (const round of [0, 1, 2])
        for (const bytes of [0, 100, 101]) {
          const admitted = m.canonical_event(state, c("AdmitObservation", { partition, lifetime: 1, round }))
          const expected = [admitted]
          if (admitted.$ === "Advanced") {
            const observation = list(admitted.outputs).find(
              (output) =>
                output.$ === "../Canonical.EventEstablished" && output.event.$ === "../Canonical.ObservationAdmitted"
            ).event.id
            const started = m.canonical_event(
              admitted.state,
              c("StartObservation", { partition, lifetime: 1, round, observation })
            )
            expected.push(started)
            if (started.$ === "Advanced")
              expected.push(
                m.canonical_event(
                  started.state,
                  c("BeginObservedPreparation", { partition, lifetime: 1, round, observation, bytes })
                )
              )
          }
          assert.deepEqual(list(m.begin_public_preparation(state, partition, 1, round, bytes)), expected)
          assertions++
        }
  for (const state of [unopened, opened, fresh()])
    for (const operation of [0, 1, 2, 3])
      for (const observation of [0, 1, 2]) {
        const prepared = m.canonical_event(
          state,
          c("PreparationCompleted", { partition: 1, lifetime: 1, round: 1, operation, unit_bytes: { $: "Nil" } })
        )
        const expected = [prepared]
        if (prepared.$ === "Advanced")
          expected.push(
            m.canonical_event(
              prepared.state,
              c("CompleteObservation", { partition: 1, lifetime: 1, round: 1, observation })
            )
          )
        assert.deepEqual(list(m.complete_public_preparation(state, 1, 1, 1, operation, observation)), expected)
        assertions++
      }
  console.log(
    JSON.stringify({
      passed: true,
      assertions,
      scope:
        "actual Canonical admission/work invalidation plus source-free child generations, unique terminal and separate late-provider cleanup; opaque controlled handles only; actual split-child resident consumer, provisional rejected-handle disposal, retention/revision and universal proofs remain open"
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
