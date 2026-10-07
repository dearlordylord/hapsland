// Prototype: one synthetic credential authority; no stores, environment lookup or HTTP.
import { Effect, Redacted, Terminal } from "effect"
export type CredentialSource = "saved" | "file" | "environment" | "none"
export type CredentialSnapshot = { source: CredentialSource; available: boolean; generation: number; writable: boolean }
export type SaveOutcome = "stored" | "failed" | "partial"
export type VerificationOutcome = "accepted" | "rejected" | "forbidden" | "rate-limited" | "unconfirmed" | "stale"
export type CredentialOwner = {
  resolve: () => Effect.Effect<CredentialSnapshot>
  nativeWritable: () => Effect.Effect<boolean>
  save: (key: Redacted.Redacted<string>) => Effect.Effect<{ outcome: SaveOutcome; credential: CredentialSnapshot }>
  refresh: () => Effect.Effect<CredentialSnapshot>
  verify: (credential: CredentialSnapshot) => Effect.Effect<VerificationOutcome>
}
export function fakeCredentialOwner(
  options: {
    source?: CredentialSource
    writable?: boolean
    save?: SaveOutcome
    checks?: Exclude<VerificationOutcome, "stale">[]
    stale?: boolean
  } = {}
) {
  let source = options.source ?? "saved",
    generation = 0,
    saves = 0,
    checks = 0,
    captures = 0,
    changed = false
  let available = source !== "none"
  const snapshot = (): CredentialSnapshot => ({ source, generation, available, writable: options.writable ?? true })
  const owner: CredentialOwner = {
    resolve: () => Effect.sync(snapshot),
    nativeWritable: () => Effect.succeed(options.writable ?? true),
    save: (key) =>
      Effect.sync(() => {
        captures++
        const outcome = Redacted.value(key).trim().length ? (options.save ?? "stored") : "failed"
        if (outcome !== "failed") {
          saves++
          generation++
          // Native save cannot outrank an environment/file-selected credential.
          if (source === "none" || source === "saved") {
            source = "saved"
            available = outcome === "stored"
          }
        }
        return { outcome, credential: snapshot() }
      }),
    refresh: () =>
      Effect.sync(() => {
        generation++
        return snapshot()
      }),
    verify: (approved) =>
      Effect.sync((): VerificationOutcome => {
        if (options.stale && !changed) {
          generation++
          changed = true
        }
        if (JSON.stringify(approved) !== JSON.stringify(snapshot())) return "stale"
        const result = options.checks?.[checks] ?? "accepted"
        checks++
        return result
      })
  }
  return { ...owner, observed: () => ({ saves, checks, captures, available, source, generation }) }
}
// Capture stays inside this scoped interpreter. No key is returned or cached.
export const captureAndSave = (
  owner: CredentialOwner,
  read: () => Effect.Effect<Redacted.Redacted<string>, Terminal.QuitError>,
  captured: Effect.Effect<void>
) =>
  Effect.acquireUseRelease(
    Effect.interruptible(read()),
    (key) => captured.pipe(Effect.andThen(owner.save(key))),
    (key) =>
      Effect.sync(() => {
        Redacted.wipeUnsafe(key)
      })
  )
