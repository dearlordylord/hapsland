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
import { createPreparationFinalizationConsumer } from "./preparation-finalization.mjs"
import { nativePrepareReadyUnits } from "./native-preparation-reference.mjs"
import {
  productValue,
  fromProductValue,
  fromBinary64,
  list,
  unlist
} from "../../../../source-analysis/src/direct-event/graph-resolution/service-session.mjs"

const prefix = "../../../../source-analysis/src/direct-event/graph-resolution/Types."
const backend = "../../../../runtime-environment/src/runtime/backend/Backend."
const languagePrefix = "../../../../native-observation/src/direct-event/languages/path-language/PathLanguage."
const configuration = "../../../../runtime-inputs/src/configuration/review-backend/ReviewBackend."
const tags = (value, outward = true) => {
  if (Array.isArray(value)) return value.map((item) => tags(item, outward))
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === "$" && typeof item === "string"
          ? outward
            ? item.replace(/^Types\./, prefix)
            : item.replace(prefix, "Types.")
          : tags(item, outward)
      ])
    )
  return value
}
const wire = (value) => tags(productValue(value))
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
      return JSON.stringify(fromBinary64({ ...value.bits, $: "Types.Binary64" }))
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
    observerThrows = false
  }) => {
    const settings = {
      rules,
      ...(supplied ? { providerIdentity: supplied } : {}),
      ...(selection
        ? { configuration: { policy: { layers: [{ name: "user", document: { reviewBackend: selection } }] } } }
        : {})
    }
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
    const expectedBindings = makeBindings()
    let expected, expectedError
    try {
      expected = nativePrepareReadyUnits(units, declarations, path, {
        contract,
        graphLimits: GRAPH_LIMIT_CEILINGS,
        supportingCaptures: captures,
        observation: { root: "/workspace" },
        context: {
          settings,
          rules: expectedBindings.currentRules,
          observePreparationOmission: expectedBindings.observe
        }
      })
    } catch (error) {
      expectedError = { name: error.name, message: error.message }
    }
    const actualBindings = makeBindings()
    const invocation = { $: "Invocation", owner: BigInt(cases + 1), command: 3n }
    let step = core.initial(
      invocation,
      {
        $: "Context",
        contract,
        path,
        root: "/workspace",
        graph_limits: wire(GRAPH_LIMIT_CEILINGS),
        declarations: tags(list(declarations.map(productValue))),
        captures: tags(list([...captures].map(([path, capture]) => productValue({ path, ...capture })))),
        bundled: list([]),
        languages
      },
      tags(list(units.map(productValue)))
    )
    let previousRequest = 0n,
      savedReply,
      savedAt
    for (let turns = 0; !["Completed", "TypeError", "URIError"].includes(label(step)); turns++) {
      assert.ok(turns < 100000)
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
      assert.ok(request > previousRequest)
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
            rules: maybe(tags(list(actualBindings.currentRules().map(productValue)))),
            fallback: maybe(tags(list(rules.map(productValue))))
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
          } else if (label(nested) === "JsonPrimitive") response = { $: "Serialized", value: primitive(nested.value) }
          else {
            assert.equal(label(nested), "Digest")
            response = { $: "Hashed", value: createHash("sha256").update(nested.bytes, "utf8").digest("hex") }
          }
          break
        }
        default:
          throw new Error("Unexpected whole request " + step.$)
      }
      const reply = { $: "Reply", invocation, request, response }
      for (const wrong of [
        { ...reply, invocation: { ...invocation, command: invocation.command - 1n } },
        { ...reply, invocation: { ...invocation, owner: invocation.owner + 1n } },
        { ...reply, request: request + 1n },
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
    assert.deepEqual(actualBindings.trace, expectedBindings.trace)
    if (expectedError)
      assert.deepEqual(
        { name: label(step), message: step.message },
        { name: expectedError.name, message: expectedError.name === "URIError" ? undefined : expectedError.message }
      )
    else {
      assert.equal(label(step), "Completed")
      const actual = unlist(step.outcomes).map((value) => fromProductValue(tags(value, false)))
      assert.deepEqual(actual, expected)
      assert.equal(JSON.stringify(actual), JSON.stringify(expected))
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
          observerThrows: true
        })
        check({
          path: path.toUpperCase(),
          contract: TYPE_INPUT_CONTRACT,
          units: [unit],
          declarations: [{ artifact: root, location }],
          captures,
          supplied: { provider: "openai", model: "gpt-6-luna", destination: "supplied" }
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
    check({ path: "run.ts", contract, units: [unit, unit], declarations: [{ artifact: root, location }], captures })
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
    selection: { provider: "jev", model: undefined }
  })
  let runtimeCases = 0
  const runtimeGate = (event) => {
    const result = stepCanonical(canonical, event)
    assert.equal(result.rejection, undefined)
    assert.equal(result.outputs.length, 1)
    return result.outputs[0].gate === "admit"
  }
  const consume = createPreparationFinalizationConsumer({ machine: core, canonicalGate: runtimeGate })
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
  const settingsBefore = () => ({
    rules,
    providerIdentity: { provider: "openai", model: "gpt-6-luna", destination: "before" }
  })
  const update = (settings) => () => {
    settings.providerIdentity = { provider: "openai", model: "gpt-6-luna", destination: "after" }
    return [rules[1]]
  }
  const expectedSettings = settingsBefore()
  const expectedRuntimeInput = runtimeInput(expectedSettings, update(expectedSettings))
  const expectedUpdated = nativePrepareReadyUnits(
    expectedRuntimeInput.units,
    expectedRuntimeInput.declarations,
    expectedRuntimeInput.path,
    expectedRuntimeInput.frame
  )
  const actualSettings = settingsBefore()
  assert.deepEqual(await consume(runtimeInput(actualSettings, update(actualSettings))), expectedUpdated)
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
                reviewBackend: { provider: "cloudflare", model: "clef", accountId: "0123456789abcdef0123456789abcdef" }
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
  const failedGate = createPreparationFinalizationConsumer({
    machine: core,
    canonicalGate: () => {
      throw gateError
    }
  })
  await assert.rejects(failedGate(runtimeInput({ rules }, () => [rules[1]])), (error) => error === gateError)
  runtimeCases++
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
        "Whole ordered Bend prepareReadyUnits progression against actual native consumer, including short-circuit/read/omission chronology and nested/global correlation; universal proofs and production RenderUnits wiring remain open"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
