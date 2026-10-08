import assert from "node:assert/strict"
import { Effect } from "effect"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import { runSetupSelection } from "@hapsland/administration/onboarding/setup-selection"
import { runPilotSetup, SetupOwnerService } from "@hapsland/administration/onboarding/pilot"
import { runLoginConversation, LoginOwnerService } from "@hapsland/administration/credentials/login-conversation"
import {
  runVerificationConversation,
  VerificationOwnerService,
  type VerificationOwner
} from "@hapsland/administration/onboarding/verification-conversation"
import { makeInitialCredentialState } from "@hapsland/runtime-inputs/credentials/state"
import type { SetupClient } from "@hapsland/administration/onboarding/client-selection"
import type { UiFlowId } from "../packages/administration/src/interaction/flow-registry.ts"
import { userFlowDiagram } from "./interaction-diagram-view.mts"
import { scriptedInteraction, type ScriptStep } from "./test-support/scripted-interaction.ts"
import { complete, preview } from "./test-support/setup-observations.ts"

const configure: ScriptStep[] = [
  { kind: "confirm", line: "y" },
  { kind: "confirm", line: "y" },
  { kind: "choose", index: 0 },
  { kind: "hidden", value: "private-journey-key" },
  { kind: "confirm", line: "y" },
  { kind: "confirm", line: "n" }
]

