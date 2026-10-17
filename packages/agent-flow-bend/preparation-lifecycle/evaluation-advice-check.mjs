import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const o = ($, fields = {}) => ({ $: "CanonicalResolverOwner." + $, ...fields })
const c = ($, fields = {}) => ({ $: "../Canonical." + $, ...fields })
const none = { $: "None" }
const some = (value) => ({ $: "Some", value })
const list = (items) => items.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-evaluation-advice-"))
try {
  const compile = (name) => {
    const output = join(temporary, name + ".mjs")
    execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, name + ".bend"), "-o", output], {
      timeout: 10000
    })
    return output
  }
  const output = compile("EvaluationAdviceSpecification")
  const m = (await import(pathToFileURL(output))).default
  const actual = Object.fromEntries(
    Object.entries(m)
      .filter(([key]) => key.startsWith("CanonicalResolverOwner."))
      .map(([key, value]) => [key.slice("CanonicalResolverOwner.".length), value])
  )
  // Only shared first-match lookup, mechanical replacement and cross-family
  // invalidation may be reused. No production permit/claim/birth selectors.
  const spec = readFileSync(join(import.meta.dirname, "EvaluationAdviceSpecification.bend"), "utf8").replace(
    /#[^\n]*/gu,
    ""
  )
  const common = new Set(["find", "updated", "reconcile_cancel"])
  for (const match of spec.matchAll(/\bO\.([a-z_][A-Za-z0-9_]*)/gu))
    assert.ok(common.has(match[1]), "Independent Evaluation transfer must define its own decision: " + match[1])
  const context = o("EvaluationContext", { partition: 1, lifetime: 2, round: 3, operation: 4 })
  const parent = o("Parent", { invocation: 5, generation: 6, request: 7 })
  const base = actual.initial_limits(100, 10000, 100, 10000)
  const work = (kind = c("PendingFinding", { count: 2 })) =>
    c("Work", { ...context, $: "../Canonical.Work", charge: 1, kind, parent: 0 })
  const child = (permission = o("EvaluationSettled"), cleanup = false) =>
    o("Child", {
      scope: cleanup
        ? o("EvaluationCleanupScope", { operation: 5, origin: 1, context, permission })
        : o("EvaluationScope", { operation: 5, context, permission }),
      invocation: 5,
      generation: 6,
      handle: 70,
      phase: o("ChildAwaiting"),
      request: some(7),
      lease: some(o("Lease", { id: 8, request: 7 })),
      parent: none
    })
  const tail = (fields = {}) =>
    o("Child", {
      scope: o("AdviceTailScope", {
        partition: 1,
        lifetime: 2,
        round: 3,
        operation: 4,
        origin: 5,
        permission: o("TailNew"),
        ...fields
      }),
      invocation: 9,
      generation: 0,
      handle: 0,
      phase: o("ChildInstalling"),
      request: none,
      lease: none,
      parent: none
    })
  const state = (head = child(), works = [work()], tails = [], next_invocation = 9) => ({
    ...base,
    next_invocation,
    next_lease: 10,
    canonical: { ...base.canonical, work: list(works) },
    children: list([head, ...tails])
  })
  let comparisons = 0,
    cancellationComparisons = 0
  const equal = (value, args = [5, 6, 8, 7, 4, 80]) => {
    const expected = m.handoff_evaluation(value, ...args)
    assert.deepEqual(actual.handoff_advice(value, ...args), expected, "exact Evaluation handoff state/actions/refusal")
    comparisons++
    return expected
  }
  const permissions = [
    o("EvaluationUnissued"),
    o("EvaluationIssued", { request: 12 }),
    o("EvaluationAtProvider", { request: 12, parent }),
    o("EvaluationSettled")
  ]
  const phases = [
    "ChildInstalling",
    "ChildReady",
    "ChildAwaiting",
    "ChildResuming",
    "ChildAccepted",
    "ChildCancelled"
  ].map(($) => o($))
  const workVariants = [
    [],
    ...["AwaitingSourceRead", "SourceReading", "Preparing", "Reviewing", "AtJev"].map(($) => [work(c($))]),
    [work()]
  ]
  const priorClaims = [
    [],
    [tail()],
    ...["partition", "lifetime", "round", "operation"].map((field) => [tail({ [field]: 99 })]),
    [tail({ origin: 99, permission: o("TailRemove") })]
  ]
  for (const cleanup of [false, true])
    for (const permission of permissions)
      for (const phase of phases)
        for (const works of workVariants)
          for (const claims of priorClaims) {
            const selected = { ...child(permission, cleanup), phase }
            const candidate = state(selected, works, claims)
            equal(candidate)
            assert.deepEqual(
              actual.cancel(candidate, 5),
              m.cancel_evaluation(candidate, 5),
              "Evaluation cancellation composition"
            )
            cancellationComparisons++
          }
  for (const phase of phases) equal(state(child(), [work()], [{ ...tail(), phase }]))
  assert.deepEqual(actual.cancel(state(), 99), m.cancel_evaluation(state(), 99))
  const pristine = state()
  const born = equal(pristine)
  assert.equal(born.$, o("Advanced").$)
  assert.deepEqual(born.state.children.head, tail())
  assert.deepEqual(
    born.actions,
    list([o("LaunchAdviceTail", { invocation: 9, origin: 5, operation: 4, input_handle: 80 })])
  )
  equal(born.state)
  assert.equal(m.handoff_evaluation(born.state, 5, 6, 8, 7, 4, 81).refusal.$, o("WrongPhase").$)
  // First matching work wins, even if a later duplicate has PendingFinding.
  equal(state(child(), [work(c("Reviewing")), work()]))
  for (const field of ["partition", "lifetime", "round", "operation"])
    equal(state(child(), [{ ...work(), [field]: 99 }]))
  for (let at = 0; at < 5; at++) {
    const args = [5, 6, 8, 7, 4, 80]
    args[at]++
    equal(pristine, args)
  }
  for (const changed of [
    { request: none },
    { lease: none },
    { request: some(99) },
    { lease: some(o("Lease", { id: 99, request: 7 })) },
    { lease: some(o("Lease", { id: 8, request: 99 })) },
    { parent: some(parent) },
    { scope: o("EvaluationScope", { operation: 99, context, permission: o("EvaluationSettled") }) }
  ])
    equal(state({ ...child(), ...changed }))
  // Counter semantics, not a fabricated global uniqueness invariant.
  for (const next of [0, 5, 4294967297]) equal(state(child(), [work()], [], next))
  const cancelled = actual.cancel(born.state, 5)
  assert.deepEqual(cancelled, m.cancel_evaluation(born.state, 5))
  assert.equal(actual.find(5, cancelled.state.children).value.phase.$, o("ChildCancelled").$)
  assert.deepEqual(actual.find(9, cancelled.state.children).value, tail())
  assert.equal(actual.child_live(cancelled.state.canonical, cancelled.state.children, tail()), true)
  const cutoff = actual.reconcile_cancel(
    o("Advanced", { state: { ...born.state, canonical: base.canonical }, outputs: list([]), actions: list([]) })
  )
  assert.deepEqual(
    actual.find(9, cutoff.state.children).value,
    tail(),
    "transferred tail survives source/round work removal"
  )
  const mutantsOutput = compile("EvaluationAdviceMutants")
  const emitted = readFileSync(output, "utf8")
  const declaration = /^function \$CanonicalResolverOwner\$058advice_handoff_allowed\$\([^)]*\) \{[\s\S]*?^\}/gmu
  assert.equal([...emitted.matchAll(declaration)].length, 1)
  const mutatedOutput = join(temporary, "parent-linked.mjs")
  writeFileSync(
    mutatedOutput,
    `import typed from ${JSON.stringify(pathToFileURL(mutantsOutput).href)};\n` +
      emitted.replace(
        declaration,
        (body) => body.slice(0, body.indexOf("{") + 1) + "\nreturn typed.parent_linked_birth(...arguments);\n}"
      )
  )
  const mutant = (await import(pathToFileURL(mutatedOutput))).default
  const wrong = mutant["CanonicalResolverOwner.handoff_advice"](pristine, 5, 6, 8, 7, 4, 80)
  assert.equal(wrong.state.children.head.parent.$, "Some", "typed mutant must exercise actual public birth")
  assert.throws(() => assert.deepEqual(wrong, m.handoff_evaluation(pristine, 5, 6, 8, 7, 4, 80)), {
    code: "ERR_ASSERTION"
  })
  assert.equal(
    actual.child_live(wrong.state.canonical, wrong.state.children, wrong.state.children.head),
    true,
    "mutant's parent link must initially match the live parent"
  )
  const wrongCancelled = mutant["CanonicalResolverOwner.cancel"](wrong.state, 5)
  assert.equal(
    actual.find(9, wrongCancelled.state.children).value.phase.$,
    o("ChildCancelled").$,
    "parent-linked witness loses transferred work on Evaluation cancellation"
  )
  console.log(
    JSON.stringify({
      passed: true,
      cases: comparisons + cancellationComparisons,
      comparisons,
      cancellationComparisons,
      parentLinkedBirthRejected: true,
      scope:
        "finite exact Evaluation/cleanup handoff correspondence, same-operation PendingFinding and one claim, independent tail birth and cancellation composition; shared lookup/reconciliation, not universal proof or atomic native publication"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
