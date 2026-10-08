import * as Effect from "effect/Effect"
import type { CaptureHooks } from "./capture.ts"
import type { NativeEditMetadata, DirectAdvicee } from "./observation.ts"
import type { DirectFilePolicy } from "./selection.ts"

export type DirectCaptureOptions = {
  readonly observeNative?: (metadata: NativeEditMetadata) => void

  readonly userConfigPath?: string
  readonly captureHooks?: CaptureHooks
  readonly filePolicy?: DirectFilePolicy
  readonly capturePolicy?: (
    root: string,
    advicee: DirectAdvicee,
    path: string
  ) => Effect.Effect<DirectFilePolicy | undefined>
}

/** Resolve edit-owned policy before either native adapter reads source. */
export const captureOptionsForTarget = Effect.fn("DirectEvent.captureOptionsForTarget")(function* (
  options: DirectCaptureOptions,
  root: string,
  advicee: DirectAdvicee,
  path: string
) {
  if (options.capturePolicy === undefined) return options
  const filePolicy = yield* options.capturePolicy(root, advicee, path)
  return filePolicy === undefined ? undefined : { ...options, filePolicy }
})
