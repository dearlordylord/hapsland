// THROWAWAY: independent behavioral witnesses, not controller-equality assertions.
import assert from "node:assert/strict"
import { Effect } from "effect"
import { runRules } from "./rules-flow.ts"
import { createRulesOwner } from "./rules-owner.ts"
import { initialRules, reduceRules, rulesCommand, type RuleAction, type RulesEvent } from "./rules-model.ts"
import { scriptedInteraction, type ScriptStep } from "./scripted-interaction.ts"
let cases = 0
const choose = (index: number): ScriptStep => ({ kind: "choose", index })
const confirm = (line: string): ScriptStep => ({ kind: "confirm", line })
async function replay(
  steps: ScriptStep[],
  action: RuleAction = "create",
  outcome: "applied" | "partial" | "failed" | "stale" = "applied"
) {
  const script = scriptedInteraction(steps)
  const owner = createRulesOwner(outcome)
  const model = await Effect.runPromise(runRules(script.interaction, owner, action))
  assert.equal(script.remaining(), 0)
  assert(!script.transcript.join("").includes("SYNTHETIC_ONLY_DO_NOT_LOG"))
  cases++
  return { model, writes: owner.writes(), text: script.transcript.join("") }
}
for (const action of ["create", "connect", "enable", "disable"] as const) {
  for (const scope of [0, 1]) {
    const { model, writes, text } = await replay([choose(scope), choose(0), confirm(" y ")], action)
    assert.equal(model.outcome, "applied")
    assert.equal(model.plan?.scope, scope ? "personal" : "project")
    assert.equal(model.plan?.enabled, action !== "disable")
    assert.equal(writes, 1)
    assert(text.includes(`Action: ${action}`))
    assert.equal(text.includes("This will connect the rule."), action === "create" || action === "connect")
  }
}
for (const line of ["", "yes", "n", "approve"]) {
  const result = await replay([choose(0), choose(0), confirm(line)])
  assert.equal(result.model.outcome, "declined")
  assert.equal(result.writes, 0)
}
const back = await replay([
  choose(0),
  { kind: "back" },
  choose(1),
  choose(0),
  { kind: "back" },
  choose(0),
  confirm("Y")
])
assert.equal(back.model.scope, "personal")
assert.equal(back.writes, 1)
const changed = await replay([choose(0), choose(0), confirm("y"), choose(0), confirm("y")], "enable", "stale")
assert.equal(changed.writes, 1)
assert(changed.text.includes("No write was made; review the fresh preview"))
for (const ending of ["exit", "eof"] as const) {
  for (const prefix of [[], [choose(0)], [choose(0), choose(0)]]) {
    const result = await replay([...prefix, { kind: ending }])
    assert.equal(result.model.phase, "Cancelled")
    assert.equal(result.writes, 0)
  }
}
for (const outcome of ["failed", "partial"] as const) {
  const result = await replay([choose(0), choose(0), confirm("y")], "disable", outcome)
  assert.equal(result.model.outcome, outcome)
  assert.equal(result.writes, outcome === "partial" ? 1 : 0)
  if (outcome === "partial") assert(result.text.includes("storage may have changed"))
}
// Independent pure-transition witnesses for stale identities and owner authorization.
const owner = createRulesOwner()
let model = initialRules()
const send = (action: RulesEvent["action"], revision = model.revision) => {
  model = reduceRules(model, { revision, action })
  return model
}
send({ kind: "scope", scope: "project" })
assert.equal(rulesCommand(model)?.kind, "preview", "scope selection cannot write")
const plan = await Effect.runPromise(owner.preview("create", "project"))
const pending = model
assert.deepEqual(send({ kind: "previewed", commandId: 999, plan }), pending)
send({ kind: "previewed", commandId: model.revision, plan })
send({ kind: "continue" })
const approval = model
assert.deepEqual(send({ kind: "approve", yes: true, digest: "wrong" }), approval)
assert.deepEqual(send({ kind: "approve", yes: true, digest: plan.digest }, model.revision - 1), approval)
assert.equal(rulesCommand(model), undefined)
send({ kind: "back" })
const previewBeforeWrongInput = model
assert.deepEqual(
  send({ kind: "approve", yes: true, digest: plan.digest }),
  previewBeforeWrongInput,
  "wrong-screen approval ignored"
)
send({ kind: "continue" })
send({ kind: "approve", yes: true, digest: plan.digest })
const applying = model
assert.deepEqual(send({ kind: "back" }), applying)
assert.deepEqual(send({ kind: "exit" }), applying)
assert.deepEqual(send({ kind: "observed", commandId: 999, outcome: "applied" }), applying)
owner.change()
assert.equal(await Effect.runPromise(owner.apply(plan)), "stale")
assert.equal(owner.writes(), 0)
const fresh = await Effect.runPromise(owner.preview("create", "project"))
assert.equal(await Effect.runPromise(owner.apply(fresh)), "applied")
assert.equal(await Effect.runPromise(owner.apply(fresh)), "applied")
assert.equal(owner.writes(), 1)
console.log(
  JSON.stringify({
    scriptedCases: cases,
    staleAuthorization: "passed",
    ownerDigestRecheck: "passed",
    replayNoRepeatedWrite: "passed",
    realWrites: 0,
    credentialReads: 0,
    providerRequests: 0
  })
)
