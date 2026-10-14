import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { compileRule } from "@hapsland/review-definition/rules/compiler"
import { semanticIdentity } from "@hapsland/review-definition/direct-event/model"
import { TYPE_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { REVIEW_PROVIDERS } from "@hapsland/runtime-environment/runtime/backend"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import { initialCanonical, stepCanonical } from "@hapsland/canonical-policy/canonical/adapter"
import { nativePrepareReadyUnits } from "./verification/native-preparation.ts"
import {
  productValue,
  fromProductValue,
  fromBinary64,
  list,
  unlist
} from "@hapsland/source-artifacts/direct-event/value/codec"

const backend = "../../../../runtime-environment/src/runtime/backend/Backend."
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
const catalog = list(
  Object.values(REVIEW_PROVIDERS).map((value) => ({
    $: backend + "Declaration",
    id: value.id,
    default_model: maybe(value.defaultModel),
    destination: value.destination
  }))
)
const config = (selection) =>
  maybe(
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
          fields: list(Object.entries(selection).map(([name, value]) => ({ $: backend + "Field", name, value })))
        })
      }
    ])
  )
const rule = compileRule(
  {
    version: 1,
    id: "full-input",
    question: "Is this relevant?",
    criteria: { false: "No", true: "Yes" },
    message: "Relevant",
    inputs: [{ languages: ["typescript", "rust", "bend", "python", "go"], kind: "type", requires: [] }]
  },
  "full-input-source"
)
const temporary = mkdtempSync(join(tmpdir(), "hapsland-frozen-input-"))
try {
  const modules = {}
  for (const name of ["UnitEvidence", "RuleFinalization", "FrozenInput"]) {
    const output = join(temporary, name + ".mjs")
    execFileSync(
      "timeout",
      ["5s", "taskset", "-c", "10", "bend", join(import.meta.dirname, name + ".bend"), "-o", output],
      { timeout: 6000 }
    )
    modules[name] = (await import(pathToFileURL(output))).default
  }
  const canonical = initialCanonical({ globalItems: 1, globalBytes: 1, partitionItems: 1, partitionBytes: 1 })
  let cases = 0,
    engineRequests = 0,
    canonicalRequests = 0,
    rejectedReplies = 0
  for (const [language, extension] of [
    ["typescript", "ts"],
    ["rust", "rs"],
    ["bend", "bend"],
    ["python", "py"],
    ["go", "go"]
  ])
    for (const partial of [false, true])
      for (const provider of Object.values(REVIEW_PROVIDERS))
        for (const configured of [false, true]) {
          const path = "root." + extension
          const artifact = {
            id: "root",
            kind: "interface",
            name: "Root😀",
            source: "source\n",
            sourceHash: "hash",
            path
          }
          const unit = {
            root: {
              artifact,
              references: partial
                ? [
                    {
                      kind: "omitted",
                      site: { symbol: "missing" },
                      target: { kind: "unresolved", symbol: "missing" },
                      reason: "unresolved"
                    }
                  ]
                : []
            }
          }
          const location = { start: { line: 1, column: 1 }, end: { line: 1, column: 8 } }
          const declarations = [{ artifact, location }]
          const captures = new Map([[path, { contentHash: "hash:" + path, byteLength: 42 }]])
          const selected = {
            provider: provider.id,
            ...(provider.id === "jev" ? {} : { model: provider.defaultModel }),
            ...(provider.id === "cloudflare" ? { accountId: "0123456789abcdef0123456789abcdef" } : {})
          }
          const supplied = { provider: "openai", model: "gpt-6-luna", destination: "supplied" }
          const settings = {
            rules: [rule],
            providerIdentity: supplied,
            ...(configured
              ? { configuration: { policy: { layers: [{ name: "user", document: { reviewBackend: selected } }] } } }
              : {})
          }
          const expected = nativePrepareReadyUnits([unit], declarations, path, {
            contract: TYPE_INPUT_CONTRACT,
            graphLimits: GRAPH_LIMIT_CEILINGS,
            supportingCaptures: captures,
            observation: { root: "/workspace" },
            context: { settings }
          })
          assert.equal(expected.length, 1)
          let evidence = modules.UnitEvidence.initial(wire(unit))
          while (label(evidence) === "Continue") evidence = modules.UnitEvidence.advance(evidence.state, list([]))
          const metadata = modules.UnitEvidence.metadata(
            evidence,
            TYPE_INPUT_CONTRACT,
            list(declarations.map(productValue)),
            list([...captures].map(([path, capture]) => productValue({ path, ...capture }))),
            wire(unit)
          )
          assert.equal(label(metadata), "EvidenceReady")
          const invocation = BigInt(cases + 1)
          let rules = modules.RuleFinalization.initial(invocation, list([productValue(rule)]), {
            $: "Context",
            path: maybe(path),
            language,
            kind: "type",
            contract: TYPE_INPUT_CONTRACT,
            complete: true,
            available: list([
              productValue("root-declaration"),
              ...(!partial ? [productValue("resolved-outbound-types")] : [])
            ])
          })
          while (label(rules) !== "Completed") {
            if (label(rules) === "Continue") rules = modules.RuleFinalization.advance(rules.state)
            else if (label(rules) === "GlobContinue")
              rules = modules.RuleFinalization.glob_advance(rules.work, rules.excluding, rules.patterns, rules.path)
            else if (label(rules) === "Engine") {
              const compile = label(rules.query) === "AnyCompile"
              let valid = true,
                matched = false
              try {
                const expression = new RegExp(text(rules.query.expression))
                if (!compile) matched = expression.test(text(rules.query.candidate))
              } catch {
                valid = false
              }
              rules = modules.RuleFinalization.resume(rules, {
                $: "EngineResult",
                invocation,
                request: rules.work.state.request,
                result: compile ? { $: "Compiled", valid } : { $: "Tested", valid, matched }
              })
            } else {
              const result = stepCanonical(canonical, {
                kind: "ruleApplicabilityCheck",
                consent: rules.consent,
                complete: rules.complete,
                target: {
                  TypeShape: "typeShape",
                  FunctionTarget: "functionTarget",
                  UnsupportedTarget: "unsupportedTarget"
                }[label(rules.target)],
                globalIncluded: rules.global_included,
                globalExcluded: rules.global_excluded,
                packEnabled: rules.pack_enabled,
                ruleEnabled: rules.rule_enabled,
                ruleIncluded: rules.rule_included,
                ruleExcluded: rules.rule_excluded,
                targetDeclared: rules.target_declared,
                capabilitiesAvailable: rules.capabilities_available,
                sourceRung: Number(rules.source_rung),
                minimumRung: Number(rules.minimum_rung)
              })
              assert.equal(result.rejection, undefined)
              assert.equal(result.outputs.length, 1)
              rules = modules.RuleFinalization.resume(rules, {
                $: "GateReply",
                invocation,
                request: rules.work.state.request,
                admit: result.outputs[0].gate === "admit"
              })
              canonicalRequests++
            }
          }
          let step = modules.FrozenInput.initial(
            invocation,
            {
              $: "Frame",
              contract: TYPE_INPUT_CONTRACT,
              path,
              graph_limits: wire(GRAPH_LIMIT_CEILINGS),
              unit: wire(unit),
              root_location: metadata.root_location,
              fingerprints: metadata.fingerprints,
              partial: metadata.partial,
              rules: rules.frozen
            },
            configured ? config(selected) : { $: "None" },
            maybe({ $: backend + "Identity", ...supplied }),
            catalog
          )
          let previousRequest = 0n
          for (let turns = 0; label(step) !== "Completed"; turns++) {
            assert.ok(turns < 10000)
            if (label(step) === "Continue") {
              step = modules.FrozenInput.advance(step.state)
              continue
            }
            const { invocation: currentInvocation, request } = step.state
            assert.ok(request > previousRequest)
            previousRequest = request
            const kind = label(step)
            let reply
            if (kind === "EncodeComponent")
              reply = { $: "Encoded", invocation: currentInvocation, request, value: encodeURIComponent(step.value) }
            else if (kind === "JsonPrimitive")
              reply = { $: "Serialized", invocation: currentInvocation, request, value: primitive(step.value) }
            else {
              assert.equal(kind, "Digest")
              reply = {
                $: "Hashed",
                invocation: currentInvocation,
                request,
                value: createHash("sha256").update(step.bytes, "utf8").digest("hex")
              }
            }
            for (const wrong of [
              { ...reply, invocation: currentInvocation + 1n },
              { ...reply, request: request + 1n },
              { $: kind === "Digest" ? "Serialized" : "Hashed", invocation: currentInvocation, request, value: "wrong" }
            ]) {
              assert.equal(label(modules.FrozenInput.resume(step, wrong)), "InvalidReply")
              rejectedReplies++
            }
            step = modules.FrozenInput.resume(step, reply)
            engineRequests++
          }
          const input = fromProductValue(step.input)
          assert.deepEqual(input, expected[0].prepared.input)
          assert.deepEqual(Object.keys(input), Object.keys(expected[0].prepared.input))
          assert.equal(JSON.stringify(input), JSON.stringify(expected[0].prepared.input))
          assert.equal(step.identity, expected[0].prepared.identity)
          assert.equal(step.identity, semanticIdentity(input))
          cases++
        }
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      engineRequests,
      canonicalRequests,
      rejectedReplies,
      scope:
        "Compiled evidence/rules/provider/frozen-input/identity stages versus full native ready consumer; stage composition remains in test harness, whole production lifecycle and laws are open"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
