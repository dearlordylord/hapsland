import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { Effect } from "effect"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import { runRuleConversation, type RulesTransition } from "@hapsland/administration/rules/conversation"
import { scriptedInteraction, type ScriptStep } from "./test-support/scripted-interaction.ts"

import { generateUpdateDiagram } from "./generate-update-diagram.mts"
import { generateLoginDiagram } from "./generate-login-diagram.mts"

const mode = process.argv[2]
assert(mode === "--check" || mode === "--write", "Choose --check or --write")
const destination = resolve(import.meta.dirname, "../docs/cli-interactions/rules.md")
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

const program = Effect.gen(function* () {
  const replayed: { name: string; transitions: RulesTransition[] }[] = []
  for (const scenario of scenarios) {
    const script = scriptedInteraction(scenario.steps)
    const transitions: RulesTransition[] = []
    let preview = 0
    let writes = 0
    let attempts = 0
    const outcome = yield* runRuleConversation(
      "enable",
      {
        preview: (scope) =>
          Effect.sync(() => ({
            action: "enable" as const,
            scope,
            digest: `controlled-plan-${++preview}`,
            configuration: "/example/settings.json",
            rule: "example-rule",
            enabled: true
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
  const correlation: string[] = []
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
      correlation.push(
        `| ${replay.name} | ${before.revision} | ${label} | ${"commandId" in action ? action.commandId : "—"} | ${after.revision} |`
      )
    }
  const markdown = `# Rules interaction\n\n**Purpose:** Show the production rules conversation and the correlation witnessed by its replays.\n**Status:** Maintained generated diagram.\n**Authority:** Implementation and controlled validation evidence for #244; the accepted issue and rule owners retain product authority.\n**Expected use:** Inspect navigation and approval boundaries; run \`npm run interaction:diagrams:check\` to check freshness without writing.\n**Lifecycle:** Regenerate with \`npm run interaction:diagrams:write\` whenever the production reducer, interpreter or replay cases change. Review when the accepted rules interaction changes.\n\nThese replays run the production interpreter with scripted input and controlled owner outcomes. They do not write real rules or validate a native terminal. Owner digests authorize writes; revisions and command identities reject stale session events.\n\n\`\`\`mermaid\nflowchart TD\n${[...edges].join("\n")}\n\`\`\`\n\n## Replay correlation\n\nCommand completions carry the revision of the command that issued them. The table records actual production transitions; it contains no credentials, rule content or user input text.\n\n| Replay | Input revision | Event | Command identity | Output revision |\n| --- | --- | --- | --- | --- |\n${correlation.join("\n")}\n`
  yield* Effect.promise(async () => {
    if (mode === "--write") {
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, markdown)
    } else assert.equal(await readFile(destination, "utf8"), markdown, "Rules diagram is stale; regenerate it")
  })
  const login = yield* generateLoginDiagram
  const loginDestination = resolve(import.meta.dirname, "../docs/cli-interactions/login.md")
  yield* Effect.promise(async () => {
    if (mode === "--write") await writeFile(loginDestination, login)
    else assert.equal(await readFile(loginDestination, "utf8"), login, "Login diagram is stale; regenerate it")
  })
  const update = yield* generateUpdateDiagram
  const updateDestination = resolve(import.meta.dirname, "../docs/cli-interactions/update.md")
  yield* Effect.promise(async () => {
    if (mode === "--write") await writeFile(updateDestination, update)
    else assert.equal(await readFile(updateDestination, "utf8"), update, "Update diagram is stale; regenerate it")
  })
  yield* Effect.sync(() => console.log("Update diagram: 9 independently asserted replays"))
  yield* Effect.sync(() => console.log("Login diagram: 5 independently asserted replays"))
  yield* Effect.sync(() =>
    console.log(
      `Rules diagram ${mode === "--write" ? "written" : "current"}; ${scenarios.length} independently asserted replays`
    )
  )
})
await Effect.runPromise(program)
