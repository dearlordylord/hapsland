import assert from "node:assert/strict"
import test from "node:test"
import { summarizeStartup } from "./measure-hook-startup-summary.mjs"
const options = { baseline: "baseline", candidate: "candidate", relativeThreshold: 0.2, absoluteThresholdMs: 5 }
const samples = (before, after) =>
  ["healthy-resident", "cold-resident"].flatMap((mode) =>
    [
      ["baseline", before],
      ["candidate", after]
    ].flatMap(([variant, values]) =>
      values.map((elapsedMs) => ({ mode, variant, elapsedMs, handlerReadyMs: elapsedMs / 2, status: "registered" }))
    )
  )
test("absolute medians and spread retain cell distinctions without tail claims", () => {
  const output = summarizeStartup(samples([10, 20, 30, 40], [10, 10, 10, 10]), options)
  assert.equal(output.length, 4)
  const completed = output.find((cell) => cell.mode === "healthy-resident" && cell.metric === "elapsedMs")
  assert.equal(completed.summaries.baseline.medianMs, 25)
  assert.equal(completed.summaries.baseline.rangeMs, 30)
  assert.equal(completed.differenceMs, -15)
  assert.equal(completed.relativeDifference, -0.6)
  assert.equal(completed.materialRegression, false)
})
test("regression requires both declared thresholds", () => {
  assert.equal(summarizeStartup(samples([10], [14]), options)[1].materialRegression, false)
  assert.equal(summarizeStartup(samples([100], [110]), options)[1].materialRegression, false)
  assert.equal(summarizeStartup(samples([10], [16]), options)[1].materialRegression, true)
})
test("retains failure count without using timeout as successful latency", () => {
  const input = samples([10], [11])
  input.push({ mode: "healthy-resident", variant: "candidate", status: "timeout", elapsedMs: 7000 })
  const output = summarizeStartup(input, options)
  assert.equal(output[1].summaries.candidate.failures, 1)
  assert.equal(output[1].summaries.candidate.medianMs, 11)
})
test("missing readiness evidence rejects a completed timing summary", () => {
  const input = samples([10], [11])
  delete input[0].handlerReadyMs
  assert.throws(() => summarizeStartup(input, options), /missing valid/)
})
