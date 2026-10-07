import assert from "node:assert/strict"
import { Effect } from "effect"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import { captureCredential } from "@hapsland/administration/credentials/masked-input"
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
  const scenarios = ["stored", "cancelled", "locked", "busy", "indeterminate"] as const
  for (const name of scenarios) {
    const steps: ScriptStep[] =
      name === "locked" ? [] : name === "cancelled" ? [{ kind: "eof" }] : [{ kind: "hidden", value: key }]
    const script = scriptedInteraction(steps)
    const transitions: LoginTransition[] = []
    let probes = 0
    let saves = 0
    const result = yield* runLoginConversation({
      input: captureCredential,
      inputKind: "terminal",
      observe: (transition) =>
        Effect.sync(() => {
          transitions.push(transition)
        })
    }).pipe(
      Effect.provideService(InteractionService, script.interaction),
      Effect.provideService(LoginOwnerService, {
        probe: Effect.sync(() => {
          probes++
          return name === "locked" ? ("locked" as const) : ("available" as const)
        }),
        save: (value) =>
          Effect.sync(() => {
            assert.equal(value, key)
            saves++
            assert(name === "stored" || name === "busy" || name === "indeterminate")
            return {
              status: name,
              state: { ...makeInitialCredentialState(), generation: 7, savedUseSuspended: name !== "stored" },
              stateLock: name === "busy" ? ("busy" as const) : ("acquired" as const)
            }
          })
      })
    )
    assert.equal(probes, 1)
    assert.equal(saves, name === "locked" || name === "cancelled" ? 0 : 1)
    assert.equal(script.remaining(), 0)
    assert.equal(result.model.phase, name === "cancelled" ? "Cancelled" : "Done")
    if (name === "locked") assert.deepEqual(result.outcome, { kind: "unavailable", status: "locked" })
    else if (name === "cancelled") assert.deepEqual(result.outcome, { kind: "cancelled" })
    else {
      assert.equal(result.model.storage?.status, name)
      assert.equal(result.model.storage?.generation, 7)
      assert.equal(result.model.storage?.savedUse, name === "stored" ? "active" : "suspended")
    }
    assert(!JSON.stringify({ transitions, model: result.model, transcript: script.transcript }).includes(key))
    for (const { before, event, after } of transitions) {
      const action = event.action
      const label =
        action.kind === "observed"
          ? `observed ${action.storage.status}`
          : action.kind === "checked"
            ? `checked ${action.status}`
            : action.kind
      edges.add(`  ${before.phase} -->|"${label}"| ${after.phase}`)
      rows.push(
        `| ${name} | ${before.revision} | ${label} | ${"commandId" in action ? action.commandId : "—"} | ${after.revision} |`
      )
    }
  }
  return `# Login interaction

**Purpose:** Show the production login conversation and correlation witnessed by its replays.
**Status:** Maintained generated diagram.
**Authority:** Implementation and controlled validation evidence for #244; accepted credential contracts and native owners retain product authority.
**Expected use:** Inspect availability, hidden cancellation and storage outcomes; run \`npm run interaction:diagrams:check\` to check freshness without writing.
**Lifecycle:** Regenerate with \`npm run interaction:diagrams:write\` whenever the production reducer, interpreter or replay cases change. Review when the accepted login interaction changes.

These replays run the production interpreter and secret-capture adapter with scripted input and controlled owners. They perform no native credential writes or provider requests and do not validate a physical terminal. Availability is checked before input. Hidden cancellation exits without saving. Busy and indeterminate remain observed owner outcomes; they are not represented as successful saves. The explicit \`--credential-stdin\` route supplies input directly to the same conversation without a terminal dialog.

\`\`\`mermaid
flowchart TD
${[...edges].join("\n")}
\`\`\`

## Replay correlation

The table records actual production transitions and command identities. Keys never enter models, events or this projection. Each replay independently asserts probe/save counts, consumed input and its expected outcome.

| Replay | Input revision | Event | Command identity | Output revision |
| --- | --- | --- | --- | --- |
${rows.join("\n")}
`
})
