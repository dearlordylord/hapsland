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
  const rows: string[] = []
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
      rows.push(`| ${scenario.name} | ${before.revision} | ${label} | ${after.revision} |`)
    }
  }
  return `# Agent selection and setup navigation

**Purpose:** Show the production outer agent-selection loop and its per-agent handoff.
**Status:** Maintained generated diagram.
**Authority:** Implementation and controlled replay evidence; installation and interaction contracts own consent.
**Expected use:** Inspect multi-agent ordering, Back and cancellation before opening the linked setup subflow.
**Lifecycle:** Regenerate when the selection interpreter or replay cases change; review when agent-navigation behavior changes.

Six named replays execute the production selection interpreter and selector with scripted input. Controlled per-agent outcomes establish ordering, selection retention on Back, re-selection, Exit/EOF and cancellation stopping later agents. The per-agent callback delegates to [setup](setup.md); setup invokes [login](login.md) and [verification](verification.md). These are flow connections, not a claim that this replay exercises every child transition or a physical terminal.

\`\`\`mermaid
flowchart TD
${[...edges].join("\n")}
\`\`\`

| Case | Input revision | Event | Output revision |
| --- | --- | --- | --- |
${rows.join("\n")}
`
})
