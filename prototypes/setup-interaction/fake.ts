import { Effect, Redacted } from "effect"
import { command, type Model } from "./domain.ts"
export const calls: string[] = []
// Never touches env, files, native stores or HTTP. A synthetic key lives only here.
const executeFake = (m: Model, capture?: () => Effect.Effect<Redacted.Redacted<string>, unknown>) =>
  Effect.gen(function* () {
    const c = command(m)
    if (!c) return "none"
    calls.push(`${c.type}:${c.target}:${c.digest}`)
    if (c.type === "apply") return c.target === "Codex" ? "partial: restart required" : "complete"
    if (c.type === "check") return "synthetic success (zero requests)"
    const value = capture ? yield* capture() : Redacted.make("SYNTHETIC_ONLY_DO_NOT_LOG")
    const nonempty = Redacted.value(value).length > 0
    Redacted.wipeUnsafe(value)
    return nonempty ? "saved" : "failed"
  })

// A new executor belongs to one session. Replays cannot repeat side effects.
export function createFakeExecutor() {
  const issued = new Map<number, { fingerprint: string; effect: Effect.Effect<string, unknown> }>()
  return (model: Model, capture?: () => Effect.Effect<Redacted.Redacted<string>, unknown>) =>
    Effect.suspend(() => {
      const operation = command(model)
      if (!operation) return Effect.succeed("none")
      const fingerprint = JSON.stringify(operation)
      const previous = issued.get(operation.id)
      if (previous) return previous.fingerprint === fingerprint ? previous.effect : Effect.succeed("failed")
      const effect = Effect.runSync(Effect.cached(executeFake(model, capture)))
      issued.set(operation.id, { fingerprint, effect })
      return effect
    })
}
