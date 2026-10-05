import assert from "node:assert/strict"
import { test } from "node:test"
import { offlineSetupAnswers } from "./offline-setup-answers.mjs"

test("approves local changes and declines paid verification on repeated setup", () => {
  const output =
    "Install these hooks? [y/N] y\r\nVerify this key with one request? This may use paid credits. [y/N] n\r\nVerify this key with one request? [y/N] "
  assert.deepEqual(offlineSetupAnswers(output), [
    { answer: "y", verification: false },
    { answer: "n", verification: true },
    { answer: "n", verification: true }
  ])
})

test("does not answer a partial prompt or lose its question across terminal chunks", () => {
  const chunks = ["Verify this", " key with one request? [y", "/N", "] "]
  let output = ""
  for (const [index, chunk] of chunks.entries()) {
    output += chunk
    assert.deepEqual(
      offlineSetupAnswers(output),
      index === chunks.length - 1 ? [{ answer: "n", verification: true }] : []
    )
  }
})
