import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Cause from "effect/Cause"
import * as Result from "effect/Result"

// Mechanical suspension of the single native custody workflow. Interpreters
// determine how to wait; the caller's flow retains lifecycle/progression.
export type NativeSuspension =
  | { readonly kind: "await"; readonly value: unknown; readonly interruptible: boolean }
  | { readonly kind: "effect"; readonly effect: Effect.Effect<unknown>; readonly interruptible?: boolean }
export type NativeFlow<Value> = Generator<NativeSuspension, Value, unknown>
export const awaitNative = (value: unknown, interruptible = false): NativeSuspension => ({
  kind: "await",
  value,
  interruptible
})
export const effectNative = (effect: Effect.Effect<unknown>, interruptible = true): NativeSuspension => ({
  kind: "effect",
  effect,
  interruptible
})
export type NativeWork<Value> = Promise<Value> | Effect.Effect<Value>
export function* awaitNativeWork<Value>(work: NativeWork<Value>): NativeFlow<Value> {
  return (yield Effect.isEffect(work) ? effectNative(work) : awaitNative(work)) as Value
}

const receiptTag = Symbol("Native execution Effect Cause")
type CauseReceipt = { readonly [receiptTag]: Cause.Cause<never> }
const receipt = (cause: Cause.Cause<never>): CauseReceipt => ({ [receiptTag]: cause })
const isReceipt = (value: unknown): value is CauseReceipt =>
  typeof value === "object" && value !== null && receiptTag in value && Cause.isCause(value[receiptTag])
const ownedFailures = new WeakSet<AggregateError>()
const ownedFailureCauses = new WeakMap<AggregateError, Cause.Cause<unknown>>()
export const nativeFailureAggregate = (
  errors: Iterable<unknown>,
  message: string,
  options?: ErrorOptions,
  cause?: Cause.Cause<unknown>
): AggregateError => {
  const failure = new AggregateError(errors, message, options)
  ownedFailures.add(failure)
  if (cause !== undefined) ownedFailureCauses.set(failure, cause)
  return failure
}
const nativeCause = (error: unknown): Cause.Cause<never> => {
  if (isReceipt(error)) return error[receiptTag]
  // Only our custody workflow's aggregates expose failure occurrences. An
  // arbitrary user's AggregateError (including its getters) stays opaque.
  if (error instanceof AggregateError && ownedFailures.has(error)) {
    // NativeFlow erases the service error channel; this private receipt preserves
    // its runtime reasons without exposing them as provider error-token values.
    const held = ownedFailureCauses.get(error)
    return held === undefined
      ? Cause.fromReasons(error.errors.flatMap((value) => nativeCause(value).reasons))
      : (held as Cause.Cause<never>)
  }
  return Cause.die(error)
}

export async function runNativePromise<Value>(flow: NativeFlow<Value>): Promise<Value> {
  let failed = false,
    held: unknown
  for (;;) {
    const step = failed ? flow.throw(held) : flow.next(held)
    if (step.done) return step.value
    try {
      if (step.value.kind === "effect") throw new TypeError("Effect service requires its caller-fiber interpreter")
      held = await step.value.value
      failed = false
    } catch (error) {
      held = error
      failed = true
    }
  }
}

const waitNative = (value: unknown): Effect.Effect<unknown> =>
  Effect.callback((resume) => {
    Promise.resolve(value).then(
      (held) => resume(Effect.succeed(held)),
      (error) => resume(Effect.die(error))
    )
  })
const rawDefect = (cause: Cause.Cause<never>): unknown => {
  const defect = Cause.findDefect(cause)
  return Result.isSuccess(defect) ? defect.success : receipt(cause)
}

export const runNativeEffect = <Value>(
  flow: NativeFlow<Value>,
  onInterrupt: () => void,
  onSuspension?: () => void
): Effect.Effect<Value> =>
  Effect.uninterruptibleMask((restore) => {
    let interruption: Cause.Cause<never> | undefined
    const resume = (failed: boolean, held: unknown): Effect.Effect<Value> =>
      Effect.suspend(() => {
        let step: IteratorResult<NativeSuspension, Value>
        try {
          step = failed ? flow.throw(held) : flow.next(held)
        } catch (error) {
          const cause = nativeCause(error)
          return Effect.failCause(
            interruption !== undefined && !Cause.hasInterrupts(cause) ? Cause.combine(interruption, cause) : cause
          )
        }
        if (step.done) return interruption === undefined ? Effect.succeed(step.value) : Effect.failCause(interruption)
        onSuspension?.()
        const suspension = step.value
        const waiting = suspension.kind === "effect" ? suspension.effect : waitNative(suspension.value)
        const interruptible =
          suspension.kind === "effect" ? suspension.interruptible !== false : suspension.interruptible
        return Effect.exit(interruptible ? restore(waiting) : waiting).pipe(
          Effect.flatMap((exit) => {
            if (Exit.isSuccess(exit)) return resume(false, exit.value)
            if (Cause.hasInterrupts(exit.cause)) {
              interruption ??= exit.cause
              // Notify the owner before waiting for an actual pending provider to
              // settle. Never abandon its generator/lease or free its raw handles.
              try {
                onInterrupt()
              } catch (error) {
                interruption = Cause.combine(interruption, Cause.die(error))
              }
              const interruptedCause = interruption
              if (suspension.kind === "await")
                return Effect.exit(waitNative(suspension.value)).pipe(
                  Effect.flatMap(() => resume(true, receipt(interruptedCause)))
                )
            }
            return resume(
              true,
              suspension.kind === "effect" || Cause.hasInterrupts(exit.cause)
                ? receipt(exit.cause)
                : rawDefect(exit.cause)
            )
          })
        )
      })
    return resume(false, undefined)
  })
