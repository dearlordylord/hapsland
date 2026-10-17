import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const o = ($, fields = {}) => ({ $: "CanonicalResolverOwner." + $, ...fields })
const c = ($, fields = {}) => ({ $: "../Canonical." + $, ...fields })
const d = ($, fields = {}) => ({ $: "../Dispatch." + $, ...fields })
const none = { $: "None" }
const some = (value) => ({ $: "Some", value })
const list = (items) => items.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-evaluation-owner-"))
try {
  const compile = (name) => {
    const output = join(temporary, name + ".mjs")
    execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, name + ".bend"), "-o", output], {
      timeout: 10000
    })
    return output
  }
  const output = compile("EvaluationOwnerSpecification")
  const model = (await import(pathToFileURL(output))).default
  const actual = Object.fromEntries(
    Object.entries(model)
      .filter(([key]) => key.startsWith("CanonicalResolverOwner."))
      .map(([key, value]) => [key.slice("CanonicalResolverOwner.".length), value])
  )
  const spec = readFileSync(join(import.meta.dirname, "EvaluationOwnerSpecification.bend"), "utf8").replace(
    /#[^\n]*/gu,
    ""
  )
  const common = new Set(["find", "replace", "updated", "parent_live", "invalidate"])
  for (const match of spec.matchAll(/\bO\.([a-z_][A-Za-z0-9_]*)/gu))
    assert.ok(common.has(match[1]), "Independent Evaluation owner must determine its own decision: " + match[1])
  // The shared invalidator is used only outside the three Evaluation scopes.
  assert.match(spec, /case _: O\.invalidate\(canonical\(state\), children\(state\), child\)/u)
  const counts = new Map()
  const equal = (method, state, ...args) => {
    const expected = model[method](state, ...args)
    assert.deepEqual(actual[method === "reconcile" ? "reconcile_cancel" : method](state, ...args), expected, method)
    counts.set(method, (counts.get(method) ?? 0) + 1)
    return expected
  }
  const context = o("EvaluationContext", { partition: 1, lifetime: 2, round: 3, operation: 4 })
  const parent = o("Parent", { invocation: 1, generation: 2, request: 3 })
  const selectedParent = o("Parent", { invocation: 5, generation: 6, request: 7 })
  const base = actual.initial_limits(100, 10000, 100, 10000)
  const permissions = [
    o("EvaluationUnissued"),
    o("EvaluationIssued", { request: 12 }),
    o("EvaluationAtProvider", { request: 12, parent: selectedParent }),
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
  const work = (kind) => c("Work", { partition: 1, lifetime: 2, round: 3, operation: 4, charge: 1, kind, parent: 0 })
  const request = (started, interrupted = false) =>
    d("Request", { partition: 1, lifetime: 2, round: 3, operation: 4, request: 12, started, interrupted })
  const round = c("Round", {
    partition: 1,
    lifetime: 2,
    id: 3,
    waiting: false,
    deciding: false,
    write: none,
    uncertain: false,
    quiet_since: none
  })
  const canonicalVariants = [
    base.canonical,
    ...["Reviewing", "AtJev", "PendingFinding"].flatMap(($) =>
      [[], [request(false)], [request(true)], [request(true, true)]].map((requests) => ({
        ...base.canonical,
        rounds: list([round]),
        work: list([work(c($, $ === "PendingFinding" ? { count: 2 } : {}))]),
        dispatch: { ...base.canonical.dispatch, requests: list(requests) }
      }))
    )
  ]
  const rootParent = o("Child", {
    scope: o("EvaluationScope", {
      operation: 1,
      context,
      permission: o("EvaluationAtProvider", { request: 12, parent })
    }),
    invocation: 1,
    generation: 2,
    handle: 20,
    phase: o("ChildAwaiting"),
    request: some(3),
    lease: some(o("Lease", { id: 4, request: 3 })),
    parent: none
  })
  const child = (family, permission, phase, pending, lease, ancestry) =>
    o("Child", {
      scope:
        family === "root"
          ? o("EvaluationScope", { operation: 5, context, permission })
          : family === "cleanup"
            ? o("EvaluationCleanupScope", { operation: 5, origin: 1, context, permission })
            : o("EvaluationDispatchScope", { operation: 5, context, request: 12 }),
      invocation: 5,
      generation: 6,
      handle: 70,
      phase,
      request: pending,
      lease,
      parent: ancestry
    })
  const state = (head, canon = base.canonical, extra = []) => ({
    ...base,
    canonical: canon,
    next_invocation: 9,
    next_lease: 10,
    children: list([head, rootParent, ...extra])
  })
  const facts = (value) =>
    o("EvaluationFacts", {
      root_valid: value,
      configuration_valid: value,
      credential_ready: value,
      selected: value,
      current_work: value,
      physical_available: value
    })
  const outcomes = [
    "NeverSent",
    "RequestFinding",
    "RequestClear",
    "RequestBackendFailure",
    "RequestTimeout",
    "RequestInterrupted"
  ].map(($) => c($))
  let states = 0,
    liveness = 0,
    invalidations = 0
  for (const family of ["root", "cleanup", "dispatch"])
    for (const permission of family === "dispatch" ? permissions.slice(0, 1) : permissions)
      for (const phase of phases)
        for (const canon of canonicalVariants)
          for (const binding of [
            [some(7), some(o("Lease", { id: 8, request: 7 })), family === "dispatch" ? some(parent) : none],
            [none, none, family === "dispatch" ? some(parent) : none],
            [some(99), some(o("Lease", { id: 8, request: 7 })), family === "dispatch" ? some(parent) : none],
            [some(7), some(o("Lease", { id: 8, request: 99 })), family === "dispatch" ? none : some(parent)]
          ]) {
            const head = child(family, permission, phase, ...binding)
            const candidate = state(head, canon)
            assert.deepEqual(actual.child_live(canon, candidate.children, head), model.live(candidate, head))
            liveness++
            assert.deepEqual(actual.invalidate(canon, candidate.children, head), model.invalidate(candidate, head))
            invalidations++
            equal("install", candidate, 5, 6, 80, 7)
            equal("provider_start", candidate, 5)
            equal("provider_live", candidate, 5, 6, 8, 7)
            equal("provider_completed", candidate, 5, 8, 7, 90)
            equal("cancel", candidate, 5)
            equal("terminal", candidate, 5, 6, 90)
            equal("complete_evaluation", candidate, 5, 6, 90)
            equal("evaluation_ready", candidate, 5, 6, 8, 7, facts(states % 2 === 0))
            for (const outcome of outcomes) equal("evaluation_settle", candidate, 5, 6, 8, 7, outcome, states % 2 === 0)
            equal("install_evaluation_provider", candidate, 5, 6, 80, 7)
            equal("launch_evaluation", candidate, context, 80)
            equal("launch_evaluation_dispatch", candidate, selectedParent, 80)
            equal("evaluation_start_request", candidate, 5, 6, 8, 7)
            equal("complete_evaluation_dispatch", candidate, 5, 6, 90, false)
            equal("complete_evaluation_dispatch", candidate, 5, 6, 90, true)
            equal("launch_evaluation_cleanup", candidate, 5, 80)
            equal("launch", candidate, head.scope, 80)
            equal("launch_nested", candidate, selectedParent, 80)
            equal("reconcile", o("Advanced", { state: candidate, outputs: list([]), actions: list([]) }))
            states++
          }
  // Unknown entries and each independently changed identity component.
  const valid = state(
    child("root", permissions[0], o("ChildAwaiting"), some(7), some(o("Lease", { id: 8, request: 7 })), none),
    canonicalVariants[1]
  )
  for (const args of [
    [99, 6, 8, 7],
    [5, 99, 8, 7],
    [5, 6, 99, 7],
    [5, 6, 8, 99]
  ]) {
    equal("evaluation_ready", valid, ...args, facts(true))
    equal("evaluation_settle", valid, ...args, outcomes[0], false)
    equal("evaluation_start_request", valid, ...args)
    equal("provider_live", valid, ...args)
  }
  for (const method of ["install", "install_evaluation_provider"]) equal(method, valid, 99, 6, 80, 7)
  for (const method of ["provider_start", "cancel"]) equal(method, valid, 99)
  equal("provider_completed", valid, 99, 8, 7, 90)
  for (const method of ["terminal", "complete_evaluation"]) equal(method, valid, 99, 6, 90)
  equal("complete_evaluation_dispatch", valid, 99, 6, 90, true)
  equal("launch_evaluation_cleanup", valid, 99, 80)
  equal("launch_evaluation_dispatch", valid, { ...selectedParent, invocation: 99 }, 80)
  equal("launch_nested", valid, { ...selectedParent, invocation: 99 }, 80)
  for (const field of ["partition", "lifetime", "round", "operation"])
    equal("launch_evaluation", base, { ...context, [field]: 99 }, 80)
  for (const next_invocation of [0, 5, 4294967297]) {
    equal("launch_evaluation", { ...valid, next_invocation }, context, 80)
    equal("launch_evaluation_cleanup", { ...valid, next_invocation }, 5, 80)
    equal("launch_evaluation_dispatch", { ...valid, next_invocation }, selectedParent, 80)
  }
  // Duplicate IDs are typed inputs, so liveness must use first-match semantics
  // even when invalidation visits a different child with that same ID.
  for (const family of ["root", "cleanup", "dispatch"])
    for (const phase of phases) {
      const duplicate = child(family, permissions[0], phase, none, none, family === "dispatch" ? some(parent) : none)
      const candidate = state(valid.children.head, canonicalVariants[6], [duplicate])
      assert.deepEqual(
        actual.child_live(candidate.canonical, candidate.children, duplicate),
        model.live(candidate, duplicate)
      )
      assert.deepEqual(
        actual.invalidate(candidate.canonical, candidate.children, duplicate),
        model.invalidate(candidate, duplicate)
      )
      equal("reconcile", o("Advanced", { state: candidate, outputs: list([]), actions: list([]) }))
    }
  // Public Canonical admission -> request -> callback -> result, on actual
  // canonical ledger entries rather than only synthetic State fixtures.
  let flow = actual.initial_limits(100, 10000, 100, 10000)
  const advance = (step) => {
    assert.equal(step.$, o("Advanced").$)
    return step.state
  }
  for (const event of [
    c("OpenRound", { partition: 1, lifetime: 1 }),
    c("AdmitObservation", { partition: 1, lifetime: 1, round: 1 }),
    c("StartObservation", { partition: 1, lifetime: 1, round: 1, observation: 1 }),
    c("BeginObservedPreparation", { partition: 1, lifetime: 1, round: 1, observation: 1, bytes: 100 }),
    c("PreparationCompleted", { partition: 1, lifetime: 1, round: 1, operation: 2, unit_bytes: list([100]) })
  ])
    flow = advance(actual.canonical_event(flow, event))
  const flowContext = o("EvaluationContext", { partition: 1, lifetime: 1, round: 1, operation: 3 })
  flow = advance(equal("launch_evaluation", flow, flowContext, 80))
  flow = advance(equal("install", flow, 1, 0, 81, 0))
  flow = advance(equal("provider_start", flow, 1))
  flow = advance(equal("evaluation_ready", flow, 1, 0, 1, 0, facts(true)))
  flow = advance(equal("provider_completed", flow, 1, 1, 0, 82))
  flow = advance(equal("install_evaluation_provider", flow, 1, 1, 83, 1))
  flow = advance(equal("provider_start", flow, 1))
  const callbackState = flow
  const flowParent = o("Parent", { invocation: 1, generation: 1, request: 1 })
  flow = advance(equal("launch_evaluation_dispatch", flow, flowParent, 90))
  flow = advance(equal("install", flow, 2, 0, 92, 0))
  flow = advance(equal("provider_start", flow, 2))
  flow = advance(equal("evaluation_start_request", flow, 2, 0, 3, 0))
  const startedFlow = flow
  flow = advance(equal("provider_completed", flow, 2, 3, 0, 94))
  flow = advance(equal("complete_evaluation_dispatch", flow, 2, 1, 95, true))
  flow = advance(equal("provider_completed", flow, 1, 2, 1, 96))
  flow = advance(equal("install", flow, 1, 2, 97, 2))
  flow = advance(equal("provider_start", flow, 1))
  flow = advance(equal("evaluation_settle", flow, 1, 2, 4, 2, c("RequestFinding"), true))
  flow = advance(equal("provider_completed", flow, 1, 4, 2, 98))
  flow = advance(equal("complete_evaluation", flow, 1, 3, 99))
  assert.equal(actual.find(1, flow.children).value.phase.$, o("ChildAccepted").$)
  // Independent cleanup enters only from the cancelled root and accounts for
  // the actual already-started request, without reporting a clear/finding.
  let cleanup = advance(equal("cancel", startedFlow, 1))
  cleanup = advance(equal("launch_evaluation_cleanup", cleanup, 1, 101))
  cleanup = advance(equal("install", cleanup, 3, 0, 102, 0))
  cleanup = advance(equal("provider_start", cleanup, 3))
  const cleanupLease = actual.find(3, cleanup.children).value.lease.value.id
  const cleanupState = cleanup
  for (const outcome of [c("RequestFinding"), c("RequestClear")])
    assert.equal(equal("evaluation_settle", cleanup, 3, 0, cleanupLease, 0, outcome, true).$, o("Rejected").$)
  assert.equal(
    equal("evaluation_settle", cleanup, 3, 0, cleanupLease, 0, c("RequestInterrupted"), true).$,
    o("Rejected").$
  )
  const jevRequest = actual.find(3, cleanup.children).value.scope.permission.request
  cleanup = advance(
    actual.canonical_event(
      cleanup,
      c("JevRequestInterrupted", { partition: 1, lifetime: 1, round: 1, operation: 3, request: jevRequest })
    )
  )
  cleanup = advance(equal("evaluation_settle", cleanup, 3, 0, cleanupLease, 0, c("RequestInterrupted"), true))
  cleanup = advance(equal("provider_completed", cleanup, 3, cleanupLease, 0, 103))
  cleanup = advance(equal("complete_evaluation", cleanup, 3, 1, 104))
  assert.equal(actual.find(3, cleanup.children).value.phase.$, o("ChildAccepted").$)
  const mutantsOutput = compile("EvaluationOwnerMutants")
  const emitted = readFileSync(output, "utf8")
  const rejectedMutants = []
  for (const [method, mutant, candidate, args] of [
    [
      "evaluation_dispatch_parent",
      "callback_parent_unfenced",
      {
        ...callbackState,
        children: list([
          {
            ...callbackState.children.head,
            scope: {
              ...callbackState.children.head.scope,
              permission: { ...callbackState.children.head.scope.permission, parent: { ...flowParent, request: 99 } }
            }
          }
        ])
      },
      [flowParent, 90]
    ],
    [
      "evaluation_cleanup_settle",
      "cleanup_can_settle_success",
      cleanupState,
      [3, 0, cleanupLease, 0, c("RequestFinding"), true]
    ]
  ]) {
    const declaration = new RegExp(
      "^function \\$CanonicalResolverOwner\\$058" + method + "\\$\\([^)]*\\) \\{[\\s\\S]*?^\\}",
      "gmu"
    )
    assert.equal([...emitted.matchAll(declaration)].length, 1)
    const mutatedOutput = join(temporary, mutant + ".mjs")
    writeFileSync(
      mutatedOutput,
      `import typed from ${JSON.stringify(pathToFileURL(mutantsOutput).href)};\n` +
        emitted.replace(
          declaration,
          (body) => body.slice(0, body.indexOf("{") + 1) + `\nreturn typed.${mutant}(...arguments);\n}`
        )
    )
    const mutated = (await import(pathToFileURL(mutatedOutput))).default
    const entry = method === "evaluation_dispatch_parent" ? "launch_evaluation_dispatch" : "evaluation_settle"
    const wrong = mutated["CanonicalResolverOwner." + entry](candidate, ...args)
    assert.equal(wrong.$, o("Advanced").$, mutant + " must actually cross the forbidden public boundary")
    assert.equal(model[entry](candidate, ...args).$, o("Rejected").$)
    assert.throws(() => assert.deepEqual(wrong, model[entry](candidate, ...args)), { code: "ERR_ASSERTION" })
    rejectedMutants.push(mutant)
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases: [...counts.values()].reduce((sum, count) => sum + count, 0),
      states,
      liveness,
      invalidations,
      counts: Object.fromEntries(counts),
      rejectedMutants,
      scope:
        "finite exact complete Evaluation/Dispatch/cleanup Owner lifecycle correspondence, actual Canonical positive flow, cleanup authority, generic provider/terminal/reconciliation; explicit common Canonical step/lookups/parent ancestry/non-Evaluation invalidation, not universal proof or native IO/drain"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
