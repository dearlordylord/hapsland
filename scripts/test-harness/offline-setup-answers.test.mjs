import assert from "node:assert/strict"
import { test } from "node:test"
import { offlineSetupAnswers } from "./offline-setup-answers.mjs"

const confirmation = "Esc: Back | Ctrl+C/Ctrl+D: Exit\n"
const choice = "Esc: Exit | Enter: selected option | Ctrl+C/Ctrl+D: Exit\n"
const approve = { answer: "y", verification: false, navigation: false }
const decline = { answer: "n", verification: true, navigation: false }
const proceed = { answer: "", verification: false, navigation: true }

test("approves local changes and declines each paid verification without answering repaints twice", () => {
  const output =
    confirmation +
    "Apply these setup changes? [y/N]\r\nApply these setup changes? [y/N] y\r\n" +
    confirmation +
    "Verify this key with one request? [y/N] n\r\n" +
    confirmation +
    "Verify this key with one request? [y/N] "
  assert.deepEqual(offlineSetupAnswers(output), [approve, decline, decline])
})

test("does not answer a partial prompt or lose its question across terminal chunks", () => {
  const chunks = [confirmation, "Verify this", " key with one request? [y", "/N", "] "]
  let output = ""
  for (const [index, chunk] of chunks.entries()) {
    output += chunk
    assert.deepEqual(offlineSetupAnswers(output), index === chunks.length - 1 ? [decline] : [])
  }
})

test("menu navigation remains separate from grouped and per-client mutation consent", () => {
  const update =
    choice +
    "Review all update previews\nContinue to grouped approval\n" +
    confirmation +
    "Apply these changes to claude, codex profiles? [y/N] "
  const repair =
    choice +
    "Review claude repair preview\nContinue to approval\n" +
    confirmation +
    "Apply repair to claude? [y/N]\n" +
    choice +
    "Review codex repair preview\nContinue to approval\n" +
    confirmation +
    "Apply repair to codex? [y/N] "
  assert.deepEqual(offlineSetupAnswers(update), [proceed, approve])
  assert.deepEqual(offlineSetupAnswers(repair), [proceed, approve, proceed, approve])
})
