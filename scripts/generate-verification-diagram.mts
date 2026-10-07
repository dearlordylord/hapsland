import assert from "node:assert/strict"
import { Effect, Redacted } from "effect"
import { makeInitialCredentialState } from "@hapsland/runtime-inputs/credentials/state"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import {
  runVerificationConversation,
  VerificationOwnerService,
  type VerificationTransition
} from "@hapsland/administration/onboarding/verification-conversation"
import type { KeyVerification } from "@hapsland/administration/onboarding/verification-model"
import { scriptedInteraction, type ScriptStep } from "./test-support/scripted-interaction.ts"

export const generateVerificationDiagram = Effect.gen(function* () {
  const scenarios = [
    "accepted",
    "declined",
    "missing",
    "other-provider",
    "environment-rejected",
    "file-corrected",
    "replacement",
    "stored-declined",
    "stored-back-exit",
    "hidden-eof",
    "busy",
    "indeterminate",
    "three-check-limit",
    "rate-limited",
    "unconfirmed"
  ] as const
  const edges = new Set<string>()
  const rows: string[] = []
  for (const name of scenarios) {
    const replacing = [
      "replacement",
      "stored-declined",
      "stored-back-exit",
      "hidden-eof",
      "busy",
      "indeterminate"
    ].includes(name)
    const steps: ScriptStep[] =
      name === "missing" || name === "other-provider"
        ? []
        : [{ kind: "confirm", line: name === "declined" ? "n" : "y" }]
    if (replacing) {
      steps.push({ kind: "choose", index: 0 }, { kind: "confirm", line: "y" })
      if (name === "hidden-eof") steps.push({ kind: "eof" })
      else {
        steps.push({ kind: "hidden", value: "private-replacement" })
        if (name === "stored-back-exit") steps.push({ kind: "back" }, { kind: "exit" })
        else if (name !== "busy" && name !== "indeterminate")
          steps.push({ kind: "confirm", line: name === "stored-declined" ? "n" : "y" })
      }
    }
    if (name === "file-corrected") steps.push({ kind: "choose", index: 0 }, { kind: "confirm", line: "y" })
    if (name === "three-check-limit")
      for (let i = 0; i < 2; i++) steps.push({ kind: "choose", index: 1 }, { kind: "confirm", line: "y" })
    const script = scriptedInteraction(steps)
    const transitions: VerificationTransition[] = []
    let requests = 0
    let saves = 0
    const source =
      name === "environment-rejected" || name === "file-corrected" ? ("environment" as const) : ("saved" as const)
    const model = yield* runVerificationConversation({
      observe: (transition) =>
        Effect.sync(() => {
          transitions.push(transition)
        })
    }).pipe(
      Effect.provideService(InteractionService, script.interaction),
      Effect.provideService(VerificationOwnerService, {
        read: Effect.succeed({
          provider: name === "other-provider" ? "cloudflare" : "jev",
          guidance: [],
          credential:
            name === "missing"
              ? { status: "missing", source, generation: 0 }
              : {
                  status: "present",
                  source,
                  generation: 0,
                  value: "private-selected",
                  ...(name === "file-corrected" ? { file: "/controlled/.env" } : {})
                }
        }),
        save: (value) =>
          Effect.sync(() => {
            assert.equal(value, "private-replacement")
            saves++
            return {
              status: name === "busy" || name === "indeterminate" ? name : "stored",
              state: { ...makeInitialCredentialState(), generation: 1 },
              stateLock: "acquired"
            }
          }),
        verify: (key) =>
          Effect.sync((): KeyVerification => {
            assert.equal(Redacted.value(key), "private-selected")
            requests++
            assert.equal(
              transitions.filter((t) => t.event.action.kind === "approve" && t.event.action.yes).length,
              requests,
              "Each request requires a distinct current approval"
            )
            if (name === "rate-limited" || name === "unconfirmed") return name
            if (name === "accepted" || ((name === "replacement" || name === "file-corrected") && requests === 2))
              return "accepted"
            return "rejected"
          })
      }),
      Effect.map((outcome) => outcome.model)
    )
    const expectedRequests = ["missing", "other-provider", "declined"].includes(name)
      ? 0
      : name === "three-check-limit"
        ? 3
        : name === "replacement" || name === "file-corrected"
          ? 2
          : 1
    assert.equal(requests, expectedRequests)
    assert.equal(saves, replacing && name !== "hidden-eof" ? 1 : 0)
    assert.equal(model.observations.length, requests)
    assert.equal(model.attempts, requests)
    assert.equal(script.remaining(), 0)
    assert(!JSON.stringify({ model, transitions, output: script.transcript }).includes("private-"))
    if (name === "stored-declined" || name === "stored-back-exit") assert.equal(model.storage?.status, "stored")
    if (name === "busy" || name === "indeterminate") assert.equal(model.storage?.status, name)
    for (const { before, event, after } of transitions) {
      const action = event.action
      const detail =
        action.kind === "loaded"
          ? `${action.source} ${action.eligibility}`
          : action.kind === "observed"
            ? action.result
            : action.kind === "stored"
              ? action.storage.status
              : action.kind === "approve" || action.kind === "approveReplacement"
                ? action.yes
                  ? "y"
                  : "non-y"
                : ""
      const label = `${action.kind} ${detail}`.trim()
      edges.add(`  ${before.phase} -->|"${label}"| ${after.phase}`)
      rows.push(
        `| ${name} | ${before.revision} | ${label} | ${"commandId" in action ? action.commandId : "—"} | ${"keyRevision" in action ? action.keyRevision : "—"} | ${after.revision} |`
      )
    }
  }
  return `# Credential verification and replacement interaction

**Purpose:** Show production paid-check consent, source-specific correction and replacement outcomes.
**Status:** Maintained generated diagram.
**Authority:** Implementation and controlled validation evidence for #244; accepted credential and installation contracts retain authority.
**Expected use:** Inspect bounded request consent and recovery; run \`npm run interaction:diagrams:check\` for non-writing freshness.
**Lifecycle:** Regenerate with \`npm run interaction:diagrams:write\` when the reducer, interpreter or named scenarios change; review when accepted verification or credential behavior changes.

Fifteen bounded replays run the actual production interpreter with scripted input and controlled owners. Independent assertions check a fresh approval per request, a maximum of three checks, source-specific correction, save counts, retained results, exact input consumption and absence of keys from models, transitions and output. These replays perform no paid requests or credential-store access. Separate provider tests establish the built-in greeting, sanitized outcomes and 15-second timeout; separate storage and terminal tests own those physical boundaries.

Selecting replacement does not save a key. Saving requires its own confirmation and built-in hidden capture; every subsequent paid check needs fresh consent after normal precedence is resolved again. File correction only rereads the file; environment rejection gives launch-environment guidance. Busy and indeterminate saves remain visible and cause no subsequent check. Hidden cancellation ends the conversation. A successful key check is not evidence of native agent trust or a real code review.

\`\`\`mermaid
flowchart TD
${[...edges].join("\n")}
\`\`\`

## Replay correlation

Labels omit credentials, file paths and raw provider payloads. Session revision and credential-selection revision reject stale answers/completions; native credential locks and journals remain authoritative. The graph records accepted transitions. Focused tests separately assert ignored stale events and preservation of observations during Back/Exit.

| Replay | Input revision | Event | Command identity | Credential revision | Output revision |
| --- | --- | --- | --- | --- | --- |
${rows.join("\n")}
`
})
