import { userFlowDiagram } from "./interaction-diagram-view.mts"
import assert from "node:assert/strict"
import { Effect } from "effect"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import { runRuleConversation, type RulesTransition } from "@hapsland/administration/rules/conversation"
import { scriptedInteraction, type ScriptStep } from "./test-support/scripted-interaction.ts"

const scenarios: { name: string; steps: ScriptStep[]; stale?: boolean; outcome: string; writes: number }[] = [
  {
    name: "apply",
    steps: [
      { kind: "choose", index: 0 },
      { kind: "choose", index: 0 },
      { kind: "confirm", line: "y" }
    ],
    outcome: "applied",
    writes: 1
  },
  {
    name: "decline",
    steps: [
      { kind: "choose", index: 0 },
      { kind: "choose", index: 0 },
      { kind: "confirm", line: "yes" }
    ],
    outcome: "declined",
    writes: 0
  },
  {
    name: "back",
    steps: [
      { kind: "choose", index: 0 },
      { kind: "choose", index: 0 },
      { kind: "back" },
      { kind: "back" },
      { kind: "exit" }
    ],
    outcome: "Cancelled",
    writes: 0
  },
  { name: "eof", steps: [{ kind: "choose", index: 0 }, { kind: "eof" }], outcome: "Cancelled", writes: 0 },
  {
    name: "stale",
    stale: true,
    steps: [
      { kind: "choose", index: 0 },
      { kind: "choose", index: 0 },
      { kind: "confirm", line: "y" },
      { kind: "choose", index: 0 },
      { kind: "confirm", line: "y" }
    ],
    outcome: "applied",
    writes: 1
  }
]

export const generateRulesDiagram = Effect.gen(function* () {
  const replayed: { name: string; transitions: RulesTransition[] }[] = []
  for (const action of ["create", "connect", "enable", "disable"] as const)
    for (const scenario of scenarios) {
      const script = scriptedInteraction(scenario.steps)
      const transitions: RulesTransition[] = []
      let preview = 0
      let writes = 0
      let attempts = 0
      const outcome = yield* runRuleConversation(
        action,
        {
          preview: (scope) =>
            Effect.sync(() => ({
              action,
              scope,
              digest: `controlled-plan-${++preview}`,
              configuration: "/example/settings.json",
              rule: "example-rule",
              enabled: action !== "disable"
            })),
          apply: (plan) =>
            Effect.sync(() => {
              assert.equal(
                plan.digest,
                `controlled-plan-${preview}`,
                "Apply must use the currently previewed owner digest"
              )
              attempts++
              if (scenario.stale && attempts === 1) return { kind: "stale" as const }
              writes++
              return { kind: "applied" as const, result: undefined }
            })
        },
        {
          observe: (transition) =>
            Effect.sync(() => {
              transitions.push(transition)
            })
        }
      ).pipe(Effect.provideService(InteractionService, script.interaction))
      assert.equal(outcome.model.outcome ?? outcome.model.phase, scenario.outcome, scenario.name)
      assert.equal(writes, scenario.writes, scenario.name)
      assert.equal(script.remaining(), 0, "Every replay must consume precisely its declared answers")
      if (scenario.stale) {
        assert.equal(preview, 2)
        assert.equal(transitions.filter((t) => t.event.action.kind === "approve").length, 2)
      }
      replayed.push({ name: scenario.name, transitions })
    }
  const edges = new Set<string>()
  for (const replay of replayed)
    for (const { before, event, after } of replay.transitions) {
      const action = event.action
      const label =
        action.kind === "approve"
          ? `approve ${action.yes ? "y" : "non-y"}`
          : action.kind === "observed"
            ? `observed ${action.outcome}`
            : action.kind
      edges.add(`  ${before.phase} -->|"${label}"| ${after.phase}`)
    }
  const markdown = `# Rules interaction

**Purpose:** Show rule selection, review, approval and outcomes.
**Status:** Maintained generated diagram.
**Authority:** Implementation and controlled validation evidence for #244; the accepted issue and rule owners retain product authority.
**Expected use:** Inspect navigation and approval boundaries; run \`npm run interaction:diagrams:check\` to check freshness without writing.
**Lifecycle:** Regenerate with \`npm run interaction:diagrams:write\` whenever the production reducer, interpreter or generated flow changes. Review when the accepted rules interaction changes.

Choose the rule scope, review the proposed changes, then confirm before applying them. Declining leaves rules unchanged. Back returns to the preview or scope choice; Exit ends the conversation. If the proposal changes, Hapsland shows a fresh preview and asks for approval again.

\`\`\`mermaid
flowchart TD
${userFlowDiagram("rules", edges)}
\`\`\`
`
  return markdown
})
