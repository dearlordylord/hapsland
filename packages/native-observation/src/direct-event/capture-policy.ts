import * as Effect from "effect/Effect"
import { captureStable, type CaptureHooks } from "./capture.ts"
import type { NativeEditMetadata, DirectAdvicee } from "./observation.ts"
import { resolvedDirectFilePolicy, type DirectFilePolicy } from "./selection.ts"
import { loadConfiguration } from "@hapsland/runtime-inputs/configuration/load"

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

export const captureFilePolicy = Effect.fn("DirectEvent.captureFilePolicy")(function* (
  root: string,
  selected: DirectCaptureOptions | undefined,
  userConfigPath: string | undefined
) {
  if (selected === undefined) return undefined
  if (selected.filePolicy !== undefined && selected.filePolicy !== null) return selected.filePolicy
  const configuration = yield* loadConfiguration(root, userConfigPath === undefined ? {} : { userConfigPath })
  return resolvedDirectFilePolicy(configuration.policy)
})
export const captureNativeTarget = Effect.fn("DirectEvent.captureNativeTarget")(function* (
  metadata: NativeEditMetadata,
  relativePath: string,
  absolutePath: string,
  selected: DirectCaptureOptions,
  options: DirectCaptureOptions
) {
  const captured = yield* captureStable(
    metadata.root,
    { relativePath, absolutePath },
    selected.captureHooks,
    metadata.rootIdentity
  )
  if (captured.status === "unavailable") {
    options.observeNative?.({ ...metadata, diagnostic: captured.diagnostic })
    return undefined
  }
  return captured.capture
})
