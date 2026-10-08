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
const complete: Result = {
  version: 1,
  operation: "setup",
  status: "completed",
  host: { adapter: "codex" },
  scope: { repository: "/controlled", review: "enabled" },
  providerCalls: 0,
  paidVerificationPerformed: false,
  stages: ["compatibility", "installation", "credential", "repository"].map((stage) => ({
    stage,
    status: "complete",
    summary: `${stage} complete`
  })) as Result["stages"],
  completed: [],
  pending: [],
  actions: []
}
const preview = (digest = "hooks-current"): Result => ({
  ...complete,
  status: "needs-user-action",
  stages: complete.stages.map((stage) =>
    stage.stage === "installation"
      ? { ...stage, status: "pending", observed: { proposal: { changes: ["owned hook"] } } }
      : stage
  ),
  actions: [
    {
      stage: "installation",
      code: "approve-installation",
      action: "install owned hooks",
      authorization: { installProposalDigest: digest }
    },
    {
      stage: "rules",
      code: "approve-default-rules",
      action: "connect default rules",
      authorization: { rulesProposalDigest: "rules-current" }
    }
  ]
})
export const generateSetupDiagram = Effect.gen(function* () {
  const edges = new Set<string>()
  const ignored = new Set<string>()
  const rows: string[] = []
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
    ignored.add(`  ${first.after.phase} -->|"ignored duplicate completion"| ${repeated.phase}`)
    ignored.add(`  ${first.after.phase} -->|"ignored stale digest"| ${stale.phase}`)
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
      rows.push(
        `| ${name} | ${before.revision} | ${label} | ${"commandId" in action ? action.commandId : "—"} | ${after.revision} |`
      )
    }
  }
  return `# Setup interaction

**Purpose:** Show production setup approval, observed mutation and readiness transitions.
**Status:** Maintained generated diagram.
**Authority:** Implementation and controlled validation evidence for #244; accepted installation and credential contracts retain authority.
**Expected use:** Inspect bounded scenarios and run \`npm run interaction:diagrams:check\` for non-writing freshness.
**Lifecycle:** Regenerate with \`npm run interaction:diagrams:write\` when the reducer, interpreter or scenarios change; review when setup authorization or credential behavior changes.

Fifteen bounded scenarios replay the actual production setup interpreter with controlled owners and scripted interaction. Independent assertions check separate hook and rule consent, current digest forwarding, initial noninteractive preview, changed-proposal reapproval, Back/Exit/EOF, retained partial and credential busy/indeterminate observations, hidden/verification cancellation, true effect interruption after observed installation, failed activation, and no keys in models, transitions or output. These replays perform no credential-store access or provider requests. Owner, terminal, installed-package and platform behavior require their separate checks. Diagram freshness is not exhaustive correctness evidence.

Setup delegates mutation to the existing setup owner. Installation, credential availability, public-command activation, optional paid key verification, offline readiness, native trust and actual observed review are distinct. Back retains prior observations and invalidates current consent. A changed proposal requires a new preview and approval. Hidden cancellation completes required public-command activation for observed completed or partial installation, then ends input, paid checks and doctor without claiming rollback. An interrupted owner cannot fabricate completion or activation.

\`\`\`mermaid
flowchart TD
${[...edges].join("\n")}
\`\`\`

## Ignored input

Independent replay assertions submit a repeated command completion and a stale approval digest to the actual reducer. They return the same model and authorize no command. These ignored inputs are separate from state-changing edges above; this is session correlation, not process-wide exactly-once evidence.

\`\`\`mermaid
flowchart LR
${[...ignored].join("\n")}
\`\`\`

## Replay correlation

Only safe stage statuses and revision/command identities are retained. Raw owner records, credentials and provider payloads are excluded.

| Replay | Input revision | Event | Command identity | Output revision |
| --- | --- | --- | --- | --- |
${rows.join("\n")}
`
})
