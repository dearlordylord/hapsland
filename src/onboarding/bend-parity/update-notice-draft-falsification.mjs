import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"
import oracle from "./update-notice-opportunity.fixture.json" with { type: "json" }
const expected = new Map(oracle.cases.map((row) => [JSON.stringify(row.slice(0, 4)), row[4]]))
assert.equal(expected.size, oracle.cases.length, "oracle inputs must be unique")
assert.equal(expected.size, 144)
const compared = new Set()
const tags = {
  hello: "Hello",
  admit: "Admit",
  "admit-and-collect": "AdmitAndCollect",
  "edit-policy": "EditPolicy",
  "prompt-marker": "PromptMarker",
  "register-edit": "RegisterEdit",
  collect: "Collect",
  cleanup: "Other"
}
const temp = mkdtempSync(join(tmpdir(), "hapsland-update-notice-"))
try {
  const output = join(temp, "core.mjs")
  execFileSync(
    "bend",
    [
      fileURLToPath(new URL("../../../packages/agent-flow-bend/update-notice-policy/core.bend", import.meta.url)),
      "-o",
      output
    ],
    { timeout: 5000 }
  )
  const core = (await import(pathToFileURL(output))).default
  let cases = 0
  for (const [operation, tag] of Object.entries(tags)) {
    for (const present of [false, true])
      for (const current of [false, true]) {
        assert.equal(core.incompatible({ $: tag }, present, current), operation !== "hello" && present && !current)
        cases++
      }
    for (const updateNotice of [undefined, false, true])
      for (const host of [undefined, "pi", "codex"])
        for (const mode of ["ordinary", "stop"]) {
          const key = JSON.stringify([operation, updateNotice ?? null, host ?? null, mode])
          assert.ok(expected.has(key), "oracle must cover " + key)
          compared.add(key)
          assert.equal(
            core.opportunity(
              updateNotice === undefined ? { $: "Automatic" } : { $: "Explicit", value: updateNotice },
              { $: tag },
              host === "pi",
              mode === "ordinary"
            ),
            expected.get(key)
          )
          cases++
        }
  }
  assert.deepEqual(compared, new Set(expected.keys()), "compare exactly the original oracle inputs")
  for (const already of [false, true])
    for (const full of [false, true]) {
      assert.equal(core.grant(already, full), !already && !full)
      cases++
    }
  console.log(
    JSON.stringify({
      cases,
      result: "pass",
      scope:
        "finite pure policy instances; opportunity compared to all 144 frozen receipt-verified e31 protocol outputs; synthetic accessed-field facts, not wire-decoder, IO, timing or universal proof"
    })
  )
} finally {
  rmSync(temp, { recursive: true, force: true })
}
