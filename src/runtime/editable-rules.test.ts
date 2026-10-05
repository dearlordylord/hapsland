import { execFileSync } from "../../scripts/test-harness/process.mjs"
import { reviewCodexDirectEvent } from "../direct-event/pipeline.ts"
import { addEvent, advicee } from "../direct-event/test-fixtures.ts"
import { controlledDecisionModelLayer } from "../test-support/controlled-decision-model.ts"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { afterEach, expect, it } from "vitest"
import { loadReviewSettings } from "./review-config.ts"
import { deriveAdvice } from "../policy/rules.ts"
import { Probability } from "../domain/contracts.ts"

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
  const document = JSON.parse(readFileSync(new URL("../rules/defaults/hapsland.json", import.meta.url), "utf8"))
  writeFileSync(path, JSON.stringify(document))
  expect((await Effect.runPromise(loadReviewSettings(root, { userConfigPath }))).rules).toEqual([])
  writeFileSync(userConfigPath, JSON.stringify({ version: 1, packs: [path] }))
  const initial = await Effect.runPromise(loadReviewSettings(root, { userConfigPath }))
  expect(initial.rules).toHaveLength(9)
  document.rules = [
    { ...document.rules[0], question: "Is the edited concern present?", message: "Authored feedback", threshold: 0.4 }
  ]
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
  document.rules = []
  writeFileSync(path, JSON.stringify(document))
  expect((await Effect.runPromise(loadReviewSettings(root, { userConfigPath }))).rules).toEqual([])
  const empty = await Effect.runPromise(loadReviewSettings(root, { userConfigPath }))
  const noReview = await Effect.runPromise(
    reviewCodexDirectEvent(addEvent(root), { settings: empty, advicee: advicee(), controlledWriter: true }).pipe(
      Effect.provide(backend)
    )
  )
  expect(noReview.status).toBe("no-advice")
  expect(calls).toBe(1)
  rmSync(path)
  const missing = await Effect.runPromise(loadReviewSettings(root, { userConfigPath }).pipe(Effect.result))
  expect(missing).toMatchObject({ _tag: "Failure", failure: { reason: "rule-pack file does not exist" } })
})
