import { userFlowDiagram } from "./interaction-diagram-view.mts"
import assert from "node:assert/strict"
import { Effect } from "effect"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import { UpdateOwnerService, updateClients, type UpdateTransition } from "@hapsland/administration/onboarding/update"
import { scriptedInteraction, type ScriptStep } from "./test-support/scripted-interaction.ts"

export const generateUpdateDiagram = Effect.gen(function* () {
  const scenarios = [
    "apply",
    "decline",
    "back-exit",
    "eof",
    "current",
    "partial",
    "activation-failed",
    "busy",
    "indeterminate"
  ] as const
  const edges = new Set<string>()
  for (const name of scenarios) {
    const steps: ScriptStep[] =
      name === "current"
        ? []
        : [
            { kind: "choose", index: 0 },
            ...(name === "back-exit"
              ? ([{ kind: "back" }, { kind: "exit" }] as const)
              : name === "eof"
                ? ([{ kind: "eof" }] as const)
                : ([{ kind: "confirm", line: name === "decline" ? "n" : "y" }] as const))
          ]
    const script = scriptedInteraction(steps)
    const transitions: UpdateTransition[] = []
    const calls: string[] = []
    const digest = "a".repeat(64)
    const model = yield* updateClients({
      terminal: true,
      host: undefined,
      reportFailure: () => Effect.void,
      observe: (transition) =>
        Effect.sync(() => {
          transitions.push(transition)
        })
    }).pipe(
      Effect.provideService(InteractionService, script.interaction),
      Effect.provideService(UpdateOwnerService, {
        discover: Effect.succeed({ hosts: ["claude" as const, "codex" as const], failures: [] }),
        target: Effect.succeed("/controlled/target"),
        preview: (_, host) =>
          Effect.sync(() => {
            calls.push(`preview ${host}`)
            return {
              status: "preview",
              proposal: {
                digest: host === "claude" ? digest : "b".repeat(64),
                changes: name === "current" ? [] : [{ description: "controlled change" }]
              }
            }
          }),
        apply: (_, host, approved) =>
          Effect.sync(() => {
            assert.equal(approved, host === "claude" ? digest : "b".repeat(64))
            assert(calls.includes("preview claude") && calls.includes("preview codex"))
            calls.push(`apply ${host}`)
            return { status: name === "partial" || name === "busy" || name === "indeterminate" ? name : "updated" }
          }),
        activate: () => {
          calls.push("activate")
          return name === "activation-failed" ? Effect.fail(new Error("controlled activation failure")) : Effect.void
        }
      })
    )
    const expected =
      name === "current"
        ? "already current"
        : name === "decline" || name === "back-exit" || name === "eof"
          ? "skipped"
          : name === "partial" || name === "busy" || name === "indeterminate"
            ? name
            : "updated"
    assert.deepEqual(
      model.agents.map((agent) => agent.outcome),
      [expected, expected]
    )
    assert.equal(
      calls.filter((call) => call.startsWith("apply")).length,
      ["current", "decline", "back-exit", "eof"].includes(name) ? 0 : 2
    )
    assert.equal(script.remaining(), 0)
    assert.equal(model.phase, name === "back-exit" || name === "eof" ? "Cancelled" : "Done")
    if (name === "activation-failed")
      assert(model.agents.every((agent) => agent.activation === "failed" && agent.outcome === "updated"))
    for (const { before, event, after } of transitions) {
      const action = event.action
      const label =
        action.kind === "previewed"
          ? `previewed ${action.host} ${action.result.kind}`
          : action.kind === "observed"
            ? `observed ${action.host} ${action.outcome}`
            : action.kind === "activated"
              ? `activated ${action.host} ${action.result}`
              : action.kind === "approve"
                ? `approve ${action.yes ? "y" : "non-y"}`
                : action.kind
      edges.add(`  ${before.phase} -->|"${label}"| ${after.phase}`)
    }
  }
  return `# Update interaction

**Purpose:** Show grouped update review, approval and outcomes.
**Audience:** Contributors, including coding agents; Product and specification owners reviewing CLI journeys.
**Status:** Maintained generated diagram.
**Authority:** Implementation and controlled validation evidence for #244; accepted installation contracts and lifecycle owners retain authority.
**Expected use:** Inspect grouped approval, Back, observed mutation and activation outcomes; run \`npm run interaction:diagrams:check\` for non-writing freshness.
**Lifecycle:** Regenerate with \`npm run interaction:diagrams:write\` when the reducer, interpreter or generated flow changes; review when accepted update behavior changes.

Review proposed updates for all selected agents before approving the group. Back returns to the review; Exit ends navigation. Agents that are already current activate without an update. Partial updates, busy operations and uncertain results remain visible. Activation failure does not undo a completed update. JSON preview and update commands remain direct automation paths.

\`\`\`mermaid
flowchart TD
${userFlowDiagram("update", edges)}
\`\`\`
`
})
