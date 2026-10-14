import * as Effect from "effect/Effect"
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
  const scope = { $: "Scope", partition: 1n, lifetime: 1n, round: 1n, preparation: 2n }
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
    let s = m.initial_limits(100n, 100000n, 100n, 100000n)
    for (const event of [
      c("OpenRound", { partition: 1n, lifetime: 1n }),
      c("AdmitObservation", { partition: 1n, lifetime: 1n, round: 1n }),
      c("StartObservation", { partition: 1n, lifetime: 1n, round: 1n, observation: 1n }),
      c("BeginObservedPreparation", { partition: 1n, lifetime: 1n, round: 1n, observation: 1n, bytes: 100n })
    ])
      s = advanced(m.canonical_event(s, event))
    assert.equal(m.live(s.canonical, scope), true)
    return s
  }
  let assertions = 0
  {
    const before = advanced(m.launch(fresh(), scope, 50n))
    const after = advanced(m.cancel(before, 1n))
    let reads = 0
    const child = before.children.head
    const observed = {
      ...child,
      get invocation() {
        reads++
        return child.invocation
      }
    }
    const children = { ...before.children, head: observed }
    const reader = m.active_reader(children)
    const constructionReads = reads
    assert.equal(reader.$, "ActiveReader")
    assert.equal(typeof reader.query, "function")
    assert.ok(constructionReads > 0)
    for (let repeat = 0; repeat < 16; repeat++) {
      assert.deepEqual(reader.query(1n), { $: "Some", value: true })
      assert.deepEqual(reader.query(0n), { $: "None" })
      assert.deepEqual(reader.query((1n << 48n) - 1n), { $: "None" })
      assertions += 3
    }
    assert.equal(reads, constructionReads)
    observed.phase = { $: "ChildCancelled" }
    assert.deepEqual(reader.query(1n), { $: "Some", value: true })
    assert.deepEqual(m.active_reader(children).query(1n), { $: "Some", value: false })
    assert.deepEqual(m.active_reader(after.children).query(1n), { $: "Some", value: false })
    const emittedSource = await readFile(emitted, "utf8")
    const factoryExport = emittedSource.split("\n").find((line) => line.startsWith('  "active_reader":'))
    assert.match(factoryExport, /, 1\),$/u)
    console.log(JSON.stringify({ reader: { constructionReads, repeatedCalls: 48, repeatedReads: 0, factoryArity: 1 } }))
    assertions += 8
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
          if (cancellation === "advance") driver.cancel(BigInt(invocation))
          return {
            ...held,
            step:
              held.step.remaining === 1
                ? { $: "Types.AwaitService", request: { invocation: BigInt(invocation), id: 7n } }
                : { $: "Continue", remaining: held.step.remaining - 1 }
          }
        }
      },
      foreignSync() {
        trace.push("effect")
        queueMicrotask(() => trace.push("microtask"))
        if (cancellation === "effect") driver.cancel(BigInt(invocation))
        return { value: { value: "reply" } }
      },
      foreign() {
        throw new Error("Unexpected async fallback")
      }
    })
    const invocation = driver.allocateInvocation()
    const session = { invocation, finish() {}, close() {}, revoke() {} }
    const outcome = await driver.drive(session, { invocation: BigInt(invocation) })
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
      initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 7n } }),
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
      initialState: m.initial_limits(100n, 100000n, 100n, 100000n),
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
        assert.equal(execution.ownerLease.request, 7n)
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
                        driver.cancel(BigInt(invocation))
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
        () => driver.drive(session, { invocation: BigInt(invocation) }),
        (error) => error === original
      )
    } else {
      const outcome = await driver.drive(session, { invocation: BigInt(invocation) })
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
      initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 7n } }),
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
      initialState: m.initial_limits(100n, 100000n, 100n, 100000n),
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
                driver.cancel(BigInt(invocation))
              }
              if (primitive < 2) {
                const index = primitive++
                return {
                  kind: "checkpointed",
                  perform() {
                    trace.push("effect " + index)
                    if (index === 0) {
                      queueMicrotask(() => trace.push("microtask"))
                      if (mode === "cancel-effect" || mode === "cancel-throw") driver.cancel(BigInt(invocation))
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
                  if (mode !== "pending") driver.cancel(BigInt(invocation))
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
        () => driver.drive(session, { invocation: BigInt(invocation) }),
        (error) => Object.is(error, original)
      )
    else {
      const result = await driver.drive(session, { invocation: BigInt(invocation) })
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
        initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 7n } }),
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
        initialState: m.initial_limits(100n, 100000n, 100n, 100000n),
        registry,
        machine,
        foreignSync() {
          const effect = Effect.sync(() => {
            starts++
            driver.cancel(BigInt(invocation))
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
      const result = await Effect.runPromise(driver.driveEffect(session, { invocation: BigInt(invocation) }))
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
      initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 7n } }),
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
          driver.cancel(BigInt(invocation))
          throw original
        }
        if (mode.startsWith("cancel")) driver.cancel(BigInt(invocation))
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
    const execution = driver.drive(session, { invocation: BigInt(invocation) })
    if (mode === "external-reject") {
      await started
      driver.cancel(BigInt(invocation))
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
    let settings = m.initial_limits(100n, 100000n, 100n, 100000n)
    const untouchedCanonical = settings.canonical
    let settingsOut = m[launchMethod](settings, 500n)
    assert.deepEqual(list(settingsOut.outputs), [])
    settings = advanced(settingsOut)
    assert.deepEqual(settings.canonical, untouchedCanonical)
    const settingsChild = m.find(1n, settings.children).value
    assert.deepEqual(settingsChild.scope, { $: scopeKind, operation: 1n })
    assert.equal(m.live(settings.canonical, settingsChild.scope), false)
    assert.equal(m.child_live(settings.canonical, settings.children, settingsChild), true)
    assert.equal(
      m.child_live(settings.canonical, settings.children, { ...settingsChild, scope: { $: scopeKind, operation: 2n } }),
      false
    )
    reject(m.launch(settings, settingsChild.scope, 501n), "NotPreparing")
    settings = advanced(m.install(settings, 1n, 0n, 511n, 0n))
    settings = advanced(m.provider_start(settings, 1n))
    assert.equal(m.provider_live(settings, 1n, 0n, 1n, 0n), true)
    for (const tuple of [
      [2n, 0n, 1n, 0n],
      [1n, 1n, 1n, 0n],
      [1n, 0n, 2n, 0n],
      [1n, 0n, 1n, 1n]
    ])
      assert.equal(m.provider_live(settings, ...tuple), false)
    const settingsNested = m.launch_nested(settings, { $: "Parent", invocation: 1n, generation: 0n, request: 0n }, 516n)
    reject(settingsNested, "WrongPhase")
    assert.deepEqual(settingsNested.state, settings)
    assert.deepEqual(
      list(settings.children).map((child) => child.invocation),
      [1n]
    )
    const cancelledSettings = advanced(m.cancel(settings, 1n))
    assert.equal(m.provider_live(cancelledSettings, 1n, 0n, 1n, 0n), false)
    const cancelledCompletion = m.provider_completed(cancelledSettings, 1n, 1n, 0n, 512n)
    assert.equal(
      list(cancelledCompletion.actions).some((action) => action.$ === "Resume" || action.$ === "AcceptResult"),
      false
    )
    settings = advanced(m.provider_completed(settings, 1n, 1n, 0n, 512n))
    settingsOut = m.terminal(settings, 1n, 1n, 513n)
    assert.deepEqual(list(settingsOut.actions), [
      { $: "AcceptResult", scope: settingsChild.scope, invocation: 1n, result_handle: 513n }
    ])
    settings = advanced(settingsOut)
    assert.equal(m.child_live(settings.canonical, settings.children, m.find(1n, settings.children).value), false)
    reject(m.terminal(settings, 1n, 1n, 513n), "WrongPhase")
    settings = advanced(m[launchMethod](settings, 514n))
    assert.deepEqual(m.find(2n, settings.children).value.scope, { $: scopeKind, operation: 2n })
    assert.deepEqual(settings.canonical, untouchedCanonical)
    reject(m[launchMethod]({ ...settings, next_invocation: 0n }, 515n), "NotPreparing")
    reject(m[launchMethod]({ ...settings, next_invocation: 1n }, 515n), "NotPreparing")
    assert.equal(
      m.child_live(settings.canonical, settings.children, {
        ...m.find(2n, settings.children).value,
        scope: { $: scopeKind === "SettingsScope" ? "FreshnessScope" : "SettingsScope", operation: 2n }
      }),
      false
    )
    assertions += 24
  }
  // The real common executor launches freshness from an empty Canonical state.
  // Its named operation must not create preparation work or require host IDs.
  for (const cancelled of [false, true]) {
    const registry = createServiceRegistry()
    const initialState = m.initial_limits(100n, 100000n, 100n, 100000n)
    let closes = 0,
      resumed = 0
    const machine = {
      initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 1n } }),
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
        if (cancelled) driver.cancel(BigInt(invocation))
        return { value: { value: "fact" } }
      },
      foreign() {
        assert.fail("synchronous freshness engine must not use async fallback")
      }
    })
    const invocation = driver.allocateFreshnessInvocation()
    assert.equal(invocation, 1)
    assert.deepEqual(m.find(1n, driver.state.children).value.scope, { $: "FreshnessScope", operation: 1n })
    const session = {
      invocation,
      finish() {},
      revoke() {},
      close() {
        closes++
      }
    }
    const outcome = await driver.drive(session, { invocation: BigInt(invocation) })
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
    partition: 1n,
    lifetime: 1n,
    round: 1n,
    observation: 2n,
    permission: { $: "SourceNew" }
  }
  invalidSource = {
    ...invalidSource,
    children: {
      $: "Con",
      head: {
        $: "Child",
        scope: wrongScope,
        invocation: 1n,
        generation: 0n,
        handle: 0n,
        phase: { $: "ChildInstalling" },
        request: { $: "None" },
        lease: { $: "None" },
        parent: { $: "None" }
      },
      tail: { $: "Nil" }
    }
  }
  const refusedSource = m.terminal_source_failed(invalidSource, 1n, 0n, 600n)
  reject(refusedSource, "CanonicalRejected")
  assert.equal(refusedSource.refusal.reason.$, "../Canonical.WrongStage")
  assert.deepEqual(refusedSource.state, invalidSource)
  assertions++
  let source = fresh()
  const sourceScope = {
    $: "SourceScope",
    partition: 1n,
    lifetime: 1n,
    round: 1n,
    observation: 1n,
    permission: { $: "SourceNew" }
  }
  source = advanced(m.launch_source(source, sourceScope, 400n))
  reject(m.launch_source(source, sourceScope, 499n), "NotPreparing")
  reject(m.complete_source_observation(source, 1n, 0n, 1n, 0n), "WrongPhase")
  source = advanced(m.install_source(source, 1n, 0n, 401n, 0n, { $: "SourceCandidate" }))
  source = advanced(m.provider_start(source, 1n))
  const sourceParent = { $: "Parent", invocation: 1n, generation: 0n, request: 0n }
  source = advanced(
    m.launch_source_preparation(
      source,
      sourceParent,
      { $: "PreparationScope", partition: 1n, lifetime: 1n, round: 1n, preparation: 2n },
      402n
    )
  )
  assert.deepEqual(m.find(2n, source.children).value.parent.value, sourceParent)
  source = advanced(m.install(source, 2n, 0n, 403n, 0n))
  source = advanced(m.provider_start(source, 2n))
  source = advanced(m.launch_nested(source, { $: "Parent", invocation: 2n, generation: 0n, request: 0n }, 404n))
  assert.equal(m.find(3n, source.children).value.scope.$, "Scope")
  const sourceCancelled = advanced(m.cancel(source, 1n))
  for (const invocation of [1n, 2n, 3n])
    assert.equal(m.find(invocation, sourceCancelled.children).value.phase.$, "ChildCancelled")
  reject(m.launch_nested(source, { $: "Parent", invocation: 3n, generation: 0n, request: 0n }, 405n), "WrongPhase")
  source = advanced(m.terminal(source, 3n, 0n, 406n))
  source = advanced(m.provider_completed(source, 2n, 2n, 0n, 407n))
  source = advanced(m.terminal_preparation(source, 2n, 1n, 408n))
  assert.deepEqual(m.find(4n, source.children).value.parent.value, sourceParent)
  source = advanced(m.terminal(source, 4n, 0n, 409n))
  source = advanced(m.provider_completed(source, 1n, 1n, 0n, 410n))
  source = advanced(m.install_source(source, 1n, 1n, 411n, 1n, { $: "SourceActivity" }))
  source = advanced(m.provider_start(source, 1n))
  reject(m.complete_source_observation(source, 1n, 1n, 3n, 1n), "WrongPhase")
  source = advanced(m.provider_completed(source, 1n, 3n, 1n, 412n))
  source = advanced(m.install_source(source, 1n, 2n, 413n, 2n, { $: "SourceObservation" }))
  source = advanced(m.provider_start(source, 1n))
  const sourceOut = m.complete_source_observation(source, 1n, 2n, 4n, 2n)
  source = advanced(sourceOut)
  assert.equal(m.find(1n, source.children).value.scope.$, "AfterSourceScope")
  assert.equal(
    list(sourceOut.actions).some((action) => action.$ === "CancelChild" && action.invocation === 1n),
    false
  )
  reject(m.complete_source_observation(source, 1n, 2n, 4n, 2n), "WrongPhase")
  source = advanced(m.provider_completed(source, 1n, 4n, 2n, 414n))
  reject(m.install(source, 1n, 3n, 415n, 9n), "WrongGeneration")
  source = advanced(m.install_after_source(source, 1n, 3n, 415n, 3n, { $: "AfterBarrier" }))
  source = advanced(m.provider_start(source, 1n))
  source = advanced(m.provider_completed(source, 1n, 5n, 3n, 416n))
  reject(m.install(source, 1n, 4n, 418n, 3n), "WrongGeneration")
  assert.equal(m.source_claimed(sourceScope, source.children), true)
  source = advanced(m.terminal(source, 1n, 4n, 417n))
  assert.equal(m.find(1n, source.children).value.phase.$, "ChildAccepted")
  assertions += 12
  let s = fresh()
  reject(m.launch(s, { ...scope, preparation: 1n }, 50n), "NotPreparing")
  assertions++
  let out = m.launch(s, scope, 50n)
  assert.deepEqual(list(out.actions), [{ $: "Launch", invocation: 1n, input_handle: 50n }])
  s = advanced(out)
  s = advanced(m.install(s, 1n, 0n, 11n, 0n))
  out = m.provider_start(s, 1n)
  assert.deepEqual(list(out.actions), [
    { $: "ExecuteProvider", invocation: 1n, lease: 1n, request: 0n, state_handle: 11n }
  ])
  s = advanced(out)
  assertions += 2
  assert.equal(m.provider_live(s, 1n, 0n, 1n, 0n), true)
  for (const tuple of [
    [2n, 0n, 1n, 0n],
    [1n, 1n, 1n, 0n],
    [1n, 0n, 2n, 0n],
    [1n, 0n, 1n, 1n]
  ])
    assert.equal(m.provider_live(s, ...tuple), false)
  assert.equal(m.provider_live(advanced(m.cancel(s, 1n)), 1n, 0n, 1n, 0n), false)
  assertions += 6
  reject(m.provider_completed(s, 1n, 2n, 0n, 60n), "WrongLease")
  reject(m.provider_completed(s, 1n, 1n, 1n, 60n), "WrongLease")
  assertions += 2
  out = m.provider_completed(s, 1n, 1n, 0n, 60n)
  assert.deepEqual(
    list(out.actions).map((x) => x.$),
    ["Resume", "RetireHandle", "CleanupProvider"]
  )
  s = advanced(out)
  assertions++
  reject(m.provider_completed(s, 1n, 1n, 0n, 60n), "WrongLease")
  reject(m.install(s, 1n, 0n, 12n, 1n), "WrongGeneration")
  assertions += 2
  out = m.terminal(s, 1n, 1n, 70n)
  assert.deepEqual(list(out.actions), [{ $: "AcceptResult", scope, invocation: 1n, result_handle: 70n }])
  s = advanced(out)
  reject(m.terminal(s, 1n, 1n, 70n), "WrongPhase")
  reject(m.cancel(s, 1n), "WrongPhase")
  assertions += 3
  out = m.launch(s, scope, 51n)
  assert.equal(list(out.actions)[0].invocation, 2n)
  s = advanced(out)
  s = advanced(m.cancel(s, 2n))
  reject(m.install(s, 2n, 0n, 20n, 0n), "WrongGeneration")
  assertions += 2
  for (const invalidate of ["cancel", "round", "observation", "preparation"]) {
    let state = fresh()
    state = advanced(m.launch(state, scope, 50n))
    state = advanced(m.install(state, 1n, 0n, 11n, 0n))
    state = advanced(m.provider_start(state, 1n))
    let revoked
    if (invalidate === "cancel") revoked = m.cancel(state, 1n)
    else
      revoked = m.canonical_event(
        state,
        invalidate === "round"
          ? c("RetirePartition", { partition: 1n, lifetime: 1n, round: 1n })
          : invalidate === "observation"
            ? c("InterruptObservation", { partition: 1n, lifetime: 1n, round: 1n, observation: 1n })
            : c("InterruptPreparation", { partition: 1n, lifetime: 1n, round: 1n, operation: 2n })
      )
    assert.equal(revoked.$, "Advanced", invalidate + " " + JSON.stringify(revoked.refusal))
    assert.deepEqual(
      list(revoked.actions).map((x) => x.$),
      ["CancelChild", "RetireHandle"]
    )
    state = advanced(revoked)
    if (invalidate === "round")
      state = advanced(m.canonical_event(state, c("OpenRound", { partition: 1n, lifetime: 2n })))
    const late = m.provider_completed(state, 1n, 1n, 0n, 99n)
    assert.deepEqual(
      list(late.actions).map((x) => x.$),
      ["CleanupProvider"]
    )
    state = advanced(late)
    reject(m.provider_completed(state, 1n, 1n, 0n, 99n), "WrongLease")
    reject(m.terminal(state, 1n, 0n, 99n), "WrongPhase")
    assertions += 4
  }
  // Parent custody is tied to the exact outstanding generation/request.
  let nested = fresh()
  nested = advanced(m.launch(nested, scope, 100n))
  nested = advanced(m.install(nested, 1n, 0n, 101n, 7n))
  nested = advanced(m.provider_start(nested, 1n))
  const parent = { $: "Parent", invocation: 1n, generation: 0n, request: 7n }
  reject(m.launch_nested(nested, { ...parent, generation: 1n }, 200n), "WrongPhase")
  reject(m.launch_nested(nested, { ...parent, request: 8n }, 200n), "WrongPhase")
  assertions += 2
  out = m.launch_nested(nested, parent, 200n)
  assert.deepEqual(list(out.actions), [{ $: "Launch", invocation: 2n, input_handle: 200n }])
  nested = advanced(out)
  reject(m.launch_nested(nested, parent, 205n), "WrongPhase")
  assertions++
  assert.deepEqual(m.find(2n, nested.children).value.parent.value, parent)
  nested = advanced(m.install(nested, 2n, 0n, 201n, 0n))
  nested = advanced(m.provider_start(nested, 2n))
  assertions++
  reject(m.launch_nested(nested, { $: "Parent", invocation: 2n, generation: 0n, request: 0n }, 300n), "WrongPhase")
  assertions++
  out = m.cancel(nested, 1n)
  assert.deepEqual(
    list(out.actions)
      .filter((action) => action.$ === "CancelChild")
      .map((action) => action.invocation),
    [1n, 2n]
  )
  nested = advanced(out)
  assert.equal(m.find(1n, nested.children).value.phase.$, "ChildCancelled")
  assert.equal(m.find(2n, nested.children).value.phase.$, "ChildCancelled")
  assertions++
  out = m.provider_completed(nested, 2n, 2n, 0n, 202n)
  assert.deepEqual(
    list(out.actions).map((action) => action.$),
    ["CleanupProvider"]
  )
  nested = advanced(out)
  out = m.provider_completed(nested, 1n, 1n, 7n, 102n)
  assert.deepEqual(
    list(out.actions).map((action) => action.$),
    ["CleanupProvider"]
  )
  nested = advanced(out)
  assertions += 2
  reject(m.terminal(nested, 2n, 0n, 203n), "WrongPhase")
  reject(m.launch_nested(nested, parent, 204n), "WrongPhase")
  assertions += 2
  let successful = fresh()
  successful = advanced(m.launch(successful, scope, 100n))
  successful = advanced(m.install(successful, 1n, 0n, 101n, 7n))
  successful = advanced(m.provider_start(successful, 1n))
  successful = advanced(m.launch_nested(successful, parent, 200n))
  successful = advanced(m.terminal(successful, 2n, 0n, 201n))
  successful = advanced(m.provider_completed(successful, 1n, 1n, 7n, 102n))
  successful = advanced(m.install(successful, 1n, 1n, 103n, 8n))
  successful = advanced(m.provider_start(successful, 1n))
  reject(m.launch_nested(successful, parent, 202n), "WrongPhase")
  successful = advanced(m.launch_nested(successful, { ...parent, generation: 1n, request: 8n }, 203n))
  assertions += 2
  let premature = fresh()
  premature = advanced(m.launch(premature, scope, 100n))
  premature = advanced(m.install(premature, 1n, 0n, 101n, 7n))
  premature = advanced(m.provider_start(premature, 1n))
  premature = advanced(m.launch_nested(premature, parent, 200n))
  premature = advanced(m.install(premature, 2n, 0n, 201n, 0n))
  premature = advanced(m.provider_start(premature, 2n))
  out = m.provider_completed(premature, 1n, 1n, 7n, 102n)
  assert.equal(
    list(out.actions).some((action) => action.$ === "CancelChild" && action.invocation === 2n),
    true
  )
  premature = advanced(out)
  assertions++
  reject(m.terminal(premature, 2n, 0n, 203n), "WrongPhase")
  out = m.provider_completed(premature, 2n, 2n, 0n, 204n)
  assert.deepEqual(
    list(out.actions).map((action) => action.$),
    ["CleanupProvider"]
  )
  assertions += 2
  // Preparation acceptance produces a new retaining child; callers cannot launch it.
  let handoffState = fresh()
  handoffState = advanced(m.launch_preparation(handoffState, scope, 300n))
  reject(m.launch_preparation(handoffState, scope, 301n), "NotPreparing")
  assertions++
  reject(m.terminal(handoffState, 1n, 0n, 302n), "WrongPhase")
  assertions++
  reject(m.terminal_preparation(handoffState, 1n, 1n, 302n), "WrongPhase")
  assertions++
  out = m.terminal_preparation(handoffState, 1n, 0n, 302n)
  const handoffAction = list(out.actions)[0],
    retaining = { $: "RetainingScope", partition: 1n, lifetime: 1n, round: 1n, observation: 1n, origin: 1n }
  assert.deepEqual(handoffAction, {
    $: "LaunchPostPreparation",
    invocation: 2n,
    preparation_invocation: 1n,
    result_handle: 302n,
    scope: retaining
  })
  handoffState = advanced(out)
  assertions++
  assert.equal(m.find(1n, handoffState.children).value.phase.$, "ChildAccepted")
  assert.equal(m.find(2n, handoffState.children).value.parent.$, "None")
  assertions++
  reject(m.launch(handoffState, retaining, 303n), "NotPreparing")
  reject(m.launch_preparation(handoffState, retaining, 303n), "NotPreparing")
  assertions += 2
  reject(m.terminal_preparation(handoffState, 1n, 0n, 304n), "WrongPhase")
  reject(m.terminal_preparation(handoffState, 2n, 0n, 304n), "WrongPhase")
  assertions += 2
  out = m.canonical_event(
    handoffState,
    c("PreparationCompleted", { partition: 1n, lifetime: 1n, round: 1n, operation: 2n, unit_bytes: { $: "Nil" } })
  )
  handoffState = advanced(out)
  assert.equal(m.live(handoffState.canonical, retaining), true)
  assert.equal(m.find(2n, handoffState.children).value.phase.$, "ChildInstalling")
  assertions++
  handoffState = advanced(m.install(handoffState, 2n, 0n, 305n, 0n))
  handoffState = advanced(m.provider_start(handoffState, 2n))
  out = m.canonical_event(
    handoffState,
    c("InterruptObservation", { partition: 1n, lifetime: 1n, round: 1n, observation: 1n })
  )
  assert.ok(list(out.actions).some((action) => action.$ === "CancelChild" && action.invocation === 2n))
  handoffState = advanced(out)
  assertions++
  out = m.provider_completed(handoffState, 2n, 1n, 0n, 306n)
  assert.deepEqual(
    list(out.actions).map((action) => action.$),
    ["CleanupProvider"]
  )
  assertions++
  let beforeInstall = fresh()
  beforeInstall = advanced(m.launch_preparation(beforeInstall, scope, 400n))
  beforeInstall = advanced(m.terminal_preparation(beforeInstall, 1n, 0n, 401n))
  out = m.cancel(beforeInstall, 2n)
  assert.deepEqual(
    list(out.actions).map((action) => action.$),
    ["CancelChild"]
  )
  assertions++
  let cancelledPreparation = fresh()
  cancelledPreparation = advanced(m.launch_preparation(cancelledPreparation, scope, 600n))
  cancelledPreparation = advanced(m.cancel(cancelledPreparation, 1n))
  reject(m.launch_preparation(cancelledPreparation, scope, 601n), "NotPreparing")
  assertions++
  let failedPreparation = fresh()
  failedPreparation = advanced(m.launch_preparation(failedPreparation, scope, 500n))
  out = m.terminal_preparation_failed(failedPreparation, 1n, 0n, 501n)
  assert.deepEqual(
    list(out.actions).map((action) => action.$),
    ["AcceptResult"]
  )
  assertions++
  reject(m.terminal_preparation(fresh(), 99n, 0n, 600n), "UnknownInvocation")
  assertions++
  // Advice custody is born at PendingFinding and survives source/round cutoff.
  let adviceState = fresh()
  adviceState = advanced(m.launch_preparation(adviceState, scope, 700n))
  adviceState = advanced(m.terminal_preparation(adviceState, 1n, 0n, 701n))
  adviceState = advanced(
    m.canonical_event(
      adviceState,
      c("PreparationCompleted", {
        partition: 1n,
        lifetime: 1n,
        round: 1n,
        operation: 2n,
        unit_bytes: { $: "Con", head: 100n, tail: { $: "Nil" } }
      })
    )
  )
  adviceState = advanced(m.install(adviceState, 2n, 0n, 702n, 0n))
  adviceState = advanced(m.provider_start(adviceState, 2n))
  reject(m.handoff_advice(adviceState, 2n, 0n, 1n, 0n, 3n, 703n), "WrongPhase")
  assertions++
  adviceState = advanced(
    m.canonical_event(adviceState, c("StartReview", { partition: 1n, lifetime: 1n, round: 1n, operation: 3n }))
  )
  adviceState = advanced(
    m.canonical_event(
      adviceState,
      c("ReviewCompleted", { partition: 1n, lifetime: 1n, round: 1n, operation: 3n, outcome: c("Finding") })
    )
  )
  for (const tuple of [
    [2n, 1n, 1n, 0n],
    [2n, 0n, 2n, 0n],
    [2n, 0n, 1n, 1n]
  ]) {
    reject(m.handoff_advice(adviceState, ...tuple, 3n, 703n), "WrongLease")
    assertions++
  }
  out = m.handoff_advice(adviceState, 2n, 0n, 1n, 0n, 3n, 703n)
  assert.deepEqual(list(out.actions), [
    { $: "LaunchAdviceTail", invocation: 3n, origin: 2n, operation: 3n, input_handle: 703n }
  ])
  adviceState = advanced(out)
  assertions++
  reject(m.handoff_advice(adviceState, 2n, 0n, 1n, 0n, 3n, 704n), "WrongPhase")
  assertions++
  const tail = m.find(3n, adviceState.children).value
  assert.equal(tail.parent.$, "None")
  reject(m.launch(adviceState, tail.scope, 704n), "NotPreparing")
  reject(m.install(adviceState, 3n, 0n, 705n, 0n), "WrongGeneration")
  reject(m.install_advice(adviceState, 3n, 0n, 705n, 0n, { $: "TailPublish" }), "WrongGeneration")
  reject(m.terminal(adviceState, 3n, 0n, 706n), "WrongPhase")
  assertions += 5
  reject(m.terminal_advice_preserved(adviceState, 3n, 1n, 715n), "WrongPhase")
  reject(m.terminal_advice_preserved(adviceState, 2n, 0n, 715n), "WrongPhase")
  assertions += 2
  const preserved = m.terminal_advice_preserved(adviceState, 3n, 0n, 715n)
  assert.equal(preserved.$, "Advanced")
  assert.deepEqual(preserved.state.canonical, adviceState.canonical)
  assert.deepEqual(list(preserved.actions), [
    { $: "AcceptResult", scope: tail.scope, invocation: 3n, result_handle: 715n }
  ])
  assert.equal(m.find(3n, preserved.state.children).value.phase.$, "ChildAccepted")
  assertions++
  reject(m.terminal_advice_preserved(preserved.state, 3n, 0n, 716n), "WrongPhase")
  assertions++
  const cutoffPreserved = advanced(m.cancel(adviceState, 2n))
  assert.equal(m.terminal_advice_preserved(cutoffPreserved, 3n, 0n, 717n).$, "Advanced")
  assertions++
  adviceState = advanced(m.install_advice(adviceState, 3n, 0n, 705n, 0n, { $: "TailBarrier" }))
  adviceState = advanced(m.provider_start(adviceState, 3n))
  reject(m.terminal_advice_preserved(adviceState, 3n, 0n, 716n), "WrongPhase")
  assertions++
  adviceState = advanced(m.cancel(adviceState, 2n))
  assert.equal(m.find(3n, adviceState.children).value.phase.$, "ChildAwaiting")
  assert.equal(m.provider_live(adviceState, 3n, 0n, 2n, 0n), true)
  assert.equal(m.advice_provider_allowed(adviceState, 3n, 0n, 2n, 0n, { $: "TailPublish" }), false)
  assertions += 3
  adviceState = advanced(
    m.canonical_event(
      adviceState,
      c("InterruptObservation", { partition: 1n, lifetime: 1n, round: 1n, observation: 1n })
    )
  )
  assert.equal(m.provider_live(adviceState, 3n, 0n, 2n, 0n), true)
  assertions++
  adviceState = advanced(m.provider_completed(adviceState, 3n, 2n, 0n, 707n))
  adviceState = advanced(m.install_advice(adviceState, 3n, 1n, 708n, 1n, { $: "TailActive" }))
  adviceState = advanced(m.provider_start(adviceState, 3n))
  adviceState = advanced(m.provider_completed(adviceState, 3n, 3n, 1n, 709n))
  adviceState = advanced(m.install_advice(adviceState, 3n, 2n, 710n, 2n, { $: "TailPublish" }))
  adviceState = advanced(m.provider_start(adviceState, 3n))
  assert.equal(m.advice_provider_allowed(adviceState, 3n, 2n, 4n, 2n, { $: "TailPublish" }), true)
  assert.equal(m.advice_provider_allowed(adviceState, 3n, 2n, 4n, 2n, { $: "TailRemove" }), false)
  assertions += 2
  adviceState = advanced(m.cancel(adviceState, 3n))
  assert.equal(m.advice_provider_allowed(adviceState, 3n, 2n, 4n, 2n, { $: "TailPublish" }), false)
  assert.equal(m.advice_provider_allowed(adviceState, 3n, 2n, 4n, 2n, { $: "TailRemove" }), true)
  assertions += 2
  adviceState = advanced(m.provider_completed(adviceState, 3n, 4n, 2n, 711n))
  reject(m.install_advice(adviceState, 3n, 3n, 712n, 3n, { $: "TailPublish" }), "WrongGeneration")
  assertions++
  adviceState = advanced(m.install_advice(adviceState, 3n, 3n, 712n, 3n, { $: "TailRemove" }))
  adviceState = advanced(m.provider_start(adviceState, 3n))
  adviceState = advanced(m.provider_completed(adviceState, 3n, 5n, 3n, 713n))
  adviceState = advanced(m.terminal(adviceState, 3n, 4n, 714n))
  assert.equal(m.find(3n, adviceState.children).value.phase.$, "ChildAccepted")
  assert.equal(m.provider_live(adviceState, 3n, 4n, 5n, 3n), false)
  reject(m.advice_cleanup_only(adviceState, 3n), "WrongPhase")
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
      const receipt = await driver.drive(prepSession, { invocation: BigInt(invocation) })
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
          ? { $: "Types.AwaitService", request: { invocation: input.invocation, id: 0n } }
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
    const receipt = await driver.drive({ invocation, close() {}, revoke() {} }, { invocation: BigInt(invocation) })
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
        input: { invocation: 9999n },
        close() {
          refusedCloses++
        },
        revoke() {}
      }
      const forged = { handoff: 9999n, scope: { $: "AdviceTailScope", origin: 1n } }
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
      const token = { $: "Types.ExceptionToken", invocation: 0n, id: 1n }
      let closed = false,
        projections = 0
      const registry = createServiceRegistry()
      const machine = {
        initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 7n } }),
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
      token.invocation = BigInt(invocation)
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
      const observed = await driver.drive(session, { invocation: BigInt(invocation) }).then(
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
          request: { $: "Types.Request", invocation: input.invocation, id: 7n, operation: { $: "Types.StartClock" } }
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
      const observed = await driver.drive(session, { invocation: BigInt(invocation) }).then(
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
      initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 7n } }),
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
    await assert.rejects(driver.drive(session, { invocation: BigInt(invocation) }), (error) => {
      assert.equal(error.cause, primary)
      assert.ok(error.errors.includes(disposalFailure))
      assert.ok(error.errors.includes(sinkFailure))
      return true
    })
    assert.equal(m.find(BigInt(invocation), driver.state.children).value.phase.$, "ChildCancelled")
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
      initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 7n } }),
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
    const observed = driver.drive(session, { invocation: BigInt(invocation) }).then(
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
    const observed = await driver.drive(session, { invocation: BigInt(invocation) }).then(
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
      initial: (input) => ({ $: "Types.AwaitService", request: { invocation: input.invocation, id: 7n } }),
      view: (value) => value,
      resume(value) {
        resumes++
        return { $: "Types.AwaitService", request: { invocation: value.request.invocation, id: 8n } }
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
          if (generation === 1n) {
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
    const observed = await driver.drive(session, { invocation: BigInt(invocation) }).then(
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
    assert.equal(m.find(BigInt(invocation), driver.state.children).value.phase.$, "ChildCancelled")
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
          reason: { $: "TechnicalFailure", token: 1n }
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
            work.operation === 1n ? { ...work, kind: c("Preparing") } : work
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
    await assert.rejects(driver.drive(session, { invocation: BigInt(invocation) }), (error) => {
      assert.ok(error instanceof AggregateError)
      assert.match(error.cause.message, /Canonical resolver refused: CanonicalRejected/)
      assert.ok(error.errors.includes(error.cause))
      return true
    })
    assert.equal(registry.size, 0)
    assert.equal(registry.pendingCleanup, 1)
    assert.equal(driver.resources.sessions, 1)
    assert.equal(driver.resources.payloads, 0)
    assert.equal(m.find(1n, controlled.children).value.phase.$, "ChildInstalling")
    await assert.rejects(registry.retryCleanup(), /cleanup obligations remain pending/)
    assert.equal(registry.pendingCleanup, 1)
    controlled = { ...controlled, canonical: { ...controlled.canonical, work: savedWork } }
    await registry.retryCleanup()
    assert.equal(registry.pendingCleanup, 0)
    assert.equal(m.find(1n, controlled.children).value.phase.$, "ChildCancelled")
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assertions += 8
  }
  // Compare full publications, including refused prefixes, to the original
  // public host's event sequence. These are private non-reentrant entries.
  const unopened = m.initial_limits(1n, 100n, 1n, 100n)
  const opened = advanced(m.canonical_event(unopened, c("OpenRound", { partition: 1n, lifetime: 1n })))
  for (const state of [unopened, opened, fresh()])
    for (const partition of [0n, 1n, 2n])
      for (const round of [0n, 1n, 2n])
        for (const bytes of [0n, 100n, 101n]) {
          const admitted = m.canonical_event(state, c("AdmitObservation", { partition, lifetime: 1n, round }))
          const expected = [admitted]
          if (admitted.$ === "Advanced") {
            const observation = list(admitted.outputs).find(
              (output) =>
                output.$ === "../Canonical.EventEstablished" && output.event.$ === "../Canonical.ObservationAdmitted"
            ).event.id
            const started = m.canonical_event(
              admitted.state,
              c("StartObservation", { partition, lifetime: 1n, round, observation })
            )
            expected.push(started)
            if (started.$ === "Advanced")
              expected.push(
                m.canonical_event(
                  started.state,
                  c("BeginObservedPreparation", { partition, lifetime: 1n, round, observation, bytes })
                )
              )
          }
          assert.deepEqual(list(m.begin_public_preparation(state, partition, 1n, round, bytes)), expected)
          assertions++
        }
  for (const state of [unopened, opened, fresh()])
    for (const operation of [0n, 1n, 2n, 3n])
      for (const observation of [0n, 1n, 2n]) {
        const prepared = m.canonical_event(
          state,
          c("PreparationCompleted", { partition: 1n, lifetime: 1n, round: 1n, operation, unit_bytes: { $: "Nil" } })
        )
        const expected = [prepared]
        if (prepared.$ === "Advanced")
          expected.push(
            m.canonical_event(
              prepared.state,
              c("CompleteObservation", { partition: 1n, lifetime: 1n, round: 1n, observation })
            )
          )
        assert.deepEqual(list(m.complete_public_preparation(state, 1n, 1n, 1n, operation, observation)), expected)
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
