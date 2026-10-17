import assert from "node:assert/strict"
import { it } from "node:test"
import { join } from "node:path"
import * as Effect from "effect/Effect"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import { adaptClaudeDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"
import { monotonicNow } from "@hapsland/resident-transport/resident/hook-clock"
import { makeResidentResources } from "../../../../../dist/resident/composition/resources.js"
import { makeResidentAdmission } from "../../../../../dist/resident/review-work/admission.js"
import { makeDispatcher } from "../../../../../dist/resident/state/dispatch.js"
import { recipientPartition } from "../../../../../dist/resident/recipient/identity.js"

it("a real enqueue refusal releases its reservation without pinning a rejected edit", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "haps-admission-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  execFileSync("git", ["init", "-q", root])
  const path = join(root, "value.ts"),
    userConfigPath = join(root, "user.jsonc")
  const content = "type Value = number\n"
  await Promise.all([
    writeFile(path, content),
    writeFile(userConfigPath, JSON.stringify({ version: 1 })),
    writeFile(join(root, ".hapsland.jsonc"), JSON.stringify({ version: 1, rules: [] }))
  ])
  const observation = await Effect.runPromise(
    adaptClaudeDirectEvent({
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      cwd: root,
      session_id: "session",
      tool_use_id: "admission",
      tool_input: { file_path: path, content },
      tool_response: { filePath: path, content, originalFile: null, userModified: false }
    })
  )
  assert.notEqual(observation, undefined)
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const resources = yield* makeResidentResources(residentPaths(join(root, "runtime")), monotonicNow, {})
        const dispatcher = yield* makeDispatcher(
          resources.residentLedger,
          (job) => ({ operation: job.canonicalObservationId, round: job.canonicalRound }),
          () => Effect.die(new Error("a refused ingress must not execute"))
        )
        yield* dispatcher.close()
        const admission = makeResidentAdmission({
          ...resources,
          residentDispatcher: dispatcher,
          residentOptionalUserConfig: (dispatch) => dispatch.userConfigPath,
          residentRecordAnalytics: () => Effect.void,
          residentExpirePending: () => Effect.void,
          residentPruneNoticeCooldowns: () => Effect.void
        })
        const response = yield* admission.admit(
          observation,
          { statePath: join(root, "state"), userConfigPath, credential: null, controlled: { answers: {} } },
          true
        )
        assert.equal(response.status, "rejected-capacity")
        assert.deepEqual(yield* dispatcher.snapshot(), { queued: 0, running: 0 })
        const projection = yield* resources.residentLedger.canonicalProjection()
        const capacity = yield* resources.residentLedger.snapshot()
        const round = yield* resources.residentLedger.rounds.get(recipientPartition(observation.advicee))
        assert.equal(capacity.items, 0, "refused admission must release its observation reservation")
        assert.equal(projection.work.length, 0, "refused admission must retain no Canonical observation")
        assert.deepEqual(
          { pinned: round !== undefined, activeAdmission: projection.admissions.some((item) => item.active) },
          { pinned: false, activeAdmission: false },
          "a rejected edit must publish neither a native pin nor a logical admission round"
        )
      })
    )
  )
})
