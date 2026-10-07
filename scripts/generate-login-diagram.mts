import assert from "node:assert/strict"
import { Effect } from "effect"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import {
  LoginOwnerService,
  runLoginConversation,
  type LoginTransition
} from "@hapsland/administration/credentials/login-conversation"
import { makeInitialCredentialState } from "@hapsland/runtime-inputs/credentials/state"
import { scriptedInteraction, type ScriptStep } from "./test-support/scripted-interaction.ts"

export const generateLoginDiagram = Effect.gen(function* () {
  const key = "controlled-private-replay-key"
  const edges = new Set<string>()
  const rows: string[] = []
  const scenarios = ["stored", "declined", "back", "cancelled", "blocked", "stale", "busy", "indeterminate"] as const
  for (const name of scenarios) {
    const steps: ScriptStep[] =
      name === "blocked"
        ? [{ kind: "choose", index: 1 }, { kind: "exit" }]
        : [
            { kind: "choose", index: 0 },
            ...(name === "cancelled"
              ? [{ kind: "eof" } as const]
              : [
                  { kind: "hidden", value: key } as const,
                  ...(name === "back"
                    ? [{ kind: "back" } as const, { kind: "exit" } as const]
                    : [{ kind: "confirm", line: name === "declined" ? "" : "y" } as const]),
                  ...(name === "stale"
                    ? [{ kind: "hidden", value: key } as const, { kind: "confirm", line: "y" } as const]
                    : [])
                ])
          ]
    const script = scriptedInteraction(steps)
    const transitions: LoginTransition[] = []
    let prepares = 0
    let saves = 0
    const result = yield* runLoginConversation({
      observe: (transition) =>
        Effect.sync(() => {
          transitions.push(transition)
        })
    }).pipe(
      Effect.provideService(InteractionService, script.interaction),
      Effect.provideService(LoginOwnerService, {
        prepare: (destination) =>
          Effect.sync(() => ({
            id: `proposal-${++prepares}`,
            plan: {
              destination,
              target: destination === "user" ? "/fixture/user/.env" : "/fixture/repo/.env.local",
              scope: "fixture",
              storage: "Local plaintext file"
            },
            availability: name === "blocked" ? ("blocked" as const) : ("available" as const),
            reason: name === "blocked" ? "Project target is not Git-ignored" : undefined,
            activeSource: "environment" as const,
            activeFile: undefined
          })),
        save: (id, value) =>
          Effect.sync(() => {
            assert.equal(id, `proposal-${prepares}`)
            assert.equal(value, key)
            saves++
            return {
              status:
                name === "stale" && saves === 1
                  ? ("stale" as const)
                  : name === "busy"
                    ? ("busy" as const)
                    : name === "indeterminate"
                      ? ("indeterminate" as const)
                      : ("stored" as const),
              state: { ...makeInitialCredentialState(), generation: 7, savedUseSuspended: name === "indeterminate" },
              stateLock: "acquired" as const
            }
          }),
        active: () => Effect.succeed({ status: "present", source: "environment", generation: 7 }),
        discard: () => Effect.void
      })
    )
    const cancelled = ["declined", "back", "cancelled", "blocked"].includes(name)
    assert.equal(saves, cancelled ? 0 : name === "stale" ? 2 : 1)
    assert.equal(result.phase, cancelled ? "Cancelled" : "Done")
    if (!cancelled) {
      assert.equal(result.storage?.status, name === "busy" || name === "indeterminate" ? name : "stored")
      assert.equal(result.active?.source, "environment")
    }
    assert.equal(script.remaining(), 0)
    assert(!JSON.stringify({ transitions, result, transcript: script.transcript }).includes(key))
    for (const { before, event, after } of transitions) {
      const label = event.action.kind === "observed" ? `observed ${event.action.storage.status}` : event.action.kind
      edges.add(`  ${before.phase} -->|"${label}"| ${after.phase}`)
      rows.push(`| ${name} | ${before.revision} | ${label} | ${after.revision} |`)
    }
  }
  return `# Login interaction

**Purpose:** Show production credential destination selection and approved saving.
**Status:** Maintained generated diagram.
**Authority:** Implementation and controlled validation evidence for #248; the issue and accepted credential contracts own requirements.
**Expected use:** Inspect the named scenarios and run \`npm run interaction:diagrams:check\` for freshness.
**Lifecycle:** Regenerate with production reducer, interpreter or replay changes; review when credential consent changes.

These production interpreter/reducer replays use controlled owners and scripted interaction. They establish destination selection, separate decline-default confirmation, Back discarding input, blocked saving, stale reapproval, cancellation and observed storage outcomes. Storage and effective source remain separate: saving the user file here leaves the environment selected. Keys stay outside every trace. No native writes or provider requests occur; this does not establish physical terminal or platform support. The explicit \`--credential-stdin\` automation contract retains its direct native-save path without dialogs.

\`\`\`mermaid
flowchart TD
${[...edges].join("\n")}
\`\`\`

| Case | Before revision | Action | After revision |
| --- | --- | --- | --- |
${rows.join("\n")}
`
})
