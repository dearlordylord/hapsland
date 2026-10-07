import { Effect } from "effect"
import { it, expect } from "@effect/vitest"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import { runRuleConversation } from "@hapsland/administration/rules/conversation"
import { scriptedInteraction } from "@hapsland/build-tooling/test-support/scripted-interaction"

it.effect("scope selection and Back grant no write; only the fresh owner digest is applied", () =>
  Effect.gen(function* () {
    const script = scriptedInteraction([
      { kind: "choose", index: 0 },
      { kind: "back" },
      { kind: "choose", index: 1 },
      { kind: "choose", index: 0 },
      { kind: "confirm", line: " Y " }
    ])
    const applied: string[] = []
    const outcome = yield* runRuleConversation("enable", {
      preview: (scope) =>
        Effect.succeed({
          action: "enable",
          scope,
          digest: scope,
          configuration: "/safe/config",
          rule: "team",
          enabled: true
        }),
      apply: (plan) =>
        Effect.sync(() => {
          applied.push(plan.digest)
          return { kind: "applied" as const, result: "completed" }
        })
    }).pipe(Effect.provideService(InteractionService, script.interaction))
    expect(applied).toEqual(["personal"])
    expect(outcome.model.outcome).toBe("applied")
    expect(script.remaining()).toBe(0)
  })
)

it.effect("a stale owner proposal needs a fresh preview and fresh approval", () =>
  Effect.gen(function* () {
    const script = scriptedInteraction([
      { kind: "choose", index: 0 },
      { kind: "confirm", line: "y" },
      { kind: "choose", index: 0 },
      { kind: "confirm", line: "no" }
    ])
    let previews = 0
    const attempts: string[] = []
    const outcome = yield* runRuleConversation(
      "disable",
      {
        preview: (scope) =>
          Effect.sync(() => ({
            action: "disable" as const,
            scope,
            digest: `plan-${++previews}`,
            configuration: "/safe/config",
            rule: "team",
            enabled: false
          })),
        apply: (plan) =>
          Effect.sync(() => {
            attempts.push(plan.digest)
            return { kind: "stale" as const }
          })
      },
      { scope: "project" }
    ).pipe(Effect.provideService(InteractionService, script.interaction))
    expect(previews).toBe(2)
    expect(attempts).toEqual(["plan-1"])
    expect(outcome.model.outcome).toBe("declined")
    expect(outcome.result).toBeUndefined()
    expect(script.remaining()).toBe(0)
  })
)

it.effect.each(["", "yes", "n", "y extra"])("approval %j grants no write", (line) =>
  Effect.gen(function* () {
    const script = scriptedInteraction([
      { kind: "choose", index: 0 },
      { kind: "confirm", line }
    ])
    let writes = 0
    const outcome = yield* runRuleConversation(
      "enable",
      {
        preview: (scope) =>
          Effect.succeed({
            action: "enable",
            scope,
            digest: "current",
            configuration: "/safe/config",
            rule: "team",
            enabled: true
          }),
        apply: () =>
          Effect.sync(() => {
            writes++
            return { kind: "applied" as const, result: "completed" }
          })
      },
      { scope: "project" }
    ).pipe(Effect.provideService(InteractionService, script.interaction))
    expect(writes).toBe(0)
    expect(outcome.model.outcome).toBe("declined")
  })
)

it.effect("stale answers, foreign digests and duplicate completions cannot advance a replayed production state", () =>
  Effect.gen(function* () {
    const { reduceRules } = yield* Effect.promise(() => import("@hapsland/administration/rules/interaction-model"))
    const script = scriptedInteraction([
      { kind: "choose", index: 0 },
      { kind: "choose", index: 0 },
      { kind: "confirm", line: "y" }
    ])
    const transitions: import("@hapsland/administration/rules/conversation").RulesTransition[] = []
    yield* runRuleConversation(
      "enable",
      {
        preview: (scope) =>
          Effect.succeed({
            action: "enable",
            scope,
            digest: "current",
            configuration: "/safe/config",
            rule: "team",
            enabled: true
          }),
        apply: () => Effect.succeed({ kind: "applied" as const, result: "completed" })
      },
      {
        observe: (transition) =>
          Effect.sync(() => {
            transitions.push(transition)
          })
      }
    ).pipe(Effect.provideService(InteractionService, script.interaction))
    const approval = transitions.find((t) => t.before.phase === "Approval")!
    expect(reduceRules(approval.before, { ...approval.event, revision: approval.before.revision - 1 })).toBe(
      approval.before
    )
    expect(
      reduceRules(approval.before, {
        revision: approval.before.revision,
        action: { kind: "approve", yes: true, digest: "foreign" }
      })
    ).toBe(approval.before)
    const preview = transitions.find((t) => t.event.action.kind === "previewed")!
    if (preview.event.action.kind !== "previewed") throw new Error("Missing preview completion")
    expect(
      reduceRules(preview.before, {
        revision: preview.before.revision,
        action: { ...preview.event.action, commandId: -1 }
      })
    ).toBe(preview.before)
    const completion = transitions.find((t) => t.event.action.kind === "observed")!
    expect(reduceRules(completion.after, completion.event)).toBe(completion.after)
  })
)

it.effect("an owner failure is reported as a failure, with safe last-observed state rather than cancellation", () =>
  Effect.gen(function* () {
    const script = scriptedInteraction([{ kind: "choose", index: 0 }])
    const failure = new Error("owner failed")
    const result = yield* runRuleConversation("enable", {
      preview: () => Effect.fail(failure),
      apply: () => Effect.die(new Error("Apply must not run without a preview"))
    }).pipe(Effect.provideService(InteractionService, script.interaction), Effect.result)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure).toBe(failure)
    expect(script.transcript.join("\n")).toContain("Last observed phase: Previewing")
    expect(script.transcript.join("\n")).not.toContain("Rules: cancelled")
  })
)
