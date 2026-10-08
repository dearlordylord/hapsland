import { complete, preview } from "./test-support/setup-observations.ts"
import { generateSetupJourneyDiagram } from "./generate-setup-journey-diagram.mts"
import { userFlowDiagram } from "./interaction-diagram-view.mts"
import assert from "node:assert/strict"
import type { Exit } from "effect"
import { Effect } from "effect"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import {
  runPilotSetup,
  SetupOwnerService,
  type SetupTransition,
  type SetupOwner
} from "@hapsland/administration/onboarding/pilot"
import { reduceSetup } from "@hapsland/administration/onboarding/setup-model"
import { initialVerification } from "@hapsland/administration/onboarding/verification-model"
import type { runSetup } from "@hapsland/administration/onboarding/setup"
import { scriptedInteraction, type ScriptStep } from "./test-support/scripted-interaction.ts"

type Result = Effect.Success<ReturnType<typeof runSetup>>
export const generateSetupDiagram = Effect.gen(function* () {
  const edges = new Set<string>()
  const scenarios = [
    "approved",
    "declined-hooks",
    "declined-rules",
    "back",
    "exit",
    "eof",
    "rules-back",
    "changed-proposal",
    "partial",
    "credential-busy",
    "credential-indeterminate",
    "hidden-cancelled",
    "verification-cancelled",
    "activation-failed",
    "interrupted"
  ] as const
  for (const name of scenarios) {
    const steps: ScriptStep[] =
      name === "back" || name === "exit" || name === "eof"
        ? [{ kind: name }]
        : [{ kind: "confirm", line: name === "declined-hooks" ? "n" : "y" }]
    if (!["back", "exit", "eof", "declined-hooks"].includes(name)) {
      if (name === "rules-back") steps.push({ kind: "back" }, { kind: "confirm", line: "y" })
      steps.push({ kind: "confirm", line: name === "declined-rules" ? "n" : "y" })
      if (name === "changed-proposal") steps.push({ kind: "confirm", line: "y" }, { kind: "confirm", line: "y" })
    }
    const script = scriptedInteraction(steps)
    const transitions: SetupTransition[] = []
    const requests: Parameters<SetupOwner["run"]>[0][] = []
    let activations = 0
    let verifications = 0
    let doctors = 0
    const final: Result =
      name === "partial"
        ? {
            ...complete,
            status: "partial",
            stages: complete.stages.map((stage) =>
              stage.stage === "installation" ? { ...stage, status: "partial" } : stage
            )
          }
        : ["credential-busy", "credential-indeterminate", "hidden-cancelled"].includes(name)
          ? {
              ...complete,
              stages: complete.stages.map((stage) =>
                stage.stage === "credential"
                  ? {
                      ...stage,
                      status: "pending",
                      observed: {
                        status: name === "hidden-cancelled" ? "cancelled" : name.slice("credential-".length),
                        generation: 2,
                        value: "private-key"
                      }
                    }
                  : stage
              )
            }
          : complete
    const result: Exit.Exit<Effect.Success<ReturnType<typeof runPilotSetup>>, unknown> = yield* runPilotSetup(
      { terminal: true, host: "codex", fields: { host: "codex" }, cwd: "/controlled", platform: "linux" },
      {
        observe: (transition) =>
          Effect.sync(() => {
            transitions.push(transition)
          })
      }
    ).pipe(
      Effect.provideService(InteractionService, script.interaction),
      Effect.provideService(SetupOwnerService, {
        run: (request, _entered, progress): ReturnType<SetupOwner["run"]> =>
          Effect.sync(() => {
            requests.push(request)
            if (!request.interactive) {
              assert.equal(request.installProposalDigest, undefined)
              assert.equal(request.rulesProposalDigest, undefined)
              return preview(name === "rules-back" && requests.length > 1 ? "hooks-changed" : "hooks-current")
            }
            assert.equal(
              request.installProposalDigest,
              (name === "changed-proposal" || name === "rules-back") && requests.length > 2
                ? "hooks-changed"
                : "hooks-current"
            )
            assert.equal(request.rulesProposalDigest, "rules-current")
            return name === "changed-proposal" && requests.length === 2 ? preview("hooks-changed") : final
          }).pipe(
            Effect.flatMap((result) =>
              name === "interrupted" && request.interactive
                ? progress({
                    stages: [{ stage: "installation", status: "complete", summary: "hooks installed" }]
                  }).pipe(Effect.andThen(Effect.interrupt))
                : Effect.succeed(result)
            )
          ),
        activate: Effect.sync(() => {
          activations++
        }).pipe(
          Effect.andThen(
            name === "activation-failed" ? Effect.fail(new Error("controlled activation failure")) : Effect.void
          )
        ),
        verifyCredential: Effect.sync(() => {
          verifications++
          return {
            kind: name === "verification-cancelled" ? ("cancelled" as const) : ("completed" as const),
            model: initialVerification()
          }
        }),
        doctor: Effect.sync(() => {
          doctors++
          return {
            stdout: JSON.stringify({ status: "unknown" }),
            stderr: "",
            succeeded: true,
            timedOut: false,
            exitCode: 0
          }
        })
      }),
      Effect.exit
    )
    const noApply = ["back", "exit", "eof", "declined-hooks", "declined-rules"].includes(name)
    assert.equal(
      requests.filter((request) => request.interactive).length,
      noApply ? 0 : name === "changed-proposal" ? 2 : 1
    )
    assert.equal(activations, noApply || name === "interrupted" ? 0 : 1)
    const verify =
      !noApply &&
      ![
        "partial",
        "credential-busy",
        "credential-indeterminate",
        "hidden-cancelled",
        "activation-failed",
        "interrupted"
      ].includes(name)
    assert.equal(verifications, verify ? 1 : 0)
    assert.equal(doctors, verify && name !== "verification-cancelled" ? 1 : 0)
    assert.equal(result._tag, name === "activation-failed" || name === "interrupted" ? "Failure" : "Success")
    assert.equal(script.remaining(), 0)
    const model = transitions.at(-1)!.after
    if (name === "credential-busy" || name === "credential-indeterminate")
      assert.equal(model.observations.at(-1)?.credential?.status, name.slice("credential-".length))
    if (name === "activation-failed") assert.equal(model.activation, "failed")
    if (name === "interrupted")
      assert.deepEqual(model.observations.at(-1)?.stages, [{ stage: "installation", status: "complete" }])
    if (name === "hidden-cancelled" || name === "verification-cancelled") assert.equal(model.phase, "Cancelled")
    if (name === "hidden-cancelled") assert.equal(model.activation, "completed")
    assert(!JSON.stringify({ model, transitions, output: script.transcript }).includes("private-key"))
    const first = transitions[0]!
    const repeated = reduceSetup(first.after, first.event)
    const stale = reduceSetup(first.after, {
      revision: first.after.revision,
      action: { kind: "approveHooks", digest: "stale", yes: true }
    })
    assert.strictEqual(repeated, first.after, "duplicate completion is ignored")
    assert.strictEqual(stale, first.after, "stale digest is ignored")
    for (const { before, event, after } of transitions) {
      const action = event.action
      const detail =
        action.kind === "approveHooks" || action.kind === "approveRules"
          ? action.yes
            ? "y"
            : "non-y"
          : action.kind === "previewed" || action.kind === "applied"
            ? action.observation.status
            : ""
      const label = `${action.kind} ${detail}`.trim()
      edges.add(`  ${before.phase} -->|"${label}"| ${after.phase}`)
    }
  }
  return `# Setup interaction

**Purpose:** Show the CLI setup journey from agent selection through per-agent approval, credential saving, verification and readiness.
**Status:** Maintained generated diagram.
**Authority:** Implementation and controlled validation evidence for #244; accepted installation and credential contracts retain authority.
**Expected use:** Understand setup choices and outcomes and run \`npm run interaction:diagrams:check\` for non-writing freshness.
**Lifecycle:** Regenerate with \`npm run interaction:diagrams:write\` when the reducer, interpreter or diagram generation changes; review when setup authorization or credential behavior changes.

Run \`hapsland setup\` to select agents, or \`hapsland setup <agent>\` to configure a named agent directly. Selected agents are configured in order. Review the proposed setup, then approve hooks and rules separately. Back returns to the previous choice; a changed proposal requires another review and approval. Completed or partial installation remains visible if later activation or input fails. Optional paid credential verification has its own consent; readiness checks follow separately. Exiting does not undo completed changes.

\`\`\`mermaid
flowchart TD
${yield* generateSetupJourneyDiagram}
\`\`\`

## Setup outcomes

The per-agent view below shows changed proposals, partial installation and activation failures. It supplements the complete command journey above.

\`\`\`mermaid
flowchart TD
${userFlowDiagram("setup", edges)}
\`\`\`
`
})
