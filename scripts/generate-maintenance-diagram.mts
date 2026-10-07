import assert from "node:assert/strict"
import { Effect } from "effect"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import {
  maintainClients,
  MaintenanceOwnerService,
  type MaintenanceTransition
} from "@hapsland/administration/onboarding/maintenance"
import type { MaintenanceCommand } from "@hapsland/administration/onboarding/maintenance-model"
import { profileFields } from "@hapsland/administration/onboarding/client-command"
import { scriptedInteraction, type ScriptStep } from "./test-support/scripted-interaction.ts"

export const generateMaintenanceDiagram = Effect.gen(function* () {
  const names = [
    "repair",
    "reinstall",
    "uninstall",
    "recover-uninstall",
    "decline",
    "back-exit",
    "eof",
    "intact",
    "partial",
    "busy",
    "indeterminate",
    "activation-failed",
    "empty-reinstall"
  ] as const
  const edges = new Set<string>()
  const rows: string[] = []
  for (const name of names) {
    const command: MaintenanceCommand =
      name === "uninstall" ? "uninstall" : name === "reinstall" || name === "empty-reinstall" ? "reinstall" : "repair"
    const steps: ScriptStep[] =
      name === "intact" || name === "empty-reinstall"
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
    const transitions: MaintenanceTransition[] = []
    const calls: string[] = []
    const digest = "a".repeat(64)
    const operation = name === "uninstall" || name === "recover-uninstall" ? "uninstall" : "install"
    const model = yield* maintainClients(command, {
      terminal: true,
      host: undefined,
      reportFailure: () => Effect.void,
      observe: (transition) =>
        Effect.sync(() => {
          transitions.push(transition)
        })
    }).pipe(
      Effect.provideService(InteractionService, script.interaction),
      Effect.provideService(MaintenanceOwnerService, {
        discover: Effect.succeed({ hosts: name === "empty-reinstall" ? [] : ["codex"], failures: [] }),
        fields: (host) => profileFields(host, new Map()),
        inspect: () =>
          Effect.succeed({
            installed: true,
            inspection: name === "recover-uninstall" ? { recovery: { operation: "uninstall" } } : {}
          }),
        invoke: (_, request) =>
          Effect.sync(() => {
            if (request.proposalDigest === undefined) {
              assert.equal(request.operation, operation === "uninstall" ? operation : `${operation}-preview`)
              calls.push("preview")
              return {
                status: "preview",
                proposal: { digest, changes: name === "intact" ? [] : ["controlled hook change"] }
              }
            }
            assert.equal(request.proposalDigest, digest)
            assert.equal(request.operation, operation)
            assert.equal(request.reinstall, name === "reinstall" ? true : undefined)
            assert.deepEqual(calls, ["preview"])
            calls.push("apply")
            return { status: name === "partial" || name === "busy" || name === "indeterminate" ? name : "complete" }
          }),
        activate: Effect.sync(() => {
          calls.push("activate")
        }).pipe(
          Effect.andThen(
            name === "activation-failed" ? Effect.fail(new Error("controlled activation failure")) : Effect.void
          )
        )
      })
    )
    const skipped = ["decline", "back-exit", "eof"].includes(name)
    const expected = skipped
      ? "skipped"
      : name === "intact"
        ? "intact"
        : name === "partial" || name === "busy" || name === "indeterminate"
          ? name
          : operation === "uninstall"
            ? "removed"
            : "restored"
    assert.deepEqual(
      model.agents.map((agent) => agent.outcome),
      name === "empty-reinstall" ? [] : [expected]
    )
    assert.equal(
      calls.filter((call) => call === "apply").length,
      skipped || name === "intact" || name === "empty-reinstall" ? 0 : 1
    )
    assert.equal(
      calls.filter((call) => call === "activate").length,
      name === "empty-reinstall" || ["repair", "reinstall", "partial", "activation-failed"].includes(name) ? 1 : 0
    )
    assert.equal(script.remaining(), 0)
    if (name === "activation-failed") assert.equal(model.agents[0]?.activation, "failed")
    if (name === "empty-reinstall") assert.equal(model.emptyActivation, "complete")
    for (const { before, event, after } of transitions) {
      const action = event.action
      const detail =
        action.kind === "inspected"
          ? action.operation
          : action.kind === "previewed"
            ? action.result.kind
            : action.kind === "observed"
              ? action.outcome
              : action.kind === "approve"
                ? action.yes
                  ? "y"
                  : "non-y"
                : action.kind === "activated" || action.kind === "activatedEmpty"
                  ? action.result
                  : ""
      const label = `${action.kind} ${detail}`.trim()
      edges.add(`  ${before.phase} -->|"${label}"| ${after.phase}`)
      rows.push(
        `| ${name} | ${before.revision} | ${label} | ${"commandId" in action ? action.commandId : "—"} | ${after.revision} |`
      )
    }
  }
  return `# Maintenance interaction

**Purpose:** Show production repair, reinstall and uninstall navigation and recovery.
**Status:** Maintained generated diagram.
**Authority:** Implementation and controlled validation evidence for #244; accepted installation contracts and lifecycle owners retain authority.
**Expected use:** Inspect per-agent consent and observed recovery results; use \`npm run interaction:diagrams:check\` for non-writing freshness.
**Lifecycle:** Regenerate with \`npm run interaction:diagrams:write\` when the reducer, interpreter or named scenarios change; review when accepted maintenance behavior changes.

Thirteen bounded replays run the production interpreter with scripted input and controlled owners. Independent assertions check operation selection, owner digest forwarding, consent, mutation and activation counts, input consumption and durable outcomes. They perform no real profile or credential writes and do not validate physical terminal or installed-platform behavior. Repair resumes the inspected operation; uninstall does not activate a package. Reinstall without registrations retains its existing active-package recovery. Escape at approval returns to Review; Exit and EOF end navigation. A failed activation cannot erase an observed mutation. Version-one installation JSON remains a direct automation exception.

\`\`\`mermaid
flowchart TD
${[...edges].join("\n")}
\`\`\`

## Replay correlation

Labels omit paths, credentials and full owner previews. Revisions and command identities correlate session events; owner digests authorize mutations. The graph contains accepted state changes. Focused workflow tests separately exercise stale/foreign consent rejection and preservation of earlier agents when later navigation exits.

| Replay | Input revision | Event | Command identity | Output revision |
| --- | --- | --- | --- | --- |
${rows.join("\n")}
`
})