/** Replay the real selection → setup → login → verification composition. */
export const generateSetupJourneyDiagram = Effect.fn("SetupJourney.diagram")(function* (outcomes: ReadonlySet<string>) {
  const output = new Set<string>()
  const cases: {
    steps: ScriptStep[]
    calls: SetupClient[]
    phase: string
    direct?: SetupClient
    paid?: boolean
    existingCredential?: boolean
  }[] = [
    {
      steps: [{ kind: "chooseMany", ids: ["codex", "claude"] }, ...configure, ...configure],
      calls: ["codex", "claude"],
      phase: "Done"
    },
    {
      steps: [
        { kind: "chooseMany", ids: ["codex", "claude"] },
        { kind: "back" },
        { kind: "chooseMany", ids: ["claude"] },
        ...configure
      ],
      calls: ["codex", "claude"],
      phase: "Done"
    },
    {
      steps: [{ kind: "chooseMany", ids: ["codex"] }, { kind: "back" }, { kind: "exit" }],
      calls: ["codex"],
      phase: "Done"
    },
    {
      steps: [{ kind: "chooseMany", ids: ["codex", "claude"] }, { kind: "exit" }],
      calls: ["codex"],
      phase: "Cancelled"
    },
    {
      steps: [{ kind: "chooseMany", ids: ["codex", "claude"] }, ...configure.slice(0, -1), { kind: "exit" }],
      calls: ["codex"],
      phase: "Cancelled"
    },
    { steps: [{ kind: "exit" }], calls: [], phase: "Done" },
    { steps: [{ kind: "eof" }], calls: [], phase: "Done" },
    { steps: [...configure], calls: ["codex"], phase: "completed", direct: "codex" },
    {
      steps: [
        { kind: "confirm", line: "y" },
        { kind: "confirm", line: "y" },
        { kind: "confirm", line: "n" }
      ],
      calls: ["codex"],
      phase: "completed",
      direct: "codex",
      existingCredential: true
    },
    {
      steps: [...configure.slice(0, -1), { kind: "confirm", line: "y" }],
      calls: ["codex"],
      phase: "completed",
      direct: "codex",
      paid: true
    }
  ]
  for (const scenario of cases) {
    const script = scriptedInteraction(scenario.steps)
    const calls: SetupClient[] = []
    let saves = 0
    let checks = 0
    let cursor = scenario.direct ? "NamedSetup" : "SelectSetup"
    output.add(scenario.direct ? '  NamedSetup["hapsland setup &lt;agent&gt;"]' : '  SelectSetup["hapsland setup"]')
    const record = (flow: UiFlowId, host: SetupClient | undefined, before: string, event: string, after: string) => {
      const prefix = `${flow.replaceAll("-", "_")}_${host ?? "selection"}_`
      const returned =
        cursor !== prefix + before &&
        ((flow === "setup-selection" && event.startsWith("agent ")) ||
          (flow === "setup" && ["Applying", "Verifying"].includes(before)))
      const from = prefix + before + (returned ? "_returned" : "")
      if (cursor !== from) {
        const connection = returned
          ? "Return"
          : cursor === "NamedSetup" || cursor === "SelectSetup"
            ? "Begin"
            : flow === "login" && before === "SelectingDestination" && cursor.endsWith("_Applying")
              ? "No active credential; enter a key"
              : "Continue"
        output.add(`  ${cursor} -->|"${connection}"| ${from}`)
      }
      const view = userFlowDiagram(flow, new Set([`  ${before} -->|"${event}"| ${after}`]))
      for (const line of view.split("\n")) {
        const prefixed = line
          .replace(/^  (\w+)/, (_, node: string) => `  ${node === before ? from : prefix + node}`)
          .replace(/\| (\w+)$/, `| ${prefix}$1`)
        if (returned && before === after && !line.includes("-->")) output.add(line.replace(/^  (\w+)/, `  ${prefix}$1`))
        const contextual = host
          ? prefixed.replace(/\["([^"]+)"\]/, `["${host === "codex" ? "Codex" : "Claude"}: $1"]`)
          : prefixed
        output.add(contextual)
      }
      cursor = prefix + after
    }
    const runAgent = (host: SetupClient) =>
      Effect.gen(function* () {
        calls.push(host)
        let credentialAvailable = scenario.existingCredential === true
        const login = runLoginConversation({
          observe: ({ before, event, after }) =>
            Effect.sync(() =>
              record(
                "login",
                host,
                before.phase,
                event.action.kind === "observed" ? `observed ${event.action.storage.status}` : event.action.kind,
                after.phase
              )
            )
        }).pipe(
          Effect.provideService(LoginOwnerService, {
            prepare: (destination) =>
              Effect.succeed({
                id: "current",
                plan: { destination, target: "/controlled/user/.env", scope: "user", storage: "Local plaintext file" },
                availability: "available",
                reason: undefined,
                activeSource: undefined,
                activeFile: undefined
              }),
            save: (_id, key) =>
              Effect.sync(() => {
                assert.equal(key, "private-journey-key")
                saves++
                credentialAvailable = true
                return {
                  status: "stored" as const,
                  state: makeInitialCredentialState(),
                  stateLock: "acquired" as const
                }
              }),
            discard: () => Effect.void,
            active: () =>
              Effect.sync(() => {
                assert(credentialAvailable)
                return { status: "present" as const, source: "user" as const, generation: 0 }
              })
          }),
          Effect.provideService(InteractionService, script.interaction)
        )
        const verification = runVerificationConversation({
          observe: ({ before, event, after }) =>
            Effect.sync(() => {
              const action = event.action
              const label =
                action.kind === "loaded"
                  ? `loaded ${action.source} ${action.eligibility}`
                  : action.kind === "approve"
                    ? `approve ${action.yes ? "y" : "non-y"}`
                    : action.kind === "observed"
                      ? `observed ${action.result}`
                      : action.kind
              record("verification", host, before.phase, label, after.phase)
            })
        }).pipe(
          Effect.provideService(VerificationOwnerService, {
            read: Effect.sync<Effect.Success<VerificationOwner["read"]>>(() => ({
              provider: "jev",
              guidance: [],
              credential: credentialAvailable
                ? {
                    status: "present",
                    source: "environment",
                    generation: 0,
                    value: "private-journey-key",
                    file: "/controlled/user/.env"
                  }
                : { status: "missing", source: "environment", generation: 0 }
            })),
            verify: () =>
              Effect.sync(() => {
                checks++
                assert(scenario.paid, "A paid check requires current approval")
                return "accepted" as const
              }),
            save: () => Effect.die(new Error("This journey does not replace credentials during verification"))
          }),
          Effect.provideService(InteractionService, script.interaction)
        )
        const result = yield* runPilotSetup(
          { terminal: true, host, fields: { host }, cwd: "/controlled", platform: "linux" },
          {
            observe: ({ before, event, after }) =>
              Effect.sync(() => {
                const action = event.action
                const detail =
                  action.kind === "approveHooks" || action.kind === "approveRules"
                    ? action.yes
                      ? "y"
                      : "non-y"
                    : action.kind === "previewed" || action.kind === "applied"
                      ? action.observation.status
                      : ""
                record("setup", host, before.phase, `${action.kind} ${detail}`.trim(), after.phase)
              })
          }
        ).pipe(
          Effect.provideService(SetupOwnerService, {
            run: (request) =>
              Effect.gen(function* () {
                if (!request.interactive) return { ...preview(), host: { adapter: host } }
                assert.equal(request.installProposalDigest, "hooks-current")
                assert.equal(request.rulesProposalDigest, "rules-current")
                if (request.credential === "saved" && !credentialAvailable) yield* login
                return { ...complete, host: { adapter: host } }
              }),
            activate: Effect.void,
            verifyCredential: verification,
            doctor: Effect.succeed({
              stdout: JSON.stringify({ status: "unknown" }),
              stderr: "",
              succeeded: true,
              timedOut: false,
              exitCode: 0
            })
          })
        )
        return result.kind
      })
    const result = yield* (
      scenario.direct
        ? runAgent(scenario.direct)
        : runSetupSelection(
            [
              { host: "codex", name: "Codex CLI", status: "installed" },
              { host: "claude", name: "Claude Code", status: "not installed" }
            ],
            runAgent,
            ({ before, action, after }) =>
              Effect.sync(() => {
                record(
                  "setup-selection",
                  undefined,
                  before.phase,
                  action.kind === "observed" ? `agent ${action.outcome}` : action.kind,
                  after.phase
                )
              })
          ).pipe(Effect.map((selection) => selection.phase))
    ).pipe(Effect.provideService(InteractionService, script.interaction))
    assert.deepEqual(calls, scenario.calls)
    assert.equal(result, scenario.phase)
    assert.equal(script.remaining(), 0)
    assert.equal(saves, scenario.steps.filter((step) => step.kind === "hidden").length)
    assert.equal(checks, scenario.paid ? 1 : 0)
    assert(![...output].join("\n").includes("private-journey-key"))
  }
  // These outcomes were independently witnessed by the per-agent interpreter
  // replays. Attach them to that agent's nodes in the same command journey.
  const outcomeView = userFlowDiagram("setup", outcomes)
  for (const line of outcomeView.split("\n")) {
    const contextual = line
      .replace(/^  (\w+)/, "  setup_codex_$1")
      .replace(/\| (\w+)$/, "| setup_codex_$1")
      .replace(/\["([^"\n]+)"\]/, '["Codex: $1"]')
    // The caller's verified outcome follows the child dialog's exit, rather
    // than bypassing that dialog with a parallel caller-only shortcut.
    if (line.startsWith("  Verifying[")) continue
    if (line.startsWith("  Verifying -->")) {
      const cancelled = line.endsWith(" Cancelled")
      const child = `verification_codex_${cancelled ? "Cancelled" : "Done"}`
      if (cancelled) output.add(`  ${child}["Codex: End credential verification"]`)
      output.add(contextual.replace("setup_codex_Verifying -->", `${child} -->`))
    } else output.add(contextual)
  }
  return [...output].join("\n")
})
