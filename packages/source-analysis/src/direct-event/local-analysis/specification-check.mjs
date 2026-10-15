import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import {
  analyzeTypeFile,
  analyzeTypeOutcomes,
  analyzerMaterializationPreflight
} from "@hapsland/source-analysis/direct-event/analyzer"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"

const { languageForPath } = await import(
  new URL("./languages/registry.js", import.meta.resolve("@hapsland/source-analysis/direct-event/analyzer"))
)
const packagedCore = (
  await import(new URL("../../../dist/direct-event/local-analysis/analyzer-core.js", import.meta.url))
).default
const referenceNative = await import("@hapsland/source-analysis/testing/native-analyzer")
const nativeBinding = await import(new URL("../../../dist/direct-event/local-analysis/native.js", import.meta.url))
const some = (value) => ({ $: "Some", value })
const none = { $: "None" }
const named = (name, targetId) => ({
  $: "Model.Named",
  name,
  target_id: targetId === undefined ? none : some(targetId)
})
const unsupported = (name) => ({ $: "Model.Unsupported", name })
const declaration = (slot, name, references = [], identity = name) => ({
  $: "Model.Declaration",
  slot,
  identity,
  name,
  references: list(references)
})
const catalog = (declarations, supporting = []) => ({
  $: "Model.Catalog",
  declarations: list(declarations),
  supporting: list(supporting.map(([key, value]) => ({ $: "Model.Supporting", key, declaration: value })))
})
const coreTags = new Set([
  "Cursor",
  "Global",
  "Frame",
  "Trees",
  "Outcomes",
  "Preflight",
  "Continue",
  "Engine",
  "CursorNext",
  "RootNext",
  "NextRoot",
  "Completed",
  "PreflightCompleted",
  "Exhausted",
  "InvalidReply"
])
const jointTags = (value, imported) => {
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "$"
        ? imported && coreTags.has(item)
          ? `Core.${item}`
          : !imported
            ? item.replace(/^Core\./u, "")
            : item
        : jointTags(item, imported)
    ])
  )
}
const temporary = mkdtempSync(join(tmpdir(), "hapsland-local-analysis-spec-"))
try {
  const output = join(temporary, "specification.mjs")
  execFileSync(
    "timeout",
    ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "Specification.bend"), "-o", output],
    { timeout: 11000 }
  )
  const spec = (await import(pathToFileURL(output))).default
  const coreOutput = join(temporary, "core.mjs")
  execFileSync(
    "timeout",
    ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "Core.bend"), "-o", coreOutput],
    { timeout: 11000 }
  )
  const core = (await import(pathToFileURL(coreOutput))).default
  const executionOutput = join(temporary, "execution.mjs")
  execFileSync(
    "timeout",
    ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "Execution.bend"), "-o", executionOutput],
    { timeout: 11000 }
  )
  const execution = (await import(pathToFileURL(executionOutput))).default
  const stackOutput = join(temporary, "stack.mjs")
  execFileSync(
    "timeout",
    ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "Stack.bend"), "-o", stackOutput],
    { timeout: 11000 }
  )
  const stackModel = (await import(pathToFileURL(stackOutput))).default
  const rootOutput = join(temporary, "root.mjs")
  execFileSync(
    "timeout",
    ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "Root.bend"), "-o", rootOutput],
    { timeout: 11000 }
  )
  const rootContract = (await import(pathToFileURL(rootOutput))).default
  let rootContexts = 0
  const potentialOutput = join(temporary, "potential.mjs")
  execFileSync(
    "timeout",
    ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "Potential.bend"), "-o", potentialOutput],
    { timeout: 11000 }
  )
  const potential = (await import(pathToFileURL(potentialOutput))).default
  const continuationOutput = join(temporary, "continuation.mjs")
  execFileSync(
    "timeout",
    ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "Continuation.bend"), "-o", continuationOutput],
    { timeout: 11000 }
  )
  const continuation = (await import(pathToFileURL(continuationOutput))).default
  const jointOutput = join(temporary, "joint.mjs")
  execFileSync(
    "timeout",
    ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "Joint.bend"), "-o", jointOutput],
    { timeout: 11000 }
  )
  const joint = (await import(pathToFileURL(jointOutput))).default
  const referenceOutput = join(temporary, "joint-reference.mjs")
  execFileSync(
    "timeout",
    ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "JointReference.bend"), "-o", referenceOutput],
    { timeout: 11000 }
  )
  const referenceJoint = (await import(pathToFileURL(referenceOutput))).default
  const stepOutput = join(temporary, "joint-step.mjs")
  execFileSync(
    "timeout",
    ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "JointStep.bend"), "-o", stepOutput],
    { timeout: 11000 }
  )
  const jointStep = (await import(pathToFileURL(stepOutput))).default
  const expressionTags = (expression) => ({
    ...expression,
    $: `Specification.${expression.$.replace(/^Spec\./u, "")}`,
    ...(expression.left ? { left: expressionTags(expression.left), right: expressionTags(expression.right) } : {})
  })
  const measureOutput = join(temporary, "execution-measure.mjs")
  execFileSync(
    "timeout",
    ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "ExecutionMeasure.bend"), "-o", measureOutput],
    { timeout: 11000 }
  )
  const resource = (await import(pathToFileURL(measureOutput))).default
  let resourceTransitions = 0
  let resourceEntries = 0
  let rootTraceStates = 0
  let referenceTransitions = 0
  let specificationDepthBounds = 0
  let continuationStates = 0,
    childEntries = 0,
    childReturns = 0
  const weightedOutput = join(temporary, "weighted-inventory.mjs")
  execFileSync(
    "timeout",
    ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "WeightedInventory.bend"), "-o", weightedOutput],
    { timeout: 11000 }
  )
  const weighted = (await import(pathToFileURL(weightedOutput))).default
  let selectedDropCases = 0
  let potentialStates = 0
  const checkPotential = (cursor) => {
    assert.equal(
      potential.cursor_valid(cursor),
      true,
      "remaining semantic tasks cover actual pending/unvisited potential"
    )
    potentialStates++
  }
  let packagedModes = 0
  const runPackaged = (facts, purpose) => {
    let step = packagedCore.initial(facts, { $: purpose })
    const operations = []
    for (let tick = 0; tick < 100000; tick++) {
      if (step.$ === "Continue" || step.$ === "NextRoot") step = packagedCore.advance(step)
      else if (step.$ === "Engine") {
        assert.equal(purpose, "Preflight", "packaged analysis must issue no native commands")
        operations.push(step.operation)
        step = packagedCore.resume(step, { $: "Ack", request: step.request })
      } else {
        assert.equal(step.$, purpose === "Preflight" ? "PreflightCompleted" : "Completed")
        packagedModes++
        return { step, operations }
      }
    }
    throw new Error("packaged local analyzer fixture deadline exceeded")
  }
  const checkedCatalogs = new WeakSet()
  let lawCatalogs = 0
  const checkLawInstances = (facts) => {
    if (checkedCatalogs.has(facts)) return
    checkedCatalogs.add(facts)
    assert.equal(spec.complete(facts), true, "derived_budget_sufficient: recursive specification")
    for (const [purpose, mode] of [
      ["Core.Trees", "Model.Materialize"],
      ["Core.Outcomes", "Model.OutcomesOnly"]
    ]) {
      const result = execution.execute(facts, { $: purpose })
      assert.equal(execution.completed(result), true, "derived_budget_sufficient: cursor")
      const packaged = runPackaged(facts, purpose.replace("Core.", ""))
      assert.deepEqual(
        some(packaged.step.outcomes),
        execution.outcomes(result),
        "packaged private ABI preserves complete outcomes"
      )
      assert.deepEqual(
        execution.outcomes(result),
        spec.outcomes(facts, { $: mode }),
        purpose === "Core.Trees" ? "materialized_exact" : "outcomes_exact"
      )
    }
    const measured = execution.execute(facts, { $: "Core.Preflight" })
    assert.equal(execution.completed(measured), true, "derived_budget_sufficient: preflight")
    assert.deepEqual(
      some(list(runPackaged(facts, "Preflight").operations)),
      execution.trace(measured),
      "packaged private ABI preserves the exact native command stream"
    )
    assert.deepEqual(execution.trace(measured), spec.preflight_trace(facts), "preflight_trace_exact")
    const trace = spec.preflight_trace(facts)
    assert.equal(stackModel.trace_valid(trace), spec.complete(facts), "preflight_stack_effect")
    assert.equal(stackModel.trace_valid(trace), true, "preflight terminal stack depth")
    const ops = unlist(trace.value)
    for (const split of new Set([0, 1, Math.floor(ops.length / 2), ops.length]))
      for (const depth of [0, 1, 7]) {
        const prefix = stackModel.depth(list(ops.slice(0, split)), depth)
        const composed = prefix.$ === "None" ? none : stackModel.depth(list(ops.slice(split)), prefix.value)
        assert.deepEqual(stackModel.depth(trace.value, depth), composed, "append_exact")
      }
    lawCatalogs++
  }
  let cursorSteps = 0,
    refusedAcks = 0
  const runCore = (start, artifacts = [], measuring = false, initialRoot) => {
    let currentRoot,
      rootCatalog,
      expectedRoot,
      depths = [],
      rootOperationStart = 0
    const expressions = []
    const beginRoot = (root, facts, operationStart = 0) => {
      rootOperationStart = operationStart
      currentRoot = root
      rootCatalog = facts
      expectedRoot = spec.analyze(root, facts)
      assert.equal(expectedRoot.$, "NodeResult")
      depths = [continuation.root_reference_depth(root, facts)]
    }
    if (initialRoot) beginRoot(initialRoot.root, initialRoot.facts)
    const cursorOf = (value) =>
      value.$ === "Continue"
        ? value.cursor
        : value.$ === "Engine" && value.next.$ === "CursorNext"
          ? value.next.cursor
          : undefined
    const checkContinuation = (cursor) => {
      const frames = unlist(cursor.frames)
      assert.equal(frames.length, depths.length)
      assert.equal(frames.at(-1).site.$, "None", "root frame has no parent site")
      assert.equal(frames.at(-1).slot, currentRoot.slot)
      const jointFrames = list(frames.map((frame) => ({ ...frame, $: "Core.Frame" })))
      const ghosts = list(
        frames.map((frame, index) => ({
          $: "Ghost",
          depth: depths[index],
          prefix: list(unlist(frame.reversed).reverse()),
          subtotal: measuring ? expressions[expressions.length - 1 - index] : { $: "Spec.Literal", value: 0 }
        }))
      )
      assert.equal(joint.shape(jointFrames, ghosts, currentRoot.slot), true, "joint actual stack/ghost shape")
      assert.equal(
        joint.bounds_valid(jointFrames, ghosts, rootCatalog, cursor.expanded),
        true,
        "joint active/parked numeric bounds"
      )
      assert.equal(joint.shape(jointFrames, list([]), currentRoot.slot), false, "missing ghost must refuse")
      assert.equal(joint.shape(jointFrames, ghosts, currentRoot.slot + 10000), false, "wrong root slot must refuse")
      assert.equal(
        joint.shape(
          list(
            frames.map((frame, index) => ({
              ...frame,
              $: "Core.Frame",
              site: index === frames.length - 1 ? some("orphan-root") : frame.site
            }))
          ),
          ghosts,
          currentRoot.slot
        ),
        false,
        "orphan root site must refuse"
      )
      const traceGhosts = list(
        frames.map((frame, index) => ({
          $: "Joint.Ghost",
          depth: depths[index],
          prefix: list(unlist(frame.reversed).reverse()),
          subtotal: expressionTags(measuring ? expressions[expressions.length - 1 - index] : { $: "Literal", value: 0 })
        }))
      )
      assert.deepEqual(
        unlist(jointStep.cursor_postfix({ $: `Core.${cursor.global.purpose.$}` }, traceGhosts)),
        operations.slice(rootOperationStart),
        "root-local executed trace equals the complete ghost spine postfix"
      )
      rootTraceStates++
      let state = {
        $: "State",
        root_name: cursor.root_name,
        expanded: cursor.expanded,
        referenced: cursor.referenced,
        failure: cursor.failure
      }
      let result
      for (let index = 0; index < frames.length; index++) {
        const frame = frames[index]
        assert.ok(depths[index] > 0, "original Spec continuation depth must suffice")
        assert.ok(
          weighted.specification_required(frame.pending, rootCatalog, cursor.expanded) <= depths[index],
          "exact active and parked Spec depths cover the remaining weighted inventory"
        )
        specificationDepthBounds++
        if (index < frames.length - 1) assert.equal(frame.site.$, "Some", "child has an existing parent")
        let subtotal = measuring ? expressions[expressions.length - 1 - index] : { $: "Literal", value: 0 }
        const prefix = unlist(frame.reversed).reverse()
        if (result) {
          prefix.push({ $: "Model.Expanded", symbol: frames[index - 1].site.value, node: result.node })
          subtotal = { $: "Add", left: subtotal, right: result.bytes }
        }
        const remaining = spec.as_references(
          spec.interpret(
            depths[index],
            { $: "ReferencesRequest", references: frame.pending, state, subtotal },
            rootCatalog
          )
        )
        assert.equal(remaining.$, "ReferencesResult", "parked Spec continuation must complete")
        result = spec.node_result(continuation.completed_prefix(list(prefix), remaining), frame.slot)
        state = result.state
      }
      assert.deepEqual(state, expectedRoot.state, "every suspended continuation preserves final traversal state")
      if (cursor.global.purpose.$ === "Trees")
        assert.deepEqual(result.node, expectedRoot.node, "every suspended continuation preserves the full tree")
      if (measuring) {
        assert.equal(expressions.length, frames.length + 1, "one subtotal per frame and the outer fold")
        assert.deepEqual(
          result.bytes,
          expectedRoot.bytes,
          "every suspended continuation preserves exact IEEE expression grouping"
        )
      }
      continuationStates++
    }
    let step = start
    const operations = [],
      stack = [],
      measurements = []
    let request = 0
    for (let count = 0; count < 100000; count++) {
      cursorSteps++
      const resourceBefore = resource.measure(jointTags(step, true))
      const activeBefore = resource.active(jointTags(step, true))
      if (step.$ === "Continue") {
        checkPotential(step.cursor)
        checkContinuation(step.cursor)
      }
      if (step.$ === "Engine" && step.next.$ === "CursorNext") checkPotential(step.next.cursor)
      if (step.$ === "Continue" || step.$ === "NextRoot") {
        if (step.$ === "Continue" && step.cursor.global.purpose.$ !== "Trees")
          for (const frame of unlist(step.cursor.frames)) assert.deepEqual(frame.reversed, list([]))
        const previous = step
        if (previous.$ === "NextRoot") {
          const pending = unlist(previous.global.pending)
          if (pending.length) beginRoot(pending[0], previous.global.catalog, operations.length)
        }
        step = core.advance(previous)
        if (previous.$ === "NextRoot") {
          const pending = unlist(previous.global.pending)
          if (pending.length) {
            assert.ok(
              resource.measure(jointTags(step, true)) <= execution.root_weight(pending[0], previous.global.catalog) - 1,
              "actual root entry fits its existing derived budget"
            )
            resourceEntries++
          }
        }
        if (previous.$ === "Continue") {
          const oldFrames = unlist(previous.cursor.frames)
          const next = cursorOf(step)
          if (next) {
            const nextFrames = unlist(next.frames)
            if (unlist(oldFrames[0].pending).length) {
              const depth = depths[0]
              depths[0] = continuation.sibling_depth(depth)
              if (nextFrames.length > oldFrames.length) {
                const reference = unlist(oldFrames[0].pending)[0]
                assert.equal(reference.$, "Model.Named")
                const target = core.lookup(previous.cursor.global.catalog, reference.name, reference.target_id)
                assert.equal(target.$, "Some")
                const child = target.value
                const parent = { ...oldFrames[0], pending: list(unlist(oldFrames[0].pending).slice(1)) }
                assert.deepEqual(
                  next.frames,
                  list([
                    {
                      $: "Frame",
                      slot: child.slot,
                      pending: child.references,
                      reversed: list([]),
                      site: some(reference.name)
                    },
                    parent,
                    ...oldFrames.slice(1)
                  ]),
                  "child entry retains exact parked parent and ancestors"
                )
                assert.deepEqual(next.expanded, list([child.identity, ...unlist(previous.cursor.expanded)]))
                assert.equal(
                  next.remaining,
                  previous.cursor.remaining - 2,
                  "reference and declaration each spend one semantic tick"
                )
                assert.equal(next.failure.$, previous.cursor.failure.$)
                assert.deepEqual(
                  step,
                  core.enter_child(
                    previous.cursor.remaining - 1,
                    {
                      ...previous.cursor,
                      referenced: next.referenced,
                      remaining: previous.cursor.remaining - 1,
                      frames: list([parent, ...oldFrames.slice(1)])
                    },
                    child,
                    reference.name,
                    core.edge_operations(previous.cursor.global.purpose, reference.name, target)
                  ),
                  "actual child entry preserves exact Global/shared state and command queue"
                )
                assert.deepEqual(
                  jointTags(
                    joint.enter_cursor(
                      previous.cursor.remaining - 2,
                      jointTags(previous.cursor, true),
                      child,
                      reference.name,
                      reference.target_id
                    ),
                    false
                  ),
                  next,
                  "joint fresh cursor constructor equals the actual retained cursor"
                )
                const beforeGhosts = list(
                  oldFrames.map((frame, index) => ({
                    $: "Ghost",
                    depth: depths[index],
                    prefix: list(unlist(frame.reversed).reverse()),
                    subtotal: measuring ? expressions[expressions.length - 1 - index] : { $: "Spec.Literal", value: 0 }
                  }))
                )
                const afterGhosts = joint.enter_ghosts(depth - 2, beforeGhosts, child, reference.name)
                assert.equal(
                  joint.shape(
                    list(nextFrames.map((frame) => ({ ...frame, $: "Core.Frame" }))),
                    afterGhosts,
                    currentRoot.slot
                  ),
                  true
                )
                assert.equal(
                  joint.bounds_valid(
                    list(nextFrames.map((frame) => ({ ...frame, $: "Core.Frame" }))),
                    afterGhosts,
                    rootCatalog,
                    next.expanded
                  ),
                  true,
                  "fresh transition retains bounds for the child and every parked frame"
                )
                depths.unshift(continuation.child_reference_depth(depth))
                childEntries++
              } else {
                const reference = unlist(oldFrames[0].pending)[0]
                const state = {
                  $: "Specification.State",
                  root_name: previous.cursor.root_name,
                  expanded: previous.cursor.expanded,
                  referenced: previous.cursor.referenced,
                  failure: previous.cursor.failure
                }
                const result = referenceJoint.result(reference, state, rootCatalog, {
                  $: "Specification.Literal",
                  value: 0
                })
                assert.equal(result.$, "Specification.ReferenceResult", "no-child branch must return a reference")
                const successor = referenceJoint.successor(
                  previous.cursor.remaining - 1,
                  jointTags(previous.cursor, true),
                  result.state,
                  result.reference
                )
                assert.deepEqual(
                  jointTags(successor, false),
                  next,
                  "no-child successor preserves every actual cursor field"
                )
                const queue = referenceJoint.operations(reference, rootCatalog, {
                  $: `Core.${previous.cursor.global.purpose.$}`
                })
                assert.deepEqual(
                  jointTags(referenceJoint["Core.cursor_ops"](successor, queue), false),
                  step,
                  "no-child aggregate uses the exact actual edge queue"
                )
                referenceTransitions++
              }
            } else {
              assert.equal(nextFrames.length, oldFrames.length - 1)
              const returned = continuation.returned_frame(
                { $: `Core.${previous.cursor.global.purpose.$}` },
                { ...oldFrames[1], $: "Core.Frame" },
                oldFrames[0].slot,
                oldFrames[0].reversed,
                oldFrames[0].site.value
              )
              assert.deepEqual(
                { ...returned, $: "Frame" },
                nextFrames[0],
                "returned frame retains parent slot/site/pending and Core accumulator policy"
              )
              assert.deepEqual(
                step,
                core.cursor_ops(
                  { ...previous.cursor, frames: list([{ ...returned, $: "Frame" }, ...oldFrames.slice(2)]) },
                  core.finish_operations(previous.cursor.global.purpose)
                ),
                "actual child return preserves shared state, request and ancestors, with the exact finish queue"
              )
              depths.shift()
              childReturns++
            }
          } else depths = []
        }
      } else if (step.$ === "Engine") {
        assert.ok(measuring, "analysis modes must not issue arithmetic commands")
        assert.equal(step.request, request++)
        assert.equal(core.resume(step, { $: "Ack", request: step.request + 1 }).$, "InvalidReply")
        refusedAcks++
        const operation = step.operation
        operations.push(operation)
        if (operation.$ === "Model.Push") expressions.push({ $: "Literal", value: operation.value })
        else if (operation.$ === "Model.MeasureArtifact") expressions.push({ $: "ArtifactBytes", slot: operation.slot })
        else if (operation.$ === "Model.MeasureText") expressions.push({ $: "TextBytes", value: operation.value })
        else {
          const right = expressions.pop(),
            left = expressions.pop()
          assert.ok(left && right)
          expressions.push({ $: operation.$ === "Model.Add" ? "Add" : "Multiply", left, right })
        }
        switch (operation.$) {
          case "Model.Push":
            stack.push(Number(operation.value))
            break
          case "Model.MeasureArtifact":
          case "Model.MeasureText": {
            const encoded = JSON.stringify(
              operation.$ === "Model.MeasureArtifact" ? artifacts[Number(operation.slot)] : operation.value
            )
            measurements.push([encoded, "utf8"])
            stack.push(Buffer.byteLength(encoded, "utf8"))
            break
          }
          case "Model.Add":
          case "Model.Multiply": {
            assert.ok(stack.length >= 2, "arithmetic stack underflow")
            const right = stack.pop(),
              left = stack.pop()
            stack.push(operation.$ === "Model.Add" ? left + right : left * right)
            break
          }
          default:
            throw new Error("unknown arithmetic operation")
        }
        step = core.resume(step, { $: "Ack", request: step.request })
      } else {
        assert.equal(step.$, measuring ? "PreflightCompleted" : "Completed", "cursor must terminate without exhaustion")
        assert.equal(core.resume(step, { $: "Ack", request }).$, "InvalidReply")
        if (measuring) assert.equal(stack.length, 1, "preflight terminal stack must have one result")
        return { step, operations, measurements, bytes: stack[0] }
      }
      if (activeBefore) {
        assert.ok(resourceBefore >= 1, "active root resource is positive")
        assert.ok(
          resource.measure(jointTags(step, true)) + 1 <= resourceBefore,
          "each actual root transition strictly decreases resource"
        )
        resourceTransitions++
      }
    }
    throw new Error("local cursor fixture deadline exceeded")
  }
  const emptyFacts = catalog([])
  checkLawInstances(emptyFacts)
  assert.deepEqual(unlist(runCore(core.initial(emptyFacts, { $: "Trees" })).step.outcomes), [])
  assert.deepEqual(unlist(runCore(core.initial(emptyFacts, { $: "Outcomes" })).step.outcomes), [])
  assert.equal(runCore(core.initial(emptyFacts, { $: "Preflight" }), [], true).bytes, 0)
  for (const operation of [{ $: "Model.Add" }, { $: "Model.Multiply" }]) {
    for (const depth of [0, 1]) assert.deepEqual(stackModel.operation(operation, depth), none)
    for (const depth of [2, 3, 17]) assert.deepEqual(stackModel.operation(operation, depth), some(depth - 1))
  }
  let rawCases = 0
  const inspect = (root, facts) => {
    checkLawInstances(facts)
    const candidates = [...unlist(facts.declarations), ...unlist(facts.supporting).map((entry) => entry.declaration)]
    const names = new Set(["missing-target", "", ...candidates.map((entry) => entry.name)])
    const targets = [none, some(""), some("missing-key"), ...unlist(facts.supporting).map((entry) => some(entry.key))]
    for (const name of names)
      for (const target of targets)
        for (const expanded of [[], [root.identity], candidates.map((entry) => entry.identity)]) {
          assert.equal(potential.selected_drop(facts, name, target, list(expanded)), true, "selected_target_drop")
          assert.equal(
            weighted.specification_drop(facts, name, target, list(expanded)),
            true,
            "Spec weighted selected-target drop"
          )
          selectedDropCases++
        }
    const result = spec.analyze(root, facts)
    assert.equal(result.$, "NodeResult", "derived recursive depth must suffice for each finite fixture")
    for (const depth of [0, 1, 3, 17])
      assert.deepEqual(stackModel.depth(spec.postfix(result.bytes), depth), some(depth + 1), "postfix_effect")
    const pending = list([declaration(999, "suspended-outer-root", [unsupported("must-not-visit")])])
    const prefix = list([{ $: "Model.Outcome", root: 777, failure: none, tree: none }])
    for (const purpose of ["Core.Trees", "Core.Outcomes", "Core.Preflight"])
      for (const request of [0, 17]) {
        assert.equal(
          potential.entry_valid(root, facts, { $: purpose }, pending, prefix, request),
          true,
          "root_entry_valid"
        )
        const invocation = {
          $: "Global",
          catalog: facts,
          purpose: { $: purpose.replace(/^Core\./u, "") },
          pending,
          reversed: prefix,
          request
        }
        const entered = core.next_root({ ...invocation, pending: list([root, ...unlist(pending)]) })
        if (unlist(root.references).length === 0) {
          if (purpose === "Core.Preflight") {
            const queue = [entered.operation, ...unlist(entered.remaining)]
            assert.deepEqual(
              queue,
              [
                { $: "Model.MeasureArtifact", slot: root.slot },
                { $: "Model.Push", value: 512 },
                { $: "Model.Add" },
                { $: "Model.Add" }
              ],
              "leaf preflight preserves the exact four operations"
            )
            assert.equal(entered.next.$, "RootNext", "leaf needs no DFS cursor")
            let step = entered
            for (let offset = 0; offset < 4; offset++) {
              assert.equal(step.$, "Engine")
              assert.equal(step.request, request + offset)
              assert.equal(core.resume(step, { $: "Ack", request: request + offset + 1 }).$, "InvalidReply")
              step = core.resume(step, { $: "Ack", request: request + offset })
            }
            assert.equal(step.$, "NextRoot")
            assert.equal(step.global.request, request + 4)
            assert.deepEqual(step.global.pending, pending)
            assert.deepEqual(step.global.reversed, prefix)
          } else {
            assert.equal(entered.$, "NextRoot", "leaf analysis needs no DFS cursor")
            assert.equal(entered.global.request, request)
            assert.deepEqual(entered.global.pending, pending)
          }
        } else {
          const initial = entered.$ === "Continue" ? entered.cursor : entered.next.cursor
          assert.deepEqual(
            jointTags(joint.initial_cursor(root, jointTags(invocation, true)), false),
            initial,
            "joint initial cursor is actual nonempty root-entry retained cursor"
          )
        }
        const actual = rootContract.execute(root, facts, { $: purpose }, pending, prefix, request)
        const expected = rootContract.expected(root, facts, { $: purpose }, pending, prefix, request)
        assert.equal(actual.$, "RootDone", "complete_root_with_continuation: cursor budget")
        assert.equal(expected.$, "Some", "complete_root_with_continuation: independent spec budget")
        assert.deepEqual(actual.global, expected.value.global, "exact outer continuation and request count")
        assert.deepEqual(
          unlist(actual.reversed).reverse(),
          unlist(expected.value.operations),
          "exact complete root trace"
        )
        rootContexts++
      }
    const materialized = spec.outcome({ $: "Model.Materialize" }, result)
    const outcomes = spec.outcome({ $: "Model.OutcomesOnly" }, result)
    assert.equal(materialized.$, "Some")
    assert.deepEqual(outcomes, some({ ...materialized.value, tree: none }))
    for (const [purpose, expected] of [
      ["Trees", materialized],
      ["Outcomes", outcomes]
    ]) {
      const start = core.next_root({
        $: "Global",
        catalog: facts,
        purpose: { $: purpose },
        pending: list([root]),
        reversed: list([]),
        request: 0
      })
      assert.deepEqual(unlist(runCore(start, [], false, { root, facts }).step.outcomes), [expected.value])
    }
    rawCases++
    return result
  }
  const references = (result) => unlist(result.node.references)
  const leaf = declaration(41, "Leaf")
  inspect(leaf, catalog([]))
  inspect(leaf, catalog([leaf, declaration(42, "After", [named("Leaf")])]))
  const a = declaration(0, "A", [named("X")]),
    oldX = declaration(1, "X"),
    newX = declaration(2, "X")
  assert.equal(references(inspect(a, catalog([a, oldX, newX])))[0].node.slot, 2)
  const supportRoot = declaration(0, "A", [named("alias", "")])
  assert.equal(
    references(
      inspect(
        supportRoot,
        catalog(
          [supportRoot],
          [
            ["", oldX],
            ["", newX]
          ]
        )
      )
    )[0].node.slot,
    2
  )
  const self = declaration(0, "A", [named("A")])
  assert.deepEqual(references(inspect(self, catalog([self]))), [{ $: "Model.Included", symbol: "A", target: "A" }])
  const aliases = declaration(
    0,
    "A",
    Array.from({ length: 20 }, (_, index) => named("A", "support-" + index))
  )
  const aliasFacts = Array.from({ length: 20 }, (_, index) => [
    "support-" + index,
    declaration(index + 1, "Other", [], "id-" + index)
  ])
  const aliasResult = inspect(aliases, catalog([aliases], aliasFacts))
  assert.deepEqual(unlist(aliasResult.state.referenced), [])
  assert.equal(aliasResult.state.failure.$, "None", "root-name exemption precedes targetId reference counting")
  const sameId = declaration(0, "A", [named("X"), named("Y")])
  const sameResult = inspect(
    sameId,
    catalog([sameId, declaration(1, "X", [], "shared"), declaration(2, "Y", [], "shared")])
  )
  assert.equal(references(sameResult)[0].$, "Model.Expanded")
  assert.deepEqual(references(sameResult)[1], { $: "Model.Included", symbol: "Y", target: "shared" })
  for (const count of [16, 17, 18]) {
    const targets = Array.from({ length: count }, (_, index) => declaration(index + 1, "T" + index))
    const root = declaration(
      0,
      "A",
      targets.map((target) => named(target.name))
    )
    const result = inspect(root, catalog([root, ...targets]))
    assert.equal(result.state.failure.$, count <= 16 ? "None" : "Some")
    if (count > 16) {
      assert.equal(result.state.failure.value.$, "Model.ReferenceLimit")
      assert.deepEqual(references(result)[16], {
        $: "Model.Omitted",
        symbol: "T16",
        target: some("T16"),
        reason: { $: "Model.LimitExceeded" }
      })
    }
  }
  for (const [edges, failure] of [
    [[unsupported("bad"), named("missing")], "Model.UnsupportedReference"],
    [[named("missing"), unsupported("bad")], "Model.MissingEvidence"]
  ]) {
    const root = declaration(0, "A", edges)
    const result = inspect(root, catalog([root]))
    assert.equal(result.state.failure.value.$, failure)
    assert.equal(references(result).length, 2, "failure does not stop later references")
  }
  const duplicateCount = declaration(0, "A", Array(40).fill(named("missing")))
  assert.equal(unlist(inspect(duplicateCount, catalog([duplicateCount])).state.referenced).length, 1)
  // A root outside the catalog still contributes its own visit/reference cost.
  const detached = declaration(0, "Detached", [named("X")])
  assert.equal(references(inspect(detached, catalog([oldX])))[0].node.slot, 1)

  const evaluateBytes = (expression, artifacts, trace, fault, supplied) => {
    switch (expression.$) {
      case "Literal":
        return Number(expression.value)
      case "Add":
        return (
          evaluateBytes(expression.left, artifacts, trace, fault, supplied) +
          evaluateBytes(expression.right, artifacts, trace, fault, supplied)
        )
      case "Multiply":
        return (
          evaluateBytes(expression.left, artifacts, trace, fault, supplied) *
          evaluateBytes(expression.right, artifacts, trace, fault, supplied)
        )
      case "ArtifactBytes":
      case "TextBytes": {
        const text = JSON.stringify(
          expression.$ === "ArtifactBytes" ? artifacts[Number(expression.slot)] : expression.value
        )
        trace.push([text, "utf8"])
        if (trace.length === fault?.at) throw fault.value
        return supplied?.(trace.length) ?? Buffer.byteLength(text, "utf8")
      }
      default:
        throw new Error("unexpected measurement expression")
    }
  }
  const nativePreflight = (path, source, trace, fault, supplied, implementation = analyzerMaterializationPreflight) => {
    const original = Buffer.byteLength
    Buffer.byteLength = (...args) => {
      // Observe only the original analyzer's measurement primitive, excluding
      // unrelated parser IO/encoding. The original compiled function is called.
      if (new Error().stack.includes("encodedBytes")) {
        trace.push([args[0], args[1]])
        if (trace.length === fault?.at) throw fault.value
        const suppliedValue = supplied?.(trace.length)
        if (suppliedValue !== undefined) return suppliedValue
      }
      return original(...args)
    }
    try {
      return implementation(path, source, true)
    } finally {
      Buffer.byteLength = original
    }
  }
  let measurementCases = 0,
    faultCases = 0
  const sources = [
    ["a.ts", "export interface Root { value: string }"],
    ["a.py", "class Root:\n value: str\n"],
    ["a.go", "package fixture\ntype Root struct { Value string }\n"],
    ["a.rs", "pub struct Root { pub value: String }\n"],
    ["a.bend", "type Root is Data:\n  Root{}\n"],
    ["a.ts", "interface A { child: B }\ninterface B { parent: A }\ninterface C { value: string }"],
    ["a.ts", "interface A { child: Missing }"],
    ["a.ts", "interface A { child: NS.B }"],
    ...[16, 17, 18].map((count) => [
      "a.ts",
      [
        "interface Root { values: [" + Array.from({ length: count }, (_, index) => "T" + index).join(",") + "] }",
        ...Array.from({ length: count }, (_, index) => "interface T" + index + " { value: string }")
      ].join("\n")
    ])
  ]
  let sourceRoots = 0,
    artifactIdentities = 0
  for (const [path, source] of sources) {
    const native = analyzeTypeFile(path, source, true)
    assert.equal(native.status, "analyzed", "physical parser fixture must reach local analyzer: " + path)
    assert.deepEqual(
      native,
      referenceNative.analyzeTypeFile(path, source, true),
      "public Bend trees equal the independent original TS implementation"
    )
    assert.deepEqual(
      analyzeTypeOutcomes(path, source, true),
      {
        status: "analyzed",
        units: native.units.map((outcome) =>
          outcome.status === "ready"
            ? { status: "ready", name: outcome.unit.root.artifact.name }
            : { status: "unsupported", name: outcome.root.name, reason: outcome.reason }
        )
      },
      "public Outcomes preserves all statuses without trees"
    )
    const adapter = languageForPath(path)
    const parsed = adapter.parseTypes(path, source, true)
    assert.ok(Array.isArray(parsed))
    const supporting = adapter.supportingTypes?.(path, source) ?? new Map()
    const artifacts = []
    const slots = new Map()
    const encode = (value) => {
      if (!slots.has(value)) {
        slots.set(value, artifacts.length)
        artifacts.push(value.artifact)
      }
      return declaration(
        slots.get(value),
        value.artifact.name,
        value.references.map((reference) =>
          reference.kind === "unsupported" ? unsupported(reference.name) : named(reference.name, reference.targetId)
        ),
        value.artifact.id
      )
    }
    const roots = parsed.map(encode)
    const facts = catalog(
      roots,
      [...supporting].map(([key, value]) => [key, encode(value)])
    )
    const decodeNode = (node) => ({
      artifact: artifacts[Number(node.slot)],
      references: unlist(node.references).map((reference) => {
        const site = { symbol: reference.symbol }
        if (reference.$ === "Model.Expanded") return { kind: "expanded", site, node: decodeNode(reference.node) }
        if (reference.$ === "Model.Included") return { kind: "included", site, target: reference.target }
        return {
          kind: "omitted",
          site,
          target:
            reference.target.$ === "None"
              ? { kind: "unresolved", symbol: reference.symbol }
              : { kind: "known", artifactId: reference.target.value },
          reason: {
            "Model.Unresolved": "unresolved",
            "Model.UnsupportedSyntax": "unsupported",
            "Model.LimitExceeded": "reference-limit"
          }[reference.reason.$]
        }
      })
    })
    const results = roots.map((root) => inspect(root, facts))
    const actual = results.map((result) => {
      const unit = { root: decodeNode(result.node) }
      return result.state.failure.$ === "None"
        ? { status: "ready", unit }
        : {
            status: "unsupported",
            root: unit.root.artifact,
            unit,
            reason: {
              "Model.MissingEvidence": "missing-evidence",
              "Model.UnsupportedReference": "unsupported-reference",
              "Model.ReferenceLimit": "reference-limit"
            }[result.state.failure.value.$]
          }
    })
    assert.deepEqual(actual, native.units, "independent recursive equations must equal actual native analyzer: " + path)
    const bound = nativeBinding.analyzeDeclarations(parsed, supporting)
    assert.deepEqual(bound, actual)
    const identity = (nativeNode, plan) => {
      assert.equal(
        nativeNode.artifact,
        artifacts[Number(plan.slot)],
        "native binding must retain the exact artifact object"
      )
      artifactIdentities++
      const references = unlist(plan.references)
      references.forEach((reference, index) => {
        if (reference.$ === "Model.Expanded") identity(nativeNode.references[index].node, reference.node)
      })
    }
    bound.forEach((outcome, index) => identity(outcome.unit.root, results[index].node))
    const evaluateAll = (trace, fault, supplied) => {
      let subtotal = 0
      for (const result of results) subtotal += evaluateBytes(result.bytes, artifacts, trace, fault, supplied)
      return subtotal
    }
    const materializedOutcomes = results.map((result) => spec.outcome({ $: "Model.Materialize" }, result).value)
    assert.deepEqual(unlist(runCore(core.initial(facts, { $: "Trees" })).step.outcomes), materializedOutcomes)
    assert.deepEqual(
      unlist(runCore(core.initial(facts, { $: "Outcomes" })).step.outcomes),
      materializedOutcomes.map((outcome) => ({ ...outcome, tree: none }))
    )
    const expectedOperations = [{ $: "Model.Push", value: 0 }]
    const postfix = (expression) => {
      switch (expression.$) {
        case "Literal":
          expectedOperations.push({ $: "Model.Push", value: Number(expression.value) })
          break
        case "ArtifactBytes":
          expectedOperations.push({ $: "Model.MeasureArtifact", slot: Number(expression.slot) })
          break
        case "TextBytes":
          expectedOperations.push({ $: "Model.MeasureText", value: expression.value })
          break
        case "Add":
        case "Multiply":
          postfix(expression.left)
          postfix(expression.right)
          expectedOperations.push({ $: expression.$ === "Add" ? "Model.Add" : "Model.Multiply" })
          break
        default:
          throw new Error("unexpected expression")
      }
    }
    for (const result of results) {
      postfix(result.bytes)
      expectedOperations.push({ $: "Model.Add" })
    }
    const cursorMeasurement = runCore(core.initial(facts, { $: "Preflight" }), artifacts, true)
    assert.deepEqual(
      cursorMeasurement.operations,
      expectedOperations,
      "full preflight postfix trace including outer fold"
    )
    const expressionTrace = [],
      nativeTrace = []
    const expectedBytes = evaluateAll(expressionTrace)
    const nativeBound = nativePreflight(path, source, nativeTrace)
    assert.deepEqual(
      nativeBound,
      referenceNative.analyzerMaterializationPreflight(path, source, true),
      "public preflight equals the independent TS reference"
    )
    assert.equal(nativeBound.declarations, roots.length)
    assert.equal(nativeBound.expandedUnitBytes, expectedBytes, "original IEEE grouping and exact preflight bytes")
    assert.deepEqual(expressionTrace, nativeTrace, "ordered repeated native measurement trace")
    assert.equal(cursorMeasurement.bytes, expectedBytes)
    assert.deepEqual(cursorMeasurement.measurements, expressionTrace)
    measurementCases++
    if (path === "a.ts") {
      for (const at of new Set([1, Math.ceil(nativeTrace.length / 2), nativeTrace.length])) {
        const sentinel = { at, path, source }
        const expectedPrefix = [],
          actualPrefix = []
        assert.throws(
          () => evaluateAll(expectedPrefix, { at, value: sentinel }),
          (error) => error === sentinel
        )
        assert.throws(
          () => nativePreflight(path, source, actualPrefix, { at, value: sentinel }),
          (error) => error === sentinel
        )
        const referencePrefix = []
        assert.throws(
          () =>
            nativePreflight(
              path,
              source,
              referencePrefix,
              { at, value: sentinel },
              undefined,
              referenceNative.analyzerMaterializationPreflight
            ),
          (error) => error === sentinel
        )
        assert.deepEqual(referencePrefix, actualPrefix, "native error identity and chronology match the original TS")
        assert.deepEqual(expectedPrefix, actualPrefix, "measurement fault must stop at the same primitive")
        faultCases++
      }
      // Deliberately substituted nonnegative engine results stress IEEE
      // grouping. These are raw engine diagnostics, not physical byte sizes.
      const supplied = (index) => [2 ** 53, 1, 3, 2 ** 48][index % 4]
      const expectedTrace = [],
        actualTrace = []
      assert.equal(
        nativePreflight(path, source, actualTrace, undefined, supplied).expandedUnitBytes,
        evaluateAll(expectedTrace, undefined, supplied)
      )
      assert.deepEqual(expectedTrace, actualTrace)
      measurementCases++
    }
    sourceRoots += roots.length
  }
  console.log(
    JSON.stringify({
      rawAndSourceCases: rawCases,
      sourceFixtures: sources.length,
      sourceRoots,
      artifactIdentities,
      measurementCases,
      faultCases,
      cursorSteps,
      refusedAcks,
      lawCatalogs,
      packagedModes,
      rootContexts,
      potentialStates,
      selectedDropCases,
      continuationStates,
      specificationDepthBounds,
      childEntries,
      referenceTransitions,
      rootTraceStates,
      resourceTransitions,
      resourceEntries,
      childReturns,
      scope:
        "connected public local analyzer, packaged Core and independent native TS/recursive specification; whole Preparation acceptance remains open"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
