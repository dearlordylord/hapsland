import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, extname } from "node:path"
import { pathToFileURL } from "node:url"
import { compileRule } from "@hapsland/review-definition/rules/compiler"
import { TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { REVIEW_PROVIDERS } from "@hapsland/runtime-environment/runtime/backend"
import { registeredLanguages } from "@hapsland/source-analysis/direct-event/languages/registry"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import { initialCanonical, stepCanonical } from "@hapsland/canonical-policy/canonical/adapter"
import { createPreparationFinalizationConsumer } from "../../../dist/direct-event/preparation/verification/finalization-engine-consumer.js"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { createChildExecutionDriver } from "@hapsland/canonical-policy/canonical/child-execution"
import { createNativeSessionRegistry } from "@hapsland/runtime-environment/runtime/native-session-registry"
import { TransportFailure } from "@hapsland/runtime-environment/runtime/effect-transport"
import {
  createFinalizationMachine,
  finalizationProtocol,
  performFinalizationSync,
  performFinalizationAsync
} from "../../../dist/direct-event/preparation/finalization-protocol.js"
import { canonicalJsonPlanOperations } from "./canonical-json-plan-codec.ts"
import { decodePreparationResult } from "../../../dist/direct-event/preparation/preparation-result-codec.js"
import {
  productValue,
  fromProductValue,
  fromBinary64,
  list,
  unlist
} from "@hapsland/source-artifacts/direct-event/value/codec"

const backend = "../../../../runtime-environment/src/runtime/backend/Backend."
const languagePrefix = "../../../../native-observation/src/direct-event/languages/path-language/PathLanguage."
const configuration = "../../../../runtime-inputs/src/configuration/review-backend/ReviewBackend."

const wire = (value) => productValue(value)
const label = (value) => value.$.split(".").at(-1)
const maybe = (value) => (value === undefined ? { $: "None" } : { $: "Some", value })
const text = (value) => String.fromCharCode(...unlist(value))
const primitive = (value) => {
  switch (label(value)) {
    case "NullPrimitive":
      return "null"
    case "BoolPrimitive":
    case "StringPrimitive":
      return JSON.stringify(value.value)
    case "NumberPrimitive":
      return JSON.stringify(
        fromBinary64({ ...value.bits, $: "../../../../source-artifacts/src/direct-event/value/Value.Binary64" })
      )
    default:
      throw new Error("Unexpected primitive")
  }
}
const backends = () =>
  list(
    Object.values(REVIEW_PROVIDERS).map((value) => ({
      $: backend + "Declaration",
      id: value.id,
      default_model: maybe(value.defaultModel),
      destination: value.destination
    }))
  )
const config = (selection) =>
  selection === undefined
    ? { $: "None" }
    : maybe(
        list([
          {
            $: configuration + "Layer",
            name: "user",
            backend: maybe({
              $: backend + "Selection",
              provider: selection.provider,
              model:
                "model" in selection
                  ? { $: backend + "Supplied", value: maybe(selection.model) }
                  : { $: backend + "Missing" },
              fields: list(
                Object.entries(selection)
                  .filter(([, value]) => typeof value === "string")
                  .map(([name, value]) => ({ $: backend + "Field", name, value }))
              )
            })
          }
        ])
      )
const languages = list(
  registeredLanguages.map(({ id, extensions }) => ({
    $: languagePrefix + "Registration",
    id,
    extensions: list(extensions)
  }))
)
const rules = ["type", "function"].map((kind) =>
  compileRule(
    {
      version: 1,
      id: "whole-" + kind,
      question: "Is this relevant?",
      criteria: { false: "No", true: "Yes" },
      message: "Relevant",
      inputs: [
        {
          languages: kind === "function" ? ["typescript"] : ["typescript", "rust", "bend", "python", "go"],
          kind,
          requires: []
        }
      ]
    },
    "whole-source"
  )
)
const location = { start: { line: 1, column: 1 }, end: { line: 1, column: 8 } }
const omission = {
  kind: "omitted",
  site: { symbol: "missing" },
  target: { kind: "unresolved", symbol: "missing" },
  reason: "unresolved"
}
const temporary = mkdtempSync(join(tmpdir(), "hapsland-whole-finalization-"))
try {
  const output = join(temporary, "whole.mjs")
  execFileSync(
    "timeout",
    ["5s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "PreparationFinalization.bend"), "-o", output],
    { timeout: 6000 }
  )
  const core = (await import(pathToFileURL(output))).default
  const canonical = initialCanonical({ globalItems: 1, globalBytes: 1, partitionItems: 1, partitionBytes: 1 })
  let cases = 0,
    requests = 0,
    canonicalRequests = 0,
    rejectedReplies = 0,
    omissionCalls = 0,
    rulesReads = 0
  const check = ({
    path,
    contract,
    units,
    declarations,
    captures,
    selection,
    supplied,
    snapshots = [rules],
    observerThrows = false,
    expectedTrace = [],
    expectedNames = [],
    expectedRule,
    terminal = "Completed"
  }) => {
    const makeBindings = () => {
      const trace = []
      let reads = 0
      return {
        trace,
        currentRules: () => {
          trace.push(["rules", reads])
          return snapshots[Math.min(reads++, snapshots.length - 1)]
        },
        observe: (path, name, reason) => {
          trace.push(["omission", path, name, reason])
          if (observerThrows) throw new Error("observer exception")
        }
      }
    }
    const actualBindings = makeBindings()
    const invocation = { $: "Invocation", owner: cases + 1, command: 3 }
    let step = core.initial(
      invocation,
      {
        $: "Context",
        contract,
        path,
        root: "/workspace",
        graph_limits: wire(GRAPH_LIMIT_CEILINGS),
        declarations: list(declarations.map(productValue)),
        captures: list([...captures].map(([path, capture]) => productValue({ path, ...capture }))),
        bundled: list([]),
        languages
      },
      list(units.map(productValue))
    )
    const invocationContext = step.phase.state.context
    assert.equal(label(step.phase.state.cache), "Unprepared", "initial never materializes captures")
    let preparedCaptures
    let previousRequest = 0,
      savedReply,
      savedAt
    for (let turns = 0; !["Completed", "TypeError", "URIError"].includes(label(step)); turns++) {
      assert.ok(turns < 100000)
      const observedState =
        label(step) === "Continue" ? (step.phase.state ?? step.phase.unit?.state) : (step.state ?? step.unit?.state)
      assert.deepEqual(observedState.context, invocationContext, "immutable capture context belongs to this invocation")
      if (label(observedState.cache) === "Prepared") {
        preparedCaptures ??= observedState.cache.captures
        assert.deepEqual(
          observedState.cache.captures,
          preparedCaptures,
          "prepared evidence remains unchanged across unit transitions"
        )
      } else {
        assert.equal(preparedCaptures, undefined, "prepared cache never resets within invocation")
      }
      if (label(step) === "Continue") {
        assert.equal(
          label(core.resume(step, { $: "Reply", invocation, request: previousRequest, response: { $: "Observed" } })),
          "InvalidReply"
        )
        rejectedReplies++
        step = core.advance(step.phase)
        continue
      }
      assert.notEqual(label(step), "InvalidInput")
      assert.notEqual(label(step), "InvalidReply")
      const state = step.state ?? step.unit.state
      const request = state.request
      if (label(step) === "InputRequest" && label(step.step) === "ExportJson")
        assert.equal(request, previousRequest, "mechanical flatten does not consume an outer ID")
      else assert.ok(request > previousRequest)
      previousRequest = request
      let response
      switch (label(step)) {
        case "ObserveOmission":
          try {
            actualBindings.observe(step.path, step.name, step.reason)
            response = { $: "Observed" }
          } catch {
            response = { $: "ObserverSynchronouslyThrew" }
          }
          omissionCalls++
          break
        case "PathExtension":
          response = { $: "Extension", value: extname(step.path).toLowerCase() }
          break
        case "ReadCurrentRules":
          response = {
            $: "CurrentRules",
            rules: maybe(list(actualBindings.currentRules().map(productValue))),
            fallback: maybe(list(rules.map(productValue)))
          }
          rulesReads++
          break
        case "ReadProviderFacts":
          response = {
            $: "ProviderFacts",
            configuration: config(selection),
            identity: maybe(supplied ? { $: backend + "Identity", ...supplied } : undefined),
            backends: backends()
          }
          break
        case "RulesRequest": {
          const nested = step.step
          if (label(nested) === "Engine") {
            const compile = label(nested.query) === "AnyCompile"
            let valid = true,
              matched = false
            try {
              const expression = new RegExp(text(nested.query.expression))
              if (!compile) matched = expression.test(text(nested.query.candidate))
            } catch {
              valid = false
            }
            response = compile ? { $: "Compiled", valid } : { $: "Tested", valid, matched }
          } else {
            assert.equal(label(nested), "CanonicalGate")
            const result = stepCanonical(canonical, {
              kind: "ruleApplicabilityCheck",
              consent: nested.consent,
              complete: nested.complete,
              target: {
                TypeShape: "typeShape",
                FunctionTarget: "functionTarget",
                UnsupportedTarget: "unsupportedTarget"
              }[label(nested.target)],
              globalIncluded: nested.global_included,
              globalExcluded: nested.global_excluded,
              packEnabled: nested.pack_enabled,
              ruleEnabled: nested.rule_enabled,
              ruleIncluded: nested.rule_included,
              ruleExcluded: nested.rule_excluded,
              targetDeclared: nested.target_declared,
              capabilitiesAvailable: nested.capabilities_available,
              sourceRung: Number(nested.source_rung),
              minimumRung: Number(nested.minimum_rung)
            })
            assert.equal(result.rejection, undefined)
            assert.deepEqual(result.state, canonical)
            assert.equal(result.outputs.length, 1)
            response = { $: "CanonicalGate", admit: result.outputs[0].gate === "admit" }
            canonicalRequests++
          }
          break
        }
        case "InputRequest": {
          const nested = step.step
          if (label(nested) === "EncodeComponent") {
            try {
              response = { $: "Encoded", value: encodeURIComponent(nested.value) }
            } catch (error) {
              assert.ok(error instanceof URIError)
              response = { $: "EncodingFailed" }
            }
          } else if (label(nested) === "ExportJson")
            response = { $: "Planned", operations: canonicalJsonPlanOperations(nested.value) }
          else {
            assert.equal(label(nested), "Digest")
            response = { $: "Hashed", value: createHash("sha256").update(nested.bytes, "utf8").digest("hex") }
          }
          break
        }
        case "JsonBatchRequest": {
          response = {
            $: "BatchSerialized",
            observations: list(
              unlist(step.commands).map((scheduled) => ({
                $: "CanonicalJsonBatch.Observed",
                request: scheduled.request,
                token: {
                  $: "CanonicalJsonBatch.Token",
                  invocation: scheduled.command.invocation,
                  request: scheduled.command.request,
                  value: primitive(scheduled.command.primitive)
                }
              }))
            )
          }
          break
        }
        default:
          throw new Error("Unexpected whole request " + step.$)
      }
      const reply = { $: "Reply", invocation, request, response }
      if (label(step) === "JsonBatchRequest") {
        const commands = unlist(step.commands)
        assert.ok(commands.length > 0)
        assert.equal(commands[0].request, request, "batch header is first pending outer request")
        for (let index = 0; index < commands.length; index++) assert.equal(commands[index].request, request + index)
        const observations = unlist(response.observations)
        const malformed = [observations.slice(1), [...observations, observations[0]]]
        for (const index of new Set([0, Math.floor(observations.length / 2), observations.length - 1])) {
          malformed.push(
            observations.map((item, offset) => (offset === index ? { ...item, request: item.request + 1 } : item))
          )
          malformed.push(
            observations.map((item, offset) =>
              offset === index ? { ...item, token: { ...item.token, request: item.token.request + 1 } } : item
            )
          )
        }
        for (const bad of malformed) {
          assert.equal(
            label(core.resume(step, { ...reply, response: { $: "BatchSerialized", observations: list(bad) } })),
            "InvalidReply"
          )
          rejectedReplies++
        }
        const after = core.resume(step, reply)
        assert.equal(label(after), "Continue")
        assert.equal(after.phase.unit.state.request, request + (commands.length - 1))
        assert.equal(label(after.phase.step), "Continue")
        const digest = core.advance(after.phase)
        assert.equal(label(digest), "InputRequest")
        assert.equal(label(digest.step), "Digest")
        assert.equal(digest.unit.state.request, request + commands.length)
        assert.equal(digest.step.state.request, commands[0].command.request + commands.length)
      }
      for (const wrong of [
        { ...reply, invocation: { ...invocation, command: invocation.command - 1 } },
        { ...reply, invocation: { ...invocation, owner: invocation.owner + 1 } },
        { ...reply, request: request + 1 },
        { ...reply, response: { $: label(step) === "ObserveOmission" ? "Hashed" : "Observed", value: "wrong" } }
      ]) {
        assert.equal(label(core.resume(step, wrong)), "InvalidReply")
        rejectedReplies++
      }
      if (savedReply && savedAt !== request) {
        assert.equal(label(core.resume(step, savedReply)), "InvalidReply")
        rejectedReplies++
      }
      savedReply = reply
      savedAt = request
      step = core.resume(step, reply)
      requests++
    }
    assert.deepEqual(actualBindings.trace, expectedTrace)
    assert.equal(label(step), terminal)
    if (terminal === "Completed") {
      const actual = unlist(step.outcomes).map((value) => fromProductValue(value))
      assert.deepEqual(
        actual.map((outcome) => outcome.prepared.input.declaration.name),
        expectedNames
      )
      for (const outcome of actual) {
        assert.equal(outcome.status, "ready")
        assert.equal(outcome.path, path)
        assert.equal(outcome.prepared.root, "/workspace")
        assert.deepEqual(
          outcome.prepared.input.rules.map((rule) => rule.id),
          [expectedRule]
        )
      }
    }
    cases++
  }
  for (const [_language, extension, kind] of [
    ["typescript", "ts", "interface"],
    ["rust", "rs", "struct"],
    ["bend", "bend", "datatype"],
    ["python", "py", "class"],
    ["go", "go", "defined-type"]
  ])
    for (const partial of [false, true])
      for (const provider of Object.values(REVIEW_PROVIDERS)) {
        const path = "root." + extension
        const root = { id: "root", kind, name: "Root😀", source: "source\n", sourceHash: "hash", path }
        const unit = { root: { artifact: root, references: partial ? [omission] : [] } }
        const captures = new Map([[path, { contentHash: "hash:" + path, byteLength: 42 }]])
        const selection = {
          provider: provider.id,
          ...(provider.id === "jev" ? {} : { model: provider.defaultModel }),
          ...(provider.id === "cloudflare" ? { accountId: "0123456789abcdef0123456789abcdef" } : {})
        }
        const missingLocation = { root: { artifact: { ...root, name: "NoLocation" }, references: [] } }
        const missingCapture = {
          root: { artifact: { ...root, name: "NoCapture", path: "missing." + extension }, references: [] }
        }
        const units = [missingLocation, missingCapture, unit, unit, unit]
        const declarations = [root, missingCapture.root.artifact].map((artifact) => ({ artifact, location }))
        check({
          path,
          contract: TYPE_INPUT_CONTRACT,
          units,
          declarations,
          captures,
          selection,
          snapshots: [rules, [], rules],
          observerThrows: true,
          expectedNames: ["Root😀", "Root😀"],
          expectedRule: "whole-type",
          expectedTrace: [
            ["omission", path, "NoLocation", "missing-evidence"],
            ["omission", path, "NoCapture", "missing-evidence"],
            ["rules", 0],
            ["rules", 1],
            ["omission", path, "Root😀", "no-applicable-rule"],
            ["rules", 2]
          ]
        })
        check({
          path: path.toUpperCase(),
          contract: TYPE_INPUT_CONTRACT,
          units: [unit],
          declarations: [{ artifact: root, location }],
          captures,
          supplied: { provider: "openai", model: "gpt-6-luna", destination: "supplied" },
          expectedNames: ["Root😀"],
          expectedRule: "whole-type",
          expectedTrace: [["rules", 0]]
        })
      }
  const root = {
    id: "function",
    kind: "function",
    name: "run",
    source: "function run() {}",
    sourceHash: "hash",
    path: "run.ts"
  }
  const unit = { root: { artifact: root, references: [] } }
  const captures = new Map([["run.ts", { contentHash: "hash", byteLength: 12 }]])
  for (const contract of [FUNCTION_INPUT_CONTRACT, "custom/contract", TYPE_INPUT_CONTRACT])
    check({
      path: "run.ts",
      contract,
      units: [unit, unit],
      declarations: [{ artifact: root, location }],
      captures,
      expectedNames: contract !== "custom/contract" ? ["run", "run"] : [],
      expectedRule: "whole-function",
      expectedTrace:
        contract !== "custom/contract"
          ? [
              ["rules", 0],
              ["rules", 1]
            ]
          : [
              ["rules", 0],
              ["omission", "run.ts", "run", "no-applicable-rule"],
              ["rules", 1],
              ["omission", "run.ts", "run", "no-applicable-rule"]
            ]
    })
  check({
    path: "unsupported.txt",
    contract: TYPE_INPUT_CONTRACT,
    units: [unit],
    declarations: [{ artifact: root, location }],
    captures
  })
  check({ path: "run.ts", contract: TYPE_INPUT_CONTRACT, units: [], declarations: [], captures })
  // Raw-shape extension: malformed graph must not be traversed when mandatory
  // root location is missing, and provider failure occurs after earlier omissions.
  check({
    path: "run.ts",
    contract: TYPE_INPUT_CONTRACT,
    units: [{ root: { artifact: { ...root, name: "NoLocation" } } }, unit, unit],
    declarations: [{ artifact: root, location }],
    captures,
    selection: { provider: "jev", model: undefined },
    terminal: "TypeError",
    expectedTrace: [
      ["omission", "run.ts", "NoLocation", "missing-evidence"],
      ["rules", 0]
    ]
  })
  let runtimeCases = 0
  const runtimeGate = (event) => {
    const result = stepCanonical(canonical, event)
    assert.equal(result.rejection, undefined)
    assert.equal(result.outputs.length, 1)
    return result.outputs[0].gate === "admit"
  }
  const createOwnedConsumer =
    (canonicalGate, machineCore) =>
    async (input, execution = {}) => {
      let state = owner.initial_limits(100, 1000000, 100, 1000000)
      const opened = owner.canonical_event(state, { $: "../Canonical.OpenRound", partition: 1, lifetime: 1 })
      assert.equal(opened.$, "Advanced")
      state = opened.state
      for (const step of unlist(owner.begin_public_preparation(state, 1, 1, 1, 100))) {
        assert.equal(step.$, "Advanced")
        state = step.state
      }
      const registry = createNativeSessionRegistry()
      const machine = createFinalizationMachine({ machine: machineCore, canonicalGate })
      const driver = createChildExecutionDriver({
        owner,
        initialState: state,
        scope: { $: "Scope", partition: 1, lifetime: 1, round: 1, preparation: 2 },
        machine,
        registry,
        protocol: finalizationProtocol,
        foreignSync: ([request]) => performFinalizationSync(request),
        foreign: ([request]) => performFinalizationAsync(request)
      })
      const invocation = driver.allocateInvocation()
      let closes = 0
      const session = {
        invocation,
        revoke() {},
        close() {
          closes++
        }
      }
      try {
        const result = await driver.drive(session, { invocation, finalization: input, execution }, execution)
        if ("failure" in result) throw new TransportFailure("aborted")
        assert.ok("finalization" in result)
        return result.finalization
      } finally {
        assert.equal(closes, 1)
        assert.equal(registry.pendingCleanup, 0)
        assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
      }
    }
  for (const createWireConsumer of [
    (gate, machineCore) => createPreparationFinalizationConsumer({ machine: machineCore, canonicalGate: gate }),
    createOwnedConsumer
  ]) {
    const createConsumer = (gate) => {
      let expectedUnits
      const machineCore = {
        ...core,
        initial(invocation, context, units) {
          assert.equal(units, expectedUnits, "Finalization must retain the exact Bend units list")
          return core.initial(invocation, context, units)
        }
      }
      const consumeWire = createWireConsumer(gate, machineCore)
      // Native fixtures enter the typed owner boundary once; production already
      // holds this exact ProductValue list in Preparation.RenderUnits.
      return async (input, execution) => {
        expectedUnits = list(input.units.map(productValue))
        const outcomes = await consumeWire({ ...input, units: expectedUnits }, execution)
        for (const outcome of outcomes)
          assert.equal(
            outcome.prepared.$,
            "../../../../source-artifacts/src/direct-event/value/Value.ProductObject",
            "Prepared tree stays encoded until public decode"
          )
        return decodePreparationResult({
          $: "PreparationResult",
          complete: true,
          paths: list([]),
          outcomes: list(outcomes.map((outcome) => ({ $: "OutcomeReady", ...outcome }))),
          units: list([]),
          line_roots: list([]),
          selected: 0,
          ambiguous_line: false
        }).outcomes
      }
    }
    const consume = createConsumer(runtimeGate)

    const runtimeInput = (settings, currentRules) => ({
      invocation: 700,
      command: 19,
      units: [unit],
      declarations: [{ artifact: root, location }],
      path: "run.ts",
      frame: {
        contract: FUNCTION_INPUT_CONTRACT,
        graphLimits: GRAPH_LIMIT_CEILINGS,
        supportingCaptures: captures,
        observation: { root: "/workspace" },
        context: { settings, rules: currentRules }
      }
    })
    const unusedFallback = {}
    Object.defineProperty(unusedFallback, "rules", {
      get() {
        throw new Error("unused fallback read")
      }
    })
    const frozen = await consume(runtimeInput(unusedFallback, () => [rules[1]]))
    assert.equal(frozen.length, 1)
    assert.ok(Object.isFrozen(frozen[0].prepared.input))
    assert.ok(Object.isFrozen(frozen[0].prepared.input.unit.root.artifact))
    runtimeCases++
    const readError = new Error("original current rules exception")
    await assert.rejects(
      consume(
        runtimeInput({ rules }, () => {
          throw readError
        })
      ),
      (error) => error === readError
    )
    runtimeCases++
    for (const original of [undefined, null, false, 0, ""]) {
      {
        let reads = 0
        const input = runtimeInput({ rules }, () => {
          reads++
          throw original
        })
        input.units = [unit, unit]
        const observed = await Promise.resolve()
          .then(() => consume(input))
          .then(
            () => ({ raised: false }),
            (error) => ({ raised: true, error })
          )
        assert.equal(observed.raised, true)
        assert.equal(observed.error, original)
        assert.equal(reads, 1, "a failed rules read must stop before the next unit")
      }
      runtimeCases++
    }
    const settingsBefore = () => ({
      rules,
      providerIdentity: { provider: "openai", model: "gpt-6-luna", destination: "before" }
    })
    const update = (settings) => () => {
      settings.providerIdentity = { provider: "openai", model: "gpt-6-luna", destination: "after" }
      return [rules[1]]
    }
    const actualSettings = settingsBefore()
    const updated = await consume(runtimeInput(actualSettings, update(actualSettings)))
    assert.equal(updated.length, 1)
    assert.deepEqual(updated[0].prepared.input.providerIdentity, {
      provider: "openai",
      model: "gpt-6-luna",
      destination: "after"
    })
    assert.deepEqual(
      updated[0].prepared.input.rules.map((rule) => rule.id),
      ["whole-function"]
    )
    runtimeCases++
    const originalEncode = globalThis.encodeURIComponent
    const originalURIError = new URIError("original URI engine exception")
    try {
      globalThis.encodeURIComponent = () => {
        throw originalURIError
      }
      const settings = {
        rules,
        configuration: {
          policy: {
            layers: [
              {
                name: "user",
                document: {
                  reviewBackend: {
                    provider: "cloudflare",
                    model: "clef",
                    accountId: "0123456789abcdef0123456789abcdef"
                  }
                }
              }
            ]
          }
        }
      }
      await assert.rejects(consume(runtimeInput(settings, () => [rules[1]])), (error) => error === originalURIError)
    } finally {
      globalThis.encodeURIComponent = originalEncode
    }
    runtimeCases++
    const gateError = new Error("original Canonical gate exception")
    const failedGate = createConsumer(() => {
      throw gateError
    })
    await assert.rejects(failedGate(runtimeInput({ rules }, () => [rules[1]])), (error) => error === gateError)
    runtimeCases++
    for (const mode of ["initial", "rules", "gate", "rules-throw", "gate-throw"]) {
      const controller = new AbortController()
      const original = new Error("abort then synchronous " + mode)
      const trace = []
      if (mode === "initial") controller.abort()
      const input = runtimeInput({ rules }, () => {
        trace.push("rules")
        if (mode.startsWith("rules")) controller.abort()
        if (mode === "rules-throw") throw original
        return [rules[1]]
      })
      const execute = createConsumer((event) => {
        trace.push("gate")
        if (mode.startsWith("gate")) controller.abort()
        if (mode === "gate-throw") throw original
        return runtimeGate(event)
      })
      await assert.rejects(execute(input, { signal: controller.signal }), (error) =>
        mode.endsWith("throw") ? error === original : error instanceof TransportFailure && error.code === "aborted"
      )
      assert.deepEqual(trace, mode === "initial" ? [] : mode.startsWith("rules") ? ["rules"] : ["rules", "gate"])
      runtimeCases++
    }
    // Exercise native serialization inside both the finite consumer and the
    // actual Canonical lease: partial failure cannot execute the suffix.
    const stringify = JSON.stringify
    let totalPrimitives = 0
    try {
      JSON.stringify = function (...args) {
        totalPrimitives++
        return Reflect.apply(stringify, JSON, args)
      }
      await consume(runtimeInput({ rules }, () => [rules[1]]))
    } finally {
      JSON.stringify = stringify
    }
    assert.ok(totalPrimitives > 2)
    for (const at of new Set([1, Math.ceil(totalPrimitives / 2), totalPrimitives])) {
      for (const mode of ["throw", "abort", "abort-throw"]) {
        let calls = 0
        const controller = new AbortController()
        const original = new Error(`serialization ${mode} at ${at}`)
        try {
          JSON.stringify = function (...args) {
            calls++
            if (calls === at) {
              if (mode.startsWith("abort")) controller.abort()
              if (mode.endsWith("throw")) throw original
            }
            return Reflect.apply(stringify, JSON, args)
          }
          await assert.rejects(
            consume(
              runtimeInput({ rules }, () => [rules[1]]),
              { signal: controller.signal }
            ),
            (error) =>
              mode.endsWith("throw")
                ? error === original
                : error instanceof TransportFailure && error.code === "aborted"
          )
          assert.equal(calls, at, "failed/revoked primitive prevents every suffix effect")
        } finally {
          JSON.stringify = stringify
        }
        runtimeCases++
      }
    }
    // The first raw token must survive all remaining primitive effects before
    // assembly coerces it. Resume/group commit must never coerce the token.
    let calls = 0,
      coercions = 0
    const assemblyError = new Error("late token coercion")
    try {
      JSON.stringify = function (...args) {
        calls++
        if (calls === 1)
          return {
            toString() {
              coercions++
              assert.equal(calls, totalPrimitives)
              throw assemblyError
            }
          }
        return Reflect.apply(stringify, JSON, args)
      }
      await assert.rejects(consume(runtimeInput({ rules }, () => [rules[1]])), (error) => error === assemblyError)
      assert.equal(calls, totalPrimitives)
      assert.equal(coercions, 1)
    } finally {
      JSON.stringify = stringify
    }
    runtimeCases++
    const trace = []
    let queued = false
    const execute = createConsumer((event) => {
      trace.push(queued ? "gate:after-microtask" : "gate:before-microtask")
      return runtimeGate(event)
    })
    await execute(
      runtimeInput({ rules }, () => {
        trace.push("rules")
        queueMicrotask(() => {
          queued = true
          trace.push("microtask")
        })
        return [rules[1]]
      })
    )
    assert.deepEqual(trace.slice(0, 3), ["rules", "gate:before-microtask", "microtask"])
    runtimeCases++
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      runtimeCases,
      requests,
      canonicalRequests,
      omissionCalls,
      rulesReads,
      rejectedReplies,
      scope:
        "Ordered Bend finalization against explicit outcome/read/omission fixtures and nested/global correlation; actual Canonical child runtime faults, cancellation and cleanup; not whole Preparation acceptance"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
