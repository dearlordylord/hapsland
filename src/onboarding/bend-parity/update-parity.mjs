import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { reduceUpdate, updateCommand, updateProposals } from "./update-reference.ts"
const phases = [
  "Discovering",
  "Targeting",
  "Previewing",
  "Review",
  "Approval",
  "Applying",
  "Activating",
  "Done",
  "Cancelled"
]
const digest = "a".repeat(64)
const commands = {
  UpdateDiscoverCommand: "discover",
  UpdateTargetCommand: "target",
  UpdatePreviewCommand: "preview",
  UpdateApplyCommand: "apply",
  UpdateActivateCommand: "activate"
}
export const nativeCases = []
const integrated = process.argv[2]
  ? undefined
  : await import("../../../packages/administration/dist/onboarding/update-model.js")
const directory = mkdtempSync(join(tmpdir(), "hapsland-update-"))
try {
  const output = join(directory, "core.mjs")
  execFileSync("bend", [process.argv[2] ?? "packages/agent-flow-bend/update-policy/core.bend", "-o", output], {
    timeout: 5000,
    stdio: "pipe"
  })
  const { default: core } = await import(pathToFileURL(output))
  const sets = [
    [],
    [{ host: "claude" }],
    ...[undefined, "", digest, "malformed"].map((value) => [{ host: "codex", digest: value }])
  ]
  for (const nextDigest of [undefined, "", digest])
    for (const nextOutcome of [undefined, "updated", "failed"])
      sets.push([
        { host: "claude", digest },
        { host: "codex", digest: nextDigest, outcome: nextOutcome },
        { host: "pi", digest, outcome: "partial" }
      ])
  let cases = 0,
    commandCases = 0
  for (const phase of phases)
    for (const agents of sets)
      for (const cursor of [-1, 0, 1, 2, 3])
        for (const activationReturn of [undefined, "Previewing", "Applying"])
          for (let bits = 0; bits < 16; bits++) {
            const model = { phase, revision: 7, agents, discoveryFailures: ["pi"], cursor, activationReturn }
            const host = bits & 1 ? (agents[cursor]?.host ?? "pi") : "codex"
            const commandId = bits & 2 ? 7 : 6,
              revision = bits & 4 ? 7 : 6,
              yes = Boolean(bits & 8)
            const agent = agents[cursor]
            const command = core.command({ $: "Update" + phase }, agent !== undefined, Boolean(agent?.digest))
            const kind = commands[command.$]
            if (["preview", "apply", "activate"].includes(kind))
              assert.ok(agent, "Bend command requires a current native agent")
            const actualCommand =
              kind === undefined
                ? undefined
                : {
                    kind,
                    id: 7,
                    ...(["preview", "apply", "activate"].includes(kind) ? { host: agent.host } : {}),
                    ...(kind === "apply" ? { digest: agent.digest } : {})
                  }
            assert.deepEqual(actualCommand, updateCommand(model))
            if (integrated) assert.deepEqual(integrated.updateCommand(model), updateCommand(model))
            commandCases++
            const proposals = updateProposals(model)
            const events = [
              ...[[], ["claude"], ["claude", "codex"], ["claude", "claude"]].map((hosts) => ({
                kind: "discovered",
                commandId,
                hosts,
                failures: ["pi", "pi"]
              })),
              { kind: "targeted", commandId },
              ...["proposal", "current", "failed", "busy", "indeterminate"].flatMap((kind) =>
                kind === "proposal"
                  ? [digest, "invalid", ""].map((digest) => ({
                      kind: "previewed",
                      commandId,
                      host,
                      result: { kind, digest }
                    }))
                  : [{ kind: "previewed", commandId, host, result: { kind } }]
              ),
              ...["continue", "back", "exit"].map((kind) => ({ kind })),
              ...[proposals, [...proposals].reverse(), [], [{ host: "pi", digest }]].map((proposals) => ({
                kind: "approve",
                yes,
                proposals
              })),
              ...["updated", "already current", "partial", "busy", "indeterminate", "failed"].map((outcome) => ({
                kind: "observed",
                commandId,
                host,
                outcome
              })),
              ...["complete", "failed"].map((result) => ({ kind: "activated", commandId, host, result }))
            ]
            for (const action of events) {
              const actionName =
                action.kind === "previewed"
                  ? {
                      proposal: "ProposalPreviewed",
                      current: "CurrentPreviewed",
                      failed: "FailedPreviewed",
                      busy: "BusyPreviewed",
                      indeterminate: "IndeterminatePreviewed"
                    }[action.result.kind]
                  : action.kind === "observed"
                    ? {
                        updated: "UpdatedObserved",
                        "already current": "CurrentObserved",
                        partial: "PartialObserved",
                        busy: "BusyObserved",
                        indeterminate: "IndeterminateObserved",
                        failed: "FailedObserved"
                      }[action.outcome]
                    : action.kind[0].toUpperCase() + action.kind.slice(1)
              const patchAgent = (patch) => agents.map((a, index) => (index === cursor ? { ...a, ...patch } : a))
              const nextAgents =
                action.kind === "previewed"
                  ? patchAgent(
                      action.result.kind === "proposal"
                        ? { digest: action.result.digest }
                        : { outcome: action.result.kind }
                    )
                  : action.kind === "observed"
                    ? patchAgent({ outcome: action.outcome })
                    : action.kind === "activated"
                      ? patchAgent({ activation: action.result })
                      : agents
              const next = nextAgents.findIndex(
                (a, index) => index > cursor && a.digest !== undefined && a.outcome === undefined
              )
              const same =
                action.kind === "approve" &&
                proposals.length === action.proposals.length &&
                proposals.every(
                  (p, index) => p.host === action.proposals[index]?.host && p.digest === action.proposals[index]?.digest
                )
              const current = revision === 7 && (!("commandId" in action) || action.commandId === 7)
              const unique = action.kind === "discovered" && new Set(action.hosts).size === action.hosts.length
              const nonempty = action.kind === "discovered" && action.hosts.length > 0
              const matched = !("host" in action) || action.host === agent?.host
              const valid =
                action.kind === "previewed" &&
                action.result.kind === "proposal" &&
                /^[a-f0-9]{64}$/.test(action.result.digest)
              const plan = core.step(
                { $: "Update" + phase },
                { $: "Update" + actionName },
                current,
                unique,
                nonempty,
                matched,
                valid,
                cursor + 1 < nextAgents.length,
                nextAgents.some((a) => a.digest),
                next >= 0,
                same,
                yes,
                activationReturn === "Previewing"
              )
              let actual = model
              if (plan.$ !== "UpdateHold") {
                assert.equal(plan.$, "UpdateAdvance")
                const skip = () =>
                  agents.map((a) => (a.digest && a.outcome === undefined ? { ...a, outcome: "skipped" } : a))
                const patches = {
                  UpdateNoPatch: {},
                  UpdateDiscoveredPatch: {
                    agents: action.kind === "discovered" ? action.hosts.map((host) => ({ host })) : [],
                    discoveryFailures: action.kind === "discovered" ? [...new Set(action.failures)] : []
                  },
                  UpdatePreviewProposalPatch: { agents: nextAgents, cursor: cursor + 1 },
                  UpdatePreviewOutcomePatch: { agents: nextAgents, cursor: cursor + 1 },
                  UpdateCurrentPreviewPatch: {
                    agents: patchAgent({ outcome: "already current" }),
                    activationReturn: "Previewing"
                  },
                  UpdateSkippedPatch: { agents: skip() },
                  UpdateBeginApplyPatch: { cursor: agents.findIndex((a) => a.digest !== undefined) },
                  UpdateObservedApplyPatch: { agents: nextAgents, cursor: next },
                  UpdateObservedActivatePatch: { agents: nextAgents, activationReturn: "Applying" },
                  UpdateActivatedPreviewPatch: { agents: nextAgents, cursor: cursor + 1 },
                  UpdateActivatedApplyPatch: { agents: nextAgents, cursor: next }
                }
                assert.ok(Object.hasOwn(patches, plan.patch.$))
                actual = { ...model, ...patches[plan.patch.$], phase: plan.phase.$.slice(6), revision: 8 }
              }
              const event = { revision, action }
              const expected = reduceUpdate(model, event)
              if (integrated) {
                const production = integrated.reduceUpdate(model, event)
                assert.deepEqual(production, expected)
                if (expected === model) assert.equal(production, model)
                if (cursor >= 0 && cursor < Math.max(agents.length, 1) && revision === 7)
                  nativeCases.push([model, event])
              }
              assert.deepEqual(actual, expected, `phase=${phase} cursor=${cursor} bits=${bits} action=${actionName}`)
              if (expected === model) assert.equal(actual, model)
              cases++
            }
          }
  const record = {
    at: new Date().toISOString(),
    cases,
    commandCases,
    result: "pass",
    scope:
      "frozen native update reducer comparison against compiled Bend plans and integrated production host; typed action/result domain with cursor, empty/invalid digest, array eligibility, correlation and grouped-approval variations; no universal or IO claim"
  }
  if (!process.argv[2])
    writeFileSync("evidence/bend-strangler/update-parity.json", JSON.stringify(record, null, 2) + "\n")
  console.log(JSON.stringify(record))
} finally {
  rmSync(directory, { recursive: true, force: true })
}
