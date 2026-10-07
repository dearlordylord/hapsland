import { execFileSync } from "../../scripts/test-harness/process.mjs"
import { reviewCodexDirectEvent } from "@hapsland/review-execution/direct-event/pipeline"
import { addEvent, advicee } from "@hapsland/build-tooling/test-support/test-fixtures"
import { controlledDecisionModelLayer } from "@hapsland/review-execution/review-execution/controlled-decision-model"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { afterEach, expect, it } from "vitest"
import { loadReviewSettings } from "@hapsland/review-definition/runtime/review-config"
import { deriveAdvice } from "@hapsland/review-execution/policy/rules"
import { SHIPPED_DEFAULT_RULES } from "@hapsland/review-definition/rules/shipped"
import { Probability } from "@hapsland/review-definition/domain/contracts"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

it("loads only explicitly connected JSON and follows authored edits and removal", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-editable-rules-"))
  roots.push(root)
  execFileSync("git", ["init", "--quiet", root])
  writeFileSync(join(root, "type.ts"), "type OrderCount = number")
  const userConfigPath = join(root, "config.jsonc")
  const path = join(root, "hapsland.json")
  const shipped = SHIPPED_DEFAULT_RULES[0]
  if (shipped === undefined) throw new Error("missing default fixture")
  const { source: _source, origin: _origin, definitionDigest: _digest, ...original } = shipped
  let document = original
  writeFileSync(path, JSON.stringify(document))
  expect((await Effect.runPromise(loadReviewSettings(root, { userConfigPath }))).rules).toEqual([])
  writeFileSync(userConfigPath, JSON.stringify({ version: 1, rules: [path] }))
  const initial = await Effect.runPromise(loadReviewSettings(root, { userConfigPath }))
  expect(initial.rules).toHaveLength(1)
  document = { ...document, question: "Is the edited concern present?", message: "Authored feedback", threshold: 0.4 }
  writeFileSync(path, JSON.stringify(document))
  const edited = await Effect.runPromise(loadReviewSettings(root, { userConfigPath }))
  expect(edited.rules).toHaveLength(1)
  expect(edited.rules?.[0]?.decision.instructions).toBe("Is the edited concern present?")
  const rule = edited.rules?.[0]
  if (rule === undefined) throw new Error("expected authored rule")
  expect(
    deriveAdvice([rule], { [rule.id]: Probability.make(0.5) }, { path: "example.ts", contentHash: "abc" }, 5)[0]
      ?.message
  ).toBe("Authored feedback")
  let calls = 0
  const backend = controlledDecisionModelLayer({
    answers: { [rule.id]: { _tag: "Probability", probability: 0.5 } },
    inspectRequest: (request) =>
      Effect.sync(() => {
        calls += 1
        expect(Object.values(request.decisions).map((decision) => decision.instructions)).toEqual([
          "Is the edited concern present?"
        ])
      })
  })
  const reviewed = await Effect.runPromise(
    reviewCodexDirectEvent(addEvent(root), { settings: edited, advicee: advicee(), controlledWriter: true }).pipe(
      Effect.provide(backend)
    )
  )
  expect(reviewed).toMatchObject({ status: "ready", findings: [{ message: "Authored feedback" }] })
  expect(calls).toBe(1)
  writeFileSync(userConfigPath, JSON.stringify({ version: 1, rules: [{ path, enabled: false }] }))
  expect((await Effect.runPromise(loadReviewSettings(root, { userConfigPath }))).rules).toEqual([])
  const empty = await Effect.runPromise(loadReviewSettings(root, { userConfigPath }))
  const noReview = await Effect.runPromise(
    reviewCodexDirectEvent(addEvent(root), { settings: empty, advicee: advicee(), controlledWriter: true }).pipe(
      Effect.provide(backend)
    )
  )
  expect(noReview.status).toBe("no-advice")
  expect(calls).toBe(1)
  writeFileSync(userConfigPath, JSON.stringify({ version: 1, rules: [path] }))
  rmSync(path)
  const missing = await Effect.runPromise(loadReviewSettings(root, { userConfigPath }).pipe(Effect.result))
  expect(missing).toMatchObject({ _tag: "Failure", failure: { reason: expect.stringContaining("does not exist") } })
})
