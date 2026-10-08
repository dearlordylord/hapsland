import { userFlowDiagram } from "./interaction-diagram-view.mts"
import assert from "node:assert/strict"
import { Effect } from "effect"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import { runSetupSelection, type SelectionTransition } from "@hapsland/administration/onboarding/setup-selection"
import type { ClientChoice, SetupClient } from "@hapsland/administration/onboarding/client-selection"
import { scriptedInteraction, type ScriptStep } from "./test-support/scripted-interaction.ts"

export const generateSetupSelectionDiagram = Effect.gen(function* () {
  const choices: ClientChoice[] = [
    { host: "codex", name: "Codex CLI", status: "installed" },
    { host: "claude", name: "Claude Code", status: "not installed" }
  ]
  const scenarios: {
    name: string
    steps: ScriptStep[]
    outcomes: ("completed" | "back" | "cancelled")[]
    calls: SetupClient[]
    phase: string
  }[] = [
    {
      name: "two-agents",
      steps: [{ kind: "chooseMany", ids: ["codex", "claude"] }],
      outcomes: ["completed", "completed"],
      calls: ["codex", "claude"],
      phase: "Done"
    },
    {
      name: "back-reselect",
      steps: [
        { kind: "chooseMany", ids: ["codex", "claude"] },
        { kind: "chooseMany", ids: ["claude"] }
      ],
      outcomes: ["back", "completed"],
      calls: ["codex", "claude"],
      phase: "Done"
    },
    {
      name: "back-exit",
      steps: [{ kind: "chooseMany", ids: ["codex"] }, { kind: "exit" }],
      outcomes: ["back"],
      calls: ["codex"],
      phase: "Done"
    },
    {
      name: "cancel-agent",
      steps: [{ kind: "chooseMany", ids: ["codex", "claude"] }],
      outcomes: ["cancelled"],
      calls: ["codex"],
      phase: "Cancelled"
    },
    { name: "initial-exit", steps: [{ kind: "exit" }], outcomes: [], calls: [], phase: "Done" },
    { name: "eof", steps: [{ kind: "eof" }], outcomes: [], calls: [], phase: "Done" }
  ]
  const edges = new Set<string>()
  for (const scenario of scenarios) {
    const script = scriptedInteraction(scenario.steps)
    const calls: SetupClient[] = []
    const transitions: SelectionTransition[] = []
    const remaining = [...scenario.outcomes]
    const result = yield* runSetupSelection(
      choices,
      (host) =>
        Effect.sync(() => {
          calls.push(host)
          const outcome = remaining.shift()
          assert(outcome, "Unexpected per-agent setup invocation")
          return outcome
        }),
      (transition) =>
        Effect.sync(() => {
          transitions.push(transition)
        })
    ).pipe(Effect.provideService(InteractionService, script.interaction))
    assert.deepEqual(calls, scenario.calls)
    assert.equal(result.phase, scenario.phase)
    assert.equal(script.remaining(), 0)
    assert.equal(remaining.length, 0)
    if (scenario.name.startsWith("back"))
      assert(
        transitions.some(
          (transition) => transition.after.phase === "SelectingAgents" && transition.after.selected.includes("codex")
        )
      )
    for (const { before, action, after } of transitions) {
      const label = action.kind === "observed" ? `agent ${action.outcome}` : action.kind
      edges.add(`  ${before.phase} -->|"${label}"| ${after.phase}`)
    }
  }
  return `# Agent selection and setup navigation

**Purpose:** Show the production outer agent-selection loop and its per-agent handoff.
**Status:** Maintained generated diagram.
**Authority:** Implementation and implementation documentation; installation and interaction contracts own consent.
**Expected use:** Inspect multi-agent ordering, Back and cancellation before opening the linked setup subflow.
**Lifecycle:** Regenerate when the selection interpreter or generated flow changes; review when agent-navigation behavior changes.

Select the agents to configure. Hapsland runs their setup flows in order. Back returns to agent selection and retains the previous selection; cancelling an agent stops later agents. Exit or end of input finishes selection. Open [setup](setup.md) for each agent’s approval flow, and [login](login.md) or [verification](verification.md) for credential choices.

\`\`\`mermaid
flowchart TD
${userFlowDiagram("setup-selection", edges)}
\`\`\`
`
})
