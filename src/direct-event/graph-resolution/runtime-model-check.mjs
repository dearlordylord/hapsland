import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { GRAPH_LIMIT_CEILINGS } from "../../../packages/canonical-policy/dist/canonical/graph-limits.js"
const folder = import.meta.dirname,
  temporary = mkdtempSync("/tmp/hapsland-runtime-model-")
const wrapper = join(folder, ".runtime-model-check-" + temporary.split("/").at(-1) + ".bend")
const label = (value) => value.$.split(".").at(-1)
const list = (items) => items.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
const unlist = (value) => {
  const out = []
  while (value.$ === "Con") {
    out.push(value.head)
    value = value.tail
  }
  assert.equal(value.$, "Nil")
  return out
}
const t = (name, fields = {}) => ({ $: "Types." + name, ...fields })
const e = (name, fields = {}) => ({ $: "Environment." + name, ...fields })
const o = (name, fields = {}) => ({ $: "WholeObservation." + name, ...fields })
try {
  const source = `import Base
import ./RuntimeModel.bend as R
import ./RuntimeInvariant.bend as Invariant
import ./RuntimeSpecification.bend as Specification
import ./Types.bend as T
import ./Environment.bend as E
import ./WholeObservation.bend as O
def suspend(operation: T.Operation, world: Nat) -> R.ProviderResponse<Nat>:
  R.ProviderSuspended{(world + 1n : Nat), []}
def observe(exception: T.ExceptionToken, world: Nat) -> O.Error:
  match exception:
    case T.ExceptionToken{_, id}: O.Error{Some{id}, O.Text{[]}, O.Text{[]}, None{}, None{}}
def reject(operation: T.Operation, world: Nat) -> R.ProviderResponse<Nat>:
  R.ProviderReturned{world, T.ProviderRejected{T.ExceptionToken{7n, 99n}}, []}
def initial(input: T.ResolverInput, world: Nat) -> R.State<Nat>:
  R.initial(Nat, input, world)
def advance(state: R.State<Nat>) -> R.State<Nat>:
  R.advance(Nat, state, suspend, observe)
def immediate_error(state: R.State<Nat>) -> R.State<Nat>:
  R.advance(Nat, state, reject, observe)
def cancel(state: R.State<Nat>, invocation: Nat) -> R.State<Nat>:
  R.cancel(Nat, state, invocation)
def complete(state: R.State<Nat>, completion: E.Completion<Nat>) -> R.State<Nat>:
  R.complete(Nat, state, completion, observe)
def valid_state(state: R.State<Nat>) -> Bool:
  Invariant.valid(Nat, state)
def frozen_state(state: R.State<Nat>) -> Bool:
  Invariant.frozen(Nat, state)
def state_invocation(state: R.State<Nat>) -> Nat:
  Invariant.invocation(Nat, state)
def specification_initial(input: T.ResolverInput, world: Nat) -> R.State<Nat>:
  Specification.initial(Nat, input, world)
def specification_advance(state: R.State<Nat>) -> R.State<Nat>:
  Specification.advance(Nat, state, suspend, observe)
def specification_immediate_error(state: R.State<Nat>) -> R.State<Nat>:
  Specification.advance(Nat, state, reject, observe)
def specification_cancel(state: R.State<Nat>, invocation: Nat) -> R.State<Nat>:
  Specification.cancel(Nat, state, invocation)
def specification_complete(state: R.State<Nat>, completion: E.Completion<Nat>) -> R.State<Nat>:
  Specification.completion(Nat, state, completion, observe)
def main() -> Unit:
  Unit{}
`
  const functionBlock = /^def ([a-z_]+)\([^]*?(?=^def |$(?![^]))/gm
  const modelSource = source
    .replace("import ./RuntimeSpecification.bend as Specification\n", "")
    .replace(functionBlock, (block, name) => (name.startsWith("specification_") ? "" : block))
  const specificationSource = source
    .replace("import ./RuntimeInvariant.bend as Invariant\n", "")
    .replace(functionBlock, (block, name) =>
      [
        "initial",
        "advance",
        "immediate_error",
        "cancel",
        "complete",
        "valid_state",
        "frozen_state",
        "state_invocation"
      ].includes(name)
        ? ""
        : block
    )
    .replaceAll("def specification_", "def ")
  const compile = async (name, text) => {
    writeFileSync(wrapper, text)
    const output = join(temporary, name + ".mjs")
    execFileSync("timeout", ["--signal=KILL", "5s", "taskset", "-c", "8", "bend", wrapper, "-o", output], {
      timeout: 10000
    })
    return (await import(pathToFileURL(output))).default
  }
  const compiled = await compile("model", modelSource)
  const specified = await compile("specification", specificationSource)
  let schedulerComparisons = 0
  const program = Object.fromEntries(
    ["initial", "advance", "immediate_error", "cancel", "complete"].map((name) => [
      name,
      (...args) => {
        const actual = compiled[name](...args),
          expected = specified[name](...args)
        assert.deepEqual(actual, expected, `independent scheduler table: ${name}`)
        schedulerComparisons++
        return actual
      }
    ])
  )
  const limits = {
    $: "../../../../agent-flow-bend/ImportGraph.Limits",
    version: 1n,
    ...Object.fromEntries(
      Object.entries(GRAPH_LIMIT_CEILINGS).map(([key, value]) => [
        {
          sourceBytes: "source_bytes",
          treeBytes: "tree_bytes",
          readBytes: "read_bytes",
          outgoingEdges: "outgoing_edges"
        }[key] ?? key,
        BigInt(value)
      ])
    )
  }
  const input = t("ResolverInput", {
    invocation: 7n,
    root_path: "root.ts",
    root_capture: t("CaptureToken", { invocation: 7n, id: 1n }),
    root_bytes: 24n,
    root_name: "Root",
    root_source: "export interface Root {}",
    branch: t("TypeBranch"),
    caller_cache: { $: "None" },
    limits
  })
  const initial = program.initial(input, 10n),
    waiting = program.advance(initial)
  assert.equal(label(waiting.execution), "RuntimeWaiting")
  assert.equal(label(waiting.registry), "RuntimeOpen")
  assert.equal(waiting.provider.value.lease.invocation, 7n)
  assert.equal(waiting.provider.value.lease.id, 1n)
  assert.equal(waiting.next_lease, 2n)
  assert.deepEqual(program.advance(waiting), waiting, "waiting does not invoke provider twice")
  assert.deepEqual(program.cancel(waiting, 8n), waiting, "foreign cancellation is identity")
  const providerEffect = o("ProviderEffect", {
    value: o("StringValue", { text: o("Text", { units: list([99, 108, 101, 97, 110]) }) })
  })
  const completion = (
    lease,
    world = 99n,
    outcome = t("ClockStarted", { clock: t("ClockToken", { invocation: 7n, id: 55n }) })
  ) => e("Completion", { lease, world, outcome, effects: list([providerEffect]) })
  const lease = waiting.provider.value.lease
  assert.deepEqual(
    program.complete(waiting, completion({ ...lease, invocation: 8n })),
    waiting,
    "foreign invocation completion is identity"
  )
  assert.deepEqual(
    program.complete(waiting, completion({ ...lease, id: 2n })),
    waiting,
    "foreign lease completion is identity"
  )
  const cancelled = program.cancel(waiting, 7n)
  assert.equal(label(cancelled.registry), "RuntimeClosed")
  assert.equal(label(cancelled.execution), "RuntimeCancelled")
  assert.deepEqual(cancelled.provider, waiting.provider, "cancellation retains outstanding actual provider lease")
  assert.equal(cancelled.world.world, waiting.world.world)
  assert.deepEqual(program.advance(cancelled), cancelled, "cancelled never issues next request")
  const cleaned = program.complete(cancelled, completion(lease))
  assert.deepEqual(cleaned.execution, cancelled.execution, "late provider cannot resume the machine")
  assert.equal(label(cleaned.provider), "None")
  assert.equal(cleaned.world.world, 99n)
  assert.equal(
    label(unlist(cleaned.world.effects).at(-1)),
    "ProviderEffect",
    "late arbitrary provider effect is retained"
  )
  assert.deepEqual(
    program.complete(cleaned, completion(lease, 100n)),
    cleaned,
    "duplicate completion cannot replace world or retire twice"
  )
  assert.deepEqual(program.cancel(cleaned, 7n), cleaned, "registry closes once")
  assert.equal(unlist(cleaned.actions).filter((action) => label(action) === "ServiceResumed").length, 0)
  assert.equal(unlist(cleaned.actions).filter((action) => label(action) === "RegistryClosed").length, 1)
  assert.equal(unlist(cleaned.actions).filter((action) => label(action) === "ProviderRetired").length, 1)
  const active = program.complete(waiting, completion(lease))
  assert.equal(label(active.execution), "RuntimeReady")
  assert.equal(label(active.provider), "None")
  assert.equal(unlist(active.actions).filter((action) => label(action) === "ServiceResumed").length, 1)
  assert.deepEqual(unlist(active.world.effects).map(label), ["Invoked", "ProviderEffect", "Responded"])
  const second = program.advance(active)
  assert.equal(label(second.execution), "RuntimeWaiting")
  assert.equal(second.provider.value.lease.id, 2n)
  assert.equal(second.next_lease, 3n, "suspension consumes one fresh runtime lease")
  assert.deepEqual(
    program.complete(second, completion(lease)),
    second,
    "old completed lease cannot resume newer request"
  )
  const failure = completion(
    lease,
    100n,
    t("ProviderRejected", { exception: t("ExceptionToken", { invocation: 7n, id: 99n }) })
  )
  const failed = program.complete(waiting, failure)
  assert.equal(label(failed.execution), "RuntimeReturned")
  assert.equal(label(failed.registry), "RuntimeClosed")
  assert.equal(failed.execution.error.value.identity.value, 99n)
  assert.deepEqual(unlist(failed.actions).slice(-2).map(label), ["ExceptionObserved", "RegistryClosed"])
  assert.deepEqual(program.cancel(failed, 7n), failed, "cancel cannot erase already observed terminal error")
  const immediate = program.immediate_error(initial)
  assert.equal(label(immediate.execution), "RuntimeReturned")
  assert.equal(immediate.next_lease, 1n, "returned provider does not allocate suspension lease")
  assert.deepEqual(unlist(immediate.actions).slice(-2).map(label), ["ExceptionObserved", "RegistryClosed"])
  assert.deepEqual(program.cancel(immediate, 7n), immediate)
  // Enumerate short reachable prefixes and cancellation suffixes independently
  // of graph-query expectations. Provider worlds/effects remain unconstrained.
  const choices = (state) => {
    const pending =
      label(state.provider) === "Some" ? state.provider.value.lease : o("ProviderLease", { invocation: 7n, id: 1n })
    return [
      () => program.advance(state),
      () => program.cancel(state, 7n),
      () => program.cancel(state, 8n),
      () => program.complete(state, completion(pending)),
      () => program.complete(state, completion({ ...pending, invocation: 8n })),
      () =>
        program.complete(
          state,
          completion(
            pending,
            103n,
            t("ProviderRejected", { exception: t("ExceptionToken", { invocation: 7n, id: 99n }) })
          )
        )
    ].map((run) => run())
  }
  let prefixes = [initial],
    frontier = [initial]
  for (let depth = 0; depth < 2; depth++) {
    frontier = frontier.flatMap(choices)
    prefixes.push(...frontier)
  }
  const machine = (state) => ({
    invocation: state.invocation,
    registry: state.registry,
    execution: state.execution,
    next_lease: state.next_lease,
    actions: unlist(state.actions).filter((action) => label(action) !== "ProviderRetired")
  })
  let cancellationSuffixComparisons = 0,
    exactActionSuffixComparisons = 0,
    rawInvariantComparisons = 0
  // Test the proof-only predicates against independently enumerated raw phase
  // combinations. Invalid states are still compared by the exact scheduler;
  // only the valid-step preservation assertion has a validity premise.
  const executions = [initial.execution, waiting.execution, failed.execution, cancelled.execution]
  for (const registry of [initial.registry, cancelled.registry])
    for (const execution of executions)
      for (const provider of [initial.provider, waiting.provider])
        for (const world of [0n, 10n, 103n]) {
          const state = { ...waiting, registry, execution, provider, world: { ...waiting.world, world } }
          const phase = label(execution),
            open = label(registry) === "RuntimeOpen",
            pending = label(provider) === "Some"
          const valid = open
            ? (phase === "RuntimeReady" && !pending) || (phase === "RuntimeWaiting" && pending)
            : (phase === "RuntimeReturned" && !pending) || phase === "RuntimeCancelled"
          assert.equal(compiled.valid_state(state), valid, "exact reachable-phase predicate")
          for (const next of choices(state)) {
            assert.equal(compiled.state_invocation(next), state.invocation, "raw step preserves invocation")
            if (valid) assert.equal(compiled.valid_state(next), true, "valid step preserves lifecycle shape")
            rawInvariantComparisons++
          }
          if (valid)
            assert.equal(
              compiled.frozen_state(program.cancel(state, state.invocation)),
              true,
              "matching cancellation freezes valid state"
            )
        }
  for (const prefix of prefixes) {
    assert.equal(compiled.valid_state(prefix), true, "initialized prefix is valid")
    assert.equal(compiled.state_invocation(prefix), input.invocation, "initialized prefix retains input invocation")
    const cancelled = program.cancel(prefix, 7n),
      expected = machine(cancelled)
    assert.equal(compiled.frozen_state(cancelled), true, "initialized matching cancellation is frozen")
    const priorActions = unlist(cancelled.actions),
      pending = label(cancelled.provider) === "Some" ? cancelled.provider.value.lease : undefined
    let suffixes = [cancelled]
    for (let depth = 0; depth < 2; depth++) {
      suffixes = suffixes.flatMap(choices)
      for (const state of suffixes) {
        assert.deepEqual(machine(state), expected, "matching cancellation fences every tested later suffix")
        cancellationSuffixComparisons++
        const expectedActions =
          pending && label(state.provider) === "None"
            ? [...priorActions, { $: "RuntimeModel.ProviderRetired", lease: pending }]
            : priorActions
        assert.deepEqual(
          unlist(state.actions),
          expectedActions,
          "complete action history with exactly one pending lease retirement"
        )
        exactActionSuffixComparisons++
      }
    }
  }
  const record = {
    reachablePrefixes: prefixes.length,
    cancellationSuffixComparisons,
    exactActionSuffixComparisons,
    rawInvariantComparisons,
    schedulerComparisons,
    invariantHash: createHash("sha256")
      .update(
        readFileSync(
          join(folder, "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeInvariant.bend")
        )
      )
      .digest("hex"),
    specificationHash: createHash("sha256")
      .update(
        readFileSync(
          join(folder, "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeSpecification.bend")
        )
      )
      .digest("hex"),
    at: new Date().toISOString(),
    runtime: typeof Bun === "undefined" ? "node" : "bun",
    modelHash: createHash("sha256")
      .update(
        readFileSync(
          join(folder, "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeModel.bend")
        )
      )
      .digest("hex"),
    waitingInvocationDoesNotRepeat: true,
    foreignCancellationAndCompletionAreIdentity: true,
    cancelledLeaseRetained: true,
    lateProviderWorldAndEffectsRetained: true,
    lateReplyCannotResume: true,
    duplicateCompletionIsIdentity: true,
    freshLeaseOnNextSuspension: true,
    oldLeaseCannotResumeNewRequest: true,
    activeReplyResumesOnce: true,
    orderedInvocationProviderResponseTrace: true,
    providerExceptionObservedBeforeClose: true,
    terminalErrorAtomicAgainstCancellation: true,
    immediateReturnDoesNotConsumeLease: true,
    scope:
      "Finite compiled instances of the fixed runtime shell around actual Machine.initial/resume; pure Nat world with stateful suspend/reject responses. Not universal proof, descriptor cleanup, frontend correctness, graph correspondence or performance qualification."
  }
  writeFileSync(
    join(folder, "runtime-model-" + record.runtime + "-evidence.json"),
    JSON.stringify(record, null, 2) + "\n"
  )
  console.log(JSON.stringify(record))
} finally {
  rmSync(wrapper, { force: true })
  rmSync(temporary, { recursive: true, force: true })
}
