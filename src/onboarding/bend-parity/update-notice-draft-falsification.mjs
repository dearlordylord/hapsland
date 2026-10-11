import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { residentUpdateOpportunity } from "/workspace/typescript/hapsland-bend-baseline-master-e31dac83/packages/resident-transport/dist/resident/protocol.js"
const root = "/workspace/typescript/hapsland-bend-selection-ui"
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
  execFileSync("bend", [root + "/packages/agent-flow-bend/update-notice-policy/core.bend", "-o", output], {
    timeout: 5000
  })
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
          const request = {
            operation,
            mode,
            ...(host === undefined ? {} : { advicee: { host, sessionId: "fixture" } }),
            ...(updateNotice === undefined ? {} : { updateNotice })
          }
          assert.equal(
            core.opportunity(
              updateNotice === undefined ? { $: "Automatic" } : { $: "Explicit", value: updateNotice },
              { $: tag },
              host === "pi",
              mode === "ordinary"
            ),
            residentUpdateOpportunity(request)
          )
          cases++
        }
  }
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
        "finite pure policy instances; opportunity compared to actual compiled e31 protocol helper; synthetic accessed-field facts, not wire-decoder, IO, timing or universal proof"
    })
  )
} finally {
  rmSync(temp, { recursive: true, force: true })
}
