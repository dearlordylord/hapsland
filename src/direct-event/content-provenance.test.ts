import { rm } from "node:fs/promises"
import { join } from "node:path"
import { expect, it } from "vitest"
import * as Effect from "effect/Effect"
import type { DirectObservation } from "./model.ts"
import type { ConfigurationError } from "../configuration/errors.ts"
import { adaptClaudeDirectEvent, adaptCodexDirectEvent } from "./adapter.ts"
import { adaptPiDirectEvent } from "./pi-adapter.ts"
import { prepareObservation, preparedProviderInput } from "./pipeline.ts"
import { addEvent, makeReviewGitFixture, put } from "./test-fixtures.ts"
import { configuredRules } from "../test-support/default-rules.ts"
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../runtime/review-config.ts"

for (const host of ["codex", "claude", "pi"] as const) {
  it(`${host}: selected cross-file review comes from captured source, independently of conversation metadata`, async () => {
    const root = await makeReviewGitFixture()
    const declaration = "export interface Item { value: Value }"
    const support = 'export type Value = "ready" | "pending"'
    const content = `import type { Value } from './value';\n${declaration}\n`
    const path = join(root, "item.ts")
    try {
      await put(root, "item.ts", content)
      await put(root, "value.ts", support)
      let baseline: ReturnType<typeof preparedProviderInput>
      for (const secret of ["FIRST_PRIVATE_CONVERSATION", "SECOND_PRIVATE_CONVERSATION"]) {
        const transcript = await put(root, "conversation.jsonl", JSON.stringify({ prompt: secret, text: secret }))
        const privateFields = {
          prompt: secret,
          messages: [{ role: "user", content: secret }],
          transcript_path: transcript,
          session_id: secret,
          tool_use_id: secret
        }
        const observation = await Effect.runPromise<DirectObservation | undefined, ConfigurationError>(
          host === "codex"
            ? adaptCodexDirectEvent(addEvent(root, ["item.ts"], privateFields))
            : host === "claude"
              ? adaptClaudeDirectEvent({
                  ...privateFields,
                  hook_event_name: "PostToolUse",
                  cwd: root,
                  tool_name: "Write",
                  tool_input: { file_path: path, content },
                  tool_response: { filePath: path, content, originalFile: null, userModified: false }
                })
              : adaptPiDirectEvent({
                  ...privateFields,
                  cwd: root,
                  host_version: "1.0.0",
                  tool_name: "edit",
                  isError: false,
                  input: { path: "item.ts", edits: [{ oldText: "value: string", newText: "value: Value" }] },
                  details: {
                    patch: `--- item.ts\n+++ item.ts\n@@ -2,1 +2,1 @@\n-export interface Item { value: string }\n+${declaration}\n`
                  }
                })
        )
        if (observation === undefined) throw new Error(`${host}: adaptation must succeed`)
        const prepared = await Effect.runPromise(
          prepareObservation(observation, {
            controlledWriter: true,
            advicee: observation.advicee,
            settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
            rules: configuredRules
          })
        )
        const ready = prepared.outcomes.find((outcome) => outcome.status === "ready")
        if (ready?.status !== "ready") throw new Error(`${host}: preparation must yield a review`)
        const input = preparedProviderInput(ready.prepared)
        expect(input).toBeDefined()
        expect(input?.artifact.source).toBe(declaration)
        expect(input?.evidence.nodes.map((node) => node.source)).toEqual([support])
        expect(ready.prepared.input.rules.length).toBeGreaterThan(0)
        expect(JSON.stringify(input)).not.toContain(secret)
        expect(JSON.stringify(input)).not.toContain("conversation.jsonl")
        if (baseline === undefined) baseline = input
        else expect(input).toEqual(baseline)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}
