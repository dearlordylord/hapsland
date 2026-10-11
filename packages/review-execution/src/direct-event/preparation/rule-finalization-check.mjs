import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { compileRule, selectApplicableRules } from "@hapsland/review-definition/rules/compiler"
import { freezeRules } from "@hapsland/review-definition/direct-event/model"
import { TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { initialCanonical, stepCanonical } from "@hapsland/canonical-policy/canonical/adapter"
import {
  productValue,
  fromProductValue,
  list,
  unlist
} from "../../../../source-analysis/src/direct-event/graph-resolution/service-session.mjs"

const prefix = "../../../../source-analysis/src/direct-event/graph-resolution/Types."
const tags = (value, outward) => {
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
const label = (value) => value.$.split(".").at(-1)
const text = (units) => {
  const values = unlist(units)
  let result = ""
  for (let index = 0; index < values.length; index += 1024)
    result += String.fromCharCode(...values.slice(index, index + 1024))
  return result
}
const languages = ["typescript", "rust", "bend", "python", "go"]
const applicability = [
  undefined,
  {},
  { includes: [] },
  { excludes: [] },
  { includes: ["**"] },
  { includes: ["**/*.{ts,go,rs,py,bend}"] },
  { excludes: ["**/.*"] },
  { includes: ["[", "**"], excludes: ["**/private/**"] }
]
const rules = []
for (const kind of ["type", "function"])
  for (const required of [[], [kind === "type" ? "resolved-outbound-types" : "resolved-local-calls"]])
    for (const paths of applicability) {
      const compiled = compileRule(
        {
          version: 1,
          id: "rule-" + rules.length,
          question: "Does this match?",
          criteria: { false: "No", true: "Yes" },
          message: "Matched unit",
          inputs: [{ languages: kind === "type" ? languages : ["typescript"], kind, requires: required }]
        },
        "source-" + rules.length
      )
      // Include untrusted matcher strings in the compiled-shape extension too;
      // the native matching helper is total even when decoding would refuse.
      rules.push({ ...compiled, ...(paths === undefined ? {} : { applicability: paths }) })
    }
const snapshots = [
  rules,
  [...rules]
    .reverse()
    .map((rule, index) => ({ ...rule, enabled: index % 3 !== 0, ...(index % 4 === 0 ? { languages: ["go"] } : {}) }))
]
const paths = [
  undefined,
  "root.ts",
  "root.go",
  "root.py",
  "root.rs",
  "root.bend",
  ".root.ts",
  "x/private/a.ts",
  "😀/a.ts",
  "../bad"
]
const canonical = initialCanonical({ globalItems: 1, globalBytes: 1, partitionItems: 1, partitionBytes: 1 })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-ordered-rule-"))
try {
  const output = join(temporary, "rules.mjs")
  execFileSync(
    "timeout",
    ["5s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "RuleFinalization.bend"), "-o", output],
    { timeout: 6000 }
  )
  const core = (await import(pathToFileURL(output))).default
  let cases = 0
  let engineRequests = 0
  let canonicalRequests = 0
  let rejectedReplies = 0
  let rejectedEngineReplies = 0
  let rejectedGateReplies = 0
  let rejectedPhaseReplies = 0
  for (const snapshot of snapshots)
    for (const language of languages)
      for (const kind of ["type", "function"])
        for (const contract of [TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT, "unsupported"])
          for (const complete of [true, false])
            for (const path of paths) {
              const capabilities =
                contract === TYPE_INPUT_CONTRACT
                  ? ["root-declaration"]
                  : contract === FUNCTION_INPUT_CONTRACT
                    ? ["signature", "body"]
                    : []
              const target = {
                language,
                artifactKind: kind === "type" ? "typeShape" : "function",
                inputContract: contract
              }
              const expected = freezeRules(
                selectApplicableRules(snapshot, "source A", path, { ...target, complete, capabilities }),
                target
              )
              assert.deepEqual(
                expected,
                freezeRules(
                  selectApplicableRules(snapshot, "source B", path, { ...target, complete, capabilities }),
                  target
                )
              )
              let step = core.initial(7n, tags(list(snapshot.map(productValue)), true), {
                $: "Context",
                path: path === undefined ? { $: "None" } : { $: "Some", value: path },
                language,
                kind,
                contract,
                complete,
                available: tags(list(capabilities.map(productValue)), true)
              })
              let previousRequest = 0n
              for (let turns = 0; label(step) !== "Completed"; turns++) {
                assert.ok(turns < 100000)
                if (label(step) === "Continue") step = core.advance(step.state)
                else if (label(step) === "GlobContinue")
                  step = core.glob_advance(step.work, step.excluding, step.patterns, step.path)
                else {
                  const request = step.work.state.request
                  assert.ok(request > previousRequest)
                  previousRequest = request
                  if (label(step) === "Engine") {
                    let valid = true
                    let matched = false
                    const compile = label(step.query) === "AnyCompile"
                    try {
                      const expression = new RegExp(text(step.query.expression))
                      if (!compile) matched = expression.test(text(step.query.candidate))
                    } catch {
                      valid = false
                    }
                    const reply = compile ? { $: "Compiled", valid } : { $: "Tested", valid, matched }
                    if (rejectedEngineReplies < 20) {
                      assert.equal(
                        label(core.engine_returned(8n, request, step.work, step.excluding, step.query, reply)),
                        "InvalidReply"
                      )
                      assert.equal(
                        label(core.engine_returned(7n, request - 1n, step.work, step.excluding, step.query, reply)),
                        "InvalidReply"
                      )
                      assert.equal(
                        label(
                          core.engine_returned(
                            7n,
                            request,
                            step.work,
                            step.excluding,
                            step.query,
                            compile ? { $: "Tested", valid: true, matched: true } : { $: "Compiled", valid: true }
                          )
                        ),
                        "InvalidReply"
                      )
                      rejectedReplies += 3
                      rejectedEngineReplies += 3
                    }
                    assert.equal(
                      label(core.resume(step, { $: "GateReply", invocation: 7n, request, admit: true })),
                      "InvalidReply"
                    )
                    rejectedPhaseReplies++
                    step = core.resume(step, { $: "EngineResult", invocation: 7n, request, result: reply })
                    engineRequests++
                  } else {
                    assert.equal(label(step), "CanonicalGate")
                    const targetKind = {
                      TypeShape: "typeShape",
                      FunctionTarget: "functionTarget",
                      UnsupportedTarget: "unsupportedTarget"
                    }[label(step.target)]
                    const result = stepCanonical(canonical, {
                      kind: "ruleApplicabilityCheck",
                      consent: step.consent,
                      complete: step.complete,
                      target: targetKind,
                      globalIncluded: step.global_included,
                      globalExcluded: step.global_excluded,
                      packEnabled: step.pack_enabled,
                      ruleEnabled: step.rule_enabled,
                      ruleIncluded: step.rule_included,
                      ruleExcluded: step.rule_excluded,
                      targetDeclared: step.target_declared,
                      capabilitiesAvailable: step.capabilities_available,
                      sourceRung: Number(step.source_rung),
                      minimumRung: Number(step.minimum_rung)
                    })
                    assert.equal(result.rejection, undefined)
                    assert.deepEqual(result.state, canonical)
                    assert.equal(result.outputs.length, 1)
                    assert.equal(result.outputs[0].kind, "ruleGate")
                    if (rejectedGateReplies < 20) {
                      assert.equal(label(core.gate_returned(8n, request, true, step.work)), "InvalidReply")
                      assert.equal(label(core.gate_returned(7n, request - 1n, true, step.work)), "InvalidReply")
                      rejectedReplies += 2
                      rejectedGateReplies += 2
                    }
                    assert.equal(
                      label(
                        core.resume(step, {
                          $: "EngineResult",
                          invocation: 7n,
                          request,
                          result: { $: "Compiled", valid: true }
                        })
                      ),
                      "InvalidReply"
                    )
                    rejectedPhaseReplies++
                    step = core.resume(step, {
                      $: "GateReply",
                      invocation: 7n,
                      request,
                      admit: result.outputs[0].gate === "admit"
                    })
                    canonicalRequests++
                  }
                }
              }
              assert.deepEqual(
                unlist(step.frozen).map((value) => fromProductValue(tags(value, false))),
                expected
              )
              cases++
            }
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      engineRequests,
      canonicalRequests,
      rejectedReplies,
      rejectedEngineReplies,
      rejectedGateReplies,
      rejectedPhaseReplies,
      scope:
        "Compiled whole ordered rule block: Bend glob/snapshot, actual Canonical admission, frozen rules and reply correlation; not whole unit finalization proof or production adoption"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
